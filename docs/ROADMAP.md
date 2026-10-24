# ScreenTrace 工作包路線圖

依 [CODEX_INSTRUCTIONS.md](CODEX_INSTRUCTIONS.md) 1.9（2026-10-03）與 [REQUIREMENTS.md](REQUIREMENTS.md) 執行。過去 POC 已有功能不等同新驗收完成；基線見 [BASELINE.md](BASELINE.md)。每個工作包獨立提交，每個里程碑結束後等待需求方確認。

| 工作包 | 範圍 | 狀態 |
|---|---|---|
| WP0 | 基線、需求原文、架構與文件整理 | 完成；原始失敗與後續補足的報表測試實測皆保留於 BASELINE |
| WP1 | 行為與檢核模型、穩定 ID、API 使用狀態 | 完成；schema 2.2、穩定鍵、依 (screenId, componentId) 決策的 API 推導，OQ-001 已決定 |
| WP2 | Struts 1.x、Dispatch、Validator、Tiles、拒絕 Struts 2 | 完成；遠端 CI 全綠（e8139dd） |
| WP3 | JSP / HTML 元件、控制流程、檢核、事件來源 | 完成；OQ-002 已處理，132 個 Java 測試與遠端 CI 全綠，見 reports/M2.md |
| WP4 | JavaScript AST、事件與函式追蹤 | 完成；四個增量皆遠端全綠，40 JS／147 Java 通過；OQ-003 已處理（v1.3），見 reports/WP4.md |
| WP5 | URL 對應、API 契約、Spring 檢核 | 增量一 URL／context 遠端全綠（51c9575）；OQ-004 已處理；增量二來源隱私／圖對應遠端全綠（bb66bb4）；增量三契約／SERVER 遠端全綠（385578a）；OQ-005／006 已處理；增量四最終 b7b51b9 遠端全綠，WP5 完成 |
| WP6 | 靜態預覽、完整元素樣式、條件標記 | 完成；6d557d6 遠端全綠，203 Java／40 JS／30 capture；見 reports/M3.md |
| WP7 | 單一 HTML、Screen Map、API 頁、review | 完成；A–E 逐增量推送並遠端全綠，見 reports/WP7.md |
| WP8 | review md 匯出與還原、移除 JSON 匯出 | 完成；A／B／C 逐增量遠端全綠，md 往返三引擎通過；OQ-007／008 已處理；驗收後 v1.8 Unicode／code span／64 MiB 補強，見 reports/WP8.md |
| WP9 | 元件庫 manifest、驗證與決定性比對 | 完成；四增量皆遠端全綠，OQ-009／010 已處理；Schema 補強後 201 Java／38 unit／33 三引擎 E2E；見 reports/WP9.md |
| WP10 | 限定合成 fixture、決定性、完整 E2E、使用文件 | 完成；17dd801 遠端全綠，204 Java／46 三引擎 E2E；見 reports/M4.md，不做效能／格式化／相容清理 |
| R2 | WP11–WP16：報表呈現補強與查證 | 完成；各工作包獨立提交；WP16 記錄於 reports/R2.md |
| R4 | UI1–UI5：報表介面改善 | UI1 已驗收；UI2／UI4 完成（241 Java／52 viewer／60 Chromium E2E）；UI2–UI4 已驗收；UI3 無對應 tag-body 名稱依 OQ-015 方案 A 未完成、另案處理；UI5 完成待驗收（241 Java／54 viewer／65 Chromium E2E），見 reports/R4.md |
| R5 | WP21–WP23：靜態名稱、端點分群與流向 | 已驗收（2026-10-09，隨 R14 實測確認）；靜態名稱與端點分群仍由報表資料使用，WP23 的流向關係與容納版面由 R14 WP49 泳道地圖延續。證據：`wp23-flow.e2e.mjs`「WP23 owner workflow cards follow deterministic WP49 feature lanes…」、`NonInteractiveCliTest.actualAnalyzeAndReportAcceptCaseAndSymlinkWorkspaceRootsWithIdenticalHtml`；見 reports/R5.md。 |
| R3 | WP17–WP20：流程補強與呈現修正 | 已驗收（2026-10-09，隨 R14 實測確認）；G9 導覽關係、格狀配置與 G10 元件名稱仍可用，R14 WP49 以泳道地圖承接總覽版面。證據：`wp20.e2e.mjs`「WP20 overview global toggle, grid, incident highlights and focus navigation groups」、`wp23-flow.e2e.mjs`「WP23 owner workflow cards follow deterministic WP49 feature lanes…」；見 reports/R3.md。 |
| R8 | WP30–WP32：需求方文件、可重現截圖與 CLI 友善失敗 | 已驗收（2026-10-09，隨 R14 實測確認）；使用者指南與無互動終端機的 config 友善失敗仍可用。證據：`guide-docs.test.mjs`「requester guide is task-focused, safe, plain-language and illustrated」、`wp40-guide-contract.test.mjs`「WP40 guide uses always-available marking and retains storage and size notices」、`NonInteractiveCliTest.configWithoutAnInteractiveTerminalNamesTheConfigRequirement`；見 reports/R8.md。 |
| R9 | WP33：路徑大小寫與符號連結 | 已驗收（2026-10-09，隨 R14 實測確認）；路徑邊界與符號連結防護仍存在。證據：`JspProjectParserSecurityTest.traversalAndSymlinkIncludesAreUnresolved`、`NonInteractiveCliTest.actualAnalyzeAndReportAcceptCaseAndSymlinkWorkspaceRootsWithIdenticalHtml`。Windows 仍未驗證；見 reports/R9.md、ADR 0061。 |
| R10 | WP34–WP38：需求方功能理解與確認工作流 | WP34–WP36 已驗收；WP37 已由 R14 WP45 第 8 點首頁盤點與交付清單取代。WP38 已完成（隨 R11–R14 實作）：流程大綱、全域搜尋、首次引導、「?」說明浮層均有現行實作與測試。證據：`wp38.e2e.mjs`「WP38 flow outline, global search, first-run guide and help can be used without changing decisions」及「WP38 rendered flow tree expands each screen once…」；見 reports/R10.md。 |
| R11 | WP39–WP40：檢視器簡化與決策介面常駐 | 已驗收（2026-10-09，隨 R14 實測確認）；無模式決策與檢視器能力保留，R14 WP45／WP46 取代舊確認版面。證據：`wp39-simplify.e2e.mjs`「WP39 viewer removes mode controls…」、`wp40-always-on-decisions.e2e.mjs`「WP40 decisions stay available without a mode…」；見 reports/R11.md。 |
| R13 | WP43：畫面切換動畫 | 已驗收（2026-10-09，隨 R14 實測確認）；轉場仍保留舊預覽至新 iframe 載入、支援 reduced motion 與快速切換。證據：`wp43-transition.e2e.mjs` 中 `WP43 in-screen navigation keeps the old preview until the next iframe loads…`、`WP43 rapid navigation cancels pending switches…`；見 reports/R13.md。 |
| R14 | WP44–WP50：功能盤點工作台（分析誤判修正、盤點首頁、逐頁確認、決策原因與備註、按鈕合併、地圖泳道、API 與交付清單） | WP44–WP50、§11.1 與 §12 抽查補正完成，R14 結案。最終 §5 驗證：305 Java（304 通過、1 跳過）、118 viewer、45 JS、43 capture、168 預設並行 E2E 全綠。§12 提交 `d090315`、`03db57b`、`cdb2353`、`b60683a`，先補失敗測試再修正；API basis 區分完整常值與動態串接，REDIRECT 類別顯示「轉址」。eMusicStore 實測：無 context path 為 1／1／5／0，有 `/eMusicStore` 為 2／4／1／0（使用中／推定使用中／找不到呼叫來源／可移除）。詳見 reports/R14.md、ADR 0067／0069／0070／0071。 |
| R15 | WP51–WP53：API 轉址標示收尾、ROADMAP 狀態整理、Struts 1 官方範例唯讀實測稽核 | 已驗收（2026-10-09）；WP53 稽核發現 Struts 1 系統性誤判，OQ-024–026 已決定，修正於 R16。見 reports/R15.md、ADR 0072。 |
| R16 | WP54–WP59：Struts URL 別名與 forward 正規化、Tiles 畫面界線、Validator／DispatchAction、訊息資源、JSF 標示、重新稽核 | 完成並結案（2026-10-11）。§9.1 Tiles 畫面依 title put、body JSP、definition 名稱排序，重複名稱以可讀資訊區分；faces-example2 與 WP10 outer 實測完成。完整驗證與 Spring graph 雜湊見 [reports/R16.md](reports/R16.md)、ADR 0074–0083。 |

