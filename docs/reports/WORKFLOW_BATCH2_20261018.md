# 第二批新增公開專案流程驗收（2026-10-18）

後續修正與同一基線複驗見 [WP70 修正報告](WORKFLOW_BATCH2_FIXES_20261018.md)；以下原始失敗證據維持歷史狀態。

分支：`fix/workflow-restoration`。本批只新增測試、原始碼核對及問題證據，未修改產品程式、既有測試或被分析專案。四個 repository 均非 fork，與先前所有樣本不同；未使用 Apache／Spring 官方範例。

**結果：目前仍無法宣稱產生網頁可以完整還原這些應用的操作及功能。** 25 個檢查為 14 PASS、11 FAIL。支援範圍內的 20 個頁面導向檢查為 13 PASS、7 FAIL；另有 1 個原專案錯誤防誤判檢查 PASS、2 個功能檢查 FAIL、2 個不支援技術負對照 FAIL。四個支援範圍旅程為 2 PASS、2 FAIL；另有一個 Thymeleaf 負對照旅程 FAIL。

## 新專案與固定版本

| 專案 | 固定 commit | 範圍 | 網頁檢查 | 連續旅程 |
|---|---|---|---|---|
| [商品管理](https://github.com/NguyenHuyHoangCodeGym-C0718L01/struts1_CRUD_ProductManagement/tree/349414fee69a04131b21dea0334894185cfb8ff4) | `349414fee69a04131b21dea0334894185cfb8ff4` | Struts 1／JSP | 7 PASS、1 FAIL，含原專案錯誤防誤判 | 1 PASS |
| [影音購物車](https://github.com/mbitiutskyi/ShoppingCart/tree/79ccc37f2645d73fe98755bdec05e4c415f8eebc) | `79ccc37f2645d73fe98755bdec05e4c415f8eebc` | Spring MVC／JSP | 0 PASS、7 FAIL | 1 FAIL |
| [員工管理](https://github.com/murthyns18/Employee-Management-System/tree/b5ea8136f43ee780d53c4b37740f790a15896fc7) | `b5ea8136f43ee780d53c4b37740f790a15896fc7` | Spring Boot／JSP | 7 PASS、1 FAIL | 1 PASS、1 FAIL |
| [旅館訂房](https://github.com/mjstewart/hotel-reservation-springmvc/tree/8d98857c2e3593c1ac6eaf2151b1749396a195f9) | `8d98857c2e3593c1ac6eaf2151b1749396a195f9` | Thymeleaf，不支援技術負對照 | 0 PASS、2 FAIL | 1 FAIL |

四個 CLI 分析皆 exit 0 且有 HTML 報表，但這不列為流程驗收通過。旅館原為搜尋候選，確認模板技術後獨立列負對照，補入員工管理作為第三個支援範圍樣本。

## 判定方法與實際操作

- 先由來源 JSP、Controller、Struts XML、web.xml 建立 [固定預期](workflows-batch2-20261018/baseline.json)，包含檔案、行號、原文、commit。預期不從分析輸出反推。
- [圖比對](workflows-batch2-20261018/graph-results.json) 追蹤元件→行為→endpoint→handler→screen，精確比較來源證明的目的畫面集合。include 元件使用實際來源檔；同一行的 Edit／Delete 用元件名稱區分。
- [網頁實測](workflows-batch2-20261018/ui-results.json) 以 Chromium 開啟產生的單一 HTML，實際點擊 iframe 中的原控制項；填入必填欄位，檢查目的畫面／候選分支及功能結果。不使用 force click，不修改 DOM 補控制項，不直接跳轉代替旅程步驟。
- 獨立案例從指定來源頁開始；連續旅程只在第一步定位，後續必須由上一個操作到達。獨立案例通過不會補算為完整旅程通過。
- 原專案程式、build、server、資料庫均未執行；原始碼與服務呼叫僅作預期依據。頁面導向 PASS 不等同新增／刪除資料成功。M08 明確另驗新增資料，結果 FAIL。
- 四個報表測試期間均為 0 page error、0 HTTP(S) request；靜態預覽未請求真實後端。

[逐案例矩陣](workflows-batch2-20261018/case-matrix.md) 保留全部 25 個檢查。

| 旅程 | 實際順序 | 結果 |
|---|---|---|
| PRODUCT-EDIT | 列表→編輯→儲存返回列表→新增頁→返回列表 | PASS；只證明導向 |
| SHOPPING | 首頁→目錄→加入購物車→購物車→移除→清空→繼續購物 | FAIL，第一步 S01 無法導向；S02–S07 亦獨立實測 FAIL |
| EMPLOYEE | 列表→新增→填表儲存→編輯→填表更新→刪除 | PASS；只證明導向 |
| EMPLOYEE-DATA | 列表→新增→填表儲存→列表找到剛填的員工姓名 | FAIL，M08 返回列表後沒有 `ScreenTrace Batch2 Employee` |
| HOTEL-NEGATIVE | 搜尋旅館→查看房間 | FAIL，找不到來源模板對應的 screen，未冒稱實際點擊成功 |

## 問題記錄

### WF-010：JSP 冒號標籤使整頁預覽操作失效（已重現，未修正）

- 專案：ShoppingCart；S01–S07；影響首頁、商品目錄、購物車。
- 來源：`src/main/webapp/WEB-INF/pages/template/header.jsp:26` 的自閉合 `<jsp:useBean .../>` 保留於靜態 HTML，瀏覽器將之當成包住後續頁面的元素。
- 分析圖：七個預期流程皆正確。預覽中 Catalog 元件已有 `INFERRED`／`ANCHOR` 對應及正確 graphComponentId。
- 實際：七個控制項皆存在且可點，但顯示「無法確定前往哪個畫面」，整段購物流程不可還原。
- 定位：`previewSelector` 只轉換 `[\w-]+[n]`，未轉換及跳脫 `jsp:usebean[1]`。實際 `Element.matches` 對 `body>jsp:usebean[1]>...` 拋出 SyntaxError；錯誤被 lookup 捕捉，導致找不到預覽記錄。這是已驗證的 selector 問題，不是原專案缺少路由。
- 證據：[唯讀 DOM／selector 診斷](workflows-batch2-20261018/mapping-diagnostic.json)、[失敗截圖](workflows-batch2-20261018/images/S01-after.png)、[圖結果](workflows-batch2-20261018/graph-results.json)。修復候選位置：`screentrace-viewer/src/preview.ts`，並核對 capture 對非輸出 JSP 標籤的處理。

### WF-011：刪除確認被拆成可獨立選擇的導向與訊息（已重現，未修正）

- 專案：商品管理；P03 的目的列表可辨識，但 P08 的確認功能 FAIL。
- 來源：`src/main/webapp/home.jsp:32`，Delete 具有 `onclick="return confirm('Are you sure?')"`。來源語意要求先確認，取消應阻止刪除／導向。
- 實際：出現兩個平行候選：`home` 與 `訊息：Are you sure?`，未出現確認／取消對話框。P08 記錄 dialogText 為空；不能用 P03 的導向 PASS 代表刪除流程完整。
- 證據：[P08 截圖](workflows-batch2-20261018/images/P08-after.png)、[完整操作結果](workflows-batch2-20261018/ui-results.json)。
- 需要保留 confirm 的布林回傳及對後續導向的控制依賴，不能只把 confirm 當作一般訊息。

### WF-012：新增資料無法在靜態頁面延續（已重現；功能範圍缺口）

- 專案：員工管理；M02 導向 PASS，M08 功能 FAIL，EMPLOYEE-DATA 旅程 FAIL。
- 來源：`EmployeeController.java:32–35` 呼叫 `employeeService.saveEmployee` 後 redirect `/`；首頁 `:19–22` 重新讀取員工列表；`employee-list.jsp:30` 迭代資料。
- 實際：表單可填入姓名 `ScreenTrace Batch2 Employee`、email `batch2@example.test`、部門 `Quality`，也能回到列表，但列表沒有新增姓名。
- 證據：[儲存導向截圖](workflows-batch2-20261018/images/M02-after.png)、[資料功能失敗截圖](workflows-batch2-20261018/images/M08-after.png)、ui-results 的 M08.recordVisible。
- 目前產品的示範資料不是業務資料狀態模擬。這不應誤報為本次新增的 parser regression；但依「還原操作及功能」的使用者驗收要求，仍是 FAIL，不能宣稱 CRUD 完整還原。未執行真實資料庫來補足這項缺口。

### NC-001：Thymeleaf 無法提供可操作模板（既知不支援負對照）

- 專案：旅館訂房；T01、T02、HOTEL-NEGATIVE FAIL。
- 來源：`src/main/resources/templates/hotel/search.html:21–28` 有 Go 按鈕及 JS 導向；`hotels.html:97` 有 `th:href` 房間連結，Controller 可證明目的頁。
- 實際：CLI exit 0、有報表、33 endpoints／14 screens／0 components，但沒有對應來源 HTML 模板的 screen。無法進入模板預覽，故未能真正點擊這兩個控制項；結果保留 FAIL，不列為 JSP 功能回歸。
- `docs/PRODUCT_SPEC.md` 明定 Thymeleaf 不支援。本批未擴充模板框架，也未把此樣本充當第三個支援範圍專案。

## 原專案問題（與 ScreenTrace 缺陷分開）

- SRC-001，商品管理：`addProduct.jsp:19` 表單 action 為 `/process-add-product.do`，`WEB-INF/web.xml:20` 僅映射 `*.html`。沒有 `.do` 映射能證明可達 Struts Action。P07 預期無法確定目的，實測正確顯示未知，PASS；不把新增儲存列為可用業務流程，也未修改原專案。
- SRC-002，員工管理：UserController 回傳 `register` 與 `login`，checkout 中缺少相應 JSP。這兩個認證畫面未列為本批可操作頁，不用自行補造模板使其通過。

## 重現及保存

來源 checkout：`/private/tmp/screentrace-batch2-20261018/sources/<project>`。輸出：`analyze/workflows-batch2-20261018/<project>/report/screentrace-report.html`。大型輸出維持 ignored；本報告目錄永久保存 commit、195 個原始檔 hash、全部案例／旅程、selector 診斷、CLI／UI log、代表截圖及 51 個輸出 JSON／HTML hash。

```sh
# 已依 baseline.json 的 repository 與 commit 建立 checkout 後執行；不 build 來源專案。
python3 docs/reports/workflows-batch2-20261018/verify-sources.py
python3 docs/reports/workflows-batch2-20261018/analyze.py
python3 docs/reports/workflows-batch2-20261018/graph-audit.py
node docs/reports/workflows-batch2-20261018/workflows.mjs
node docs/reports/workflows-batch2-20261018/diagnose.mjs
```

workflows.mjs 的 exit 1 是保留上述未解決驗收失敗的結果。固定 baseline 已入版；build-baseline.py 是來源核對資料的建立程式，重跑驗證不需重建或更改預期。

[來源完整性](workflows-batch2-20261018/source-integrity.json)：四個 commit 正確、195 個檔案 hash 不變、git status 全為乾淨。未修改 graph schema／架構／產品程式，因此本批未重跑既有完整單元測試套件；實際新增的驗證為圖比對、25 個瀏覽器檢查、5 個連續旅程及來源完整性檢查。
