# WP8 增量回報

## 前置修正

c70e7c6：ProductionSchemaTest 保留混合分析原斷言，增加實際 application-graph.json schema 2.2 斷言；方法改為 actualMixedCliAnalysisProducesStrictSchemaTwoGraphAndArchive。[遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37113334292)。

## A 共用 md 模組與契約

新增 shared/review-md.ts／strict-graph.ts、dist/review-md.mjs、REVIEW_MD_CONTRACT、兩份 golden；Node／瀏覽器共用、無新相依。Java 只增加實際根 pom 建置版本資料注入。OQ-007／008 已處理，指示文件 v1.7、ADR 0022／0023。

先失敗：模組缺少、golden 尚無檔案、固定警語未更新、Node bundle 缺少、完整函式／圖片資料洩漏、末尾空白未拒絕、未解析 selector／關聯遺漏、多行為／契約集合反轉不相等、Java toolVersion 缺值。依新增斷言實作，既有斷言未修改或刪除。

10 項 md 新測試含兩 golden、惡意指示／反引號／控制／超長、機器完整 ID／污染鍵、SHA 損毀／截斷／偽造最後區塊、JSON 上限／未知欄位、共享 API 三態／未解析旁註、style 引用過濾、契約與證據白名單、排列反轉、Node 直接載入。新增 1 項 Java 版本注入測試。本機 Java 200 tests；viewer unit 全套 22 tests；建置型別檢查通過。A `2ba88ae`，[遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37115885177)，含三引擎 E2E／npm audit／Dependency-Check；gate 通過後才進入 B。C／WP9 尚未開始。

## B 檢視器匯出與匯入

先失敗：三個流程與容量 E2E 等待缺少的 download／檔案控制逾時。新增 md-controls，Blob 本地下載、選取檔案匯入；格式／損毀／截斷不改目前決策，成功才更新並保存。指紋改變／未知複合鍵完整保存，列 orphan 與分析結果已變更。輸入檔案沿用 1 GiB 工具安全硬界線，JSON 仍 32 MiB；不解析網路資源。

本機 Chromium／WebKit 全套 22 E2E（含新 md 7 項）通過；三引擎於遠端為全套 26 E2E（新 md 10 項）。逐引擎標記→匯出→清除 localStorage→匯入→再匯出，generated_at 外位元組相同；未知 ID 保留、損毀拒絕、實際 >5 MB 完整下載與警告通過。200 Java、22 unit 通過；既有斷言未修改。B 首輪 f18eae3 [遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37116287520)；C／WP9 未開始。

B 邊界補足：新增字串／regex 內的 function／分號與物件方法／模板插值函式本體反例，先失敗。改用 Acorn 8.18.0 MIT（ADR 0024，新增釘選 lock）解析 AST、迭代檢查，不執行目標文字；保持允許的文字，省略真正函式／敘述式。24 unit、200 Java、22 Chromium／WebKit E2E、npm audit 0 通過；首次渲染 160.6 ms，縮放中位數 <1 ms。B 最終 8ea190d [遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37116717919)，含 Acorn npm audit／Dependency-Check 與三引擎往返；gate 後才進 C。

## C 移除舊碼

新增 3 項 Java 退場測試先失敗後實作。移除 ReviewResultGenerator／13 項原測試、CLI export／互動選項／helper、舊契約與範例；停止初始化只供舊入口的 overlay，不刪使用者已有檔案。StandaloneViewerTest 只移除 obsolete export 尾段、準確改名；新 schema／HTML／CSP 及其他長期分析斷言全保留（ADR 0025）。README／ARCHITECTURE／ROADMAP 更新。最終 gate 待推送；未進 WP9。

C 補足：元件存在的 CONFIRMED 不可掩蓋其 AMBIGUOUS 綁定證據；新增反例先失敗，§8 列 aggregate 與所有證據狀態。原兩份 golden、原斷言完全不變。clean verify 190 Java；單元測試 25 項通過。

C 最終本機結果：190 Java、25 unit、22 Chromium／WebKit E2E 全通過；首次渲染 206.9 ms、縮放中位數 1 ms。遠端 gate 通過後本輪停止，未啟動 WP9。