| 里程碑 | 工作包 | 狀態 |
|---|---|---|
| M1 | WP0、WP1、WP2 | 完成；需求方已授權進入 M2，遠端 CI 全綠，見 reports/M1.md |
| M2 | WP3、WP4、WP5 | 完成；三工作包均遠端全綠，最終 WP5 b7b51b9；需求方已驗收並授權進入 M3 |
| M3 | WP6、WP7、WP8 | 完成；WP6／WP7／WP8 與 v1.8 補強已驗收 |
| M4 | WP9、WP10 | 已驗收（2026-10-09，隨 R14 實測確認）；四類合成專案、決定性輸出與離線完整流程仍有整合測試。證據：`SyntheticProjectIntegrationTest.sourceOnlyCliPipelineTwiceProducesIdenticalGraphPreviewAndHtmlAndRejectsStrutsTwo`、`synthetic-project.e2e.mjs`「real source fixtures produce identical graph, packed HTML and shared-module md on consecutive runs」；見 reports/M4.md。 |
| R2 | WP11–WP16 | 完成；報表關聯、需求方資訊、API 呼叫來源、review 標記及呈現查證完成；見 reports/R2.md |

## 本次調整前的既有能力

- 七個 Maven 模組與 capture Node 模組。
- 新分析嚴格 schema 2.2 圖、來源、解析信心、API request/response 契約；2.1 僅歷史相容。
- Struts 1 / Struts + Spring / Spring MVC JSP / Spring Boot JSP 的合成 fixture 與部分解析。
- JSP 靜態預覽、Chromium 截圖、互動元件位置、localhost 報表與 review JSON v2。

