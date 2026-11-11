# ADR 0125：R34 分析效率與安全性檢查（第一段）

## 背景

需求方要求最佳化整個程式的分析效率並確認程式碼安全。這一段的時間有限，因此先量測，只處理量測出來、改了之後輸出不變的項目，其餘記錄為後續工作。

reservio（41 個畫面、66 個 API、React＋Spring Boot）在本機完整分析一次約 30.0 秒，各段耗時如下：

| 步驟 | 耗時 |
|---|---|
| 預覽擷取（`capture-static-jsp.mjs`，Playwright） | 15.6 秒 |
| React 分析（`screentrace-js/cli.mjs`，graph 一次、預覽一次） | 5.6＋5.3 秒，依序執行 |
| 預覽封裝（`pack-preview.mjs`） | 0.8 秒 |
| Java 分析與報表 | 約 3 秒（JFR 取樣 63 筆，沒有單一熱點） |

## 決定

- R34-1：React 的預覽分析（`markup=true`）與 graph 分析讀取同一份來源、彼此不依賴。CLI 在建立 graph 之前就以背景執行緒啟動預覽分析（`ReactGraphContribution.prefetchPreview`），之後的 `writePreview` 直接取用結果；graph 中沒有需要重建的 React 畫面、或分析中途失敗時，關閉這個預先分析會中止它並結束 Node 程序。
- R34-2：兩段分析的請求內容與原本完全相同，只是改為同時執行；reservio 的 `application-graph.json`、`viewer-documents.json`、`preview-model.json`、`prototype-model.json` 與 `react-preview.json` 和修改前逐位元組相同。完整分析由 30.0 秒降為 25.0 秒。
- R34-3：預覽擷取逐一畫面執行，且各畫面的樣式與診斷寫入共用的結果，輸出順序必須固定。改為多頁同時擷取需要先把每個畫面的結果分開收集、再依畫面順序合併，這一段不做，列為後續工作。
- R34-4：安全性檢查的結果：
  - 三處 XML 解析（Struts 設定、Maven `pom.xml`、`SafeProjectFiles`）都已關閉 DOCTYPE 與外部實體，沒有 XXE 風險。
  - viewer 只在兩處使用 `innerHTML`，內容都是固定的 SVG 箭頭定義，不含分析資料；其他輸出都用 `textContent`（ADR 0019）。
  - Java 沒有使用 `Runtime.exec`、Java 序列化、腳本引擎或 Jackson 預設型別；Node 工具沒有使用 `eval`、`new Function` 或 `child_process`。
  - 外部程序（`node`）都以固定參數啟動並有逾時，被分析專案的路徑只作為參數傳入，不經過 shell。
  - 這次沒有找到需要修正的安全問題。
- R34-5：只改 CLI 的執行順序與 React 預覽分析的入口；分析邏輯、graph 與報表不變。
- R34-6（2026-11-11 合併前補充）：`node` 可能是版本管理工具（Volta、asdf）的 shim，真正的 Node 是它的子程序。原本 `JavaScriptGraphContribution.run` 結束時只對 shim 呼叫 `destroyForcibly()`，取消或逾時時真正的 Node 會變成孤兒繼續執行。改為先結束所有子孫程序（`process.descendants()`）再結束 shim；列出子孫程序需要讀取系統的程序清單；不允許時（例如 Codex sandbox，OQ-050）仍結束直接子程序，分析不受影響。新增 `NodeProcessTreeTest`，以一個會再啟動子程序的 Node 腳本驗證中斷後不留下任何程序（拿掉這項修正時測試失敗）；兩個腳本自行寫入 PID，測試只以 PID 查詢，不允許列出程序的環境略過這個測試。JSP 預覽擷取與封裝逾時時（`ScreenTraceCli.renderStaticJsp`、`packPreview`）也只結束直接子程序，這兩處不在本段範圍，列為後續工作。

## 後果

React 專案的分析少等一整段 React 分析（reservio 約 5 秒），代價是兩個 Node 程序同時執行，記憶體與 CPU 使用的峰值較高。最大的耗時仍是預覽擷取，下一段從它開始。
