# ADR 0190 桌面分析工作台：Electron App 透過啟動腳本操作分析

## 背景

分析的操作（選專案、分析、開啟報表、設定專案根目錄與瀏覽器、環境檢查）只有終端機：`./bin/screentrace` 的方向鍵選單與腳本化指令。需求方希望提供圖形操作介面，並選擇 Electron 桌面 App（另評估過 Java Swing 視窗與本機網頁服務；本機網頁服務會重新引入 WP7 E 移除的 localhost 服務）。

限制：

- 分析邏輯只能有一份；App 不能重寫 CLI 的專案清單、輸出資料夾規則、輸出資料夾歸屬檢查與瀏覽器選擇。
- 報表維持單一離線 HTML（REQUIREMENTS D6）；App 只是操作介面，不顯示也不改變報表。
- 不修改被分析的專案（AGENTS §2.7）。

## 決定

1. **新增 Node 套件 `screentrace-desktop`。** Electron 45.3.0（devDependency，釘選版本）。`./bin/screentrace gui`（Windows：`.\bin\screentrace.cmd gui`）在完成與其他指令相同的環境檢查與建置後，必要時執行 `npm ci` 與 Electron 的 `install.js`（較新的 npm 不執行相依套件的安裝腳本），再啟動 App。
2. **App 的每個動作都執行啟動腳本。** `main.mjs` 以 `spawn`（不經 shell）執行 `bin/screentrace`；Windows 以 `powershell.exe -File bin\screentrace.ps1` 執行。分析就是 `screentrace analyze <資料夾>`，輸出即時顯示在 App 中，結束後讀取「分析完成：」區塊與報表路徑。停止分析時結束整個行程群組（macOS／Linux）或以 `taskkill /T` 結束行程樹（Windows），一併停止 Chromium 擷取。
3. **CLI 新增給 App 用的非互動指令 `desktop`。** 每個指令在標準輸出印一行 JSON（`format: 1`）：
   - `desktop status`：專案根目錄、分析結果根目錄、瀏覽器設定、偵測到的瀏覽器，以及專案清單（根目錄下的資料夾與分析結果根目錄中已完成的分析，含上次分析時間、技術與畫面／API／元件數）。根目錄以外的分析由 `application-graph.json` 記錄的來源路徑找回原始碼資料夾（`[home]` 展開回使用者目錄），找不到時 `source` 為 null，App 只能開啟報表、不能重新分析。
   - `desktop workspace <專案根目錄> <分析結果根目錄>`：與終端機「設定 → 專案根目錄」相同，保留其他設定。
   - `desktop browser <id>`：只接受這台電腦偵測到的瀏覽器或 `system`。
   - `desktop report <分析資料夾>`：只接受分析結果根目錄下一層的資料夾，與 `report <專案名稱>` 一樣重新產生並以設定的瀏覽器開啟。
   錯誤沿用 CLI 的處理：印一行訊息，用法錯誤結束碼 2。
4. **安全。** 視窗 `contextIsolation`、`sandbox`、不開 `nodeIntegration`；頁面 CSP 只允許自身的 script 與 style；禁止頁面導覽與開新視窗；IPC 只接受 App 自身頁面的要求，路徑必須是存在的完整路徑。preload 只暴露固定的幾個函式。
5. **介面。** 與報表相同的色彩 token（R115），頂部只有名稱「ScreenTrace 分析工作台」、環境檢查（`doctor`）與設定。左側為搜尋與專案清單（狀態：已分析／尚未分析／分析中／失敗）及「分析其他資料夾…」。右側為所選專案的路徑、「分析專案／重新分析」「開啟報表」「開啟分析資料夾」「開啟原始碼資料夾」，以及：
   - **分析結果卡**：讀自 `desktop status`，不解析終端機輸出。畫面／API／元件數、技術標籤、各角色的可達／可能／未到達比例條（與報表角色頁同色），context path 提示以提醒框顯示，最後是分析結果資料夾。尚未分析時顯示虛線的「尚未分析」卡。
   - **分析狀態卡**：分析中顯示轉圈、目前最後一行輸出與經過時間，可「停止分析」；結束後以綠（完成）、紅（失敗，顯示原因）、黃（已停止）呈現。完整輸出收在「詳細紀錄」裡，預設收合，失敗時自動展開，以淺色等寬字呈現，不仿終端機。
   一次只能進行一個分析；分析中關閉視窗會先確認，再停止分析。`desktop status` 的 `summary` 因此包含 `personas`（名稱與三種數量，與 CLI「角色 …：可達 …」相同算法）與 `contextPathHints`。
6. **安裝成 macOS App（`gui install`）。** `./bin/screentrace gui install` 以 `@electron/packager` 20.3.0 在這台 Mac 建立 `ScreenTrace.app`（名稱、`io.screentrace.desktop`、`build/icon.icns`；圖示原稿為 `build/icon.svg`），複製到 `/Applications`（不可寫入時改用 `~/Applications`）。
   - App 不含分析程式，仍執行建立它的原始碼目錄的 `bin/screentrace`：打包時把該路徑寫入 App 內的 `install.json`。啟動腳本的尋找順序為 `SCREENTRACE_LAUNCHER`、`install.json`、App 所在原始碼目錄。專案目錄搬移後須重新執行 `gui install`。
   - 從 Finder、Dock 或 Launchpad 開啟的 App 只有系統的 PATH，找不到 Homebrew 安裝的 Java、Maven、Node。打包後的 App 啟動時以 `$SHELL -ilc` 讀取登入 shell 的 PATH（以標記擷取，忽略 profile 的其他輸出，5 秒逾時），再補上 Homebrew 的 `openjdk@17`、`node@22` 與 `bin` 資料夾。
   - 在本機建立、沒有經過下載，因此不需要 Apple 簽章或公證；尚不提供給其他電腦安裝的套件。Windows 執行 `gui install` 會說明目前只支援 macOS。
7. **測試與 CI。** `screentrace-desktop/launcher.test.mjs` 測試啟動命令、輸出解析與停止行程樹；`screentrace-cli/src/test/desktop.test.mjs` 以隔離的 `user.home` 測試 `desktop` 指令。CI 在 Java 建置後執行這兩個測試檔，並稽核 `screentrace-desktop` 的相依套件；Prettier 與 ESLint 涵蓋新套件（preload 以 CommonJS 規則檢查）。

## 後果

- 終端機選單與腳本化指令不變；App 是另一個入口，結果寫到同一個分析結果根目錄。
- 首次執行 `gui` 會下載 Electron（約 100 MB），需要網路。
- `gui install` 建立的 App 依賴本機的原始碼目錄與執行環境；要發給其他電腦（內含 Java、Node、Chromium，並簽章公證）另立工作。
- 啟動腳本的建置檢查不再看 `screentrace-desktop/` 內的 `.html`／`.css`，修改 App 介面不會觸發重新建置 jar。
