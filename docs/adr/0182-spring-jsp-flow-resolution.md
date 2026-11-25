# ADR 0182 Spring MVC JSP 流程解析

日期 2026-11-19。狀態為採用。範圍為 R107 WP179。

## 決定

- Spring MVC 的回傳分析展開三元運算式，以及同類別中無歧義的私有字串回傳方法。保留呼叫端、回傳位置和分支原文。遞迴、無法證明的目標與可能被改寫的回傳物件保留診斷。
- 字面字串比較可用明確命名的 `@RequestParam` 與字面預設值判定候選畫面。只有 `web.xml` 明確將唯一的 Spring DispatcherServlet 映射至 `/` 時，才用 `getServletPath().startsWith(...)` 限縮端點別名的畫面候選。圖與報表使用回傳邊上的證據保留分流。無法證明的參數值或業務條件仍保留候選。
- `@ExceptionHandler` 的可解析畫面連至例外處理方法。Servlet `error-page` 以入口與畫面關聯呈現。使用相同 body 的 Tiles 定義各自包含其元件與片段。
- JSTL 的 `c:out` 可讀取同來源、可證明作用域中的 `c:url` 變數。完整的 `c:choose`、字面路徑三元運算式、完整 EL 路徑段和 `c:param` 保留有限候選及來源。動態參數用樣板表示。表單提交及按鈕覆寫沿用原有 URL 與方法對應。
- 靜態預覽會移除 JSTL URL 變數宣告，採用已辨識的布林模型事實，並用合成內容呈現字面 EL 文字及格式化數字。對可由 DOM 查詢、迭代與資料屬性比較證明的顯示行為，報表用來源中的選項建立合成列並在離線預覽切換。
- 沿用既有 Application Graph 型別與版本。此決策擴充 ADR 0037 的 Controller 回傳規則，以及 ADR 0005 的 JSTL URL 變數規則。

## 驗證

`node --test screentrace-cli/src/test/spring-jsp.test.mjs` 使用合成專案覆蓋查詢分流、路徑別名、動態轉址、Tiles 共用頁身、錯誤頁和保持未解析的情境。執行前先建置檢視器與 Maven 套件。
