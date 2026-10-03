# ADR 0021：WP7 E 舊檢視器與 HTTP 入口退場

日期：2026-10-03；狀態：採用。依需求方 WP7 E 與 OQ-006 的明確授權。

## 決定

移除 ReportGenerator 的 HTML／JS／CSS、舊 PreviewModelGenerator、workflow-canvas.css、CLI localhost HttpServer、overlay PUT／review POST 端點及 token／HTTP CSP／靜態伺服 helper。CLI 以 SingleHtmlAnalysisWriter 產生嚴格 schema 2.2 資料，工具 capture→pack-preview 靜態封裝後注入單檔，Desktop 開啟 file://。Java 不加入 UI 邏輯。

launcher 於 Maven 打包前 npm ci（釘選、ignore-scripts）並建置 viewer，偵測 TS／CSS／HTML／lock 變更；Node 18+ 可用。捕捉工具從工具原始碼祖先目錄定位，不依賴 .git 或目標專案工作目錄。CLI report 可辨識歷史分析資料夾，但只能從嚴格 2.2 圖重建新 HTML；不開啟舊 index.html。

新分析仍產出 Graph／Prototype／Preview canonical JSON 供其他既有資料消費者；保留空 edit-overlay 初始化及 ReviewResultGenerator／CLI export 至 WP8。它們是歷史相容，不消費新 viewer localStorage；WP8 隨 md 新入口移除，未提前實作。元件庫 manifest 的注入欄位保留，實際匯入／建議屬 WP9。

封裝讀取沿用安全路徑、來源單檔限制、WP6 metadata 32 MiB 上限；新的工具產物彙整讀取以既有 MAX_PROJECT_TOTAL_BYTES（1 GiB）為安全硬界線。100 MB HTML 容量為警告閾值，實測大於閾值仍寫完整檔案。無放寬既有來源限制。

## 依授權移除的測試（不遷移或放寬斷言）

| 檔案／方法 | 原因 |
|---|---|
| ReportGeneratorTest（全部） | 已移除的 HTML 注入／舊 Prototype／Preview UI 行為 |
| ReportGeneratorSecurityTest（全部） | 已移除的舊 iframe HTML；由新三引擎 file:// 安全測試驗證 |
| FixtureReportContractTest（全部） | 直接產生舊 ReportGenerator 與其 UI 字串契約 |
| ReviewExportContractTest（全部） | 認證 browser POST／CLI 合約一致性，已移除的 POST 與 token；ReviewResultGeneratorTest 保留至 WP8 |
| HistoricalSchemaEntryTest（全部 2 methods） | 兩項皆用已移除 ReportGenerator 建 fixture；不投資遷移預定 WP8 移除的 export 測試 |
| ProductionSchemaTest.actualCliAnalysisFeedsSchemaTwoToHistoricalReportAndExport（僅 obsolete 報表／匯出尾段） | 保留原 fixture、CLI／Spring／Struts／端點等全部分析斷言原文，只移除直接使用 ReportGenerator 的尾段；新 StandaloneViewerTest 驗證新單檔 |
| ProductionSchemaTest.onlyDeprecatedHistoricalReportAndExportEntriesWriteReports | 原本列出舊 ReportGenerator 的歷史 API 清單；新 static 退場測試檢查舊類別／server 不存在 |
| PreviewCaptureReaderTest.reportUsesPreviewContractForReconstructionNoticeDiagnosticsAndAllElementConditions | 只驗舊 UI 字串；Reader 的完整資料／拒絕歷史／dangling 三項原樣保留，新 file:// 元素／條件測試取代 UI 驗收 |
| ScreenTraceCliTest.onlyResolvesStaticFilesInsideTheirAllowedRoot | 舊 HTTP 靜態伺服方法已移除 |
| ScreenTraceCliTest.limitsOverlayBodiesAndUsesLoopbackForTheReportServer | 舊 HTTP body、loopback、token 已移除 |
| ScreenTraceCliTest.hardensUntrustedPreviewAndUsesSafeUnknownMimeType | 舊 HTTP CSP／MIME helper 已移除 |
| ScreenTraceCliSecurityTest.previewPolicyBlocksActiveContentAndUnknownMimeTypesAreBinary | 同上；SafeProjectFiles symlink 測試原樣保留 |
| screentrace-capture/report-design.test.mjs | 舊 localhost/UI PUT 手動 smoke；原自檢文件標歷史，BASELINE 原實測不改 |

只移除 obsolete 報表／server 方法、檔案與報表尾段；保留長期分析程式的全部既有斷言。新 viewer 邏輯、CSP／探針、真實 CLI capture／pack 整合、API 三態來源、超過 100 MB 實際產出由新增測試驗證。WP8 原有 ReviewResultGeneratorTest 與 CLI export 不變。

## 正式 CSS data URI 與 fixture 相容

正式 packStandaloneDocuments 將樣式表也依 MIME＋SHA-256 字典去重、保存 CSS data URI；srcdoc 建立時解出巢狀圖片／字型標記，依字典一次 materialize 並快取。CSS @import 保留原生 layer／supports／media 條件，以子 CSS data URI 表示，不把條件猜測成 media；新增邊界測試先失敗後通過。CSP style-src 額外允許 data: 以符合 WP7.4，本地 inline 屬性仍需需求方授權的 unsafe-inline；script-src 不變，無遠端來源。

依 v1.4／OQ-006 通則，C 增量的 inline-CSS packDocuments 舊入口只保留歷史 fixture，相容原 3 項斷言，不投資遷移；JSDoc Deprecated 明確註記。正式 CLI 不呼叫它，新 unit／E2E 驗證 CSS data URI 與巢狀資源、雜湊去重及零對外請求，static 測試鎖定正式入口。此歷史入口與 fixture 於 capture 相容清理時一併退場，列入 ROADMAP 技術債；不是放寬長期程式斷言。
