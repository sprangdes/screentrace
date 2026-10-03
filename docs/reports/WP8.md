# WP8 增量回報

## 前置修正

c70e7c6：ProductionSchemaTest 保留混合分析原斷言，增加實際 application-graph.json schema 2.2 斷言；方法改為 actualMixedCliAnalysisProducesStrictSchemaTwoGraphAndArchive。[遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37113334292)。

## A 共用 md 模組與契約

新增 shared/review-md.ts／strict-graph.ts、dist/review-md.mjs、REVIEW_MD_CONTRACT、兩份 golden；Node／瀏覽器共用、無新相依。Java 只增加實際根 pom 建置版本資料注入。OQ-007／008 已處理，指示文件 v1.7、ADR 0022／0023。

先失敗：模組缺少、golden 尚無檔案、固定警語未更新、Node bundle 缺少、完整函式／圖片資料洩漏、末尾空白未拒絕、未解析 selector／關聯遺漏、多行為／契約集合反轉不相等、Java toolVersion 缺值。依新增斷言實作，既有斷言未修改或刪除。

10 項 md 新測試含兩 golden、惡意指示／反引號／控制／超長、機器完整 ID／污染鍵、SHA 損毀／截斷／偽造最後區塊、JSON 上限／未知欄位、共享 API 三態／未解析旁註、style 引用過濾、契約與證據白名單、排列反轉、Node 直接載入。新增 1 項 Java 版本注入測試。本機 Java 200 tests；viewer unit 全套 22 tests；建置型別檢查通過。最終遠端 gate 待推送後記錄；尚未進入 B／C 或 WP9。
