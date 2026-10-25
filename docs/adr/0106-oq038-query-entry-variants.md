# ADR 0106：查詢參數進入變體（OQ-038）

## 狀態

已採用。

## 背景

reservio 的 `AuthRouteRedirect` 讓 `?lineLogin=success|failed` 的 LINE 登入回呼在已登入時仍渲染登入／註冊等五頁。R18 依需求方決定保留多目的並逐筆說明（OQ-038），因此這些頁面的「返回首頁」同時指向訪客與商家首頁。

## 決定

1. 查詢參數原子：與常值比較的常數，其值來自 `new URLSearchParams(useLocation().search).get('<鍵>')` 或 `useSearchParams()` 的 `.get('<鍵>')`。
2. 畫面 audience 中有「A || B」原子、且 A 只由同一鍵的 `===` 查詢參數原子以 `||` 組成時，拆成兩個共用同一 ENTRY_POINT 的變體：一般進入以「!(A) && B」取代該原子，沿用原 screenId（需求方 2026-10-25 決定）；查詢參數進入以 A 取代，screenId 由檔案、路由與「鍵=排序後的值以 | 串接」決定，並帶 `entryQuery`。
3. 新建立的原子以原「A || B」原子的來源 scope 登記，讓 Context 導覽過濾能辨識。
4. 導覽目標網址的查詢字串含該鍵且值屬於 A：只指向查詢參數進入變體；不含該鍵或值不屬於 A：只指向一般進入變體；無法求值：兩者都保留。判斷使用目標運算式求值後的完整字串，不使用已去除查詢字串的 urls。
5. viewer 同名區分時，以「?」加 `entryQuery` 作為第一個候選；一般進入名稱不變。

## 驗證

- `OQ038QueryEntryVariantTest`（拆分與 ID、一般進入的「Back home」只指向訪客變體、依查詢字串選擇變體）與 `oq038-entry-query-name.test.mjs`。
- reservio（commit 8d9eccb）：畫面 36 → 41，新增五個 `lineLogin=failed|success` 變體，原有 36 個 screenId 全部保留；31 個非認證畫面的 API 與出口不變。五個一般進入變體不再含只在登入狀態下運作的 session 逾時 API（`GET /api/session`、`POST /api/auth/logout`）與其導向；其中四個的「返回首頁」與品牌連結只指向訪客首頁，`/login` 的商家首頁出口來自登入送出與登入後導向。
- eMusicStore、PetClinic 與五個 Struts 模組的 `application-graph.json` 不變；完整驗證由需求方審查者於 sandbox 外執行。

## 後果

- 外部登入回呼與一般進入分開呈現，一般使用者路徑不再出現已登入身分才有的目的地。
- 既有的五個認證頁決策沿用；回呼變體為新畫面，需要另外確認。
