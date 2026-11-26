# Review md 契約 v1（WP8／指示文件 v1.8）

瀏覽器與 Node 共用 screentrace-viewer/src/shared/review-md.ts；建置另產出 dist/review-md.mjs，可在 Node 22+ 直接 import。無 DOM／檔案／網路相依（純 Acorn AST parser 釘選 8.18.0，ADR 0024）；輸入為嚴格 schema 2.2／2.3／2.4 Graph、Preview、分析指紋及 shared/review v1 狀態。歷史／缺證據／不合法引用明確拒絕，不升版。

## 固定檔頭

鍵順序：screentrace_review_schema（1）、generated_at（ISO-8601 UTC）、tool_version、analysis_fingerprint、application、technologies、context_path、migration_target。migration_target 固定 backend、frontend，值為 Spring Boot 4、Angular（R17 起不輸出 component_library）。

所有字串為雙引號 JSON 相容字串；technologies 排序。application 完整保存，不截斷。tool_version 取 Java 注入的根 pom.xml 建置版本；Node 可明確傳入，缺值為「—」，不得捏造。分析指紋沿用單檔 Java 注入的圖 JSON SHA-256。

context_path 為值／來源物件陣列（source、value），依來源和值排序、去重。僅消費 UrlResolution 可證明的白名單採用值；來源為 workspace 設定、server.servlet.context-path 或未設定。多候選保留「未定（多候選）」及原候選證據，不擇一。沒有採用證據標未設定，不假設部署前綴；不寫工作區真實路徑／家目錄。

## 固定正文與排序

標題固定「審查結果(給 AI 的執行指示)」，專案名稱留檔頭；避免專案文字形成標題。章節 1–7 與附錄 A：§1 如何使用本文件、§2 統計、§3 畫面、§4 API、§5 導覽關係、§6 衝突與警告、§7 分析限制（R17 起；CODEX_INSTRUCTIONS WP8 的九章列表為 R17 前的歷史版本）。§1 的六條文字逐字依 CODEX_INSTRUCTIONS §8.2，測試直接比對文件。

畫面依第一路由、ID（Unicode 字串碼序）排序。小標題只有編號與三態；路由／名稱以表格 code span 保留。REMOVE 僅 ID、路由、來源與移除標示；KEEP／UNDECIDED 保留全部元件與行為，明確 REMOVE 元件仍列出。元件依 ID，行為依 ID；同一共用元件每畫面各自決策。載入／未綁定來源另外列行為。元件表固定 id、kind、標籤、事件、行為類型、結果指向、條件、決策、來源（R17 起不含建議元件與 styleId）。

API 依 ID 排序；共用 deriveApiUsage 推導三態，不另寫判定。呼叫來源依畫面／元件／行為排序，保留來源行號。§4 未引用且另有目標未解析 API 呼叫時逐項標「另有 N 個未解析呼叫,可能指向此 API」；§7 列出這些行為。UNREFERENCED API 一律附註「外部系統、反射或動態路徑呼叫無法靜態偵測」。靜態分析不能證明某未解析呼叫屬特定 API，不推斷候選。

契約只列 contentType、bodyType、fields 的 name／type／location／required 及 response status，遞迴欄位鍵排序；不序列化整個任意物件。檢核以 ID 排序，保留欄位、訊息、層級和來源。§5 導覽按來源／目標；§6 衝突與警告保留衝突，不自動修正。§7 分析限制包含節點／關聯／行為／規則解析限制與診斷代碼及證據表，來源可追查，不輸出診斷自由文字。

（R17 已移除，以下為歷史規則）原 §9 僅保留非 REMOVE 畫面中已匯出元件實際參照的 styleId（含歧義全候選），去重、styleId／屬性排序。值沿用 Preview.styles 的非預設屬性字典，不捏造全樣式或從不同 defaultId 擇一；其餘字典／縮圖／HTML 不輸出。缺值「—」，缺少被參照的 styleId 明確失敗。

## 正文隔離（OQ-007）

所有專案衍生值只在表格 code span；圍欄比最長反引號序列多一個，兩端加空格。控制字元（含 C0／C1）、換行、雙向控制與 U+2028／2029 改可見 Unicode 跳脫；code span 內 &、<、> 保留原字元，不轉換 HTML 實體（內容不會被解讀為 HTML）；表格分隔符改反斜線跳脫。每段在可見控制字元轉換後按 Unicode code point 取前 300，再加固定「…(已截斷,完整內容見 <檔案>:<行號>)」。標記不計入 300；來源缺值「—」。反引號圍欄與 Markdown 編碼不計入資料字元數。

