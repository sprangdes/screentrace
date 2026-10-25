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

## OQ-011 — WP12 歧義證據與「需求方畫面不得顯示內部 ID」衝突

- 情境：R2 §0 要求需求方可見畫面不得出現內部 ID；WP12 要求 `evidence` 只在預設收合的「技術細節」中顯示。既有 `details.e2e.mjs` 的「ambiguous behavior details retain every candidate and evidence instead of selecting one」斷言不可修改，點入歧義行為後要求右欄文字包含 `全部候選：ep、unused`。在技術細節保持收合且不顯示 ID 時，此斷言失敗；顯示原文則違反需求方畫面限制。
- 可選方案 A：保留既有斷言；只在使用者主動選取未解析／歧義項目後，自動展開該項目的技術細節，先以可讀資訊顯示全部候選，再顯示證據；沒有可讀資訊時才顯示原始 ID。
- 可選方案 B：嚴格遵守任何需求方可見狀態都不顯示內部 ID，技術細節維持收合；將既有斷言改為驗證中文歧義說明與全部候選數量。此方案違反現有「既有斷言不得修改」規則，需明確授權例外並記錄原因。
- 影響範圍：WP12 行為詳情與技術細節呈現、既有 viewer E2E 斷言；WP13–WP16 暫停，未開始。
- 狀態：已決定（2026-10-04）；需求方採方案 A，WP12 可繼續。
- 決定：預設未選取任何項目時，需求方畫面不得顯示內部 ID、JSON 或英文列舉。只有使用者主動選取 UNRESOLVED／AMBIGUOUS 項目時，才自動展開該項目的技術細節並顯示全部候選與證據；先顯示候選名稱、URL、來源檔與行號，無可讀資訊時才顯示原始 ID。此例外不擴及其他畫面狀態。新增預設右欄不含候選 ID 的測試。

## OQ-012 — WP17 c:set 頁面變數解析與既有邊界斷言衝突

- 情境：R3 WP17.1 明確要求解析同檔、先宣告的 page-scope `<c:set var="url" value="/a"/>`，但既有 `UrlVariableBoundaryTest.cSetCannotDefineOrReassignAnEligibleVariable` 固定斷言 `<c:set var='url' value='/a'/><a href='${url}'>Items</a>` 必須保持 UNRESOLVED。新合成 fixture `fixtures/r3/wp17/cset-url.jsp` 與 `Wp17PageVariableTest` 依 WP17 要求驗證應解析的情境；測試目前按既有行為失敗，實際 target 為 `${pageUrl}`。
- 可選方案 A：保留舊斷言，將 `c:set` 維持 UNRESOLVED，放棄 WP17.1 中 c:set 定義解析；其餘 WP17 項目不受影響。
- 可選方案 B：授權修改既有斷言與其預期，讓符合 page-scope、先宣告、同檔字面值的 c:set 變數解析；重賦值仍保持 UNRESOLVED。
- 影響範圍：WP17 的 c:set 變數解析、既有測試與新合成測試；不涉及 graph schema。
- 狀態：已決定（2026-10-04）；需求方採方案 A。
- 決定：延續 ADR 0005／OQ-002，只支援 `c:url` 與 `spring:url` 的已證明字面 URL 變數；`c:set` 維持 `UNRESOLVED`。R3 WP17.1 中要求解析 `c:set` 的部分取消。新增 `Wp17PageVariableTest` 保留此限制為回歸測試，既有 `UrlVariableBoundaryTest` 斷言不變。

## OQ-013 — WP17 page URL variables declared inside loop scopes

- 情境：PetClinic 的 `ownersList.jsp` 在 `<c:forEach>` 內定義 `ownerUrl`，`ownerDetails.jsp` 在 `<c:forEach>` 內定義 `petUrl`、`visitUrl`，各自於同一迴圈內以 `fn:escapeXml` 使用。R3 §0.3 的 WP17 期望這些 `{ownerId}`／`{petId}` 樣板解析；但 ADR 0005 明定迴圈定義不視為單次賦值，且既有 `UrlVariableBoundaryTest.onlyUsesWithinTheProvenConditionalScopeResolve` 固定斷言同一迴圈內定義／使用的 `c:url` 必須保持 `UNRESOLVED`。PetClinic 的三個連結目前因此維持未解析；其他可證明 URL 已解析。
- 可選方案 A：延續 ADR 0005，所有迴圈內 URL 變數維持 `UNRESOLVED`，接受 WP17 驗收中這三個連結不能解析。
- 可選方案 B：只新增受限的 `spring:url` 例外：同一個可證明的迴圈內、靜態 URL 樣板、使用點位於同一作用域時可解析；`spring:param` 值仍不展開，`{name}` 保留。`c:url` 迴圈行為維持既有測試預期。需修訂 ADR 0005 的邊界，但不修改既有斷言。
- 影響範圍：WP17.1 `spring:url`／`c:url` 變數的迴圈作用域、PetClinic 的 Edit Pet／Add Visit 與 ownersList 導覽；無 schema 變更。
- 狀態：已決定（2026-10-04）；需求方採受限方案 B。
- 決定：僅 `spring:url` 的單次來源定義、無 EL 的靜態樣板、完整定義先於使用且同一可證明迴圈作用域可解析。保留 `{name}`、不展開 param。迴圈外使用、第二次定義、EL 值、可能改寫的 c:set／scriptlet 均保持 UNRESOLVED；c:url 與既有斷言不變。見 ADR 0005 的 R3 例外與 Wp17SpringLoopVariableTest。

- R14 修訂（2026-10-09）：以上 UrlResolution 結果、targetStatus 與既有測試維持不變；新增獨立的路由樣板投影。JSP 的 `spring:url`／`c:url`／`href`／`action` 與 JS 字串常值前綴加動態片段只在路由逐段匹配恰有一個目標時新增 INFERRED 關係；多候選保留全部候選且不建邊，零候選維持 UNRESOLVED。JS context path 只可使用 workspace 設定或專案設定證明的候選；本次 eMusicStore 的 `/eMusicStore` 只有 JS URL 字串前綴證據，沒有 context path 設定，因此不剝除、不推定連到 `/rest/cart`。見 ADR 0067 與 reports/R14.md。


## OQ-014 — WP19／WP20 呈現規則與既有 E2E 斷言衝突

- 情境：R3 WP19.1 要求 title／h1 僅在全部畫面中唯一時採用，同 title 改用唯一 h1 或人性化 view 名；WP19.2 要求卡片不再顯示完整來源路徑。既有 `screentrace-viewer/test/diagnostics.e2e.mjs` 的 `navigation prioritizes page titles, groups Chinese diagnostics, and masks JSP expressions in preview` 明確要求兩張同 title 卡片仍含 `帳戶維護.*web/a.jsp` 與 `帳戶維護.*web/b.jsp`。保留這兩個斷言與實作新命名規則不能同時成立。
- 同檔 `graph and preview diagnostics retain source and unsafe text without execution` 在展開診斷前要求 `.analysis-diagnostics` 的可見文字含 `UNSUPPORTED_FRAMEWORK`；WP20.1 要求收合時呈現中文診斷摘要，英文代碼只放明細技術欄位。這個既有可見文字斷言也與新規則衝突。
- 可選方案 A：授權只更新上述直接鎖定被取代呈現方式的斷言，改為驗證新規格：同 title 使用唯一 h1／人性化 view 名，卡片不含來源路徑；收合診斷中文顯示，展開技術明細後完整英文代碼仍可查。其餘既有斷言、fixture、golden 與證據／安全測試不改。於 ADR 逐處記錄原因，另加全同名／部分重複／全唯一測試。
- 可選方案 B：保持所有既有斷言，將 WP19 的同名 title／來源路徑與 WP20 收合英文代碼需求取消或修訂為保留舊行為；其他 WP19／WP20 項目維持。
- 影響範圍：WP19 命名／卡片，WP20 診斷摘要；無 schema 變更，不涉及分析 URL／導向信心。G9／G10 尚未實作，未修改目標專案。
- 狀態：已決定（2026-10-04）；需求方採受限方案 A。只更新 diagnostics.e2e.mjs 所列三處斷言，其餘既有斷言／fixture／golden／證據與安全測試不動。新斷言須在舊實作證明失敗，新增三種命名測試，ADR 逐處記錄。繼續 WP19 → WP20（含 G9／G10）。

## OQ-015 — R4 UI3 的 tag-body 可見名稱缺少可證明的元件對應

