# ScreenTrace 工作包路線圖

依 [CODEX_INSTRUCTIONS.md](CODEX_INSTRUCTIONS.md) 1.9（2026-10-03）與 [REQUIREMENTS.md](REQUIREMENTS.md) 執行。過去 POC 已有功能不等同新驗收完成；基線實測紀錄與測試套件已從現行版本移除，以下各輪仍保留當時的驗證紀錄。每個工作包獨立提交，每個里程碑結束後等待需求方確認。M1–M4 完成後的工作以輪次（R*）進行，記錄於本檔下方。

> 本檔引用的 `reports/*.md`、`docs/reports/*.md` 與 `ADJUSTMENT_R*.md` 已於 commit df28b33（2026-10-31）移除，僅能從 git 歷史查閱。

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
| R5 | WP21–WP23：靜態名稱、端點分群與流向 | 已驗收（2026-10-09，隨 R14 實測確認）；靜態名稱與端點分群仍由報表資料使用，WP23 的流向關係與容納版面由 R14 WP49 泳道地圖延續。證據：`wp23-flow.e2e.mjs`「WP23 owner workflow cards follow deterministic WP49 feature lanes…」、`NonInteractiveCliTest.actualAnalyzeAndReportAcceptCaseAndSymlinkWorkspaceRootsWithIdenticalHtml`；見 reports/R5.md。 （R17 註：WP49 泳道地圖已於 R17 移除，總覽改為網址分區，見 ADR 0084、ADR 0090；`wp23-flow.e2e.mjs` 已刪除。） |
| R3 | WP17–WP20：流程補強與呈現修正 | 已驗收（2026-10-09，隨 R14 實測確認）；G9 導覽關係、格狀配置與 G10 元件名稱仍可用，R14 WP49 以泳道地圖承接總覽版面。證據：`wp20.e2e.mjs`「WP20 overview global toggle, grid, incident highlights and focus navigation groups」、`wp23-flow.e2e.mjs`「WP23 owner workflow cards follow deterministic WP49 feature lanes…」；見 reports/R3.md。 （R17 註：泳道地圖已於 R17 移除，總覽改為網址分區，見 ADR 0084、ADR 0090；`wp20.e2e.mjs`、`wp23-flow.e2e.mjs` 已刪除。） |
| R8 | WP30–WP32：需求方文件、可重現截圖與 CLI 友善失敗 | 已驗收（2026-10-09，隨 R14 實測確認）；使用者指南與無互動終端機的 config 友善失敗仍可用。證據：`guide-docs.test.mjs`「requester guide is task-focused, safe, plain-language and illustrated」、`wp40-guide-contract.test.mjs`「guide uses always-available marking, explains the progress file and retains storage and size notices」、`NonInteractiveCliTest.configWithoutAnInteractiveTerminalNamesTheConfigRequirement`；見 reports/R8.md。 |
| R9 | WP33：路徑大小寫與符號連結 | 已驗收（2026-10-09，隨 R14 實測確認）；路徑邊界與符號連結防護仍存在。證據：`JspProjectParserSecurityTest.traversalAndSymlinkIncludesAreUnresolved`、`NonInteractiveCliTest.actualAnalyzeAndReportAcceptCaseAndSymlinkWorkspaceRootsWithIdenticalHtml`。Windows 仍未驗證；見 reports/R9.md、ADR 0061。 |
| R10 | WP34–WP38：需求方功能理解與確認工作流 | WP34–WP36 已驗收；WP37 已由 R14 WP45 第 8 點首頁盤點與交付清單取代。WP38 已完成（隨 R11–R14 實作）：流程大綱、全域搜尋、首次引導、「?」說明浮層均有現行實作與測試。證據：`wp38.e2e.mjs`「WP38 flow outline, global search, first-run guide and help can be used without changing decisions」及「WP38 rendered flow tree expands each screen once…」；見 reports/R10.md。 （R17 註：流程大綱、全域搜尋、首次引導與「?」說明浮層已於 R17 移除，`wp38.e2e.mjs` 已刪除，見 ADR 0084。） |
| R11 | WP39–WP40：檢視器簡化與決策介面常駐 | 已驗收（2026-10-09，隨 R14 實測確認）；無模式決策與檢視器能力保留，R14 WP45／WP46 取代舊確認版面。證據：`wp39-simplify.e2e.mjs`「WP39 viewer removes mode controls…」、`wp40-always-on-decisions.e2e.mjs`「WP40 decisions stay available without a mode…」；見 reports/R11.md。 （R17 註：R14 WP45／WP46 的盤點首頁與逐頁確認亦於 R17 由兩頁報表取代，所列兩個 e2e 測試已刪除，見 ADR 0084。） |
| R13 | WP43：畫面切換動畫 | 已驗收（2026-10-09，隨 R14 實測確認）；轉場仍保留舊預覽至新 iframe 載入、支援 reduced motion 與快速切換。證據：`wp43-transition.e2e.mjs` 中 `WP43 in-screen navigation keeps the old preview until the next iframe loads…`、`WP43 rapid navigation cancels pending switches…`；見 reports/R13.md。 （R17 註：`wp43-transition.e2e.mjs` 已於 R17 刪除，見 ADR 0084；canvas.ts 仍保留淡入與 reduced-motion 處理。） |
| R14 | WP44–WP50：功能盤點工作台（分析誤判修正、盤點首頁、逐頁確認、決策原因與備註、按鈕合併、地圖泳道、API 與交付清單） | WP44–WP50、§11.1 與 §12 抽查補正完成，R14 結案。最終 §5 驗證：305 Java（304 通過、1 跳過）、118 viewer、45 JS、43 capture、168 預設並行 E2E 全綠。§12 提交 `d090315`、`03db57b`、`cdb2353`、`b60683a`，先補失敗測試再修正；API basis 區分完整常值與動態串接，REDIRECT 類別顯示「轉址」。eMusicStore 實測：無 context path 為 1／1／5／0，有 `/eMusicStore` 為 2／4／1／0（使用中／推定使用中／找不到呼叫來源／可移除）。詳見 reports/R14.md、ADR 0067／0069／0070／0071。 |
| R15 | WP51–WP53：API 轉址標示收尾、ROADMAP 狀態整理、Struts 1 官方範例唯讀實測稽核 | 已驗收（2026-10-09）；WP53 稽核發現 Struts 1 系統性誤判，OQ-024–026 已決定，修正於 R16。見 reports/R15.md、ADR 0072。 |
| R16 | WP54–WP59：Struts URL 別名與 forward 正規化、Tiles 畫面界線、Validator／DispatchAction、訊息資源、JSF 標示、重新稽核 | 完成並結案（2026-10-11）。§9.1 Tiles 畫面依 title put、body JSP、definition 名稱排序，重複名稱以可讀資訊區分；faces-example2 與 WP10 outer 實測完成。完整驗證與 Spring graph 雜湊見 reports/R16.md、ADR 0074–0083。 |

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

- API 狀態的保留／移除標記判定只在 TypeScript `deriveApiUsage`（R30，[ADR 0121](adr/0121-r30-api-decisions-viewer-only.md)）；呼叫來源的推導仍有 Java `ApiUsage` 與 TypeScript `callSources` 兩份，以 [共用向量](examples/api-usage-vectors.json) 為一致性依據（R-API-1～6）。後續規則變更須同時通過兩端向量測試；完全消除需要把呼叫來源寫進圖的 schema 變更。

- OQ-005：待既有歷史測試遷移後移除 ApplicationGraph 舊版相容建構子；目前只供讀取歷史資料與既有 fixture，正式分析不得使用。

- WP7 E 已移除 Deprecated ReportGenerator 與原測試／localhost／POST endpoint；新資料注入只接受嚴格 2.2（R18 起 2.3、R19 起 2.4 亦接受）。
- WP8 C 已移除 ReviewResultGenerator／原測試與 CLI export；新 md 與共用模組嚴格 2.2（R18 起 2.3、R19 起 2.4 亦接受）。

- WP7 B：單檔畫布／決定性 SCC 分層、檔案樹、URL 搜尋與平移縮放已實作；逐增量 CI gate 見 docs/reports/WP7.md。

- R10 WP37 已由 R14 WP45 第 8 點取代；WP38 流程大綱、全域搜尋、首次引導與說明浮層曾由 R11–R14 完成，已於 R17 移除（ADR 0084）。

- capture 相容清理：已完成（R31）。packDocuments 舊 inline CSS 入口已移除，封裝只剩 packStandaloneDocuments，原本的測試改用正式入口（[ADR 0122](adr/0122-r31-retire-inline-css-pack.md)）。

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

- 需求方於 2026-10-11 決定回到主要流程、全面簡化報表：只剩「畫面」「API」兩頁、畫布 zoom in 聚焦、模擬操作＝真實點擊、進度自動存成 md、移除信心狀態／樣式／元件庫。指示見 ADJUSTMENT_R17_FLOW.md。
- 第一階段（WP60、WP61，並提前完成 WP64）：報表改為兩頁，移除 §2 清單功能，API 頁三狀態。完整驗證後停止等待需求方檢視，見 R17 報告、[ADR 0084](adr/0084-r17-two-page-report-and-retired-tests.md)。
- 第二階段（WP62、WP63）：畫布 zoom in 聚焦、關聯線縮圖與前往、點擊模擬不受檢核限制。完整驗證後停止等待需求方檢視，見 R17 報告、[ADR 0085](adr/0085-r17-canvas-zoom-focus-and-click-simulation.md)。
- 第三階段（WP65、WP66）：進度檔自動存檔、md 一律 v1 並精簡正文。完整驗證後停止等待需求方驗收，見 R17 報告、[ADR 0086](adr/0086-r17-progress-file-autosave-and-md-v1.md)。
- 第四階段（WP67、WP68）：`screentrace <專案路徑>` 一步分析、設定改為選用、指南與文件依新流程重寫。R17 全部完成，等待結案驗收，見 R17 報告。

## WP69 公開業務應用流程修復

- 分支 `fix/workflow-restoration`，處理 實測問題 WF-001–009：Struts legacy web roots／控制項、Spring view returns／resolver、JS 靜態效果與日期元件、Web Flow、inline 背景圖封裝。
- 原始失敗證據保留，修正後以同一份三專案來源與完整操作旅程驗收；結果、限制與重現入口見 修正報告、[ADR 0091](adr/0091-public-workflow-restoration.md)。

## 新增公開專案驗收第二批（2026-10-18）

- 三個全新 JSP 業務專案及一個 Thymeleaf 負對照；25 個檢查 14 PASS／11 FAIL，5 個旅程 2 PASS／3 FAIL。
- WF-010 預覽 selector、WF-011 刪除確認未修正；WF-012 資料狀態功能缺口、原專案問題及負對照分別記錄。詳見 測試報告。本批只有驗證與證據，未將新失敗宣告修復。

## WP70 第二批公開專案修正

- 修正 WF-010 冒號標籤、WF-011 確認取消、WF-012 有來源證據的示範 CRUD，加入 NC-001 有限度 Thymeleaf URL／HTML view 投影；另修復視覺複核發現的 WF-013 透明淡入快照。
- 原 25 案例／5 旅程全部通過，新增確認控制與完整示範 CRUD 測試；標準套件 730 項、729 PASS／既有 1 skip。未更動既有斷言、目標來源或 graph schema。見 修正報告、[ADR 0092](adr/0092-public-workflows-state-and-template-projection.md)。

