# Review md 契約 v1（WP8／指示文件 v1.7）

瀏覽器與 Node 共用 screentrace-viewer/src/shared/review-md.ts；建置另產出 dist/review-md.mjs，可在 Node 22+ 直接 import。無 DOM／檔案／網路相依；輸入為嚴格 schema 2.2 Graph、Preview、分析指紋及 shared/review v1 狀態。歷史／缺證據／不合法引用明確拒絕，不升版。

## 固定檔頭

鍵順序：screentrace_review_schema（1）、generated_at（ISO-8601 UTC）、tool_version、analysis_fingerprint、application、technologies、context_path、migration_target。migration_target 固定 backend、frontend、component_library，值為 Spring Boot 4、Angular、none。

所有字串為雙引號 JSON 相容字串；technologies 排序。application 完整保存，不截斷。tool_version 取 Java 注入的根 pom.xml 建置版本；Node 可明確傳入，缺值為「—」，不得捏造。分析指紋沿用單檔 Java 注入的圖 JSON SHA-256。

context_path 為值／來源物件陣列（source、value），依來源和值排序、去重。僅消費 UrlResolution 可證明的白名單採用值；來源為 workspace 設定、server.servlet.context-path 或未設定。多候選保留「未定（多候選）」及原候選證據，不擇一。沒有採用證據標未設定，不假設部署前綴；不寫工作區真實路徑／家目錄。

## 固定正文與排序

標題固定「審查結果(給 AI 的執行指示)」，專案名稱留檔頭；避免專案文字形成標題。章節 1–9 與附錄 A 名稱逐字依 CODEX_INSTRUCTIONS.md WP8；§1 的八條文字逐字依 §8.2，測試直接比對文件。

畫面依第一路由、ID（Unicode 字串碼序）排序。小標題只有編號與三態；路由／名稱以表格 code span 保留。REMOVE 僅 ID、路由、來源與移除標示；KEEP／UNDECIDED 保留全部元件與行為，明確 REMOVE 元件仍列出。元件依 ID，行為依 ID；同一共用元件每畫面各自決策。載入／未綁定來源另外列行為。元件表固定 id、kind、標籤、事件、行為類型、結果指向、條件、決策、建議元件、styleId、來源。

API 依 ID 排序；共用 deriveApiUsage 推導三態，不另寫判定。呼叫來源依畫面／元件／行為排序，保留來源行號。§4 未引用且另有目標未解析 API 呼叫時逐項標「另有 N 個未解析呼叫,可能指向此 API」；§8 列出這些行為。靜態分析不能證明某未解析呼叫屬特定 API，不推斷候選。

契約只列 contentType、bodyType、fields 的 name／type／location／required 及 response status，遞迴欄位鍵排序；不序列化整個任意物件。檢核以 ID 排序，保留欄位、訊息、層級和來源。§5 導覽按來源／目標；§6 固定「未匯入元件庫」；不實作 WP9。§7 保留衝突，不自動修正。§8 包含節點／關聯／行為／規則解析限制與診斷代碼，來源可追查，不輸出診斷自由文字。

§9 僅保留非 REMOVE 畫面中已匯出元件實際參照的 styleId（含歧義全候選），去重、styleId／屬性排序。值沿用 Preview.styles 的非預設屬性字典，不捏造全樣式或從不同 defaultId 擇一；其餘字典／縮圖／HTML 不輸出。缺值「—」，缺少被參照的 styleId 明確失敗。

## 正文隔離（OQ-007）

所有專案衍生值只在表格 code span；圍欄比最長反引號序列多一個，兩端加空格。控制字元（含 C0／C1）、換行、雙向控制與 U+2028／2029 改可見 Unicode 跳脫；HTML 符號變實體，表格分隔符改反斜線跳脫。每段在可見控制字元轉換後按 Unicode code point 取前 300，再加固定「…(已截斷,完整內容見 <檔案>:<行號>)」。標記不計入 300；來源缺值「—」。反引號圍欄與 Markdown 編碼不計入資料字元數。

允許標籤、路由、guard、UNRESOLVED 目標／選擇器、檢核欄位／訊息；來源與圖身分／契約欄位按上述欄位投影。禁止完整檔案／函式本體／敘述式／原始 HTML／圖片資料；遇到明確函式／敘述式特徵的 expression，顯示省略標記與來源，不逐段分割來繞過限制。內嵌 base64 資源以固定省略標記替換。

evidence.detail 自由文字從不複製；僅接受結構化白名單鍵解析器名稱、框架來源標籤、設定鍵、候選值、採用值。既有 UrlResolution 的完整固定鍵值格式可投影為這些鍵。AcornStaticAnalyzer 的結構化 selector 僅用於 UNRESOLVED 綁定選擇器欄位，不搬運 expression／函式本體／其他 detail。無法明確歸入白名單就省略，原證據留圖中。

## 機器區（OQ-008）

機器區保留完整名稱／ID，不套用 code span／300 上限。每字串 JSON 序列化，再 Unicode 跳脫反引號、<、>、&、C0／C1 控制、換行、雙向控制 U+202A–202E／U+2066–2069、U+2028／2029；不得改變字面反斜線序列。

附錄固定資訊字串 json screentrace-review-state，只產生一個末尾區塊。已知鍵：format_version（1）、analysis_fingerprint、screen_decisions、component_decisions、state_sha256。component_decisions 是 screenId → componentId → 決策巢狀字典，完整保存未知 ID；不含 application、標籤、條件、訊息、URL 或任何證據。WP9 元件庫覆寫尚未啟用，本版本不接受額外欄位。

state_sha256 對排除自身的狀態物件正規化 JSON（所有物件鍵遞迴排序，原始值 JSON 編碼、無空白）UTF-8 求 SHA-256；與機器顯示用 Unicode 加強跳脫分開。摘要僅偵測損毀，不宣稱防竄改。

匯入只解析最後一個固定標記；結束圍欄後僅允許單一檔案結尾換行，任何後續內容皆錯誤。JSON UTF-8 上限 32 MiB，解析前檢查。拒絕未知／缺鍵、錯版本／三態、字典格式錯誤、摘要不符；不改目前決策。重用 validateReview own-property 拷貝，污染鍵作普通 ID，不更改原型。

成功匯入完整保留未知 ID／失去所屬畫面的複合鍵，列 orphan；指紋不同或 orphan 時提示「分析結果已變更」。已知 ID 原樣還原，不猜測改名；本次保存採目前分析指紋。相同指紋／資料／決策往返，generated_at 除外位元組相同。

## 容量與 API

單一 md，LF 換行、末尾 LF。超過 5,000,000 UTF-8 bytes 在檢視器警告，不截斷。JSON import 的硬上限與正文匯出警告不同。

generateMarkdown(payload, state, options) 回傳 Promise<string>；importMarkdown(md, payload) 回傳 state、orphans、changed。sha256／canonicalJson／machineJson／projectText 可獨立測試；golden 固定 generatedAt 和 toolVersion。瀏覽器只讀使用者選取檔案，不讀網路資源。