- 情境：PetClinic 唯讀報表實測，menuitem 預覽含 `Home`／`Find owners`，但這些元素的 graphComponentId 為 null、graphComponentCandidates 為空、componentResolution 為 UNRESOLVED；title 已變為範例值 `Title`。圖上的 `home page`／`find owners` 元件僅有 title 與 URL，來源為共用展開位置，tag 呼叫／定義證據不能區分四個導覽元素。viewer 對已有確切 ID 或 preview record 對應的項目已落實可見文字優先；不能以文字相似度、DOM 順序或專案硬編碼把這批項目猜配。
- 方案 A：維持 R4 的 viewer／模板範圍，這批無法對應的導覽元件暫用圖中 title；明確記錄 UI3 的此項未完成，另立後續分析／capture 補強。
- 方案 B：授權最小的 analyzer／capture 來源對應補強，保留展開後的可見文字或確切元件對應；先加合成 tag-body 失敗測試，不變更 URL、信心、schema、決策或既有資料／安全斷言，再驗證 PetClinic 真實標籤。
- 影響範圍：只暫停 UI3 中尚缺確切對應的 tag-body 名稱；UI2 與其餘 UI3／UI4 可驗證的呈現保持，UI4 的 API 主從頁繼續驗證。不得改目標來源。
- 狀態：已決定（2026-10-04），採方案 A。維持 R4 範圍，缺少確切對應的導覽元件暫用圖中 title；UI3 此項「未完成，另案處理」。不改分析器或 capture、不猜配可見文字；技術債記錄於 ROADMAP 與 R4 回報。

## OQ-016 — R5 跨輸出目錄的預覽樣式決定性

- 情境：同一 Petclinic 原始碼在同一 Chromium 環境產生兩次，僅變更分析輸出目錄。application-graph.json 與 viewer-documents.json 位元組一致；preview-model.json 與單一 HTML 不一致。差異為 logo 的 computed background-image 保存輸出目錄的 file:// 絕對 URL，兩個 styleId 因而不同。此為既有 capture／報表資料路徑，WP21、WP22 沒有修改它。eMusic 的兩次圖、preview、documents 與 HTML 均一致。
- 約束：C3 要求同來源圖／HTML／md 決定性；WP22 只改呈現層，不改 md、分析 graph 或樣式原文契約；現有 capture 測試要求 computed style lossless roundtrip。不能藉修改既有斷言或忽略差異宣稱通過。
- 方案 A：授權先新增合成失敗測試，只在報表資料讀取層正規化本地資源 URL 與其樣式識別，保留原始 capture、既有全部斷言、無新增 schema 欄位。補足跨目錄決定性後再結案 R5。
- 方案 B：本輪只交付 WP21、WP22 的名稱／分群／措辭，將既有跨輸出目錄決定性缺陷列技術債，明確豁免這項本輪验收；仍不進 WP23，等待需求方驗收。
- 影響範圍：R5 最終決定性驗收；WP21 名稱與 WP22 分群實作、全部測試、真實報表觀察及大小驗證已完成。未改 capture 或樣式保存程式。
- 狀態：已決定；需求方採方案 1（補強）。先提交合成失敗測試，只在報表資料讀取層正規化本地資源 URL，原始 capture、分析器、graph schema、既有斷言與 golden 不變。最終 HTML 掃描實際輸出／專案／家目錄，以及 file://、/Users/、C:\Users\；其他路徑洩漏一併修正，必須保留絕對路徑時另提 OQ。重跑完整驗證、記錄影響檔案與報表大小，WP21／WP22 完成後停止驗收。
- 執行：見 ADR 0047 與 reports/R5.md。新增失敗測試 e6f1bcf，讀取層補強後合成與兩個真實專案跨目錄輸出一致。沒有其他必須保留絕對路徑的欄位。


## OQ-017 — R7 同行錨點序號的「同類標記」分組規則

- 情境：R7 §1 要求同一行多個「同類標記」加 `#1`／`#2`，但未定義「同類」依原始標籤名稱還是圖元件 kind 分組。兩者對混合語法會產生不同錨點：同一行的 `<a href="/a">A</a><html:link page="/b">B</html:link>` 是兩種原始標籤、同一 LINK kind；`<input type="text"><input type="checkbox">` 是同一原始標籤、兩種 kind。自訂 tag 呼叫本身也需序號以區別同行多次呼叫，但尚未展開前沒有元件 kind。此規則會成為 Java／capture 共用向量與資料契約，不能由任一端自行解讀。
- 可選方案 A：以原始完整標籤名稱（含命名空間前綴、大小寫正規化）及來源行號分組；同組多於一個開啟標籤時，全組依原始來源順序標 `#1`、`#2`，單一標籤不加序號。自訂 tag 呼叫也使用此規則；關閉標籤、註解、EL／scriptlet 中的文字不參與計數。不同標籤但相同 kind 不併組；同標籤但不同 kind 仍併組。Java／capture 在展開與原生控制項轉換之前計數。
- 可選方案 B：可建立元件的標記依圖元件 kind 與來源行號分組；自訂 tag 呼叫另依完整標籤名稱分組。須另界定 kind 在屬性替換之前或之後判定，以及動態屬性不能證明 kind 時的序號規則。
- 影響範圍：WP27 錨點產生與同行測試、WP28 共用向量及精確配對；沒有變更 graph schema、元件 ID、既有測試或目標專案。WP29 未開始。
- 狀態：已決定（2026-10-05）；需求方採方案 A。分組鍵為轉小寫的完整標籤名稱與原始開啟 `<` 的行號；CRLF／LF 一致，同行多個開啟標籤全組加序號，單一不加。排除關閉標籤、HTML／JSP 註解、CDATA、scriptlet 與 EL 文字；自閉合／成對標籤與自訂 tag 採同規則，展開／原生轉換前計數。Java／Node 共用向量鎖定全部邊界，WP27／WP28 完成後停止。


## OQ-018 — WP29 未對應原因與已對應但無法模擬的覆蓋率分類

- 情境：WP27／WP28 驗收後，需求方要求逐項解釋 petclinic 的 19 個「無法確認」。實查 19 個全部為 ANCHOR、INFERRED 的唯一元件對應，沒有元件未對應者。11 個沒有行為記錄（9 個導覽列按鈕、2 個隱藏欄位）；另外 8 個有行為記錄，但未被目前 simulate／canSimulate 的單元素覆蓋率判定支援（6 個送出按鈕、2 個導覽連結）。eMusic 的 87 個「無法確認」亦全部已有元件對應，72 個無行為記錄、15 個有行為但未能模擬。不能把它們誤標為 NO_GRAPH_COMPONENT 或 ANCHOR_MISSING。
- 文件界線：R7 WP29 第 1 點的 unmappedReason 僅定義給「可操作但未對應」元素，列舉 NO_GRAPH_COMPONENT、AMBIGUOUS_CANDIDATES、ANCHOR_MISSING、DYNAMIC_OR_UNRESOLVED_SOURCE、OTHER。其中 AMBIGUOUS_CANDIDATES 是元件配對的多候選；本次部分送出按鈕是行為／端點多候選，元件本身是唯一對應，兩者不能混淆。需求方補充的「沒有已知的行為」中文說明未明定是否另增覆蓋率分類或擴充 unmappedReason。
- 可選方案 A（建議）：保留 unmappedReason 的五個列舉與「未對應元件」語意；viewer 另外推導已對應但無法模擬的覆蓋率原因，不寫入 unmappedReason。至少區分「沒有已知的行為」與「已記錄行為，但無法確認可模擬的結果」；可在後者說明行為歧義／未解析。畫面與全專案分類統計合併呈現兩層原因，需求方只看到中文。19／87 數字與既有模擬、圖、API、review、md 規則保持。OTHER／ANCHOR_MISSING 的零要求仍針對元件未對應分類，另完整揭露已對應的覆蓋率原因，不能把不適用當成已驗證為零。
- 可選方案 B：將 unmappedReason 擴充為所有「無法確認」元素的原因欄位，新增 NO_KNOWN_BEHAVIOR 與 UNRESOLVED_BEHAVIOR（或需求方指定名稱）。需明確修訂 R7 的欄位適用範圍與列舉，避免已對應元件被誤視為配對失敗。
- 影響範圍：WP29 預覽契約、分類統計與點選說明。未修改任何程式碼、既有斷言、圖或模擬規則。19 個元素與 eMusic 暴露缺口已記入 reports/R7.md，兩份 tag 展開器技術債保留於 ROADMAP。
- 狀態：已決定（2026-10-05）；需求方採方案 A。unmappedReason 維持五類，僅用於元件未對應；另以 simulate／canSimulate 共用判定推導已對應但無法模擬的原因（沒有已知的行為，附註可能由頁面腳本控制；行為有歧義、目的未解析、行為類型不支援模擬）。畫面／全專案分類加總必須等於無法確認總數，中文兩層呈現並同步點選說明；真實專案未對應數據按適用範圍揭露，不把不適用寫成已驗證零。完成 WP29 後停止驗收。