## 新增公開專案完整性驗收第三批（2026-10-18）

- 四個不重複業務應用：Struts 契約、Boot/JSP 網銀、MVC 庫存、Thymeleaf 航空。獨立來源盤點 37 頁面／片段、73 路由、334 控制項均被發現，但 36 個 Ajax 呼叫未還原；48 個 Spring 非 REST handler 的可能目的頁集合只有 24 個完整。
- 真實離線原型操作 41 案例 14 PASS／27 FAIL，5 旅程 3 PASS／2 FAIL；新增資料與回饋失敗保留，不以導覽成功宣稱功能等價。新增 WF-014–022、NC-002–003，只有測試記錄，未修改產品／宣稱修復。見 完整性實測報告。

## WP72 第三批公開專案問題修正

- 修正 WF-014–022、NC-002–003：Ajax、相對資源與請求、分支回傳、頁面組合、Struts 控制項、modal/offcanvas、回饋、有效 web root、Thymeleaf 表單及示範資料。新增 WF-023 的診斷排序已修正，頭像像素差異仍未解決。
- 不放寬原斷言；原 B08 錯誤 selector 的 FAIL 保留，新增來源正確的開窗及四種表單切換案例。原專案缺少 API handler 與佔位功能另列，不能宣稱所有業務功能完整等價。見 修正與驗收報告、[ADR 0093](adr/0093-public-completeness-workflow-repairs.md)。

## WP73 第四批不重複公開專案驗收（2026-10-19）

- 三個新 repository：Struts 1／Tiles 音樂管理、MVC／JSP 圖書管理 App1、Boot／Thymeleaf 旅館。32 頁面／片段、52 路由、179 控制項都有發現；仍有路由／實體 view、事件、條件、樣式與資料支援缺口。
- 有效檢查 33 項 10 PASS／23 FAIL，5 旅程 1 PASS／4 FAIL；原 H11 有格式／姓名預期限制，保留原結果並以來源正確的 X03 補驗。新增 WF-024–033、NC-004–005，外部依賴及原專案缺頁另列；未修改產品或宣稱修復。見 測試報告。

## WP74 第四批公開專案問題修正（2026-10-19）

- 修正 WF-024–033、NC-004–005 的有限分析／模擬路徑，補上離線圖示、新解鎖的動態查詢路徑 WF-034，以及 autofocus 擷取時序 WF-037、下拉選單初始可見狀態 WF-038。41／41 實體來源回傳、13／13 本地 CSS 通過；五次各 46 份產物一致，完整回歸 786 通過／1 略過。
- 原操作 28 PASS／3 FAIL；來源更正後有效 33 項 31 PASS／2 FAIL。原 H11、X03 的錯誤預期與 FAIL 保留，以 X04 驗證來源日期欄位。前述 WP73 的「X03 來源正確」已由本次複核更正：來源沒有電話欄位。
- 自訂 Hibernate DAO 與外部 HTTP 清單資料回顯仍未解決（WF-035／036），不宣稱功能完全等價。見 修正報告、[ADR 0094](adr/0094-public-batch4-workflow-repairs.md)。

## WP75 第五批不重複公開專案驗收（2026-10-20）

- 三個新 repository：Struts 1／Spring 物料、MVC／JSP 學生、Boot／Thymeleaf 支出；與既有 18 個 repository 無交集。21 頁面／片段、21 個 Controller／Struts 路由、153 控制項都有發現；另 2 個 Security 配置入口缺失。
- 來源更正後有效 30 檢查為 6 PASS／24 FAIL，3 旅程 1 PASS／2 FAIL；新增 WF-039–049、NC-006。目的頁集合 17／21 正確，12 個本地 CSS 參照 7 PASS／5 FAIL；支出可跳頁但提交資料沒有回顯，學生資料旅程阻於提交回首頁。
- 本批僅驗證及保留問題證據，沒有修改產品／既有斷言；前批 WF-035／036 未修復。來源 377 檔不變，兩次各 41 份產物一致。詳見 測試報告。

## WP76 第五批公開專案問題修正（2026-10-20）

- 修正 WF-039–049、NC-006 的來源可證明範圍，另修正新發現的 WF-050 巢狀候選選取。21／21 目的頁集合、12／12 本地 CSS、2／2 Security 入口通過；原始斷言與失敗保留。
- 原 30 項操作 23 PASS／7 個錯誤 oracle 的 FAIL；來源修正及新增資料補驗合計有效 32 項 31 PASS／1 FAIL，3 條有效旅程全通過。學生新增後資料回顯 NC-007 仍未解決；支出已驗證本機 scalar 資料新增與修改，認證、SQL／JPQL、關聯及日期計算不宣稱等價。
- 標準套件 809 PASS／既有 1 SKIP；兩次各 41 份產物一致，377 檔來源及原始 41 份產物未改。前批 WF-035／036 保留。見 修正報告、[ADR 0095](adr/0095-public-batch5-workflow-repairs.md)。

## WP77 第六批不重複公開專案驗收（2026-10-20）

- 三個新 repository：Struts 1／jQuery 使用者管理、MVC／JSP／CSV 庫存、Boot／Thymeleaf Todo，與既有 21 個 repository 無交集。22 頁面／片段、22 路由、186 控制項均有發現，22／22 可能目的頁集合通過；Ajax 0／1、現存本地 CSS 0／17。
- 有效操作 42 項為 19 PASS／23 FAIL，6 條有效旅程 4 PASS／2 FAIL。原錯誤 selector 與同頁候選未選取的結果分別保留；補驗未放寬來源訊息／資料斷言。新增 WF-051–055、NC-008–009，全數 OPEN；不能以導覽成功宣稱資料功能等價。
- 本批只有測試、證據及文件，未修改產品。217 檔來源不變，兩次各 41 份產物一致，前批 WF-035／036、NC-007 保留。詳見 第六批報告。

## R18

- 以 `sprangdes/reservio`（Spring Boot＋React）對照原始碼實測：路由與 API 大致正確，但依身分渲染的畫面被合成一張、共用外框未依身分過濾、登入後導向未解析，另有分派表呼叫、處理器 prop 分支、字面路徑優先、外部呼叫端點等缺口。指示見 ADJUSTMENT_R18_ROLES.md（WP78–WP85，三個停止點；R18-A／B／C 已決定）。

- 第一階段（WP78 → WP79 → WP80）：WP78、WP79、WP80 已於第三次驗收全部通過；需求方授權進入第二階段 WP81→WP82。
- OQ-035 A、OQ-036 A、OQ-037 窄版 B 已實作；R18-C 簡化顯示與原式並列。OQ-036 狀態值可達性當時列為後續，已於下方「OQ-036 狀態值可達性」完成（[ADR 0105](adr/0105-oq036-state-value-reachability.md)）。R18-B 已依第三次驗收決定，只加附註、不改 D4／D5。
- 詳見 R18 報告、[ADR 0096](adr/0096-r18-audience-facts.md)、[ADR 0097](adr/0097-r18-audience-variants.md)、[ADR 0098](adr/0098-r18-returned-destinations-and-external-login.md)、[ADR 0099](adr/0099-r18-review-corrections.md)。

- 第二次驗收補正：修復報告暫存連結的 CI 失敗；依同 Context／同 hook／唯一 Provider 與導向前寫入檢查過濾所有目的變體，修正共用元件投影鍵；固定路由 pathname／字面 includes 求值，完整原式保留。callback 例外依需求方決定保留並逐筆顯示條件，獨立 callback 變體列 OQ-038 OPEN 後續候選。詳見 [ADR 0100](adr/0100-r18-context-navigation-and-route-facts.md) 與 R18 報告的實際數字及 PR CI run。WP79／WP80 已於第三次驗收通過。
- 實際 callback 選單補驗：五個認證頁共 10 個元件均顯示兩個目的及條件；補齊 behavior 的 canonical 候選 ID，保留 AMBIGUOUS。本機完整驗證 941 項（940 通過、既有 1 略過），E2E 預設並行；程式碼 SHA 2521781 的 PR CI run 40080398983 三個 job 全綠，記於 R18 報告。
- 回歸證據更正：撤回前次空目錄的 Struts 八模組 SHA 結論。實際固定來源五個模組非空圖一致，三個有兩版本相同既有 validation 阻擋，列 OQ-039 OPEN，停止該項；未修改 Struts 或放寬驗證。

- 第三次驗收：需求方確認 WP78／WP79／WP80 通過，授權 WP81→WP82 第二階段；OQ-039 另案處理、不阻擋 R18。WP81 與 optional 顯示修正見 [ADR 0101](adr/0101-r18-dispatch-props-and-optional-display.md)，WP82 後停止。

- 第二階段（WP81 → WP82）：分派表、已知 prop、optional chaining 安全摘要、字面 API 優先、Webhook 雙證據附註與 Boot 預設 context 已實作；R18-B 記為 OQ-040 RESOLVED，見 [ADR 0102](adr/0102-r18-spring-api-paths-and-external-call-notes.md)。本機 Maven 526（525 通過、既有 1 略過）、viewer 121、JS 141、capture 83、預設並行 E2E 90 全部通過；reservio 靜態重析維持 36 screens／66 endpoints／1,172 components。第二階段已提交（c414f0c）並隨 PR #45 合併（4340592，2026-10-25）。WP82 後停止，WP83 未進入。

- 第三階段（WP83 → WP85）：載入成功狀態預覽（含自訂 hook 狀態）、頁面元件依 Guard／外框／變體分支決定、JSX spread props、未安裝套件樣式表診斷。實測由需求方審查者於 sandbox 外執行：reservio 36 畫面／66 API、7 個頁面元件與 6d 各項全部通過，7 個非 React 專案位元組相同。詳見 R18 報告「第三階段」與 [ADR 0103](adr/0103-r18-preview-state-page-components-and-style-packages.md)。等待需求方最終驗收 R18。

## OQ-039 Struts 查詢字串連結修正

- main 上 Struts cookbook、el-example、examples 因相對 `html:link` 帶查詢字串的導覽無法通過 graph 驗證（自 054cf0c 起）。修正後三個模組恢復產出合格圖，其他五個模組位元組不變。詳見 [ADR 0104](adr/0104-oq039-struts-query-link-aliases.md)。

## OQ-036 狀態值可達性

- 共用元件中由頁面狀態控制的區塊，依畫面身分下可達的寫入點判斷是否可能出現。reservio `/business/setup` 移除只有顧客能開啟的常用商家面板及其 3 個 API；其他畫面與非 React 專案不變。詳見 [ADR 0105](adr/0105-oq036-state-value-reachability.md)。

## OQ-038 查詢參數進入變體

- 認證頁的 LINE 登入回呼與一般進入分成兩個畫面；一般進入沿用原 ID。reservio 畫面 36 → 41，原有 31 個非認證畫面不變。詳見 [ADR 0106](adr/0106-oq038-query-entry-variants.md)。

## R19 角色流程（P1–P3）

