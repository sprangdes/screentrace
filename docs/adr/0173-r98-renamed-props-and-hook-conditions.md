# ADR 0173：R98 改名解構的 props、Context 值與自訂 hook 的條件

## 背景

R91（[ADR 0168](0168-r91-screen-facts-through-props.md)）讓畫面事實經由「同名解構的 prop」與「條件常數」決定條件，但改名解構（`{ isCustomer: customer }`）、由 Context 提供的推導值（`const { isCustomer } = useAuth()`，provider 的 value 為 `{ isCustomer: me?.role === … }`）與回傳條件的自訂 hook（`const admin = useIsAdmin()`）仍判斷不出來。

## 決定

- 評估器的解構綁定多保存 `steps`（解構路徑）；`factText` 對解構 prop 依原屬性名取父元件傳入的屬性。
- `factText` 新增 `hookCondition`：
  - `const { key } = 呼叫()`：呼叫的值評估為物件字面值（例如 Context provider 的 value）且 `key` 屬性只由讀取與比較組成（非簡寫屬性）時，換成該屬性的運算式，在物件所在的範圍內繼續展開。
  - `const x = 呼叫()`：被呼叫的函式沒有參數、函式本體最後一個敘述是唯一的 `return 條件` 且條件只由讀取與比較組成時，換成該條件，在函式範圍內繼續展開。
- 只在 R91 的「事實決定條件」路徑使用，展不開時行為與以前相同。

## 測試

- JS `r98-hook-conditions.test`（1）。既有 JS、capture、Maven 測試不需修改。

## 後果

- reservio 的畫面、元件、導覽數與角色結果不變（reservio 沒有這三種寫法）。
- 有多個敘述或參數的 hook、在 provider 中以函式計算的值仍無法展開。
