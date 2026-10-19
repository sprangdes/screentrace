# 第四批公開專案：分析完整性與離線流程實測

- 日期：2026-10-19；受測 ScreenTrace：`f285bdc0deddfe801498ea436ed08f8ee5af9440`（WP72）。
- 本批只有測試、來源盤點與問題記錄，**未修改產品或被分析專案**，不宣稱新失敗已修復。
- [機器可讀結果](completeness-batch4-20261019/validation-summary.json)、[逐案矩陣](completeness-batch4-20261019/CASE_MATRIX.md)、[問題清單及來源行號](completeness-batch4-20261019/findings.json)。

## 結果

三次 CLI 全部 exit 0，三份離線單檔 HTML 都可開啟；來源盤點的 **32 個頁面／片段、52 條路由、179 個控制項全部被發現**。這些數量沒有證明流程或功能正確。

有效操作檢查 **33 項：10 PASS／23 FAIL**；5 條多步旅程 **1 PASS／4 FAIL**。有實體來源的 41 個 Action／非 REST handler 目的頁集合只有 **31 個完整、10 個失敗**；另有 3 個 handler 回傳原專案不存在的模板，單獨分類。**13 個來源內存在的 CSS 引用均未封裝到對應單檔頁面**；外部 CDN 不計入這個分母。

原 31 個檢查仍保留 10 PASS／21 FAIL。H11 最初錯把來源的 `dd-MM-yyyy` 顯示預期寫成 ISO，且旅客姓名取決於是否查到既有旅客；原結果不改寫，但排除有效成績。另加 X01 樣式、X02 日期聯動、X03 正確電話／日期格式三個來源檢查，全部 FAIL。因此有效成績是原 30 個有效案例加上這三個補測，沒有把錯誤預期算成產品缺陷。見 [預期校正紀錄](completeness-batch4-20261019/source-expectation-review.json)、[補測結果](completeness-batch4-20261019/supplementary-results.json)。

## 新專案與固定版本

三個 repository 都不是 fork，且不在前面 15 個受測 repository 中，也沒有使用 Apache／Spring 官方範例。完整排除名單及 GitHub 選取資訊見 [non-duplication.json](completeness-batch4-20261019/non-duplication.json)。

