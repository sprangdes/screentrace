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
- 狀態：未決（2026-10-02）；依 §0.3 停止 WP3。WP4／WP5 依工作包與遠端 CI 門檻尚未開始。不得將 8b348e0 首批增量視為完整 WP3 驗收通過。
