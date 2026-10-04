# ADR 0037：Controller 回傳與表單畫面流程

日期：2026-10-04。狀態：採用。範圍：R3 WP18；schema 2.2 不變。

## 決定

在 Spring adapter 使用 JavaParser 分析 annotation controller 的 return，而非執行方法或求值。`SpringControllerReturns` 分類字面 view、final 字面欄位常數、redirect／forward、ModelAndView 與 RedirectView。每個 return 保留原始運算式、類別、方法、實際行號與所在 if 分支條件；同目的不同 return 仍各保留一條 handler 邊。lambda／巢狀方法的 return 不歸屬外層 handler。

字串 redirect／forward 的常數前綴加動態運算式，僅當未知部分占完整路徑段且兩側有可證明的斜線／結尾邊界，才表示為 `{expressionN}` 樣板；不推算具體 ID，不解析任意局部 view 變數或方法回傳，不接納部分段、未知 URL 前綴或外部 URL。此樣板的導向為 INFERRED。原運算式保留於證據。

字串 `redirect:/`／`forward:/` 是 application-relative 路由，不捏造部署 context path；單參數 RedirectView 的原始 URL 走既有 URL/context 對應。redirect 使用 GET，forward 保留可證明的請求方法；方法未知維持 UNRESOLVED。多個相容端點全部保留並標 AMBIGUOUS。追蹤鏈深度上限 10，循環／超限產生 SPRING_RETURN_UNRESOLVED，不捏造目的。

ModelAndView 只接受常數建構形式，或同方法、使用前、可證明作用域內唯一的常數初始化物件；重新賦值、別名、逃逸或可能改寫 view 的呼叫保持未解析。只准許不修改 view 的已知 model 操作。未知回傳保留原運算式及 SPRING_RETURN_UNRESOLVED 診斷。

## 現有圖契約

普通 view 回傳以 RENDERS 表達；redirect／forward 經 ENDPOINT → HANDLED_BY 對應 handler 的實際目的畫面，以既有 FORWARDS_TO 表達。每條導向合併回傳位置、端點對應、後續 handler 及 view 的證據；不新增欄位或邊類型。

SpringControllerFlow 最後從元件的 NAVIGATE／SUBMIT_FORM、TRIGGERS、HANDLED_BY 及回傳邊推導 NAVIGATES_TO。合併同元件同目的畫面的證據，保留驗證失敗回原表單與全部成功目的。CALL_API 不投射成導頁。多個來源端點的歧義不因目的相同而隱藏；例如共用新增／編輯 JSP 的送出路由仍可能 AMBIGUOUS，而各已證明 handler 的 redirect 邊為 INFERRED。

## 驗證與限制

自行撰寫的 fixtures/r3/wp18 涵蓋常數／串接 redirect、forward、ModelAndView、RedirectView、多 return、歧義、動態目標、別名改寫、巢狀 callback、循環、深度與 AJAX 非導頁。CLI 完整合成管線驗證嚴格 2.2、兩次輸出決定性，Chromium file:// 驗證畫面關聯與零對外請求；實測詳見 reports/R3.md。

此回傳 AST 擴充適用 annotation controllers；既有 XML view mapping 行為保留。沒有動態 Java 執行、業務條件預測、任意函式追蹤或 schema 變更。未解析目的不能作為「沒有後續畫面」的證明。