新增跳脫集合：U+200B–200F、U+2060–2064、U+FEFF、U+FE00–FE0F、U+E0100–E01EF、U+E0000–E007F。正規表示式使用 u 旗標，新增字元顯示為 \u{XXXXX}（小寫十六進位 code point）；既有控制與雙向字元的 \uXXXX 格式不變。

允許標籤、路由、guard、UNRESOLVED 目標／選擇器、檢核欄位／訊息；來源與圖身分／契約欄位按上述欄位投影。禁止完整檔案／函式本體／敘述式／原始 HTML／圖片資料；由 Acorn AST 證明包含 statement／declaration／函式本體的 expression，顯示省略標記與來源，不逐段分割來繞過限制。內嵌 base64 資源以固定省略標記替換。

evidence.detail 自由文字從不複製；僅接受結構化白名單鍵解析器名稱、框架來源標籤、設定鍵、候選值、採用值。既有 UrlResolution 的完整固定鍵值格式可投影為這些鍵。AcornStaticAnalyzer 的結構化 selector 僅用於 UNRESOLVED 綁定選擇器欄位，不搬運 expression／函式本體／其他 detail。無法明確歸入白名單就省略，原證據留圖中。

## 機器區（OQ-008）

機器區保留完整名稱／ID，不套用 code span／300 上限。每字串 JSON 序列化，再 Unicode 跳脫反引號、<、>、&、C0／C1 控制、換行、雙向控制 U+202A–202E／U+2066–2069、U+2028／2029；另跳脫正文新增集合（零寬／格式、變體選擇器、Unicode 標籤字元），正規表示式使用 u 旗標。所有新增字元轉成 JSON 合法的 UTF-16 \uXXXX，非 BMP 使用兩個代理對跳脫；不得使用 JSON 不接受的 \u{XXXXX}。不得改變字面反斜線序列。

附錄固定資訊字串 json screentrace-review-state，只產生一個末尾區塊。共同已知鍵：format_version（匯出固定 1；匯入接受 1／2／3，2、3 僅匯入相容）、analysis_fingerprint、screen_decisions、component_decisions、state_sha256。component_decisions 是 screenId → componentId → 決策巢狀字典，完整保存未知 ID；不含 application、標籤、條件、訊息、URL 或任何證據。v1 不接受 v2 專屬欄位；v2 必須另含 component_overrides 與 orphan_component_overrides，其他未知欄位拒絕。

state_sha256 對排除自身的狀態物件正規化 JSON（所有物件鍵遞迴排序，原始值 JSON 編碼、無空白）UTF-8 求 SHA-256；與機器顯示用 Unicode 加強跳脫分開。摘要僅偵測損毀，不宣稱防竄改。

匯入只解析最後一個固定標記；結束圍欄後僅允許空行（編輯器常在檔尾多加換行，ADR 0153），任何其他後續內容（包括只有空白字元的行）皆錯誤。JSON UTF-8 上限 32 MiB，解析前檢查。拒絕未知／缺鍵、錯版本／三態、字典格式錯誤、摘要不符；不改目前決策。重用 validateReview own-property 拷貝，污染鍵作普通 ID，不更改原型。

成功匯入完整保留未知 ID／失去所屬畫面的複合鍵，列 orphan；指紋不同或 orphan 時提示「分析結果已變更」。已知 ID 原樣還原，不猜測改名；本次保存採目前分析指紋。相同指紋／資料／決策往返，generated_at 除外位元組相同。

## 容量與 API

單一 md，LF 換行、末尾 LF。超過 5,000,000 UTF-8 bytes 在檢視器警告，不截斷。JSON import 的硬上限與正文匯出警告不同。檢視器對選取檔案硬上限 64 MiB（67,108,864 bytes）；大於上限於 File.text() 前明確失敗，不改目前決策。等於上限可讀取，但仍受附錄 JSON 32 MiB 限制。

