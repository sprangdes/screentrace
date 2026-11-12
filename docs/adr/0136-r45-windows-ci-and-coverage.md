# ADR 0136：R45 CI 加上 Windows 與測試覆蓋率報告

## 背景

[HEALTH_CHECK_20261111](../HEALTH_CHECK_20261111.md) HC-003 的待辦：

- 產品支援 Windows（`bin/screentrace.cmd`、`bin/screentrace.ps1`、winget 安裝），但 CI 只在 Linux 上跑；磁碟代號、反斜線、不分大小寫的檔名等路徑處理從未在 Windows 上測過。現有測試中有幾個只在不分大小寫或 Windows 的檔案系統才會執行，在 Linux 上一律略過。
- 沒有量測測試覆蓋率。

## 決定

- R45-1：根目錄 `pom.xml` 加 `coverage` profile，使用 JaCoCo 0.8.15 的 `prepare-agent` 與 `report`。只有 `-Pcoverage` 才會掛上 agent，啟動器的建置與一般 `mvn verify` 不受影響。
- R45-2：覆蓋率只報告、不設門檻。CI 的 `build-and-test` 改用 `./mvnw -B clean verify -Pcoverage`，把各模組的行與分支覆蓋率寫進 job summary，並上傳 HTML 報告（artifact `java-coverage`）。每個模組的數字只計入該模組自己的測試；跨模組的整合測試不計入，所以 `screentrace-parser-jsp` 等被其他模組大量使用的模組，實際被執行的比例比報告高。
- R45-3：新增 `windows` job（`windows-2025`）：
  - 先設定 `core.autocrlf false` 再 checkout，因為 fixtures 與 golden 檔是逐位元組比對的。
  - 安裝 Node 套件、建置 viewer、安裝 Chromium，執行完整的 `mvnw.cmd -B clean verify`，涵蓋全部 Java 測試，包括只在 Windows 或不分大小寫的檔案系統才會執行的路徑測試。
  - 再以 `bin\screentrace.cmd analyze` 分析 `fixtures/struts` 的複本，確認報表存在，且不含暫存目錄的路徑（原樣、JSON 跳脫後、斜線三種寫法）。
- R45-4：Windows job 不跑 viewer 的三引擎 E2E 與 capture 的 Node 測試；它們在 Linux job 已經執行，與作業系統的路徑處理無關。

## 後果

- 本機（Linux）以 `-Pcoverage` 執行：Maven 584 個測試 579 通過、5 個依作業系統條件略過，與不加 profile 時相同。各模組行覆蓋率：adapter-spring 90.0%、adapter-struts 89.1%、core 82.0%、report 80.5%、scanner 76.9%、cli 70.7%、parser-jsp 55.0%。
- Windows job 第一次執行時，前後找到並在本輪修正的問題（沒有略過任何測試）：
  - 產品問題（Windows 使用者會遇到）：
    1. `JspProjectParser.resolveInclude` 把 `<c:import url="https://…">` 或帶查詢字串的目標直接交給 `Path.resolve`；Windows 不接受 `:`、`?`，整個分析中斷。現在與 Linux 一樣視為找不到檔案。
    2. `SpringMvcAnalyzer`、`SpringBootAnalyzer`、`ApiContractExtractor` 以 `Path.toString()` 產生畫面 ID 與來源位置，Windows 上是 `\`，與 JSP 元件的 `/` 對不上，圖驗證失敗。現在統一為 `/`（Struts adapter 原本就如此）。
    3. 互動選單用 JLine 預設的 shell 式解析讀取答案，`\` 被當成跳脫字元、`'` 被當成未結束的引號：輸入的 Windows 路徑失去分隔符號。現在不解析跳脫與引號。
    4. `UrlGraphContribution` 的家目錄遮蔽只比對 `user.home` 字串；`user.home` 是 symlink 或 8.3 短檔名時，真實路徑留在圖裡。現在連真實路徑一起遮蔽（任何平台都可能發生）。
    5. `bin\screentrace.ps1` 在 `$ErrorActionPreference = 'Stop'` 下讀取 `java -version 2>&1`，Windows PowerShell 把 stderr 轉成錯誤紀錄而中止，啟動器在分析前就失敗。版本偵測改以函式內的 `Continue` 讀取文字。
  - 測試本身不跨平台（只改測試）：Windows 不允許檔名含 `:`；golden 比對受平台換行影響；`/dev/null`；在任何平台模擬 macOS 指令卻寫死 `/` 路徑；Java 17 在 Windows 以平台編碼輸出到管線，中文變成 `?`。
  - 第 3、4 項新增的測試在 Linux 上也能重現（修正前失敗、修正後通過）。
- 驗證：PR CI 四個 job（含 `windows`）全部通過；Linux 上 Maven 測試數為 586（新增 2 個）。
- 程式中仍有約 80 處把字串轉成 `Path`，沒有逐一人工審查；之後由 Windows CI 的測試把關。
