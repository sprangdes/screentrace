# ADR 0176：R101 由狀態 switch 分派的步驟與狀態轉換清單

## 背景

R94（[ADR 0169](0169-r94-prior-state.md)）只在寫入所在的方法內推論原狀態。reservio 的 LINE 對話由 `handleMessage` 以 `switch (conversation.getState())` 把每個狀態分派給一個私有方法（`case SELECTING_SERVICE -> selectService(…)`），寫入在被呼叫的方法裡，所以步驟之間的關係看不出來。

## 決定

- **呼叫端推論**：寫入所在的方法是 `private`、方法內的條件推不出原狀態時，找同類別中所有呼叫它的地方（參數數目相同、沒有物件或為 `this`）；每個呼叫點都在狀態 `switch`（敘述或運算式）的分支、或狀態比較的 `if` 分支內時，原狀態為各呼叫點的聯集；任一呼叫點推不出就放棄。呼叫點的狀態讀取不要求同一個變數名稱（各方法的參數名不同），只往上一層。
- `switch` 運算式（`var x = switch (…) { case A -> … }`）與 `switch` 敘述同樣處理。
- **viewer**：狀態詳情新增「狀態轉換（推測）」，依值的宣告順序列出「原狀態 → 新狀態」與造成轉換的 API／作業；新建立的物件寫成「新建立 → …」。說明沒有列出的轉換只是推不出，不代表不會發生。狀態詳情的說明句改為 R95 之後的寫法。

## 測試

- Java `R94PriorStateTest` 新增 1 個（R101）；viewer `r82-states.test` 新增 1 個。

## 後果

- reservio LINE 對話：選服務 → 輸入日期、輸入姓名 → 輸入電話／確認、輸入電話 → 確認、選日期 → 選時段等轉換可見。`selectTime` 同時被狀態 switch 與按鈕動作的 switch 呼叫，仍推不出原狀態。
