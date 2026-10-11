# ScreenTrace 第七輪調整指示（R7：預覽元素與圖元件的精確對應）

給 Codex 執行。執行前依 AGENTS.md §10 讀取 `AGENTS.md`、`docs/CODEX_INSTRUCTIONS.md`、`docs/REQUIREMENTS.md`、`docs/ARCHITECTURE.md`、`docs/ROADMAP.md`、`docs/reports/R3.md`、`docs/reports/R6.md`，以及 OPEN_QUESTIONS 的 OQ-015。REQUIREMENTS §1 原文與 §2 決策 D1–D8 不得更動。R3–R6 的「不要做」與「停止條件」仍適用。

## 0. 背景與目標

R6 的畫面原型可以模擬操作，但覆蓋率低：petclinic「85 個可操作元素中只有 10 個有圖支持的行為」。原因不是模擬層，而是**預覽 DOM 元素對不到圖中的元件**，點了只能顯示「無法確認」。

本輪目標：**用可證明的錨點取代啟發式配對**，讓能被證明對應的元素確實對上；仍對不上的，附上明確的原因分類，不猜。

### 0.1 已查證的根因（請自行再驗證）

1. 現行配對在 `screentrace-capture/element-styles.mjs` 的 `componentLinks()`：依序嘗試 `data-st-component-id` → `id` 屬性 → `name` → `field` → 「來源檔＋行號＋標籤」→（無來源時）「同標籤的第一個未使用元件」。最後一項是**依 DOM 順序的猜測**，違反 AGENTS.md「Do not silently guess」。
2. `data-st-component-id` 由 `preview-markup.mjs` 的 `annotateSource()` 在 capture 端**重新計算**元件 ID 雜湊（與 Java 分析器的 ID 推導是兩份實作），且只處理「JSP 檔內直接出現的標記」。經 tag file 展開的元素，其渲染來源是 tag 檔（如 `menuItem.tag:10`），但圖中元件的 `source` 是呼叫它的 JSP（如 `createOrUpdatePetForm.jsp:7`），兩邊永遠對不上。
3. 圖中這類元件的 evidence 只有**一包無順序的呼叫位置／定義位置**（`menu.tag` 第 16／20／25／30 行都掛在同一個元件上），無法分辨「哪個 menuItem 呼叫對應哪個元件」。因此圖本身目前**不含**可供配對的展開路徑。
4. petclinic 實測：未對應的 `a` 45 個、`button` 9 個，全部來自 `menu.tag`／`menuItem.tag`（每個畫面 6 個）。
5. capture 的 tag 展開（`capture-static-jsp.mjs` 約 131–160 行）與 Java 的 `JspTagFileExpander` 是**兩份獨立實作**。本輪不合併它們（列為技術債），但兩者必須對同一個輸入產生一致的展開路徑。

## 1. 設計：展開路徑錨點（Expansion Anchor）

為每個「由 tag 展開產生的標記」定義一個決定性的字串錨點：

```text
anchor = <外層呼叫位置> > <次層呼叫位置> > … > <最內層標記的定義位置>
位置   = <專案相對路徑>:<行號>
例     = jsp/pets/createOrUpdatePetForm.jsp:7 > tags/layout.tag:12 > tags/bodyHeader.tag:7 > tags/menu.tag:16 > tags/menuItem.tag:10
```

- 不在 tag 內的直接標記，錨點僅有一個位置（其來源檔與行號）。
- 同一位置在迴圈或重複呼叫下產生多個渲染元素時，它們共用同一錨點（多對一合理）。
- 同一行有多個同類標記時，錨點加上「同行第 n 個」序號（`:7#2`），n 的計算方式兩端必須一致，並以測試鎖定。
- **Java 分析器**在產生元件時，把錨點寫入該元件的 `attributes.expansionAnchor`（字串，沿用既有的屬性字串 map）。**這不改 graph schema**；請先確認 schema 驗證不禁止新增屬性鍵，若禁止，寫 OPEN_QUESTIONS 並停止。
- **capture 的展開**在展開每個 tag 內標記時，維護同樣的呼叫堆疊，輸出 `data-st-expansion-anchor="…"` 屬性到渲染的 HTML。
- 配對時：`element.expansionAnchor === component.attributes.expansionAnchor`（且屬於同一畫面）→ **確定性對應**，配對依據標記為 `ANCHOR`。

不採用的做法（請勿做）：以文字相似度、DOM 順序、屬性猜測補足錨點缺口；把 capture 的 ID 雜湊邏輯擴張成第三份推導。

