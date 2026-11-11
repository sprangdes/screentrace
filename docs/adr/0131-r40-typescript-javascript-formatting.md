# ADR 0131：R40 TypeScript／JavaScript 以 Prettier 排版並由 CI 檢查

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-001 的 Java 部分已由 R39（[ADR 0130](0130-r39-java-formatting.md)）完成。三個 Node 套件 `screentrace-js`、`screentrace-capture`、`screentrace-viewer` 的 234 個 `.ts`／`.mjs`／`.js` 檔案同樣過度壓縮：約 1.4 萬行、最長一行 4,564 字元、超過 100 字元的行有 4,610 行。R39 合併後沒有未合併的功能分支，可以一次重新排版。

## 決定

- R40-1：使用 Prettier 3.9.10，設定在根目錄 `.prettierrc.json`：每行 100 字元（與 Java 相同）、單引號，其餘用 Prettier 預設值。
- R40-2：範圍只有三個 Node 套件的 TypeScript／JavaScript 原始碼與測試。根目錄 `.prettierignore` 排除 `node_modules/`、`dist/`、`fixtures/`、`test/golden/` 與 JSON、Markdown、HTML、CSS；fixtures 是目標專案範例，行號是分析結果的一部分。
- R40-3：Prettier 只加在 `screentrace-viewer` 的 `devDependencies`（該套件已經有 TypeScript 與 esbuild 等開發工具），不另外新增根目錄的 Node 套件。`npm --prefix screentrace-viewer run format` 重新排版三個套件，`format:check` 檢查。
- R40-4：CI 的 `build-and-test` job 在「Build standalone viewer」之後加上「Check TypeScript and JavaScript formatting」；格式不符時 CI 失敗。
- R40-5：一次重新排版全部 234 個檔案，排版 commit 只有排版改變。Prettier 第一次排版有少數地方不會一次收斂，所以執行到 `format:check` 通過為止。
- R40-6：`screentrace-viewer/test/css-assets.test.mjs` 以文字比對 `pack-preview.mjs` 的進入點，原本要求壓縮後的寫法；在排版前另一個 commit 改成不限空白，排版 commit 才能只有排版改變。
- R40-7：在 `.git-blame-ignore-revs` 記錄排版 commit。
- R40-8：拆分 `StrutsProjectAnalyzer.java` 與 `screentrace-js/react/analyzer.mjs` 不在本段範圍，留在 HC-001 的後續工作。ESLint 等 lint 規則也還沒有加入。

## 後果

- 234 個檔案約 1.4 萬行變為 4.3 萬行；主程式（不含測試）最長一行降為 1,353 字元，剩下的長行大多是 Prettier 不會拆開的長字串與 template literal。`react/analyzer.mjs` 從 1,723 行變為 3,878 行。
- 驗證：
  - 234 個檔案排版前後以 esbuild 壓縮後的程式碼完全相同。
  - 建置出的 `viewer.js`（以及 `viewer.sha256`）與排版前逐位元組相同；未壓縮的 `review-md.mjs` 只有換行不同，壓縮後相同。
  - JS 測試 180 個、viewer 單元測試 148 個、capture 測試 85 個全部通過；Maven 582 個測試 577 通過、5 個依作業系統條件略過。
  - 以排版前（main `5f5f20d`）與排版後的 CLI 分析 `fixtures/` 的 struts、struts-spring、spring-boot-jsp、spring-mvc-jsp，58 個產物檔案除了專案來源路徑以及由它算出的報表 fingerprint 外相同。
- 之後修改 TS／JS 時要先執行 `format`。`bin/screentrace` 在 `screentrace-viewer` 執行的 `npm ci` 會多安裝 Prettier。