## OQ-019 — 表單委派一致性修正與既有覆蓋率數字斷言

- 情境：submit 控制項實際點擊時會委派至其 associated form，但舊覆蓋率只對 button/input 本身做判定，造成覆蓋率與操作結果不一致。
- 狀態：已決定（2026-10-05）；需求方採方案 A。只授權更新 `screentrace-viewer/test/wp26-simulation.e2e.mjs` 與 `screentrace-viewer/test/wp26-feedback.e2e.mjs` 中各一處覆蓋率數字斷言，5／3／5 改為 6／3／4；其他既有斷言、fixture、golden、安全、證據、決策、API 與 md 規則不變。
- 實作界線：元素操作、覆蓋率與原因分類使用同一元素模擬入口；submit button、submit input 與 image input 依 DOM 的 form 關聯委派至表單。模擬結果本身攜帶可模擬狀態與原因，`canSimulate` 僅讀取該結果，不另行判定行為類型或事件，不含專案／元素類型例外。
- 舊實作反證：更新後的兩個 E2E 斷言在舊 viewer bundle 上皆收到 5／3／5 而失敗；更新 bundle 後同兩項皆通過。WP29 五個 family／合成 fixture 遍歷測試亦從舊實作 5 項全失敗轉為 5 項全通過。
- 結果：petclinic Find Owner 與 Add Visit 的表單提交從「類型或事件不支援」移至有圖支持行為；全專案覆蓋率由 55／85、19 無法確認更新為 57／85、17 無法確認。eMusic 前後維持 28／128、87 無法確認，類型或事件不支援為 0。見 `docs/reports/R7.md` 與 ADR 0056。

## OQ-020 — 功能區域規則產生多個單畫面區域

- 情境：需求方要求整個專案只使用一種功能區域依據，並要求減少單畫面區域、提供切換及易讀名稱。
- 決定：已決定（2026-10-05）。依據選項為網址前段、控制器類別、JSP 所在目錄。預設選擇單畫面區域數最少的依據；平手順序為網址前段、控制器、JSP 目錄。介面提供切換並標明依據。分組由單一決定性純函式完成，技術後綴須移除並將名稱人性化。
- R14 修訂（2026-10-09）：產生區域數為 1 的依據不得成為預設，除非網址前段、控制器類別與 JSP 目錄三種依據都只產生 1 個區域。其他排序、切換與命名規則不變；viewer 實作屬 WP45，本次未開始。
- 範圍：viewer 分組與呈現，不改 Application Graph、分析結果、API 推導或 review state。PetClinic 與 eMusicStore 的選擇依據及各區域畫面數記入 R10 實際報告。
- 舊規格：WP35 原先先依控制器／Action 分組，再按 URL 退補；因此出現 PetClinic 五個及 eMusicStore 三個單畫面區域。此分組假設由本決定取代。

## OQ-021 — 只經由轉址到達的路由

- 情境：`GET /cart/{cartId}` 只有由 `ANY /cart/` 的 handler 轉址到達；`/cart/` 本身有來自 View Product「View cart」的呼叫來源。依現行 R-API-1，`GET /cart/{cartId}` 沒有直接畫面或元件呼叫來源，會顯示為「找不到呼叫來源」，但使用者仍可經由轉址流程到達。
- 可選方案 A：把可證明的轉址鏈視為推定呼叫來源，將來源畫面／元件沿轉址關係傳遞到目的路由，信心為 INFERRED。需在 Java 與 TypeScript 共用 API 向量加入只有轉址繼承來源、來源被移除、轉址鏈多候選等案例；兩端皆須對 `GET /cart/{cartId}` 得到相同 caller 與狀態。若來源決策為移除，依既有 R-API-2／3 規則重新推導目的 API 狀態。
- 可選方案 B：維持 R-API 現狀，不將轉址來源繼承為 API caller；`GET /cart/{cartId}` 仍為 UNREFERENCED，僅在畫面或 API 詳情標示「由轉址到達」。新增的雙端向量只鎖定目前直接來源規則，轉址關係不改變 API 狀態。
- 影響範圍：R-API-1～6 的 caller 定義、Java `ApiUsage`、TypeScript `deriveApiUsage`、共用 `docs/examples/api-usage-vectors.json`、API 詳情的轉址提示。不得把僅可到達的路由自行升為 IN_USE。
- 狀態：已決定（2026-10-09）；需求方採方案 A，限制如下。
- 決定：只有可證明且**唯一**的轉址／forward 目的地（handler 回傳常值 `redirect:`／`forward:` 或既有 INFERRED 路由樣板唯一命中）才繼承轉址來源端點的全部呼叫來源，confidence 一律 INFERRED，證據記錄完整轉址鏈（每一跳的 handler、檔案與行號）。目的地 AMBIGUOUS 或 UNRESOLVED → 不繼承，記診斷。鏈長上限 5，偵測循環並記診斷。來源被標移除時依 R-API-2／3 重新推導。Java `ApiUsage` 與 TypeScript `deriveApiUsage` 同步，共用向量新增：只有轉址繼承來源、來源全被移除→REMOVABLE、目的地多候選不繼承、循環、鏈長超限。不得因「可到達」而把沒有任何來源鏈的路由升為 IN_USE。

## OQ-022 — WP44 JavaScript 路徑佔位符與既有斷言範圍

- 情境：WP44 補正 A2 要求任何無法靜態取得的 URL 路徑段輸出 `{?}`。現有 `screentrace-js/test/tracing.test.mjs` 的 `$http verb methods and configuration objects retain static route templates` 固定斷言 `/rest/cart/{cartId}` 與 `/rest/cart/add/{productId}`；這些值在該 fixture 中同樣無法靜態取得，依 A2 必須改為 `{?}`。另有既有測試將 tainted 路徑斷言為 `url === null`，也可能與顯示路徑佔位符的範圍衝突。
- 可選方案 A：維持既有斷言不變，因此 A2 不改變這些已鎖定的 JS analyzer 輸出；A2 僅新增於明確授權的新輸出介面（需另定義其與既有 `behavior.url` 的邊界），否則無法達到「不得出現運算式原文」的要求。
- 可選方案 B：授權只更新上述直接鎖定 URL 描述格式的斷言，將未知路徑段與 tainted path 預期改為 `{?}`（或明確指定全 URL 無法取得時的表示）；其他測試與斷言維持不變。此範圍不屬 R14 §2.4 預先授權的 API 狀態／入口數量 golden 變更。
- 影響範圍：`screentrace-js` 的 CALL_API `url` 欄位、Java graph projection 的 endpoint path、路由樣板比對、A2 新增測試與 ADR 0010。未決定前不實作 A2。
- 狀態：已決定（2026-10-09）；需求方不採 A、B，採方案 C。
- 決定（方案 C）：既有佔位符慣例不是捏造，維持不變，既有斷言一律不改——未知識別字段為 `{識別字名}`（INFERRED），整段網址無法取得時 `url === null`（UNRESOLVED），計算屬性 `obj[key]` 維持 UNRESOLVED。A2 縮小為：(1) 任何無法靜態取得的值不得序列化為字面 `null`／`undefined` 路徑段；函式參數比照未知識別字輸出 `{參數名}`。(2) 非計算的屬性存取（如 `$scope.cartId`、`item.product.productId`）輸出 `{最後一個屬性名}`（如 `{cartId}`、`{productId}`），不得把運算式原文放進路徑；原文只放 evidence。(3) JS analyzer 的 `behavior.url` 與 Java graph 投影出的 endpoint path 必須一致。新增測試只增不改。

## OQ-023 — WP51 轉址分類標籤與既有 E2E 斷言衝突

