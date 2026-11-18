# ADR 0163：R85 畫面名稱改用白話條件、角色名稱與選單文字

## 背景

[reservio 評估（2026-11-18）](../RESERVIO_EVALUATION_20261118.md) P5：畫面名稱夾帶程式用語，例如「登入 Reservio（?lineLogin=failed|success）」「建立預約（step = 1）」「通知中心（Merchant Notifications Page）」「Customer Dashboard Page」。需求方於 2026-11-18 決定（OQ-057）：白話條件；有角色時以角色名稱區分；沒有標題的畫面改用連到它的選單文字。

## 決定（只影響 viewer 顯示名稱，圖中的名稱與 ID 不變）

- 網址參數變體：`（?k=v1|v2）` 改為 `（網址帶 k=v1 或 v2）`，多個參數以「、」分隔（`queryText`）。
- 頁面狀態變體（ADR 0158）：`（step = 1）` 改為 `（step 為 1）`（`stateText`）。
- 同名畫面的區分依序改為：網址參數、**角色**（圖中 `application.personas` 判定為 APPLIES 的角色名稱，以「、」連接）、路由、Tiles 定義、檔名、目錄名；取第一個在同名畫面中唯一的值。沒有角色時與以前相同。
- 沒有標題（`<title>`、`<h1>`）而原本會以檔名或元件名命名的畫面，改用連到它的連結或按鈕文字：只連到這個畫面的文字優先，其次是從較多畫面連來的文字，再依碼序；`<Link>` 這類無文字標籤不採用。沒有連結時維持檔名。

## 測試

- viewer `r85-names.test`（3）。
- 修改的既有斷言（需求方決定的新寫法）：`r80-state-variant-name.test` 的 `（step = n）` 改為 `（step 為 n）`；`oq038-entry-query-name.test` 的 `（?sso=err|ok）`、`（?error=1）` 改為 `（網址帶 sso=err 或 ok）`、`（網址帶 error=1）`。其他斷言不變。

## 後果

- 角色名稱只在有角色時出現；R86（P9）自動建議角色後，未設定角色的 React 專案也會有。
- 角色相同、路由也相同的畫面仍以檔名區分（reservio 的「通知設定（Settings Scaffold Page）」）。
