# ADR 0018：完整重建預覽與去重樣式契約

- 日期：2026-10-03
- 狀態：採用；WP6

## 決定

正式 CLI 使用 capture 的 `--preview-v2`，僅接收 schema 2.2；Java 讀取入口再以 GraphIntegrityValidator 嚴格驗證。Playwright 1.55.1 已有相依不變，不新增套件。舊 capture 預設入口與舊 Preview 建構子維持相容，與舊 ReportGenerator 依 OQ-006 於 WP7 移除；不遷移其既有 fixture 或斷言。

`element-styles.mjs` 在關閉目標 JavaScript 的 context 中，以工具自有 inspector 擷取 html、body、body 下全部元素，排除 head、script、style 內容。路徑以同標籤兄弟的 1-based 次序組成，保留隱藏元素、雙精度 bounds、前 80 Unicode 字元及來源。與同 namespace／標籤、同 viewport 的空白 Chromium 預設元素比較所有 computed CSS 屬性，包括 custom properties。只存差異；排序後的差異 JSON 以 SHA-256 作 styleId；全域 styles 去重，defaults 保留往返所需的完整基準。

DOM 加入工具保留的 source 與 component metadata，原始碼同名屬性會移除。先以 core StableGraphIds 的 UTF-16 長度前綴／UTF-8 UUID-v3 演算法重建同類出現序並核對既有圖 ID，處理同一行匿名元件；再以 id、name、field、來源檔案／行號／標籤對應。未能唯一證明的候選全部保留為 AMBIGUOUS，不能因前一個歧義而消耗候選；無配對者為 UNRESOLVED，元素樣式仍保留。這些預覽解析標記不變更圖的 evidence 或信心。

`preview-markup.mjs` 以 quote-aware token scanner 處理 markup，raw script/style 與註解不能偽造條件。所有 c:if／c:choose 分支保留，data-st-condition 包含原始條件與 otherwise 的否定語意；EL 的括號／引號與 scriptlet 原文以詞彙掃描保留。範例值經 HTML attribute/text escaping；只產生重建畫面，不執行 JSP、Java 或 JS。本地 tagdir 僅採 JSP 宣告，include 與資源沿用安全讀寫、循環／深度限制。

## 契約與限制

`static-preview/element-styles.json` version 2／schemaVersion 2.2 含 screens、styles、defaults、diagnostics。Java PreviewModel version 2 增加完整 elements、styles、defaults、diagnostics；每個 screen 增加 rendering、dynamicExpressions、thumbnail、diagnostics。元素 DOM 次序保留；字典以明確鍵排序並不可變。

每畫面軟警告門檻預設 50,000 元素／16 MiB 去重樣式，可用 `--style-element-limit=N`／`--style-byte-limit=N` 設定。超量完整保存並產生 STYLE_ELEMENT_LIMIT／STYLE_BYTE_LIMIT，舊檢視器以 textContent 顯示診斷；不切掉樣式或畫面。安全硬限制沿用既有來源 8 MiB／資源總量與安全路徑規則；Java 預覽檔讀取沿用 32 MiB 硬限制，超過會明確失敗，不輸出偽完整的資料。

截圖沿用 4096×16384／16,000,000 pixels 安全上限；裁切時新增 SCREENSHOT_DIMENSION_LIMIT，完整元素／樣式仍保存。縮圖為工具頁面縮放截圖產生的 PNG data URI，寬度最多 320；Java 入口驗證 PNG header 與尺寸。缺少來源或捕捉失敗標 skipped 與診斷，不宣稱已重建。

舊檢視器僅增加必要的重建橫幅「示意畫面:動態資料為範例值」、診斷及元素資訊，供查看每個元素的條件與還原 computed style；單檔 HTML、資料注入、CSP 雜湊、畫布與 review 重構仍屬 WP7。

## 證據

新增 capture 整合／markup 測試涵蓋所有元素、樣式完整往返／去重、隱藏元素、來源序、多候選、條件分支、EL 原文、容量診斷、320px 縮圖、位元組一致、HTML／本地 taglib／include 與網路副作用探針（0 次）。Java 測試涵蓋嚴格 schema、完整 Preview 契約、dangling style 拒絕、報表診斷與條件、正式 CLI 選擇新 capture。所有既有斷言不變。
