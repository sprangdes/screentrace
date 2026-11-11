# ADR 0129：R38 CI 執行 screentrace-capture 的全部測試檔

## 背景

2026-11-11 的程式健檢（[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-003）發現：CI 的 `node-dependency-audit` job 在「Test static capture and project documentation」步驟逐一列出 12 個測試檔，但 `screentrace-capture/` 共有 19 個 `*.test.mjs`。`package.json` 沒有 `test` script，Maven 也沒有呼叫這些檔案，所以以下 7 個檔案從加入以來沒有在任何自動流程執行過：`animation-preview`、`batch3-markup`、`r16-jsf-placeholder`、`r16-struts-messages`、`react-preview-state`、`template-fragments`、`template-preview`。

在本機執行這 7 個檔案，共 26 個測試全部通過；以萬用字元執行全部 19 個檔案，共 85 個測試全部通過。

## 決定

- R38-1：CI 改為 `node --test screentrace-capture/*.test.mjs`，不再手動列出檔名；之後新增的測試檔會自動被執行。
- R38-2：`react-preview-state.test.mjs` 會呼叫 React analyzer，需要 `screentrace-js` 的相依套件。因此把「Install JavaScript parser dependencies」移到 capture 測試之前；後面的「Test JavaScript parser」與 audit 步驟沿用已安裝的套件，順序不變。
- R38-3：只改 CI 設定與文件；產品程式碼、測試內容、分析結果與報表都不變。

## 後果

capture 測試在 CI 的數量由 12 個檔案增為 19 個（共 85 個測試），這個 job 會多花一些執行時間。健檢的其他項目記錄在 HEALTH_CHECK_20261111，另外處理。