- WP86：角色設定、身分維度與 schema 2.4，見 [ADR 0107](adr/0107-r19-persona-settings-and-dimensions.md)。
- WP87：畫面與導覽角色判定，見 [ADR 0108](adr/0108-r19-persona-verdicts.md)。
- WP88：角色流程可達性，見 [ADR 0109](adr/0109-r19-persona-flows.md)。
- P4（viewer）由 R20 完成；P5（後端權限）未開始。
- WP89：修正身分維度截斷造成的假診斷，並讓 <Routes> 外 Guard 的重導依固定路由成為入口重導（reservio 未開店商家可達 /business/setup）。見 [ADR 0110](adr/0110-r19-dimension-matching-and-shell-redirects.md)。
- 驗證：本機 JS 171 通過；Maven 576（568 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41753736309 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/63。

## R20 角色流程呈現（P4）

- WP90：報表依角色呈現流程（角色選單、流程清單、畫布標示、角色比較分頁），見 [ADR 0111](adr/0111-r20-persona-viewer.md)。
- 驗證：viewer 單元測試 132 個（新增 3；sandbox 內 130 通過，OQ-047 的 2 個 Chromium 測試無法執行）；Maven 577（569 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41773720829 三個 job 全綠（含 E2E 新增 3 個與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/64。
- R19 修正：設定角色後圖譜為 schema 2.4，預覽擷取（`capture-static-jsp.mjs`、`element-styles.mjs`）原本只接受 2.2／2.3，導致報表沒有預覽與中文畫面名稱；現已接受 2.4，並在 `preview-v2.test.mjs` 加上 2.3／2.4 回歸測試。

## R21 角色流程呈現改善

- WP91：角色流程改以流程圖呈現（畫布上的角色按鈕、依步數分欄的流程圖、角色說明 `description`、簡化的狀態文字與比較表），見 [ADR 0112](adr/0112-r21-persona-presentation.md)。
- 驗證：viewer 單元測試 136 個（新增 4；sandbox 內 134 通過，OQ-047 的 2 個 Chromium 測試無法執行）；Maven 579（新增 2；571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41794022299 三個 job 全綠（含 E2E 新增 3 個與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/65。

## R22 角色比較改善

- WP92：角色比較依可見角色分組（分組、步數圓標、欄位標題的角色資訊、畫面縮圖），見 [ADR 0113](adr/0113-r22-persona-comparison.md)。
- 驗證：viewer 單元測試 138 個（新增 2；sandbox 內 136 通過，OQ-047 的 2 個 Chromium 測試無法執行）；Maven 579（571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41815635816 三個 job 全綠（含 E2E 新增 2 個與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/66。

## R23 角色頁改用 API 頁的版面

- WP93：角色頁改為角色清單＋詳情，與 API 頁一致（流程、和其他角色比較、流程以外），取代 R22 的比較表，見 [ADR 0114](adr/0114-r23-persona-page.md)。
- 驗證：viewer 單元測試 137 個（移除 3、新增 2；sandbox 內 135 通過，OQ-047 的 2 個 Chromium 測試無法執行）；Maven 579（571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41829954393 三個 job 全綠（含 E2E 移除 2、新增 2 個與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/67。

## R24 角色判定：物件為否時的可選存取

- WP94：`me` 為否時 `me?.flag` 視為不成立，reservio 訪客首頁改為「會走到」，見 [ADR 0115](adr/0115-r24-optional-access-on-false-object.md)。
- 驗證：JS 測試 174 個（新增 3）；viewer 單元測試 137 個（sandbox 內 135 通過，OQ-047 的 2 個 Chromium 測試無法執行）；Maven 579（571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41847314208 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/68。

## R25 角色判定：網址參數由連結決定

- WP95：判定角色時，不帶網址參數的畫面版本不計參數條件；網址沒有決定版本的導覽最多是無法判定。reservio 訪客「會走到」由 1 個增加為 5 個，見 [ADR 0116](adr/0116-r25-query-parameter-decided-by-link.md)。
- 驗證：JS 測試 177 個（新增 3）；viewer 單元測試 137 個（sandbox 內 135 通過，OQ-047 的 2 個 Chromium 測試無法執行）；Maven 579（571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41859746555 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/69。

## R26 值的求值：沿著提早回傳算出輔助函式的結果

- WP96：有多個 `return` 的函式，在條件能確定時沿著提早回傳算出結果。reservio 顧客「會走到」由 0 個增加為 7 個，見 [ADR 0117](adr/0117-r26-early-return-helpers.md)。
- 驗證：JS 測試 180 個（新增 3）；viewer 單元測試 137 個（sandbox 內 135 通過，OQ-047 的 2 個 Chromium 測試無法執行）；Maven 579（571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41864199127 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/70。

## R27 角色流程：入口只開啟不需要網址參數的畫面

- WP97：角色流程從入口只開啟不需要網址參數的畫面。reservio 顧客的「可能走到」由 5 個減為 1 個、商家由 8 個減為 4 個，見 [ADR 0118](adr/0118-r27-entry-renders-plain-version.md)。
- 驗證：Maven 581（新增 2；573 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；JS 測試 180 個；viewer 單元測試 137 個（sandbox 內 135 通過，OQ-047 的 2 個 Chromium 測試無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41933815522 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/71。

## R28 API 頁與角色頁的圖形摘要

- WP98：API 頁加上狀態分布條，角色頁加上觸及條、條件標記與每一步的畫面數直條，見 [ADR 0119](adr/0119-r28-visual-summaries.md)。
- 驗證：viewer 單元測試 139 個（新增 2；sandbox 內 137 通過，OQ-047 的 2 個 Chromium 測試無法執行）；JS 測試 180 個；Maven 581（573 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41947147871 三個 job 全綠（含 E2E 新增 2 個與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/72。

## R29 API 呼叫鏈與角色重疊長條

- WP99：API 詳情加上呼叫鏈（畫面 → API → 處理程式），角色比較的每一組加上依比例的長條，見 [ADR 0120](adr/0120-r29-call-chain-and-overlap-bars.md)。
- 驗證：viewer 單元測試 141 個（新增 2；sandbox 內 139 通過，OQ-047 的 2 個 Chromium 測試無法執行）；JS 測試 180 個；Maven 581（573 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41959774613 三個 job 全綠（含 E2E 新增 2 個與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/73。

## R30 API 狀態的標記判定只留在 viewer

- WP100：Java `ApiUsage` 移除保留／移除標記與 REMOVABLE，只推導呼叫來源；標記判定只由 viewer 的 `deriveApiUsage` 計算，見 [ADR 0121](adr/0121-r30-api-decisions-viewer-only.md)。
- 驗證：Maven 579（移除 2；571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；viewer 單元測試 141 個（sandbox 內 139 通過，OQ-047 的 2 個 Chromium 測試無法執行）；JS 測試 180 個；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41966943589 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/74。

## R31 移除 capture 舊的 inline CSS 封裝入口

- WP101：`pack-preview.mjs` 只保留 `packStandaloneDocuments`，使用舊入口的 4 個測試改用正式入口，見 [ADR 0122](adr/0122-r31-retire-inline-css-pack.md)。
- 驗證：Maven 579（571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；viewer 單元測試 141 個（sandbox 內 139 通過，OQ-047 的 2 個 Chromium 測試無法執行）；JS 測試 180 個；PR CI run https://github.com/sprangdes/screentrace/actions/runs/41980760505 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/75。

## R32 API 與角色頁的圖形化元素與角色頁改版

- WP102：API 清單的方法色標、路徑參數標示與呼叫畫面數長條；API 詳情區在寬螢幕上分成左右兩欄；角色頁改為上方角色卡片、流程看板與「全部角色對照」覆蓋表；API 清單、角色頁右欄與畫面清單改為比例寬度並可拖曳調整；viewer 小字放大 1px；移除畫布左上角的操作提示；進度檔的成功訊息幾秒後自動消失；API 清單捲動時 Controller 標題上方不再露出捲過的列，見 [ADR 0123](adr/0123-r32-api-persona-graphics.md)。
- 驗證：viewer 單元測試 147 個（新增 6）、E2E 109 個（新增 7；`api-page-layout`、`r23-persona-page`、`r28-visual-summaries`、`r17-focus`、`overview-pin` 中與舊版面或操作提示綁定的斷言隨改版調整）、JS 測試 180 個、Maven 579（0 失敗、1 略過）全部通過；reservio 的 `viewer-documents.json` 與修改前逐位元組相同，只有報表 HTML 內的 viewer 改變。

## R33 縮小的總覽上看得出每一區與每個畫面

- WP103：總覽的區名放在區塊框頂端加高的標題帶並固定在可讀的字級，下面列出這一區前 3 個畫面的名稱；縮小時滑過卡片立即顯示畫面名稱與網址，見 [ADR 0124](adr/0124-r33-overview-labels.md)。
- 驗證：viewer 單元測試 148 個（新增 1）、E2E 111 個（新增 2）、JS 測試 180 個、Maven 建置通過；reservio 的 `viewer-documents.json` 與修改前逐位元組相同。
- 後續修正（PR #79，7adf7f0）：角色頁的步驟欄維持原本的純文字標題，見 ADR 0124 R33-5a。主要變更隨 PR #78 合併。

## R34 分析效率與安全性（第一段）

- WP104：量測 reservio 完整分析各段耗時；React 預覽分析改為與 graph 分析同時執行（30.0 秒降為 25.0 秒，輸出逐位元組相同）；安全性檢查（XML、viewer 輸出、外部程序、動態執行）沒有需要修正的項目。預覽擷取改為平行處理列為下一段，見 [ADR 0125](adr/0125-r34-analysis-performance-security.md)。
- 2026-11-06 完成於分支 `feature/r34-analysis-performance-security`（e19d7f0），2026-11-11 以 R37 之後的 main 為基底重新整理後合併。
- 合併前補充：取消或逾時時連同 Node 的子孫程序一起結束，避免版本管理工具的 shim 留下孤兒 Node 程序，見 ADR 0125 R34-6。
- 驗證：Maven 582（573 通過、2 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；viewer 單元測試 148 個（sandbox 內 146 通過，OQ-047 的 2 個 Chromium 測試無法執行）；JS 測試 180 個；reservio 的分析產物與 main 逐位元組相同，完整分析由 33.0 秒降為 25.0 秒；PR CI run https://github.com/sprangdes/screentrace/actions/runs/43003704362 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/85。

## R35 放大畫面時的關聯線整理

- WP105：放大畫面時，進來的線排在預覽框左側、出去的在右側，依畫布位置由上而下排列；同一區有多個畫面的線合成一條附區名與數量的線，點標籤列出畫面，見 [ADR 0126](adr/0126-r35-focus-line-bundles.md)。
- 驗證：Maven 579（571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；viewer 單元測試 148 個（sandbox 內 146 通過，OQ-047 的 2 個 Chromium 測試無法執行）；JS 測試 180 個；PR CI run https://github.com/sprangdes/screentrace/actions/runs/42174596612 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/80。

## R36 放大畫面的關聯線標籤對齊與預覽比例

