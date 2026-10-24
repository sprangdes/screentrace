# ADR 0098：R18 函式回傳目的地與外部登入往返

## 背景與選項

前端使用專案內函式回傳常值路徑／path 物件，原分析只保留未知運算式。選擇以 AST 展開回傳分支、參數綁定與來源證據；不執行函式，不把使用者傳入的 returnTo 當成常值。

## 決定

- 支援 navigate(f(...).path)、navigate(f(...))、區域別名 destination.path 與 Navigate to。依既有展開深度限制，追蹤專案內函式與 return；每條常值目的地為 INFERRED，回傳參數／外部運算式的分支保留 UNRESOLVED。
- 條件中的參數以 AST 綁定替換，與處理器 fall-through 條件及來源畫面 audience 只套用 WP78 的矛盾規則。推定目的地經路由比對不升為 CONFIRMED。
- 目的地畫面依其 audience 與函式目的地條件保留所有無法排除的變體；無來源證據時不把不同函式／元件中的身分變數視為同一物件。
- 原生 a href 與 window.location 為整頁導向；指向可解析後端端點時保留 fullPage 證據。一般 router Link 不套用整頁語意。
- 僅在有 React schema 2.3 圖時，從 Spring oauth2Login 的 successHandler 綁定、端點處理器的 sendRedirect／redirect: 與 callback 的常值導回建立外部登入 metadata／FORWARDS_TO，附三處來源。未唯一解析型別或設定導回路徑就保留診斷，不猜 fallback。
- 已支援的 gateway 為與 ClientRegistration.authorizationUri 常值相符的 HTTP(S) 導向，以及 Spring OAuth 預設 authorization 入口（有自訂 baseUri 時不假設預設入口仍有效）；自訂 authorization baseUri 或多個 successHandler 未建立唯一關係時不假設相同。
- API caller 與 D4／D5 規則不改。只有已證明 externalLogin 的 CALL_API 額外投影回到前端的畫面流程；普通 Ajax API 不因此成為導航。模擬只顯示入口與導回資訊，不發出網路請求或執行認證。
- callback 的常值查詢參數保留；設定屬性或未知 builder 的導回維持 EXTERNAL_LOGIN_RETURN_UNRESOLVED。

## 測試與斷言

失敗測試先提交 `91ab835`、`b42f713`；另補 `26aaf72` 的離線 callback 說明 E2E。正反向涵蓋常值聯集、回傳參數、Guard／處理器條件、外部登入與未知 callback 設定、一般 API 無導向。既有斷言未修改；md v1 golden、決策保存鍵與 D4／D5 保留。

## 後果與限制

無法證明變數同一性時保留多變體，交由既有多目的地選擇；不依角色字串或函式名稱猜同一身分。跨事件狀態推導不在本輪；OQ-036 保留。WP80 後停止，未進入 WP81。

## 第一階段驗收補正

需求方已決定 OQ-035 A、OQ-036 A、OQ-037 窄版 B；以上未決段落為首次送審歷史，現行決定及實作以 [ADR 0099](0099-r18-review-corrections.md) 為準。
