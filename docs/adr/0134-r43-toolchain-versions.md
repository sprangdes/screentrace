# ADR 0134：R43 固定建置工具鏈版本

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-007：

- 沒有 Maven Wrapper，本機和 CI 的 Maven 版本可能不同。
- 三個 Node 套件都沒有宣告 `engines`；README 與啟動器要求 Node.js 18+，CI 只用 Node 22，中間的版本沒有測試。Node 18 與 20 都已經結束支援。
- Playwright 固定在 1.55.1，它的瀏覽器不支援 ubuntu-26.04，CI 只能停在 `ubuntu-24.04`。

## 決定

- R43-1：加入 Maven Wrapper 3.3.4（`only-script`，不提交 jar），固定 Maven 3.9.11，並以 `distributionSha256Sum` 驗證下載的檔案（雜湊與 Maven 官方 SHA-512 檔核對過的 zip 一致）。CI 的格式檢查、建置測試與依賴掃描都改用 `./mvnw`。使用者用的啟動器（`bin/screentrace`、`bin/screentrace.ps1`）仍檢查系統上的 Maven 3.9+，不在本段範圍。
- R43-2：Node.js 最低版本改為 22，也就是 CI 實際測試的版本。三個 `package.json` 宣告 `"engines": {"node": ">=22"}`；啟動器的 `required_node`／`$requiredNode` 改為 22；README 同步。不另外測試更新的 Node 版本。
- R43-3：Playwright 升到 1.63.0（Chromium 1243），它要求 Node ≥ 20，並支援 ubuntu-26.04。CI 三個 job 改為 `runs-on: ubuntu-26.04`，仍明確指定版本而不用 `ubuntu-latest`；之後作業系統與 Playwright 一起升級。
- R43-4：不選最新的 Playwright 1.65.0：1.63.0 已發布兩個月以上，且它的 Chromium 版本與開發 sandbox 內建的瀏覽器相同，本機可以直接執行全部瀏覽器測試。

## 後果

- 新版 Chromium 的排版與擷取結果可能與 1.55.1 有細微差異；預覽是同一環境重建，報表的確定性測試比對的是同一版本的兩次執行，不受影響。
- 驗證：
  - `./mvnw -v` 下載並驗證 Maven 3.9.11；`./mvnw` 執行 Java 格式檢查通過。
  - Playwright 1.63.0：capture 87 個測試、viewer 單元測試 148 個、JS 測試 180 個全部通過；Maven 584 個測試 579 通過、5 個依作業系統條件略過；viewer E2E（Chromium）118 個中 117 通過，未過的是 `performance.e2e.mjs` 在 sandbox 的時間門檻，與之前相同。Firefox、WebKit 與 ubuntu-26.04 以 CI 結果為準。
- 使用 Node 18 或 20 的開發者需要升級；啟動器會依新的最低版本透過 Homebrew／winget 安裝。