- WP106：有標籤時每一列都有同寬、靠外側的標籤，所有的線從標籤內側畫到預覽框、箭頭不被遮住；預覽框不高於 16:10 的桌機比例，見 [ADR 0127](adr/0127-r36-focus-label-layout.md)。
- WP107：標籤留白改為依該側標籤所需寬度決定（最寬 140px，沒有線的一側 56px），較長的畫面名稱換到第二行，讓預覽在維持比例下盡量放大，見 ADR 0127 R36a。
- 驗證：Maven 579（571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；viewer 單元測試 148 個（sandbox 內 146 通過，OQ-047 的 2 個 Chromium 測試無法執行）；JS 測試 180 個；PR CI run https://github.com/sprangdes/screentrace/actions/runs/42246302520 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/81。
- 驗證（WP107）：Maven 579（571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；viewer 單元測試 148 個（sandbox 內 146 通過，OQ-047 的 2 個 Chromium 測試無法執行）；JS 測試 180 個；PR CI run https://github.com/sprangdes/screentrace/actions/runs/42256006047 三個 job 全綠（含 E2E 與上述 7 個測試）。

## R37 畫面側欄的 API 方法標籤

- WP108：打開畫面時，右側欄「呼叫的 API」改用與 API 頁相同、依方法上色的標籤，見 [ADR 0128](adr/0128-r37-panel-method-tags.md)。
- 驗證：Maven 579（571 通過、1 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行）；viewer 單元測試 148 個（sandbox 內 146 通過，OQ-047 的 2 個 Chromium 測試無法執行）；JS 測試 180 個；PR CI run https://github.com/sprangdes/screentrace/actions/runs/42342297081 三個 job 全綠（含 E2E 與上述 7 個測試）。PR：https://github.com/sprangdes/screentrace/pull/82。

## R38 程式健檢與 CI 測試範圍

- 2026-11-11 全專案健檢的結果與待辦記錄在 [HEALTH_CHECK_20261111](HEALTH_CHECK_20261111.md)（HC-001～HC-008）。
- WP109：CI 改為執行 `screentrace-capture/*.test.mjs` 的全部測試檔，補上從未執行的 7 個檔案；`screentrace-js` 相依套件移到 capture 測試之前安裝，見 [ADR 0129](adr/0129-r38-run-every-capture-test.md)（HC-003）。
- 驗證：本機與 PR CI 的 capture 測試都是 19 個檔案、85 個測試全部通過（原本 CI 只跑 12 個檔案）；PR CI run https://github.com/sprangdes/screentrace/actions/runs/42987303105 三個 job 全綠。PR：https://github.com/sprangdes/screentrace/pull/84。

## R39 Java 原始碼排版

- WP110：以 Spotless + google-java-format 1.24.0 重新排版全部 Java 原始碼與測試（220 個檔案，只改排版），CI 加上 Java 格式檢查；`.git-blame-ignore-revs` 記錄排版 commit，見 [ADR 0130](adr/0130-r39-java-formatting.md)（HC-001 第一段）。
- 驗證：Maven 582（573 通過、2 略過，另 OQ-041 的 7 個 Chromium 測試在 sandbox 內無法執行），與排版前相同；viewer 單元測試 148 個；JS 測試 180 個；需求方以排版前後的 CLI 分析 9 個專案，產物除輸出路徑外相同；PR CI run https://github.com/sprangdes/screentrace/actions/runs/43020259005 三個 job 全綠（含「Check Java formatting」與 E2E）。PR：https://github.com/sprangdes/screentrace/pull/86。

## R40 TypeScript／JavaScript 原始碼排版

- WP111：以 Prettier 3.9.10 重新排版 `screentrace-js`、`screentrace-capture`、`screentrace-viewer` 的全部 TypeScript／JavaScript 原始碼與測試（234 個檔案，只改排版），CI 加上 TS／JS 格式檢查；`.git-blame-ignore-revs` 記錄排版 commit，見 [ADR 0131](adr/0131-r40-typescript-javascript-formatting.md)（HC-001 第二段）。
- 驗證：234 個檔案排版前後壓縮後相同，`viewer.js` 逐位元組相同；JS 測試 180 個、viewer 單元測試 148 個、capture 測試 85 個全部通過；Maven 582（577 通過、5 略過）；排版前後的 CLI 分析 4 個 fixtures 專案，產物除來源路徑與 fingerprint 外相同。

## R41 拆分 StrutsProjectAnalyzer

- WP112：`StrutsProjectAnalyzer.java`（4,877 行、148 個成員）依功能拆成同一個 package 的 16 個檔案，只搬移不改邏輯；最大的檔案降為 587 行，`StrutsProjectAnalyzer` 剩下 75 行的分析流程，見 [ADR 0132](adr/0132-r41-split-struts-project-analyzer.md)（HC-001 第三段）。
- 驗證：148 個成員搬移前後忽略空白相同（兩個方法參照改指新類別）；Maven 582（577 通過、5 略過）；拆分前後的 CLI 分析 11 個 fixtures 專案，197 個產物除來源路徑與 fingerprint 外相同。

## R42 擷取樣式不含本機路徑

- WP113：capture 把分析目錄裡的樣式資源 URL 記成 `st-preview-file:<相對路徑>`，`element-styles.json` 與樣式 ID 不再隨輸出目錄改變；報表端還原後沿用原本的路徑邊界檢查，報表不變，見 [ADR 0133](adr/0133-r42-output-relative-style-resources.md)（HC-009）。
- 驗證：capture 87 個測試、Maven 584（579 通過、5 略過）；同一專案輸出到兩個目錄，`element-styles.json` 與報表逐位元組相同，報表也與修改前相同。

## R43 固定建置工具鏈版本

- WP114：加入 Maven Wrapper（Maven 3.9.11，驗證 SHA-256），CI 改用 `./mvnw`；Node.js 最低版本改為 22 並在三個套件宣告 `engines`；Playwright 升到 1.63.0，CI 改用 `ubuntu-26.04`，見 [ADR 0134](adr/0134-r43-toolchain-versions.md)（HC-007）。
- 驗證：capture 87、viewer 單元 148、JS 180 個測試全部通過；Maven 584（579 通過、5 略過）；viewer E2E（Chromium）117／118，未過的是 sandbox 的效能門檻。

## R44 拆分 react/analyzer.mjs

- WP115：`screentrace-js/react/analyzer.mjs`（3,878 行、64 個頂層宣告）依功能拆成 9 個模組，只搬移不改邏輯；`analyzer.mjs` 剩 366 行，最大的是 `screen-renderer.mjs`（1,908 行），見 [ADR 0135](adr/0135-r44-split-react-analyzer.md)（HC-001 第四段）。
- 驗證：64 個宣告逐字相同；JS 180、capture 87 個測試全部通過；Maven 584（579 通過、5 略過）；拆分前後分析 React 測試專案 r19，27 個產物完全相同。

## R45 CI 加上 Windows 與測試覆蓋率

- WP116：根目錄 pom 加 `coverage` profile（JaCoCo 0.8.15，只報告不設門檻），CI 把各模組覆蓋率寫進 job summary 並上傳報告；新增 `windows` job，在 Windows 上執行完整 Java 測試，並以 `bin\screentrace.cmd analyze` 分析一個 fixture，見 [ADR 0136](adr/0136-r45-windows-ci-and-coverage.md)（HC-003）。
- Windows job 第一次執行找到並修正 5 個 Windows 使用者會遇到的問題：外部或帶查詢字串的 `c:import` 讓分析中斷、Spring 畫面 ID 使用 `\` 導致圖驗證失敗、互動選單吃掉輸入路徑的 `\` 與 `'`、家目錄遮蔽漏掉真實路徑、`screentrace.ps1` 讀取 `java -version` 時中止；另有 5 類只與測試寫法有關的平台差異，詳見 ADR 0136。
- 驗證：PR CI 四個 job（含 Windows 完整 Java 測試與 `bin\screentrace.cmd analyze`）全部通過；Linux 上 Maven 586 個測試（新增 2 個）。

## R46 以 parser 讀取 XML 與 JSP 結構

- WP117：Struts adapter、`JspProjectParser`、`SpringMvcAnalyzer` 中 7 處用 regex 讀 XML 或 JSP／HTML 結構的地方，改用 XML parser 與 `MarkupTag`；`MarkupTag` 新增 `contents` 與 `replaceTags`。只處理字串的 regex 保留，`c:url` 前處理留待之後，見 [ADR 0137](adr/0137-r46-parse-markup-instead-of-regex.md)（HC-005）。
- 驗證：15 個 fixtures 專案的 277 個產物除來源路徑與 fingerprint 外相同；新增 8 個測試，其中 5 個在修改前會失敗（註解內容被當真、屬性值含 `>`、巢狀 `<value>`）；Maven 594（589 通過、5 略過）。

## R47 預覽擷取的效能

- WP118：預覽擷取改成同時開多個 page（`--capture-concurrency`，預設 4），每個畫面的結果依畫面順序合併；JSP 重建仍一次一個畫面，檔名相同的畫面依序處理。`collectElementStyles` 在頁面內只保留和預設值不同的樣式屬性，不再傳回完整的 computed style，見 [ADR 0138](adr/0138-r47-concurrent-preview-capture.md)（HC-004）。
- 量測（sandbox，4 核心）：80 個畫面的合成專案單獨擷取由 170 秒降為 48.7 秒；CLI 完整分析由 163 秒（預覽超過 120 秒上限、全部失敗）降為 91.3 秒且預覽完整；15 個 fixtures 合計由 40.2 秒降為 38.4 秒。
- 驗證：15 個 fixtures 的 277 個產物逐位元組相同；合成專案以修改前、concurrency 1 與 4 擷取的預覽與截圖逐位元組相同；新增 `capture-pool.test.mjs` 6 個測試，其中「無效參數會中止擷取」在修改前的版本會失敗；capture 93、Maven 594（589 通過、5 略過）。
- 另附上一個工作階段的紀錄 [SESSION_20261112](SESSION_20261112.md)。

## R48 Java 分析以索引取代線性搜尋

- WP119：`PrototypeModelGenerator`、`MarkupGraphContribution`、`UrlGraphContribution` 改用依起點建立的關聯索引（新增 `RelationshipsByFrom`），`JspTagFileExpander` 每段文字只掃描一次 taglib 宣告，`StrutsWildcards` 遇到沒有萬用字元的 route 時直接比對字串；不建立跨模組的 Java 解析快取，見 [ADR 0139](adr/0139-r48-index-graph-lookups.md)（HC-004）。
- 量測（sandbox，4 核心）：80 個畫面的合成專案，Java 分析與報表由 35 秒降為 13.2 秒，CLI 完整分析由 91.3 秒降為 78.4 秒；15 個 fixtures 在量測誤差內。
- 驗證：15 個 fixtures 的 277 個產物、合成專案的全部產物都與修改前逐位元組相同；新增 4 個測試；Maven 598（593 通過、5 略過）。

## R49 Lint 規則

- WP120：JavaScript 以 ESLint 10.14.0 的建議規則檢查（`npm --prefix screentrace-viewer run lint`，CI 新增「Lint JavaScript」）；TypeScript 因 typescript-eslint 尚未支援 TypeScript 7，改在 `tsconfig.json` 開啟 `noUnusedLocals`、`noUnusedParameters`，由 viewer 建置的 `tsc` 檢查。修正 46 筆 JS 與 11 筆 TS 結果，都不改變行為；15 個空的 `catch` 加上說明。Java 的 lint 留待之後，見 [ADR 0140](adr/0140-r49-lint-rules.md)（HC-001 最後一段）。
- 驗證：報表除內嵌的 `viewer.js` 外與修改前逐位元組相同，其他產物不變；JS 180、capture 93、viewer 單元 148、受影響的 e2e 15 個、Maven 598（593 通過、5 略過）。

