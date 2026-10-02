# WP4 回報（增量進行中）

## 1. 工作包與提交

限定 WP4，依序完成四個增量，每次遠端 CI 全綠後才繼續；WP5 不開始。

增量一提交 `8da98aeac6fa4f79aaeb0fda81981368cedc7f2c` 已推送，[遠端 CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37077608733)，Java 建置／Dependency-Check 與 Node 測試／npm audit 皆 success。OQ-003 曾依 §0.3 停止，需求方選受限制的 B 後繼續增量二。停止紀錄 `027a0f0` [CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37077836291)。

## 2. 主要檔案

增量一新增 screentrace-js 的 parser、JSON cli、釘選相依與 probe fixture，更新 CI、架構與路線圖。

## 3. 測試

增量一先測試缺少 parser.mjs 失敗，再實作；4 個 Node 測試通過（ES5／modern module、錯誤恢復、副作用探針、大小／路徑安全）。npm audit：0 vulnerabilities。`mvn -q verify`：132 個 Java 測試通過；`node --test screentrace-capture/*.test.mjs` 首次 13 通過、2 失敗：Chromium 沙箱 MachPort 權限不足，以及手動 report-design 測試缺 URL。退出碼被後續 diff 指令覆蓋，先前的「全數通過」紀錄不正確，已更正。安全／文件／路徑測試取得 Chromium 執行權限後 9 個通過；手動報表測試不當作此增量自動測試成功。既有測試斷言不變。

## 4. 設計決策

[ADR 0007](../adr/0007-javascript-parser-and-json-boundary.md)：Acorn 8.18.0 / acorn-loose 8.5.2，MIT，JSON 邊界、容錯與安全。

## 5. 與指示文件的差異

無。

## 6. 開放問題與風險

[OQ-003](../OPEN_QUESTIONS.md) 已處理：受限制的 B，見 ADR 0008；API URL 不套用，WP5 未開始。

容錯 AST 不等同確定語意，來源語法錯誤結果保持 UNRESOLVED。

## 7. 驗收對照

增量一的解析器／診斷／probe／路徑與大小測試通過；事件、語意、追蹤、值與 Java 圖整合等待後續增量。WP4 尚未完成。

增量二：Node 選擇器／綁定測試先因缺 bindings.mjs 失敗、Java 來源測試先因缺 ScriptSources 編譯失敗，再實作；7 個 Node 測試與 136 個 Java 測試通過。新增 ADR 0008，文件更新 v1.3。

增量二提交 `20a6b6d4fddff4f797cac00fd42bd257a2a200dd` 已推送，[遠端 CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37078464909)。capture 四個自動測試檔案再次合計 14 個通過。

增量三：新增 9 個語意測試，首次缺 analyzer.mjs 失敗；Bootstrap/onload、HTTP 動態 method 額外反例先失敗後修正。JS 合計 16 測試通過，Java 136 測試通過。表格 JSON 字串跳脫曾有編譯前錯誤，修正資料跳脫後通過；未修改測試斷言。設計見 [ADR 0009](../adr/0009-javascript-public-api-semantics.md)。