- 情境：R15 WP51 要求方法徽章依 HTTP method 顯示（`ANY` 顯示「任何方法」，tooltip 保留 `ANY`），並將分類 `REDIRECT` 顯示為「轉址」、tooltip 保留 `REDIRECT`。現有 `screentrace-viewer/test/r14-redirect-category-label.e2e.mjs` 對 `category=REDIRECT`、`method=ANY` 的列，卻從 `[data-method]` 方法徽章斷言文字為「轉址」。依 WP51 新規格，該方法徽章應為「任何方法」，「轉址」應由分類標籤呈現；保留該既有斷言與新規格不能同時成立。
- 可選方案 A：維持既有斷言與目前畫面行為，取消 WP51 對 `ANY`／`REDIRECT` 列方法徽章的修正；分類仍須避免向使用者顯示原始 `REDIRECT`。
- 可選方案 B：授權只將既有 E2E 的 selector 從 `[data-method]` 改為分類標籤 selector，保留「轉址」文字與 tooltip `REDIRECT` 的斷言內容；方法徽章另以 WP51 新測試驗證為「任何方法」並以 tooltip 保留 `ANY`。其他既有斷言不變。
- 影響範圍：WP51 API 清單的 `ANY` 方法徽章與 `REDIRECT` 分類標籤；不改分析資料、API 狀態或 graph。
- 狀態：已決定（2026-10-09）；需求方採方案 B。
- 決定：`r14-redirect-category-label.e2e.mjs` 的該斷言是 R14 結案收尾時為錯誤呈現位置所寫，授權只將其 selector 由 `[data-method]` 改為分類標籤 selector，斷言內容（「轉址」文字、tooltip `REDIRECT`）不變；方法徽章由 WP51 新測試驗證為「任何方法」（tooltip `ANY`）。在 ADR 依 R14 §2.4 格式記錄。其他既有斷言不變。

## OQ-024 — Struts action mapping 與 servlet URL 的 endpoint 身分

- 情境：官方 Struts 1 範例在 `web.xml` 以 `*.do` 映射 ActionServlet；JSP 的 `html:form action="/SubmitLogon"` 與 action mapping `/SubmitLogon` 使用不含副檔名的邏輯 path。ScreenTrace 目前同時輸出 `/SubmitLogon` 與 `/SubmitLogon.do`，把前者列為使用中、後者列為找不到來源。Cookbook 有 24 組成對路徑，EL 範例 10 組；因此畫面與 API 清單會重複計數。
- 可選方案 A：以 servlet mapping 展開後的公開 URL 作為單一 endpoint（例如 `/SubmitLogon.do`），把 JSP 邏輯 action path 的來源關聯到該 endpoint。
- 可選方案 B：同時保留邏輯 path 與公開 URL，但明確表示為同一 endpoint 的別名，統計只計一次、呼叫來源共用。
- 可選方案 C：保留目前兩筆 endpoint，各自呈現與推導狀態。
- 影響範圍：Struts route 解析、JSP form/link 對應、API 狀態與 API 清單統計；不涉及 Spring URL 規則。
- 狀態：已決定（2026-10-09）；需求方採方案 B，並補充：
- 決定：邏輯 action path 與依 `web.xml` servlet mapping 展開的公開 URL 是**同一個 endpoint 的別名**，統計只計一次、呼叫來源共用。介面與搜尋以**公開 URL**（例如 `/SubmitLogon.do`）為主要顯示，邏輯 path 列為別名；以任一形式搜尋都能找到。forward／redirect 的 `path` 若寫成公開 URL（例如 `path="/MainMenu.do"`），必須依同一份 servlet mapping 正規化回 action path，再沿該 action 的 forward 找到畫面。servlet mapping 不可證明（缺 `web.xml`、多個候選）時，不猜測副檔名，維持兩者分開並記診斷。

## OQ-025 — Tiles layout/fragment 是否為可確認畫面

- 情境：Struts Tiles 範例的 `.base`、`.loggedoff`、`.loggedon` definition 組成多個實際頁面；其 `header`、`footer`、`menu`、`body` JSP 是頁面片段。ScreenTrace 將部分 definition、layout 與 fragment 都列成獨立 screen，Faces 2 從 16 個 JSP 得到 25 個 screen。
- 可選方案 A：只有被 action forward 到的完整 page definition 是 screen；layout 與 fragment 作為 screen 的組成證據。
- 可選方案 B：所有 Tiles definition 都列為 screen，包括可重用 layout；JSP fragment 仍不單列。
- 可選方案 C：每個 JSP 與 Tiles definition 都保留為 screen，並在 UI 明確標出「版型／片段」類型。
- 影響範圍：Tiles adapter、screen count、入口分類、縮圖與功能地圖。
- 狀態：已決定（2026-10-09）；需求方採方案 A。
- 決定：只有被 action forward（或 global forward）指向的 Tiles definition，以及被直接 forward 的完整 JSP，才是畫面。只作為版型（被其他 definition `extends`）或只被 `put`／`insert` 的 JSP 是組成證據，不列為畫面；其中的按鈕依 R14 WP46 第 3 點歸入「頁首、頁尾的按鈕」類型的片段群組（群組名稱取片段檔名或 put 名稱）。畫面名稱取 definition 的 title put 值（若為常值）或主體 JSP 的可讀名稱，不顯示 `.base` 之類 definition 名。沒有任何 forward 指向的 page definition 依入口分類規則處理（可能為「完全找不到入口」）。

## OQ-026 — Struts + JSF 混合應用的元件支援範圍

- 情境：Struts 1.3.10 官方 `faces-example1`／`faces-example2` 同時配置 `*.faces` FacesServlet 與 `*.do` ActionServlet。表單、導覽與按鈕主要使用 `<h:form>`、`<h:commandLink>`、`<h:commandButton>`，ScreenTrace 目前主要解析 Struts `html:*` tag，因而多數 action 呼叫列為找不到來源。
- 可選方案 A：將 JSF tag 支援納入 Struts 1 範圍，解析可靜態證明的 navigation outcome 與 action binding；其他 JSF 執行期語義維持 UNRESOLVED。
- 可選方案 B：Struts 支援僅限 Struts HTML/JSP tags；JSF 混合模組明確標示部分不支援，不把 JSF 元件列為已分析。
- 可選方案 C：先保留現況，待有獨立 JSF adapter 工作包時再決定。
- 影響範圍：JSP 元件掃描、`*.faces` URL mapping、JSF navigation/action 與 Struts endpoint caller 對應；不改動目標專案。
- 狀態：已決定（2026-10-09）；需求方採方案 B。
- 決定：JSF 不在 REQUIREMENTS §1 的支援框架內，本階段不解析 JSF 元件。偵測到 FacesServlet 或 JSF taglib 時：輸出診斷 `UNSUPPORTED_COMPONENT_FRAMEWORK`（含檔名與行號）；報表首頁在「可能已經沒在用」上方顯示提醒（同 `CONTEXT_PATH_HINT` 的位置與樣式）：「這個專案有 N 個畫面使用 JSF 元件，ScreenTrace 不分析 JSF，相關畫面的按鈕與 API 呼叫來源可能漏列，請勿只憑本報告判定可移除」；使用 JSF 元件的畫面在逐頁確認的判斷依據中顯示同一提醒；md §8 分析限制列出這些畫面。JSF 元件不得被計為「知道會做什麼」或標成已解析。

## OQ-027 — Struts URL 別名合併後的呼叫信心斷言