## R50 說明或縮小被吞掉的例外

- WP121：Java 主程式 27 處空的 `catch`（健檢記 26 處，另找到 1 處）依來源處理：
  - Java 解析、evidence JSON、URI 解析改接實際會丟的例外型別。
  - 讀檔失敗加註解，說明由哪個主流程報錯。
  - 序列化記憶體中的資料失敗時改拋 `IllegalStateException`。
  - 新增 `EmptyCatchGuardTest`，禁止沒有說明的空 `catch`。

  見 [ADR 0141](adr/0141-r50-explained-catch-blocks.md)（HC-002）。
- 驗證：15 個 fixtures 與 80 畫面合成專案的產物逐位元組相同；`EmptyCatchGuardTest` 在修改前失敗；Maven 599（594 通過、5 略過）。

## R51 ADR 索引與現況摘要

- WP122：新增 [`docs/adr/README.md`](adr/README.md)，依 12 個主題列出全部 142 份 ADR，每組先說明現況；只依明確證據標出「已被取代」（1 份）與「部分被取代」（26 份），各 ADR 內文不改；AGENTS.md 的流程加上先讀索引、新增 ADR 時更新索引，見 [ADR 0142](adr/0142-r51-adr-index.md)（HC-008）。
- 驗證：141 份既有 ADR 與 ADR 0142 各出現一次；只改文件。

## R52 預覽擷取上限與 Java lint 的決定

- WP123：CLI 等待預覽擷取的上限由固定 120 秒改為 120 秒加每個畫面 2 秒，最多 30 分鐘；Java 不導入 Error Prone，見 [ADR 0143](adr/0143-r52-capture-timeout-and-java-lint.md)（HC-004、HC-001）。另新增工作階段紀錄 [SESSION_20261112_R47-R52](SESSION_20261112_R47-R52.md)。
- 驗證：新增 `CaptureTimeoutTest`；15 個 fixtures 的產物不變；Maven 600（595 通過、5 略過）。


## R53 修正 code review 的 P1 項目

- WP124：依 [CODE_REVIEW_20261114](CODE_REVIEW_20261114.md) 修正 P1。9 項成立並修正；RV-006 無法重現，判定不成立；RV-009 實際影響比記錄的小，記錄已更正。CLI 的用法與元件庫錯誤改以 exit status 回報、每次分析先清除舊預覽、Struts 2 偵測遇到無法解析的檔案時改掃描原始位元組，見 [ADR 0144](adr/0144-r53-code-review-p1-fixes.md)。
- 驗證：每項修正都新增測試並確認修改前失敗（RV-001 啟動腳本除外）；JS 181、capture 94、viewer 單元 149、Maven 全數通過；viewer e2e 117/118，唯一失敗為效能測試在 sandbox 負載下逾時，單獨執行時修改前後都通過。

## R54 共用 web root 規則

- WP125：新增 `WebRoots`，JSP parser、Struts adapter、struts-menu 與 capture 的 `mvc:resources` 探索改用同一套 web root 規則；context 絕對路徑先在引用檔所在的 web root 下找，再退到專案根目錄，不改找其他 web root 的同名檔，見 [ADR 0145](adr/0145-r54-shared-web-roots.md)（RV-317、RV-401、RV-425、RV-512）。Spring adapter 的寫死位置待後續。
- 驗證：新增 5 組測試，都已確認在修改前失敗；JS 181、capture 95、viewer 單元 149、Maven 全數通過。

## R55 單一檔案或項目出錯只影響它自己

- WP126：Spring Web Flow、Thymeleaf 片段、JavaScript／React 分析輸出、React 預覽樣式表與 viewer CSS 資源，錯誤只影響出錯的那一項並留下診斷；Spring Security 外部呼叫的推論維持 fail closed，但只在讀不到的檔案可能含 security 設定時才停止，並指出是哪個檔案，見 [ADR 0146](adr/0146-r55-contain-single-item-failures.md)（RV-217、RV-220、RV-404、RV-414、RV-421、RV-511、RV-602）。
- 驗證：每項都新增測試；JS 181、capture 96、viewer 單元 150、viewer e2e 118、Maven 全數通過。

## R56 API 呼叫者不重複計算

- WP127：`ApiUsage.java` 與 viewer 的 `usage.ts` 先算出每個 CALL_API 行為所屬的觸發元件（沿 `parentId` 往上找），同一觸發元件到同一端點的 CALLS／TRIGGERS 邊不再另算一個呼叫者；兩邊規則相同，並以一次集合查詢取代每條邊掃描全部行為（RV-110、RV-612，RV-702 的一部分）。不改變對外契約，未新增 ADR。
- 驗證：Java 與 viewer 各新增 1 個測試，都已確認在修改前失敗；viewer 單元 151、Maven 全數通過。

## R57 URL 中的 `&amp;` 與資源檔名編碼

- WP128：interaction target 與 Struts 的 query string 切分先把 `&amp;` 換回 `&`；`pack-preview` 不再重複解碼已處理的屬性；capture 以解碼後的路徑尋找資源檔，見 [ADR 0147](adr/0147-r57-decode-ampersands-in-urls.md)（RV-313、RV-424、RV-521、RV-522）。
- 驗證：新增 3 個測試，都已確認在修改前失敗（RV-522 未加自動測試）；JS 181、capture 97、Maven 全數通過。

## R58 Spring adapter 改用共用 web root 規則

- WP129：`SpringMvcAnalyzer` 的公開 JSP 別名、`WEB-INF/jsp|views` 簡稱、Tiles 範本路徑與 include 來源，以及 `SpringControllerFlow` 的公開畫面比對，都改用 `WebRoots`（ADR 0145 的同一規則）；Java 主程式中除了 scanner 本身的預設清單，已無寫死的 `src/main/webapp`。
- 驗證：新增 `SpringWebRootLayoutTest` 並確認在修改前失敗；Maven 全數通過。

## R59 Struts 舊專案的入口與版本判定

- WP130：welcome-file 指向 action 時補上前導 `/` 再比對路由（RV-305）；`<logic:forward name>` 以 global forward 解析目標（RV-306）；Struts 版本只採用 Struts 1 本身的 Maven artifact（`org.apache.struts` 群組中的非 Struts 2 artifact、`struts` 群組或無群組的已知 artifact）與 jar 名稱，`struts-menu`、`spring-webmvc-struts` 不再造成版本衝突（RV-311）；Tiles 標題中任何位置出現 EL 或 scriptlet 都視為動態，改用 body 標題命名（RV-312）。不改變對外契約，未新增 ADR。
- 驗證：新增 4 個測試，都已確認在修改前失敗；Maven 全數通過。

## R60 Spring mapping 與回傳畫面的精度

- WP131：`method = {GET, POST}` 改為每個方法各一個端點（RV-202，[ADR 0148](adr/0148-r60-one-endpoint-per-request-method.md)）；同一 XML 中多個 `<http>` 的登入／登出處理各自獨立（RV-203）；`<bean name="/x.htm">` 建立路由、SimpleUrlHandlerMapping 可用 bean 名稱找 controller（RV-205）；Spring Boot controller 取每個字面值回傳畫面，不含 lambda 內的 return（RV-213）；宣告時給字面值且不再指派的 `String` 區域變數可解析為畫面（RV-214 部分）。
- 驗證：`SpringRound60Test` 新增 6 個測試，都已確認在修改前失敗；Maven 全數通過。

## R61 Spring／Struts 導覽精度

- WP132：已證明的導覽不再被推論結果降級（`SpringMvcAnalyzer.edge()` 遇到較強證明時升級，`SpringControllerFlow.project()` 保留 CONFIRMED，並改以索引查詢 HANDLED_BY／RENDERS／FORWARDS_TO）（RV-206）；XML controller 的路由也記到畫面上，無 action 的表單與相對連結可以解析（RV-207）；JSP 相對 URL 套用 `.`／`..` 正規化，超出根目錄時標為 unresolved（RV-208）；Struts `<action>` 內的 `<exception>` 只從該 action 出發（RV-301）。不改變對外契約，未新增 ADR。
- 驗證：新增 6 個測試，整合測試都已確認在修改前失敗；Maven 全數通過。

## R62 實測熱點與過大的預覽擷取

- WP133：以 300 個 action 的合成專案量測後，`StrutsScreens.screenForView`、`MarkupGraphContribution`、`StrutsInteractions` 的線性搜尋改用索引（新增 `NodesByViewName`）；`element-styles.json` 超過 32 MiB 時報表照常產出、不含元素樣式並加上 `PREVIEW_STYLES_TOO_LARGE` 診斷（新發現 RV-118），見 [ADR 0149](adr/0149-r62-hotspots-and-oversized-capture.md)（RV-702 部分）。
- 量測：Java 分析 37.7 秒 → 18.5 秒；完整 CLI 由無報表變為 186 秒完成。
- 驗證：合成專案與 14 個 fixture 的圖與 prototype 產物逐位元組相同；新增 2 個測試；Maven 全數通過。

## R63 元素樣式的大小與讀取

- WP134：`element-styles.json` 改為精簡 JSON；報表直接解析位元組、上限提高為 256 MiB；`PreviewCaptureReader` 以每個畫面建立一次的索引取代逐元素全掃描，見 [ADR 0150](adr/0150-r63-element-styles-size-and-reading.md)。
- 量測（300 個 action 的合成專案）：擷取檔 70 MB → 48.7 MB；報表步驟 140 秒 → 7.5 秒；完整 CLI 173 秒且報表含元素樣式。
- 驗證：修改前後的報表與 `preview-model.json` 逐位元組相同；capture 97、Maven 全數通過。

## R64 預覽擷取的截止時間

- WP135：擷取腳本接受 `--deadline`，過了截止時間不再開始新畫面、已完成的畫面照常寫出，未擷取的畫面明確標記；CLI 以上限減去預留時間作為截止時間，最後手段改為結束整個子程序樹；`@SuppressWarnings` 移回 `renderStaticJsp`，見 [ADR 0151](adr/0151-r64-capture-deadline.md)（RV-104、RV-105、RV-106）。
- 驗證：新增 3 個測試，capture 的 2 個已確認在修改前失敗；capture 99、Maven 全數通過。

## R65 啟動腳本、CLI、core、scanner、report 的其餘項目

- WP136：處理 RV-101～117 中尚未修正的 13 項與 RV-808：
  - 啟動腳本：重建檢查略過 `analyze/` 輸出；Maven 版本只讀「Apache Maven」那一行。
  - CLI：預覽封裝的上限依畫面數放寬，逾時或失敗時報表照常產出（不含預覽頁面）；互動提示展開 `~`、處理無效路徑與 Ctrl-D／Ctrl-C；選單寬度不超過終端機；`reg query` 的 5 秒上限確實生效；節點數只計算一次。
  - core：合併保留雙方屬性與較強 confidence、evidence 去重、已解析的行為目標優先；驗證失敗統一為 `GraphValidationException`，null 欄位不再 NPE（[ADR 0152](adr/0152-r65-graph-merge-and-validation-errors.md)）。
  - scanner：`target`／`build` 只在專案根目錄或建置檔旁略過；POM 屬性依模組解析。
  - report：prototype 元件依畫面分欄排列，共用元件各畫面有獨立 ID；樣式 map 保留排序。