這些能力仍有附件 §3 列出的落差。WP3／WP4 已完成本次要求的標記與 JavaScript 靜態分析；後端對應 WP5 已驗收；單檔 HTML WP7 分增量驗收；md 匯出與元件庫匯入依 WP8／WP9。不啟動或修改被分析專案，不產生遷移程式碼。

## 技術債

- OQ-013：spring:url 與 c:url 在迴圈內行為不一致；本次僅授權 spring:url 的同作用域靜態樣板例外，c:url 維持既有 UNRESOLVED 邊界。待日後授權統一，見 ADR 0005。

- API 狀態規則目前有 Java ApiUsage 與 TypeScript deriveApiUsage 兩份實作；以 [共用向量](examples/api-usage-vectors.json) 為一致性依據，兩端測試比對同一份完整預期（R-API-1～6）。後續規則變更須同時通過兩端向量測試，待未來整合共用執行實作；見 [ADR 0034](adr/0034-api-usage-shared-vectors.md)。

- OQ-005：待既有歷史測試遷移後移除 ApplicationGraph 舊版相容建構子；目前只供讀取歷史資料與既有 fixture，正式分析不得使用。

- WP7 E 已移除 Deprecated ReportGenerator 與原測試／localhost／POST endpoint；新資料注入只接受嚴格 2.2。
- WP8 C 已移除 ReviewResultGenerator／原測試與 CLI export；新 md 與共用模組嚴格 2.2。

- WP7 B：單檔畫布／決定性 SCC 分層、檔案樹、URL 搜尋與平移縮放已實作；逐增量 CI gate 見 docs/reports/WP7.md。

- R10 WP37 已由 R14 WP45 第 8 點取代；WP38 流程大綱、全域搜尋、首次引導與說明浮層已由 R11–R14 完成，見 [R10 報告](reports/R10.md)。

- capture 相容清理：packDocuments 舊 inline CSS 入口僅供 C 增量歷史 fixture；正式 CLI 使用 packStandaloneDocuments。依 OQ-006 保留原斷言，後續與歷史 capture 路徑一併移除（ADR 0021）。

- OQ-015：WP21 已補足靜態 tag body 名稱（ADR 0045）；R4 範圍內缺少確切 graphComponentId 對應的 tag-body 導覽元件暫用圖中 title；UI3 此項未完成，另案補強分析／capture 的可證明對應後再採可見文字，不依 DOM 順序或文字相似度猜配。

## R6 停止點

- WP24／WP25：縮圖主體卡片、640px PNG、完整靜態頁面原型檢視器與記憶體歷史；完成驗證後等待需求方驗收外觀與動畫，見 reports/R6.md、ADR0050／0051。
- WP24／WP25 已驗收。WP26：純圖離線導覽、表單／全部分支、彈窗、API 提示、操作／檢查與誠實覆蓋率；完成完整驗證後停止等待需求方驗收，見 reports/R6.md、ADR0052。

## R7