- 情境：WP54 依 OQ-024 方案 B，把 Struts action 邏輯路徑與已證明的 servlet 公開 URL 合併為一個 endpoint。`UrlLinkingTest.actionsReceiveApiAndFormCallersWithAllExtensionCandidates` 原本將 `/save` 與 `/save.do` 視為兩個 endpoint，並要求 `CALLS` 關係對兩個候選都標 `AMBIGUOUS`。合併後兩個 URL 形式只對應一個 endpoint，因此新分析結果不再符合該既有信心斷言。
- 可選方案 A：授權只更新此測試中直接受別名合併影響的預期：一個 endpoint 身分、一筆對應呼叫來源，並依已證明 servlet mapping 使用 `CONFIRMED`；其餘測試斷言不變。此項超出 R16 §3 的數量型期望預先授權。
- 可選方案 B：保留既有 `AMBIGUOUS` 呼叫信心，即使兩種 URL 形式已合併為一個 endpoint；需接受 endpoint 身分唯一、呼叫信心仍標歧義的表示。
- 影響範圍：Struts endpoint alias resolution、JS URL 對應 confidence、`UrlLinkingTest.actionsReceiveApiAndFormCallersWithAllExtensionCandidates`。不影響 Spring routes。
- 狀態：已決定（2026-10-09）；需求方不採 A、B，採方案 C。
- 決定：該測試原 fixture 的 `web.xml` 只有名為 `action` 的 `servlet-mapping`，沒有宣告該 servlet 為 `org.apache.struts.action.ActionServlet`，依 OQ-024「servlet mapping 不可證明時不猜測、維持兩者分開並記診斷」，原斷言（兩個 endpoint、`CALLS` 皆為 `AMBIGUOUS`）在新規則下**仍是正確預期**。WP54 未提交修改中替該 fixture 補上 `<servlet-class>` 屬於變更既有測試前提，**必須還原**；`UrlLinkingTest.actionsReceiveApiAndFormCallersWithAllExtensionCandidates` 的 fixture 與斷言一律不改。另**新增**一個測試：同樣情境但 `web.xml` 完整宣告 ActionServlet 與 `*.do` mapping，預期合併為單一 endpoint、別名含 `/save` 與 `/save.do`、`CALLS` 為 `CONFIRMED`、並產生「mapping 已證明」的證據。若還原 fixture 後既有測試失敗，代表實作在 mapping 不可證明時仍做了合併，須修正實作而非測試。此原則同樣適用於 R16 其他既有測試：不得以修改既有 fixture 的方式繞過斷言。審查者檢視 WP54 未提交修改，另有三處同類變更**一併還原**：`StrutsCompletenessTest.base()` 新增的 `web.xml`、`StrutsCompletenessTest.respectsMultipleModulesDeclaredByWebXml` 中替 `<servlet>` 補上的 `servlet-name`／`servlet-class` 與 `servlet-mapping`、`StrutsProjectAnalyzerTest` 新增的 `web.xml`。
- 補充規則：servlet mapping **可證明**（`web.xml` 宣告 `servlet-class` 為 ActionServlet〔或其子類別，需有原始碼證據〕且有對應 `servlet-mapping`）→ 依 OQ-024 合併別名、`CONFIRMED`。**不可證明**（缺 `web.xml`、缺 servlet 宣告、缺 mapping、多個候選）→ 行為與 R16 之前**完全相同**（既有的副檔名候選、端點命名如 `ANY /admin/edit.do`、`AMBIGUOUS` 信心皆不變），另加一則「servlet mapping 未證明」診斷。因此上述既有測試在原 fixture 下應全部通過；新增「可證明」情境的測試覆蓋合併行為。

## OQ-028 — OQ-027 與先前新增 Struts 合成測試的預期衝突

- 情境：OQ-027 方案 C 要求 mapping 缺少證據或有多個候選時，完全維持 R16 前的副檔名候選與信心；但先前 WP54 新增的 `StrutsR16RoutingTest.ambiguousActionServletMappingsDoNotGuessAnEndpointAlias` 斷言多候選只產生一個 endpoint，`missingServletMappingKeepsLogicalAndLiteralPublicTargetsSeparate` 斷言 `/save.do` endpoint 為 `UNRESOLVED`。依方案 C，前者應保留 `/save` 與 `/save.do` 兩個 endpoint，後者應沿用舊別名候選信心。還原所有舊 fixture 後，原有 `StrutsCompletenessTest`、`StrutsProjectAnalyzerTest` 與 `UrlLinkingTest` 已通過；上述兩個 R16 合成測試仍失敗。沒有修改既有 fixture 或斷言。
- 可選方案 A：授權只更新上述兩個 R16 新增測試的斷言，使其鎖定方案 C 的舊行為；保留 fixture 不變，並繼續補上同一情境的 mapping 未證明診斷測試。原有基線測試完全不動。
- 可選方案 B：保留這兩個測試目前的斷言，並修訂 OQ-027 方案 C，明確允許多候選只產生一個 endpoint，以及缺少 mapping 時將公開 URL 留為 `UNRESOLVED`；這會使該兩種情境不再符合「與 R16 之前完全相同」。
- 影響範圍：WP54 的 servlet mapping 未證明／歧義輸出與新增合成測試。WP54 未完成；WP55 尚未開始。
- 狀態：已決定（2026-10-09）；需求方採方案 A。
- 決定：`StrutsR16RoutingTest.ambiguousActionServletMappingsDoNotGuessAnEndpointAlias` 與 `missingServletMappingKeepsLogicalAndLiteralPublicTargetsSeparate` 是 R16 失敗測試提交（`f655446`）新增、早於 OQ-027 決定的測試，不屬於 R16 前的基線；授權更新其斷言以鎖定 OQ-027 方案 C（不可證明時與 R16 前行為相同），fixture 不變，並補上同情境的「servlet mapping 未證明」診斷斷言。在 ADR 記錄測試名稱、舊預期、新預期與原因。
- 一般授權（R16 期間有效）：**R16 自 `f655446` 起新增的測試**，若與需求方之後的 OQ 決定衝突，可直接更新其斷言以符合決定並記入 ADR，不需停止；R16 前已存在的測試與 fixture 仍一律不得修改（OQ-027）。

## OQ-029 — Tiles 畫面收斂與既有行為摘要 golden 衝突

- 情境：WP55 依 OQ-025 只保留有明確入口的 Tiles 畫面，並移除未導向的版型／片段畫面。對既有 `fixtures/wp10/struts1` 合成專案，這使畫面數由 golden 的 6 降為 1；現有分析輸出也使行為摘要數量下降。完整預設並行 E2E 的 `real source fixtures produce identical graph, packed HTML and shared-module md on consecutive runs` 因 `struts1.first.behaviors_by_type.CALL_API` 失敗：預期 49、實際 28。其餘可見差異為 NAVIGATE 12→7、OPEN_DIALOG 28→22、SUBMIT_FORM 10→9、UI_STATE_CHANGE 20→11、UNKNOWN 25→20、VALIDATE 26→19；SELECT_CHANGE 維持 2。元件種類、API 總數與狀態分布、檢核規則數未在此測試的首個差異前顯示不一致。這些行為數欄位屬於 R16 前已有的 WP10 golden，不在 R16 §2.4 預先授權修改欄位內；不得為了讓 E2E 通過而自行改 golden 或放寬斷言。
- 可選方案 A：授權只更新 `fixtures/wp10/golden/struts1.summary.json` 中上述七個 `behaviors_by_type` 欄位為實際輸出值，維持畫面數、其他欄位及其他 fixture golden 不變；在 ADR 逐處記錄舊值、新值、原因，並證明新期望在 WP55 前的實作上失敗。
- 可選方案 B：不改既有 golden；要求 WP55 在移除未導向 Tiles 畫面的同時，保留這些畫面先前貢獻的全部行為數。需明確指定已移除畫面的行為應如何歸屬或呈現，避免以不存在的畫面作為行為來源或產生重複行為。
- 影響範圍：WP55 的 Tiles 畫面與片段行為歸屬、`synthetic-project.e2e.mjs` 的逐欄 golden 比對，以及 R16 完整驗證停止條件。WP54/WP55 完成報告與八模組最終對照尚未產生；目前沒有修改 WP10 golden 或任何 R16 前測試／fixture。
- 狀態：已決定（2026-10-10）；需求方不採 A、B，採方案 C（先修正規則，再更新 golden）。
- 審查者判讀：`fixtures/wp10/struts1` 的 Tiles 定義為 `base`（path `layout.jsp`，put body `page.jsp`）、`child extends base`、`nested`（path `page.jsp`）、`outer extends child`（put-attribute `nested`）；所有 action 都直接 forward 到 `page.jsp`。依 OQ-025：`base`、`child` 被 `extends` → 版型；`nested` 只被 put → 片段；`layout.jsp` 為 definition path → 組成證據。**`outer` 未被 extends、未被 put，是完整頁面定義，只是沒有 forward 指向**，OQ-025 明定此類「依入口分類規則處理（可能為『完全找不到入口』）」，即**必須保留為畫面**。目前實作把它一併移除，結果 6 → 1，並使 `layout.jsp` 的行為消失；這違反 OQ-025，也違反產品目的——沒有入口的畫面正是需求方要找的候選，不得從報表消失。
- 決定：
  1. **畫面界線規則（明確化 OQ-025）**：Tiles definition 若被任何 definition `extends`，或只以 `put`／`put-attribute`／`insert` 被引用，屬版型或片段，不是畫面；其餘 definition 是**頁面定義**，一律是畫面（有 forward 指向者依入口分類為有入口，沒有者為「完全找不到入口」或依其他入口證據分類）。非 Tiles 的 JSP 畫面維持 R16 前規則，**不因沒有入口而移除**。版型／片段 JSP 的元件與行為歸入引用它們的頁面定義畫面（R14 WP46 片段群組）；若某版型或片段沒有任何頁面定義引用，則保留為畫面並標「完全找不到入口」，不得丟棄。
  2. 依此規則，`fixtures/wp10/struts1` 預期畫面為 `page.jsp`（有入口）與 `outer`（完全找不到入口），共 2 個；若實際不同，報告逐一說明。
  3. **行為不得遺失（新增不變量測試）**：對 `fixtures/wp10/struts1`，WP55 前輸出中每個行為的來源（檔案、行號、行為類型）集合，必須是 WP55 後輸出來源集合的子集；只允許因版型／片段不再重複列於多個畫面而**去重**。以單元或 E2E 測試鎖定此不變量。
  4. 完成 1–3 後，授權更新 `fixtures/wp10/golden/struts1.summary.json` 的 `screens` 與 `behaviors_by_type` 欄位為修正後實際輸出值（其他欄位與其他 golden 不變）。ADR 逐欄記錄舊值、新值，並以「移除的版型／片段畫面 → 去重的行為來源」對照表說明每個差異，證明沒有來源遺失，以及新期望在 WP55 前實作上失敗。
  5. 原則：R16 期間任何改動不得讓「沒有入口」的畫面或其行為從報表消失；「沒有入口」是要呈現給需求方的結論，不是刪除理由。

