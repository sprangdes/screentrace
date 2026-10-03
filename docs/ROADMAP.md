# ScreenTrace 工作包路線圖

依 [CODEX_INSTRUCTIONS.md](CODEX_INSTRUCTIONS.md) 1.7（2026-10-03）與 [REQUIREMENTS.md](REQUIREMENTS.md) 執行。過去 POC 已有功能不等同新驗收完成；基線見 [BASELINE.md](BASELINE.md)。每個工作包獨立提交，每個里程碑結束後等待需求方確認。

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
| WP9 | 元件庫 manifest、驗證與決定性比對 | 未開始 |
| WP10 | 合成 fixture、整合測試、CI、使用文件 | 未開始 |

| 里程碑 | 工作包 | 狀態 |
|---|---|---|
| M1 | WP0、WP1、WP2 | 完成；需求方已授權進入 M2，遠端 CI 全綠，見 reports/M1.md |
| M2 | WP3、WP4、WP5 | 完成；三工作包均遠端全綠，最終 WP5 b7b51b9；需求方已驗收並授權進入 M3 |
| M3 | WP6、WP7、WP8 | WP6 已驗收；WP7／WP8 完成並遠端全綠；WP8 已驗收；v1.8 補強後停止，不進 WP9，等待確認 |
| M4 | WP9、WP10 | 等待 v1.8 補強驗收確認；最終驗收 |

## 本次調整前的既有能力

- 七個 Maven 模組與 capture Node 模組。
- 新分析嚴格 schema 2.2 圖、來源、解析信心、API request/response 契約；2.1 僅歷史相容。
- Struts 1 / Struts + Spring / Spring MVC JSP / Spring Boot JSP 的合成 fixture 與部分解析。
- JSP 靜態預覽、Chromium 截圖、互動元件位置、localhost 報表與 review JSON v2。

這些能力仍有附件 §3 列出的落差。WP3／WP4 已完成本次要求的標記與 JavaScript 靜態分析；後端對應 WP5 已驗收；單檔 HTML WP7 分增量驗收；md 匯出與元件庫匯入依 WP8／WP9。不啟動或修改被分析專案，不產生遷移程式碼。

## 技術債

- OQ-005：待既有歷史測試遷移後移除 ApplicationGraph 舊版相容建構子；目前只供讀取歷史資料與既有 fixture，正式分析不得使用。

- WP7 E 已移除 Deprecated ReportGenerator 與原測試／localhost／POST endpoint；新資料注入只接受嚴格 2.2。
- WP8 C 已移除 ReviewResultGenerator／原測試與 CLI export；新 md 與共用模組嚴格 2.2。

- WP7 B：單檔畫布／決定性 SCC 分層、檔案樹、URL 搜尋與平移縮放已實作；逐增量 CI gate 見 docs/reports/WP7.md。

- capture 相容清理：packDocuments 舊 inline CSS 入口僅供 C 增量歷史 fixture；正式 CLI 使用 packStandaloneDocuments。依 OQ-006 保留原斷言，後續與歷史 capture 路徑一併移除（ADR 0021）。