- R7 完成並驗收：WP27／WP28 與 WP29 已通過；表單委派操作與覆蓋率共用同一模擬結果，覆蓋率同步顯示多候選數。最終驗證 268 Java、40 JS、80 viewer unit、85 Chromium E2E 通過。詳見 reports/R7.md、ADR0054／0055／0056。
- 技術債：Java 與 capture 的 tag 展開仍為兩份實作，不在 R7 合併；以 docs/examples/expansion-anchor-vectors.json 的雙端向量與展開整合測試降低漂移風險。

## R11 停止點

- WP39／WP40：檢視器操作／檢查切換與縮放下拉移除；決策介面不設模式開關。點擊直接模擬，樣式固定於右側分頁，決策與進度常駐，工具列保留鍵盤操作。完整驗證後停止等待需求方驗收；未授權進入 R10 WP37／WP38。見 reports/R11.md、ADR 0059／0060。

## R17

- 需求方於 2026-10-11 決定回到主要流程、全面簡化報表：只剩「畫面」「API」兩頁、畫布 zoom in 聚焦、模擬操作＝真實點擊、進度自動存成 md、移除信心狀態／樣式／元件庫。指示見 [ADJUSTMENT_R17_FLOW.md](ADJUSTMENT_R17_FLOW.md)。
- 第一階段（WP60、WP61，並提前完成 WP64）：報表改為兩頁，移除 §2 清單功能，API 頁三狀態。完整驗證後停止等待需求方檢視，見 [R17 報告](reports/R17.md)、[ADR 0084](adr/0084-r17-two-page-report-and-retired-tests.md)。
- 第二階段（WP62、WP63）：畫布 zoom in 聚焦、關聯線縮圖與前往、點擊模擬不受檢核限制。完整驗證後停止等待需求方檢視，見 [R17 報告](reports/R17.md)、[ADR 0085](adr/0085-r17-canvas-zoom-focus-and-click-simulation.md)。
- 第三階段（WP65、WP66）：進度檔自動存檔、md 一律 v1 並精簡正文。完整驗證後停止等待需求方驗收，見 [R17 報告](reports/R17.md)、[ADR 0086](adr/0086-r17-progress-file-autosave-and-md-v1.md)。
- 第四階段（WP67、WP68）：`screentrace <專案路徑>` 一步分析、設定改為選用、指南與文件依新流程重寫。R17 全部完成，等待結案驗收，見 [R17 報告](reports/R17.md)。

## WP69 公開業務應用流程修復

- 分支 `fix/workflow-restoration`，處理 [實測問題 WF-001–009](reports/WORKFLOW_RESTORATION_20261018.md)：Struts legacy web roots／控制項、Spring view returns／resolver、JS 靜態效果與日期元件、Web Flow、inline 背景圖封裝。
- 原始失敗證據保留，修正後以同一份三專案來源與完整操作旅程驗收；結果、限制與重現入口見 [修正報告](reports/WORKFLOW_FIXES_20261018.md)、[ADR 0091](adr/0091-public-workflow-restoration.md)。

## 新增公開專案驗收第二批（2026-10-18）

- 三個全新 JSP 業務專案及一個 Thymeleaf 負對照；25 個檢查 14 PASS／11 FAIL，5 個旅程 2 PASS／3 FAIL。
- WF-010 預覽 selector、WF-011 刪除確認未修正；WF-012 資料狀態功能缺口、原專案問題及負對照分別記錄。詳見 [測試報告](reports/WORKFLOW_BATCH2_20261018.md)。本批只有驗證與證據，未將新失敗宣告修復。

## WP70 第二批公開專案修正

- 修正 WF-010 冒號標籤、WF-011 確認取消、WF-012 有來源證據的示範 CRUD，加入 NC-001 有限度 Thymeleaf URL／HTML view 投影；另修復視覺複核發現的 WF-013 透明淡入快照。
- 原 25 案例／5 旅程全部通過，新增確認控制與完整示範 CRUD 測試；標準套件 730 項、729 PASS／既有 1 skip。未更動既有斷言、目標來源或 graph schema。見 [修正報告](reports/WORKFLOW_BATCH2_FIXES_20261018.md)、[ADR 0092](adr/0092-public-workflows-state-and-template-projection.md)。

## 新增公開專案完整性驗收第三批（2026-10-18）

