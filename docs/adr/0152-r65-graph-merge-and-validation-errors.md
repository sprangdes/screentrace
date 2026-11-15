# ADR 0152：R65 合併節點保留雙方屬性，驗證失敗統一為 GraphValidationException

## 背景

[CODE_REVIEW_20261114](../CODE_REVIEW_20261114.md) 的 RV-107～109：

- `ApplicationGraphMerger` 合併同一節點時只保留第一份貢獻的屬性與 confidence，另一份獨有的屬性被丟棄；evidence 不去重。合併行為時，一邊解析出目標、另一邊未解析，結果變成沒有目標。
- `GraphIntegrityValidator` 同一種驗證失敗，有角色設定時拋 `IllegalArgumentException`，沒有時拋 `IllegalStateException`（與 CLI 的取消例外同一基底類別）；欄位為 null 時拋 NPE。

## 決定

- R65-1：合併節點時屬性取聯集，衝突時第一份優先（與修改前相同）；confidence 取較強者（CONFIRMED > INFERRED > AMBIGUOUS > UNRESOLVED），任一方的證明都算證明；節點與關係的 evidence 去重。關係的 confidence 同樣取較強者。
- R65-2：合併行為時，未解析的一方（null）不構成候選；只有兩邊目標不同時才是 AMBIGUOUS。
- R65-3：新增 `GraphValidationException extends IllegalArgumentException`，所有驗證失敗都拋它；null 的關係類型、persona 欄位、觸發元件類型等改為驗證錯誤，不再 NPE。

## 後果

- 以修改前的 commit 對照 13 個 fixture：只有 `wp10/struts1-spring`（Struts 與 Spring 都產生結果）的圖改變——171 筆重複 evidence 移除、1 個畫面保留了 Spring 才有的 `template` 屬性；其餘 12 個逐位元組相同。
- 原本以 `IllegalStateException` 判斷驗證失敗的呼叫端需改為 `GraphValidationException`（或 `IllegalArgumentException`）；專案內 4 個測試檔已更新。
