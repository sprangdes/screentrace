# ADR 0092 — 第二批公開應用：操作控制、示範資料與模板投影

- 日期：2026-10-18
- 狀態：採用；需求方明確要求「修正這些發現的問題」。
- 工作包：WP70，延續 `fix/workflow-restoration`。

## 背景

第二批固定公開來源驗收留下 WF-010（冒號標籤）、WF-011（confirm 控制依賴）、WF-012（資料狀態）與 NC-001（Thymeleaf）失敗。需求方本次授權修正全部已記錄問題，包含有限度擴充原先不支援的模板技術與示範資料功能。此授權優先於 CODEX_INSTRUCTIONS §9 的舊 Thymeleaf 排除；不改寫需求原文，不改動目標專案，不執行任何目標程式，不放寬既有驗收斷言。

## 選項

1. 只修復 selector，繼續把功能與模板失敗歸為不支援：無法滿足本次授權。
2. 執行目標應用或直接從預覽 HTML 猜測 CRUD：違反靜態分析與 canonical graph 約束。
3. 在 adapter／parser 產生帶來源證據的有限語意，檢視器以工具自己的狀態機模擬：採用。

## 決定

### 共用預覽對應

capture 的 `tag[n]` 路徑先將含冒號／句點的標籤名稱跳脫再轉為 CSS nth-of-type。執行時 `data-st-component-id` 只能在持久化 ANCHOR 候選集合內縮小對應，放在共用 `previewElement`，讓實際操作與覆蓋率取得同一結果；不改寫 Preview v2 的 ANCHOR 契約或原候選集合。動態複製示範資料列時以 WeakMap 保留原始元件記錄，先保存原模板的對應，避免插入第一列後原模板序號改變而使第二列失去來源。

### 確認與同頁回傳

Acorn 對 inline event 中直接 `return confirm(literal)`／`return window.confirm(literal)` 產生 `OPEN_DIALOG` 行為的 `operation=confirm,cancelsDefault=true` 證據。只承認可證明的全域呼叫、常值訊息及無 guard 的直接回傳；名稱遮蔽、未知值、巢狀 helper 回傳不升級為預設動作控制。一般 `confirm(...)` 原有對話描述不擅自推定能取消預設動作。

模擬器將 default navigation／form continuation 放在確認結果內，取消或 Escape 僅關閉；確認後才執行。工具所產生對話框不執行來源腳本。導向來源已證明的同一畫面時重新渲染，以反映刪除或自回傳的狀態，不把它視為空操作。

### 有證據的示範資料狀態

`SpringDataSimulation` 用 JavaParser 從 controller → service → repository 解析有限的直接呼叫。repository 必須有可見 Spring Data 介面匯入與 entity 型別；`findAll/findById/save/deleteById`、單一直接 wrapper、常見 `findById(...).orElse(null)` 才可投影。不依方法名稱中的 `saveEmployee`、頁面標題、資料表名稱猜測行為；wrapper 的未知轉換、條件、延後 lambda、遮蔽、過載、型別歧義、自訂 repository 覆寫等保持不提供契約。

Graph HANDLER 的 `simulationData` 及 SCREEN 的 `simulationBindings` 使用既有字串 attributes，JSON version 1：

```json
{"version":1,"operation":"upsert","collection":"source-file:repository-type","idField":"id","fields":["id","name"]}
```

- operation：`readAll`、`readOne`、`upsert`、`delete`。
- model：read 連到 `Model.addAttribute` 的實際模型名稱時提供。
- collection：來源 repository 的穩定識別；不代表真實資料庫表名。
- fields：有來源宣告的基本值欄位；idField 需有唯一 `@Id` 證據。
- 每個 contract／binding 均附 `SpringDataSimulation`、`INFERRED` 證據，包含 controller、wrapper、repository、entity 檔案與行號。它描述可供示範的資料路徑，**不是聲稱執行了服務邏輯或資料庫操作**。

capture 只為已證明的 list model／JSTL forEach 及基本欄位產生工具資料綁定標記。檢視器只消費 graph contract，依點擊的示範資料列識別選取項，再讀取表單命名欄位。最大 200 筆／64 欄／每值 4,000 字元，資料留在 payload 的 WeakMap session，重載報表即重置，不改 graph、review、md 或目標來源。文字以 textContent 更新；不 eval 表達式、不發請求。列表與編輯／刪除可跨畫面延續同一份示範資料。

導向被投影成 SCREEN 時，仍從該來源元件的唯一已證明 TRIGGERS／HANDLED_BY 取回資料操作，避免只保留目的頁而遺失刪除語意。多個不一致資料契約不選其一。

### 有限度 Thymeleaf 投影

Spring 專案有 `src/main/resources/templates/*.html` 時進入 MVC 分析；physical HTML view 與 controller logical view 關係在 adapter 解析，logical view 本身不構成 public URL。核心圖模型不加入模板框架型別。

`ThymeleafMarkup` 使用既有 markup lexer，保留原 `th:href`／`th:action` 與行號，僅把可證明的 application-relative `@{...}` URL 形狀投影到標準屬性。動態 path id 保留 `{id}` 並標示 INFERRED；常值 query 編碼保留。未知函式／URL builder／動態根路徑保持 unresolved；模板覆蓋靜態 fallback，不以 fallback 冒充實際目的。capture 的投影值來自 graph，不獨立解讀來源運算式。

常值 JS navigation 以既有 URL resolver 對到 GET endpoint，再沿 handler／render 關係找目的頁；無匹配時保留原未知行為，不新增重複的舊案例診斷。原始 Thymeleaf 運算式保留在 evidence；route template 推論取已解析的路徑形狀。

此範圍不等同完整 Thymeleaf 引擎，不執行 SpEL、layout dialect、URL builder、動態 fragment、任意迴圈／後端計算。未知來源仍保留原文與 unresolved 診斷，不替它捏造頁面關係。

### 可見的靜態快照

視覺驗證發現來源淡入動畫被舊 freeze 規則停在 opacity 0，DOM 存在卻看不見。快照 CSS 改為零時間、單次、forwards、paused 的固定完成狀態；一般非動畫的 hidden／opacity 0 保持原值。這只選定可見靜態呈現，不執行來源 JS；有限與無限動畫都固定為一個決定性的單次完成狀態。

## 後果與驗證

不新增 dependency，不更動 Graph 2.2／Preview 2 的 schema。新增欄位均在既有通用 attributes 及 evidence 擴充點內。原專案 `.do`／`*.html` 不一致與缺少 JSP 維持診斷，不修改來源以補成功。

固定來源驗收重跑原 25 案例／5 旅程；另加確認取消、第二筆資料列選取、CRUD、跨畫面延續、reload 隔離、動畫可見性及未知來源反例。保留紅燈與原失敗基線，不修改既有測試斷言。結果見第二批修正報告。
