# ADR 0089：React 畫面的靜態重建預覽

## 背景

ADR 0088 讓 React 路由成為畫面，但靜態預覽只處理 JSP／HTML，React 畫面在報表中全部顯示「未取得重建預覽」。需求方已決定（2026-10-14）：採用靜態 JSX 重建，不啟動 Vite 或目標專案（C1）。

## 決定

- 預覽 HTML 由 ADR 0088 的同一個渲染展開產生（`screentrace-js/react/markup.mjs`），所以元件、條件與錨點和圖完全一致：
  - 原生元素輸出為 HTML；`className`、常值屬性與常值 `style` 物件保留。事件屬性、`dangerouslySetInnerHTML`、`script`／`style`／`iframe` 等元素、`src`／`srcdoc`／`action` 一律不輸出；文字與屬性值全部跳脫。
  - 無法證明的文字顯示「示例值」（與 JSP 預覽相同）。`className` 取最短、完全可證明的候選，也就是一般狀態。
  - 條件無法判定時，兩個分支的元件都記錄到圖上；預覽 HTML 只放 `else`／fall-through 分支，該分支沒有內容時才改放條件分支。只在條件下出現的對話框預設關閉：隱藏的是包住它、在同一條件下渲染的整個區塊（固定定位圖層、背景遮罩與同條件的兄弟元素），不只是標記為 dialog 的元素，並以 `data-st-condition` 保留條件原文。
  - 可操作元素帶 `data-st-expansion-anchor`，值與圖上元件的 `expansionAnchor` 相同。錨點為渲染路徑上各元素的 `檔案:行號`，同一行有多個元素時加上 `#序號`，`.map` 展開的項目加上 `[i]`，所以在單一畫面內唯一。
- CLI 在 capture 前呼叫 `ReactGraphContribution.writePreview`，寫出 `static-preview/react-preview.json`（各畫面 markup 與入口模組 import 的 CSS 清單）。capture 的 `react-preview.mjs` 只複製專案內存在的 CSS 與其相對 `url()` 資源，不下載、不讀取專案外檔案；缺少的套件樣式記錄 `REACT_STYLESHEET_MISSING`。之後沿用既有的 Chromium（JavaScript 關閉）截圖、元素樣式與 pack-preview 流程。
- 檢視器：預覽框高度在有 capture 量測值時直接採用，不再依內容反覆量測。以 `vh`／`dvh` 設定最小高度的頁面會因 iframe 變高而跟著變高，原本的量測永遠不會收斂（reservio 登入頁的 iframe 曾長到 115,752px）。畫面名稱忽略含「示例值」的標題提示。
- 共用於所有路由的 shell 元件（`<Routes>` 外的全域元件）只有一個元件節點，由每個畫面 CONTAINS，行為只記錄一次。

- 畫面命名：React 畫面元件只取路由元素內的元件，不取 `<Routes>` 外的 Provider。路由本身沒有渲染任何元素、只有 `<Navigate>` 時，SCREEN 加上 `redirectTargets`（目標畫面 ID，畫面元件自己寫的轉址在前），檢視器顯示為「轉址到「X」」，萬用路由為「其他網址轉址到「X」」。檢視器對 2～5 個畫面共用的標題保留標題並加網址，超過 5 個視為版型標題，沿用原本的後備名稱（JSP 同樣適用）。

## 影響

- Graph schema 不變。
- reservio 實測：33 個畫面全部重建，949 個預覽元素都以錨點唯一對應到元件。
- 限制：CSS Modules、CSS-in-JS、以 JavaScript 產生的內容不會出現在預覽；圖片 `src` 不輸出；以 `vh` 撐高、內部捲動的版面只顯示第一個視窗高度。