## 2. 預先授權（同 R4 §0）

只可修改**直接鎖定被取代的配對語意或解析標籤**的斷言（例如「無來源元素以同標籤第一個元件配對」「導覽元素的 `componentResolution` 為 UNRESOLVED」）。鎖定資料正確性、證據、安全、決策保存、md 往返、決定性、API 狀態推導、既有 golden 的斷言一律不得修改。每處在新 ADR 逐處記錄（測試名稱、舊預期、新預期、原因），並證明新斷言在舊實作上會失敗。無法歸入者寫 OPEN_QUESTIONS 並停止該項。

## 3. 工作包

### WP27　分析器：寫入展開錨點

1. 在 `JspTagFileExpander`（及產生元件的相關類別）為每個元件計算 `expansionAnchor`（含巢狀 tag、body 內容、迴圈內呼叫、同行多個標記）。位置使用專案相對路徑，跨平台一致（正斜線）。
2. 先提交失敗測試（合成 fixture，自行撰寫，不複製 petclinic）：
   - 同一個 tag 檔被呼叫 3 次、屬性不同 → 3 個元件有 3 個不同錨點。
   - 三層巢狀 tag（A 呼叫 B 呼叫 C，C 內有連結）→ 錨點含完整呼叫鏈。
   - 同一個版型 tag 被兩個 JSP 使用 → 兩個畫面各有自己的元件與錨點（呼叫鏈起點不同）。
   - tag 的 `jsp:doBody` 內含連結（連結的標記位於呼叫者檔案）→ 錨點為其在呼叫者檔案中的位置。
   - 同一行兩個同類標記 → `#1`／`#2`。
   - 超過深度／循環上限 → 沿用 R3 的診斷，不產生錨點，不無限遞迴。
3. 不改任何元件 ID、名稱、信心、邊或既有 golden 數字；`fixtures/wp10/golden/*.summary.json` 不得變動。圖輸出新增屬性後，決定性（兩次逐位元組相同）必須維持。

### WP28　capture：產生錨點並以錨點精確配對

1. capture 展開 tag 時，維護呼叫堆疊並對每個輸出標記寫入 `data-st-expansion-anchor`；與 WP27 使用同一格式與序號規則。為降低兩份實作漂移風險，**在 capture 中新增一份共用的錨點格式測試向量**（`docs/examples/expansion-anchor-vectors.json`），Java 與 Node 兩端都必須對同一份向量通過（比照 `api-usage-vectors.json` 的做法）。
2. `componentLinks()` 的配對順序改為：**(1) 錨點精確相等（`matchBasis: ANCHOR`）** → (2) 既有的 `data-st-component-id`／`id`／`name`／`field`（`matchBasis: HEURISTIC`，維持現行行為）→ (3) 來源檔＋行號＋標籤（`HEURISTIC`）。
3. **移除第 (6) 項的猜測**（「無來源時取同標籤第一個未使用元件」）：該分支不得再產生對應。若現有測試鎖定此行為，屬 §2 授權範圍，依規定記錄；移除後原本靠它對上的元素若無其他證據，改為 UNRESOLVED 並在報告列出數量。
4. 預覽模型的元素記錄新增 `matchBasis`（`ANCHOR`｜`HEURISTIC`｜無）。這是**預覽模型**的新欄位（非 graph schema）；同步更新 viewer 的 contracts／驗證與預覽模型相關測試。`componentResolution` 值集合不變。錨點精確對應且候選唯一時，`componentResolution` 為 `INFERRED`（沿用既有值集合，不新增列舉），以 `matchBasis=ANCHOR` 表示較高確定度。若認為必須新增列舉值（如 `CONFIRMED`），寫 OPEN_QUESTIONS 並停止該項。
5. 多個元件共用同一錨點（理論上不應發生）→ `AMBIGUOUS` 並列出全部候選，不選一個。
6. 先提交失敗測試：fixture 中四個 tag 呼叫各自渲染成不同 `href` 的連結，斷言每個預覽元素配到的元件其 `href` 屬性與元素的 `href` 一致（用資料正確性斷言，而不是只斷言「有配到」）。

驗收：
- 單元／整合測試涵蓋 WP27 的全部情境在預覽端的對應。
- 錨點格式向量：Java 與 Node 兩端皆通過。
- 決定性：兩次分析＋預覽，圖、預覽模型、單一 HTML 逐位元組相同；跨輸出目錄相同；報表不含本機絕對路徑。
- petclinic（唯讀）前後對照表（見 §4）。

