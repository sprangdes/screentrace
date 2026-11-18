# ADR 0168：R91 畫面的身分事實經由 props 與條件常數決定條件

## 背景

R83（[ADR 0161](0161-r83-literal-alternatives-and-wrapped-labels.md)）後，reservio 訪客首頁仍顯示「示例值」連結與「登出」，按鈕寫成「前往預約 / 開始預約」。這個畫面變體的事實是「未登入」（`me` 為否），但條件是 `isCustomer`：由 `const isCustomer = me?.role === 'ROLE_USER'` 算出，再以 `<Header isCustomer={isCustomer}/>` 傳給子元件，子元件解構 `({ isCustomer })` 使用。分析器只認得事實本身的文字，`isCustomer` 對它是未知數。

## 決定

- `factText`（`react/text.mjs`）把條件改寫成它依賴的事實：解構的 prop 換成父元件傳入的屬性運算式；只由讀取與比較組成（沒有呼叫、指定、函式、JSX、物件或陣列字面值）、宣告後未再寫入的 `const` 換成它的初始值；遞迴進行並防止循環。既有的 `boundText`（參數綁定）行為不變，只有傳入 `constants` 時才做這兩項。
- 渲染一個畫面時，條件無法由值判斷就用該畫面的事實判斷（`implied(facts, factText(…))`）：
  - 渲染器的 `condition()`（JSX 的 `&&`、三元、`if` 早退）；
  - 評估器的條件運算式與 `&&`／`||`（例如函式依 `isCustomer` 回傳兩組選單其中一組）、文字選項與物件字面值讀取（ADR 0161）。
  事實只在該畫面渲染期間有效（`render` 結束即還原），不會帶到其他畫面。
- 推不出時與以前相同：兩個分支都保留或顯示「A / B」。

## 測試

- JS `r91-facts-through-props.test`（1）。既有 JS、capture、Maven 測試不需修改。

## 後果

- reservio 訪客首頁的導覽列為「我要預約、我是商家、登入、建立帳號」，沒有「登出」，按鈕為「開始預約」「建立商家帳號」，與實際畫面相同；畫面數與導覽數不變，元件少了 2 個（只在登入時才有的項目）。
- 只展開直接同名解構的 prop；改名解構（`{ isCustomer: c }`）、經由 Context 或 hook 回傳的推導值仍無法判斷。
