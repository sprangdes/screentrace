# 新增公開專案完整性實測第三批 — 2026-10-18

**結論：目前還不足以完整、正確還原這批專案的操作與功能。** 基礎盤點找到 37/37 個頁面／片段、73/73 個路由、334/334 個控制項，但來源的 36 個 Ajax 呼叫沒有對應 CALL_API 行為；48 個 Spring 非 REST 處理器中，24 個的可能目的頁集合不完整。實際點擊生成的離線原型，41 案例 14 PASS／27 FAIL，5 條連續旅程 3 PASS／2 FAIL。頁面數、CLI 成功和導覽成功均未當作功能完整的證據。

本批使用四個未出現在前兩批的公開專案，均非 GitHub fork；未使用先前五個 Spring／Apache 樣本。Spring MVC／Boot 是待測技術，這裡測的是其他作者的業務應用，並非重用官方示範。

## 版本與範圍

ScreenTrace：`06476eee07eab32320c7866f4e9d7f98733e8a84`，分支 `fix/workflow-restoration`。本次只新增測試與問題記錄，未修改產品程式碼，未宣稱新問題已修復。

| 專案 | 固定來源版本 | 型態 | 原型操作 PASS／總數 |
|---|---|---|---:|
| [contract-management-system](https://github.com/r-watanabe-02/contract-management-system/tree/55a5761798de195231727d210adcb94d4d535f34) | `55a5761798de195231727d210adcb94d4d535f34` | Struts 1 契約管理 | 4/7 |
| [Fintech-Finance-Banking-Application](https://github.com/deep1020/Fintech-Finance-Banking-Application/tree/5713a5b77eac5d4714beb89de1f7a4a8335560a1) | `5713a5b77eac5d4714beb89de1f7a4a8335560a1` | Spring Boot/JSP 網銀 | 4/9 |
| [SpringMVC-IMS](https://github.com/amiSotun/SpringMVC-IMS/tree/6a426bdd2aafa27bbad22148adb193faa7658061) | `6a426bdd2aafa27bbad22148adb193faa7658061` | Spring MVC 庫存管理 | 1/13 |
| [airlines_system](https://github.com/isilkiziltas/airlines_system/tree/1a29ec168d33bc17dd6d9a1332131cd48b17609f) | `1a29ec168d33bc17dd6d9a1332131cd48b17609f` | Boot/Thymeleaf 航空訂位；分析子目錄 `airline_system` | 5/12 |

IMS 的 NetBeans 設定 `nbproject/project.properties:85,90` 指向 `src/java`、`web`。獨立基準排除 `build` 的編譯副本及非啟用的 `WebRoot/index.jsp`；其餘專案盤點 `src/main`。這是來源設定決定的範圍，不是為配合分析結果而刪除漏失。

## 獨立盤點與關係正確性

先以獨立 JavaParser AST／XML／HTMLParser／Acorn 工具建立來源清單，再比對 Application Graph；不把 ScreenTrace 的輸出當成預期答案。來源與版本、所有檔案 SHA-256 見 [baseline.json](completeness-batch3-20261018/baseline.json)。

| 專案 | 頁面／片段 | 路由 | 控制項 | JS request 呼叫點 | Spring 可能目的頁集合正確的處理器 |
|---|---:|---:|---:|---:|---:|
| 契約管理 | 3/3 | 4/4 | 10/10 | **0/1** | Struts 另計 4/4 action 通過 |
| 網銀 | 17/17 | 17/17 | 54/54 | 無 | **15/16** |
| 庫存管理 | 13/13 | 45/45 | 231/231 | **0/35** | **2/25** |
| 航空訂位 | 4/4 | 7/7 | 39/39 | 無 | 7/7 |

- 路由逐一核對來源檔案、行號、path、HTTP method；控制項逐一核對來源位置、tag 及欄位身份，採一對一匹配。控制項數包含表單和輸入欄位，不等於可執行功能數。
- Java 及第一方 JS 語法盤點沒有 parse failure；JS 排除的 78 個套件檔逐檔列於 [js-exclusions.json](completeness-batch3-20261018/js-exclusions.json)。沒有因為副檔名 `.min.js` 一律排除第一方檔案。
- 36 個 Ajax 數字是獨立 AST 的**呼叫點**，不是 36 個不同 API；`$.ajax(request)` 未能由獨立工具求得 URL 的項目仍保留未知，不猜路由。
- 48 個 Spring 非 REST 處理器做「原始碼字面 return／ModelAndView + redirect 的可能終端頁集合」核對：24 通過、24 失敗，缺少 48 個處理器→頁面的集合成員，沒有多餘目的頁。這不是對所有分支條件、執行順序或服務副作用的完整證明。
- 網銀 `/verify` 少 login/error 兩頁；IMS 的 23 個處理器各少業務頁與 loginform（共 46 個集合成員）。IMS 的新增／修改／刪除 redirect 也繼承這個未解析缺口。這些結果有 unresolved 診斷，屬「未還原」，不誤稱為已確認的錯誤跳轉。
- 契約的 4 個 action（含無 JSP 回傳的文字查詢）、4 個設定 forward 經 redirect 展開後，可能終端 JSP 集合均相符。
- 所有受檢畫面／元件／endpoint／handler 均有來源與 evidence；**有追溯資訊不代表內容正確**。
- 額外結果：契約產生一個 unresolved `contractDelete.do` endpoint，未與已存在的 `/contractDelete.do` action 合併；IMS 多產生非啟用 `WebRoot/index.jsp` 畫面。未把它們計成成功發現的有效路由／頁面。

完整逐項證據：[census-results.json](completeness-batch3-20261018/census-results.json)、[return-results.json](completeness-batch3-20261018/return-results.json)、[struts-return-results.json](completeness-batch3-20261018/struts-return-results.json)。

## 原型點擊與完整旅程

測試直接操作四份生成的 HTML，填入欄位、點擊導覽／送出、檢查後續頁候選、彈窗可見性、錯誤訊息及表格中的新資料。每個孤立案例重新開啟報表；旅程只在第一頁聚焦，之後不跳頁補救、不強制點擊隱藏控制項、不改 DOM。

| 旅程 | 結果 | 實際意義 |
|---|---|---|
| CJ1：契約輸入→列表→輸入→提交→選成功頁→返回 | PASS | 只證明導航及兩個回傳候選；未證明 Oracle 寫入、年齡校驗或結果值正確 |
| BJ1：首頁→註冊→登入→首頁 | PASS | 導覽旅程，沒有成功建立／驗證帳戶 |
| IJ1：首頁→登入→儀表板→分類 | FAIL | `loginCheck` 未提供 dashboard/loginform，停在 I02 |
| AJ1：首頁→航班→旅客→訂位→首頁 | PASS | 四頁導覽；不含訂位成功 |
| AJ2：航班→旅客→新增旅客→訂位選項 | FAIL | 新增後未出現輸入的 ID／姓名，停在 A10，後段未執行 |

B04 登入可列出 dashboard/login/error 候選，判定的是**候選頁集合**，不是有效登入或權限驗證。B09 註冊密碼不一致，已逐一選取四個同頁候選，仍無原始碼指定的錯誤訊息；沒有因為「尚未選分支」誤判失敗。A12 只證明訂位下拉有一個非空示例選項，不證明它來自新建航班、資料正確或能完成訂位。

離線 HTML 為安全投影，會移除 `href`／`onclick`；正式測試用來源 provenance 找到同一個控制項再真實點擊。前兩輪僅定位器診斷保留於 `ui-results-selector-diagnostic*.json`，不納入產品缺陷或正式成績。第二輪亦發現同頁多分支需 `.first()` 選定候選、同一 URL 可有多個原始連結，已修正定位；沒有改產品或放寬功能斷言。下拉選項原有任意「至少 2 個」門檻改為來源能支持的「存在非空選項」，此項只保留為基本可用性檢查。

## 問題記錄

以下均待修復／擴充；以來源可證明的行為與實際原型結果區分。

| ID | 優先級 | 專案、來源證據（相對該專案根目錄） | 問題／驗收條件 |
|---|---|---|---|
| WF-014 | P1 | 契約 `src/main/webapp/input.jsp:159–179`；C05 | `$.ajax(...).done(...).fail(...)` 查重沒有 CALL_API，也沒有 NG／OK／通訊失敗回饋。產品 `screentrace-js/analyzer.mjs:130` 的已識別 callback 鏈包含 done/catch、缺 fail，與此症狀一致；修復時仍須覆蓋鏈內請求與三條回饋，不能只消除 UNKNOWN。 |
| WF-015 | P1 | IMS `web/WEB-INF/jsp/footer.jsp:30–62`、`web/resources/JS/categoryHandaler.js:14,35,53,73` 等；I11 | 已存在且由 footer 載入的第一方 handlers 沒有解析到，35 個 Ajax 呼叫全漏失。footer 的相對 `resources/JS/...` 應按有效 web root／請求上下文解析；目前把 JSP 實體目錄當相對基準會找不到。需保留頁面條件及 modal／keyup 觸發。 |
| WF-016 | P1 | 網銀 `src/main/java/com/bank_springboot/controllers/IndexController.java:34–52`；IMS `src/java/com/emp/controller/*Controller.java`；I02–I09 | 分支賦值後 return ModelAndView alias 不完整，漏掉 `/verify` 及 23 個 IMS handler 的可能目的頁；需保留條件而非任選一頁。完整檔案／行號見 return-results。 |
| WF-017 | P1 | 網銀 `src/main/webapp/WEB-INF/jsp/dashboard.jsp:20,24,27,56,60,66`；B05–B08 | `c:import` 片段有被獨立發現，卻未組合成 dashboard；付款歷史連結、Add account、Transact、交易類型選單不在實際頁面。需還原頁面組合及條件內容，並可開啟 offcanvas／切換交易表單。 |
| WF-018 | P2 | 契約 `src/main/webapp/input.jsp:204`；C06 | `html:text styleId="contractorNameField"` 保留成無效 styleId，沒有投影到 HTML id，破壞 label／JS selector；應保留實際 id 綁定。 |
| WF-019 | P1 | 契約 `src/main/webapp/list.jsp:103–105`；C07 | 內含 bean:write 的 href 沒保住可操作 a，原型只剩「削除」文字；也多出 unresolved endpoint。需保留動態參數、連到既有 action、顯示確認且取消不刪除；不能把未知 ID 猜成真實值。 |
| WF-020 | P1 | IMS `web/WEB-INF/jsp/category.jsp:23,94,95`；I10,I12,I13 | Insert 按鈕無法開 modal；Edit/Delete 顯示已知 modal 加未知候選，點擊後沒有直接開啟來源指定的彈窗。需按來源 data-toggle/data-target 還原無條件開窗，再還原 shown.bs.modal 資料載入，不能只發現 modal 節點。 |
| WF-021 | P1 | 網銀 `src/main/java/com/bank_springboot/controllers/RegisterController.java:67–69`；B09 | 密碼不一致有明確 model 錯誤訊息，但四個 register 候選都未顯示 `passwords do not match`。回到相同頁不等於驗證／錯誤功能已還原。 |
| WF-022 | P2 | IMS `nbproject/project.properties:90` 對照 `WebRoot/index.jsp` | 未啟用的舊 web root 被納入有效畫面；應區分未使用來源、啟用 web root 及無法證明的入口。此項為額外盤點誤收，非 UI 案例。 |
| NC-002 | P1，支援缺口 | 航空 `src/main/resources/templates/passengers.html:55,59,63`、`flights.html:55,71`；A05–A09 | 已支援的 Thymeleaf URL 投影沒有搭配 `th:field`→name 綁定。五個欄位均缺 name；目前不能宣稱 Thymeleaf 表單功能完整。 |
| NC-003 | P1，支援缺口 | 航空 `src/main/java/com/airline/controller/WebController.java:50–77`；A10,A11,AJ2 | 新增旅客顯示「示範資料無法確認操作的資料列或欄位」；新增航班雖停在正確頁，表格沒有新增內容。示範 CRUD／字串識別碼、model 集合與模板投影未完整串接。需以新增行的實際值及後續訂位選項驗收，不能只驗收 redirect。 |

原專案限制另外記錄：航空 passengers.html:102,105 與 reservations.html:122 的 edit/delete 按鈕沒有事件／表單／路由；IMS 的「I forgot my password」是 `href="#"`。它們是原始佔位控制項，未當作 ScreenTrace 漏還原功能的失敗案例。航空 controller 捕捉例外後直接 redirect，也不能僅憑跳頁判定業務成功。外部 CDN 的視覺差異沒有當作 API 或流程正確性缺陷。

## 驗證邊界與證據

- 四次 ScreenTrace CLI 全部 exit 0，四份 HTML 全部能開啟；正式瀏覽器測試共 0 page error、0 HTTP(S) 外部請求。這些只代表分析／預覽基礎設施可用。
- 未執行目標 JavaScript、未建置或啟動目標專案、未連資料庫／後端；未驗證真實登入、權限、餘額、交易、Oracle 寫入或並發正確性。比對的是原始碼證據與生成的靜態模擬。通過案例不等於原系統所有功能等價。
- Contract 的年齡 0–120、手寫後端驗證與 bean 資料展示未完成全面功能驗證；若要宣稱完整須補測。HTMLParser 對 JSP 內嵌標籤、動態字串及自訂標籤不是完整 JSP 編譯器；盤點結果僅針對已列出的語法與有效來源範圍，不以 334/334 宣稱所有語義都已解析。
- 781 個來源檔案（52+154+554+21）前後 SHA-256 相符，無新增／刪除，四個 Git checkout 均乾淨，見 [source-integrity.json](completeness-batch3-20261018/source-integrity.json)。
- [正式 UI 結果](completeness-batch3-20261018/ui-results.json)、[來源預期與旅程](completeness-batch3-20261018/workflow-baseline.json)、[截圖](completeness-batch3-20261018/screenshots/)、[CLI／UI 日誌](completeness-batch3-20261018/logs/)。失敗保持 FAIL，測試 runner exit 1 是預期保留的驗收失敗。
- 生成的四份報表與 graph 位於 `analyze/completeness-batch3-20261018/<project>/`（忽略目錄）；提交的證據與重現程式位於本報告同名子目錄。未重跑產品標準套件，因本批未修改產品程式。

逐案對照：[41 個操作案例矩陣](completeness-batch3-20261018/CASE_MATRIX.md)；[重現步驟](completeness-batch3-20261018/README.md)；[受測產物 SHA-256](completeness-batch3-20261018/artifact-hashes.json)。
