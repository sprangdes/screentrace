# 第五批公開專案：分析完整性與離線原型實測

日期：2026-10-20。工作包 WP75，分支 `fix/workflow-restoration`；受測 ScreenTrace commit `fbe78aa`。本批只測試及記錄，沒有修改產品、既有斷言或目標來源。前批 WF-035／036 仍待修復。

**目前不能完整還原這批專案的操作與功能。** 來源更正後的有效操作檢查為 **6 PASS／24 FAIL（30 項）**；3 條有效連續旅程 **1 PASS／2 FAIL**。21 個頁面／片段、21 個 Controller／Struts 設定路由、153 個來源控制項都在圖中，但 2 個 Security 配置入口缺失，4 個處理器的可能目的頁集合不正確，5 個本地 CSS 參照未封裝。支出新增後能到列表，卻沒有提交內容；不能把跳頁當成新增成功。

## 不重複專案與固定版本

三者均非 GitHub fork，與前 18 個 repository 沒有交集，沒有使用先前 Spring／Apache 樣本。完整排除清單、GitHub metadata 見 [non-duplication.json](completeness-batch5-20261020/non-duplication.json)；來源範圍與全部原始檔案雜湊見 [baseline.json](completeness-batch5-20261020/baseline.json)。

| 專案 | 固定 commit | 分析單位與技術 | 有效操作 PASS／總數 |
|---|---|---|---|
| [DXChaos/Materials-Program-Management](https://github.com/DXChaos/Materials-Program-Management/tree/d40fb7eb6a757519bed650b1853a3dba6c2394a2) | `d40fb7eb6a757519bed650b1853a3dba6c2394a2` | 同名子目錄；Struts 1.2、Spring 代理、DispatchAction、WebRoot、GB18030；物料登入、新增、修改、上傳、返回與檢核 | 0／9 |
| [atankit/Student-Management-system](https://github.com/atankit/Student-Management-system/tree/9bd13c7583eb2af2d18e539ec615718584a62fd4) | `9bd13c7583eb2af2d18e539ec615718584a62fd4` | repository 根目錄；Spring MVC／JSP、HibernateTemplate、圖片表單、側欄及學生新增／編輯／刪除 | 2／8 |
| [mohamed0sawy/Expenses-Tracker-WebApp](https://github.com/mohamed0sawy/Expenses-Tracker-WebApp/tree/c6b93fe58655af5047f0be2df62c2173fbbd4a9d) | `c6b93fe58655af5047f0be2df62c2173fbbd4a9d` | repository 根目錄；Boot／Thymeleaf、Security、DTO、片段導覽、支出 CRUD、篩選及確認取消 | 4／13 |

有效來源盤點：物料 `src/`、`WebRoot/`；其他兩者 `src/main/`。Java 僅讀 `.java`，不載入已編譯類別；原始雜湊涵蓋整個 checkout。物料 JSP 明示 `pageEncoding="GB18030"`，獨立來源基準依此解碼；少數 XML 為 UTF-8，嚴格解碼失敗時改按其 UTF-8 內容讀取。沒有轉碼或改寫目標檔案。

## 獨立來源盤點與分析正確性

| 專案 | 頁面／片段：來源／圖中 | Controller／Struts 路由 | 另列 Security 入口 | 來源控制項 | 目的頁集合正確 |
|---|---|---|---|---|---|
| 物料 | 7／7 | 4／4 | 0／0 | 47／47 | 2／4 |
| 學生 | 6／6 | 6／6 | 0／0 | 52／52 | 4／6 |
| 支出 | 8／8 | 11／11 | 2／0 | 54／54 | 11／11 |
| 合計 | 21／21 | 21／21 | 2／0 | 153／153 | 17／21 |

來源基準使用獨立 JavaParser、XML 及 HTMLParser，不呼叫 ScreenTrace 的解析器或從其輸出反推預期。51 個 Java 檔解析錯誤為 0；33 個 JS 單元以獨立 Acorn 語法盤點，解析錯誤為 0、frontend Ajax 呼叫為 0。這個 0／0 不提供 Ajax 正確性證據。必要圖節點的 source／evidence 沒有缺漏，但有證據不代表關係正確。

圖的 20 個 SCREEN 與來源的 21 頁面／片段數字不同：學生 `base.jsp` 是 TEMPLATE_FRAGMENT；相反，支出 `navbar.html` 雖被發現為 SCREEN，卻未正確組合到呼叫頁。數量完整不能替代組合與可操作性驗證。詳見 [來源盤點](completeness-batch5-20261020/source-census.json)、[比對](completeness-batch5-20261020/census-results.json)、[目的頁集合](completeness-batch5-20261020/return-results.json)。

## 實際離線原型操作

- 原 30 案例：4 PASS／26 FAIL。錯誤 selector 與其前置失敗保留，沒有將原始 FAIL 改成 PASS。
- 原 S01、S02 錯把 `base.jsp` 的相對 `add-student`／`studentlist` 當成以 `/add-student`／`/studentlist` 結尾；新增 X01、X02 依來源正確 selector，兩者 PASS。原 S08 依賴錯誤 selector，另以 X03 驗正確旅程。
- 有效分母：原 30 項排除 S01、S02、S08，加入 X01、X02、X03，仍為 30 項，6 PASS／24 FAIL。
- 有效旅程：MJ1 物料列表→新增→返回 FAIL；SJ2 學生首頁→新增→提交→列表 FAIL；EJ1 支出新增→列表→編輯→列表 PASS。原 SJ1 錯誤 selector 的 FAIL 仍保留，由 SJ2 取代有效旅程分母。
- 支出 E04、E05、E06 的導覽與 E10 的註冊可能目的集合通過；**E12 的新增資料回顯仍 FAIL**，`520`、`Trace expense 520` 均沒有出現在來源列表。
- 學生 X03／SJ2 在 S04 提交後無法回首頁；資料回顯尚未到達可驗證階段。不能把首頁上找不到學生文字當成已測出的儲存缺陷。
- E09 篩選操作被 E03 未展開的面板阻擋；尚未驗到實際篩選結果。登入與登出測的是來源路由／候選結果，沒有驗證真實認證、授權或 session。

原始 [操作結果](completeness-batch5-20261020/ui-results.json)、[補驗與正確旅程](completeness-batch5-20261020/supplementary-results.json)、[截圖](completeness-batch5-20261020/screenshots/)、[機器摘要](completeness-batch5-20261020/validation-summary.json)。

## 問題紀錄：全部尚未修正

以下路徑均相對各自分析單位；精確行號、原始片段、實際現象及驗收條件收在 [findings.json](completeness-batch5-20261020/findings.json)。

| ID | 專案／證據 | 實測問題 |
|---|---|---|
| WF-039 | 物料；`WebRoot/index.jsp:1–2`；M01 | 明示 GB18030 的來源被破壞為亂碼；標題、中文標籤與訊息無法忠實呈現。 |
| WF-040 | 物料；`src/applicationContext-actions.xml`、`LoginAction.java`、`BaseAction.java` | HANDLER 停在 DelegatingActionProxy.execute，缺實際 Action／command 分派與登入攔截；登入漏 index，且錯接其他 dispatch 的三個頁面。 |
| WF-041 | 物料；`item_maint.jsp` 的 `window.self.location`；M02–M05、M07、M09 | 相對請求與含未知 EL query 的路徑沒有連到已知目的；新增／修改／上傳／返回皆失敗。 |
| WF-042 | 物料；`../style/drp.css`、`../script/*.js` | 五個本地 CSS 參照均未封裝，五個存在的本地腳本參照未按來源請求目錄解析。 |
| WF-043 | 學生；`MainController.java:77,96`；S04、S06、S07 | `RedirectView.setUrl(request.getContextPath()+...)` 兩個處理器回傳未知；新增／更新回首頁與刪除回列表失敗。 |
| WF-044 | 學生；`studentlist.jsp:55` 及更新表單 | `${s.id }`、`${pageContext.request.contextPath }` 的空白與相對路徑未正確處理；編輯入口與表單未還原。 |
| WF-045 | 學生；`resources/js/main.js:3`；S03 | jQuery toggleClass 有 CONFIRMED 事件，但沒有可回放操作；側欄／內容的 class 前後不變。 |
| WF-046 | 支出；`list-page.html:44–55`；E03、E09 | 條件式 style.display 開關前後均隱藏；篩選旅程被阻擋。 |
| WF-047 | 支出；`th:replace`／`fragments/navbar.html`；E01、E02、E13 | 直接式及條件式 fragment 呼叫未組合；登入、註冊、清單、新增及登出導覽缺席。 |
| WF-048 | 支出；刪除連結的 `if(!(confirm(...))) return false`；E07、E08 | 沒有確認視窗，取消／確認流程未還原。 |
| WF-049 | 支出；`SecurityConfig.java:43,49`；E11、E13 | `/authenticateTheUser`、`/logout` 配置入口缺失；custom success handler 明示 `/list` 也未形成完整登入鏈。 |
| NC-006 | 支出；`MainController.submitAdd/list`；E12 | DTO／session／service 的資料鏈沒有示範契約；導覽成功後列表沒有新增金額與說明。 |

## 樣式、重現性與邊界

- 12 個來源內存在的 CSS 參照：7 PASS／5 FAIL；33 個外部樣式參照不抓取、不混入本地通過率。CSS 參照包含來源片段的呼叫畫面，並依 Spring resource mapping／來源請求路徑定位，見 [style-results.json](completeness-batch5-20261020/style-results.json)。
- 三個 CLI 均 exit 0，只證明成功生成檔案。兩次獨立 JVM／Chromium 執行，每次 41 份 graph、preview、style、HTML、PNG 產物雜湊一致，見 [determinism.json](completeness-batch5-20261020/determinism.json)。
- 報告連結檢查無失效路徑，14 個稽核腳本語法檢查通過；既有檢視器測試 114／114 通過。這些工具檢查不取代本批失敗的原型功能驗收，見 [audit-verification.json](completeness-batch5-20261020/audit-verification.json)。
- 377 個目標檔案雜湊及 checkout 狀態未變；8 個 UI 受測圖／HTML 雜湊與最終輸出一致，見 [來源不變檢查](completeness-batch5-20261020/source-integrity.json)、[產物身分核對](completeness-batch5-20261020/tested-artifact-identity.json)。
- 操作環境 pageerror 0、HTTP(S) 請求 0；所有來源 iframe 的 sandbox 皆為 `allow-same-origin`，沒有 `allow-scripts`。只執行工具自己的檢視器／模擬程式，不執行目標 Java、JSP、JS，不啟動目標、不連資料庫、後端或 CDN。
- 物料原始 `checkAll()` 用不存在的 id `ifAll`，checkbox 只有 name；`resetItem()` 把 value 指派給 NodeList，不是 input。另有上傳欄位的雙重引號 id。這些來源問題另外保留，沒有把它們當成可正確運作的原功能來要求 ScreenTrace。
- 初次 runner 曾將 S06 留在原清單誤判為成功；強化為同頁必須更換 iframe document 後為 FAIL。原初次結果保留在 [初次結果](completeness-batch5-20261020/ui-results-before-same-page-check.json)。
- 獨立盤點也更正過多行 XML 起始標籤來源範圍、Thymeleaf fallback name 與 JSP 巢狀標籤的 HTMLParser 詞法處理。原始盤點與全部更正原因保留於 [來源預期複核](completeness-batch5-20261020/source-oracle-review.json)；少數手寫來源列範圍以 [AST 精確位置](completeness-batch5-20261020/source-evidence-corrections.json) 為準。既有產品斷言沒有修改。

## 重現入口

先按 baseline.json 的 repository／commit 建立相同 checkout；暫存根為 `/private/tmp/screentrace-batch5-20261020/sources/`。ScreenTrace 本身的 jar／sidecar 雜湊見 [analysis-tool.json](completeness-batch5-20261020/analysis-tool.json)。本批產品程式未變更，沒有以既有完整套件通過宣稱本批失敗功能已修好。

在 ScreenTrace 根目錄依序執行本資料夾的 `build-baseline.py`、`build-workflows.py`、`js-inputs.py`、`js-census.mjs`、`analyze.py`、`audit-census.py`、`audit-returns.py`、`audit-styles.py`、`workflows.mjs`；再設 `ST_BATCH5_SUPPLEMENTARY=1 ST_BATCH5_UI_RESULT=supplementary-results.json` 執行 workflows.mjs，之後執行 `determinism.py`、`check-integrity.py`、`build-findings.py`、`summarize.py`。擷取與瀏覽器需要既有工具 Playwright／Chromium，不安裝或執行目標依賴。

workflow 腳本存在 FAIL 時 exit 1，這是保留的實測失敗；analysis-runs.json 中個別 CLI 結果另列。完整生成輸出在既有忽略目錄 `analyze/completeness-batch5-20261020/`；可追蹤的來源基準、腳本、問題、雜湊、原始結果與截圖在本報告資料夾。
