# WP4 回報

## 1. 完成工作包與提交

限定 WP4，四個增量依序先寫失敗測試、實作、推送並確認 CI 全綠後才繼續。WP5 未開始。

| 增量 | 提交 | 遠端 CI |
|---|---|---|
| 一：解析器、容錯、診斷 | 8da98aeac6fa4f79aaeb0fda81981368cedc7f2c | [全綠](https://github.com/sprangdes/screentrace/actions/runs/37077608733) |
| 二：來源、DOM、事件 | 20a6b6d4fddff4f797cac00fd42bd257a2a200dd | [全綠](https://github.com/sprangdes/screentrace/actions/runs/37078464909) |
| 三：行為、CLIENT 檢核、第三方表 | 8670f781c2b6bb34c06620ed1f20307c18b9e89d | [全綠](https://github.com/sprangdes/screentrace/actions/runs/37079122785) |
| 四：追蹤、值、Java 圖整合 | d72a2f3c25117d63e83098312dd6e8ecc7f52a94 | [全綠](https://github.com/sprangdes/screentrace/actions/runs/37085587989) |

OQ-003 停止紀錄 027a0f0 的 [CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37077836291)；需求方決定後才繼續。

## 2. 主要檔案

新增 screentrace-js：parser.mjs、bindings.mjs、analyzer.mjs、values.mjs、modules.mjs、cli.mjs、api-table.json、釘選 package／lock、40 項測試與副作用 fixture。

新增 ScriptSources.java、JavaScriptGraphContribution.java；整合 SpringMvcAnalyzer／StrutsProjectAnalyzer。ApiUsage.java 避免 canonical CALL_API 與簡化 CALLS 重複計數；保留既有複合鍵決策。新增來源與兩種 adapter 整合測試，ApiUsageTest 只追加測試。更新啟動腳本、README、CI、架構、路線圖、v1.3 指示、OQ-003、ADR 0007–0010；無刪除檔案。

## 3. 測試與結果

新增 40 個 JS 測試（各增量 4／3／9／24）、15 個 Java 測試（既有 132，合計 147）。

- `npm test --prefix screentrace-js`：40 通過，0 失敗。
- `mvn -q verify`：147 通過，0 failure／error／skip。
- `npm audit --prefix screentrace-js --audit-level=low`：0 vulnerabilities。
- capture 的 capture-static-jsp.security、docs-baseline、safe-files、spring-resource-mappings 四個自動測試檔：14 通過；最後文件改動另重跑 docs-baseline，4 通過。
- `bash -n bin/screentrace`、`git diff --check` 通過。
- 基線中已追蹤的 Java 測試只修改 ApiUsageTest，修改為在原類別尾端追加測試；以基線檔案前綴比對確認原測試完整不變。ScriptSourceTest 與增量二前綴比對相同；既有 Node 測試斷言不變。

失敗測試紀錄：增量一缺 parser；增量二缺 bindings／ScriptSources；增量三缺 analyzer，另有 Bootstrap 與動態 method 反例；增量四跨函式、值與圖整合先失敗。最後六項反例首次 34 通過／6 失敗，包含 module 私有符號外洩、函式重賦值、單次初始化／物件參數、原生名稱遮蔽、scriptlet、XHR 多候選，實作修正後 40 通過。副作用探針從未產生標記檔。

capture 首次廣泛測試曾 13 通過／2 失敗：Chromium 沙箱權限不足，以及手動 report-design 測試缺 URL；先前退出碼被後續 diff 覆蓋的成功紀錄已更正。取得 Chromium 權限後四個自動測試檔 14 通過；不宣稱手動報表測試成功。

遠端每次門檻均包括 Java build／test、Dependency-Check、Node 測試與 npm audit。增量四 [CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37085587989)，兩個 job 及所有必要步驟 success。

## 4. 設計決策

- [ADR 0007](../adr/0007-javascript-parser-and-json-boundary.md)：Acorn 8.18.0／acorn-loose 8.5.2、MIT、JSON、安全與容錯。
- [ADR 0008](../adr/0008-script-context-prefix-and-static-dom.md)：來源、靜態 DOM、OQ-003 context 例外及排除條件。
- [ADR 0009](../adr/0009-javascript-public-api-semantics.md)：第三方公開 API 表、未知呼叫與 CLIENT 規則。
- [ADR 0010](../adr/0010-javascript-static-tracing-and-graph-contribution.md)：有界追蹤、抽象值、模組隔離、回呼與 canonical graph。

## 5. 與指示文件的差異與理由

無。依需求方 OQ-003 決定更新為 v1.3；例外僅定位 script src，不用於 API URL。依最新授權只完成 WP4，停止於 WP5 前。

## 6. 開放問題與風險

OQ-003 已處理，無未處理的 WP4 問題。容錯、未知函式、動態值、深度／循環限制保留 UNRESOLVED 與診斷。多個 script 檔案或 XHR 目標保留 AMBIGUOUS 全候選。

本地相對模組只解析可證明的來源檔案；未知／套件匯入不執行。前端請求描述節點 backendStatus=UNRESOLVED，後端路由匹配及全 adapter schema 2.2 屬 WP5。Windows launcher 更新但未在 Windows 實際執行；手動 report-design 測試未執行。

## 7. 驗收項目逐項對照

| 條款 | 結果與證據 |
|---|---|
| WP4.1 | 通過：獨立 Node、ES5／module、語法容錯與診斷，parser tests |
| WP4.2 | 通過：inline／src／事件屬性／javascript URL、c:url／spring:url、OQ-003 正例與各反例，ScriptSourceTest／adapter integration |
| WP4.3 | 通過：函式庫識別及公開 API 表，未知 UNKNOWN_CALL；semantics tests |
| WP4.4 | 通過：導頁、10 種請求寫法、彈窗、自訂函式、CLIENT 檢核、UI／欄位連動；semantics／tracing tests |
| WP4.5 | 通過：id／class／name／tag／descendant／this、委派、native／jquery 綁定，無匹配保留原文；bindings／tracing tests |
| WP4.6 | 通過：宣告／表達式／物件方法、跨檔案、深度 10 可設定、循環保護、success／done／then 子行為；tracing tests |
| WP4.7 | 通過：字面、串接、template、單次 const／var 初始化、物件屬性／參數、可證明的 JSP 值、未知樣板；tracing／integration tests |
| WP4.8 | 通過：method、url、object／serialize 欄位，未知 method 不猜 GET；semantics／tracing tests |
| WP4.9 | 通過：8 MiB 安全讀取、超限診斷、自有 minified；parser／Struts integration |
| WP4.10 | 通過：分析與渲染分離；capture 安全測試確認目標 script 不執行；WP6 未開始 |
| WP4.11 | 通過：load／ready／IIFE 畫面觸發、失敗 selector 呼叫來源仍在；ApiUsageTest 三項新測試及 Spring integration |
| C1 | 通過：AST 靜態分析、副作用探針未觸發；eval／obj[x]／使用者輸入 UNRESOLVED |
| C2 | 通過：來源、行號、原文、parser、信心、定義／呼叫 evidence；graph integrity 測試 |
| C3 | 通過：集合排序、同輸入相同圖；integration／stable ID 測試 |
| C4 | 通過：框架語意在 parser／adapter，core 僅一般 API 使用推導 |
| C5 | 通過：輸入安全限制沿用，未更動 HTML 輸出；capture 安全測試 |
| C6 | 本 WP 無新增 HTML 產出；CSP 工作保留 WP7，未宣稱提前完成 |
| C7 | 通過：SafeProjectFiles／safe-files、路徑逃逸與大小測試 |
| C8 | 通過：ADR、版本釘選、授權；npm audit 0，Dependency-Check 遠端門檻 |
| C9 | 通過：來源穩定鍵、同類出現序，行號變化不改 ID |
| C10 | 通過：文件／診斷繁體中文；程式鍵與 ID 英文 |

所有既有測試斷言保留，相關文件及開放問題已更新；四個增量皆已推送且遠端 CI 全綠，WP4 完成；依需求方指示停止，不進入 WP5。
