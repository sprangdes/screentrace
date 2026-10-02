# ScreenTrace 工作包路線圖

依 [CODEX_INSTRUCTIONS.md](CODEX_INSTRUCTIONS.md) 1.0（2026-10-02）與 [REQUIREMENTS.md](REQUIREMENTS.md) 執行。過去 POC 已有功能不等同新驗收完成；基線見 [BASELINE.md](BASELINE.md)。每個工作包獨立提交，每個里程碑結束後等待需求方確認。

| 工作包 | 範圍 | 狀態 |
|---|---|---|
| WP0 | 基線、需求原文、架構與文件整理 | 完成；原始失敗與後續補足的報表測試實測皆保留於 BASELINE |
| WP1 | 行為與檢核模型、穩定 ID、API 使用狀態 | 完成；schema 2.2、穩定鍵、API 推導，OQ-001 已決定 |
| WP2 | Struts 1.x、Dispatch、Validator、Tiles、拒絕 Struts 2 | 實作與本機驗證完成；遠端 CI 尚未執行 |
| WP3 | JSP / HTML 元件、控制流程、檢核、事件來源 | 未開始 |
| WP4 | JavaScript AST、事件與函式追蹤 | 未開始 |
| WP5 | URL 對應、API 契約、Spring 檢核 | 未開始 |
| WP6 | 靜態預覽、完整元素樣式、條件標記 | 未開始 |
| WP7 | 單一 HTML、Screen Map、API 頁、review | 未開始 |
| WP8 | review md 匯出與還原、移除 JSON 匯出 | 未開始 |
| WP9 | 元件庫 manifest、驗證與決定性比對 | 未開始 |
| WP10 | 合成 fixture、整合測試、CI、使用文件 | 未開始 |

| 里程碑 | 工作包 | 狀態 |
|---|---|---|
| M1 | WP0、WP1、WP2 | WP0–WP2 實作與本機驗證完成；等待需求方確認與遠端 CI，見 reports/M1.md |
| M2 | WP3、WP4、WP5 | 等待 M1 驗收確認 |
| M3 | WP6、WP7、WP8 | 等待 M2 驗收確認 |
| M4 | WP9、WP10 | 等待 M3 驗收確認；最終驗收 |

## 本次調整前的既有能力

- 七個 Maven 模組與 capture Node 模組。
- schema 2.1 圖、來源、解析信心、API request/response 契約。
- Struts 1 / Struts + Spring / Spring MVC JSP / Spring Boot JSP 的合成 fixture 與部分解析。
- JSP 靜態預覽、Chromium 截圖、互動元件位置、localhost 報表與 review JSON v2。

這些能力仍有附件 §3 列出的落差。JavaScript 全解析、完整元件與檢核、API 移除推導、單一離線 HTML、md 匯出、元件庫匯入尚未完成。不啟動或修改被分析專案，不產生遷移程式碼。
