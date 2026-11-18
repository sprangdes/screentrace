# ScreenTrace 改善項目（2026-11-17）

## 背景

ScreenTrace 用來對甲乙雙方都不清楚功能的 legacy 專案做靜態分析，產生單一離線網頁。甲乙雙方在網頁上確認功能、流程與畫面的去留並標注，再由標注產生交給 AI agent 的分析文件，讓 AI 後續修改專案時不必重新分析整個專案。

需求重點：

- 以畫面為單位，並用類似心智圖的方式呈現完整的功能與流程。
- 可以模擬專案實際運作的畫面與操作。
- 操作中碰到的每個元素（畫面、按鈕、輸入欄位、顯示欄位、呼叫的 API）都能標注。
- 以圖形化介面為主，淺顯易懂。

使用情境：乙方帶著網頁去找甲方，或把網頁傳給甲方；甲方單獨確認，或雙方同時在場一起操作。**不需要多人協作與合併**。標注到一半的進度靠 md 匯出／匯入帶著走（報表 HTML 與進度 md 一起攜帶）。

## 現況已滿足

| 需求 | 現況 |
|---|---|
| legacy 專案靜態分析 | Struts 1、Spring MVC／Boot JSP、Thymeleaf（有限度）、Spring Boot + React；AST 解析，不執行、不修改目標專案 |
| 可攜帶的網頁 | 單一離線 HTML，不需安裝或連網 |
| 以畫面為單位 | 畫布卡片、截圖、完整預覽、進出關聯線 |
| 模擬操作 | Chromium 渲染靜態頁並填入示範資料，點按鈕換頁、多候選讓使用者選擇、Spring Data 示範 CRUD |
| 進度帶著走 | Chrome／Edge 自動寫入進度 md；其他瀏覽器用「下載 md」「開啟 md」 |
| 圖形化 | 畫布、關聯線、API 狀態色條、呼叫鏈 |

## 改善項目

依優先順序排列。

### 1. 標注可附說明

- **現況**：只能選保留／移除／未確認。原因與備註已在 R17 移除（[ADR 0084](adr/0084-r17-two-page-report-and-retired-tests.md)）；資料結構 `DecisionNote` 還在 `screentrace-viewer/src/shared/review.ts`，但 `screentrace-viewer/src/main.ts` 載入時會略過。
- **問題**：甲方的修改意見（例如「這欄改成必填」「這個流程併到 B 畫面」）與移除理由沒有地方記，AI 也收不到。
- **改善**：
  - 每個可標注的元素都能填備註，原因代碼選填。
  - 備註寫進 md 正文（各畫面、元件、API 的段落）與附錄 A，可匯入還原。
- **影響**：viewer 右側欄、`review.ts`、`review-md.ts`、[REVIEW_MD_CONTRACT](REVIEW_MD_CONTRACT.md)、[REVIEW_STATE_CONTRACT](REVIEW_STATE_CONTRACT.md)；需新 ADR 取代 ADR 0084 第 3 點對備註的處理。
- **待決定**：md `format_version` 是否升版；備註文字在正文是否沿用 code span 隔離與 300 字截斷規則（OQ-007）。

### 2. 擴大可標注的元素

- **現況**：只能標注畫面，以及 `buttonComponents`／`markableComponents`（`review.ts`）挑出的按鈕、連結、送出與有觸發行為的元件；`statistics` 也只統計按鈕類。
- **改善**：

| 元素 | 現況 | 工作 |
|---|---|---|
| 輸入欄位（TEXT_INPUT、SELECT、MULTI_SELECT、CHECKBOX、RADIO、DATE_PICKER、TEXTAREA、FILE_INPUT） | 已解析為 COMPONENT，md 會列出，但不能標注 | 開放標注；右側欄新增「欄位」分組；預覽中點欄位可對應到清單 |
| TABLE | 已有元件 | 開放標注 |
| API | 狀態只能由畫面標記推導（`deriveApiUsage`） | 新增 API 直接標注；推導狀態與直接標注並列，衝突時列入「衝突與警告」 |
| 顯示欄位（`${...}`、`<bean:write>`、`th:text` 等輸出點） | 未建模 | 見第 5 項 |

- **影響**：`review.ts`（可標注集合、統計、衝突）、`screen-panel.ts`、`api-page.ts`、`review-md.ts` 附錄 A（API 決策需要新的鍵）。
- **待決定**：API 直接標注與推導狀態不一致時以哪個為準；欄位標注是否也有「隨畫面移除」的繼承規則。

### 3. 功能層級的心智圖檢視

