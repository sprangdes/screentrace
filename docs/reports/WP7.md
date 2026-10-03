# WP7 增量回報

## A 建置與資料注入

新增 screentrace-viewer（TypeScript／esbuild）與 SingleHtmlReportGenerator 嚴格 2.2 入口；舊入口尚保留。文件 v1.5 修訂 CSP，決定見 [ADR 0019](../adr/0019-viewer-build-and-csp.md)。

先失敗：3 項 Java 新測試缺生成器而編譯失敗；file:// E2E 因 HTML 尚未產出失敗。實作後 206 項 Java 全通過，viewer 2 項 unit 通過，npm audit 0 vulnerabilities。Chromium／WebKit file:// E2E 通過：惡意名稱／URL／JS 字串保持文字，srcdoc 腳本探針未觸發，對外請求 0；Firefox 本機啟動因 sandbox／繪圖環境逾時，遠端三引擎驗證列入 CI。

新增建置、注入與安全測試；既有斷言未修改。實際 bytes 大小報告及 >100 MB 警告閾值有測試。無未決需求。B–E 尚未開始；A 推送後取得遠端全綠才進入 B。

A gate：`9d54f1a`，[遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37101737010)，三引擎安全测试、npm audit、Dependency-Check 通過。

## B 總覽畫布與檔案結構

新增 map.ts（保留共用元件所有畫面來源、處理器路由、SCC 循環保護與決定性分層）與 canvas.ts（所有畫面／關聯、鍵盤與拖曳平移縮放、檔案樹與搜尋高亮）。無新增相依；未變更既有斷言。失敗證據：map 模組缺少、畫布卡片與關聯不存在；實作後 unit 4 tests、Java 注入 3 tests、Chromium E2E 3 tests 全通過。

效能 fixture：500 畫面／5,000 元件／3,000 導頁關聯，另有 5,000 CONTAINS；初次渲染約 77 ms（本機 Chromium）；20 次縮放按鍵中位數 <1 ms。實測受平台影響，CI 仍強制 3,000 ms 上限。檔案樹保留全部畫面；URL 樣板、單星／雙星、副檔名與子字串測試通過；循環圖及輸入順序反轉布局相同。

B gate：`68e260b`，[遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37102325727)。

## C 聚焦、關聯線與右側面板

新增 details／relations／preview／usage TypeScript 模組；全部目標文字使用 textContent。畫面聚焦／關聯 tooltip（10 項＋其餘數量）／返回、API 與各類行為詳情、預覽任意元素樣式／條件／來源／候選，呼叫來源保留載入、共用元件、未綁定與回呼。新增 pack-preview 工具：靜態 CSS import、圖片／字型雜湊字典、外部／越界資源停用及診斷，E 切換 CLI 時串接。

先失敗：封裝模組缺少；右側缺載入時資訊。最終 viewer unit 5 tests、Chromium file:// E2E 5 tests、封裝 3 tests、Java 注入 3 tests 通過；沒有修改既有測試斷言。新測試中的繁體「畫」文案拼字校正，測試意義與行為未變。安全 fixture CSS／圖片內嵌成功，對外與相對請求 0、腳本探針未觸發。首次渲染 130.1 ms，20 次縮放中位數 1 ms（本機 Chromium）。設計見 [ADR 0020](../adr/0020-viewer-projection-and-preview-pack.md)。無新增相依或未決需求。

C 補足：純 MARKUP 檢核缺集中畫面列表的新 E2E 先逾時失敗；面板合併同畫面元件、載入／元件 API 的檢核規則且按 ID 去重後，6 項 E2E 全通過。原本成功斷言全數保留。

C 最終 gate：`62bcd38`，[遠端全綠](https://github.com/sprangdes/screentrace/actions/runs/37103040228)。B 遠端效能實測 327.9 ms、縮放中位數 1 ms。

## D Review 模式

共用 shared/review.ts 定義格式 v1、schema 2.2 與巢狀 `(screenId, componentId)` 字典；契約見 [REVIEW_STATE_CONTRACT](../REVIEW_STATE_CONTRACT.md)。明確三態、有效隨畫面移除、統計、畫面／元件篩選、衝突警告及應用＋圖指紋 localStorage。未知 ID 保存；非法／失敗暫存僅警告；不突變圖與元件決策。WP8 的 md 功能未實作。

先失敗：共享模組不存在、兩項 E2E 缺 review checkbox。最終 8 項 unit（含 162 組 API 狀態、prototype／非法資料測試）、8 項 Chromium E2E、3 項 Java 注入測試通過；既有斷言未修改。E2E 同一共用元件在兩個畫面各有不同決策，画面 REMOVE 後元件 KEEP 保留，重新開啟還原，localStorage 拒絕仍可操作。
