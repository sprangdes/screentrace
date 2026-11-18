# ADR 0162：R84 預覽預設只顯示「有資料」狀態，可切換載入中／錯誤／沒有資料

## 背景

[reservio 評估（2026-11-18）](../RESERVIO_EVALUATION_20261118.md) P4：React 畫面的條件無法確定時，`cond && <X/>` 會全部畫出，例如建立預約第 1 步同時出現載入骨架、「暫時無法載入」、「目前沒有可用的預約店家」與店家清單，非工程師會以為畫面壞了。（三元運算 `a ? X : Y` 原本就只畫一個分支。）需求方於 2026-11-18 決定（OQ-057）：預設只顯示有資料的狀態，工具列可切換。

## 決定

- **分類**（`screentrace-js/react/page-states.mjs`）：每個元素渲染時的條件（guard 原文）以 `@babel/parser` 解析，只認下列形狀：
  - 載入中：名稱為 `loading`、`isLoading`、`fetching`、以 `loading` 結尾的旗標；`!loaded`、`!ready`、`!initialized`；
  - 錯誤：名稱含 `error`，或為 `failed`／`failure`／`loadFailed`；
  - 沒有資料：`x.length === 0`、`x.length < 1`、`!x.length`、名稱含 `empty`；
  - `status === 'loading' | 'error' | 'failed' | 'empty'`（左右皆可）。
  - `!loading`、`!error` 是有資料狀態；`&&` 串接時依載入中、錯誤、沒有資料的順序取第一個。其他條件（角色、選項、數量大於 0）不分類，不會被隱藏。
- **標記**：分類結果與父元素不同時，在該元素輸出 `data-st-state="loading|error|empty"`，子元素不重複標記。
- **截圖與預覽**：capture 在 React 預覽的 `<head>` 加入 `html:not([data-st-show-state]) [data-st-state]{display:none!important}` 與三條「只顯示所選狀態」的規則；截圖因此只有有資料狀態。viewer 在預覽工具列加「畫面狀態」切換（有資料／載入中／發生錯誤／沒有資料，只列畫面中有的狀態），以 `<html data-st-show-state>` 切換；沒有標記的畫面不顯示切換。
- 只套用 React 預覽；JSP 的 `c:if` 仍由「標示示範內容」標出。

## 測試

- JS `r84-page-states.test`（2）：各形狀的分類與不分類、標記只在最外層。
- viewer `r84-page-states.e2e`（1）。既有 JS、capture、viewer、Maven 測試不需修改。

## 後果

- 分類依名稱與形狀，不是執行結果；命名不同的狀態（例如 `status === 'busy'`）不會被辨識，仍會疊在一起。表單檢核訊息（`errors.email && …`）屬於「錯誤」，預設也會隱藏。
- 被隱藏的元素在截圖中沒有位置，預覽中點不到；切到對應狀態即可看到。
