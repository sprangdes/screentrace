# ADR 0042：R4 UI3 分頁、可見標籤與直接確認

## 決定
右欄分成操作／API／檢核／技術細節，原來源、規則、全部證據、候選與样式仍可到達。API 依 endpoint 去重並列出總次數與來源分類次數。正常確認不再重複標示，非確認信心仍顯示。操作列／動作晶片選取後展示詳情。按鈕三態直接點選圖示，沿用原 (screenId, componentId) 決策與儲存。

導覽標籤先用已產生的靜態預覽可見文字（包含已展開 jsp:doBody），再採原圖的 title/name/id/fallback；只改顯示投影，不更動 canonical graph 或 md。若同一共享元件的可見文字不一致，不把其中一個猜成全域名稱。所有插入的目標文字仍用 textContent。畫面右欄 URL 改回原始 {param} 樣板，與卡片／tooltip 一致。

## 逐處授權的斷言與操作變更
- `screentrace-viewer/test/api.e2e.mjs`／`API page shows three derived states, all caller groups, search/filter/sort and clickable jump/highlight`：每個 component-review 舊 selectOption/inputValue 改為按鈕 click/group data-decision；所有決策期望值、次數、暫存與匯出／匯入 byte 斷言不變。原因為 §4.4 更換控制項型態。
- `screentrace-viewer/test/md.e2e.mjs`／`${engine}: review mark/export/clear/import/export is byte-identical except timestamp and has no requests`：每個 component-review 舊 selectOption/inputValue 改為按鈕 click/group data-decision；所有決策期望值、次數、暫存與匯出／匯入 byte 斷言不變。原因為 §4.4 更換控制項型態。
- `screentrace-viewer/test/md.e2e.mjs`／`${engine}: changed analysis lists every orphan and preserves unknown composite IDs`：每個 component-review 舊 selectOption/inputValue 改為按鈕 click/group data-decision；所有決策期望值、次數、暫存與匯出／匯入 byte 斷言不變。原因為 §4.4 更換控制項型態。
- `screentrace-viewer/test/r4-shell.e2e.mjs`／`UI1 preserves inherited component filter and file-tree decisions`：每個 component-review 舊 selectOption/inputValue 改為按鈕 click/group data-decision；所有決策期望值、次數、暫存與匯出／匯入 byte 斷言不變。原因為 §4.4 更換控制項型態。
- `screentrace-viewer/test/review.e2e.mjs`／`review composite selections, inherited state, statistics, filtering, conflicts and local restore`：每個 component-review 舊 selectOption/inputValue 改為按鈕 click/group data-decision；所有決策期望值、次數、暫存與匯出／匯入 byte 斷言不變。原因為 §4.4 更換控制項型態。
- `screentrace-viewer/test/review.e2e.mjs`／`review mode marks button types from the preview and batches every button with visible totals`：每個 component-review 舊 selectOption/inputValue 改為按鈕 click/group data-decision；所有決策期望值、次數、暫存與匯出／匯入 byte 斷言不變。原因為 §4.4 更換控制項型態。
- `screentrace-viewer/test/synthetic-project.e2e.mjs`／`${engine}: ${family} source→CLI→offline report→review/library override→md→clear→restore`：每個 component-review 舊 selectOption/inputValue 改為按鈕 click/group data-decision；所有決策期望值、次數、暫存與匯出／匯入 byte 斷言不變。原因為 §4.4 更換控制項型態。
- `screentrace-viewer/test/wp16.e2e.mjs`／`WP16 chromium full requester flow: ${family}`：每個 component-review 舊 selectOption/inputValue 改為按鈕 click/group data-decision；所有決策期望值、次數、暫存與匯出／匯入 byte 斷言不變。原因為 §4.4 更換控制項型態。

- `details.e2e.mjs`／`focus links, tooltip overflow, back, API/behavior detail and all-element style clicks`：在原載入呼叫／API 選取前點 API tab；原 URL、來源行號、條件、所有元素樣式斷言原封保留。原因為資訊移到分頁。
- `details.e2e.mjs`／`screen panel includes standalone markup validation without a JavaScript behavior`：先選檢核 tab，required／MARKUP 原斷言保留。
- `details.e2e.mjs`／`screen information is readable by requesters and component details trace API/navigation`：舊預期正文不得有任何 `{`（當時 URL 用 :id）改為不得有 JSON 起始 `{`＋引號、source key／英文枚舉／parser；另須顯示 `/owners/{id}/edit`。原因：§4.4 明確要求 URL 使用大括號，這是 URL 顯示格式例外，JSON／內部枚舉／證據仍收合，並非開放預設工程資料。其他同名測試斷言不變。

## 驗證
新分頁測試在舊 UI2 HTML 失敗：tab 數 0、預期 4。改寫的正文 URL 測試亦在舊 UI2 HTML 失敗（舊 :id 不符合大括號）；詳見 R4 報告。機器契約、golden、分析證據、安全探針與共用 API 推導未更動。
- `diagnostics.e2e.mjs`／`navigation prioritizes page titles, groups Chinese diagnostics, and masks JSP expressions in preview`：在原技術明細 summary click 前選技術細節 tab；所有動態原文、來源、診斷與不執行斷言不變。
- `api.e2e.mjs`／`API rows summarize callers, filter by method and caller text, and jump to a highlighted caller`：舊 caller 文字「甲 › 查詢按鈕」（圖名稱）改為「甲 › 查詢」（fixture 可見文字），以確切換行界定名稱；原名稱搜尋仍支援，原 API 個數、方法、來源點回與 outline 斷言不變。原因為 §4.4 的可見文字優先序。

可見文字顯示投影使用 viewer 專用 displayLabel 提示，避免圖的 label 屬性覆蓋已確認的預覽文字；沒有可讀資訊時使用「類型＋序號」，不以目標 URL 當名稱。新增單元測試先在舊 label 實作失敗（find owners 而非 Find owners）。
