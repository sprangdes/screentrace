# ADR 0155：R77 標注備註、欄位與 API 標注、進度保存提醒（md format_version 4）

## 背景

[改善計畫 2026-11-17](../IMPROVEMENT_PLAN_20261117.md) 階段 1：第 1 項（標注可附說明）、第 2 項（擴大可標注的元素，顯示欄位除外）、第 6 項（進度保存提醒）。R17 起決策原因與備註退場（[ADR 0084](0084-r17-two-page-report-and-retired-tests.md) 第 3 點），只能標畫面與按鈕，API 狀態只能由畫面標記推導。甲方的修改意見與移除理由沒有地方記，AI 也收不到；輸入欄位、表格與 API 不能標注。

需求方於 2026-11-17 決定計畫列出的待決問題（OQ-052）：

| 問題 | 決定 |
|---|---|
| 這次的範圍 | 只做階段 1；階段 2、3 的待決問題記入 OQ-053、OQ-054 |
| md `format_version` 是否升版 | 新增 4；沒有備註也沒有 API 直接標注時仍輸出 1，既有 golden 位元組不變 |
| 備註文字在正文的處理 | 沿用 OQ-007：code span 隔離、可見化控制與隱形字元、300 code point 截斷 |
| API 直接標注與推導狀態不一致 | 直接標注為準；不一致列入「衝突與警告」，不自動修正 |
| 欄位是否「隨畫面移除」 | 是，與按鈕相同 |

## 決定

### R77-1 可標注的元素

- 新增 `fieldComponents(graph)`：kind 為 TEXT_INPUT、TEXTAREA、SELECT、MULTI_SELECT、CHECKBOX、RADIO、DATE_PICKER、FILE_INPUT、TABLE 的元件（已算作按鈕者除外），每個 owner 畫面一筆。`markableComponents` 納入欄位。決策仍存在 `componentDecisions[screenId][componentId]`，鍵與儲存格式不變；`effectiveComponent` 的 INHERITED_REMOVE 同樣適用欄位。
- `statistics` 的 `components` 仍只計 BUTTON／LINK／SUBMIT（契約不變）；另增 `fields`、`fieldsInherited`（欄位）與 `apis`（圖中 ENDPOINT 節點的直接標注）。
- 右側欄新增「欄位」分組，排在「按鈕」之後，列出欄位種類（文字欄位、下拉選單…）與觸發結果。原本因有觸發行為而列在「按鈕」的欄位（例如會導頁的下拉選單）移到「欄位」。預覽中點欄位會標出對應列（沿用 `data-component-row` 與預覽元素對應）；快捷鍵 k／x／u 作用於選取的欄位列。
- 新增 API 直接標注：`ReviewState.apiDecisions?: Record<endpointId, Decision>`，`setApi`／`apiDecision`。API 頁的詳情新增「這個 API」三段選擇器，清單列顯示已標記保留／移除。`deriveApiUsage`（R-API-1～6、R30）不變，直接標注不改推導結果。
- `apiConflicts(graph, state)`：標記保留但推導為 REMOVABLE（呼叫來源全部移除），或標記移除但推導為 IN_USE（仍有未移除的呼叫來源）。標記移除且 UNREFERENCED 不是衝突：這正是需要人確認的情況。衝突列在確認進度面板、API 詳情與 md §6，不自動修正。

### R77-2 備註

- 沿用 `DecisionNote`（`reason?`、`note?`）與 `DecisionNotes`，另增選用的 `apis` 字典。備註最多 1,000 個 Unicode code point；換行與 tab 改為空白，其他控制與方向字元移除（WP47 只移除，會讓字黏在一起）。原因代碼仍須符合當時的保留／移除決策（`reasonCodes`），選填。
- 備註與決策獨立：未確認的項目也可以寫備註（例如「這欄改成必填」），會匯出；原因只在保留／移除時匯出（`exportableNotes`），改回未確認時原因留在頁面但不匯出，WP47 的規則不變。
- 介面：畫面決策下方、每個按鈕與欄位列尾端、API 詳情各有可收合的「備註」（原因下拉＋文字框，顯示字數）。開合鈕是帶 `aria-expanded` 的按鈕而非 `<details>`，面板既有的 `<summary>` 分組因此不受影響。輸入時即寫入狀態與暫存但不重建面板，離開欄位後才重繪；開合狀態在重繪間保留。
- 瀏覽器暫存與匯入的 `decisionNotes` 不再略過（取代 ADR 0084 第 3 點對原因與備註的處理）；元件庫覆寫欄位仍略過並提示。舊 v3 md 的原因與備註現在會還原。
- 修正：`putNote` 以一般指定寫入 ID，`__proto__` 會變成改原型而遺失；改用 `Object.defineProperty`。`exportableNotes` 同樣處理。

### R77-3 md format_version 4

