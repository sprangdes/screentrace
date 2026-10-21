# 第二批公開專案修正驗收（WP70，2026-10-18）

分支：`fix/workflow-restoration`。固定來源、原始 25 案例與 5 段旅程沿用[修正前報告](WORKFLOW_BATCH2_20261018.md)，沒有更改或放寬既有斷言。

**原始 25 案例全部 PASS、5 段旅程全部 PASS。** 加強驗證的確認取消、第二筆資料列選取、完整示範 CRUD、重載隔離與實際可見性也通過。這是本批明確測試範圍的結果，不代表已執行真實服務／資料庫，或已支援所有 Thymeleaf 表達式。

## 問題與結果

| 問題 | 修正 | 複驗 |
|---|---|---|
| WF-010：購物車七個操作全部失效 | 冒號／句點標籤路徑正確跳脫；實際操作與覆蓋率共用候選縮小邏輯 | S01–S07 PASS；SHOPPING 全旅程 PASS |
| WF-011：刪除確認被當成獨立訊息 | 直接 inline `return confirm(literal)` 保留取消預設動作的語意；確認後才延續 | P08 PASS；取消時無 frame navigation、無導向候選；確認後才回到目的頁 |
| WF-012：填表後資料沒有延續 | AST 解析可證明的 Spring Data 路徑，graph 保存 INFERRED 示範資料契約；工具 session 模擬新增、載入、更新、刪除 | M08、EMPLOYEE-DATA PASS；新增第二筆後可選回第一筆，再編輯第二筆、更新、刪除 |
| NC-001：旅館沒有可操作模板 | Spring HTML physical view、有限度 `th:href/th:action` URL 形狀、常值 JS GET 導向 | T01 搜尋→旅館列表 PASS；T02 列表→房間 PASS；兩步連續旅程 PASS |
| WF-013：視覺複核發現員工頁面全透明 | 舊規則把淡入動畫停在 opacity 0；靜態快照改為固定完成狀態，普通 hidden 不變 | 動畫紅／綠燈測試通過；新增員工可見性斷言與截圖通過 |

WF-012 實作過程再捕捉並修正三個直接相關的問題：第一筆複製後原模板序號變動會使第二筆失去元件記錄；投影到 SCREEN 後會遺失 endpoint 的 delete 操作；回到同一畫面未刷新導致列表未更新。新增測試保留這些行為，不以只有姓名出現就判定 CRUD 完整。

原專案 SRC-001（`.do` 表單不符合 `*.html` servlet 映射）仍保持未知目的，P07 防誤判 PASS。SRC-002（缺少 login／register JSP）仍明確保留缺來源狀態；不修改原專案或捏造頁面來湊成功。

## 專案結果

固定 commit 與原始檔證據詳見 [baseline.json](workflows-batch2-20261018/baseline.json)。

| 專案 | 原始網頁案例 | 連續旅程 |
|---|---:|---:|
| 商品管理 `NguyenHuyHoangCodeGym-C0718L01/struts1_CRUD_ProductManagement` | 8 / 8 PASS，含原專案錯誤防誤判 | 1 / 1 PASS |
| 影音購物車 `mbitiutskyi/ShoppingCart` | 7 / 7 PASS | 1 / 1 PASS |
| 員工管理 `murthyns18/Employee-Management-System` | 8 / 8 PASS | 2 / 2 PASS |
| 旅館訂房 `mjstewart/hotel-reservation-springmvc` | 2 / 2 PASS | 1 / 1 PASS |

歷史旅程 ID `HOTEL-NEGATIVE` 保留，避免改寫原驗收基線；本次在有限度模板支援後，這兩個原先無法操作的案例實際點擊通過。

- 圖比對：[graph-results.json](workflows-batch2-20261018/after/graph-results.json)，22 個導向案例 PASS；其餘 3 個非單純導向案例明確交由網頁功能驗證。
- 原始網頁操作與旅程：[ui-results.json](workflows-batch2-20261018/after/ui-results.json)。四個報表全部 0 page error、0 HTTP(S) request。
- 加強功能實測：[semantic-results.json](workflows-batch2-20261018/after/semantic-results.json)、[可重現程式](workflows-batch2-20261018/after/semantic-workflows.mjs)。包含取消不導向、確認才導向、填入三個欄位、列表回顯、正確載入第一／第二筆資料、保留隱藏 id、更新、刪除、跨頁延續、重新載入重置，以及非透明／非 hidden 的可見性。
- 標準測試套件另新增 [batch2-data.e2e.mjs](../../screentrace-viewer/test/batch2-data.e2e.mjs)，用小型固定圖驗證 CRUD、複製列來源對應與刪除確認，無需依賴暫存 checkout。

