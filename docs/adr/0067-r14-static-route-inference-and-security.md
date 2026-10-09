# ADR 0067：R14 靜態路由推定與安全導向證據

## 狀態

已採用（2026-10-09），適用 WP44。

## 背景

R14 要求補足 JSP 動態路由、JavaScript API 呼叫、AngularJS scope 事件、Spring REST endpoint 分類，以及 Spring Security 自動導向。既有 UrlResolution 與 component targetStatus 是來源解析結果，不能被後續路由比對覆寫。分析只讀取目標原始碼，不啟動應用程式、不執行 JavaScript，也不發送網路請求。

## 決定

1. 保留 UrlResolution、元件 targetStatus 與既有 UrlVariableBoundaryTest 結果。新增 RouteTemplateInference 投影：JSP spring:url、c:url、href、form action 與 JavaScript API URL 只按路徑段比對既有 endpoint。EL／運算式片段在單一路徑段成為萬用字元，路由佔位符亦只匹配一段。恰有一個相容目標時新增 INFERRED 關係並保存原樣板、正規化樣板、路由候選、來源位置及 parser；多候選記錄全部候選為 AMBIGUOUS 且不建關係；零候選維持 UNRESOLVED。
2. JavaScript context path 僅能從 workspace 設定或專案明確設定取得。字串自身的前綴不能反過來證明它就是 context path。eMusicStore 原始碼的 JS URL 含 /eMusicStore，但專案沒有 server.servlet.context-path，workspace context path 設定亦為空；因此不移除此段，也不推定連到 /rest/cart。這是依 R14 §0「不猜」保留 UNRESOLVED 的結果。
3. JavaScript 以既有 Acorn 靜態分析追蹤 $http、AngularJS ng-click／ng-submit／ng-init 與同一 controller 的 $scope.fn 定義，保留函式呼叫鏈及深度／循環診斷。ng-init 是畫面載入來源；元素本身同時宣告 ng-controller 時，以該元素的 controller 名稱綁定。
4. Spring MVC 與 Spring Boot 將 @RestController、@ResponseBody、ResponseEntity，以及 void 加 @ResponseStatus 的 handler 分類為 REST_API。
5. Spring Security XML 與 Java Config 的常值登入頁／拒絕存取頁會在對應畫面記錄 autoRedirect、設定來源位置與受保護路徑；動態設定只產生診斷，不附加屬性。
6. OQ-020 的預設區域規則修訂為：只產生一個區域的依據不得成為預設，除非三種依據都只產生一個區域。其餘預設排序與 UI 切換規則不變；UI 實作留在 WP45。
7. OQ-022 方案 C 保留既有 JS 佔位符與 UNRESOLVED 規則。函式參數用 `{參數名}`、非計算屬性用 `{最後屬性名}`，computed access 不變。當帶 context path 的 JS 呼叫唯一對應後端路由時，Java graph evidence 的 canonical `url` 改為 endpoint path，原 URL 以 `originalUrl` 保留；behavior expression 仍保留原始運算式。沒有唯一對應時保留原前端請求路徑。
8. A3 只在原始路徑尚未匹配、移除第一段後能依 HTTP method 唯一匹配既有 endpoint 時，按候選前綴產生 `CONTEXT_PATH_HINT` 診斷；同一來源位置、方法與 URL 的重複追蹤呼叫合併計數。診斷列出前綴、可解析呼叫數、來源檔與行號及 `./bin/screentrace config`。不新增或改寫關係。報表分析資訊沿用診斷清單顯示；CLI 完成摘要僅在有提示時附加一行。

## 測試與斷言

測試先行提交 addd92f 新增失敗的 WP44 route、API、security、endpoint 類別與 Angular 整合測試；第二個測試先行提交 24d6bd7 增加巢狀 Spring URL 樣板與同元素 ng-init controller 綁定案例。舊實作分別因缺少路由關係／證據、缺少 autoRedirect、錯誤 endpoint 類別及無法追蹤 Angular 載入函式而失敗。實作後針對性測試通過。未修改任何既有斷言，未變更 graph schema，未新增相依。

WP44 補正另以 `7d93885` 先提交 A2 失敗測試：函式參數 URL 為 null、`$scope` 屬性保留運算式文字，且 Java endpoint path 與 JS URL 不相同；`a9f501e` 再鎖定有 context path 時的投影差異。`5154a2d` 先提交 A3 診斷、CLI 摘要與 viewer 名稱測試。實作後相關 JS、Java 與 A3 測試通過；既有 `tracing.test.mjs` 未修改。完整預設並行 E2E 仍有一項既有 `struts1-spring` 分析摘要 golden 差異（IN_USE 預期 27、實際 28），未修改該斷言或 golden，詳見 R14 報告。

R14 §2.4 授權的既有 golden 修改僅兩份合成 fixture 摘要：`spring-mvc-jsp.summary.json` 與 `spring-boot-jsp.summary.json`，每份只調整 `apis.total`（27 → 26）及 `apis.by_status.IN_USE`（22 → 21）。舊預期在預設並行 Chromium E2E 的 golden 比對中實際失敗；兩次分析都得到 total 26、IN_USE 21。路由投影把 JS 呼叫對應至既有端點並移除不再作為有效目標的合成 API 節點，故總數與使用中狀態同步減一。兩份 golden 的其他欄位未改。

WP44 第二次驗收依 §2.4 授權，另只調整 `fixtures/wp10/golden/struts1-spring.summary.json` 的 `apis.by_status.IN_USE`：27 → 28。對應既有測試 `real source fixtures produce identical graph, packed HTML and shared-module md on consecutive runs`；其兩次分析都使用同一摘要 golden。新增的唯一 INFERRED 呼叫來源是 `GET /orders/{name}`：`fixtures/wp10/struts1-spring/src/main/webapp/WEB-INF/views/page.jsp:17-18` 的 `<c:url>`／`<spring:url>` 樣板，唯一匹配 `synthetic.PageController` 的 `@GetMapping("/orders/{name}")`（`PageController.java:6`）。`RouteTemplateInference` 為來源元件新增 `TRIGGERS` 至 endpoint 的 INFERRED 關係，證據保留兩處 JSP 樣板及 endpoint 路由；所以 IN_USE 數量增加一。該測試在 `a591740` 之前的實作以新 golden 執行時仍輸出 27，預期 28 的斷言失敗。此處僅變更上述一個數字，golden 其餘欄位未動。

## 後果

可證明的 JSP 路由與 Spring Security 導向新增 evidence-backed 關係。當 context path 沒有設定證據時，帶有額外前綴的 JS API 呼叫不會被猜測成既有 endpoint；分析結果可能仍列為 UNRESOLVED／UNREFERENCED，等待明確設定來源。
