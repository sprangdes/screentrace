# WP7 增量回報

## A 建置與資料注入

新增 screentrace-viewer（TypeScript／esbuild）與 SingleHtmlReportGenerator 嚴格 2.2 入口；舊入口尚保留。文件 v1.5 修訂 CSP，決定見 [ADR 0019](../adr/0019-viewer-build-and-csp.md)。

先失敗：3 項 Java 新測試缺生成器而編譯失敗；file:// E2E 因 HTML 尚未產出失敗。實作後 206 項 Java 全通過，viewer 2 項 unit 通過，npm audit 0 vulnerabilities。Chromium／WebKit file:// E2E 通過：惡意名稱／URL／JS 字串保持文字，srcdoc 腳本探針未觸發，對外請求 0；Firefox 本機啟動因 sandbox／繪圖環境逾時，遠端三引擎驗證列入 CI。

新增建置、注入與安全測試；既有斷言未修改。實際 bytes 大小報告及 >100 MB 警告閾值有測試。無未決需求。B–E 尚未開始；A 推送後取得遠端全綠才進入 B。

A gate：`9d54f1a`，[遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37101737010)，三引擎安全测试、npm audit、Dependency-Check 通過。

## B 總覽畫布與檔案結構

新增 map.ts（保留共用元件所有畫面來源、處理器路由、SCC 循環保護與決定性分層）與 canvas.ts（所有畫面／關聯、鍵盤與拖曳平移縮放、檔案樹與搜尋高亮）。無新增相依；未變更既有斷言。失敗證據：map 模組缺少、畫布卡片與關聯不存在；實作後 unit 4 tests、Java 注入 3 tests、Chromium E2E 3 tests 全通過。

效能 fixture：500 畫面／5,000 元件／3,000 導頁關聯，另有 5,000 CONTAINS；初次渲染約 77 ms（本機 Chromium）；20 次縮放按鍵中位數 <1 ms。實測受平台影響，CI 仍強制 3,000 ms 上限。檔案樹保留全部畫面；URL 樣板、單星／雙星、副檔名與子字串測試通過；循環圖及輸入順序反轉布局相同。
