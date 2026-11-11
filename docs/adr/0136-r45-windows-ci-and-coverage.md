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
- Windows job 無法在開發 sandbox 執行，第一次結果以 PR 的 CI 為準；若 Windows 上有測試失敗，代表找到了真正的 Windows 問題，會在同一輪修正，不會略過測試。
