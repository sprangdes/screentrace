# 第三批公開專案問題修正 — WP72

日期：2026-10-19。分支：`fix/workflow-restoration`。原失敗基線：[完整性實測報告](COMPLETENESS_BATCH3_20261018.md)。設計決定：[ADR 0093](../adr/0093-public-completeness-workflow-repairs.md)。

最終機器可讀驗收：[validation-summary.json](completeness-batch3-20261018/after/validation-summary.json)。

## 受測公開專案

同一份凍結來源修復後重測，沒有重複使用舊 Spring／Apache 範例，也沒有用換專案迴避原失敗。來源版本、路徑及全部檔案雜湊見 [baseline.json](completeness-batch3-20261018/baseline.json)。

| 專案 | 固定 commit | 原型／片段 | 路由 | 控制項 |
|---|---|---:|---:|---:|
| [r-watanabe-02/contract-management-system](https://github.com/r-watanabe-02/contract-management-system) | `55a5761798de195231727d210adcb94d4d535f34` | 3/3 | 4/4 | 10/10 |
| [deep1020/Fintech-Finance-Banking-Application](https://github.com/deep1020/Fintech-Finance-Banking-Application) | `5713a5b77eac5d4714beb89de1f7a4a8335560a1` | 17/17 | 17/17 | 54/54 |
| [amiSotun/SpringMVC-IMS](https://github.com/amiSotun/SpringMVC-IMS) | `6a426bdd2aafa27bbad22148adb193faa7658061` | 13/13 | 45/45 | 231/231 |
| [isilkiziltas/airlines_system](https://github.com/isilkiziltas/airlines_system) | `1a29ec168d33bc17dd6d9a1332131cd48b17609f` | 4/4 | 7/7 | 39/39 |
| 合計 | | 37/37 | 73/73 | 334/334 |

數量只代表獨立來源盤點的覆蓋，不能代替操作或資料驗收。[盤點結果](completeness-batch3-20261018/after/census-results.json)另列來源證據、診斷與圖節點類型。

## 已修正問題

| 問題 | 修正及實測結果 |
|---|---|
| WF-014 Ajax chain | `.done().fail()` 保留呼叫及文字回饋；契約姓名檢查可對到 `/checkName.do`。文字／樣式以圖效果模擬，沒有執行來源腳本。 |
| WF-015 legacy 相對腳本 | 採用有效 web root／已證明請求目錄，找回 IMS 35 個 Ajax 呼叫；相鄰重用設定物件分別解析，不把後續請求誤配第一個 URL。 |
| WF-016 分支 ModelAndView | 分支賦值保留條件、全部目的頁與未知分支；Spring 非 REST handler 目的頁集合由 24/48 完整提高到 48/48，無額外目的頁。 |
| WF-017 c:import | dashboard 組合片段、導航、Add account、Transact 和原始表單內容；四個交易選項分別只顯示對應表單。 |
| WF-018 Struts styleId | 正確投影 `contractorNameField` id，label／JS selector 可對應來源欄位。 |
| WF-019 bean:write href | 保留可操作刪除連結、確認與取消，參數 ID 維持未知；連到既有 `/contractDelete.do`，不再新增重複 unresolved endpoint。 |
| WF-020 modal/offcanvas | 按來源指定目標開原節點，無重複 ID；關閉／重開保留欄位，shown.bs.modal 會展示來源載入 API。`target=_blank` 不再誤判成未知 URL。 |
| WF-021 model 回饋 | 選取密碼不一致分支，顯示來源文字 `passwords do not match`；選示範成功分支後清除上次錯誤。沒有建立真實帳戶。 |
| WF-022 inactive web root | 依 NetBeans 設定只採用 `web`，未啟用的 `WebRoot/index.jsp` 排除且留下診斷。 |
| WF-023 快照位元差異（本輪新增，部分修正） | 平行 include 診斷排序已修正。圖資料保持一致，但 Chromium 縮放頭像仍有像素差異，連帶影響 thumbnail／preview／HTML；嚴格全部產物雜湊比對維持 FAIL，不宣稱已消除。 |
| NC-002 th:field | 來源基本欄位投影成 name；未知表達式不採靜態 fallback 假裝已知。 |
| NC-003 航空示範資料 | 新增航班／旅客後表格顯示實際輸入的基本值；訂位下拉選項的 value 和 label 隨同更新。例外路徑不寫示範資料；reload 重置。日期、衍生值及真實 repository 行為不宣稱等價。 |

Struts 4/4 Action 回傳比對通過：[結果](completeness-batch3-20261018/after/struts-return-results.json)。Spring 48/48 逐 handler 的來源預期與實際目的頁：[結果](completeness-batch3-20261018/after/return-results.json)。

## API 正確性

36/36 來源 Ajax 呼叫被發現，另外用獨立 Acorn block traversal 核對 URL、HTTP 方法及後端宣告來源位置：33/33 有處理器的呼叫全部對應正確；3 個來源呼叫缺少 handler，保持未解析，不算成功。

- IMS `web/resources/JS/productHandaler.js:57,238`：POST `retriveProductInfo`。
- IMS `web/resources/JS/productHandaler.js:258`：GET `searchProduct`。

這是 3 個呼叫點、2 個缺少宣告的 URL，沒有擅自建立後端或修改被分析專案。[獨立結果](completeness-batch3-20261018/after/api-target-results.json)；[修正最後一個 Struts 相對 URL 前的失敗證據](completeness-batch3-20261018/after/api-targets-before-final.json)。

## 離線 HTML 操作驗收

歷史 runner 的 41 案例：40 PASS／1 FAIL；5 條多步旅程全部 PASS。[正式結果](completeness-batch3-20261018/after/ui-results.json)。原始基線 14 PASS／27 FAIL、3/5 旅程通過的證據維持不動。

唯一保留的 B08 FAIL 是驗收定位器問題：斷言使用來源不存在的 `#deposit-card`，而且未先開啟 offcanvas；實際來源是 `.deposit-card`。未更動原斷言，也未在產品捏造 id。新增的獨立來源案例先按 Transact 開窗，分別驗證 payment／transfer／deposit／withdraw 顯隱，及關閉／重開狀態。不能把原 41 案例寫成全部通過。

新增 17/17 案例全部 PASS，包含上述四種表單、精確錯誤／成功訊息、刪除取消、三個 IMS 彈窗載入、航空例外不寫入、新增航班與旅客的實際表格值、跨頁選項 label/value、reload 隔離。[結果](completeness-batch3-20261018/after/semantic-results.json)。第一次補充測試的兩個 input 定位器歧義保留在 [locator diagnostic](completeness-batch3-20261018/after/semantic-results-locator-diagnostic.json)，只修正新 runner 的元素種類，不修改任何來源預期。

兩組正式操作測試各有 0 page error、0 HTTP(S) 外部請求；只執行生成報表的工具程式，未執行目標 JavaScript／Java、未建置／啟動目標專案、未連後端或資料庫。

## 標準測試與產物

標準套件 **763 項：762 PASS、既有 1 skip、0 FAIL／ERROR**。Java 424（含 1 skip）、JS 72、capture 68、viewer unit 113、Chromium E2E 86；相較修正前 730 項新增 33 項。

完整命令：[standard-suite.json](completeness-batch3-20261018/after/standard-suite.json)；[原始日誌](completeness-batch3-20261018/after/verification/)。涵蓋 Java parser／adapter／scanner、安全邊界、JS、capture、viewer unit 與 Chromium E2E。新反例包含混合已知／未知回傳、同一行多分支、名稱遮蔽、相鄰設定物件、私有模板 alias、不明目錄及重複寫入。

生成產物位於 `analyze/completeness-batch3-fixed-20261018/<project>/`；每個專案 `report/screentrace-report.html` 可直接離線開啟。歷史 `analyze/completeness-batch3-20261018/` 未覆寫。[完整產物雜湊](completeness-batch3-20261018/after/artifact-hashes.json)、[連續生成決定性比對](completeness-batch3-20261018/after/determinism-results.json)、[來源完整性](completeness-batch3-20261018/after/source-integrity.json)。

最終嚴格比對：429 個產物中 7 個檔案仍不同，均為 IMS 頭像像素／縮圖及其衍生 preview／HTML／大小紀錄；四份 canonical graph 與去除 thumbnail 後的預覽結構全部一致。此分項比對僅定位差異，沒有取代或放寬完整雜湊驗收，後者仍為 FAIL。

首次決定性失敗證據：[6 個變動檔案](completeness-batch3-20261018/after/determinism-results-iteration1.json)、[第一次產物雜湊](completeness-batch3-20261018/after/determinism-run1-iteration1.json)。等待載入／字型後仍有 5 個變動，元素位置／樣式值相同，像素差異位於 dashboard 右上角 25×25 頭像；追加顯式圖片解碼等待仍有頭像縮放差異，另試 Chromium 軟體／決定性繪製與預繪仍未消除，因此未保留無效的額外 flags／預繪。保留 [第二次失敗](completeness-batch3-20261018/after/determinism-results-iteration2.json)。中途標準套件的文件連結失敗是報告尚未寫入造成，保留 [診斷紀錄](completeness-batch3-20261018/after/standard-suite-doc-links-diagnostic.json)，最終套件須待文件與產物齊全後通過。

## 限制

原專案的航空 edit/delete 佔位按鈕、IMS `href="#"` 忘記密碼、上述缺少 handler 的 API 均保留來源問題。未知 helper、Ajax 回應值、資料庫內容、模板動態函式、後端條件、真實登入／權限／餘額／交易、日期格式及服務計算未執行。示範成功／例外是來源路徑選擇，不是條件已求值或業務成功證明。既有 graph 診斷仍保留。

原先 11 項問題的有限來源行為已修正；新增 WF-023 的頭像像素一致性仍未解決。37/37、334/334 或 UI 通過不代表四套系統所有功能已完整還原。

## 重現

保留凍結來源及既有失敗基線；安裝需求見原 [README](completeness-batch3-20261018/README.md)。在根目錄執行：

```sh
python3 docs/reports/completeness-batch3-20261018/verify.py
mvn -q -DskipTests package
export ST_BATCH3_OUTPUT="$PWD/analyze/completeness-batch3-fixed-20261018"
export ST_BATCH3_RESULTS="$PWD/docs/reports/completeness-batch3-20261018/after"
python3 docs/reports/completeness-batch3-20261018/analyze.py
python3 docs/reports/completeness-batch3-20261018/audit-census.py
python3 docs/reports/completeness-batch3-20261018/audit-returns.py
python3 docs/reports/completeness-batch3-20261018/audit-struts.py
node docs/reports/completeness-batch3-20261018/audit-api-targets.mjs
node docs/reports/completeness-batch3-20261018/workflows.mjs
node docs/reports/completeness-batch3-20261018/semantic-workflows.mjs
python3 docs/reports/completeness-batch3-20261018/artifacts-fixed.py --snapshot
python3 docs/reports/completeness-batch3-20261018/analyze.py
python3 docs/reports/completeness-batch3-20261018/artifacts-fixed.py
python3 docs/reports/completeness-batch3-20261018/check-integrity.py
```

workflows.mjs 因保留原 B08 FAIL 預期 exit 1；補充驗收必須 exit 0。artifacts-fixed.py 會因仍存在的頭像像素差異 exit 1，必須保留嚴格失敗結果，不能當作全部產物一致。重現會覆寫 after 派生證據，先保留已提交版本。API audit 使用原 js-inputs.py 產生的凍結來源輸入；不要重新建立或改寫歷史預期以配合產品輸出。
