# ADR 0101：R18 第二階段的分派表、字面 prop 與 optional 條件顯示

## 背景與決定

需求方第三次驗收通過 WP78–WP80，授權 WP81→WP82，完成後停止。第一階段的訪客條件顯示另須修正，不需要重新驗收。

- audience 的比對原子、variantKey、schema 2.3 與決策鍵不變。optional chaining 的原始語法留在原子的 raw 中；僅顯示投影採用原式。已知物件為假的分支，省略必定成立的否定 optional 屬性／與非 undefined 常值相等條件。完整條件與來源 evidence 保留。不把 `?.` 顯示成 `.`。
- 物件字面值分派表的常值 key 只呼叫該屬性；未知 key 列出全部候選並維持 INFERRED。Object.keys 的 map／forEach、for…in 同一物件可證明全 key 迭代時，採用原函式的信心；動態 URL 等既有 INFERRED 不升級。超過 20 個屬性診斷並停止展開。spread、未知 computed key、getter 不猜。
- 證據 parser ReactDispatchTable 記分派表、key 證明與呼叫位置；後端 URL 對應不得把未知 key 的推定呼叫升級為 CONFIRMED。
- handler／load effect 的 if、三元、邏輯運算只在 evaluator 可證明常值時修剪。路由字面 prop 可用；useState／useReducer 初始值仍未知。條件自由時兩邊保留，保留 guard 與來源。

## 測試與授權

先失敗提交：038f636（optional 顯示）、9a513ff（WP81 六個正反向 fixture）、de3d7e9（backend matching 不升級）。038f636 的新 fixture 起初以相同 HTML 元素回傳，未形成畫面變體，已更正為兩個自行撰寫的畫面元件；斷言不變。

沒有修改任何既有期望值、受保護斷言、md v1 golden 或 API D4／D5 推導。內部 raw／dispatch 記錄使用既有 attributes／evidence，沒有 schema 欄位變更。不執行目標程式、不複製目標原始碼作 fixture。

補驗：顯示摘要原先也參與共用導航元件的投影 key；單純修正 optional 顯示不應更換既有 ID。保留原正規化條件作 conditionKey，componentShape 仍使用相同 key 名稱與舊值，顯示與 evidence 使用簡化後 condition。失敗提交 2568241／de5f8f8；新增 fixture 補齊 Context Provider 以實際進入跨畫面條件投影，不修改既有斷言。另 d1562b5 新增 runtime callback 參數反向案例，事件與未知集合參數保持 UNKNOWN，只有明確函式呼叫省略的引數才是 undefined。
