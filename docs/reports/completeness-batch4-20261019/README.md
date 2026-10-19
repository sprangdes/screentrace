# 第四批測試重現

結論：[主報告](../COMPLETENESS_BATCH4_20261019.md)。[有效結果摘要](validation-summary.json)、[原始 31 案例](ui-results.json)、[補充案例](supplementary-results.json)、[問題與來源](findings.json)。

工具版本固定為 ScreenTrace `f285bdc`。Java 17+／javac、Python 3、Node、git、curl；使用 ScreenTrace 本身已有的 Maven、Acorn、Playwright Chromium 依賴。**不要安裝、建置或啟動目標應用，也不要執行下載專案的任何腳本。**

## 固定來源

依 [baseline.json](baseline.json) 的 repository／commit／checkoutRoot 下載三份來源至 `/private/tmp/screentrace-batch4-20261019/sources/`。可使用 `git -c core.hooksPath=/dev/null clone --no-checkout <repository> <checkoutRoot>`，然後在該 checkout 執行 `git -c core.hooksPath=/dev/null checkout --detach <commit>`。App1Assignment5 的 sourceRoot 是圖書管理 checkout 內的 `App1Assignment5`；其 App2 不作另一個受測單位。

先檢查來源版本與檔案雜湊是否一致。已提交的 baseline 與預期不可因生成結果失敗而重建。`build-baseline.py`、`build-workflows.py` 保留最初盤點方法，只有需要另開一輪凍結來源時才執行；它們會覆寫本目錄的預期。獨立 JavaParser census 使用本機 Maven cache 的 3.26.1 jar，不載入 target classes。

## 執行

在 ScreenTrace 根目錄：

```sh
python3 docs/reports/completeness-batch4-20261019/check-integrity.py
python3 docs/reports/completeness-batch4-20261019/analyze.py
python3 docs/reports/completeness-batch4-20261019/js-inputs.py
node docs/reports/completeness-batch4-20261019/js-census.mjs
python3 docs/reports/completeness-batch4-20261019/audit-census.py
python3 docs/reports/completeness-batch4-20261019/audit-returns.py
python3 docs/reports/completeness-batch4-20261019/audit-styles.py
node docs/reports/completeness-batch4-20261019/workflows.mjs
node docs/reports/completeness-batch4-20261019/supplementary.mjs
python3 docs/reports/completeness-batch4-20261019/check-integrity.py
```

`analyze.py` 使用已封裝的 ScreenTrace jar 與目前 checkout 的工具腳本；核對 [artifact-hashes.json](artifact-hashes.json) 的 jar SHA-256 與 toolCommit。必要時只在 **ScreenTrace** 執行 `mvn -DskipTests package`；不在下載來源中執行建置。結果預設在 `analyze/completeness-batch4-20261019/`，報表位於每個單位 `report/screentrace-report.html`。`ST_BATCH4_OUTPUT`／`ST_BATCH4_RESULTS` 可覆寫 analyze／census 的路徑，UI runner 使用本輪固定預設路徑。

UI／supplementary runner 因保留真實失敗預期 exit 1；不是測試全部通過。記錄包括每步的來源、effectiveSelector、before／after、候選頁及輸入值回顯。兩個 runner 都封鎖 HTTP(S)，只操作工具生成的離線 HTML。

## 預期與定位器校正

- 第一輪使用 href/action/onclick 定位，但安全封裝會移除這些屬性。正式 runner 透過相同來源的 canonical component ID 定位，不注入 URL、不強制點擊不可見控制項、不放寬目的地或資料斷言。原 [定位診斷](ui-results-selector-diagnostic1.json)與 [診斷截圖](screenshots-selector-diagnostic1/)保留。
- H11 原日期顯示格式預期與既有旅客姓名假設有誤，原結果保留，排除有效成績。來源正確的電話／日期檢查為 X03；[校正依據](source-expectation-review.json)。有效 33 項為原 30 項加 X01–X03，並非把原 31 項改寫為通過。
- style audit 核對來源存在的 stylesheet、CSS 內容前綴與對應 document 的資產引用，驗的是本機樣式進入封裝，沒有宣稱逐條 CSS 語義或像素等價。X01 再以真實 DOM computed style 交叉檢查。外部 stylesheet 獨立分類、不下載。
- 來源不含前端 Ajax，不能把零呼叫當作 Ajax 正確率 100%。Controller return audit 是有限語法的可能 view 集合，不是執行時 CFG／資料庫正確性證明。

重跑會更新派生 JSON、日誌與截圖，應先保留已提交證據。歷史前三批不覆寫。
