# ADR 0060：WP40 常駐決策介面與送出按鈕選取

## 背景

WP40 將決策介面改為隨時可用，並保留原有 review state、複合鍵、匯入匯出格式及模擬結果。WP39 的提交按鈕點擊會先選取按鈕，接著送出處理再次選取所屬表單，令右側欄顯示表單而非使用者實際點選的按鈕。

## 舊實作失敗證明

在 WP39 舊實作、尚未變更產品程式碼時執行 node --test screentrace-viewer/test/wp40-always-on-decisions.e2e.mjs：

- WP40 decisions stay available without a mode and synchronize across overview and focused viewer：失敗。頁面仍有 1 個「確認模式」核取方塊，預期為 0。
- submit click keeps the clicked button selected and includes its owning form summary：失敗。送出後右側摘要仍顯示「標籤：送出表單」，預期顯示被點擊的「Find Owner」按鈕及「所屬表單」。

## 決定

1. 移除模式開關；進度、篩選、三態決策、統計、衝突提示與說明固定可用。未確認畫面不顯示狀態圖示，卡片只在已有決策時顯示狀態色條及圖示。
2. 卡片、畫面標題、右欄元件摘要、畫面清單及按鈕總表都直接寫入既有 review state。鍵盤與觸控操作沿用相同決策更新函式。
3. 提交按鈕點擊後以實際按鈕作為選取目標；右欄在按鈕摘要下顯示所屬表單。表單本身的模擬與結果不變。

## 後果

UI 直接呈現決策狀態與操作入口；未確認項目保持無標記。所有介面仍共用原 review state，md 格式、決策鍵及模擬規則不變。
