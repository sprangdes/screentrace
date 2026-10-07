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
| R5 | WP21–WP23：靜態名稱、端點分群與流向 | WP21／WP22 已驗收；路徑補強、20 次 E2E 重跑與 WP23 完整驗證通過；WP23 停止待驗收，見 reports/R5.md |
| R3 | WP17–WP20：流程補強與呈現修正 | WP17／WP18 已驗收；WP19／WP20 完成，等待驗收（241 Java／50 viewer／48 E2E）；包含 G9 全站導覽／格狀版面與 G10 導覽名稱，見 reports/R3.md |
| R8 | WP30–WP32：需求方文件、可重現截圖與 CLI 友善失敗 | WP30／WP31／WP32 完成，等待需求方驗收；缺少設定且無互動終端機時立即以中文訊息及結束碼 2 失敗，設定有效時指定專案可照常執行。R3 完成流程與全站導覽排版；R4 改善報表操作介面；R5 補強路徑隱私與流程版面；R6 加入離線模擬操作與誠實覆蓋率；R7 統一模擬結果與覆蓋率並補強靜態對應。詳見 reports/R8.md。 |
| R10 | WP34–WP38：需求方功能理解與確認工作流 | WP34–WP36 已驗收；WP35 的 OQ-020 分組依據已決定並實作，JSP 根目錄頁歸「首頁與其他」，缺 JSP 的畫面明確標記。WP37–WP38 未開始。見 reports/R10.md、ADR 0057／0058。 |
| R11 | WP39–WP40：檢視器簡化與決策介面常駐 | WP39／WP40 完成，等待需求方驗收；R10 WP37／WP38 尚未開始。確認模式已移除，決策、進度、篩選、衝突提示與快捷操作常駐。見 reports/R11.md、ADR 0059／0060。 |

| 里程碑 | 工作包 | 狀態 |
|---|---|---|
| M1 | WP0、WP1、WP2 | 完成；需求方已授權進入 M2，遠端 CI 全綠，見 reports/M1.md |
| M2 | WP3、WP4、WP5 | 完成；三工作包均遠端全綠，最終 WP5 b7b51b9；需求方已驗收並授權進入 M3 |
| M3 | WP6、WP7、WP8 | 完成；WP6／WP7／WP8 與 v1.8 補強已驗收 |
| M4 | WP9、WP10 | WP9 已驗收；限定 WP10 四項完成且遠端全綠，停止等待驗收；見 reports/M4.md |
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
