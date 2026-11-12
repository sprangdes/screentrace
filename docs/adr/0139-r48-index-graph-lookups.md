# ADR 0139：R48 Java 分析以索引取代線性搜尋

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-004 原本建議統一 Java 原始檔的解析快取。R47（[ADR 0138](0138-r47-concurrent-preview-capture.md)）的量測顯示，80 個畫面的合成 Struts 專案（6,960 個元件）中，Java 分析與報表（不含預覽擷取）需要 35 秒，但 JFR 取樣中 JavaParser 只占約 1.4%。實際的熱點是同一份資料被反覆線性搜尋，耗時隨畫面數呈平方成長：

| 位置 | 原本的做法 | 取樣占比 |
|---|---|---|
| `PrototypeModelGenerator.relationshipFrom` | 每個元件掃描全部關聯兩次，找第一筆 `NAVIGATES_TO`／`TRIGGERS` | 約 29% |
| `JspTagFileExpander` | 每個標籤重新掃描整頁，以取得 taglib 宣告 | 約 15% |
| `UrlGraphContribution.enrich` | 每個 behavior 掃描全部關聯，找 trigger 發出的 `TRIGGERS` | 約 13% |
| `StrutsWildcards.wildcardMatch` | 每次查詢都替每個 mapping 編譯一個 regex，包含沒有萬用字元的 mapping | 約 10% |
| `MarkupGraphContribution` | `putEdge`、`ownedBy` 等處掃描全部關聯 | 約 6% |

## 決定

- R48-1：`PrototypeModelGenerator` 先依（關聯類型、起點）建立索引，每組只保留圖中順序的第一筆（`firstRelationshipFrom`），結果與原本的 `findFirst` 相同。
- R48-2：`JspTagFileExpander` 每段文字只掃描一次，再用這次的結果取得 taglib 前綴（`prefixes(List<MarkupTag>)`）。
- R48-3：新增 `RelationshipsByFrom`（parser-jsp，package-private）。它就是原本使用的 `TreeMap<String, Relationship>`，另外維護依起點分組的索引；每組同樣依 ID 排序，所以 `findFirst` 找到的仍然是同一筆。同一個 ID 被替換成不同起點的關聯時，索引也會更新。`MarkupGraphContribution` 與 `UrlGraphContribution` 改用它查詢「從某個節點出發的關聯」。
- R48-4：`StrutsWildcards.wildcardMatch` 遇到不含 `*`、`\` 的 route 時直接比對字串。原本的 regex 會把每個字元都 quote，所以只會匹配 route 本身，兩者的結果相同。
- R48-5：不建立跨模組的 Java 解析快取。它的效益約 1%，卻需要在 core 新增一層抽象。HC-004 到這一輪結束。

## 後果

| 量測（sandbox，4 核心） | R47 後 | R48 後 |
|---|---|---|
| 80 個畫面的合成專案，Java 分析與報表（不含擷取） | 35 秒 | 13.2 秒 |
| 80 個畫面的合成專案，CLI 完整分析 | 91.3 秒 | 78.4 秒 |
| 15 個 fixtures 完整分析合計（3 次中位數） | 38.4 秒 | 40.5 秒（在量測誤差內；Java 部分只占很少時間） |

- 剩下的 Java 時間分散在 JSP 解析（`MarkupTag`、`JspProjectParser`）與各個 enrich 步驟，沒有單一熱點。
- 驗證：
  - 15 個 fixtures 的 277 個產物與修改前逐位元組相同。
  - 80 個畫面合成專案的全部產物（含報表與預覽）與 R47 後逐位元組相同。
  - 新增 3 個測試類別，共 4 個測試：
    - `PrototypeRelationshipIndexTest`：索引與依圖中順序掃描找到同一筆關聯。
    - `RelationshipsByFromTest`：分組保持 ID 順序，同一個 ID 改成不同起點時索引跟著更新。
    - `StrutsLiteralRouteMatchTest`：含 regex 特殊字元的 route 只匹配自己，萬用字元與跳脫的 route 行為不變。
  - 這一輪只改效能、不改行為。前兩個測試在修改前的版本因為類別或方法不存在而無法編譯；`StrutsLiteralRouteMatchTest` 在修改前也會通過，作為兩種寫法等價的回歸測試。
  - Maven 598 個（593 通過、5 略過）。
