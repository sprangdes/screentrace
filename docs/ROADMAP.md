# ScreenTrace 工作包路線圖

依 [CODEX_INSTRUCTIONS.md](CODEX_INSTRUCTIONS.md) 1.3（2026-10-03）與 [REQUIREMENTS.md](REQUIREMENTS.md) 執行。過去 POC 已有功能不等同新驗收完成；基線見 [BASELINE.md](BASELINE.md)。每個工作包獨立提交，每個里程碑結束後等待需求方確認。

| 工作包 | 範圍 | 狀態 |
|---|---|---|
| WP0 | 基線、需求原文、架構與文件整理 | 完成；原始失敗與後續補足的報表測試實測皆保留於 BASELINE |
| WP1 | 行為與檢核模型、穩定 ID、API 使用狀態 | 完成；schema 2.2、穩定鍵、依 (screenId, componentId) 決策的 API 推導，OQ-001 已決定 |
| WP2 | Struts 1.x、Dispatch、Validator、Tiles、拒絕 Struts 2 | 完成；遠端 CI 全綠（e8139dd） |
| WP3 | JSP / HTML 元件、控制流程、檢核、事件來源 | 完成；OQ-002 已處理，132 個 Java 測試與遠端 CI 全綠，見 reports/M2.md |
| WP4 | JavaScript AST、事件與函式追蹤 | 完成；四個增量皆遠端全綠，40 JS／147 Java 通過；OQ-003 已處理（v1.3），見 reports/WP4.md |
| WP5 | URL 對應、API 契約、Spring 檢核 | 增量一 URL／context 遠端全綠（51c9575）；增量二依 §0.3 停止，OQ-004 未決 |
| WP6 | 靜態預覽、完整元素樣式、條件標記 | 未開始 |
| WP7 | 單一 HTML、Screen Map、API 頁、review | 未開始 |
| WP8 | review md 匯出與還原、移除 JSON 匯出 | 未開始 |
| WP9 | 元件庫 manifest、驗證與決定性比對 | 未開始 |
| WP10 | 合成 fixture、整合測試、CI、使用文件 | 未開始 |

| 里程碑 | 工作包 | 狀態 |
|---|---|---|
| M1 | WP0、WP1、WP2 | 完成；需求方已授權進入 M2，遠端 CI 全綠，見 reports/M1.md |
| M2 | WP3、WP4、WP5 | WP3 驗收通過；WP4 完成且遠端全綠，WP4 驗收通過；WP5 增量一全綠，增量二因 OQ-004 停止 |
| M3 | WP6、WP7、WP8 | 等待 M2 驗收確認 |
| M4 | WP9、WP10 | 等待 M3 驗收確認；最終驗收 |

## 本次調整前的既有能力

- 七個 Maven 模組與 capture Node 模組。
- schema 2.1 圖、來源、解析信心、API request/response 契約。
- Struts 1 / Struts + Spring / Spring MVC JSP / Spring Boot JSP 的合成 fixture 與部分解析。
- JSP 靜態預覽、Chromium 截圖、互動元件位置、localhost 報表與 review JSON v2。

這些能力仍有附件 §3 列出的落差。WP3／WP4 已完成本次要求的標記與 JavaScript 靜態分析；後端對應、單一離線 HTML、md 匯出、元件庫匯入仍依後續工作包驗收。不啟動或修改被分析專案，不產生遷移程式碼。
