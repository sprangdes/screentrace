# WP5 回報（增量進行中）

## 1. 工作包與提交

限定 WP5，四增量依序為 URL／context、行為對應、契約／SERVER 檢核、schema 2.2。每次遠端 CI 全綠後才繼續。增量一 `51c9575386d8d51e295716b0542f858ec23b2e91` 已推送，[遠端 CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37087105170)；OQ-004 已處理，增量二待遠端 CI；WP6 未開始。

## 2. 主要檔案

UrlResolution.java、UrlResolutionTest.java；工作區設定及 CLI／ProjectInventory 的明確 context 候選傳遞，parser 模組加入釘選安全 YAML 相依，更新 README／架構／路線圖。

## 3. 測試與結果

增量一新增 10 個 URL 測試及 1 個工作區測試，均先確認編譯失敗（缺實作／新設定介面）再實作。`mvn -q verify`：158 個 Java 測試通過；原本 147 個測試斷言完整保留。URL fixtures 涵蓋精確、模板、星號、副檔名、全候選、方法不符、無設定、已證明／未知 context、外部 URL、安全 YAML 與 properties。40 項 JS 測試、4 項 docs-baseline 測試通過，npm audit 0；遠端 npm audit 與 Dependency-Check 全數 success。

增量二新增 UrlGraphIntegrationTest 五項測試，先跑全部五項失敗；另外 WorkspaceContextEvidenceTest 一項失敗，確認外部設定證據在 2.2 驗證遭拒。上述失敗測試現已通過；OQ-004 邊界測試先確認不合法命名空間接受、目標名稱冒充及設定路徑洩漏的失敗，再實作。圖內家目錄洩漏另先失敗後修正；曾遇 null detail 引發新測試錯誤，補充端點證據 detail 後通過。未修改任何既有斷言。

增量二新增 16 個 Java 測試，合計 174 個通過；40 JS、4 docs-baseline 通過，npm audit 0。涵蓋保留命名空間正反例、reserved 目標讀取拒絕、設定鍵行號、序列化隱私、不同設定的證據、API／表單對應、歧義全列、方法不符、未知／重新賦值 context、Struts 副檔名與未知 method。增量二遠端 CI 待推送確認。

## 4. 設計決策

[ADR 0011](../adr/0011-url-resolution-context-and-yaml.md)：共用引擎、全部候選、設定證據與 SnakeYAML 2.4（Apache-2.0）安全解析。

[ADR 0012](../adr/0012-workspace-evidence-namespace-and-privacy.md)：工作區來源、隱私與行號；[ADR 0013](../adr/0013-request-behavior-endpoint-correlation.md)：canonical 行為、全部端點候選與來源保留。

## 5. 與指示文件的差異

依需求方新增授權，最後增量僅允許既有 schema 版本字串 2.1 → 2.2 斷言更新，逐處列入 ADR；其餘斷言不變。JS API context 只剝除可證明前綴並使用明確實際設定，未知不猜測。依 OQ-004 最新指示，本增量已更新文件 v1.4。

## 6. 開放問題與風險

[OQ-004](../OPEN_QUESTIONS.md) 已處理：採方案 A 加來源與隱私限制，文件 v1.4、ADR 0012。引擎未決定啟用的 Spring profile，不執行環境插值；全部明確值為候選。沒有 context 設定產生診斷，不能從 WAR 名稱推測。

## 7. 驗收對照

WP5.1／2 的共用引擎與設定 fixtures 通過本機測試；WP5.3 圖接入與 OQ-004 正反例已通過本機測試；契約、SERVER 規則、schema 2.2 尚待後續增量。WP5 未完成；增量二遠端全綠後才進入增量三，WP6 不開始。
