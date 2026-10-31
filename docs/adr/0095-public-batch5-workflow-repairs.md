# ADR 0095 — 第五批公開專案的來源分析與有限流程回放

- 日期：2026-10-20
- 狀態：採用；需求方要求「修正這些測出來的問題」。
- 工作包：WP76；分支 `fix/workflow-restoration`。

## 決定

沿用 WP75 三個固定 repository／commit 及來源雜湊。原始結果、斷言、截圖與產物保留；重測產物另存 `analyze/completeness-batch5-fixed-20261020`，證據另存原批次目錄的 `after/`。不建置、啟動、修改受測應用，不執行其 Java、JSP、JavaScript、認證或 SQL，不抓取 CDN。Graph 2.2／Preview 2、Core 模型及套件相依不變。

### 來源與請求

- JSP 有限白名單 `pageEncoding` 決定位元組解碼；沒有宣告仍採既有 UTF-8，不做統計猜測。不支援或衝突宣告拒絕；非 UTF-8 宣告的損壞位元組拒絕。Screen 的 `sourceEncoding` 與 SourceEncoding evidence 保留來源。轉出的 HTML 使用 UTF-8 meta；本地 CSS 若不是合法 UTF-8，僅在所有可證明引用者的頁面編碼相同時轉碼；無唯一編碼保留診斷。
- Struts `DelegatingActionProxy` 由唯一、無衝突的同 action path Spring bean 綁定。父類 execute 的來源 forward 保留；字面 command 僅投影實際 dispatch 方法及繼承的驗證入口，不能聯集其他 command 的畫面。帶 command 的 action 鏈使用具參數身分的 endpoint，保留原公開 path 及來源。
- `sourceRequestPaths`／StrutsRequestPath 記錄直接 forward 與 redirect 的請求位置；action 鏈不把外層網址錯套在內層 redirect 後的畫面。一般 Spring 請求基準排除 REDIRECT handler。只有唯一基準目錄才能推導相對 URL／資源；補上 WebRoot 的 style／script 資源目錄。
- 僅導覽／表單接受標準 `pageContext.request.contextPath` 的同應用路徑投影；保留原文，標為 INFERRED，不宣告實際部署 context。CALL_API 的既有未知 context 邊界不變。簡單 EL 屬性允許空白正規化，值保持未知。
- 只有未逸出、唯一初始化的空 RedirectView、同層唯一 setUrl、原始 HttpServletRequest 參數的 getContextPath 加字面應用路徑可投影 redirect。保留 return 與 setter 行列；條件 setter、重複 setter、物件逸出仍未知。

### 圖與離線操作

- 有限 jQuery class 操作、完整原生 display 的 none／空字串／block 雙分支切換、否定 confirm 直接 return false，轉成工具自有操作；陰影全域、不同目標或其他來源形狀不取得此回放原語。
- 完整三步 `with(form)` 的 method／action／submit 僅在唯一 form、沒有同名原生方法遮蔽控制項時投影請求。未知輸入只能保留在字面 query 路徑之後；未知 path 仍不解析。
- 完整選取計數迴圈、零筆／多筆 alert-return 與單一目的；以及來源 trim/ltrim/rtrim 完整 AST 相同的必填 alert-focus-return，才可貢獻 workflowGate。viewer 僅讀自身示範 DOM 的值與勾選數，不執行來源迴圈、regex 或函式。形狀少一步、多副作用、不同界線、遮蔽 document 皆拒絕。
- Thymeleaf 具名片段以來源 template 路徑、簽名、範圍與參數建圖；明確的有限三元呼叫保留分支。capture 消費同一圖的 templateFragments，只有共同字面參數可投影簡單 th:if 隱藏。任意條件、動態 template 或多個不同片段不求值；原片段仍保留獨立畫面以維持舊 ID 相容。
- Security DSL 的唯一 HttpSecurity 參數、直接設定及字面 loginProcessingUrl／logoutUrl 貢獻 processor endpoint。登入成功 handler 限唯一注入實作的直接 sendRedirect；未知認證結果保留未知分支。條件、重新賦值、重複 registration 不假裝成確定入口。
- 巢狀候選在選單中展開為可選目的；未知分支與條件文字保留。這是 WF-050 的呈現修正，沒有刪除未知行為來取得通過率。

### 示範資料邊界

- SpringDtoSimulation 只接受來源可證明的注入服務、唯一方法、JpaRepository、直接 scalar getter／setter 複製，以及同 repository 的來源清單綁定。轉換 getter、逸出 DTO、欄位重寫、模糊型別、無注入服務不產生寫入契約。
- `inputFields`、`generatedIdentity`、`useSelectedIdentity` 與 `scope=submitted-fields-only` 是既有 attributes 中的有限 JSON 操作資料，附 INFERRED 證據，不改 Core schema。生成身分僅供 viewer 的本機示範集合。
- 更新只改已選取的示範資料列。直接開啟更新頁而沒有選取時，仍可查看來源明示的正常回傳路徑，但顯示「未選定資料列，未回放更新資料」，不偽造資料更新。
- 不推測 category／client／session、認證、時間轉換、動態 JPQL filter 或 SQL 結果。新解鎖的學生自訂 Hibernate DAO 回顯失敗列 NC-007；前批 WF-035／036 仍未解決。

## 驗收

不放寬原斷言，另存錯誤 selector／innerText 預期的來源修正案例。畫面與路由盤點、目的集合、操作旅程、資料回顯與決定性分開計算；不能以導覽成功宣稱整個來源系統功能等價。詳見 WP76 修正報告。
