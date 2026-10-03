# WP5 回報（增量進行中）

## 1. 工作包與提交

限定 WP5，四增量依序為 URL／context、行為對應、契約／SERVER 檢核、schema 2.2。每次遠端 CI 全綠後才繼續。增量一 `51c9575386d8d51e295716b0542f858ec23b2e91` 已推送，[遠端 CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37087105170)；增量二因 OQ-004 停止；WP6 未開始。

## 2. 主要檔案

UrlResolution.java、UrlResolutionTest.java；工作區設定及 CLI／ProjectInventory 的明確 context 候選傳遞，parser 模組加入釘選安全 YAML 相依，更新 README／架構／路線圖。

## 3. 測試與結果

增量一新增 10 個 URL 測試及 1 個工作區測試，均先確認編譯失敗（缺實作／新設定介面）再實作。`mvn -q verify`：158 個 Java 測試通過；原本 147 個測試斷言完整保留。URL fixtures 涵蓋精確、模板、星號、副檔名、全候選、方法不符、無設定、已證明／未知 context、外部 URL、安全 YAML 與 properties。40 項 JS 測試、4 項 docs-baseline 測試通過，npm audit 0；遠端 npm audit 與 Dependency-Check 全數 success。

增量二新增 UrlGraphIntegrationTest 五項測試，先跑全部五項失敗；另外 WorkspaceContextEvidenceTest 一項失敗，確認外部設定證據在 2.2 驗證遭拒。六項失敗測試保留於本機工作目錄，未推送未完成實作，未修改任何既有斷言。

## 4. 設計決策

[ADR 0011](../adr/0011-url-resolution-context-and-yaml.md)：共用引擎、全部候選、設定證據與 SnakeYAML 2.4（Apache-2.0）安全解析。

## 5. 與指示文件的差異

依需求方新增授權，最後增量僅允許既有 schema 版本字串 2.1 → 2.2 斷言更新，逐處列入 ADR；其餘斷言不變。JS API context 只剝除可證明前綴並使用明確實際設定，未知不猜測。完整文件 v1.4 在完成時更新。

## 6. 開放問題與風險

[OQ-004](../OPEN_QUESTIONS.md) 未決：工作區 context 設定在專案外，C2／2.2 驗證禁止外部 source 路徑；來源命名空間或來源種類擴充須由需求方決定，依 §0.3 停止。引擎未決定啟用的 Spring profile，不執行環境插值；全部明確值為候選。沒有 context 設定產生診斷，不能從 WAR 名稱推測。

## 7. 驗收對照

WP5.1／2 的共用引擎與設定 fixtures 通過本機測試；圖接入、契約、SERVER 規則、schema 2.2 尚待後續增量。WP5 未完成；增量二停止等待 OQ-004 決定，不進入後續增量／WP6，文件 v1.4 等 WP5 完成時更新。