generateMarkdown(payload, state, options) 回傳 Promise<string>；importMarkdown(md, payload) 回傳 state、orphans、changed。sha256／canonicalJson／machineJson／projectText 可獨立測試；golden 固定 generatedAt 和 toolVersion。瀏覽器只讀使用者選取檔案，不讀網路資源。

## WP9／OQ-010：元件庫與覆寫（v1.9；R17 起僅匯入相容）

> 本節的匯出規則（component_library 檔頭、format_version 2、§6 涵蓋率）自 R17 起不再產生；現行程式只保留 v2 匯入時的檔頭解析與欄位驗證，匯入後的覆寫由報表略過並提示。見下方 R17 一節。

未選用時 migration_target.component_library 保持雙引號 none，正文 §6 保持「未匯入元件庫」，原兩份 v1 golden 位元組不變。選用時 component_library 為單行 JSON 相容物件，只有 name_version（名稱@版本）與 manifest_sha256（完整 64 碼小寫十六進位）兩個雙引號字串。不列工作區路徑。v2 匯入只讀檔頭首個 --- 區塊中的唯一 component_library，不從正文猜測。有效覆寫原來源摘要取此檔頭；foreign record 自帶原摘要。

component_overrides：screenId → componentId → 元件庫元件 ID，只含目前來源摘要相符、圖 owner／元件庫 ID 有效的覆寫。orphan_component_overrides 為陣列，每筆精確只有 screenId、componentId、libraryComponentId、manifest_sha256；全部必須為非空 ID 字串與 64 碼小寫摘要，未知／缺鍵、錯型別、錯摘要格式拒絕。外庫與未知圖 ID 均保留，不把不可信欄位搬進自由文字。

任一分區有資料才輸出 format_version 2；皆無輸出 1（即使已選用庫）。v2 兩個新欄位皆必要，可為空字典／陣列；v1 出現任一新欄位拒絕。state_sha256 對除自身外所有已知狀態欄位的正規化 JSON 計算，包含兩個新欄位與每筆 orphan 來源摘要；檔頭仍是元資料，不宣稱整份文件防竄改。

唯一 partitionOverrides 與瀏覽器暫存共用，收集有效與 orphan，按原來源摘要對目前庫／圖重新分區；A/B/A 恢復有效，不重新標記。相同 source／screenId／componentId 有衝突值拒絕，不擇一。未知圖 ID 保留並列入 import orphan 清單；所有 ID／摘要機器跳脫、最後區塊、大小與 SHA 規則沿用。匯入完整驗證後才更新決策。

§6 涵蓋率由原始決定性比對計算（不讀覆寫），每種 canonical kind 依 MATCH／NONE／AMBIGUOUS 計數；列未對應及全數歧義候選。元件列與有效 KEEP 畫面覆寫可替換建議；§6 顯示目前使用候選的名稱／selector／category／status／description、inputs／outputs／slots／usage／docsUrl，以及有效手動對照。foreign orphan 完全不作建議、不影響 API 與涵蓋率，也不在正文列其內容；§7 僅數量分類：「N 筆覆寫的來源元件庫與目前不同,未套用」；同來源未知圖／庫 ID 另列數量。

manifest 文字同正文隔離（code span、300、控制／隱形可見化），多行 usage 特別以 \n 可見化再套用單行規則，截斷標記指向名稱@版本。只以文字列 URL，不產生網路請求、HTML 或圖片。固定 README／sample 虛構範例不代表任何真實元件庫。

比對 priority 須為 Schema 驗證的 JavaScript 安全整數；拒絕可能失真的 JSON 數值，不把不同分數讀成假同分。

## WP47：決策原因與備註（format_version 3；R17 起僅匯入相容）

> 本節的匯出規則（format_version 3、原因／備註欄）自 R17 起不再產生；現行程式只保留 v3 `decision_notes` 的匯入驗證，匯入後的原因與備註由報表略過並提示。

沒有目前已決定項目的非空原因／備註時，沿用 format_version 1 或 2，既有 v1／v2 golden 位元組不變。任一 KEEP／REMOVE 決策有原因或備註時輸出 format_version 3；v3 必含 `component_overrides`、`orphan_component_overrides`（可為空）及 `decision_notes`，其形狀為 `{screens: {screenId: Note}, components: {screenId: {componentId: Note}}}`。`Note` 僅允許 `reason?` 與 `note?`。UNDECIDED 項目的草稿只留在瀏覽器狀態，不放入正文或附錄；重新決定後若原因相容則恢復輸出。v1／v2 匯入的 `decisionNotes` 為空。

