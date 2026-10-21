# WP77：第六批不重複公開專案實測（2026-10-20）

42 項有效操作檢查為 **19 PASS／23 FAIL**，6 條有效旅程為 **4 PASS／2 FAIL**。頁面與路由盤點完整，不代表靜態網頁已還原操作和資料功能；本批仍未達功能等價。新增 WF-051–055、NC-008–009，狀態均為 OPEN。本工作包只有測試、證據及文件，沒有修改產品。

## 專案與版本

被測 ScreenTrace：`f53c703742045211c411ff3b8ddcbe16df7bde81`，分支 `fix/workflow-restoration`。完整版本、來源 SHA-256 與 CLI jar SHA-256 見 [baseline](completeness-batch6-20261020/baseline.json)、[證據雜湊](completeness-batch6-20261020/evidence-hashes.json)。

| 公開專案 | 固定 commit | 來源範圍與功能 | 頁面／片段 | 路由 | 控制項 | 有效操作 PASS／FAIL |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| [maiconfz/java7-struts1-jquery-bootstrap3-web-project](https://github.com/maiconfz/java7-struts1-jquery-bootstrap3-web-project) | `ea2bf6e6c8afa07fcd49f74f30788b82dc3ae152` | Struts 1、JSP、登入／使用者 CRUD、國家城市 Ajax、物件成員事件 | 11 | 6 | 33 | 0／14 |
| [chiangs/InventoryMGRSpringMVCCRUD](https://github.com/chiangs/InventoryMGRSpringMVCCRUD) | `8dc5125775b23fdd1b910d48b8614c0b914c7348` | MVC、JSP、公開 HTML、庫存 CRUD、CSV 初始化與記憶體 DAO | 7 | 9 | 136 | 9／6 |
| [Prayzez/springboot-todolist](https://github.com/Prayzez/springboot-todolist) | `1255faa1235fbb6660fe843e91d3735946bd1098` | Boot、Thymeleaf、Todo CRUD、Controller 內 DTO 複製、排序 Repository 清單 | 4 | 7 | 17 | 10／3 |
| 合計 | | | 22 | 22 | 186 | 19／23 |

三個 repository 皆非 fork，與先前 21 個 repository 無交集；不是 Spring／Apache 官方範例。[排重與選取紀錄](completeness-batch6-20261020/non-duplication.json)包含既有名單及 GitHub metadata。排重以 repository 身分為準，未宣稱三者在網際網路上沒有共用範例或程式片段。

## 驗證範圍及結果

來源預期由獨立 JavaParser／XML／HTML 盤點、Acorn 及人工核對原始 controller、DAO、模板與事件建立；再對照 Application Graph、封裝 CSS 及生成報表。未建置、啟動或執行任何目標應用／來源腳本；沒有 DB、CDN 或後端服務連線。只執行可信任的 ScreenTrace 分析器和檢視器。來源頁 iframe sandbox 為 `allow-same-origin`，沒有 `allow-scripts`；瀏覽器無 page error、無外部請求。

| 檢查 | 結果 | 解讀限制 |
| --- | --- | --- |
| 來源 AST | 57 Java 檔、12 JS／事件單元，解析錯誤 0 | 靜態解析成功不等於語意全涵蓋 |
| 頁面／路由／控制項發現 | 22／22、22／22、186／186；來源證據缺失節點 0 | 計數包括頁面片段、hidden controls；不代表所有事件可操作 |
| 來源 handler 可能目的頁集合 | 22／22 PASS | Struts 採有限且不區分執行路徑的 forward 閉包，未證明認證／session 分支可達性；JSON API 預期沒有實體頁面 |
| Ajax 呼叫 | 0／1 | 源碼的城市查詢未連入操作圖；未真的發送 HTTP |
| 現存本地 CSS 參照 | 0／17 PASS | Struts 5、Inventory 12 皆未正確封裝連結；另 1 個來源缺檔、29 個外部參照另列 |
| 原始操作 39 項 | 17 PASS／22 FAIL | 包含 4 個 selector／相依步驟有誤的原案例，未刪除 FAIL |
| 補充操作 7 項 | 2 PASS／5 FAIL | 修正測試定位，保留原預期目的頁／訊息／資料斷言；另隔離 hidden action |
| 有效操作 42 項 | 19 PASS／23 FAIL | 原 39 扣除 4 個無效案例，再加入補充 7 項 |
| 原始旅程 6 條 | 3 PASS／3 FAIL | IJ1 依賴錯誤 selector，不當作產品功能失敗證明 |
| 有效旅程 6 條 | 4 PASS／2 FAIL | IJ1 由來源定位正確的 IJ3 替代；旅程只證明所列導覽步驟 |
| 來源完整性 | 217 檔逐位元組不變，三個 checkout 皆乾淨 | 140／57／20 檔，無新增／刪除／修改 |
| 結果一致性 | 兩次各 41 份產物 SHA-256 一致 | graph／preview／prototype／viewer／report／style／PNG；測試使用的 10 個 graph/report 身分皆吻合 |

完整逐項結果見 [validation-summary](completeness-batch6-20261020/validation-summary.json)、[來源盤點](completeness-batch6-20261020/source-census.json)、[盤點對照](completeness-batch6-20261020/census-results.json)、[回傳集合](completeness-batch6-20261020/return-results.json)、[CSS](completeness-batch6-20261020/style-results.json)、[JS](completeness-batch6-20261020/js-census.json)。

## 新發現問題

| 編號 | 問題與來源證據 | 實測結果 |
| --- | --- | --- |
| WF-051 | 已註冊 `/*` 的 `RequestAttrSetterFilter.java:23` 以 `req.setAttribute("contextPath", req.getServletContext().getContextPath())` 設定別名，模板以 `${contextPath}` 組成本地連結／表單／資源 | S01–S11 導覽、分支或 API 斷言失敗；3 個本地 script src、5 個本地 CSS 未解析。應保留部署 context 的符號關係，不能猜固定 context 名稱 |
| WF-052 | Struts `form.js` 的 `form.btn.$validate/$save.on`、`form.$action.val`、`form.user.$country.on` 經 `CityService.findAllByCountryId()` 呼叫 `$.get` | Z05／Z06 hidden action 未變；S10 Ajax 缺失。額外直接提供兩份惰性來源文字給 AST 分析器，仍 0 CALL_API／15 diagnostics，證明除了 script src 收集外另有物件成員／class 追蹤缺口 |
| WF-053 | Inventory 的 `WebContent/index.html` → `GetInventory.do`，及列表 → `contact.html`，來源與目的頁均存在 | I01／I14 均顯示「無法確定前往哪個畫面」。公開 HTML 雖有被盤點，跨公開頁／controller 的導覽關係不完整 |
| WF-054 | Inventory `WebContent/styles/*.css`，由公開頁及 private JSP 的 `styles/...` 引用 | 12 個現存本地 CSS 參照全部失敗；Z03／Z04 截圖保留缺樣式狀態 |
| WF-055 | Inventory `Product.java:10/14` 的 `@Size/@Pattern`、`ProductController.java:84` 錯誤回傳、JSP `form:errors` | Z03 明確選取同頁錯誤分支且 iframe 換頁後，仍缺 `Please enter a brand`、`Size is in cl, atleast 1 digit` |
| NC-008 | Inventory `ProductDAOImpl.java` 的 `@PostConstruct` CSV 初始化、`addProduct`／`editProduct`，以及 controller 的 inventory model | I12 初始 `Iskilde`／`2015-Jan`／`1596` 不見；Z04 新增 `Trace Water 626`、Z07 更新 `Updated Water 626` 均未回顯。IJ3 導覽通過不能替代資料斷言 |
| NC-009 | Todo `TodoController.java:34/68/114`，直接將 form 複製到 entity、save，再透過 `findAllByOrderByUpdatedAtDesc()` 提供清單 | T11–T13 新增、詳情與修改後的指定 title/content 未回顯；導覽可通過，資料功能仍不完整 |

機器可讀問題單與對應來源、案例、證據：[findings.json](completeness-batch6-20261020/findings.json)。全部尚未修復。前批 WF-035／036、NC-007 仍保留，未混入本批新增問題。

## 操作與旅程的界線

- Struts：S01–S11 失敗；S12 的 New→Save 資料旅程阻於 S04，不能把它當作已證明持久化失敗。SJ1、SJ2 均被導覽阻斷。Z05／Z06 是可獨立測試的 hidden action 失敗。
- Inventory：I02、I04、I06–I10、Z01、Z02 通過，包含新增／修改／詳情／刪除的目的頁或文件更新。I01、I14、I12、Z03、Z04、Z07 失敗。IJ2 詳情選取及 IJ3 新增→修改導覽通過，未宣稱刪除已真的修改來源資料。
- Todo：T01–T10 通過，包含確認取消、接受刪除後文件更新、選取來源錯誤分支後顯示訊息；T11–T13 資料斷言失敗。TJ1 新增→詳情→返回、TJ2 編輯→提交→刪除導覽通過。
- 部分回傳有多個候選時，測試明確選取來源可證明的分支。PASS 不代表 ScreenTrace 已自行依欄位值、登入或資料庫狀態判斷分支。
- 原型中的國家／城市下拉為示範資料，本次只選擇既有選項測試事件，不宣稱選項資料等同資料庫。
- 未連線原系統比對像素；29 個外部 CSS 參照依既有離線政策不下載，不能宣稱畫面像素等價。NC-009 只實測 title/content 回顯，未驗證排序、時間戳或 SQL／交易行為。

## 測試工具更正與原始 FAIL 保留

I03／I05／I11 原 selector `[name=brand]` 同時找到 `<input>` 和被投影為帶 name 的 `<form:errors>`，造成 strict-mode 失敗；不是兩個可編輯 input。I13 依賴 I03，IJ1 依賴 I03／I05，皆列為無效 oracle。Z01／Z02／Z03 改用 `input[name=...]`；Z04 及 IJ3 改用有效步驟，原訊息與資料斷言未放寬。

檢視器會移除原始 href/action。測試定位器從來源屬性與實際 DOM component ID 還原 selector，保留 DOM 順序，沒有利用預期目的頁選控制項。最初版本缺少 form／巢狀 selector 支援，結果另存。另一個工具錯誤是尚未選取同頁候選便提前返回；修正後 T06 從 FAIL 變 PASS，Z03 仍 FAIL，沒有把 T06 誤報為產品缺陷。

[初稿來源預期](completeness-batch6-20261020/workflow-baseline-initial-source-draft.json)保留原近似行號；正式 [workflow-baseline](completeness-batch6-20261020/workflow-baseline.json)採驗證過的檔案路徑，精確控制項／方法位置以 source-census 為準。所有早期結果及更正前結果留在 evidence 目錄，與最終結果分開；沒有改寫原斷言以消除 FAIL。

## 原專案問題及未驗證範圍

- Struts `UserSaveAction.java:32` 參照 `loginRedir`，XML 僅有 `actionLoginRedir`。這是來源缺失 forward，不要求分析器捏造登入分支；README 中尚未實作的 logout／companies 不列為 ScreenTrace 失敗。
- Inventory `deleteProduct.jsp` 參照 `deleteStyles/main.css`，來源不存在；現有檔案是 `styles/deleteStyles.css`。此 1 項記為 SOURCE_MISSING_STYLE，沒有計入 17 個現存本地 CSS 的產品失敗。
- JDBC、JPA、認證 session、實際資料庫與外部服務未執行。預期來自來源可證明的行為；不能宣稱運行中的原專案或所有可能業務情境已驗證。

## 證據與重現

[重現入口與證據目錄](completeness-batch6-20261020/README.md)；[原始 39 案例結果](completeness-batch6-20261020/ui-results.json)、[補充 7 案例](completeness-batch6-20261020/supplementary-results.json)、[補充來源預期](completeness-batch6-20261020/supplementary-baseline.json)、[來源完整性](completeness-batch6-20261020/source-integrity.json)、[兩次一致性](completeness-batch6-20261020/determinism.json)、[測試產物身分](completeness-batch6-20261020/tested-artifact-identity.json)。

原始分析產物位於被 git 忽略的 `analyze/completeness-batch6-20261020/<project>/`；結果、雜湊、來源 oracle、操作截圖及腳本則提交至 evidence 目錄。本次未重跑產品完整回歸套件，未將 WP76 的 809 PASS 當成本次測試結果。