### WP29　未對應的原因分類與覆蓋率揭露

目的：對仍對不上的元素說清楚「為什麼」，並讓覆蓋率數字有意義。

1. 為每個「可操作但未對應」的預覽元素記錄 `unmappedReason`（預覽模型欄位，列舉）：
   - `NO_GRAPH_COMPONENT`：分析器沒有為此類標記建立元件（例如無文字的品牌連結、漢堡選單鈕這類純裝飾元素；或某類標記尚未被支援）。
   - `AMBIGUOUS_CANDIDATES`：多個候選。
   - `ANCHOR_MISSING`：元素來自展開但缺錨點（capture 與分析器展開不一致，屬缺陷訊號）。
   - `DYNAMIC_OR_UNRESOLVED_SOURCE`：標記由無法靜態展開的來源產生。
   - 其他情況用 `OTHER`，並要求 `OTHER` 為零（報告列出實例，逐一改歸類）。
OQ-018 補充（方案 A）：上述五類僅用於元件未對應。已對應但無法模擬者由 viewer 透過與 simulate／canSimulate 相同的共用判定另分為沒有已知的行為（可能由頁面腳本控制）及已記錄行為但無法確認結果，後者再分行為有歧義、目的未解析、類型或事件不支援。畫面／全專案分類加總須等於無法確認總數；真實未對應計數與不適用情境須分開揭露，不把不適用宣稱已驗證為零。

2. viewer 的覆蓋率（畫面與全專案）在「無法確認」旁以可展開的分類統計顯示（中文），例如「無法確認 5 個：分析器未建立元件 3、有多個候選 1、動態來源 1」；點選未對應元素時，提示文字同步說明原因。
3. `ANCHOR_MISSING` 必須為 0（若非 0 視為 WP27/28 的缺陷，修正後才能結案）。

驗收：測試每個分類至少一例；petclinic 與 eMusicStore 的分類統計寫入報告；`OTHER`＝0、`ANCHOR_MISSING`＝0。

## 4. petclinic 前後對照（唯讀分析，寫入 `docs/reports/R7.md`）

| 項目 | R6 結果 | 目標 |
|---|---|---|
| 來自 `menu.tag`／`menuItem.tag` 的預覽元素（9 個畫面） | 54 個全數 UNRESOLVED | 能證明者全數 `ANCHOR` 對應；其餘有原因分類 |
| 全專案「有圖支持的行為」元素數 | 10／85 | 明顯增加；列出實際數字 |
| 導覽列四個連結在原型中點擊 | 無法確認 | 前往 Welcome／Find Owners／Vet List／Exception |
| `HEURISTIC` 配對數、被移除的順序猜測數 | — | 列出 |
| `ANCHOR_MISSING`、`OTHER` | — | 0、0 |

另以 `eMusicStore_eCommerce_Website` 唯讀跑一次，列出同表（無 tag 檔，預期差異小；任何新缺口只記錄）。

## 5. 停止點

1. **WP27、WP28 完成後停止**，等需求方驗收（涉及分析輸出與預覽資料的可信度）。
2. 驗收通過後做 WP29，完成後停止。

## 6. 測試與報告

每個工作包提交前執行完整驗證（指令同 R3 §5）。基線：258 Java／40 JS／77 viewer／34 capture／77 E2E，只增不減（被授權修改的斷言除外）。決定性、單一 HTML 離線可開、報表大小增幅（相對 R6 結束時）不超過 5%。

報告 `docs/reports/R7.md` 須包含：各 WP 狀態與提交；被授權修改的每處斷言（對應 ADR）及其在舊實作上失敗的證明；§4 對照表；錨點格式向量與 Java／Node 雙端通過的證據；移除順序猜測所造成的 UNRESOLVED 增減；**以 petclinic 實際開啟報表並在原型檢視器操作導覽列的觀察**；未驗證項目。未驗證不得寫成已完成。

## 7. 不要做的事

- 不改 graph schema（新增屬性鍵除外，且需先確認不被禁止）、元件 ID、API 狀態推導、md 格式、決策保存規則。
- 不用文字相似度、DOM 順序或專案硬編碼補配對；不為了讓數字好看而降低證據標準。
- 不合併 capture 與 Java 的兩份 tag 展開實作（寫入 ROADMAP 技術債，註明以錨點向量降低漂移風險）。
- 不複製 petclinic／eMusicStore 內容進 repo；不修改、不啟動被分析專案。
- WP28 完成後不得自行進入 WP29。