## 畫面證據

- [購物車連結可操作](workflows-batch2-20261018/after/images/S01-after.png)
- [來源刪除確認](workflows-batch2-20261018/after/images/P08-after.png)
- [實際新增第二筆並可見](workflows-batch2-20261018/after/images/data-created.png)
- [第二筆更新後回顯](workflows-batch2-20261018/after/images/data-updated.png)
- [刪除第二筆後只保留第一筆](workflows-batch2-20261018/after/images/data-deleted.png)
- [Thymeleaf 搜尋後列表](workflows-batch2-20261018/after/images/T01-after.png)
- [Thymeleaf 房間連結](workflows-batch2-20261018/after/images/T02-after.png)

## 工程驗證

| 測試 | 結果 | 日誌 |
|---|---|---|
| Maven verify | 409 tests；408 PASS、0 failure、0 error、既有 1 skip | [maven-verify.log](workflows-batch2-20261018/after/maven-verify.log) |
| JS AST | 67 PASS | [js-tests.log](workflows-batch2-20261018/after/js-tests.log) |
| capture | 58 PASS | [capture-tests.log](workflows-batch2-20261018/after/capture-tests.log) |
| viewer unit | 111 PASS | [viewer-tests.log](workflows-batch2-20261018/after/viewer-tests.log) |
| viewer browser | 85 PASS | [viewer-e2e.log](workflows-batch2-20261018/after/viewer-e2e.log) |

全部標準測試共 730 項：729 PASS、既有 1 skip。保留 [Node 紅燈](workflows-batch2-20261018/after/node-red.log)、[Java 紅燈](workflows-batch2-20261018/after/java-red.log)、[遺失資料操作紅燈](workflows-batch2-20261018/after/projected-operation-red.log)、[透明動畫紅燈](workflows-batch2-20261018/after/animation-red.log)。完整 browser 回歸亦曾發現共用 lookup 與覆蓋率結果不一致及多餘 URL 診斷；已修正，原既有斷言全部保持不變。開發中紅燈截圖在 `after/red-images/`，不混入最終驗收截圖。

[來源完整性](workflows-batch2-20261018/after/source-integrity.json)：四個固定 commit 正確、195 個來源檔案 hash 不變、git status 全部乾淨。目標來源沒有被 build、啟動、修改或送出請求。大型產生物仍位於 ignored `analyze/workflows-batch2-20261018/`；版本控制保存可重現腳本、結果、代表截圖與輸出 hash。[重複分析](workflows-batch2-20261018/after/repeat-results.json) 比對 76 個 JSON／HTML，全部位元組一致；[最終輸出 hash](workflows-batch2-20261018/after/artifact-hashes.json) 已保存。

## 支援邊界

- 示範資料狀態是工具本機、單次開啟報表的 session；保留來源證據並標示 INFERRED。它不執行 repository、客製業務規則、資料庫驗證或真實身份認證。條件／延後執行／未知轉換／型別歧義／自訂 repository 覆寫不擅自投影為 CRUD。
- Thymeleaf 支援本批可證明的 HTML view 與 URL 形狀，動態 path id 保留樣板。SpEL、URL builder、layout dialect、動態 fragment 等不宣稱完整還原；保留來源原文及未知狀態。
- 確認控制支援可證明的直接 inline return；不把 helper 中被忽略的回傳或一般 standalone confirm 升級為取消預設動作的證據。

Graph 2.2、Preview 2、core 模型與依賴未變。架構決定、契約與與舊排除條件的授權關係見 [ADR 0092](../adr/0092-public-workflows-state-and-template-projection.md)。

## 重現

```sh
npm --prefix screentrace-viewer run build
mvn verify
python3 docs/reports/workflows-batch2-20261018/verify-sources.py
python3 docs/reports/workflows-batch2-20261018/analyze.py
python3 docs/reports/workflows-batch2-20261018/graph-audit.py --after
node docs/reports/workflows-batch2-20261018/workflows.mjs --after
node docs/reports/workflows-batch2-20261018/after/semantic-workflows.mjs
npm --prefix screentrace-viewer run e2e
```