## OQ-030 — WP10 Struts golden 與 OQ-027 mapping 診斷新增項目衝突

- 情境：WP55 完成後，預設並行 E2E 的 `synthetic-project.e2e.mjs` 有 1 項失敗：`real source fixtures produce identical graph, packed HTML and shared-module md on consecutive runs`。`fixtures/wp10/struts1` 的 `web.xml` 宣告一個 ActionServlet，並有 `*.do`、`*.action` 兩個 servlet mapping；依 OQ-027「多個候選」規則，圖新增 `STRUTS_SERVLET_MAPPING_AMBIGUOUS` 與 `STRUTS_SERVLET_MAPPING_UNRESOLVED` 診斷。`struts1.summary.json` 尚無這兩項，但 OQ-029 只授權更新 `screens`、`behaviors_by_type`，明定其他欄位不得變動。
- 可選方案 A：授權只更新 `fixtures/wp10/golden/struts1.summary.json` 的 `diagnostics_by_code`，新增上述兩個診斷的實際數量；其他 golden 欄位與其他 golden 不變。保留 mapping 不可唯一判定時必須產生診斷的 OQ-027 規則。
- 可選方案 B：維持 golden 完全不動，並收窄 OQ-027：同一個已證明的 ActionServlet 有多個 URL pattern 時，不輸出 mapping 未證明診斷；此方案會改變 OQ-027「多個候選」規則，且須另定義 endpoint alias 與 confidence 行為。
- 可選方案 C：維持 OQ-027 與 golden 不變，授權只調整 `synthetic-project.e2e.mjs` 摘要比對，將上述兩個 OQ-027 診斷排除於 golden summary 之外，另以專項測試鎖定診斷數量與內容；此方案會縮小該整合測試對診斷 golden 的覆蓋。
- 影響範圍：WP10 `struts1` summary golden 與 OQ-027 mapping 診斷；不涉及 WP55 畫面／行為來源修正、其他 golden 或 Spring 分析。
- 狀態：已決定（2026-10-10）；需求方不採 A、B、C，採方案 D（明確化 OQ-027 的「多個候選」）。實作與核准的 `struts1` golden 已完成；完整 E2E 發現另一個既有 golden 衝突，見 OQ-031。
- 審查者判讀：`fixtures/wp10/struts1` 只宣告**一個** ActionServlet，同時映射 `*.do` 與 `*.action`。兩個 pattern 都由同一個 servlet 處理，`/save.do`、`/save.action` 都確定送到 `/save` action，沒有不確定性。OQ-027「多個候選」的本意是**無法判定由哪一個 servlet 處理**，是審查者當時寫得不夠精確。
- 決定（取代 OQ-027 中「多個候選」的文字，其餘不變）：
  1. **可證明**：某個 Struts module 由唯一一個已宣告的 ActionServlet 處理（以 `servlet-class` 與該 servlet 的 `config`／`config/<module>` init-param 判定；只有一個 ActionServlet 時，它處理全部 module），且該 servlet 有一個以上 `servlet-mapping`。此時 action 的邏輯 path 與**每一個** pattern 展開的公開 URL 都是同一 endpoint 的別名，`CONFIRMED`，不產生 mapping 診斷。主要顯示的公開 URL 取 `web.xml` 中該 servlet 第一個 `servlet-mapping`（文件順序，決定性）；其餘列為別名，搜尋任一別名都可找到。
  2. **歧義**：同一 module 可能由兩個以上 ActionServlet 處理，或無法判定 module 屬於哪個 servlet → 行為與 R16 前相同，輸出 `STRUTS_SERVLET_MAPPING_AMBIGUOUS`（列出候選 servlet 與檔名行號）。
  3. **未證明**：缺 `web.xml`、缺 ActionServlet 宣告、或該 servlet 沒有 `servlet-mapping` → 行為與 R16 前相同，輸出 `STRUTS_SERVLET_MAPPING_UNRESOLVED`。
  4. 同一個 `web.xml` 的同一個狀況**只輸出一種**代碼（2 與 3 互斥），不得同時輸出兩種。
  5. 依此規則 `fixtures/wp10/struts1` 屬第 1 類，不產生 mapping 診斷；因別名合併而改變的端點數、API 狀態分布、診斷數屬 R16 §3 預先授權的數量型期望，可更新 `struts1.summary.json` 的對應欄位，並在 ADR 逐欄記錄舊值、新值與原因（其餘欄位與其他 golden 不變）。R16 自 `f655446` 起新增、與本決定衝突的測試依 OQ-028 一般授權更新；R16 前的既有測試與 fixture 仍不得修改。
  6. 新增合成測試：單一 ActionServlet 兩個 pattern（第 1 類，三個別名、CONFIRMED、無診斷）；兩個 ActionServlet 對同一 module 不明（第 2 類，只有 AMBIGUOUS）；有 ActionServlet 無 mapping（第 3 類，只有 UNRESOLVED）。

## OQ-031 — OQ-030 alias 合併與 struts1-spring golden 衝突

- 情境：OQ-030 規定只有一個 ActionServlet 時涵蓋全部 module，並把 action logical path 與該 servlet 每個 mapping 的公開 URL 合併成同一 endpoint。`fixtures/wp10/struts1-spring/src/main/webapp/WEB-INF/web.xml` 也只有一個 ActionServlet，宣告 `*.do` 與 `*.action`；因此符合可證明條件。預設並行 E2E 的 `real source fixtures produce identical graph, packed HTML and shared-module md on consecutive runs` 現在在 `struts1-spring.first.apis.by_status.UNREFERENCED` 失敗：golden 預期 12，實際 9。更新 golden 將違反 OQ-030 對「其他 golden 不變」的限制；保留 golden 則完整驗證不能全綠。
- 可選方案 A：擴大 OQ-030 的 golden 授權，只更新 `fixtures/wp10/golden/struts1-spring.summary.json` 中經實際輸出證明改變的數量欄位；ADR 逐欄記錄舊值、新值及原因，並以舊實作證明新值會失敗。其餘欄位與其他 golden 不動。
- 可選方案 B：維持所有其他 golden 不變，修訂 OQ-030 的適用條件，使 `struts1-spring` 仍維持原有 endpoint／API 數量。這需要明確說明如何與「單一 ActionServlet 處理全部 module」及「全部 mapping 為同一 endpoint 別名」共存，否則無法作不硬編碼的實作。
- 影響範圍：OQ-030 的已證明 mapping 規則、`struts1-spring.summary.json`、預設並行 E2E 完整驗收及 WP55 停止點；未修改 `struts1-spring` golden。
- 狀態：已決定並完成（2026-10-10）；需求方採方案 A，並明確化授權範圍。實測 golden 更新、舊實作失敗證明與完整驗證記於 ADR 0074、R16 報告。
- 決定：`struts1-spring` 只有一個 ActionServlet、宣告 `*.do` 與 `*.action`，屬 OQ-030 第 1 類，UNREFERENCED 12 → 9 是別名合併的預期結果。OQ-030 第 5 點「其他 golden 不變」寫得過窄，修訂為：**任何 Struts fixture（`fixtures/wp10/struts1`、`struts1-spring` 及其他含 Struts 的 fixture）的 golden 中，因 R16 的別名合併、forward 正規化、Tiles 畫面界線而改變的數量型欄位（畫面數、端點數、API 總數與狀態分布、行為數、診斷數）皆依 R16 §3 預先授權更新，不需停止**；條件是 ADR 逐欄記錄舊值、新值，並逐一列出造成差異的 endpoint／畫面／行為來源（例如哪些邏輯 path 與 `.do`／`.action` 公開 URL 合併、因而取得呼叫來源的 endpoint），證明新值在 R16 前實作上失敗，且沒有任何畫面或行為來源遺失（OQ-029 第 3、5 點）。**非 Struts 的 golden（Spring MVC、Spring Boot 等）任何欄位改變仍須停止**；eMusicStore、PetClinic 的 graph SHA-256 必須維持不變。

