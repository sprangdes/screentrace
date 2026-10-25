# ADR 0105：React 狀態值可達性（OQ-036）

## 狀態

已採用。

## 背景

R18 WP79 依畫面身分過濾共用外框，但只處理直接寫在身分條件下的元件。reservio 的共用導覽列中，常用商家面板以獨立狀態 `activeSettingsPanel` 控制；兩個開啟按鈕都在顧客分支，面板本身的條件卻只與狀態有關。依 WP78 的三種矛盾規則無法排除，因此只允許已設定商家進入的 `/business/setup` 仍被歸入面板的 API。

## 決定

只處理以下情況，不依變數或函式名稱判斷：

1. 對象：元件中以常值初始化的 `const [X, setX] = useState(<常值>)`。
2. 寫入點：元件內的 `setX(常值)`，以及透過區域函式參數的寫入（`const F = (p) => { setX(p); }` 與 `F(常值)`）。
3. 以下情況視為未知、不修剪：`setX` 被當成值使用；以函式形式更新；帶參數的寫入函式被當成值使用或以非常值呼叫；其他無法求值的寫入。只寫入常值的函式（例如關閉函式）即使被傳出，仍照常計入其常值。
4. 位於元素事件處理器內的寫入點，只在該元素的條件與畫面 audience 不可證明矛盾時計入；`useEffect` 或元件主體中的寫入點一律計入。
5. X 的可能值為初始常值與計入的寫入值；以此求值 `X`、`!X`、`X === 常值`、`X !== 常值`。所有可能值都不成立的分支，依 R18 WP79 第 3 點標示「此身分下不顯示」，evidence 記錄可能值與寫入點來源；靜態預覽也不畫。

## 驗證

- `screentrace-js/test/oq036-state-reachability.test.mjs`：只在會員分支開啟的面板在員工畫面不可達；setter 傳出、可達的非常值開啟、`useEffect` 寫入三種情況維持保守。
- reservio（commit 8d9eccb）：只有 `/business/setup` 改變，移除 `GET /api/preferred-businesses`、`POST /api/preferred-businesses`、`GET /api/businesses/{category}`；其他 35 個畫面的 API 不變，診斷不變。
- eMusicStore、PetClinic 與五個 Struts 模組的 `application-graph.json`、`preview-model.json` SHA-256 不變；完整驗證由需求方審查者於 sandbox 外執行。

## 後果

共用元件中只有特定身分能開啟的區塊，不再把 API 歸到其他身分的畫面；無法證明時仍保留，不猜測。
