# WP4 回報（增量進行中）

## 1. 工作包與提交

限定 WP4，依序完成四個增量，每次遠端 CI 全綠後才繼續；WP5 不開始。

增量一提交 `8da98aeac6fa4f79aaeb0fda81981368cedc7f2c` 已推送，[遠端 CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37077608733)，Java 建置／Dependency-Check 與 Node 測試／npm audit 皆 success。增量二至四未開始，OQ-003 觸發 §0.3 停止。

## 2. 主要檔案

增量一新增 screentrace-js 的 parser、JSON cli、釘選相依與 probe fixture，更新 CI、架構與路線圖。

## 3. 測試

增量一先測試缺少 parser.mjs 失敗，再實作；4 個 Node 測試通過（ES5／modern module、錯誤恢復、副作用探針、大小／路徑安全）。npm audit：0 vulnerabilities。`mvn -q verify`：132 個 Java 測試通過；`node --test screentrace-capture/*.test.mjs` 全數通過。既有測試斷言不變。

## 4. 設計決策

[ADR 0007](../adr/0007-javascript-parser-and-json-boundary.md)：Acorn 8.18.0 / acorn-loose 8.5.2，MIT，JSON 邊界、容錯與安全。

## 5. 與指示文件的差異

無。

## 6. 開放問題與風險

[OQ-003](../OPEN_QUESTIONS.md)：未知 `${ctx}` 的 script src 能否按不透明部署前綴定位實體 JS。§0.3 要求停止並詢問，沒有自行選擇。

容錯 AST 不等同確定語意，來源語法錯誤結果保持 UNRESOLVED。

## 7. 驗收對照

增量一的解析器／診斷／probe／路徑與大小測試通過；事件、語意、追蹤、值與 Java 圖整合等待後續增量。WP4 尚未完成。
