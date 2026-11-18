# ADR 0180：R105 程式拿來比對代碼字的欄位也是狀態

## 背景

R97 把字串或數字存放的狀態列入資料狀態，但只認名稱以 status、state、stage、phase 結尾的欄位。`payment`、`review`、`approval` 這類名稱不同、用途相同的欄位會漏掉。

## 決定

- 讀取專案時收集「拿來和代碼字比對的欄位」：`"PAID".equals(o.getPayment())`、`o.getPayment().equalsIgnoreCase("paid")`、`switch (o.review) { case "pending_review" -> … }`。代碼字指 `[A-Z][A-Z0-9_]*` 或 `[a-z][a-z0-9_]*`（`PAID`、`paid`、`pending_review`）。
- 名稱不像狀態的欄位，只有同時符合兩點才列為文字狀態：(1) 欄位在專案中被拿來和代碼字比對；(2) 這次寫入的值本身是代碼字（字串常值，或內容為字串常值的 `static final` 常數）。數字常值不算，避免把計數、數量當成狀態。
- 名稱像狀態的欄位維持 R97 的規則。原狀態推論、前端中文對照與 viewer 呈現都沿用 R94～R97，不另外處理。
- 欄位以名稱比對，不分所屬類別：A 類別比對 `type`、B 類別寫入 `setType("X")` 時，B 的寫入也會列入。這是已知的過度列入；能判定寫入對象型別時，狀態名稱是「`型別.欄位`」，可由此辨認。

## 測試

- `R97TextStatesTest` 新增 1 個：被比對的 `payment`、`review` 列為狀態並推得原狀態；寫入代碼字但從未被比對的 `name`，以及寫入一般文字的 `note`，都不列入。既有斷言不變。

## 後果

- reservio 的狀態都用列舉，結果不變。
