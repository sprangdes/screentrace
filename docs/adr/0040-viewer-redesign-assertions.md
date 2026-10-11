# ADR 0040：R4 UI1 外殼與被取代的呈現斷言

日期：2026-10-04。狀態：採用。依 ADJUSTMENT_R4_UI §0 預先授權。只完成 UI1，等待外觀驗收後才進 UI2。

## 決定

系統字型、內嵌 SVG sprite、CSS 色彩與間距變數；主要文字／背景以測試計算 AA 對比。頂部 56px 導覽與全域動作，左側搜尋／地圖或檔案結構／畫面清單，右側空狀態引導。診斷及元件庫整份移至本地 dialog 抽屜，未移除任一資料。review checkbox 樣式化為 switch，保持既有狀態與事件；篩選顯示四種晶片與原統計數量，既有決策 select 留待 UI2／UI3。md input 隱藏並用按鈕觸發，內容解析與還原規則不變。

## 既有測試變動逐處紀錄

| 測試 | 舊預期／操作 | 新預期／操作 | 理由 |
|---|---|---|---|
| diagnostics: graph and preview diagnostics retain source and unsafe text without execution | 直接點左欄診斷 | 先開分析資訊，再點原診斷明細 | 資料移到抽屜，訊息／英文／行號與腳本不執行斷言原文不變 |
| diagnostics: navigation prioritizes page titles…（畫面按鈕） | nav 內有畫面按鈕 | topbar 內有畫面按鈕 | 主導覽移到頂部 |
| 同測試（第一個按鈕） | nav 第一按鈕文字含畫面 | nav 有地圖按鈕 | 左欄改脈絡檢視，不再承擔主要畫面/API 導覽 |
| 同測試（元件庫位置兩處） | nav 有 1 個預設收合的 library-summary | 分析資訊抽屜有 1 個預設收合的 library-summary | 摘要整份移動，數量／收合斷言不降低 |
| 同測試（診斷位置） | nav 中診斷摘要數量、中文及 web/a.jsp:4 | 抽屜中同樣數量、中文及 web/a.jsp:4 | 只改定位，資料斷言原文不變；選畫面前關抽屜 |
| WP20 diagnostics wrap Chinese summaries… | shell nav scrollWidth ≤ clientWidth | information-drawer scrollWidth ≤ clientWidth | 診斷的承載面板更換；完整來源行號斷言不變 |
| api / library / map / md / review / wp16 / wp18 E2E 中回總覽操作 | 點總覽按鈕 | 點地圖按鈕 | 左側地圖／檔案結構 segmented 取代總覽；原決策、往返與證據斷言不變 |

review composite selections… 的篩選操作由 combobox KEEP 改點「保留 0」晶片；原零卡片斷言不變。

未更動 fixture／golden，沒有修改資料、安全、決定性、API 推導或 md 還原斷言。800px 既有版面檢查仍保留；最終響應式抽屜與完整窄螢幕驗收屬 UI5。

## 舊實作反證

舊 R3 已建置的 HTML 上先執行初版 UI1 三項 E2E，全失敗：缺少頂部導覽、資訊抽屜與搜尋快捷鍵。更新後的既有結構定位也在舊 HTML 執行，結果見 reports/R4.md。這些失敗不涉及放寬資料斷言。

## 回總覽操作逐測試名稱

下列只把被取代的「總覽」控制項操作改成「地圖」；原有結果斷言全部保留：

- api.e2e.mjs：`API page shows three derived states, all caller groups, search/filter/sort and clickable jump/highlight`；舊操作「總覽」，新操作「地圖」，理由為左側檢視控制項取代。
- library.e2e.mjs：`${engine}: library details, KEEP-only composite override and reversible A/B/A`；舊操作「總覽」，新操作「地圖」，理由為左側檢視控制項取代。
- map.e2e.mjs：`file overview, file tree, actual URL matching and keyboard zoom`；舊操作「總覽」，新操作「地圖」，理由為左側檢視控制項取代。
- md.e2e.mjs：`${engine}: review mark/export/clear/import/export is byte-identical except timestamp and has no requests`；舊操作「總覽」，新操作「地圖」，理由為左側檢視控制項取代。
- review.e2e.mjs：`review composite selections, inherited state, statistics, filtering, conflicts and local restore`；舊操作「總覽」，新操作「地圖」，理由為左側檢視控制項取代。
- review.e2e.mjs：`review mode marks button types from the preview and batches every button with visible totals`；舊操作「總覽」，新操作「地圖」，理由為左側檢視控制項取代。
- wp16.e2e.mjs：`WP16 chromium full requester flow: ${family}`；舊操作「總覽」，新操作「地圖」，理由為左側檢視控制項取代。

四種主要狀態晶片外，原 INHERITED_REMOVE 篩選以統計中的「隨畫面移除」保留；檔案樹內的畫面決策入口也保留，新增回歸測試防止功能消失。

最終五項新外殼測試另以保留的舊 R3 HTML 重跑，5 項全失敗；新版全部通過。更新既有結構定位的 6 項測試在舊版有 3 項失敗，資料／安全檢查沒有被放寬。詳細計數見 R4 報告。