畫面摘要與元件表在 v3 增加「原因」「備註」欄。原因顯示中文標籤與固定代碼；備註是不可信使用者文字，套用正文專案文字的 code span、隱形／控制字元可見化、表格分隔符跳脫與 300 code point 上限。截斷標記指向 `附錄 A: screens.<screenId>.note` 或 `附錄 A: components.<screenId>.<componentId>.note`。不可把備註當成標題、清單或一般段落輸出。

匯入 v3 僅接受已知欄位；`decision_notes` 必要，結構與型別嚴格驗證，原因必須符合該項 KEEP／REMOVE 決策的允許集合；備註不得超過 1,000 Unicode code point。`state_sha256` 涵蓋 `decision_notes` 與 v2 覆寫欄位。錯誤時拒絕整份匯入、不改目前狀態。v1／v2 欄位集合與 golden 不變。

## R17：正文精簡與僅匯入相容（2026-10-11）

- 匯出一律為 `format_version` 1，機器區只含 `analysis_fingerprint`、`screen_decisions`、`component_decisions`、`state_sha256`；同樣決策的附錄 A 位元組與 R17 前相同。
- 正文移除：YAML 檔頭的 `migration_target.component_library`、固定指示原第 6、7 條（原第 8 條改為第 6 條，見 CODEX_INSTRUCTIONS §8.2）、元件表的「建議元件」「styleId」欄、原因／備註欄、API 表的「信心」欄、§6 元件庫對應、§9 樣式表。§7 衝突與警告、§8 分析限制依序改為 §6、§7；分析限制與證據表保留（供 AI 不自行猜測）。
- `format_version` 2、3 改為**僅匯入相容**：驗證、摘要與欄位檢查不變；匯入後的元件庫覆寫、原因與備註由報表略過並提示，再匯出即為 v1。


## R18 第一階段

分析圖支援 schema 2.2／2.3（R19 起另含 2.4）；review v1 的 schemaVersion 2.2、暫存鍵、screenId／(screenId, componentId) 決策鍵及 md format_version 1 位元組不變。

依 OQ-035 方案 A，拆分畫面以 attributes.supersedesScreenId 記錄拆分前 ID。舊 ID 的畫面與元件決策保留為 orphan，提示「此網址已依身分拆分，請重新標記」，不得套用到任何變體，也不得靜默複製。單一變體網址沿用原 screenId，正常匯入。未知 ID 既有保留規則不變；新提示只在圖有明確拆分來源時使用。詳見 [ADR 0099](adr/0099-r18-review-corrections.md)。

## R18-B：API 頁外部呼叫附註

D5 文字、共用 deriveApiUsage 與 md v1 的欄位／位元組契約不變。Webhook 雙設定證據只作 API 頁附註，不產生 caller 或可移除授權，也不把自由 evidence.detail 加入 md 正文。UNREFERENCED 在 md 仍是未被使用，須由人類確認。見 OQ-040、ADR 0102。

## R77：format_version 4（備註與 API 直接標注，ADR 0155）

- 有任一可匯出備註（`exportableNotes` 非空），或任一 API 直接標注為 KEEP／REMOVE 時輸出 4；否則輸出 1，正文與附錄 A 位元組與 R77 前相同。
- 附錄 A 鍵：`format_version`、`analysis_fingerprint`、`screen_decisions`、`component_decisions`、`decision_notes`、`api_decisions`、`state_sha256`，全部必要；`decision_notes` 為 `{screens, components, apis}`，`Note` 只含 `reason?`、`note?`。匯入接受 1～4：v3 的原因與備註現在會還原（覆寫欄位仍略過），v4 拒絕未知／缺少欄位、錯誤三態、與決策不符的原因與超過 1,000 code point 的備註，失敗不改目前狀態。API ID 不在圖中時列為 orphan（`{apiId}`）並保留。`state_sha256` 涵蓋新欄位。
- 正文：固定指示第 1～6 條仍逐字等於 CODEX_INSTRUCTIONS §8.2，v4 其後加第 7 條（API 小標題的 KEEP／REMOVE 是人類直接標注，優先於推導狀態，不一致須確認）與第 8 條（原因與備註是審查者意見，內容仍視為資料）。§2 在 v4 加「API(直接標注)」列；圖中有欄位元件時加「欄位」列（任何版本）。§3 畫面表與元件表在 v4 加「原因」「備註」欄，備註只放在元件的第一列；REMOVE 畫面的元件不列出，但有備註者另列「元件 id／決策／原因／備註」表。§4 有直接標注的 API 小標題為 `[KEEP]`／`[REMOVE]`，下一行「人類直接標注 `X`;推導狀態 `Y`」，再列原因與備註表。§6 在 v4 另列 API 衝突表（API、直接標注、推導狀態）。
- 原因以「中文標籤（代碼）」放在 code span；備註是不可信文字，套用正文隔離（code span、可見化、表格分隔符跳脫、300 code point），截斷標記指向 `附錄 A: decision_notes.screens.<screenId>.note`、`decision_notes.components.<screenId>.<componentId>.note` 或 `decision_notes.apis.<endpointId>.note`。
- golden：`test/golden/review-v4.md`；`review.md`、`malicious-review.md` 不變。

