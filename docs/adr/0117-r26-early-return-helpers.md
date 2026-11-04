# ADR 0117：R26 沿著提早回傳算出輔助函式的結果

## 背景

值的求值器只在函式只有一個 `return` 時算出呼叫結果。reservio 的 `resolvePostAuthDestination(me)` 沒有傳 `returnTo`，裡面的 `safePath = safeInternalReturnTo(returnTo)` 一定是 `null`（`safeInternalReturnTo` 第一行就在參數不是字串時回傳 `null`），但 `safeInternalReturnTo` 有好幾個 `return`，求值器算不出來。結果顧客從 `/` 導到 `/dashboard` 的條件留著 `safePath`，顧客第一步只能判為「可能走到」，後面整條流程都跟著變成「可能」。

## 決定

- R26-1：函式有多個 `return` 時，求值器依序走過函式本體：`if (條件) …` 只在條件能確定時進入對應分支，遇到 `return` 就算出它的值；`const` 宣告照常延後讀取；空敘述與區塊照常走過。
- R26-2：遇到其他敘述（`let`、`var`、迴圈、`try`、`throw`、一般運算式等）或無法確定的條件，結果為無法判定。走完本體都沒有 `return` 也是無法判定。
- R26-3：只有一個 `return` 的函式維持原本的算法。

## 後果

reservio 顧客「會走到」由 0 個增加為 7 個；訪客、商家、未開店商家的畫面判定不變，商家與未開店商家各有導覽由無法判定改為適用。`resolvePostAuthDestination(me)` 的 31 個「回到 returnTo」導覽因為已證明不可能而不再產生，相關導覽條件不再含 `safePath`。由輔助函式算出的值也一併確定，例如 `reservationMutationTone('cancel')` 回傳 `destructive`，預約操作按鈕因此帶有實際的 class。
