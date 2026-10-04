# ADR 0041：R4 UI2 畫布與畫面決策控制項

## 背景與決定
依 ADJUSTMENT_R4_UI §4.3 與需求方補充，保留決定性格狀配置與已有避開卡片的 gutter 路徑。本輪先維持格狀（文件明確允許），不新增佈局相依；線條改為 1.5px 箭頭、端點高亮與其他項目 25% 淡化。畫布置中適合視窗，導覽與縮放分開；聚焦使用麵包屑與示意徽章。卡片移除舊下拉與重複徽章，三態按鈕放在 hover／鍵盤 focus 工具列及聚焦標題。

分析、圖、決策儲存與 md 格式不變。螢幕決策的資料值與斷言不變，僅選取與讀值方式由 select 改為 segmented。元件的 select 留到 UI3。

## 授權的逐處測試變更

以下各測試中每個 `[data-screen-review]` 操作，舊預期為 selectOption 決策／inputValue；新預期為 `[data-decision]` 按鈕 click／group 的 data-decision。所有 KEEP、REMOVE、UNDECIDED 的期望值與 md 位元組斷言不變。原因是需求方明確要求移除畫面下拉。共用 setDecision 僅執行 hover 與 click，不直接改狀態。

- `screentrace-viewer/test/api.e2e.mjs` — API page shows three derived states, all caller groups, search/filter/sort and clickable jump/highlight：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。
- `screentrace-viewer/test/library.e2e.mjs` — ${engine}: library details, KEEP-only composite override and reversible A/B/A：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。
- `screentrace-viewer/test/library.e2e.mjs` — ${engine}: v2 download/import preserves foreign overrides and restores them on return：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。
- `screentrace-viewer/test/md.e2e.mjs` — ${engine}: review mark/export/clear/import/export is byte-identical except timestamp and has no requests：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。
- `screentrace-viewer/test/md.e2e.mjs` — ${engine}: malformed, modified and truncated imports preserve current decisions：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。
- `screentrace-viewer/test/md.e2e.mjs` — selected files above 64 MiB fail before reading and preserve current decisions：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。
- `screentrace-viewer/test/r4-shell.e2e.mjs` — UI1 preserves inherited component filter and file-tree decisions：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。
- `screentrace-viewer/test/review.e2e.mjs` — review composite selections, inherited state, statistics, filtering, conflicts and local restore：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。
- `screentrace-viewer/test/review.e2e.mjs` — localStorage unavailable does not break review or viewer：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。
- `screentrace-viewer/test/synthetic-project.e2e.mjs` — ${engine}: ${family} source→CLI→offline report→review/library override→md→clear→restore：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。
- `screentrace-viewer/test/wp16.e2e.mjs` — WP16 chromium full requester flow: ${family}：本段每處 screen-review select 操作／讀值依上述控制項替換；期望的決策值不變。

- `review.e2e.mjs` / `review mode marks button types from the preview and batches every button with visible totals`：卡片 innerText 包含「未確認」改為狀態 SVG 的 aria-label 等於「未確認」。原因：依追加需求，移除重複文字徽章，仍驗證相同狀態與可讀標籤。

## 舊實作失敗證明與限制
新增 UI2 驗收測試在 UI1 舊實作失敗：非確認模式仍有 2 個清單狀態圖示，預期 0。改寫的決策測試另以保存的 UI1 HTML 執行，預期按鈕不存在而失敗；詳見 R4 報告。UI5 才處理響應式最終覆蓋抽屜與全站鍵盤；分析資訊抽屜必須使用 Playwright keyboard.press 驗證 Esc 關閉與焦點返回。