## OQ-032 — Struts wildcard 首個匹配規則與官方 mailreader 驗收衝突

- 情境：WP54 §6.2.2 要求萬用字元 mapping 依 `struts-config.xml` 出現順序取「第一個符合者」。官方 mailreader 的 `struts-config.xml:109` 先宣告 `path="/*"`，再於 `:187`、`:193`、`:199` 宣告 `/Delete*`、`/Edit*`、`/Save*`。因此按第一個匹配規則，`/EditRegistration`、`/SaveRegistration` 等單層路徑先匹配 `/*`，不會到達後續特定 mapping；`/SaveSubscription` 則先由 exact mapping 命中。WP54 驗收卻要求三個特定 wildcard endpoint 全部使用中並列出這些具體 caller path。
- 衝突證據：R15 已取得的 Struts 1.3.10 原始碼 `src/core/src/main/java/org/apache/struts/config/ActionConfigMatcher.java:117-129` 會依序檢查所有 wildcard，且每次匹配都覆寫目前 ActionConfig，因此實際採用最後一個匹配項；這與 WP54 §6.2.2 寫的「第一個」不同，卻能解釋 mailreader 的特定 mapping 為何接收這些呼叫。當前分析器按明文的第一個匹配規則執行，mailreader 實測中 `/Edit*`、`/Save*`、`/Delete*` 沒有 matchedPaths，呼叫落在較早的 `/*` endpoint。
- 可選方案 A：把 §6.2.2 修訂為「exact route 優先；否則依 Struts 1.3 實際行為取最後一個符合的 wildcard mapping」，保留 mailreader 預期與 `ActionConfigMatcher` 原始碼一致。新測試涵蓋 `/*` 在前、`/Edit*` 等較具體 wildcard 在後，以及反向設定順序。
- 可選方案 B：維持「第一個符合者」的規則；修訂 mailreader／scripting-mailreader 驗收，不再要求 `/Edit*`、`/Save*`、`/Delete*` 取得由較早 `/*` 攔截的呼叫來源，改列實際第一個匹配 mapping 與具體 path。
- 影響範圍：wildcard caller 歸屬、mailreader 與 scripting-mailreader 的 API 狀態、matchedPaths 詳細資料及八模組剩餘項目稽核。沒有修改目標範例或既有斷言。
- 狀態：已決定（2026-10-10）；需求方採方案 A，附版本條件。
- 審查者核對：`ActionConfigMatcher.java` 建構子依 struts-config 順序建立 `compiledPaths`（第 63–92 行），`match()` 逐一檢查且比對成功即覆寫 `config`、迴圈不中斷（第 117–129 行），因此 Struts 1.3.10 實際採用**最後一個**符合的萬用字元 mapping。§6.2.2「第一個符合」為審查者錯誤，以官方實作為準。
- 決定：
  1. 規則：先找完全相符的 action path；沒有時，依 struts-config 出現順序檢查全部萬用字元 mapping，取**最後一個**符合者（同 1.3.10 `ActionConfigMatcher`）。實作時另核對 `ModuleConfigImpl.findActionConfigs()` 回傳順序即設定檔順序，並在 ADR 引用行號。
  2. 版本條件：此行為以 Struts 1.3.10 原始碼證實。目標專案的 Struts 版本可由建置檔或函式庫證明為 1.3.x 時，依第 1 點，basis 依連結本身（常值為 `STATIC_URL`）。版本無法證明或非 1.3.x，且「第一個符合」與「最後一個符合」結果不同時，不猜測：標 `AMBIGUOUS`，列出兩個候選 mapping 與版本證據不足的診斷；結果相同時照常處理。
  3. 測試：`/*` 在前、`/Edit*` 在後（取 `/Edit*`）；反向順序（取 `/*`）；完全相符優先於任何萬用字元；版本不明且首末不同時為 AMBIGUOUS。
  4. 驗收維持 §6 原文：mailreader／scripting-mailreader 的 `/Edit*`、`/Save*`、`/Delete*` 為使用中並列出比對到的具體 path。

## OQ-033 — wildcard 驗收要求與實際 JSP/HTML 呼叫來源不一致

- 情境：OQ-032 驗收要求 `scripting-mailreader` 的 `/Delete*` 為使用中並列出具體 matched path，但實際可執行 UI 的 `Registration.jsp:167` 為 `<html:link action="/EditSubscription?task=Delete">`，按 Struts 1.3 wildcard 規則命中 `/Edit*`。`SaveSubscription.gv:80–83` 依表單 task 執行刪除，route 是 `/SaveSubscription.do`。字串 `/DeleteSubscription` 只在 `tour.html:1914、1970` 的 escaped code sample 出現，不是可點擊連結；`Delete{1}.gv` 也不存在。把這些文件內容當作 `/Delete*` caller 會產生假陽性。
- 同輪逐筆稽核另發現 `examples/exercise/html-img.jsp:48` 的 `<html:img action="/html-img-action" />` 是靜態 image action request，而 `faces-example2/index.jsp:23` 有 `<jsp:forward page="welcome.do"/>`。兩者目前未表示為 endpoint caller。JSF／Struts-Faces 的 source（如 `s:form`、`h:outputLink`）依 OQ-026／WP58 明確不分析。
- 可選方案 A：維持證據優先，`scripting-mailreader /Delete*` 保持找不到呼叫來源；報告記錄實際刪除流程由 `/Edit*`、`/SaveSubscription.do` 承載。另授權 WP54 新增 `html:img` page-load resource caller 與 `<jsp:forward>` caller 的失敗測試及實作，更新 Struts 數量報告。
- 可選方案 B：修訂 `/Delete*` 驗收，允許依 `task=Delete` 將 `/EditSubscription` 或 `/SaveSubscription.do` 的呼叫來源複製到 `/Delete*`；這會建立原始 URL 沒有發出的 endpoint 關係，並可能與 Struts ActionConfigMatcher 選路規則矛盾。
- 影響範圍：WP54 wildcard 驗收、`scripting-mailreader` API 清單與 matchedPaths，以及剩餘端點 audit。目標官方模組與所有 fixture 均未修改。
- 狀態：已決定（2026-10-10）；需求方採方案 A。
- 審查者核對：`scripting-mailreader/Registration.jsp:167` 為 `<html:link action="/EditSubscription?task=Delete">`，依 OQ-032 命中 `/Edit*`；`tour.html:1914`、`:1970` 的 `/DeleteSubscription` 位於 `&lt;…&gt;` 轉義的範例程式碼中，不是可點擊連結。§6 驗收把 scripting-mailreader 視為與 mailreader 同型，是審查者錯誤。
- 決定：
  1. `scripting-mailreader` 的 `/Delete*` 依證據維持「找不到呼叫來源」；報告寫明實際刪除流程由 `/EditSubscription?task=Delete`（命中 `/Edit*`）與 `/SaveSubscription.do` 承載。§6 驗收中「scripting-mailreader 的 `/Delete*` 為使用中」一句撤回；mailreader 的 `/Delete*` 驗收不變。
  2. 轉義的 HTML 文字（`&lt;`、`&gt;` 內、`<pre>`／`<code>` 內）不是呼叫來源，納入稽核規則與測試。
  3. 授權新增並實作：`<html:img action=…>`（以及 `html:image`、`html:rewrite` 等產生 action URL 的 tag）作為畫面載入時的呼叫來源（R-API-1(a)）；`<jsp:forward page=…>`、`<jsp:include page=…>` 指向 action 時作為呼叫來源（常值為 `STATIC_URL`）。先提交失敗測試；因此改變的 Struts 數量欄位依 OQ-031 處理。
  4. 已完成：OQ-033 所列決定落地；三個新增測試先於實作提交。Struts parser 現將安全的 page-load action URL 建成畫面 `CALLS` 關係，並略過 escaped、`pre`、`code` 中的示例標記；view include 不會因 wildcard 被誤認為 action。八模組實測與驗證見 `docs/reports/R16.md`、ADR 0077。WP54 仍待需求方驗收。

## OQ-034 — WP58 Tiles 界線規則與既有測試斷言衝突

