# ADR 0160：R82 資料狀態變更（誰把哪個列舉狀態設成什麼）

## 背景

[reservio 評估（2026-11-18）](../RESERVIO_EVALUATION_20261118.md) P2：預約有待確認、已確認、申請取消、已取消、已完成五種狀態，顧客取消要經商家確認、結束後自動完成；LINE 聊天預約的每一步（選服務、日期、時段、姓名、電話、確認）也是對話狀態。這些規則在報表中只能從零散按鈕推測。需求方於 2026-11-18 決定（OQ-056）：只列「誰把狀態設成什麼」，不推論原本的狀態；前端有對照文字時並列中文，找不到或彼此矛盾時只顯示常數名。

## 決定

### Java

- `BackendCallChains`（ADR 0156）追蹤時順帶記錄每個走到的方法（含處理程式本身與同類別的輔助方法）中的列舉值寫入，結果寫入 HANDLER 的 `stateChanges` attribute（JSON）並加一筆 `StateChanges` evidence；沿用呼叫鏈的深度上限，schema 不變。寫入只認三種寫法：
  - setter：`x.setStatus(值)`，欄位名為去掉 `set` 後首字小寫；
  - builder：呼叫鏈上有 `builder()`／`toBuilder()` 的 `.status(值)`，欄位名為方法名；
  - 欄位指定：`x.status = 值`。
- 「值」必須是專案列舉的常數：`Status.DONE`，或以 static import（單一或 `*`）引入的 `DONE`。兩個同一列舉常數的條件運算式記兩筆 INFERRED 並附條件原文；參數或區域變數宣告為專案列舉型別時記一筆不含值的 UNRESOLVED（「值由變數 x 決定」）。把常數傳給查詢方法（`findByStatus(CONFIRMED)`）不是寫入。同名列舉不只一個時不記錄。
- 每筆 JSON：`depth`（0 為處理程式本身）、`in`（`類別#方法`）、`enum`、`field`、`value`（可缺）、`values`（該列舉全部常數，宣告順序）、`labels`、`label`、`labelSource`、`resolution`、`reason`、`source`。
- 中文對照（`StateLabels`）：有狀態寫入時才以 `screentrace-js` 的 `state-labels` 模式掃描前端原始碼（與 React 分析同一組檔案）。AST 只擷取三種字面寫法：以常數為鍵的物件（值為字串，或含 `label`／`text`／`name`／`title` 的物件）、`{ value, label }` 陣列、同一個 `<select>` 的 `<option>`；只有含非 ASCII 字元的文字算對照文字，排除圖示名稱與 CSS class。一組對照的鍵至少兩個、且至少一半是某個列舉的常數，並且只符合一個列舉時才歸給它；同一常數在所有對照中文字都一致才採用，否則保留常數名。AST 工具無法執行時不顯示中文。

### viewer 與 md

- `shared/states.ts` 的 `stateTypes(graph)` 依列舉彙整：常數依宣告順序，每個值列出設定它的處理程式、其 API（`HANDLED_BY`）或系統作業；值無法確定的寫入另列。
- API 頁在系統自動作業之後新增「資料狀態」分組：每列一個列舉，詳情列出各值（中文（常數））與設定它的 API／作業按鈕（點了跳到該 API／作業）、沒有人設定的值、無法確定的寫入。API 與系統作業的詳情新增「會改變的資料狀態」，可跳回狀態詳情。只在「全部」篩選與搜尋時顯示，不計入 API 數量與狀態推導。
- md 新增 §13 資料狀態變更（所有版本；沒有寫入時寫「未偵測到列舉狀態的寫入。」），欄位：狀態類型、欄位、設為、前端文字、由誰、在哪個方法、解析、來源。format_version 不變。

## 測試

- Java `R82StateChangesTest`（4）：setter／builder／指定／條件、查詢不算寫入、變數為 UNRESOLVED、前端對照一致才採用、同時符合兩個列舉的對照不採用。
- JS `r82-state-labels.test`（1）。
- viewer `r82-states.test`（2）、`r82-states.e2e`（1）。
- 修改的既有斷言：三份 md golden 在附錄 A 前多出 §13，刪去後與 R81 的 golden 逐位元組相同；`wp40-md-decision-equivalence` 雜湊更新，刪去 §13 後等於 R81 的值。R81 自己的 `r81-jobs.test` 改為 §12 之後接 §13。

## 後果

- 只看專案列舉；以字串或整數表示的狀態、經由區域變數物件以外的路徑（反射、ORM 回呼、資料庫觸發器）不會出現。
- 深度上限之後的方法不掃描。條件式狀態轉換（「只有待確認才能確認」）不推論，md 明言 AI 不得自行補上。
- 前端各處用語不同（reservio 的 PENDING：「待確認」與「等待店家確認」）時不顯示中文，避免選錯。
