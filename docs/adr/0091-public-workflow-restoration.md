# ADR 0091：公開應用流程還原（WP69）

日期：2026-10-18。依需求方授權建立 `fix/workflow-restoration` 分支，處理實測紀錄 WF-001–009。範圍為 OLMS/MyStrutsApp、eBazaar、Hospital-Bed-Availability-Management-System；不再使用前輪五個測試單位驗收。

## 背景與決定

驗收改用原始碼獨立定義的操作／目的畫面與真實報表點擊，不能以報表生成或數量符合代替。原始失敗 JSON、日誌與關鍵截圖保留；修正後結果另存 `docs/reports/workflows-20261018/after/`。

- Struts 相對 JSP URL 支援既有工具使用的 `src/main/webapp`、`WebContent`、`web` 根目錄；實際存在的路徑建立來源可追溯的 routeAliases，仍拒絕未解析的來源／路由。
- Spring ViewResolver 讀取 application.properties 的 literal prefix/suffix；ModelAndView 僅接受唯一、直接所在 block、在建構之後及 return 之前的常值 setViewName。條件設定、alias、重複設定、未知呼叫維持未解析。
- Spring Web Flow 僅從實際登錄的 flow-location 讀取來源，建立 entry endpoint、狀態畫面與命名 submitter 的導向；不執行 evaluate／service，也不求值條件。遺失來源、重複狀態、循環／缺少目的有診斷，遍歷有深度／visited 邊界。submitterAction 是框架中立的元件屬性，讓不同按鈕的事件能保留各自目的。
- 巢狀按鈕繼承其來源中外層連結的操作，僅限沒有自身行為且不在表單中的按鈕；StableGraphIds 的身分輸入不加入新的推導屬性。
- JSP EL 只在 JS 字串／註解／template 之外替換為 AST 未知參數，保留原始 offset、行號及運算式；placeholder 節點明確標記，不能意外引用目標程式同名變數。未知參數不再使獨立、可證明的 DOM 操作整段失效。
- 經 AST 證明的 show/hide/toggle、literal DOM value assignment、message、reload、print 與已識別日期元件配置，寫入既有 AcornStaticAnalyzer evidence 的 JSON detail，使用 operation/selector/value/index/format/order 等資料欄位。viewer 只解讀固定允許清單；不 eval、不執行目標函式、不把目標 HTML 拼入父頁。
- 日期元件以 YX Popup Calendar 的來源簽章與 literal addCalendar/setFormat 宣告辨識，並用工具自己的日期控制與回填實作；沒有以 OLMS 的檔名、欄位名稱或 Calendar3 硬編碼。
- 由 pathname.split('/')[1] 組成的路徑前綴保留為 `{pathname.segment1}`，不是已證明的 servlet context path。後端 URL 對應只標為 INFERRED，保留原始運算式與候選；未知的標準 context expression 仍維持既有未解析規則。第一次完整 Maven 驗證抓到這個區別，已修正實作，沒有改既有斷言。
- AJAX 的成功／失敗 callback 分開提供示意結果；同一 callback 的受支持效果依來源順序處理，選擇前不套用成功分支的 reload。API 模擬不發送請求。
- 預覽同一行多元件的 ANCHOR 候選與既有驗證契約不變。viewer 可用工具產生的 data-st-component-id 在原候選集合內選定精確元件；沒有依文字、DOM 順序或相似度猜配。
- 本地 inline CSS 的 web-root URL 轉向已安全複製的 output assets，沿用既有檔案大小、symlink、輸出邊界與封裝限制。

Application Graph schema 仍為 2.2；PreviewModel 仍為 2。沒有新增相依套件、修改被分析專案、變動 API 移除規則／review 保存鍵／Markdown 格式，也沒有放寬 GraphIntegrityValidator 或資源邊界。

## 測試與取捨

新增小型回歸測試覆蓋 NetBeans 根路徑、view setter 與條件負例、properties resolver、registered Web Flow、缺少／循環 flow、控制項轉換、背景圖片封裝、未知 JSP 參數／同名變數／shadowed window 負例、固定效果允許清單與無目的節點的 UI 操作。

既有 production 測試斷言未改動。公開專案操作腳本只補足觀測：API 呼叫清單文字、實際點選成功／失敗回饋、日期選擇回填、print instrumentation；期望的路由、方法及來源行為沒有放寬。Graph audit 依原始標籤的 quoted attribute 範圍處理跨行 href，避免把屬性行號與標籤起始行號差異當成缺失。C02 旅程額外加入顯示數量、加入購物車與移除商品操作。

這是來源有證據的離線示意流程，並非將任意 JS 或後端程式移植為可執行應用。真實帳密、資料庫寫入、庫存／金額與服務回應沒有被宣稱為等價。最終驗證與限制見 `docs/reports/WORKFLOW_FIXES_20261018.md`。
