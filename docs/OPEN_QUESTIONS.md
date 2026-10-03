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
- 狀態：已處理（2026-10-03）；需求方選受限制的 B，WP4 可繼續。
- 決定：僅 script src 開頭單一變數或標準 context path 寫法且沒有矛盾定義時按 web root 比對；單一 INFERRED、多個 AMBIGUOUS 全列、無符合 UNRESOLVED。c:set 等定義依來源證據處理；中間變數、完整 URL、多變數等走 A；API URL 不套用。ADR 0008、v1.3 與成功／反例測試記錄完整邊界。

## OQ-004 — WP5 工作區 context 設定的來源證據

- 情境：WP5.2 要求讀取工作區設定的明確 context path，C2 要求 source 使用「專案相對路徑 + 行號」。工作區檔案 `~/.screentrace/config.json` 位於被分析專案之外，不能如實表示為專案相對來源；GraphIntegrityValidator.requireEvidence（schema 2.2）明確拒絕絕對路徑及 `..`。增量一已將真實工作區設定檔路徑傳入 ContextValue，增量二接入 canonical graph 時遭到此硬性限制。
- 可選方案 A：明確允許工作區來源命名空間，例如 `workspace:config.json`，evidence.detail 僅保留設定鍵、候選值與採用值，不保留真實路徑；target source 仍使用專案相對路徑。需在 ADR／v1.4 明定此非 target 來源表示。
- 可選方案 B：擴充 SourceLocation 的來源種類，僅工作區設定證據允許專案外絕對路徑；target source 的路徑限制維持。需定義新欄位相容性與驗證規則。
- 影響範圍：WP5 context 設定證據、URL 對應關聯、所有 adapter 的 schema 2.2 嚴格驗證、後續報表證據呈現。既有測試除 schema 版本字串外不得修改。
- 實測：新增 WorkspaceContextEvidenceTest，明確 workspace `/shop` 可解析到 `/api`，但帶原設定檔證據的 schema 2.2 graph 驗證失敗 `Missing or invalid source: api`；1 test／1 failure／0 errors。無修改既有斷言。
- 狀態：已處理（2026-10-03）；需求方採方案 A 並附隱私／來源邊界限制，WP5 增量二可繼續。
- 決定：固定 workspace:config.json、設定鍵所在行（未知為 1）；只接受單純檔名，目標 reserved 名稱拒絕；圖不含真實設定檔路徑／使用者家目錄；detail 只含鍵、候選及採用值，context 來源與採用值必須可從輸出區分。見 ADR 0012、文件 v1.4。

## OQ-005 — schema 退場與 core 歷史相容建構子／預設版本

- 情境：WP5.7 明定所有 adapter 輸出 2.2、移除混合降為 2.1，且「2.1 僅保留讀取歷史資料」。目前 CURRENT_SCHEMA_VERSION=2.1 同時用於缺版本 JSON 讀取與舊版相容建構子。可將退場限於分析輸出而保留相容 API，或解讀成任何新建圖都不得預設 2.1。第 9 節沒有此範圍的預設解讀。
- 既有斷言：ApplicationGraphTest.upgradesSchemaOneJsonWithoutLosingLegacyTraceability（第 36／38／39 行）要求缺版本 JSON 的版本等於 CURRENT_SCHEMA_VERSION、parser=LEGACY、通過驗證；GraphIntegrityValidatorTest.acceptsResolvedScreenNavigation／acceptsInferredNavigationDerivedFromAResolvedEndpoint／acceptsCrossFrameworkGraphRelationships 以舊建構子建立無來源／kind 的圖，要求通過驗證。若直接將 CURRENT_SCHEMA_VERSION 改為 2.2，這些要求將與既有 2.2 嚴格證據驗證衝突；改為接受缺證據的 2.2 會放寬驗證，禁止。
- 可選方案 A：core 保留舊版相容建構子與缺版本歷史 JSON 的 2.1 預設，限歷史資料／既有 fixture；所有 adapter 與合併輸出一律 2.2，既有斷言不變。在 ADR 明定相容 API 不供新分析使用。
- 可選方案 B：新建圖預設一律 2.2，缺版本歷史資料另走 2.1；需求方另授權受影響測試改用明確歷史版本的 fixture 建構方式及版本期望（超出單純 2.1 → 2.2 字串變更），逐處 ADR 記錄；其餘斷言與嚴格驗證不變。
- 影響範圍：WP5 增量四、ApplicationGraph 的建構／讀取相容契約、core 歷史測試、所有 adapter 與 merger；不涉及 WP6。
- 狀態：待需求方決定（2026-10-03）。依 §0.3 停止 WP5；增量三 385578a 已推送且 CI 全綠，schema 增量尚未修改程式或既有測試，未自行選擇方案。
