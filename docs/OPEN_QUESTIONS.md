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
