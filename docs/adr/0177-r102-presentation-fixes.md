# ADR 0177：R102 呈現修正：畫面名稱組合、依角色分組、角色中文名、處理中按鈕

## 背景

R85～R93 之後 reservio 仍有幾處呈現瑕疵：「通知設定（Settings Scaffold Page）」以檔名區分；功能地圖的「其他」有 8 個畫面；自動建議的角色名稱是程式值（BUSINESS、USER）；狀態變更 API 的用途只寫得出「處理中」。

## 決定

- **畫面名稱**（`names.ts`）：同名畫面依序以「網址參數、角色、路由、Tiles 名稱」中單一可區分的值命名；都不行時取其中第一組可區分的兩個值，以「・」連接（「通知設定（商家・/notifications/settings）」）；兩者都不行才用檔名或資料夾。
- **功能分組**（`features.ts`）：新增最後一條依據 `ROLE`（「只有一個角色會用到」）：在 `application.personas` 中只有一個角色判定為 APPLIES 的畫面，以該角色分組，名稱為「〇〇專用」，key 為 `role:<角色 id>`；和其他依據一樣至少兩個畫面才成組，之後仍套用 R93 的兄弟畫面規則。md §8 的固定說明加入此依據。
- **角色中文名**（`personas.mjs`）：自動建議角色時，以 R82 的前端對照擷取（`state-labels`）找含兩個以上角色值（可省略 `ROLE_` 前綴）的對照組；所有對照一致時以前端文字命名，否則維持程式值去掉 `ROLE_`。
- **處理中按鈕**（`apiPurpose`）：結尾為「中」「…」「...」的文字視為處理中字樣而略去；只剩處理中字樣時寫成「顯示「處理中」的按鈕」。

## 測試

- viewer `r85-names.test`、`r86-menu-features.test`、`r87-api-purpose.test` 各新增 1 個；JS `r89-suggested-personas.test` 新增 1 個。
- 修改的既有斷言：三份 md golden 只有 §8 說明句不同（以腳本還原後逐位元組相同），`wp40-md-decision-equivalence` 雜湊更新。

## 後果

- reservio：「Settings Scaffold Page」消失；「其他」由 8 個降為 6 個；狀態變更 API 的用途為「顯示「處理中」的按鈕」。reservio 前端沒有角色值的中文對照，自動建議的角色仍為 BUSINESS、USER（可在設定檔命名）。