- 四個不重複業務應用：Struts 契約、Boot/JSP 網銀、MVC 庫存、Thymeleaf 航空。獨立來源盤點 37 頁面／片段、73 路由、334 控制項均被發現，但 36 個 Ajax 呼叫未還原；48 個 Spring 非 REST handler 的可能目的頁集合只有 24 個完整。
- 真實離線原型操作 41 案例 14 PASS／27 FAIL，5 旅程 3 PASS／2 FAIL；新增資料與回饋失敗保留，不以導覽成功宣稱功能等價。新增 WF-014–022、NC-002–003，只有測試記錄，未修改產品／宣稱修復。見 [完整性實測報告](reports/COMPLETENESS_BATCH3_20261018.md)。

## WP72 第三批公開專案問題修正

- 修正 WF-014–022、NC-002–003：Ajax、相對資源與請求、分支回傳、頁面組合、Struts 控制項、modal/offcanvas、回饋、有效 web root、Thymeleaf 表單及示範資料。新增 WF-023 的診斷排序已修正，頭像像素差異仍未解決。
- 不放寬原斷言；原 B08 錯誤 selector 的 FAIL 保留，新增來源正確的開窗及四種表單切換案例。原專案缺少 API handler 與佔位功能另列，不能宣稱所有業務功能完整等價。見 [修正與驗收報告](reports/WORKFLOW_BATCH3_FIXES_20261019.md)、[ADR 0093](adr/0093-public-completeness-workflow-repairs.md)。

## WP73 第四批不重複公開專案驗收（2026-10-19）

- 三個新 repository：Struts 1／Tiles 音樂管理、MVC／JSP 圖書管理 App1、Boot／Thymeleaf 旅館。32 頁面／片段、52 路由、179 控制項都有發現；仍有路由／實體 view、事件、條件、樣式與資料支援缺口。
- 有效檢查 33 項 10 PASS／23 FAIL，5 旅程 1 PASS／4 FAIL；原 H11 有格式／姓名預期限制，保留原結果並以來源正確的 X03 補驗。新增 WF-024–033、NC-004–005，外部依賴及原專案缺頁另列；未修改產品或宣稱修復。見 [測試報告](reports/COMPLETENESS_BATCH4_20261019.md)。

## WP74 第四批公開專案問題修正（2026-10-19）

- 修正 WF-024–033、NC-004–005 的有限分析／模擬路徑，補上離線圖示、新解鎖的動態查詢路徑 WF-034，以及 autofocus 擷取時序 WF-037、下拉選單初始可見狀態 WF-038。41／41 實體來源回傳、13／13 本地 CSS 通過；五次各 46 份產物一致，完整回歸 786 通過／1 略過。
- 原操作 28 PASS／3 FAIL；來源更正後有效 33 項 31 PASS／2 FAIL。原 H11、X03 的錯誤預期與 FAIL 保留，以 X04 驗證來源日期欄位。前述 WP73 的「X03 來源正確」已由本次複核更正：來源沒有電話欄位。
- 自訂 Hibernate DAO 與外部 HTTP 清單資料回顯仍未解決（WF-035／036），不宣稱功能完全等價。見 [修正報告](reports/WORKFLOW_BATCH4_FIXES_20261019.md)、[ADR 0094](adr/0094-public-batch4-workflow-repairs.md)。

## WP75 第五批不重複公開專案驗收（2026-10-20）

- 三個新 repository：Struts 1／Spring 物料、MVC／JSP 學生、Boot／Thymeleaf 支出；與既有 18 個 repository 無交集。21 頁面／片段、21 個 Controller／Struts 路由、153 控制項都有發現；另 2 個 Security 配置入口缺失。
- 來源更正後有效 30 檢查為 6 PASS／24 FAIL，3 旅程 1 PASS／2 FAIL；新增 WF-039–049、NC-006。目的頁集合 17／21 正確，12 個本地 CSS 參照 7 PASS／5 FAIL；支出可跳頁但提交資料沒有回顯，學生資料旅程阻於提交回首頁。
- 本批僅驗證及保留問題證據，沒有修改產品／既有斷言；前批 WF-035／036 未修復。來源 377 檔不變，兩次各 41 份產物一致。詳見 [測試報告](reports/COMPLETENESS_BATCH5_20261020.md)。

## WP76 第五批公開專案問題修正（2026-10-20）

