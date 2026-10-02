# 基線實測

- 日期：2026-10-02（Asia/Taipei）。
- 起點：`main`，commit `6183e87cb1bba2d2d6fcae3e773780852ac9d808`，原工作區乾淨。
- 調整分支：`codex/m1-static-analysis`。
- OS：macOS 27.0.1 / aarch64。
- Maven：3.9.9，實際 JVM 為 Homebrew OpenJDK 23.0.1；shell 的 `java -version` 為 Oracle Java 21.0.2。專案編譯目標仍為 Java 17。
- Node：v22.22.0；既有 Playwright：1.55.1。

## Java 基線

```bash
mvn test
```

退出碼 `0`，`BUILD SUCCESS`，Maven 報告總時間 3.095 秒。共 68 項測試，失敗 0、錯誤 0、略過 0。

| Maven 模組 | 測試 | 失敗 | 錯誤 | 略過 |
|---|---:|---:|---:|---:|
| screentrace-core | 12 | 0 | 0 | 0 |
| screentrace-scanner | 2 | 0 | 0 | 0 |
| screentrace-parser-jsp | 10 | 0 | 0 | 0 |
| screentrace-adapter-spring | 12 | 0 | 0 | 0 |
| screentrace-adapter-struts | 2 | 0 | 0 | 0 |
| screentrace-report | 15 | 0 | 0 | 0 |
| screentrace-cli | 15 | 0 | 0 | 0 |

## Node 原始基線（含失敗）

```bash
node --test screentrace-capture/*.test.mjs
```

退出碼 `1`，11 項、通過 9、失敗 2、略過 0，總時間 524.895458 ms。這是新增 WP0 文件測試之前的結果。

1. `capture-static-jsp.security.test.mjs` 的 `static capture sanitizes active markup and makes no external requests`：Chromium 啟動失敗，macOS 沙箱拒絕 Mach port，`bootstrap_check_in ... Permission denied (1100)`，程式退出 `SIGTRAP`。斷言 `1 !== 0`；未改動測試斷言。
2. `report-design.test.mjs`：缺少命令列報表 URL，`Provide the URL of a locally served report with screens and interactions.`。此檔是須另行提供已生成 localhost 報表的手動 E2E 腳本，並非可直接由 `node --test *.test.mjs` 啟動的單元測試；未刪除、略過或修改該檔。

## Node 解除環境限制後的既有自動測試

```bash
node --test screentrace-capture/capture-static-jsp.security.test.mjs screentrace-capture/safe-files.test.mjs screentrace-capture/spring-resource-mappings.test.mjs
```

在沙箱外重跑，退出碼 `0`，10 項全通過，失敗 0、略過 0，總時間 623.781708 ms。此結果確認 Chromium 啟動失敗屬沙箱限制，不代表原始全檔案指令已全綠。

`report-design.test.mjs` 在此次基線沒有有效報表 URL，UI 斷言尚未執行；其前置條件失敗仍保留，不能宣稱 Node 全套通過。WP0 按要求記錄基線含失敗，不將基線失敗隱藏成成功。

## WP0 文件驗證

新增 `docs-baseline.test.mjs` 四項測試：需求原文精確相等、實際模組與規劃標示、WP0–WP10 / M1–M4 路線圖、基線與工作流程連結。先執行時四項失敗，再補齊文件後重跑。

```bash
node --test screentrace-capture/docs-baseline.test.mjs
```

四項通過，失敗 0、略過 0。既有測試與 runtime 未修改，無新增相依。文件驗證不取代後續 WP1/WP2 的模型與解析驗收。
