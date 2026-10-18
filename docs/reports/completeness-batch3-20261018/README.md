# 第三批實測證據／重現入口

結論、問題與限制見 [主報告](../COMPLETENESS_BATCH3_20261018.md)。`ui-results.json` 是正式成績；`ui-results-selector-diagnostic*.json` 僅定位器診斷，不計入產品成績。來源預期由 `build-workflows.py` 明確定義，不從執行結果反推。

環境：Java 17+／javac、Python 3、Node、curl、git；ScreenTrace 自身已完成 Maven 建置，並安裝 screentrace-js、screentrace-capture 的 npm 依賴及 Playwright Chromium。目標專案不建置、不啟動、不安裝依賴。

1. 依 `baseline.json` 的 repository 與 commit clone/check out 至各 `checkoutRoot`；航空保留外層 `airlines_system` 與內層 `airline_system`。來源版本必須與記錄一致。
2. 在 ScreenTrace 根目錄執行下列工具。工具會覆寫本資料夾的派生 JSON／截圖，需先保留原始證據；Git 已記錄本輪證據。`build-baseline.py` 的 JavaParser jar 使用本機 Maven cache 的 3.26.1。

```sh
python3 docs/reports/completeness-batch3-20261018/build-baseline.py
python3 docs/reports/completeness-batch3-20261018/js-inputs.py
node docs/reports/completeness-batch3-20261018/js-census.mjs
python3 docs/reports/completeness-batch3-20261018/analyze.py
python3 docs/reports/completeness-batch3-20261018/audit-census.py
python3 docs/reports/completeness-batch3-20261018/audit-returns.py
python3 docs/reports/completeness-batch3-20261018/audit-struts.py
python3 docs/reports/completeness-batch3-20261018/build-workflows.py
node docs/reports/completeness-batch3-20261018/workflows.mjs
python3 docs/reports/completeness-batch3-20261018/check-integrity.py
```

UI runner 因已記錄的功能失敗預期 exit 1。工具自身失敗會列錯誤，不能將「未執行」當作成功。瀏覽器封鎖 HTTP(S)，只載入生成的離線原型。`artifact-hashes.json` 凍結本輪 jar、graph、preview、prototype、viewer document 及 HTML；`analysis-runs.json` 保存實際 CLI 命令。

來源 Java／JS AST 清單、控制項、返回值及 guard 是有限度靜態語法盤點，不是 target runtime、模板引擎或資料庫執行的替代品。各種未知／未覆蓋能力保留在主報告。