| 專案／分析單位 | 固定 commit | 技術與操作範圍 | 有效案例 |
|---|---|---|---:|
| [ImanNazirah/demo-struts1](https://github.com/ImanNazirah/demo-struts1/tree/c17a963c1b236be573cf43b9e0da4ee6c81529d7) | `c17a963c1b236be573cf43b9e0da4ee6c81529d7` | Struts 1、Tiles；登入、側欄、分頁清單、新增／編輯入口、表單分支、下拉選單 | 3 PASS／6 FAIL |
| [satyam131/Library-Management-Web-Application-with-RESTful-Web-Services](https://github.com/satyam131/Library-Management-Web-Application-with-RESTful-Web-Services/tree/1d1b858fcca3db6c51c2764058369d7bc2af2be6)／`App1Assignment5` | `1d1b858fcca3db6c51c2764058369d7bc2af2be6` | Spring MVC／JSP；註冊、登入、書籍新增／編輯／刪除、登出與數字過濾 | 0 PASS／10 FAIL |
| [FathimaNufla2000/Hotel-Management-System-Spring-Boot](https://github.com/FathimaNufla2000/Hotel-Management-System-Spring-Boot/tree/9d1c1ba2bb109faa7bc58dea4290c0ab63545aab) | `9d1c1ba2bb109faa7bc58dea4290c0ab63545aab` | Boot／Thymeleaf；管理登入、房間、刪除確認、訂房、資料回顯、日期與樣式；含 X01–X03，排除 H11 | 7 PASS／7 FAIL |

圖書館 repository 的 App1／App2 是兩個獨立 Maven 應用；本次 CLI 輸入是提供 JSP 的 **App1Assignment5**，未把 App2 後端當成另一個新專案，也未宣稱分析了 App2 或跨伺服器呼叫全貌。來源雜湊涵蓋整個 checkout，包含已追蹤的 target 檔案，但有效來源盤點只看 `src/main/`，避免把編譯副本重複計為頁面。

## 盤點與圖正確性

使用獨立 JavaParser census、XML、HTMLParser 與 Acorn 讀取來源，不匯入產品 analyzer 作為預期答案。操作預期來自來源控制項、controller、Struts／Tiles 設定；不從生成結果反推。來源盤點及原操作預期在第一次檢視生成圖／頁面前建立。

| 分析單位 | 頁面／片段 | 路由 | 控制項 | Action／非 REST handler 目的頁集合 |
|---|---:|---:|---:|---|
| demo-struts1 | 16/16 | 10/10 | 30/30 | 10 PASS |
| App1Assignment5 | 5/5 | 10/10 | 42/42 | 10 FAIL |
| Hotel | 11/11 | 32/32 | 107/107 | 21 PASS；3 SOURCE_MISSING_VIEW |

[盤點結果](completeness-batch4-20261019/census-results.json)沒有缺少來源證據的關鍵圖節點；[回傳逐項比對](completeness-batch4-20261019/return-results.json)保留預期、實際、missing、extra 及來源位置。回傳驗收是有限語法的可能目的頁集合，不執行條件，也不涵蓋任意例外／服務程式。

圖書管理產生 9 個 SCREEN，其中 5 個是實體 JSP，另 4 個 logical SCREEN 沒有接到實體頁；只有 5 份預覽 document。旅館有 14 個 SCREEN，11 份 document，另外 3 個源自原專案缺失模板。不能用「SCREEN 節點數比較多」當作更完整。

獨立 Acorn 盤點 7 個腳本／事件單位、23 個指定類型呼叫、0 parse error。這批來源沒有前端 fetch／Ajax 呼叫，**沒有可計為通過的 Ajax 測試分母**；不沿用上一批 36 個 Ajax 成績。

## 已記錄問題

以下十個 WF 與兩個 NC 都仍未修正。詳細原始碼連結、行號、案例對應及觀察保存在 [findings.json](completeness-batch4-20261019/findings.json)。

| 編號 | 案例 | 結果與影響 |
|---|---|---|
| WF-024 | L02、L04–L06、L08–L10 | Java `InternalResourceViewResolver` 只設定 `.jsp` suffix，未採用預設空 prefix；AddBook／EditBook／bookListing／login 被拆成 logical 與實體 SCREEN。七個 view 回傳報找不到 JSP，儘管五個實體 JSP 已盤點到。 |
| WF-025 | L01；兩個 redirect handler | `redirect:login.jsp`、`redirect:register.jsp` 都保持未解析，註冊入口走不到存在的 public JSP。必須保留請求目錄／context 不確定性，不能硬猜 URL；目前仍缺少這個來源可描述的相對轉址流程。 |
| WF-026 | L03 | `new ModelAndView()` 後在 if/else 內 `setViewName`、再 return mv 的兩個回傳都未解析；WF-016 的已初始化 alias 新反例，與前輪未初始化 alias 再賦值不同。 |
| WF-027 | S07、S09、H07 | Struts `c:set actionUrl` 的 create/update/delete，以及 Thymeleaf room form 的 add/update ternary，沒有完整請求分支。既有 endpoint 都存在；表單仍無法送到可選結果。這包含原先明示的 c:set 支援邊界，並非要求把未知誤升為已確認。 |
| WF-028 | H08 | 同一 Thymeleaf Delete 被拆成兩個 component ID：畫面使用的節點只有 NAVIGATE，另一個才有 OPEN_DIALOG。實際點擊只出未知選項，沒有確認窗，無法驗收取消；[圖證據](completeness-batch4-20261019/graph-probes.json)。 |
| WF-029 | S05 | DOMContentLoaded 裡的原生 body.classList.toggle 沒有重播，點側欄按鈕前後 class 相同。 |
| WF-030 | L07 | 輸入 `12a3` 實際保留 `12a3`；來源 keypress 回傳正則檢查，應阻止字母，留下 `123`。 |
| WF-031 | X02 | 入住 `2026-11-01` 後，來源應將退房 min 設為 `2026-11-02`，原型仍為 null。沒有拿與當天時間有關的 today 值當斷言。 |
| WF-032 | X01；13 個本機 CSS 引用 | 旅館 11 個 th:href CSS、圖書管理 2 個相對 CSS 都沒有封裝到對應頁面。旅館 body 實測是透明背景／Times，來源為 `--bg: #f5f7fb`／system-ui。外部圖片缺失不會解釋這些已存在的本機 CSS。 |
| WF-033 | H03 | 初次 GET login 未提供 error，原型卻顯示 Invalid username or password，沒有套用 th:if 條件。這不是一次失敗登入後的訊息。 |
| NC-004 | X03；H11 僅保留歷史結果 | H10 走到正確確認頁，但電話與正確格式的輸入日期沒有跟過去；確認頁保留來源模板示例值。未要求捏造 SQL／房況／價格／既有旅客姓名，只驗收成功示範分支中可追溯的輸入回顯。 |
| NC-005 | H09 | Book Now 的來源有 `/book/{roomId}` → booking-form 關係，但工具因無法識別示範資料列而停住，顯示「示範資料無法確認操作的資料列或欄位」。ID 應維持未知，目前連已知表單流程也無法展示。 |

WF-024 的預期不是猜測 framework 預設：App1 使用 Spring 5.2.9；其 [UrlBasedViewResolver 原始碼](https://github.com/spring-projects/spring-framework/blob/v5.2.9.RELEASE/spring-webmvc/src/main/java/org/springframework/web/servlet/view/UrlBasedViewResolver.java#L110) 將 prefix 初始化為空字串，目標 MyMvcConfig 只呼叫 setSuffix。ScreenTrace 的 Java resolver 採用條件要求 prefix 與 suffix 都非 null；本批未改動它。

## 外部依賴、原專案與測試預期限制

- **EXT-001：S03／S06／S08 仍為 FAIL，但不當成路由漏解析。** Struts 新增、dropdown、編輯控制項只有圖示，Bootstrap／SB Admin／Font Awesome／DataTables CSS 都在外部 CDN；離線頁面缺圖示／尺寸，控制項存在卻沒有可見點擊區域。未強制點擊隱藏元素，也未下載遠端素材冒充本機來源。
- **SRC-001：三個缺失模板。** `/cancel-booking` GET／POST 及 `/my-bookings` 分別回傳 visitor/cancel-booking、visitor/cancel-success、visitor/my-bookings。`src` 及已追蹤的 target 模板都不存在這三檔，歸 SOURCE_MISSING_VIEW；未修改目標來源補頁。
- **H11 預期錯誤保留。** 最初 ISO 日期字串與姓名預期不夠精確；排除有效成績，新增 X03 只查電話與來源指定的 `dd-MM-yyyy`。X03 仍失敗，才作為 NC-004 的正式證據。
- **定位器診斷保留。** 第一輪直接用 href/action/onclick 定位，誤把安全移除屬性當成缺少控制項。改用相同來源元件的 `data-st-component-id` 後重跑；目的頁、資料、樣式與狀態斷言完全不放寬。第一輪 [診斷結果](completeness-batch4-20261019/ui-results-selector-diagnostic1.json)及 [診斷截圖](completeness-batch4-20261019/screenshots-selector-diagnostic1/)不計入成績；正式 [UI 結果](completeness-batch4-20261019/ui-results.json)對每案保存 effectiveSelector。

## 旅程、證據與邊界

| 旅程 | 結果 | 停止點 |
|---|---|---|
| SJ1：登入 → 分頁清單 → 新增 → 取消返回 | FAIL | S03 圖示按鈕不可見 |
| LJ1：登入頁 → 註冊 → 登入 → 書籍新增表單 | FAIL | L01 相對 redirect 未解析 |
| LJ2：書籍清單 → 新增 → 資料回顯 | FAIL | L04 logical view 未接到實體 JSP |
| HJ1：首頁 → 管理登入 → 房間清單 → 新增表單 | PASS | 逐次選取來源明示的已登入／目標頁分支；不代表驗證真實身份或成功新增房間 |
| HJ2：首頁 → 訂房 → 輸入與確認回顯 | FAIL | H09 示範資料列無法識別 |

三個正式瀏覽器 context 與補測合計 0 page error、0 HTTP(S) 外部請求。這只證明離線執行環境可用，不能替代失敗的功能驗收。沒有建置／啟動目標應用、執行目標 JavaScript／Java、連資料庫／REST server、建立帳號或訂房；測的是靜態來源與工具自己的離線模擬。

244 個來源 checkout 檔案（54+101+89）分析前後 SHA-256 全部相同，無新增／刪除，三個 git checkout 均乾淨：[完整性](completeness-batch4-20261019/source-integrity.json)。來源根目錄與所有檔案雜湊：[baseline.json](completeness-batch4-20261019/baseline.json)。99 個生成產物的雜湊：[artifact-hashes.json](completeness-batch4-20261019/artifact-hashes.json)；[實際 CLI 命令](completeness-batch4-20261019/analysis-runs.json)、[日誌](completeness-batch4-20261019/logs/)、[正式截圖](completeness-batch4-20261019/screenshots/)。

單檔 HTML 位於 `analyze/completeness-batch4-20261019/<分析單位>/report/screentrace-report.html`（忽略目錄），歷史輸出未覆寫。沒有以這批測試宣稱消除前輪 WF-023 的頭像像素差異，也沒有重跑未修改產品的完整標準套件。文件連結檢查 2 PASS／0 FAIL：[日誌](completeness-batch4-20261019/logs/docs-check.log)。重現方式見 [README](completeness-batch4-20261019/README.md)。