- 驗證：新增 11 個測試，修正項目的測試都已確認在修改前失敗；13 個 fixture 中只有 `wp10/struts1-spring` 的圖改變（重複 evidence 移除、保留 Spring 的 `template` 屬性），prototype 位置依新規則改變；Maven 全數通過。

## R66 Spring adapter 的其餘項目

- WP137：處理 RV-201～221 中尚未修正的 11 項：驗證規則的 Java 解析層級與其他流程一致（RV-201）；Security 重導只讀 XML／Java（RV-204）；多個 Tiles definition 共用 body 時回報 `TILES_BODY_AMBIGUOUS`（RV-209）；會拋例外且無預設錯誤頁的 handler 也回報無法解析的回傳畫面（RV-210）；Java config 的登入／登出處理也清除過時的 URL 診斷（RV-211）；`simulationBindings` 合併而非覆寫（RV-212）；靜態預覽不列 hidden 欄位與非按鈕的 input 值（RV-215）；模組內的 Thymeleaf 範本目錄（RV-216）；表單模型不含 static 成員（RV-218）；只設 prefix 或 suffix 的 properties view resolver 生效、忽略 test resources（RV-219）；branch key 改為 `Target` 欄位（RV-221 部分）。不改變對外契約，未新增 ADR。
- 驗證：`SpringRound66Test` 新增 5 個測試，都已確認在修改前失敗；13 個 fixture 中只有兩個 `wp10` Spring 專案的 `staticPreview` 少了 checkbox／radio 的值（RV-215 的預期結果）；Maven 全數通過。

## R67 Struts adapter 的其餘項目

- WP138：處理 RV-302～324 中尚未修正的 17 項，包括：dispatch 投影的診斷回到輸出（RV-302）；`inputForward` 先查 action 自己的 forward（RV-303）；模組內 forward 加上模組前綴、不含 query（RV-304）；dispatch 解析結果寫回元件（RV-307）；dispatch 端點依 servlet mapping 決定 PROVEN 與 confidence、不覆蓋既有節點（RV-308）；forward 繼承也能找到父類別的 dispatch 方法（RV-309）；DelegatingActionProxy 用 Spring 解析後的類別（RV-310）；web root 的 web.xml 優先（RV-314）；只有 SwitchAction 才改寫 prefix／page（RV-315）；MappingDispatchAction 不再產生假的請求參數（RV-316）；訊息檔與 Tiles 路徑比對加上路徑邊界（RV-318、RV-322）；別名去重（RV-319）；設定檔不依資料夾猜模組（RV-320）；讀取 ValidatorPlugIn `pathnames` 列出的檔案（RV-321）；Tiles `put` 的 `content` 與內容（RV-322）；`extends` 的證據與偵測規則一致（RV-323）；未對應路由的行為用解析後目標（RV-324）。不改變對外契約，未新增 ADR。
- 驗證：`StrutsRound67Test` 新增 9 個測試，整合測試 8 個都已確認在修改前失敗；13 個 fixture 中只有 `wp10/struts1`、`wp10/struts1-spring` 改變：元件多了 `dispatchMethod`（RV-307），`/mapping.do?save=save` 改為 `/mapping.do` 由 `save()` 處理（RV-316）；Maven 全數通過。

## R68 parser-jsp 的其餘項目

- WP139：處理 RV-402～428 中 18 項：Java 解析層級一致（RV-402）；一般 `Map.put` 不再關閉 EL 值解析（RV-403）；Thymeleaf 無參數片段、`th:insert`／`th:include`、含 `${…}` 的參數（RV-405、RV-406）；選單展開保留行號（RV-408）；HttpSession、Principal 等框架參數不列入請求欄位（RV-411）；家目錄遮蔽只比對完整路徑（RV-412）；AngularJS 取最內層 controller、支援 `data-ng-controller`（RV-413）；JS 分析器逾時依來源數放寬（RV-415）；Tiles `put` 的 `content` 與內容（RV-417）；不分大小寫的結束標籤搜尋不再複製整份原始碼（RV-418）；`mvc:resources` 行號（RV-419）；React 重複路由去重（RV-420）；菱形 include 只加一次（RV-422）；連結文字讀到自己的結束標籤且不分大小寫（RV-423）；Struts `nested:` taglib（RV-426）；include 去除 query（RV-427）；結束標籤依名稱關閉範圍（RV-428）。RV-407、RV-410 試作後撤回，RV-409、RV-416 未處理，原因記在 review 文件。不改變對外契約，未新增 ADR。
- 驗證：新增 11 個測試，整合測試都已確認在修改前失敗（RV-418、419、420、426、428 未加專屬測試）；13 個 fixture 的圖全部與修改前相同；Maven 全數通過。

## R69 capture 與 JS 分析器的其餘項目

- WP140：處理 RV-501～520 中尚未修正的 18 項：預覽替換不再展開 `$'`、`$&`（RV-501）；訊息檔解碼 `\uXXXX`、跳脫字元與行接續（RV-502）；`config` init-param 逗號清單（RV-503）；專案或輸出位於 symlink 下時一律以 realpath 比對（RV-504）；只有 axios 的請求方法算 API 呼叫，`axios.request` 讀 config（RV-505）；behavior／rule 的 id 依「檔案＋畫面」計數，同一 JSP 兩段相同 inline script 不再互相覆蓋（RV-506）；`$(window).load(fn)`（RV-507）；`var validateX = function(){}` 的驗證規則（RV-508）；CSS 以位元組改寫、全部複製後只改寫一次（RV-509）；CSP meta 不會插進 `<header>`，React 預覽也加上 CSP（RV-510、RV-513）；React 標記的屬性 denylist 不分大小寫、檢查 `xlink:href` 等 URL 屬性、拒絕含 `url(` 的字串 style（RV-513）；解構與預設值參數遮蔽外層變數（RV-514）；片段 `startLine` 驗證（RV-515）；無 `source` 的元件（RV-516）；數字相加維持數字（RV-517）；只有 DOM 事件名稱的 `on*` 指派才是事件綁定（RV-518）；JSP 遮罩跳過 regex literal（RV-519）；未關閉的 `<!--` 延伸到檔尾（RV-520）。不改變對外契約，未新增 ADR。
- 驗證：JS 新增 10 個、capture 新增 4 個測試，都已確認在修改前失敗（RV-501、504、509、510、516 未加自動測試）；13 個 fixture 的圖全部與修改前相同（RV-506 第一版以檔案計數時 wp10 兩組 fixture 的 id 改變，改為依檔案＋畫面計數）；JS 191、capture 103、Maven 全數通過。

## R70 viewer 的其餘項目

- WP141：處理 RV-601、603～611：預覽文件解析後，詞法階段漏改名的 fetching 屬性也套用同一份允許規則，詞法階段改用 HTML 的空白與註解結尾、raw-text 讀到結束標籤為止（RV-601）；記住的進度檔晚於使用者的決策回來時不自動載入（RV-603）；選擇新進度檔時等待進行中的寫入（RV-604）；關聯 tooltip 只列 10 個觸發元件（RV-605）；`html:form` 等含 `:` 的路徑改用 `previewSelector`（RV-606）；同名畫面中帶 query 的加註 query 後，其餘照常區分（RV-607）；角色流程的網址入口在確定路徑上重新走訪（RV-608）；決策徽章不放進 `<select>`／`<textarea>`／`<img>` 等元素內（RV-609）；review md 附錄之後允許空行（RV-610，[ADR 0153](adr/0153-r70-review-md-trailing-empty-lines.md)）；沒有擷取高度且頁面隨視窗高度長大時，框架不再無限放大（RV-611）。
- 修正 R60、R67 留下的 wp10 golden summary：`struts1`、`struts1-spring` 少 1 個使用中的 API（RV-316 將 `/mapping.do?save=save` 併入 `/mapping.do`）；`spring-mvc-jsp`、`spring-boot-jsp` 多 1 個未引用的 API 與 1 個 `SPRING_XML_VIEW_UNRESOLVED`（RV-205 由 `<bean name="/xml-page">` 建立路由）。那兩輪沒有跑 viewer e2e，`synthetic-project.e2e.mjs` 因此失敗。
- 驗證：新增 9 個測試（`r70-viewer-review.test.mjs` 4 個，其餘加在既有檔案），md 匯入測試加上檔尾空行的案例；RV-601、603～608、610、611 都已確認在修改前失敗（RV-609 測試新抽出的 `placeBadge`）；viewer 157、e2e 120／121（`performance.e2e.mjs` 在修改前也失敗：本機首次繪製 918 ms，超過以 R5 278 ms 為基準的三倍）、Maven 全數通過；只改 viewer，圖不變，未比對 fixture。

## R71 重複程式碼與死碼

- WP142：處理 RV-801～807：Spring 的 controller／mapping／回應本體判斷與路徑接合共用 `SpringMappings`（RV-801）；Struts dispatch 端點的請求、屬性與 confidence 共用 `StrutsDispatch`，連結建立的端點補上 `category=ACTION`、`servletMappingStatus`（RV-802）；Struts 連結目標的判斷條件共用，`html:link action` 正規化 JSP parser 解析後的值，`moduleTarget`、`extendedMapping` 改用既有函式（RV-803）；parser-jsp 的元件 id、`literal()`、VOID 集合、`<current-view>`、javascript-request 修剪各只留一份（RV-804）；viewer 的端點方法／路徑、root trigger 回溯、排序比較器各只留一份（RV-805）；React 樣式改用 `resolveSpecifier`、POM 改用 `SafeProjectFiles.parseXml`（RV-806）；移除 RV-807 列出的死碼。不改變對外契約，未新增 ADR。
- 驗證：`StrutsRound71Test` 新增 2 個測試，都已確認在修改前失敗；14 個 fixture（不含 Struts 2 拒絕案例）的圖只有 `wp10/struts1`、`wp10/struts1-spring` 改變：兩個 dispatch 端點多了 `category=ACTION` 與 `servletMappingStatus=PROVEN`（RV-802 的預期結果），其餘逐位元組相同；Maven、JS 191、capture 103、viewer 157、e2e 120／121（`performance.e2e.mjs` 同 R70）全數通過。

## R72 parser-jsp 的其餘項目

- WP143：處理 RV-407、409、410、416：tag file 展開依呼叫行記錄證據，每個呼叫只引用自己的 tag file（RV-407）；共用片段的 `conditional`／`repeated` 只在每個包含它的畫面都成立時才標在節點上，各畫面情境留在 CONTAINS 證據（RV-409，[ADR 0154](adr/0154-r72-shared-fragment-include-context.md)）；表單內無 type 的 `<button>`／`<form:button>` 顯示為 SUBMIT，id 仍用與情境無關的 kind，`type="SUBMIT"` 不分大小寫（RV-410）；parent 無法解析的 Tiles definition 保留自己宣告的內容（RV-416）。
- 驗證：`ParserRound72Test` 新增 3 個、`StrutsRound72Test` 新增 1 個測試，都已確認在修改前失敗；以 R71 為基準比對 14 個 fixture：`spring-mvc-jsp` 表單內無 type 的 `<button formaction>` 由 BUTTON 改為 SUBMIT（其 `componentType` 本來就是 FORM_SUBMIT）；`r3/wp17`、`r3/wp20`、`r5/wp21`、`r7/anchors` 只移除錯配的 tag file 證據（共 126 筆），節點、關係與行為不變；其餘逐位元組相同；Maven 全數通過。

