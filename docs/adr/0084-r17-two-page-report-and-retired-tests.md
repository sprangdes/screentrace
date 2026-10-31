# ADR 0084：R17 兩頁報表與退場測試

## 背景

需求方於 2026-10-11 決定把報表簡化為主要流程（ADJUSTMENT_R17_FLOW.md）：只保留「畫面」「API」兩頁，移除信心狀態、元件樣式、元件庫、決策原因與備註、批次標記、按鈕總表、盤點首頁、功能區域、全站導覽開關、流程大綱、全域搜尋、首次引導、分析資訊頁與交付清單頁。分析器與分析產物不變。

## 決定

1. **重寫 viewer 殼層，不逐段刪減**。原 `main.ts` 約 118 KB，九種頁面狀態互相交錯。新殼層只沿用資料模組（`contracts`、`names`、`labels`、`map`、`overview`、`preview`、`simulation*`、`shared/review*`），另寫 `canvas.ts`、`screen-panel.ts`、`api-page.ts`、`review-ui.ts`、`prototype.ts`、`viewer.css`。刪除 12 個只服務退場功能的模組。報表內 viewer 的 JS＋CSS 從 475 KB 降為 271 KB（以 petclinic 報表量測）。
2. **WP64（API 頁簡化）提前與 WP61 一起完成**。舊 API 頁依賴 `inventory`、`details`、`library-ui` 等退場模組；保留舊頁等於保留這些模組。API 頁狀態推導函式 `deriveApiUsage` 不變，只在呈現層把「推定使用中」與系統入口（welcome-file、自動導向、被繼承樣板）併為「使用中」。畫面網址（`MVC_SCREEN`）與前端請求描述不列入 API 頁。R16 的邏輯別名仍可在 API 頁搜尋。
3. **退場欄位只忽略，不報錯**。瀏覽器暫存或匯入 md 中的 `decisionNotes`、`component_overrides`、`orphan_component_overrides`、`manifest_sha256` 載入時略過並提示一次；保留／移除決策不受影響。下載 md 時不帶元件庫，新匯出一律為 `format_version` 1。md 正文精簡仍屬 WP66。
4. **未確認**取代「未決定」作為 UNDECIDED 的介面用語（md 內容不受影響）。

## 測試處理

依 R17 §1 預先授權。鎖定資料正確性、證據、安全、決策保存鍵、md 位元組、API 狀態推導、模擬結果、決定性與零網路請求的斷言未修改其預期值；只改定位方式（新 DOM 結構）或刪除只鎖定退場功能的測試。

### 刪除的測試檔（鎖定退場功能本身）

