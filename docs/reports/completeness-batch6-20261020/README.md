# WP77 evidence

被測產品 commit：`f53c703742045211c411ff3b8ddcbe16df7bde81`。此目錄保留第六批來源預期、原始及更正後結果；後續修正驗收應另建 `after/` 或新的結果目錄，不覆寫本批檔案。

- `baseline.json`：固定 repository commit、絕對來源位置、217 個來源雜湊。
- `non-duplication.json`：先前 21 個 repository、此次 3 個、交集及非 fork metadata。
- `source-census.json`、`js-census.json`：獨立來源盤點；JavaParser 3.26.1、Python XML/HTML parser、Acorn。只解析，不執行來源。
- `workflow-baseline.json`、`supplementary-baseline.json`：來源推導的預期；39 個原案例與 7 個補充案例，含 4 個無效原案例的替代關係。
- `ui-results.json`、`supplementary-results.json`：最終工具定位正確的原始／補充結果；`*-before-*` 與早期 logs 保留更正前結果。
- `screenshots/`：最終案例及旅程截圖；`screenshots-before-selector-fix/` 為初版定位器的截圖。
- `findings.json`、`validation-summary.json`：問題清單與有效案例分母、逐案結果。
- `artifact-hashes-first-run.json`、`artifact-hashes.json`、`determinism.json`：兩次各 41 份產物的一致性。
- `source-integrity.json`、`tested-artifact-identity.json`、`evidence-hashes.json`：來源完整性、操作報表身分、CLI jar 及證據雜湊。
- `js-isolation-probe.mjs`：把兩份實際 JS 以惰性字串交給可信任分析器，排除 script src 收集缺口；不 eval 來源。

## 重新取得固定來源

先由 baseline 的 `projects` 逐一建立 `checkoutRoot`，使用 `git -c core.hooksPath=/dev/null clone --no-checkout <repository> <checkoutRoot>`，再以 `git -c core.hooksPath=/dev/null -C <checkoutRoot> checkout --detach <commit>` 取出固定版本。不要建置或啟動目標應用。檔案位置必須吻合 baseline，或在新的驗收目錄建立另外的 baseline，不能改本批來源雜湊。

ScreenTrace 的既有 Maven／Node 相依套件與 JDK 17+ 須已備妥。以固定產品 commit 建置 ScreenTrace CLI；只建置可信任的分析工具。不能以後續改過的 jar 冒充此 baseline。jar 雜湊記於 evidence-hashes；新 jar 另記身分。

## 在新結果目錄重跑

從 repository root 執行；以下環境變數把新分析及瀏覽器結果存到 `/private/tmp`，保留提交的證據。原型只允許可信任檢視器執行，來源 iframe 禁止腳本；遇到既有 FAIL，runner exit code 1 是預期結果，仍須檢視結果 JSON。

```sh
mkdir -p /private/tmp/screentrace-batch6-replay/results
export ST_BATCH6_OUTPUT=/private/tmp/screentrace-batch6-replay/analyze
export ST_BATCH6_RESULTS=/private/tmp/screentrace-batch6-replay/results
python3 docs/reports/completeness-batch6-20261020/analyze.py
node docs/reports/completeness-batch6-20261020/workflows.mjs
ST_BATCH6_SUPPLEMENTARY=1 ST_BATCH6_UI_RESULT=supplementary-results.json node docs/reports/completeness-batch6-20261020/workflows.mjs
```

順序執行分析和操作，避免重建期間讀取檔案。Chromium 在受限環境可能需要桌面工具的 sandbox 核准；這不授權來源腳本或對外請求。

本次原始盤點使用 `build-baseline.py`、`build-js-inputs.py`、`js-census.mjs`；來源預期由 `build-workflows.py` 建立且拒絕覆寫既有 workflow-baseline。`audit-census.py`、`audit-returns.py`、`audit-styles.py` 產生各對照；`determinism.py` 比兩次產物；`check-integrity.py` 驗來源及報表；`summarize.py` 計算有效分母及證據 manifest。這些歸檔 helper 部分固定輸出至本 evidence 目錄；後續重驗先複製至獨立驗收目錄並調整路徑，不能直接覆寫原紀錄。

正式來源預期使用檔案路徑，精確行號由 source-census 提供。`workflow-baseline-initial-source-draft.json` 的近似行號僅為歷史草稿，不作精確定位證據。
