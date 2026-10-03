# WP7 增量回報

## A 建置與資料注入

新增 screentrace-viewer（TypeScript／esbuild）與 SingleHtmlReportGenerator 嚴格 2.2 入口；舊入口尚保留。文件 v1.5 修訂 CSP，決定見 [ADR 0019](../adr/0019-viewer-build-and-csp.md)。

先失敗：3 項 Java 新測試缺生成器而編譯失敗；file:// E2E 因 HTML 尚未產出失敗。實作後 206 項 Java 全通過，viewer 2 項 unit 通過，npm audit 0 vulnerabilities。Chromium／WebKit file:// E2E 通過：惡意名稱／URL／JS 字串保持文字，srcdoc 腳本探針未觸發，對外請求 0；Firefox 本機啟動因 sandbox／繪圖環境逾時，遠端三引擎驗證列入 CI。

新增建置、注入與安全測試；既有斷言未修改。實際 bytes 大小報告及 >100 MB 警告閾值有測試。無未決需求。B–E 尚未開始；A 推送後取得遠端全綠才進入 B。
