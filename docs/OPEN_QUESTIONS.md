# 開放問題

每項問題記錄：編號、情境、可選方案、影響範圍、狀態與需求方決定。未決問題不得由實作者自行選擇；依附件 §0.3 暫停受影響工作包。

## OQ-001 — 檢核來源層級與框架中立約束衝突

- 情境：WP1 §4 指定 core 的 ValidationRule 來源層級為 `HTML5` / `JS` / `STRUTS_VALIDATOR` / `ACTION_FORM` / `BEAN_VALIDATION` / `CUSTOM_VALIDATOR`；C4 同時規定 core 圖模型不得出現框架名稱，框架專屬語意只能放 adapter 與 evidence。`STRUTS_VALIDATOR` 明確含框架名稱。
- 可選方案 A：core 使用通用來源層級（例如 markup、client、server），指定框架層級放 evidence；需調整 WP1 §4 的核心欄位定義。
- 可選方案 B：需求方明確允許 ValidationRule 來源層級作為 C4 的例外，保留附件指定列舉。
- 影響範圍：WP1 模型與 schema、WP2/WP3/WP4/WP5 檢核解析、WP7 檢視器、WP8 md 契約。
- 狀態：已處理（2026-10-02）；WP1 可繼續。
- 決定：需求方選擇「core 使用通用來源層級，框架名稱放 evidence」。採用 MARKUP / CLIENT / SERVER，框架來源保留於 evidence.detail，見 ADR 0002。

## OQ-002 — WP3 運算式目標與既有 URL 變數測試

- 情境：v1.1 WP3 第 8 點規定「目標為運算式(EL / scriptlet)者保持 UNRESOLVED 並保留運算式原文」。既有 `JspProjectParserTest.discoversJspJspfLiteralInteractionsIncludesAndTiles` 的第 46–50 行，要求 `<spring:url value="/orders/search" var="searchUrl"/>` 搭配 `${searchUrl}` 解析成 `/orders/search`，以及 `${fn:escapeXml(formUrl)}` 解析成 `/owners`。現有解析器 `resolvedTarget` 也會代入變數。需求方本次另明確禁止修改或放寬既有測試斷言。
- 可選方案 A：所有 EL／scriptlet 目標一律 UNRESOLVED，保留原文；需需求方明確授權調整上述既有測試，並以 ADR 記錄行為變更。
- 可選方案 B：明確允許同來源中由 `c:url`／`spring:url` 的字串常值定義、無重新賦值且作用域可證明的 URL 變數作為第 8 點例外；純變數與已知 `fn:escapeXml` 包裝可靜態解析，但保留原始運算式及定義證據。其他 EL／scriptlet 保持 UNRESOLVED，未知函式不得當作透明包裝。既有測試斷言不變。
- 影響範圍：WP3 目標、表單、來源與既有測試；WP4 的 script src／URL 值解析；WP5 呼叫對應；M2 驗收。
- 狀態：已處理（2026-10-03）；需求方明確選擇方案 B，WP3 可繼續。8b348e0 仍僅為首批增量。
- 決定：同一 JSP 的 c:url／spring:url、不含 EL 的常值、使用前定義、無重新賦值、作用域可證明，只允許純變數／fn:escapeXml 包裝；保留原始 EL 和定義行號，保留 {name} 樣板，不解析 param。未知函式、其他 EL／scriptlet、跨檔案定義、c:set 一律 UNRESOLVED；既有斷言不得修改。見 v1.2 WP3.8 與 ADR 0005。

## OQ-003 — WP4 script src 的未知 ctx 與實體來源定位

- 情境：WP4.2 必須支援經 `${ctx}` 的 script src，WP4.7 允許未知部分保留為 INFERRED 樣板；但 `${ctx}` 無定義時不能由該字串證明實體檔案位置。WP5.2 明定 context path 不得假設，§0.3 將缺少 context path 資訊列為停止條件。專案 WorkspaceSettings／ProjectCatalog 目前沒有 context path 設定欄位，文件也未定義 ctx 必然代表部署前綴。`<script src="${ctx}/js/app.js">` 可解讀成等待可證明值，或授權忽略不透明部署前綴來尋找 web root 檔案。
- 可選方案 A：未知 ctx 的 script src 保持 UNRESOLVED、保留原文並診斷，不讀取猜測的檔案；只有來源或明確設定證明 ctx 時才定位。普通 JS 字串的部分未知值仍依 WP4.7 保留樣板（使用者輸入依對抗性規則 UNRESOLVED）。
- 可選方案 B：需求方明確授權，僅對 script src 開頭的 `${ctx}` 將其當作不透明部署前綴，按剩餘 `/js/app.js` 尋找安全 web root 檔案，解析狀態 INFERRED、保留原文與此定位規則證據；不得將此例外泛用於其他 EL 或後端 URL 配對。
- 影響範圍：WP4 來源收集、外部 JS AST、事件來源完整性與測試；WP5 context path／URL 配對不提前實作。
- 狀態：未決（2026-10-03）；依 §0.3 停止 WP4，增量一已完成且 CI 全綠，增量二至四未開始。
- 決定：等待需求方回覆，不自行選擇。