- **現況**：只有畫面流向圖，畫面多時依網址第一段分區。R14 的功能區域與泳道、流程大綱已在 R17 移除。
- **問題**：甲方以「功能」思考（例如保單查詢、報表下載），不是以畫面或網址思考。
- **改善**：
  - 新增「功能 → 流程 → 畫面」樹狀／心智圖檢視，可展開收合，點畫面進入現有預覽。
  - 分組先用確定性規則：Struts module、Controller 類別、網址前綴、Tiles definition；規則來源寫入證據。
  - 可標注整個功能（保留／移除＋備註），未個別標注的畫面繼承功能的決定。
  - 之後可讓 AI 協助命名或調整分組，但要標示為推測，不取代確定性結果。
- **影響**：core 需要功能分組的表示方式（節點或 attributes，需維持框架中立）、adapter 提供分組依據、viewer 新檢視、md 新章節。
- **待決定**：功能分組放在 Application Graph（schema 升版）還是 viewer 推導；使用者能否手動調整分組。

### 4. md 補成系統分析文件

- **現況**：md 是「審查結果」：統計、畫面（元件、行為、檢核）、API、導覽、衝突、分析限制、附錄 A。REMOVE 畫面只留 ID、路由、來源；`migration_target` 寫死為 Spring Boot 4 + Angular（`review-md.ts` 第 365–367 行）。
- **問題**：AI 讀完 md 仍需要回頭讀原始碼才能理解功能與後端邏輯。
- **改善**，md 補上：
  - 功能清單與每個功能、畫面的用途摘要（依第 3 項分組）。
  - 後端呼叫鏈：畫面 → Action／Controller → Service → DAO，附來源檔與行號；無法證明的段落標 UNRESOLVED。
  - 資料欄位對照：畫面欄位 ↔ 表單模型（FORM_MODEL）↔ API request 欄位 ↔ 檢核規則。
  - 移除影響範圍：每個 REMOVE 項目會牽動的畫面、API、共用元件與樣板。
  - 甲方備註（第 1 項）。
  - `migration_target` 改為可設定或移除，不寫死。
- **影響**：`review-md.ts`、REVIEW_MD_CONTRACT、golden 測試；後端呼叫鏈可能需要 adapter 補 Service／DAO 層的分析。
- **待決定**：系統分析與審查結果放同一份 md 或拆成兩份；後端呼叫鏈追蹤的深度上限。

### 5. 顯示欄位建模

- **現況**：純文字輸出（EL、`<bean:write>`、`<c:out>`、`th:text`、React JSX 表達式）不是元件，無法標注，也不出現在欄位對照中。
- **改善**：parser 把輸出點建模為顯示欄位元件，保留來源運算式與綁定的模型屬性；預覽中可點選、可標注；併入第 4 項的欄位對照。
- **影響**：`screentrace-parser-jsp`、`screentrace-js`、core 元件 kind、capture 的元素位置對應、viewer、md。
- **待決定**：迴圈內重複輸出的欄位視為一個或多個元件；顯示欄位的命名規則。

### 6. 進度保存提醒

- **現況**：Safari、Firefox 或未設進度檔時，標記只存在該瀏覽器的 localStorage，換電腦或清除資料就會遺失。
- **改善**：
  - 有標記但尚未設定進度檔或尚未匯出時，關閉頁面前提醒一次。
  - 「下載 md」放在更顯眼的位置，並顯示上次匯出時間。
- **影響**：`progress-file.ts`、`review-ui.ts`。

### 7. 模擬內容的可信度標示（長期）

- **現況**：動態清單、權限分支、執行期資料無法還原，預覽與實際系統可能不同。
- **改善**：在預覽中標出示範資料區塊與無法確定的區塊，讓甲方不會把示意內容當成真實行為。
- **影響**：capture 的示範資料標記、viewer 預覽圖層。

## 建議實作順序

| 階段 | 項目 | 說明 |
|---|---|---|
| 1 | 第 1、2 項（顯示欄位除外）、第 6 項 | 以 viewer 與 md 為主，不需改分析器。**已完成（R77，[ADR 0155](adr/0155-r77-notes-fields-api-decisions-and-save-reminder.md)）** |
| 2 | 第 3、4 項 | 需先決定資料模型與 md 格式。**已完成（R78，[ADR 0156](adr/0156-r78-features-backend-calls-and-system-md.md)）** |
| 3 | 第 5、7 項 | 需修改 parser 與 capture。**已完成（R79，[ADR 0157](adr/0157-r79-display-fields-and-preview-trust.md)）** |

每個階段開始前，先把「待決定」的問題記入 [OPEN_QUESTIONS](OPEN_QUESTIONS.md) 並由需求方決定，決定後以 ADR 記錄。