## R73 依量測處理效能熱點

- WP144：以 300 個 action 的 Struts 合成專案（依 ADR 0149 的描述重建：每頁 40 列表格、表單、前後頁連結，每個 Action 20 個 dispatch 方法）配合 JFR 量測：`ActionContracts` 改為每個 struts-config 解析一次、依 action path 建索引，關係依來源分組（RV-703）；`StrutsConfigParser.moduleFor` 依 path 快取（RV-703）；`redactHome` 在字串不含家目錄時略過 regex（RV-706）；`StrutsBehaviorProjection` 的表單送出依目標 path 建索引（RV-702）。
- 量測（sandbox，只計 Java 分析）：同一合成專案由 100 秒降為 32 秒（R72 為基準）。
- 驗證：合成專案與 14 個 fixture 的圖逐位元組相同；Maven 全數通過。純效能修改，未新增測試。

## R74 Spring MVC 與 JS 分析器的效能熱點

- WP145：新增 Spring MVC 合成專案（每個 controller 10 組 GET／POST mapping、3 個 JSP、表單與表格連結、inline script）以 JFR 與 Node `--cpu-prof` 量測：`SpringMvcAnalyzer` 的 addNode／edge 改用 id 索引，`endpointsFor` 有完全相同路徑時直接回傳；`SpringFormBindings`、`SpringServerValidation`、`RouteTemplateInference`、`UrlGraphContribution` 的請求邊移除與 `UrlResolution` 的端點比對改用索引（RV-702）；分析流程中的 `ObjectMapper` 改為常數（RV-705）；`UrlResolution.match` 快取端點樣板、`pathScore` 不再每次編譯 regex（RV-706）；`analyzer.mjs` 不再為每個 unit 過濾整份 DOM（RV-709）。量測中發現條件重導長鏈會讓導覽邊與證據呈平方成長，記為 RV-119，未處理。
- 量測（sandbox，只計分析）：40 個 controller（含 40 層重導鏈）76 秒 → 16 秒；300 個 controller 由超過 10 分鐘降為 96 秒；Node 端（100 個 controller）32 秒 → 2 秒；Struts 300 個 action 維持約 33 秒。
- 驗證：14 個 fixture、Struts 合成專案與 40 個 controller 的 Spring 合成專案（與 R73 比對），以及 100、300 個 controller 的專案（與本輪第一版比對），圖都逐位元組相同；Maven、JS 191、capture 103 全數通過。純效能修改，未新增測試。

## R75 React 與 viewer 的量測、私人路徑遮蔽

- WP146：以 300 頁的 Spring Boot＋React 合成專案量測：分析 16 秒，Node 端 7 秒來自每個畫面重走含全部路由的 App 元件，佔比不高，未修改；以同一張圖（7,500 個節點）在 Chromium 量測 viewer：載入 1.8 秒、開啟畫面面板 2.1 秒（聚焦動畫每幀強制版面計算）、搜尋輸入 250 ms，RV-710 列出的 `indexGraph` 重建合計約 90 ms，未修改。`hidePrivateLocations` 先單獨遮蔽 application，再以串流序列化確認其餘內容不含家目錄時直接回傳，不再把整張圖轉成 JSON 樹（RV-706）。更正 RV-119：重導展開有 10 層上限，是常數倍膨脹。
- 量測（只計分析）：Spring MVC 40 個 controller 16 → 8 秒、100 個 23 秒（R74 為 32 秒）、React 300 頁 16 → 13 秒、Struts 300 個 action 35 → 31 秒；80 個 controller 的專案在 3.4 GB 預設 heap 下由記憶體不足改為 35 秒完成。
- 驗證：`HomeRedactionTest` 新增 1 個測試（application 與節點中的家目錄都會遮蔽）；14 個 fixture 與 4 個合成專案的圖逐位元組相同；Maven 全數通過。

## R76 viewer 下載 md 拒絕角色圖的進入點觸發者

- WP147：設定角色的分析圖（schema 2.4）在報表按「下載 md」時失敗，訊息為「schema 2.2 嚴格驗證：觸發者」。Java `GraphIntegrityValidator` 對 2.3 與 2.4 都允許行為由 `ENTRY_POINT` 觸發，viewer 的 `strictGraph` 只允許 2.3；改為與 Java 一致。
- 驗證：`r76-entry-point-trigger.test.mjs` 新增 2 個測試（2.3／2.4 接受 ENTRY_POINT 觸發者、2.2 仍拒絕），修正前 2.4 案例以「觸發者」失敗；viewer 測試、建置、Prettier、ESLint 全數通過。

## R77 改善計畫階段 1：標注備註、欄位與 API 標注、進度保存提醒

- WP148：依 [改善計畫 2026-11-17](IMPROVEMENT_PLAN_20261117.md) 第 1、2（顯示欄位除外）、6 項，待決問題由需求方決定（OQ-052）。輸入欄位與表格可標注並在右側欄獨立成「欄位」分組，隨畫面移除；API 頁可直接標注 API，與推導狀態不一致列為衝突；畫面、按鈕、欄位、API 都可填原因（選填）與備註；有備註或 API 標注時 md 輸出 format_version 4（正文加原因／備註欄、API 直接標注與衝突表），否則仍為 v1 且位元組不變；「下載 md」在標記不在任何檔案中時顯示提示點與上次下載時間，第一次離開頁面時提醒。修正 `putNote` 對 `__proto__` ID 的處理。見 [ADR 0155](adr/0155-r77-notes-fields-api-decisions-and-save-reminder.md)。
- 驗證：新增 `r77-annotation-scope.test`（4）、`r77-review-md.test`（6）、`r77-annotation.e2e`（4）；`md.test` 的 WP47 測試改為再匯出 v4 保留原因與備註（ADR 0155 說明）。
- 未做：階段 2（功能心智圖、md 系統分析章節）與階段 3（顯示欄位、模擬可信度）待需求方決定 OQ-053、OQ-054。

## R78 改善計畫階段 2：功能心智圖、後端呼叫鏈、md 系統分析章節

- WP149：依改善計畫第 3、4 項，OQ-053 採建議方案。viewer 依確定性規則（Struts module、處理程式類別、Tiles 定義前綴、網址前綴）分組功能與流程，清單新增「功能」顯示方式與功能地圖，可標注整個功能並由未個別標記的畫面繼承；Java 新增 `BackendCallChains` 追蹤處理程式 → Service → DAO（最多 4 層，寫入 `backendCalls` attribute）；md 新增 §8 功能與流程、§9 後端呼叫鏈、§10 資料欄位對照、§11 移除影響範圍，功能標注輸出 format_version 5；`migration_target` 可依專案在工作區設定 `migrationTargets` 改寫或移除。見 [ADR 0156](adr/0156-r78-features-backend-calls-and-system-md.md)。
- 驗證：新增 viewer 單元 6、e2e 2、Java 8 個測試；md golden 與 WP40 雜湊只因新增章節而變（刪去後逐位元組相同）。

## R79 改善計畫階段 3：顯示欄位與預覽可信度標示

- WP150：依改善計畫第 5、7 項，OQ-054 採建議方案。JSP／Thymeleaf（`DisplayFields`）與 React（`screentrace-js`）把印出資料的元素建模為 `DISPLAY_FIELD` 元件，名稱依表頭、前置標籤或屬性路徑，迴圈內為一個重複元件；capture 沿用元件 ID 對應預覽元素；viewer 把顯示欄位列入「欄位」分組，可標注、可從預覽點選；md §10 以屬性對照表單模型。預覽新增「標示示範內容」切換，框出示範資料、依條件顯示與無法確定的內容。見 [ADR 0157](adr/0157-r79-display-fields-and-preview-trust.md)。
- 驗證：新增 Java 4、JS 1、viewer e2e 2 個測試；合成專案 `page.jsp` 結尾各加一行輸出；`MarkupAnalysisTest`、`Wp21ComponentNamesTest` 排除新 kind（ADR 0157 說明）。

## R80 精靈步驟拆成畫面變體

- WP151：需求方回報 reservio `/reservation/new` 的預約精靈只看得到第 1 步，點「下一步」沒有反應。原因是步驟由元件狀態切換，網址不變，第 2、3 步只在圖上以條件元件存在，預覽固定畫初始值。需求方決定（OQ-055）：步驟成為畫布上的子畫面，API 歸到各步驟。實作可證明的頁面狀態變體：常值初始化、常值寫入、不同值顯示不同元件，且步驟內的元件會寫入其他值；初始值沿用原畫面 ID，setter 寫入成為導覽到該步驟的 `NAVIGATES_TO`，網址只開啟初始值。見 [ADR 0158](adr/0158-r80-page-state-variants.md)。
- WP152：需求方以 reservio 實測第一版，精靈仍未拆開。原因是 `BookingFlowPage.tsx:79` 在 `useEffect` 中以 `setStep(flow.draft.business && activeService ? 2 : 1)` 修正步驟，條件運算式不是單一常值，`step` 被視為未知。改為：各分支都是常值的條件運算式，各分支的值都算可能值；其他條件都符合、只因寫入無法證明而不拆時記 `REACT_STATE_VARIANT_UNPROVEN`。放寬後 reservio 多拆了 5 個路由，加上三條規則排除：各值的元件組合要不同（排除錯誤訊息）、掛載時的載入路徑不寫入它（排除 loading／ready／error）、第一步要在初始預覽中看得到（排除預設關閉的對話框）。
- 驗證：Maven `StateVariantTest` 新增 4 個測試，JS `r80-state-variants.test.mjs` 新增 8 個（共 200 個，原有測試都不需修改），viewer `r80-state-variant-name.test.mjs` 新增 1 個；Maven 除 `screentrace-cli` 6 個需要擷取產物的整合測試（本環境沒有 capture 的 Playwright 套件，改動前即失敗）外全數通過；viewer 除 3 個同樣需要 capture 套件的測試外全數通過。reservio 的 React 分析只有 `/reservation/new` 拆成 3 步（41 → 43 畫面），其他輸出與 `main` 逐項相同；完整 CLI 與報表實測待需求方執行。

## R81 沒有畫面的系統自動作業

- WP153：依 [reservio 評估](RESERVIO_EVALUATION_20261118.md) P1，OQ-056 採 A。Spring adapter 新增 `SpringBackgroundJobs`，把 `@Scheduled`、`@EventListener`／`@TransactionalEventListener`、`ApplicationRunner`／`CommandLineRunner` 建成 HANDLER，執行時機轉成白話（cron 已知形狀、固定間隔、設定佔位的預設值與覆寫來源），事件記錄發布來源，並沿用後端呼叫鏈；API 頁新增「系統自動作業」分組與詳情，md 新增 §12。見 [ADR 0159](adr/0159-r81-background-jobs.md)。

## R82 資料狀態變更