- 情境：WP58 的 Faces 範例合成 fixture 讓完整 Maven 驗證觸發既有測試 `StrutsCompletenessTest.expandsInheritedNestedTilesAndJspTileInsert`（`StrutsCompletenessTest.java:113`）。此測試於 `f32c76de`（2026-10-02）加入；fixture 中 `child` extends `base`，而 `outer` 又 extends `child`。測試要求 graph 有一個名為 `child` 且 `view=/WEB-INF/jsp/layout.jsp` 的 SCREEN。OQ-029 明定「被任何 definition extends 的 definition 屬版型，不是畫面」，因此 WP55／WP58 的正確 graph 應將 `child` 保留為 VIEW／版型，而非 SCREEN。沒有任何實作可以同時滿足此既有 SCREEN 斷言與 OQ-029 的 Tiles 畫面界線。
- 可選方案 A：授權只調整上述既有測試的斷言，驗證 `child` 以版型 VIEW 保留、且不作為獨立 SCREEN；fixture 不變。ADR 記錄測試名稱、舊預期、新預期與 OQ-029 依據。
- 可選方案 B：維持既有測試與斷言，修訂 OQ-029，允許被 extends 的 definition 同時列為 SCREEN；這會使「被任何 definition extends 即為版型」不再成立，並改變 WP55／WP58 對 Tiles 畫面的計數與呈現。
- 影響範圍：WP58 的 JSF／Tiles 全套驗收與 R14 §5 完整 Maven 驗證。已新增的 WP58 fixture 使用被 extends 的 `.base`，預期它只作版型而不列 SCREEN；既有 fixture 與斷言尚未修改。
- 狀態：已決定（2026-10-11）；需求方不採 A、B，採方案 C。
- 審查者判讀：`StrutsCompletenessTest.java:113` 的斷言為 `graph.nodes().stream().anyMatch(n->n.name().equals("child")&&"/WEB-INF/jsp/layout.jsp".equals(n.attributes().get("view")))`，只要求圖中**存在任一類型**、名稱為 `child` 且 `view` 為 `layout.jsp` 的節點，**沒有要求它是 SCREEN**。OQ-029 的「版型不是畫面」與此斷言不衝突：版型以非畫面節點（VIEW／版型證據）保留名稱與 `view` 屬性即可通過。WP55 提交時完整驗證全綠，正是如此通過；現在失敗代表工作區未提交修改把版型節點移除，或移除了其 `name`／`view` 屬性，屬實作退化。
- 決定：既有測試與 fixture 不改；修正實作，使被 extends 的 Tiles definition 依 OQ-029 不是 SCREEN，但仍以版型節點保留於圖中（保留 `name`、`view`、來源與 extends 關係），供組成證據、片段群組與稽核使用。WP58 新增的 faces fixture（R16 新增測試）若斷言「`.base` 不是 SCREEN」，與本決定一致；若斷言「圖中完全沒有 `.base` 節點」，依 OQ-028 一般授權改為只斷言非 SCREEN。

## OQ-035 — R18-A：拆分前 screenId 決策的匯入

- 決定：方案 A（需求方第一階段驗收回覆）。拆分前 ID 的決策保留為 orphan，提示「此網址已依身分拆分，請重新標記」，不套用到任何變體；單一變體沿用原 ID。
- 狀態：RESOLVED；已實作，契約與驗證見 ADR 0099、R18 報告。

## OQ-036 — WP79：店家偏好面板的條件不足以證明身分矛盾

- 決定：本階段方案 A。面板本體由獨立狀態控制，保守保留面板及 API；WP79 該項驗收改為「保留，附 OQ-036 說明」。不得從開啟按鈕的角色條件或 useState 初始值推論面板不可達。
- 狀態：RESOLVED。R18 期間採方案 A；之後依需求方決定實作方案 B 的窄規則：以常值初始化的 `useState`，其可能值為初始值加上畫面身分下可達的常值寫入點（含透過區域函式參數的寫入）；setter 或帶參數的寫入函式被當成值傳出、以函式形式更新、或可達寫入點的值無法求值時視為未知，不修剪。reservio `/business/setup` 不再含 `GET /api/preferred-businesses`、`POST /api/preferred-businesses`、`GET /api/businesses/{category}`；其他 35 個畫面不變。見 [ADR 0105](adr/0105-oq036-state-value-reachability.md)。

## OQ-037 — WP80：認證回傳物件與路由身分的同一性

- 決定：方案 B 的窄規則。F 同路徑以同一區域變數呼叫 useState setter 並回傳；F 與 state 值 X 在唯一同 Context Provider 的 value 物件字面值中公開；呼叫端由同 Context 取得 F，以 const u = await F() 取得結果。只有此證據成立，才將 u 的導向條件對應至目的畫面 X。
- 反向：setter 使用轉換值、另一條路徑回傳不同變數、setter 經 props 或其他函式、多個或不確定 Provider 均不修剪；不做一般別名／資料流分析。不同 Context、可變回傳區域值與 finally 覆寫也保守保留。
- 狀態：RESOLVED；reservio 登入後的 `/` 候選僅商家變體，見 ADR 0099 與 R18 報告。

## OQ-038 — callback 查詢情境的獨立畫面變體（後續候選）

- 情境：認證路由的 Guard 明確允許 callback 查詢條件在已有登入身分時渲染。需求方已決定 R18 不另外拆分 callback 情境；五個認證頁的返回首頁／品牌連結保留可證明成立的全部變體，各目的附一般進入或 callback 例外的條件與來源，模擬清單顯示條件。
- 可選方案：後續以來源可證明的查詢參數條件，把一般進入與 callback 建為不同變體；須另定 ID、畫面數、舊決策與查詢參數正規化政策。沒有授權前維持本輪多目的呈現。
- 與 WP80 的關係：外部登入回到 `/login?lineLogin=success` 的流程，日後可以指向這個 callback 變體；本輪外部登入往返仍使用既有路由與條件證據，不新增畫面。
- 狀態：OPEN；需求方明確列為後續候選，不阻擋本輪依已決定政策保留 callback 例外。

## OQ-039 — Struts 真實回歸的既有 graph validation 阻擋

- 情境：前次 Struts 八模組回歸誤指向空目錄，不能證明相容性。以 Apache Struts 1 commit 02c9ff7485b1900515c6e0b32ed54ea46dd97d51 的實際來源重建 main dbacc54 與 R18 基準後，blank、faces-example1、faces-example2、mailreader、scripting-mailreader 五個模組的非空圖逐位元組一致；cookbook、el-example、examples 兩個版本都被既有 GraphIntegrityValidator 擋下，分別為 69、31、3 個相同錯誤，不能輸出可接受的 graph SHA。
- 原因：既有「Navigation target does not match screen route or view」驗證拒絕含查詢參數的 source.jsp 等導覽；完整錯誤及錯誤清單雜湊在 repo 外，報告列數量。本輪未修改目標、Struts 程式、驗證規則或受保護斷言，未跳過驗證來製造輸出。
- 可選方案：後續另行授權修復 Struts URL／graph 驗證，再完成三個模組的有效圖回歸；本輪只保留兩版本相同既有失敗的證據，不宣稱八模組全部通過。
- 影響範圍：R18 實際八模組 graph SHA-256 驗收中的上述三個模組。依 R18 §4 停止該項；其他 WP79／WP80 補正、repo 測試及 PR CI 繼續驗證。
- 狀態：RESOLVED。根因為 054cf0c（WP69）開始解析相對 `html:link` 目標後，直接連到 JSP 畫面的 CONFIRMED 導覽只把去除查詢字串的路徑登記為 route alias，元件 `target` 保留查詢字串而無法通過 GraphIntegrityValidator。修正為同時把元件 `target` 原值登記為 alias（與 R16 aa8a9f8 對 action 導覽的作法一致）；驗證規則未放寬。cookbook、el-example、examples 恢復產出合格圖；其他五個 Struts 模組 graph 與 preview SHA-256 不變。見 [ADR 0104](adr/0104-oq039-struts-query-link-aliases.md)。

## OQ-040 — R18-B 外部呼叫端點的 API 呈現

- 情境：靜態分析沒有畫面 caller，但 Spring Security 對該路徑 permitAll 且列於 CSRF ignoringRequestMatchers（或 XML 等價設定）。
- 決定：需求方第三次驗收採「只加附註」。D5 原文不改、狀態維持「未被使用」，API 清單及詳情加「外部呼叫（Webhook）」並列出兩處設定的檔案／行號；不列入可移除，D4 不變。缺任何一項證據或存在 caller 均不套用，不依 URL 字樣推測。
- 影響範圍：WP82、API 頁呈現與設定 evidence；md v1、決策鍵及原 API 推導不變。實作與反向測試見 ADR 0102。
- 狀態：RESOLVED；後續更一般的安全設定／外部系統資料流不在本輪。
