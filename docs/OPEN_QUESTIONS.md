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
- 狀態：已處理（2026-10-03）；需求方採方案 A，附歷史 API 淘汰標記、新分析／合併／CLI 嚴格 2.2、拒絕歷史圖合併與報表／匯出輸入限制。
- 決定：舊建構子及缺版本預設保留為歷史相容專用，@Deprecated 與註解限制用途；正式來源不得呼叫舊建構子。合併拒絕 2.1 或不符合嚴格證據的輸入，不靜默升版。報表／後續匯出拒絕非 2.2。core 既有歷史斷言不變；遷移後移除舊建構子列技術債。見 ADR 0015；實作因下列 OQ-006 暫停。

## OQ-006 — 報表／匯出限制與既有歷史 fixture 成功測試

- 情境：OQ-005 最新決定要求報表與後續匯出輸入 MUST 為 2.2，非 2.2 清楚失敗。既有 ReportGeneratorTest.consolidatesCapturedAssetsIntoPreviewContractAndReportReadsOnlyContracts（第 28–45 行）建立 CURRENT_SCHEMA_VERSION=2.1 圖並呼叫 ReportGenerator.write，之後斷言輸出成功；其節點／邊 source=null，元件缺 kind，不符合 2.2 嚴格驗證。既有 ReviewResultGeneratorTest 的 fixture（第 290 行）、其他 2.1 圖及 CURRENT_SCHEMA_VERSION 圖也要求匯出成功。既有測試除 schema 版本字串外不得修改，而僅改成 2.2 無法補足嚴格報表 fixture 的來源。
- 可選方案 A：需求方額外授權僅遷移報表／匯出測試 fixture 為明確 2.2，補足真實測試來源、解析器 evidence、元件 kind；既有斷言全部不變，每處 fixture 修改於 ADR 列出。core 歷史相容測試一律不變。
- 可選方案 B：保留原有 2.1 報表／匯出成功 fixture，需求方另明確授權歷史相容入口，修訂最新的報表／匯出輸入限制。
- 影響範圍：WP5 增量四、ReportGenerator／ReviewResultGenerator 與其 fixture；core 舊斷言不受變更，WP6 不涉及。
- 狀態：已處理（2026-10-03）；需求方採方案 B。
- 決定：舊 ReportGenerator／ReviewResultGenerator 為 Deprecated 歷史相容入口，分別於 WP7／WP8 隨原測試移除；2.1 輸出列版本與歷史證據限制。只有新檢視器注入、md 匯出及新共用模組強制 2.2。CLI 實際分析餵入 2.2，既有 fixture／成功行為／斷言均不改。新增 §0 通則：預定取代的舊碼優先相容而不遷移測試，以 ADR 記錄，不再因同類衝突停問；長期程式需放寬斷言才停止。見 ADR 0016。


## OQ-007 — WP8 條件／未解析運算式與禁止輸出原始碼的邊界

- 情境：WP8 §3 的元件與行為表須含「條件」，§8 須列 UNRESOLVED／AMBIGUOUS 與來源；WP1 的 guard 要保留原文，現行圖的 guard、expression、evidence.detail 可能包含 JS／EL／scriptlet 的來源片段。WP8 §4 及需求方本輪安全要求同時明定「不得輸出原始碼、HTML 或 base64 圖片」。第 9 節未界定短條件／未解析運算式是否屬禁止的原始碼內容。Markdown 跳脫可防止注入，但不會消除其原始碼資訊。
- 可選方案 A：允許經 Markdown／HTML 跳脫的短條件及未解析運算式作為分析中繼資料；仍禁止完整原始碼檔案、原始 HTML、base64 圖片。需需求方界定允許片段及 evidence.detail 的範圍。
- 可選方案 B：禁止匯出任何程式／模板運算式原文；條件／未解析項目只列存在標記、ID、類型、信心、來源檔案與行號，evidence.detail 中的原文不匯出。
- 影響範圍：WP8 共用 md 契約、條件欄位、§8 限制清單、惡意字串測試與 golden fixture；不改動圖／現有檢視器的原文保存。
- 狀態：已處理（2026-10-03）；需求方採方案 A，限定允許標籤／路由／guard／UNRESOLVED 目標及選擇器／檢核文字；禁止完整檔案／函式／敘述式／原始 HTML／base64 與自由 detail。300 字元可見截斷、code span／控制字元隔離及固定警語見 v1.6、ADR 0022。WP7 前置修正 c70e7c6 已推送，[遠端 CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37113334292)。未進入 WP9。


## OQ-008 — WP8 機器讀取區與 code span／長度限制

