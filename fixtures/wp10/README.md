# WP10 自行撰寫的合成專案

所有程式、模板、XML、CSS、JS 均由 ScreenTrace 自行撰寫；不複製第三方程式碼。這些來源僅供解析，不可建置或啟動，不含真實元件庫。第三方 JS 檔僅有自行撰寫的辨識標記，沒有函式庫實作。

四個可分析 family：struts1、struts1-spring、spring-mvc-jsp、spring-boot-jsp。struts2-rejected 僅測 UNSUPPORTED_FRAMEWORK，不產出部分圖／報表。

coverage.json 逐條列出 WP2–WP5 的來源檔與語法 token；SyntheticProjectIntegrationTest 檢查清單與全部 token，以隔離來源副本／工作區與 library import 指令綁定虛構 manifest，並對四個專案執行真正 CLI analyze／capture／pack／report 兩次，圖、預覽及 HTML 逐 bytes 比對，目標檔前後 SHA 不變。輸出位於 screentrace-cli/target/wp10-fixtures，每個 first／second 資料夾可供 Node 共用 md 模組與三引擎 E2E 直接讀取，不替換注入資料。

預覽比較固定同一個 Java 測試程序、同一 Chromium／字型／viewport 環境，未把跨作業系統截圖差異視為可比較基線。JS／Java 副作用探針不得執行；讀取的未知／動態語法預期保留 UNRESOLVED。Scriptlet 只是解析資料，絕不執行。

工作區 context 明確值為 /fixture；Boot properties／yml 同值。新增整合測試另驗證無設定與多候選 context；大小拒絕及其他對抗性邊界由既有聚焦測試繼續覆蓋，不靠執行目標服務。

## 分析結果摘要 golden

`golden/<family>.summary.json` 為四類可分析來源的初始預期輸出。摘要包含 canonical SCREEN 數、COMPONENT 按 kind、全部 Behavior 按類型、全部 ENDPOINT 的 API 總數／各狀態、ValidationRule 按層級、圖內診斷代碼／數量。enum 分組即使為零仍列出；API 狀態以未確認、沒有任何畫面／元件決策的初始狀態，使用正式 viewer／md 共用 deriveApiUsage。不是只計算 REST contract，也不含 capture 額外的預覽診斷。

synthetic-project.e2e.mjs 對 Java first／second 兩份實際 payload 逐欄比對這些 golden；新增／刪除欄位或任何數量改變都失敗，訊息含 family 與欄位路徑。另有 mutation test 驗證每種摘要葉節點、增減欄位與型別差異都會失敗。所有原有語意、決定性與 E2E 斷言保留。

測試只讀取 golden，不自動更新。若來源或分析行為有經核准的變動：先執行完整分析與測試，檢查差異及來源證據，再人工更新受影響摘要。提交說明必須列出原因、受影響 family／欄位與前後數量；禁止把測試失敗直接當成更新理由。本次是依需求新增四份初始基線，沒有變更既有 golden 或 fixture。