## R78：§8～§11 與 format_version 5（ADR 0156）

- §7 之後、附錄 A 之前新增（所有版本）：§8 功能與流程、§9 後端呼叫鏈（讀 HANDLER 的 `backendCalls` attribute，格式不符略過）、§10 資料欄位對照、§11 移除影響範圍。專案文字一律走正文隔離；章節標題與說明為固定文字。
- §3 小標題改用有效決定（畫面自己的或所屬功能的）；隨功能時加一行「未個別標記,隨所屬功能(§8 功能 key `…`)的決定 `X`」。
- 有功能標注或功能備註時輸出 5：v4 的鍵加 `feature_decisions`，`decision_notes` 另含 `features`；匯入接受 1～5，未知功能 key 列為 orphan（`{featureKey}`）。
- 檔頭 `migration_target` 依報表資料 `migrationTarget`：未設定為 Spring Boot 4／Angular；物件為設定值（機器跳脫）；null 時不輸出這三行。
- golden：`review.md`、`malicious-review.md`、`review-v4.md` 加入 §8～§11，其餘位元組不變。

## R81：§12 系統自動作業（ADR 0159）

- §11 之後、附錄 A 之前新增（所有版本）：§12 系統自動作業，讀 HANDLER 的 `trigger`、`triggerText`、`triggerExpression`、`triggerNote`、`eventType`、`eventPublishers`；沒有作業時寫「未偵測到排程、事件監聽或啟動時執行的程式。」。專案文字一律走正文隔離。format_version 不變。
- golden：`review.md`、`malicious-review.md`、`review-v4.md` 加入 §12，其餘位元組不變。

## R82：§13 資料狀態變更（ADR 0160）

- §12 之後、附錄 A 之前新增（所有版本）：§13 資料狀態變更，讀 HANDLER 的 `stateChanges`；每個值列出設定它的 API 或系統作業，沒有人設定的值與無法確定的寫入也列出；沒有寫入時寫「未偵測到列舉狀態的寫入。」。format_version 不變。
- golden：三份 golden 加入 §13，其餘位元組不變。

## R115：format_version 6（畫布排版位置，ADR 0189）

- 使用者在自由畫布上拖曳過畫面卡片時輸出 `format_version` 6；沒有拖曳過時維持 1／4／5，既有位元組不變。
- v6 的機器區鍵為 v5 的全部鍵（`decision_notes`、`api_decisions`、`feature_decisions` 必有，可為空）加上 `canvas_layouts`：版面名稱 → 畫面 ID → `{x, y}`（整數世界座標）。viewer 寫出的版面名稱為 `roles`（依角色分區）或 `areas`（依網址分區），每種版面各自保存；匯入時接受其他合法名稱並原樣保留，但不使用。拖回原本計算位置的卡片不寫入。
- 位置只寫在附錄 A，不出現在正文各節，也不是保留／移除決定；`state_sha256` 照常涵蓋它。
- 匯入驗證：版面最多 32 個、每個版面最多 10000 個畫面、座標必須是絕對值不超過 1,000,000 的有限數字、每個位置只能有 `x` 與 `y`，否則拒絕整個檔案；指向已不存在畫面的位置保留但不顯示，不列為孤兒標記。
