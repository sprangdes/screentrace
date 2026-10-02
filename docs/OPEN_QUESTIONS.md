# 開放問題

每項問題記錄：編號、情境、可選方案、影響範圍、狀態與需求方決定。未決問題不得由實作者自行選擇；依附件 §0.3 暫停受影響工作包。

## OQ-001 — 檢核來源層級與框架中立約束衝突

- 情境：WP1 §4 指定 core 的 ValidationRule 來源層級為 `HTML5` / `JS` / `STRUTS_VALIDATOR` / `ACTION_FORM` / `BEAN_VALIDATION` / `CUSTOM_VALIDATOR`；C4 同時規定 core 圖模型不得出現框架名稱，框架專屬語意只能放 adapter 與 evidence。`STRUTS_VALIDATOR` 明確含框架名稱。
- 可選方案 A：core 使用通用來源層級（例如 markup、client、server），指定框架層級放 evidence；需調整 WP1 §4 的核心欄位定義。
- 可選方案 B：需求方明確允許 ValidationRule 來源層級作為 C4 的例外，保留附件指定列舉。
- 影響範圍：WP1 模型與 schema、WP2/WP3/WP4/WP5 檢核解析、WP7 檢視器、WP8 md 契約。
- 狀態：已處理（2026-10-02）；WP1 可繼續。
- 決定：需求方選擇「core 使用通用來源層級，框架名稱放 evidence」。採用 MARKUP / CLIENT / SERVER，框架來源保留於 evidence.detail，見 ADR 0002。