- 修正 WF-039–049、NC-006 的來源可證明範圍，另修正新發現的 WF-050 巢狀候選選取。21／21 目的頁集合、12／12 本地 CSS、2／2 Security 入口通過；原始斷言與失敗保留。
- 原 30 項操作 23 PASS／7 個錯誤 oracle 的 FAIL；來源修正及新增資料補驗合計有效 32 項 31 PASS／1 FAIL，3 條有效旅程全通過。學生新增後資料回顯 NC-007 仍未解決；支出已驗證本機 scalar 資料新增與修改，認證、SQL／JPQL、關聯及日期計算不宣稱等價。
- 標準套件 809 PASS／既有 1 SKIP；兩次各 41 份產物一致，377 檔來源及原始 41 份產物未改。前批 WF-035／036 保留。見 [修正報告](reports/WORKFLOW_BATCH5_FIXES_20261020.md)、[ADR 0095](adr/0095-public-batch5-workflow-repairs.md)。

## WP77 第六批不重複公開專案驗收（2026-10-20）

- 三個新 repository：Struts 1／jQuery 使用者管理、MVC／JSP／CSV 庫存、Boot／Thymeleaf Todo，與既有 21 個 repository 無交集。22 頁面／片段、22 路由、186 控制項均有發現，22／22 可能目的頁集合通過；Ajax 0／1、現存本地 CSS 0／17。
- 有效操作 42 項為 19 PASS／23 FAIL，6 條有效旅程 4 PASS／2 FAIL。原錯誤 selector 與同頁候選未選取的結果分別保留；補驗未放寬來源訊息／資料斷言。新增 WF-051–055、NC-008–009，全數 OPEN；不能以導覽成功宣稱資料功能等價。
- 本批只有測試、證據及文件，未修改產品。217 檔來源不變，兩次各 41 份產物一致，前批 WF-035／036、NC-007 保留。詳見 [第六批報告](reports/COMPLETENESS_BATCH6_20261020.md)。

## R18

- 以 `sprangdes/reservio`（Spring Boot＋React）對照原始碼實測：路由與 API 大致正確，但依身分渲染的畫面被合成一張、共用外框未依身分過濾、登入後導向未解析，另有分派表呼叫、處理器 prop 分支、字面路徑優先、外部呼叫端點等缺口。指示見 [ADJUSTMENT_R18_ROLES.md](ADJUSTMENT_R18_ROLES.md)（WP78–WP85，三個停止點；R18-A／C 已決定，R18-B 留待後續階段）。

- 第一階段（WP78 → WP79 → WP80）：WP78 已獲驗收通過；WP79、WP80 完成補正，重新送審並停止，未進入 WP81。
- OQ-035 A、OQ-036 A、OQ-037 窄版 B 已實作；R18-C 簡化顯示與原式並列。OQ-036 狀態值可達性列後續，R18-B 留待 WP82。
- 詳見 [R18 報告](reports/R18.md)、[ADR 0096](adr/0096-r18-audience-facts.md)、[ADR 0097](adr/0097-r18-audience-variants.md)、[ADR 0098](adr/0098-r18-returned-destinations-and-external-login.md)、[ADR 0099](adr/0099-r18-review-corrections.md)。

- 第二次驗收補正：修復報告暫存連結的 CI 失敗；依同 Context／同 hook／唯一 Provider 與導向前寫入檢查過濾所有目的變體，修正共用元件投影鍵；固定路由 pathname／字面 includes 求值，完整原式保留。callback 例外依需求方決定保留並逐筆顯示條件，獨立 callback 變體列 OQ-038 OPEN 後續候選。詳見 [ADR 0100](adr/0100-r18-context-navigation-and-route-facts.md) 與 R18 報告的實際數字及 PR CI run。WP79／WP80 仍等待需求方重新驗收，未進入 WP81。
- 實際 callback 選單補驗：五個認證頁共 10 個元件均顯示兩個目的及條件；補齊 behavior 的 canonical 候選 ID，保留 AMBIGUOUS。本機完整驗證 941 項（940 通過、既有 1 略過），E2E 預設並行；程式碼 SHA 2521781 的 PR CI run 40080398983 三個 job 全綠，記於 R18 報告。
- 回歸證據更正：撤回前次空目錄的 Struts 八模組 SHA 結論。實際固定來源五個模組非空圖一致，三個有兩版本相同既有 validation 阻擋，列 OQ-039 OPEN，停止該項；未修改 Struts 或放寬驗證。

- 第三次驗收：需求方確認 WP78／WP79／WP80 通過，授權 WP81→WP82 第二階段；OQ-039 另案處理、不阻擋 R18。WP81 與 optional 顯示修正見 [ADR 0101](adr/0101-r18-dispatch-props-and-optional-display.md)，WP82 後停止。