- 情境：OQ-007 明定所有專案衍生文字 MUST 在 code span，每段最多 300 字元並標示截斷。WP8 固定契約的 YAML application／technologies 與附錄 A JSON review state 含應用名稱及原始 screenId／componentId；現行 review contract 依完整名稱／ID 驗證和還原。若機器讀取區也加 Markdown code span 或截斷，值不再是原始名稱／ID，無法滿足完整還原與往返位元組相等；第 9 節未定義例外。
- 可選方案 A：code span／300 字元限制適用正文展示；YAML 與附錄 A 的機器值保留完整，採嚴格 JSON 字串／Unicode 跳脫，禁止注入新行／圍欄，解析為資料。需需求方明確授權機器區例外。
- 可選方案 B：機器區也適用 code span／300 字元；另修訂機器契約與 ID 還原方式，避免不可逆截斷。
- 影響範圍：WP8 REVIEW_MD_CONTRACT、檔頭、附錄 A、長 ID／名稱 fixture、匯入與完整往返；現有 review 複合鍵斷言不改。
- 狀態：已處理（2026-10-03）；需求方採方案 A（方案 1），附完整機器值、雙引號／Unicode 跳脫、還原欄位白名單、最後末尾區塊、SHA-256 損毀檢查、JSON 上限／嚴格三態／orphan 保存及往返測試限制。見 v1.7、ADR 0023；WP8 可繼續，WP9 未開始。

## OQ-009 — 未指定 project 的元件庫匯入與選用範圍

- 情境：WP9.2 指定 library import <manifest> [--project <name>]，但未定義省略 --project 時是否只儲存、或同時成為工作區所有未綁定專案的預設元件庫。最新決定要求單一 HTML 只嵌入被選用的一份，但沒有選用預設；第 9 節沒有對應解讀。現有 WorkspaceSettings 沒有元件庫選用設定，CLI analyze 與 report 亦無 library 參數。兩種行為會產生不同 HTML／md，不能自行選擇。
- 可選方案 A：省略 --project 僅驗證並儲存 manifest，不自動選用；library import <manifest> --project <name> 明確綁定該專案唯一元件庫。未綁定專案維持 none。library list 列儲存項目與專案綁定。
- 可選方案 B：省略 --project 的匯入同時設為工作區預設元件庫；未明確綁定的專案採此預設，專案明確綁定優先。library list 列儲存項目、預設與專案綁定。
- 影響範圍：WP9 增量一的 import／list 與工作區儲存契約、HTML 唯一元件庫選用，以及後續 viewer／md 的 component_library；不涉及 WP10。
- 狀態：已處理（2026-10-03）；採方案 A，附明確儲存／綁定提示、解除綁定、內容 SHA-256 定址、同版本衝突 --replace、受影響專案提示、暫存摘要隔離與舊覆寫 orphan。見 v1.9 WP9 與 ADR 0027。

## OQ-010 — 舊元件庫覆寫 orphan 的 md 還原契約

- 情境：OQ-009 要求元件庫摘要改變後，舊覆寫成為 orphan，不得靜默套用。WP9 指定 format_version 2 的 component_overrides 為 screenId → componentId → 元件庫元件 ID，檔頭記目前選用 manifest 的摘要。若 A／B 兩份 manifest 共用同一元件 ID，舊 A 覆寫匯入 B 後必須隔離；再次匯出時若僅保留原 ID 並寫 B 檔頭，還原將無法知道該覆寫原屬 A，可能誤套用。若不輸出舊覆寫，則 md 無法完整還原 orphan。原規格沒有定義這些 orphan 是否要進機器附錄、或允許新增來源摘要欄位。
- 可選方案 A：format_version 2 增加 orphan_component_overrides，列 screenId、componentId、libraryComponentId、manifest_sha256（原來源）。component_overrides 僅包含目前 manifest 的有效覆寫。匯入保留 orphan 並提示，不自動轉為有效覆寫；有有效覆寫或 orphan 覆寫採 v2，兩者皆無維持 v1。機器區仍僅有還原所需 ID／摘要，沿用嚴格跳脫、最後區塊與完整性雜湊；v1 golden 不變。
- 可選方案 B：機器附錄只保存目前 manifest 的有效 component_overrides；舊覆寫僅保留於瀏覽器暫存並在介面／md 正文列 orphan，明確警告 md 不含舊覆寫的還原資料。重新匯入該 md 不還原這些 orphan。
- 影響範圍：增量三的覆寫／localStorage orphan 資料模型，以及增量四的 format_version 2 已知欄位、SHA／匯出匯入往返、REVIEW_STATE_CONTRACT／REVIEW_MD_CONTRACT。WP9 增量一／二已完成並遠端全綠，不涉及 WP10。
- 狀態：已處理（2026-10-03）；採 A，v2 增 orphan_component_overrides，保存 ID／完整小寫來源摘要；有效／orphan 可逆重新分區（含 A/B/A），未知圖 ID 保留、foreign orphan 不套用也不改 API／涵蓋率，正文僅 §7 數量分類。v1 拒絕 v2 欄位；同一模組服務 localStorage／md，SHA 覆蓋新欄位。見 ADR 0029、REVIEW_STATE_CONTRACT／REVIEW_MD_CONTRACT。