- WP154：依 [reservio 評估](RESERVIO_EVALUATION_20261118.md) P2，OQ-056 採 A。`BackendCallChains` 沿呼叫鏈記錄列舉常數的寫入（setter、builder、欄位指定；條件式兩值為 INFERRED，變數為 UNRESOLVED），寫入 HANDLER 的 `stateChanges`；`screentrace-js` 新增 `state-labels` 模式擷取前端字面對照，所有對照一致才並列中文。API 頁新增「資料狀態」分組與各 API／作業的「會改變的資料狀態」，md 新增 §13。reservio 的 LINE 對話 9 個步驟狀態與預約狀態的設定來源都能看到。見 [ADR 0160](adr/0160-r82-state-changes.md)。

## R83 程式組出的按鈕文字與選項

- WP155：依 [reservio 評估](RESERVIO_EVALUATION_20261118.md) P3。React 分析器讀取「條件選擇的物件字面值」的屬性（`primary.label` 讀成「前往預約 / 開始預約」，不再是「示例值」），`.map` 的字面陣列含 spread 時逐項展開已知項目（預約間隔顯示 15／30／45／60 分鐘四個選項），`<label>` 內沒有名稱的欄位以 label 文字命名。訪客導覽列由函式依身分回傳兩組陣列，仍無法展開，記於 ADR。見 [ADR 0161](adr/0161-r83-literal-alternatives-and-wrapped-labels.md)。

## R84 預覽預設只顯示有資料狀態

- WP156：依 [reservio 評估](RESERVIO_EVALUATION_20261118.md) P4，OQ-057 採 A。React 分析器以 AST 解析每個元素的顯示條件，辨識載入中、錯誤、沒有資料，在預覽 HTML 標 `data-st-state`；capture 加入預設隱藏規則，截圖只剩有資料狀態；viewer 預覽工具列新增「畫面狀態」切換。reservio 建立預約第 1 步不再疊出骨架、錯誤與空白訊息。見 [ADR 0162](adr/0162-r84-page-states-in-preview.md)。

## R85 畫面名稱白話化

- WP157：依 [reservio 評估](RESERVIO_EVALUATION_20261118.md) P5，OQ-057 採 A。viewer 顯示名稱的網址參數與狀態變體改寫成白話（「網址帶 lineLogin=failed 或 success」「step 為 1」），同名畫面先以角色名稱區分（「通知中心（商家）」），沒有標題的畫面改用連到它的選單文字（reservio `/dashboard` 由「Customer Dashboard Page」變為「概覽」）。見 [ADR 0163](adr/0163-r85-plain-screen-names.md)。

## R86 功能地圖依選單分組

- WP158：依 [reservio 評估](RESERVIO_EVALUATION_20261118.md) P6，OQ-057 採 A。功能分組新增「選單」依據（同一份清單產生、連到兩個以上畫面的連結），優先於網址前綴；功能地圖的說明只列實際用到的依據，md §8 說明加入選單。見 [ADR 0164](adr/0164-r86-menu-features.md)。

## R87 API 的白話用途

- WP159：依 [reservio 評估](RESERVIO_EVALUATION_20261118.md) P7。API 詳情顯示「用途：按下「取消預約」時呼叫」這類由呼叫來源組成的句子，清單每列顯示觸發的按鈕名稱；排除處理中文字、示例值與無文字標籤。見 [ADR 0165](adr/0165-r87-api-purpose.md)。

## R88 外部登入導回路徑

- WP160：依 [reservio 評估](RESERVIO_EVALUATION_20261118.md) P8。外部登入的導回路徑讀值器支援有參數的輔助方法、條件運算式、`UriComponentsBuilder` 串接與 `@ConfigurationProperties` 設定值；reservio LINE 登入的導回路徑解析為 `/login`，`EXTERNAL_LOGIN_RETURN_UNRESOLVED` 消失。見 [ADR 0166](adr/0166-r88-login-return-through-helpers-and-configuration.md)。

## R89 自動建議角色

- WP161：依 [reservio 評估](RESERVIO_EVALUATION_20261118.md) P9，OQ-057 採 A。沒有設定角色的 React 專案，分析器依路由守衛的身分條件建議「未登入」與各角色值的角色（載入旗標與 `must…` 例外旗標設為否），描述標「自動建議」；有手動設定時不建議。見 [ADR 0167](adr/0167-r89-suggested-personas.md)。

## R90 啟動腳本的 Java 版本判斷

- WP162：依 [reservio 評估](RESERVIO_EVALUATION_20261118.md) P10。`bin/screentrace` 與 `bin/screentrace.ps1` 原本只讀 `java -version` 的第一行，環境設有 `JAVA_TOOL_OPTIONS` 時第一行是「Picked up …」，`doctor` 誤報缺 Java、`analyze` 無法執行；改為取含 `version "` 的那一行。新增 viewer `r90-launcher-java.test`（1）。

## R91 畫面身分事實經由 props 決定條件

- WP163：R83 的剩餘問題。React 分析器在條件無法由值判斷時，把解構的 prop 換回父元件傳入的運算式、把條件常數換回初始值，再以畫面的身分事實判斷；reservio 訪客首頁的導覽列與按鈕與實際畫面一致，不再出現「示例值」與「登出」。見 [ADR 0168](adr/0168-r91-screen-facts-through-props.md)。

## R92 自動建議角色的一般狀態

- WP164：R89 的剩餘問題。自動建議的角色另外取同一登入物件上其他旗標（如 `me.business`）在該角色守衛的畫面中多數要求的值；reservio 三個建議角色的結果與手動設定相同。見 [ADR 0167](adr/0167-r89-suggested-personas.md) 的 R92 補充。

## R93 未分組畫面併入兄弟畫面的功能

- WP165：R86 的剩餘問題。未分組的網址參數／頁面狀態版本併入同網址畫面的功能，同一頁面元件畫出的畫面併入彼此的功能（轉址頁與身分版本除外）；reservio「其他」由 14 個降為 8 個。見 [ADR 0164](adr/0164-r86-menu-features.md) 的 R93 補充。

## R94 推論原狀態

- WP166：OQ-058。狀態寫入加上由同一方法內同一物件的狀態比較（外層 if、throw／return 守衛、switch）推得的原狀態，標為推測；API 頁與 md §13 顯示「待確認 → 已取消」。見 [ADR 0169](adr/0169-r94-prior-state.md)。

## R95 前端多種寫法

- WP167：OQ-058。前端對同一狀態有多種寫法時依出現位置全部列出（「待確認／等待店家確認」），狀態詳情附每種寫法的來源。見 [ADR 0170](adr/0170-r95-every-frontend-word.md)。

## R96 背景作業擴充

- WP168：背景作業偵測移到共用模組並套用 Struts 管線，新增 XML `task:scheduled`、程式排程（TaskScheduler、ScheduledExecutorService）、Quartz Job 與 `@Async`。見 [ADR 0171](adr/0171-r96-more-background-jobs.md)。

## R97 文字狀態與較深的狀態寫入

- WP169：狀態欄位（名稱以 status／state／stage／phase 結尾）的字串、整數與常數寫入也列為狀態並推論原狀態；狀態寫入追到 8 層（呼叫鏈仍列 4 層）。見 [ADR 0172](adr/0172-r97-text-states-and-deeper-writes.md)。

## R98 改名 props、Context 與 hook 條件

- WP170：畫面事實的條件判斷延伸到改名解構的 props、Context provider 提供的條件值與只回傳條件的自訂 hook。見 [ADR 0173](adr/0173-r98-renamed-props-and-hook-conditions.md)。

## R99 JSP 疊加狀態

- WP171：JSP 預覽依 EL 條件形狀（`empty 清單`、`not empty errors` 等）標出沒有資料與錯誤區塊，預設隱藏並可切換；React 的狀態命名另認 `isPending`、`isSubmitting`、`noResults` 等。見 [ADR 0174](adr/0174-r99-jsp-page-states-and-names.md)。

## R100 登入導回的其他網址組法

- WP172：外部登入導回路徑讀值器另認 `String.format`、`URI.create`／`new URI`、`concat`、`StringBuilder`、`path()`／`pathSegment()`、`fromCurrentContextPath()`、三參數 `RedirectStrategy.sendRedirect` 與沒有自訂 handler 時的 `defaultSuccessUrl`。見 [ADR 0175](adr/0175-r100-more-return-url-shapes.md)。

## R101 狀態轉換清單

- WP173：私有方法由狀態 `switch` 或 `if` 分派時，以呼叫端推論原狀態；API 頁狀態詳情新增「狀態轉換（推測）」清單。reservio 的 LINE 聊天預約步驟（選服務 → 輸入日期 …）可依序看到。見 [ADR 0176](adr/0176-r101-dispatched-steps-and-transitions.md)。

## R102 呈現修正

- WP174：同名畫面以兩個事實組合區分（不再用檔名）；功能地圖新增「只有一個角色會用到」分組；自動建議角色可採前端的中文對照；只有處理中字樣的按鈕在 API 用途寫成「顯示「處理中」的按鈕」。見 [ADR 0177](adr/0177-r102-presentation-fixes.md)。

## R103 角色名稱、部分原狀態、落單畫面

- WP175：自動建議的角色依建立該角色帳號的畫面標題命名（reservio 為「商家」「客戶」）；列舉的 `.name()` 寫入視同該值；私有方法只有部分呼叫端說得出原狀態時列出並標示；功能地圖中只屬於一個角色的落單畫面加入該角色其他畫面所在的功能。見 [ADR 0178](adr/0178-r103-role-names-partial-priors-and-role-peers.md)。

## R104 寫在呼叫處的排程工作

- WP176：交給排程器的多行 lambda 與匿名 `Runnable`／`Callable`／`TimerTask` 成為「`類別.方法()` 的排程工作（第 N 行）」，後端呼叫只追工作本身。見 [ADR 0179](adr/0179-r104-tasks-written-in-place.md)。

## R105 依比對認出的文字狀態

- WP177：欄位名稱不像狀態時，若程式拿它和代碼字比對（`"PAID".equals(o.getPayment())`、`switch` 字串分支），而寫入的值也是代碼字，同樣列為文字狀態。見 [ADR 0180](adr/0180-r105-compared-text-fields-are-states.md)。

## R106 Struts 與 Thymeleaf 的疊加狀態

- WP178：`logic:empty`、`logic:messagesPresent` 等 Struts 標籤與 Thymeleaf `th:if`／否定的 `th:unless`（含 `#lists.isEmpty`、`#fields.hasErrors`）標出沒有資料與錯誤區塊，預覽預設隱藏、可切換。見 [ADR 0181](adr/0181-r106-struts-and-thymeleaf-page-states.md)。

## R107 Spring MVC JSP 實案驗收

- WP179：以 `insure` 驗證 Spring MVC、JSTL、Tiles 的投保、續保、核保、繳費與查詢流程。新增 Controller 回傳分流、JSTL URL 樣板、共用 Tiles 的互動歸屬及離線預覽樣本。見 [ADR 0182](adr/0182-spring-jsp-flow-resolution.md)。

## R108 JSP 流程狀態預覽

- WP180：辨識 Spring MVC JSP 的條件式表單狀態，沿用既有畫面變體契約建立獨立截圖，並依送出的按鈕切換至對應畫面。見 [ADR 0183](adr/0183-jsp-form-state-variants.md)。

## R109 Spring 表單成功路徑回放

- WP181：表單回放合併相同目的及呈現結果，依原始碼中的成功轉址證據直接回放正常流程。保留各回傳分支的圖證據。見 [ADR 0184](adr/0184-spring-form-success-replay.md)。