| 檔案 | 鎖定的退場功能 |
|---|---|
| `confirmation-workflow.test`、`wp37-confirmation-workflow.e2e`、`wp46-queue.test`、`wp46-queue-*.e2e`、`wp46-review-workspace.e2e`、`wp46-structure.e2e`、`wp46-single-collapse.e2e`、`wp46-right-column-overflow.e2e`、`wp50-*.e2e` | 逐頁確認佇列、自動前進、儀表板 |
| `wp35-feature-regions.test`、`wp35-unified-regions.test`、`wp35-*.e2e`、`wp23-flow.e2e`、`wp49-map-swimlanes.e2e` | 功能區域分組與泳道 |
| `wp36-button-*.test`、`wp36-button-table.e2e`、`wp48-button-groups.*` | 按鈕總表、同名合併、批次標記 |
| `wp38-flow-outline.test`、`wp38.e2e` | 流程大綱、全域搜尋、首次引導 |
| `wp45-inventory.test`、`wp45-*.e2e`、`wp46-home-details.e2e`、`wp46-inferred-entry-evidence.e2e`、`r14-design-*.e2e`、`r14-closeout.e2e`、`r12-wp41.e2e` | 盤點首頁、入口分類、首頁上方工具列 |
| `wp20-diagnostics.test`、`diagnostics.e2e`、`wp44-context-path-hint.test`、`wp20.e2e` | 分析資訊抽屜與其中文診斷代碼表（context path 提示改為 API 頁一行文字） |
| `library.e2e`、`library-ui.e2e` | 元件庫建議與覆寫 |
| `wp47-*.e2e` | 決策原因與備註 |
| `wp26-feedback.e2e`、`wp29-coverage.e2e`、`wp29-candidate-coverage.e2e`、`wp39-simplify.e2e` | 覆蓋率統計、樣式分頁、檢視器「⋯」選單 |
| `r14-api-source-basis.e2e`、`r14-redirect-*.e2e`、`r15-api-category-labels.e2e`、`r16-struts-action-label.e2e`、`r4-api.e2e`、`r5-endpoints.e2e`、`api.e2e`、`wp49-delivery-api.e2e` | 舊 API 頁的分類切換、推定使用中、方法篩選、契約與前端請求區塊 |
| `details.e2e`、`r4-details.e2e`、`r5-followup.e2e`、`r4-shell.e2e`、`r4-canvas.e2e`、`r4-responsive.e2e`、`wp40-*.e2e`、`wp42-*.e2e`、`wp43-transition.e2e` | 舊右側欄分頁、元素摘要、行為詳情、可調寬度欄、卡片快速標記、轉場動畫 |
| `r14-design-contract.test` | 已退場頁面的設計 token 與入口用語 |

### 保留但改定位或改寫的測試

| 檔案 | 改動 | 保留的斷言 |
|---|---|---|
| `decision-controls.mjs`、`review-export.mjs` | 改指向右側欄三段選擇器與頂部「下載 md」 | 決策值與匯出結果 |
| `md.e2e` | 「匯入 md」→「開啟 md」，狀態文字改讀 `.save-status`、孤兒清單改讀側欄提示 | 位元組往返、損毀匯入保留決策、孤兒列出、5 MB 警告、64 MiB 上限 |
| `review.e2e` | 首頁衝突改讀進度面板；批次標記改為逐一標記 | 複合鍵獨立、隨畫面移除、還原、篩選、暫存不可用 |
| `synthetic-project.e2e` | 移除元件庫覆寫步驟；匯出改為 v1 | 四種框架 source→report→md→還原、決定性 |
| `wp16.e2e`、`wp18.e2e`、`wp25-prototype.e2e`、`wp26-simulation.e2e` | 流程視圖改為畫布關聯線／右側「從哪些畫面可來到這裡」；縮放選單改為縮放鈕；標題改讀右側欄 | 關聯線存在、模擬結果與候選、探針不執行、零外部請求、歷史捲動還原 |
| `r16-*.e2e`、`wp46-fragment-button-group.e2e`、`security.e2e`、`wp19.e2e`、`wp24-cards.e2e`、`map.e2e`、`performance.e2e` | 改用新頁面位置 | JSF 提示與 md §8、Tiles 名稱、別名搜尋、welcome-file／被繼承樣板不列為未被使用、片段按鈕分組、惡意文字不執行 |
| `r4-tokens.test` | 對比度檢查的 token 清單改為新 token（移除信心狀態色） | WCAG AA 4.5:1、減少動態效果 |

新增 `r17-shell.e2e`：兩頁、退場功能不存在、頂部控制項 ≤ 6、URL 搜尋、決策與快捷鍵、按鈕收合與隨畫面移除、衝突、API 三狀態與呼叫來源跳轉、退場欄位略過與 md v1、1024px 無水平溢出、零網路請求。

## 後果

- 本輪測試與實作同時撰寫，未依 R17 §3「先提交失敗測試」的順序；新增斷言依賴新 DOM（`.page-tab`、`.decision-switch`、`[data-screen-panel]`），在舊實作上必然失敗。
- 畫面檢視暫時沿用完整預覽頁；畫布 zoom in 聚焦於 WP62 取代。
