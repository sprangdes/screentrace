# ADR 0167：R89 沒有設定角色時，依路由守衛自動建議角色

## 背景

[reservio 評估（2026-11-18）](../RESERVIO_EVALUATION_20261118.md) P9：角色頁必須由分析人員在 `config.json` 手寫條件才會出現。需求方於 2026-11-18 決定（OQ-057）：沒有設定時自動建議，寫入報表並標為自動建議；有手動設定時以手動為準。

## 決定

- Java（`ReactGraphContribution`）在專案沒有設定角色時，對 React 分析器送出 `suggestPersonas: true`；`analyzeReact` 沒有這個旗標時行為不變（沒有角色欄位，WP86 測試仍成立）。
- JS `suggestPersonas`（`react/personas.mjs`）由既有的條件維度（ADR 0103 一系的 `personaDimensions`）推導：
  - **角色維度**：被比對兩個以上字串值的條件（如 `me.role`）；多個時取畫面條件中使用最多者，再取值最多者，再依碼序。
  - **登入維度**：角色維度的根物件本身也是條件（`me`）時，建議「未登入」角色（`me` 為否）。
  - 每個字串值一個角色：`me` 為是、`me.role === "值"` 為是；名稱為去掉 `ROLE_` 的值，ID 為 `role-` 加小寫值。
  - 所有角色的載入旗標（R84 的載入中分類）為否；登入角色另把根物件上名為 `must…`／`force…`／`needs…`／`requires…` 的例外旗標設為否。
  - 描述一律以「自動建議：依路由條件 …」開頭；最多 8 個，條件矛盾的略過。
- Java 以分析器提供的描述作為角色描述（手動設定的描述優先），有任何角色時 schema 為 2.4。

## 測試

- JS `r89-suggested-personas.test`（1）。
- 修改的既有斷言（需求方決定的新行為）：`R19PersonaGraphTest.absentPersonasPreserveSchema` 原本約定「沒有設定角色時 schema 維持 2.3、圖中不含角色」，改為 `absentPersonasAreSuggestedFromRouteGuards`，驗證 schema 2.4、角色非空且描述以「自動建議」開頭。其他斷言不變。

## 後果

- reservio 不設定角色時建議「未登入」「BUSINESS」「USER」：未登入與 USER 的結果與手動設定相同；BUSINESS 多為「可能走到」，因為「是否已建立商家資料」（`me.business`）無法以通用規則決定，需分析人員手動設定。
- 角色名稱來自程式中的值（BUSINESS、USER），不是業務用語；分析人員可在 `config.json` 設定正式名稱與條件取代建議。
