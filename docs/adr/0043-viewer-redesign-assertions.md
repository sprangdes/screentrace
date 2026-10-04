# ADR 0043：R4 UI4 API 主從清單

## 決定與後果
以原生 TypeScript＋內嵌 CSS 呈現可選取 API 清單，方法／狀態徽章單行，完整路徑以 tooltip 可讀。處理器、契約、檢核與原呼叫來源移至右欄，依畫面分組；維持前 3 筆與可展開的其餘來源，來源均可點回畫面及高亮元件。同路徑端點顯示處理器名稱區別。原五種排序仍可於排序區展開，方法、狀態、完整處理器／來源名稱搜尋保留。限制說明成為資訊 tooltip＋首次可關閉提示。

不改 API 狀態推導或 callers 資料；確認模式切換留在 API 頁，以相同原 review state 重算。人工驗收前的新增回歸測試發現 1024 聚焦的中央預覽初始在可視範圍外；改為聚焦圖內捲動容器初始置中，無改關聯或來源。UI5 再處理右側抽屜等最終響應式。

## 逐處授權的測試變更

- `api.e2e.mjs`／`API page shows three derived states, all caller groups, search/filter/sort and clickable jump/highlight`：狀態 selectOption(UNREFERENCED／ALL) 改為對應狀態晶片 click；排序前展開排序區。原 3 列、狀態、2／0 來源數、限制文字、查詢、排序結果、caller 跳回高亮、REMOVE 繼承推導等斷言不變。原因：§4.5 控制項型態／位置取代。
- `api.e2e.mjs`／`API rows summarize callers, filter by method and caller text, and jump to a highlighted caller`：caller 摘要由 row 移到選取後 aside，先點 API 列；跳轉亦從 aside 的同來源按鈕操作。名稱「甲 › 查詢」仍精確驗證，以行末或緊接的來源分隔「 ·」界定（沒有來源時仍為行末；現行來源使用 inline，保留未解析來源的原單行斷言）。搜尋原圖名稱、方法篩選、個數、跳轉與 outline 原斷言不變。
- `api.e2e.mjs`／`API caller summary shows only three inline and expands every additional caller`：先選 API，row 作用域改為 aside，原 3／6 可見 caller、展開操作與「操作3」斷言不變。原因：來源移到主從右欄，未減少資料。
- `wp20.e2e.mjs`／`WP20 API callers occupy independent rows with screen and readable operation labels`：先選 API；links 作用域從 API row 改為 aside。原數量 3、3 個不同 y、每筆可讀「 › Home」斷言不變。

## 舊實作失敗證明
新 UI4 主從測試在保存 UI3 報表上失敗：仍有 1 個表格，預期 0；分組 caller selector 不存在。改寫的 caller 展開測試另於保存 UI3 報表執行，aside 的 data-api-caller 為 0（預期 3）。詳見 R4 報告。其他資料、證據、安全／不洩漏、md 往返與 golden 均不變。

## 實測發現的預覽路徑相容
capture 的 `body>a[1]` 與 viewer fixture 的 `html:nth-of-type(1)>…` 原本格式不同，使實際已有 graphComponentId 的元件無法從靜態 DOM 取可見文字、點預覽查看樣式或 caller 跳轉高亮。新增合成失敗測試後，viewer 僅把 tag[n] 路徑轉成等義的 CSS nth-of-type，沿用已有精確 record，不新增或猜測 component ID。所有原預覽、安全與證據斷言保持。沒有對應 ID 的 tag-body 名稱仍依 OQ-015 暫停。

三態控制項的呈現順序固定為保留／移除／未確認（元件圖示為勾／叉／問號）；不修改 shared 決策列舉或 md 排序。聚焦 hit path 保留較寬的透明操作區，只有 1.5px visible path 顯示高亮；兩端卡片強調，其餘 25% 淡化。兩項新增測試先在原控制項／hover 實作失敗再修正。
