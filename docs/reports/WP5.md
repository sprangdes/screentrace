# WP5 回報（實作完成，增量四待遠端 CI）

## 1. 工作包與提交

限定 WP5；每個增量先寫失敗測試，前一增量遠端 CI 全綠才繼續。

| 增量 | 提交 | 遠端驗證 |
|---|---|---|
| 一：URL／context | 51c9575386d8d51e295716b0542f858ec23b2e91 | [CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37087105170) |
| 二：行為對應／來源隱私 | bb66bb4136ef86447d161acc280eb046a5c75adb | [CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37089180710) |
| 三：API 契約／SERVER 檢核 | 385578a521698e41f50a542667f3bd812528f703 | [CI 全綠](https://github.com/sprangdes/screentrace/actions/runs/37090565187) |
| 四：嚴格 2.2／歷史入口 | 本次提交 | 待推送確認 |

OQ-004／005／006 已處理，文件 v1.4。WP6 未開始。

## 2. 主要檔案

- 共用 parser：UrlResolution、UrlGraphContribution、ApiContractExtractor；ScriptSources 的可證明 context 別名。
- adapter：SpringMvcAnalyzer／SpringBootAnalyzer、SpringServerValidation、StrutsProjectAnalyzer／ActionContracts。
- core：ApplicationGraph 的歷史專用 Deprecated API、GraphIntegrityValidator.requireAnalysis、ApplicationGraphMerger 的嚴格輸入／歷史標示／行為證據合併。
- scanner／CLI：ProjectInventory、SafeProjectFiles、ProjectScanner、WorkspaceSettings、ScreenTraceCli；設定鍵行號、reserved 名稱與正式分析版本門檻。
- 舊報表：Deprecated ReportGenerator／ReviewResultGenerator，歷史輸出列出 schema 與證據限制；原 fixture／斷言不變。
- 新測試：UrlResolutionTest、UrlGraphIntegrationTest、UrlLinkingTest、WorkspaceContextEvidenceTest／WorkspaceEvidenceNamespaceTest、ServerContractValidationTest、ActionContractTest、SchemaProductionTest、ProductionSchemaTest、HistoricalSchemaEntryTest 等。
- 文件：v1.4、ADR 0011–0016、OPEN_QUESTIONS、ARCHITECTURE、ROADMAP、WP5／M2 回報；無刪除既有測試。

## 3. 測試與結果

WP5 新增 51 個 Java 測試：增量一 11、二 16、三 12、四 12。原 WP4 的 147 個合計為 **198**，0 failure／error／skip。

- `mvn -q verify`：198 個通過。
- `npm --prefix screentrace-js test`：40 個通過。
- `node --test screentrace-capture/{docs-baseline,safe-files,spring-resource-mappings,capture-static-jsp.security}.test.mjs`（實際以四個檔名執行）：14 個通過，含文件原文 4 個。首次 Chromium 遭 macOS sandbox MachPort 權限阻擋而 1 failure；用相同測試在允許 Chromium 啟動的權限重跑後 14 個全綠，未改測試。
- `npm --prefix screentrace-js audit --audit-level=high`、capture 同指令：均 0 vulnerabilities。
- `git diff --check` 通過；本增量既有測試來源檔無 diff；全部 WP5 既有 fixture／斷言均未更動，連 schema 字串也未更動。

先失敗紀錄：增量一缺少引擎／設定 API 編譯失敗；增量二 API／表單五項失敗，工作區證據與 reserved／隱私反例先失敗；增量三 Spring 5 failure／1 error、Struts 1 failure／1 error，DTO 歧義、groups 與動態 message 追加反例失敗。增量四 core 3 failure、CLI 2 failure、歷史報表／匯出 2 failure；兩份歷史圖標示測試 1 error，混合流程暴露行為重複貢獻及暫時 API 未清理。各項保留斷言修正後全綠。最後遠端首次執行新增靜態檢查因 JavaParser 未自設 Java 17 而 1 error；補足測試設定，不改斷言。追加拒絕 Struts 2 圖的隱私測試先 1 failure，將同一隱私處理套到拒絕回傳路徑後通過。

前三增量遠端 Java／Node 測試、npm audit、Dependency-Check 均 success；最後增量待遠端確認，尚不以較早 CI 代替。

## 4. 設計決策

- [ADR 0011](../adr/0011-url-resolution-context-and-yaml.md)：共用 URL、全候選、明確 context；SnakeYAML 2.4 釘選、安全 constructor、Apache-2.0。
- [ADR 0012](../adr/0012-workspace-evidence-namespace-and-privacy.md)：workspace:config.json、鍵行號、reserved 來源與隱私。
- [ADR 0013](../adr/0013-request-behavior-endpoint-correlation.md)：canonical API／表單行為、全部候選、載入與失敗綁定來源。
- [ADR 0014](../adr/0014-server-contracts-and-validation.md)：共享 DTO、Struts 契約、正式 SERVER 註解／Validator 與端點／欄位連結。
- [ADR 0015](../adr/0015-schema-two-production-and-historical-compatibility.md)：OQ-005、歷史 core API、嚴格新分析、不靜默升版。
- [ADR 0016](../adr/0016-historical-report-entries-and-schema-retirement.md)：OQ-006、舊入口／測試保留與 WP7／WP8 移除、新資料門檻、混合行為合併。既有測試／fixture／斷言修改清單：**無**。

## 5. 與指示文件的差異及理由

僅需求方明確授權的 v1.4 修訂：JS API context 必須可證明且有明確實際設定；OQ-004 namespace／隱私；OQ-005 core 歷史預設專用；OQ-006 舊報表／JSON 匯出相容入口與不遷移待移除測試的通則。全部已寫入文件與 ADR，無自行選擇未決方案。

## 6. 開放問題與風險

OQ-004／005／006 均已處理，沒有未決 WP5 問題。無設定的 context 不猜 WAR 名稱；多個 profile／workspace 值皆為候選，不選啟用 profile，不執行環境插值。動態 URL／未知 method 保留 UNRESOLVED。無法解析的群組、動態 message、Validator DI／註冊與型別維持原文／診斷，不載入或執行目標 Java／JS／JSP。

歷史 core 建構子待原測試遷移後移除；舊 ReportGenerator 與原測試於 WP7 移除、ReviewResultGenerator 與原測試於 WP8 移除，已列驗收／技術債。未實作 WP7／WP8。Windows launcher、人工 report-design 未執行，沿用 WP4 限制。

## 7. 驗收逐項對照

| 條款 | 狀態／證據 |
|---|---|
| WP5.1 | 本機通過：精確 CONFIRMED、模板／星號／副檔名 INFERRED、多候選 AMBIGUOUS 全列、方法不符無後端關聯、query／fragment／session 正規化 |
| WP5.2／OQ-004 | 本機通過：properties／安全 YAML／明確 workspace 候選；未知不假設；設定值與來源證據、行號、namespace 正反例、reserved 目標拒絕、圖序列化無家目錄 |
| WP5.3 | 本機通過：API／表單 CALLS／TRIGGERS、載入與失敗綁定／回呼來源保留、唯一結果與歧義全候選、Struts mapping 與混合分析 |
| WP5.4 | 本機通過：MVC／Boot 純後端 RestController／ResponseBody／ResponseEntity、DTO 欄位／import／全候選、Struts ActionForm／getParameter／forward 契約 |
| WP5.5 | 本機通過：javax／jakarta、Valid／Validated、常用 constraints、繼承／getter／record／cascade、自訂 Validator／InitBinder、SERVER、循環／偽註解／groups 反例 |
| WP5.6 | 本機通過：方法／路徑／handler／欄位／契約信心來源；規則 endpointIds 與端點 validationRuleIds、表單欄位元件連結 |
| WP5.7／OQ-005／006 | 本機通過：全部 adapter／合併／CLI 嚴格 2.2；混合歷史拒絕，兩份 2.1 明確歷史、不升版；正式來源不呼叫舊建構子；CLI 實際圖餵給歷史入口為 2.2，僅兩個 Deprecated 報表 write 入口 |
| C1 | 通過：AST／安全文字讀取，不執行目標程式；既有 JS 副作用探針與靜態化安全測試全綠 |
| C2 | 通過：新分析嚴格證據，來源／解析器／狀態／原文；歷史入口清楚限制，不偽造證據 |
| C3 | 通過：排序／穩定貢獻、重複分析位元組／相等測試保留且通過 |
| C4 | 通過：core 無新框架模型名稱，框架語意在 adapter／evidence |
| C5／C6 | 既有安全測試通過；新 HTML 單檔／CSP 完整實作仍屬 WP7，WP5 不宣稱已完成 WP7 |
| C7 | 通過：SafeProjectFiles／大小限制／安全 XML／YAML；reserved 工作區命名空間不替目標檔放寬限制 |
| C8 | 前三增量遠端通過；新相依僅 SnakeYAML 2.4（ADR／釘選／授權）；增量四本機 npm audit 0，最終 Dependency-Check 待 CI |
| C9 | 通過：穩定行為與檢核鍵，不以規則行號建 ID；既有重排／空白測試均通過 |
| C10 | 通過：新文件／診斷繁體中文，程式碼／資料鍵英文 |

本機完成，最後遠端 gate 尚待確認；WP6 未開始。
