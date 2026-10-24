# ADR 0102：R18 WP82 的 Spring API 選路與外部呼叫附註

## 背景與決定

需求方已確認 R18-B：D5 原文不改；沒有畫面來源的端點仍是 UNREFERENCED／未被使用，只在公開存取與 CSRF 忽略證據同時成立時加「外部呼叫（Webhook）」，不授權移除。D4、D5 與 md v1 位元組不變。

- Spring Boot／React API adapter 明確啟用字面路徑優先：完全常值 URL 與相容 method 的字面端點完全相符時，只保留字面端點；SpringPathSpecificity evidence 列出被排除的樣板。含未知片段時沿用全部候選。既有 JSP／Struts／MVC 的共用 resolve 入口保持原契約，不修改其受保護斷言或圖。
- 同一 adapter 的 Boot 預設 context：有 application*.properties/yml/yaml，全部成功解析且均未宣告 server.servlet.context-path，才採空字串；SpringBootDefaultContext evidence 標明「Spring Boot 預設值」與設定來源。任何 profile 有宣告、未解析值、無設定檔或非 Boot 均不套用。工作區已設定值優先。
- 同一個可唯一定位、實際回傳的 HttpSecurity builder，無條件設定的 permitAll 與 ignoringRequestMatchers 都完整涵蓋 endpoint path/method，且沒有畫面 caller，才標註。規則依來源順序比對，先前拒絕／未知 matcher 不忽略。多個 filter chain、其他 builder、動態路徑、條件式配置不猜；無關 callback 的區域變數寫入不影響 builder 證明。
- XML 等價範圍：Spring Security namespace 的 intercept-url／permitAll 與 csrf request-matcher-ref，引用唯一 beans namespace 的 NegatedRequestMatcher＋字面路徑 matcher；AndRequestMatcher 中可證明的否定分支也可採用。Or、自訂類別、未知 reference 均保留未定，不以 disabled=true 代替指定的忽略證據。
- backend 只加 attributes.externalCall 與 SpringSecurityExternalCall 結構化 evidence，記兩處設定的來源／行號、kind、pattern、可選 method。它不是 caller、不是第四種狀態，不從路徑名稱猜 Webhook。API 清單與詳情顯示附註與證據，仍由原 deriveApiUsage 推導狀態；REMOVABLE 算法不變。

參考：[Spring 官方 CSRF 文件](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html) 的 ignoringRequestMatchers 與 XML request-matcher-ref；[XML namespace](https://docs.spring.io/spring-security/reference/6.5/servlet/appendix/namespace/http.html)。來源只供確認框架設定語意，不下載或執行被分析專案。

## 測試、相容性與限制

先失敗提交 d1562b5（API 字面優先、雙證據／缺一不套用、method 與規則先後、Boot profile／缺檔／未定值／WAR、XML 與 UI）；e2fc902（雙結構化證據與 D4／D5）；5d74394（builder 作用域／條件配置）。同批新增 WP81 的 callback 反向 fixture，避免瀏覽器事件及未知集合的參數被誤當成省略引數的 undefined。

沒有修改既有測試期望值，沒有使用預先授權的數量型變更；舊 UrlResolution.everyCompatibleCandidateRemainsAmbiguous 等受保護契約完整保留。只增加 Spring API adapter 的明確入口；不讓 React 修正滲入 JSP／Struts 回歸。schema 2.3 的定義不變，沿用既有 attributes／evidence 擴充點。

本輪不執行外部呼叫、不模擬 webhook payload、不分析聊天機器人流程、不進入 WP83。OQ-039 由需求方確認為 main 既有問題，另案處理，不阻擋本輪驗收。

實測補驗 3ffd5c1：`fetch` 的 template wrapper 仍會令後續 RouteTemplateInference 把已確認的常值請求退回 AMBIGUOUS。SpringPathSpecificity 現對已選定字面端點寫明證據；該後續弱推定不能覆寫此結果。未知片段與其他 adapter 原規則不變。另保留 OQ-036 已授權面板的動態分類呼叫：字面分類 API 已排除樣板，不代表可刪除面板中另一筆來自 activeCategory 的真實動態請求；報告逐筆說明。
