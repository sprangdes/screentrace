# 公開應用操作流程與功能還原實測（2026-10-18）

> 本文保留修正前實測紀錄。`fix/workflow-restoration` 分支的修正與重新驗證結果見 [WORKFLOW_FIXES_20261018.md](WORKFLOW_FIXES_20261018.md)。

**結論：目前無法完整還原本輪三個應用的主要操作流程與功能。** 本次沒有重用先前五個測試單位；改用三個獨立開發者的公開業務應用，先從 JSP、Action／Controller、JavaScript、Web Flow 設定建立預期，再核對實際 graph，並在產生的離線 HTML 內真正點擊操作。

共記錄 **32 個操作檢查、3 條完整使用旅程**。32 項中，5 項僅局部流程一致、15 項操作失敗、1 項因前置操作失敗而無法到達、11 項因報表生成失敗而無法操作。三條完整旅程均未完成：兩條在起點操作中斷，一條沒有報表。**局部流程一致不表示登入、註冊、存檔或資料庫功能成功。**

ScreenTrace 版本：`5260f64cf7607cecab75e895a529b614c3c39444`。本輪沒有修改分析器、預覽器或原始目標專案；問題均尚未修正。

## 測試專案

| 專案 | 來源與固定版本 | 選用範圍 | 分析結果 |
|---|---|---|---|
| OLMS 圖書館管理 | [ranveer5289/OLMS](https://github.com/ranveer5289/OLMS/tree/60b3499745bfe5c8ae884fac3cb89d8b1e96d1dd)；`60b3499745bfe5c8ae884fac3cb89d8b1e96d1dd` | `MyStrutsApp`，Struts 1：登入、註冊、新增書籍、清除、日期選擇 | HTML 有生成，主要入口及動態操作失敗 |
| eBazaar 電商 | [bradd-pandey/eBazaar](https://github.com/bradd-pandey/eBazaar/tree/88e30754c8a760d87d7eec2c115777efa04a7ba1)；`88e30754c8a760d87d7eec2c115777efa04a7ba1` | 產品瀏覽、新增產品、購物車 AJAX、Web Flow 結帳 | HTML 有生成，產品入口、購物車功能及結帳流程失敗 |
| 醫院床位管理 | [RahulDahekar/Hospital-Bed-Availability-Management-System](https://github.com/RahulDahekar/Hospital-Bed-Availability-Management-System/tree/4667e02e2463ec79907bd60a919b9c2501d3f15d)；`4667e02e2463ec79907bd60a919b9c2501d3f15d` | 醫院註冊／登入、房型設定、病患登記、床位分配、搜尋及帳單列印 | CLI exit 2；有 graph，沒有單檔 HTML，全部操作被阻擋 |

這些是獨立開發者的業務專案，並非前輪的 Apache／PetClinic／Todo／RealWorld 測試輸入。第四個 library repository 僅於候選搜尋時下載，未分析或列入本報告結果。

## 完整使用旅程

| 旅程 | 原始碼應有的路徑 | 實際結果 |
|---|---|---|
| C01 圖書館註冊 | 登入頁 → REGISTER YOURSELF → 註冊頁 → Register → 註冊頁回傳 | 第一個連結 O01 就顯示「無法確定前往哪個畫面」。從登入頁無法完成這條旅程。另以獨立起點測試註冊表單時，O04 的同頁回傳可模擬；不能把它算成 C01 通過。 |
| C02 電商購物結帳 | 首頁 → 產品清單 → 詳情 → 購物車 → Check out → 寄送 → 付款 → 訂單確認 → 完成 | 首頁 Go to Products（E01）沒有抵達清單，旅程中斷。後續階段另行獨立聚焦測試，數量顯示、移除商品及結帳的前進／返回／取消仍失敗。 |
| C03 醫院收治 | 首頁 → 醫院登入 → 註冊 → 房型設定 → 登入 → 工作台 → 新增病患 → 床位分配 → 工作台 | 報表生成失敗，無法開始。Graph 也把多個 Controller 的邏輯 view 與實際 JSP 分開，不能認定流程已正確解析。 |

獨立檢查後續畫面時使用報表的畫面卡片定位，沒有修改 graph、HTML、目標程式或 DOM 來補足失敗；這些檢查只用於定位後續缺陷，不算完整旅程通過。

## 問題紀錄

以下項目狀態均為 **待修正／待驗證**。沒有為了得到通過結果而修改目標專案、放寬圖的解析狀態、移除資源邊界檢查或補寫圖關聯。

### WF-001：OLMS 的同目錄 JSP 連結無法前往（O01、O02）

- 原始依據：`MyStrutsApp/web/login.jsp:61–62`，分別為 `href="Registration.jsp"` 與 `href="ForgetPassword.jsp"`，目標檔案均存在於同一個 `web/` 目錄。
- 預期：點擊註冊／忘記密碼連結，進入對應 JSP。
- 實際：graph 沒有建立這兩個操作到目標畫面的可達路徑；離線 HTML 點擊後顯示「無法確定前往哪個畫面」。
- 影響：使用者無法由登入頁進入帳號註冊或密碼找回。
- 定位線索：Struts 的相對 JSP 網址正規化程式存在 `src/main/webapp/` 特定根路徑處理；本專案使用 NetBeans 的 `web/` 結構。這是靜態程式碼定位線索，尚未實作修正。
- 證據：[O01 點擊後截圖](workflows-20261018/images/O01-after.png)、[graph 核對](workflows-20261018/graph-results.json)、[實際操作結果](workflows-20261018/ui-results.json)。

### WF-002：OLMS 清除按鈕與欄位轉換失真（O06）

- 原始依據：`web/AddBook.jsp:31,76` 使用 `<html:text property = "ISBNNumber"/>`、`<html:button property = "name" value = "clear" onclick="clearForm()"/>`；`web/clearform.js:4–10` 清除七個指定欄位。
- 預期：七欄填值後按 clear，欄位清空；按鈕有 clear 文字，並非送出表單。
- 實際：`property = "ISBNNumber"` 沒有轉成 input 的 `name`；clear 被生成為沒有文字的 `<button>`，type 預設為 `submit`。補查透過保留的 property 找到同一個可見輸入欄位，實際填入七欄後點擊，**七欄全部仍保留原值**。
- 測試辨識修正：初次案例以 input/name 尋找控制項，先遇到定位失敗。已保留原結果，另用 button/input 及 name/property 同時辨識相同控制項進行補查；沒有變更產品或 DOM。最終問題依據是補查得到的按鈕型別、空白標籤與清除失敗，不以定位逾時單獨判定功能失敗。
- 證據：[補查數據](workflows-20261018/clear-followup.json)、[填值後](workflows-20261018/images/O06-followup-before.png)、[點擊後](workflows-20261018/images/O06-followup-after.png)。

### WF-003：OLMS 日期選擇功能沒有還原（O07）

- 原始依據：`web/login.jsp:50` 呼叫 `showCal('Calendar3')`；`web/cal2.js:534` 起的 `showCal` 建立日曆內容並顯示日曆視窗。
- 預期：Select Date 可開啟可選日期的介面。
- 實際：出現兩個「無法確定前往哪個畫面」候選，沒有日曆介面；不是成功還原日期選擇器。
- 影響：登入表單的日期選擇功能無法操作。
- 證據：`ui-results.json` 的 O07；完整前後截圖保存在分析產物的 `screenshots/O07-*.png`。

### WF-004：eBazaar 未解析 ModelAndView.setViewName，產品入口與新增後返回清單中斷（E01、E04）

- 原始依據：`ProductController.java:37–43` 建立 `new ModelAndView()`，再呼叫 `setViewName("products")`；`61–79` 的新增產品 POST 有 `productForm` 與 `redirect:/product` 兩個結果。
- 預期：首頁 Go to Products 抵達 products.jsp；新增產品送出可表達驗證失敗回表單、成功回清單兩分支。
- 實際：graph 診斷 `Handler return view cannot be resolved statically: ProductController.showWelcomeProduct()`；E01 只有無法確定的候選，未抵達清單。E04 只留下 productForm，缺少成功返回 products 的結果。
- 定位線索：`SpringControllerReturns` 對 ModelAndView 的方法呼叫有白名單，`setViewName` 不在允許集合中；本輪未修改這個邊界。
- 證據：[E01 截圖](workflows-20261018/images/E01-after.png)、graph-results.json 的 E01/E04、eBazaar.log。

### WF-005：eBazaar 動態查詢參數的產品詳情連結沒有還原（E03）

- 原始依據：`views/products.jsp:43–44` 使用 `/product/productDetail?id=${product.productId}`；`ProductController.java:46–50` 接收 id 並回傳 productDetails。
- 預期：點選示例商品 Details，能前往產品詳情示意畫面，保留其後端請求對應。
- 實際：該控制項沒有到詳情頁的已解析 graph 路徑；實際點擊顯示「無法確定前往哪個畫面」。
- 分類：靜態解析與示意互動的能力缺口；本輪沒有假設動態 productId 的真實值。
- 證據：graph-results.json、ui-results.json 的 E03。

### WF-006：eBazaar 數量欄位與購物車 AJAX／回饋沒有還原（E06–E08）

- 原始依據：`views/productDetails.jsp:43,48–53`，Order Now 呼叫 `askQuantity`；`resources/js/cart.js:1–4` 顯示 `#pQuantity`。同檔 `9–24` 對 `/order/addToCart` 發 POST 並顯示成功／錯誤訊息；`27–42` 對 `/order/removeFromCart` 發 GET，成功後提示並重新載入購物車。
- 預期：Order Now 顯示數量輸入，Add to Cart 能表達對應 API 與結果回饋；Remove 能表達移除操作及更新購物車的流程。
- 實際：E06 點擊後 `#pQuantity` 仍不可見，只有無法確定的候選；E07 因 Add to Cart 所在區塊無法開啟而被阻擋，沒有強制顯示或直接呼叫函式。E08 可點擊 Remove，但沒有正確 API 提示或成功回饋，也沒有完成原本的移除流程。
- 影響：即使能單獨開啟產品詳情與購物車畫面，也不能操作購買商品的主要功能。
- 證據：[Order Now 點擊後截圖](workflows-20261018/images/E06-after.png)、ui-results.json 的 E06/E07/E08。

### WF-007：eBazaar Spring Web Flow 結帳流程完全缺少可操作關聯（E09–E14）

- 原始依據：`WEB-INF/spring/appServlet/flow-definition.xml:23` 註冊 `orderFlow`；`WEB-INF/flow/order-flow.xml` 定義寄送→付款→訂單確認→thanks，並定義 Back 與 Cancel。各 JSP 按鈕使用 `_eventId_shippingDetails`、`_eventId_paymentDetails`、`_eventId_orderConfirmation` 等名稱提交事件。
- 預期：Check out 抵達寄送頁；Continue 前進；Back 返回；Confirm 完成；Cancel 進入取消頁。
- 實際：JSP 畫面雖然存在於 graph，六個操作均沒有符合原始 Web Flow 的可達路徑。實際點擊 Check out 無法抵達寄送頁；逐頁獨立操作 Continue／Back／Confirm／Cancel 也無法切換。
- 影響：存在五張結帳相關畫面不能證明結帳功能已還原；目前整段流程不可用。
- 證據：[寄送 Continue 點擊後截圖](workflows-20261018/images/E10-after.png)、graph-results.json 與 ui-results.json 的 E09–E14。

### WF-008：醫院專案的合法 prefix/view 組合未連到 JSP（H01–H10，graph）

- 原始依據：`src/main/resources/application.properties:10–11` 設 prefix `/WEB-INF/views`（末尾無 slash）、suffix `.jsp`；Controller 回傳 `/hospital/login`、`/patient/register` 等以 slash 開頭的 view。原始 resolver 可拼成 `/WEB-INF/views/hospital/login.jsp` 等實際存在的檔案。
- 預期：Controller 的邏輯 view 與實體 JSP 為同一個畫面，登入、註冊、房型及床位流程連到對應頁面。
- 實際：graph 建立 **32 個 SCREEN**，其中 **16 個是獨立的邏輯 view、16 個是實體 JSP**；並對這些實際存在的 JSP 報 `No JSP source found for view`。例如 H01 的路徑停在 `/hospital/login`，沒有抵達實體 JSP。
- 限制：這是 graph 檢查結果；因 WF-009，未宣稱完成此專案的瀏覽器流程驗證。
- 證據：graph-results.json 的 H01–H10、run-metadata.json 的 hospitalViewConfiguration，以及分析目錄內 application-graph.json。

### WF-009：醫院專案的本地背景圖使單檔報表生成失敗（H01–H11，全部 UI）

- 原始依據：例如 `views/hospital/register.jsp` 的 background-image 引用 `${pageContext.request.contextPath}/images/hospitalreg.jpg`；實體檔 `src/main/webapp/images/hospitalreg.jpg` 存在於目標專案內。
- 預期：可安全封裝專案內的圖片並生成報表；即使資源不能封裝，也需要可檢視的明確失敗結果，不能把這個專案算為成功還原。
- 實際：CLI exit code **2**，錯誤為 `預覽資源位於分析輸出目錄之外，已拒絕（資源：輸出外資源/hospitalreg.jpg；根目錄類型：分析輸出目錄）`；沒有 `report/screentrace-report.html`。
- 影響：醫院登入、註冊、病患登記、床位分配、搜尋、帳單列印的 11 個 UI 案例全部無法開始。H11 的 Print 功能沒有操作證據，狀態為阻擋，未誤列為列印失敗。
- 定位線索：本地圖片封裝／樣式 URL 正規化與輸出邊界檢查之間的整合問題，尚未裁定更深層原因。沒有關閉邊界檢查來讓測試繼續。
- 證據：[完整 CLI 錯誤 log](workflows-20261018/Hospital-Bed-Availability-Management-System.log)、[資源存在性、圖片雜湊與產物狀態](workflows-20261018/run-metadata.json)。

## 逐項檢查

「局部流程一致」只代表 source-derived graph 路徑及這次靜態點擊結果一致；對同頁表單回傳不宣稱資料已儲存。完整功能還原仍以完整旅程與動態功能檢查為準。

| 案例 | 原始碼預期操作 | Graph 核對 | 靜態網頁實際結果 |
|---|---|---|---|
| O01 | 登入頁→註冊 | 路徑缺失／不符 | 失敗 |
| O02 | 登入頁→忘記密碼 | 路徑缺失／不符 | 失敗 |
| O03 | 登入成敗候選與選擇成功頁 | 路徑符合 | 局部流程一致 |
| O04 | 註冊送出→原註冊頁 | 路徑符合 | 局部流程一致 |
| O05 | 新增書籍送出→原表單 | 路徑符合 | 局部流程一致 |
| O06 | 填入七欄後清除 | 由實際操作判定 | 失敗 |
| O07 | 開啟日期選擇器 | 由實際操作判定 | 失敗 |
| E01 | 首頁→產品清單 | 路徑缺失／不符 | 失敗 |
| E02 | 產品清單→新增產品 | 路徑符合 | 局部流程一致 |
| E03 | 產品清單→產品詳情 | 路徑缺失／不符 | 失敗 |
| E04 | 新增產品錯誤／成功兩分支 | 路徑缺失／不符 | 失敗 |
| E05 | 產品詳情→購物車 | 路徑符合 | 局部流程一致 |
| E06 | Order Now 顯示數量欄位 | 由實際操作判定 | 失敗 |
| E07 | Add to Cart AJAX 與成功提示 | 路徑缺失／不符 | 前置操作失敗，無法到達 |
| E08 | Remove AJAX／提示／重新載入 | 路徑缺失／不符 | 失敗 |
| E09 | 購物車→結帳寄送 | 路徑缺失／不符 | 失敗 |
| E10 | 寄送 Continue→付款 | 路徑缺失／不符 | 失敗 |
| E11 | 付款 Back→寄送 | 路徑缺失／不符 | 失敗 |
| E12 | 付款 Continue→訂單確認 | 路徑缺失／不符 | 失敗 |
| E13 | Confirm→完成 | 路徑缺失／不符 | 失敗 |
| E14 | Cancel→取消訂單 | 路徑缺失／不符 | 失敗 |
| H01 | 首頁→醫院登入 | 路徑缺失／不符 | 報表未生成，無法操作 |
| H02 | 登入頁→醫院註冊 | 路徑缺失／不符 | 報表未生成，無法操作 |
| H03 | 註冊→原頁／房型設定 | 路徑缺失／不符 | 報表未生成，無法操作 |
| H04 | 房型設定→原頁／登入 | 路徑缺失／不符 | 報表未生成，無法操作 |
| H05 | 登入成敗兩分支 | 路徑缺失／不符 | 報表未生成，無法操作 |
| H06 | 工作台→新增病患 | 路徑缺失／不符 | 報表未生成，無法操作 |
| H07 | 新增病患→原頁／床位分配 | 路徑缺失／不符 | 報表未生成，無法操作 |
| H08 | 分配床位→原頁／工作台 | 路徑缺失／不符 | 報表未生成，無法操作 |
| H09 | 城市搜尋→結果頁 | 路徑缺失／不符 | 報表未生成，無法操作 |
| H10 | 醫院清單→床位清單 | 路徑缺失／不符 | 報表未生成，無法操作 |
| H11 | 帳單列印 | 由實際操作判定 | 報表未生成，無法操作 |

## 保存的證據與重現

- [原始碼基準、每個操作的來源行號／原文、三條旅程、來源 SHA-256](workflows-20261018/baseline.json)。預期先由來源程式碼建立，沒有以 graph 反推預期來讓測試通過。
- [逐項 graph 比對結果](workflows-20261018/graph-results.json)、[逐項實際點擊與旅程結果](workflows-20261018/ui-results.json)、[O06 清除功能補查](workflows-20261018/clear-followup.json)。
- [執行版本、來源不變檢查、CLI exit code、graph／HTML 雜湊、醫院來源設定](workflows-20261018/run-metadata.json)。三個目標 repository 分析後的 `git status --porcelain --untracked-files=all` 全為空。
- 分析器原始日誌：[OLMS](workflows-20261018/MyStrutsApp.log)、[eBazaar](workflows-20261018/eBazaar.log)、[醫院](workflows-20261018/Hospital-Bed-Availability-Management-System.log)。
- 本機靜態報表（受 `/analyze/` ignore 規則排除，不隨 repository 保存）：OLMS `analyze/workflows-20261018/MyStrutsApp/report/screentrace-report.html`、eBazaar `analyze/workflows-20261018/eBazaar/report/screentrace-report.html`。醫院沒有報表，僅有中間分析產物。
- 完整 graph／preview／前後截圖位於 `analyze/workflows-20261018/`，受既有 `/analyze/` ignore 規則排除；本報告與 JSON／腳本／關鍵截圖位於 docs，可隨 repository 保存。

來源 checkout 位於 `/private/tmp/screentrace-workflows-20261018/sources/`。依專案表下載並 checkout 指定 commit，OLMS 使用其 `MyStrutsApp` 子目錄；其餘使用 repository 根目錄。若暫存 checkout 不在，需先重新取得這三份來源。腳本使用獨立測試 user.home，不讀寫日常 ScreenTrace 設定。從 ScreenTrace 根目錄執行：

```sh
python3 docs/reports/workflows-20261018/build-baseline.py
python3 docs/reports/workflows-20261018/analyze.py
python3 docs/reports/workflows-20261018/graph-audit.py
node docs/reports/workflows-20261018/workflows.mjs
node docs/reports/workflows-20261018/clear-followup.mjs
```

`workflows.mjs` 在存在失敗或阻擋時以 exit code 1 結束，這是保留的實測結果。`analyze.py` 的各專案 exit code 另存 analysis-runs.json，不能把腳本自身結束碼當成三專案全成功。

測試不啟動、不建置、不執行目標 Java／JSP／JavaScript，也不連資料庫。原始程式的流程與行為依原始碼確認；瀏覽器只操作 ScreenTrace 生成的安全靜態產物。兩份可開啟報表的 pageerror 皆為 0、HTTP(S) 請求皆為 0；這些只證明產物執行條件，不作為功能還原通過依據。帳密驗證、資料庫寫入及真實資料變化沒有驗證為等價。