- 有任一可匯出的備註，或任一 API 直接標注為保留／移除時輸出 4；否則輸出 1，正文與附錄 A 與 R77 前逐位元組相同（`review.md`、`malicious-review.md` golden 不變）。
- 附錄 A（v4）：`format_version`、`analysis_fingerprint`、`screen_decisions`、`component_decisions`、`decision_notes`（`{screens, components, apis}`）、`api_decisions`、`state_sha256`；不含元件庫欄位。未知 ID 保留；API ID 不在圖中列為 orphan（`{apiId}`）。匯入接受 1～4，v4 欄位嚴格驗證，失敗不改目前狀態。
- 正文（v4）：固定指示後加第 7、8 條（`noteInstructions`）；第 1～6 條仍逐字等於 CODEX_INSTRUCTIONS §8.2。§2 統計在 v4 加「API(直接標注)」列；「欄位」列在圖中有欄位時出現（任何版本，現有 golden 沒有欄位所以不變）。§3 畫面表與元件表加「原因」「備註」欄；移除畫面的元件不列出，但寫了備註的元件另列一表。§4 有直接標注的 API 小標題為 `[KEEP]`／`[REMOVE]`，下一行寫推導狀態，再列原因與備註。§6 加 API 衝突表。
- 原因顯示為「中文標籤（代碼）」，沿用 WP47 的寫法（例如「業務單位確認已停用（DISCONTINUED）」）。備註依 OQ-007 只放在 code span，截斷標記指向 `附錄 A: decision_notes.<scope>.<id>.note`。

### R77-4 進度保存提醒

- 「下載 md」按鈕右上角在有標記、且這些標記不在任何檔案中時顯示提示點（`data-unsaved`）；有進度檔且已寫入、或下載／開啟 md 後到下一次標記之前，不算未保存。
- 下載時記錄時間與標記摘要（FNV-1a）於 localStorage（`screentrace:last-export:v1:<應用>:<指紋>`，只供這台瀏覽器顯示）。重新開啟時標記與上次下載相同就不提示。按鈕提示文字與進度檔選單顯示「上次下載 md：…」。
- 進度檔選單在不支援自動存檔與尚未設定進度檔時，加入「下載 md」按鈕；不支援時的說明改為明講換電腦或清除資料會遺失。
- 有未保存標記時，第一次關閉或離開頁面會觸發瀏覽器的離開確認（`beforeunload`），同一次開啟只問一次。頂部列可見控制項數量不變（R17 ≤ 6）。

## 測試

- 新增 `r77-annotation-scope.test`（欄位與按鈕分開計數、隨畫面移除、API 直接標注與衝突、備註的原因規則與清理、`__proto__` ID）、`r77-review-md.test`（v4 golden `golden/review-v4.md`、往返位元組相同、沒有新內容時仍等於 v1 golden、備註隔離與截斷、v4 嚴格匯入、API orphan）、`r77-annotation.e2e`（欄位分組、預覽點欄位、備註輸入不中斷與重新整理後還原、API 標注與衝突、未保存提示與離開確認）。
- headless Chromium 不顯示 `beforeunload` 對話框（最小頁面實測亦然），e2e 以派送可取消的 `beforeunload` 事件確認第一次被取消、第二次不取消。
- 修改的既有斷言（都鎖定本 ADR 取代的 R17 行為「原因與備註載入時略過」）：
  - `md.test` 的 WP47 測試原本斷言 v3 匯入後再匯出為 v1、不含原因與備註；改為再匯出為 v4 並保留原因與備註，v3 匯入的驗證斷言不變。
  - `r17-shell.e2e` 的下載 md 測試原本以暫存中的 `decisionNotes` 作為「退場欄位」，斷言提示、匯出 v1 且不含備註；改以元件庫 orphan 覆寫作為退場欄位，斷言同一則提示（「已不再使用的欄位」）、匯出 v4 含備註且不含元件庫 ID，並與共用產生器輸出逐位元組相同（時間除外）。
- 效能：`statistics` 在每次重繪執行，改為只建一次圖索引；`apiConflicts` 在沒有 API 直接標注時不推導呼叫來源。`performance.e2e` 的首次渲染門檻（R5 278 ms 的 3 倍）在此 sandbox 於修改前即未通過（約 1,000～1,600 ms）；交替各量 5 次，中位數修改前約 1,176 ms、修改後約 1,316 ms，範圍重疊，由 PR CI 驗證。

## 後果

- 本輪只改 viewer 與 md，分析器、圖 schema 與 Java 不變。
- 顯示欄位（第 5 項）、功能心智圖（第 3 項）、md 系統分析章節（第 4 項）與模擬可信度標示（第 7 項）未實作，待決問題見 OQ-053、OQ-054。
- 舊版報表開啟 v4 md 會因未知版本拒絕；新版報表可讀 1～4。
