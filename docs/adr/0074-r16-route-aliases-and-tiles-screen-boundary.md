# ADR 0074：R16 路由別名與 Tiles 畫面界線

## 狀態

已採用。

## 決策

Servlet mapping 依 OQ-030 分成互斥三類。可證明時，module 由唯一一個已宣告的 Struts ActionServlet 處理（由 `servlet-class`、`config`／`config/<module>` init-param 判定；若只有一個 ActionServlet，該 servlet 處理全部 module），且該 servlet 至少有一個 mapping。action path 與每個 mapping 展開的公開 URL 合併為同一 endpoint，confidence 為 `CONFIRMED`；主要 `path` 使用 `web.xml` 文件順序中的第一個 mapping，其餘 URL 保留於 `logicalPath`／`aliases`，不產生 mapping 診斷。若 module 可能由多個 servlet 處理或所屬 servlet 無法判定，只輸出 `STRUTS_SERVLET_MAPPING_AMBIGUOUS`，並列出 servlet 名稱與 `web.xml` 行號。缺少 `web.xml`、ActionServlet 宣告或 mapping 時只輸出 `STRUTS_SERVLET_MAPPING_UNRESOLVED`。這兩種診斷互斥，維持 R16 前 endpoint 候選與信心。Viewer 的 API 全域搜尋同時檢查公開 path、logicalPath 與 aliases。

Tiles definition 的畫面身分依 OQ-029（方案 C）判定：任何其他 definition 以 `extends` 指向的 definition，以及只由 `put`、`put-attribute` 或 `insert` 引用的 definition，屬版型／片段；其餘 definition 一律建立畫面，不要求存在入口。非 Tiles JSP 保持原畫面規則；沒有 page definition 引用的版型／片段仍保留為無入口畫面。被 page definition 引用的 JSP 元件與行為歸入該畫面，避免同一來源在版型及片段畫面重複計數。JSP 參照只在專案中唯一匹配時解析；無法唯一匹配時保留未解析診斷。

Action forward 鏈導向畫面時，畫面另保留已證明的入口網址於通用 `routeAliases` 屬性；GraphIntegrityValidator 接受元件目標與此清單中的精確網址相符。沒有宣告的其他目標仍會被拒絕。這讓 `/start.do` 經 `/next.do` forward 到同一畫面的已知導覽可通過完整性檢查。

## 驗證

- `StrutsR16RoutingTest` 覆蓋 mapping 已證明、缺少或多候選時的 endpoint 身分與診斷。
- OQ-030 測試先於實作提交（`9c45c50`）。實作前，`oneActionServletWithTwoPatternsMergesAllPublicAliasesAsConfirmedWithoutDiagnostics` 對舊版提出的三別名／單 endpoint／CONFIRMED／無診斷預期失敗；`twoActionServletsForTheSameModuleProduceOnlyAmbiguousMappingDiagnostic` 與 `declaredActionServletWithoutMappingProducesOnlyUnresolvedMappingDiagnostic` 也分別失敗。實作後三類測試通過；WP10 fixture 的兩次輸出都通過整份 golden 比對。
- OQ-030 授權的 `struts1.summary.json` 數量欄位更新：`apis.by_status.IN_USE` 20→22、`apis.by_status.UNREFERENCED` 5→3、`diagnostics_by_code.URL_UNRESOLVED` 9→13。API 總數維持 25；alias 合併使兩個原分開保留的路由呼叫落到其已證明 endpoint，重新計算狀態與診斷後的摘要即為新值。舊摘要值由更新前 golden 及舊圖結果固定；新值來自 WP10 兩次實際 fixture 輸出。未改其他欄位或任何其他 golden。
- 8 個官方 Struts 模組以新 jar 重跑後，報告 API 數／狀態與 diagnostics 數為實際輸出；Spring 專案前後 graph SHA-256 相同：eMusicStore 無 context path `0253e9f…`、有 `/eMusicStore` `490f741…`、PetClinic `6bee8b1…`。完整 SHA 與實測表見 R16 報告。
- `r16-endpoint-alias-search.e2e.mjs` 驗證 API 全域搜尋可用 logical alias 與公開 path 找到同一 endpoint。
- `StrutsR16TilesBoundaryTest` 覆蓋 page definition 與 standalone definition、extends 鏈、JSP put／put-attribute／insert、直接 forward JSP、未導向畫面保留、版型／片段元件與 JavaScript 行為歸屬，以及 JSP 行為來源集合不遺失。
- WP10 `struts1` golden 只調整 `screens`：`6 → 2`，實際畫面為 `page.jsp` 與未導向頁面定義 `outer`。`behaviors_by_type` 的實際值與 golden 原值相同，逐欄如下：`CALL_API 49→49`、`NAVIGATE 12→12`、`OPEN_DIALOG 28→28`、`SELECT_CHANGE 2→2`、`SUBMIT_FORM 10→10`、`UI_STATE_CHANGE 20→20`、`UNKNOWN 25→25`、`VALIDATE 26→26`；這些欄位未改寫。其餘 golden 欄位與其他 golden 均未修改。
- OQ-029 前的錯誤 WP55 實作 `0e39ee0` 使 `wp10FixtureKeepsUnroutedPageDefinitionAndDirectJspAsScreens` 期待 `{page, outer}`、實際只得 `{page}`；`everyUnreferencedPageDefinitionRemainsAScreenAndItsJspControlsStayGrouped` 也因未入口頁面及其片段來源被移除而失敗。新 golden 的 `screens=2` 在該實作上因此失敗；broken graph 的 behavior summary 為 `CALL_API 28`、`NAVIGATE 7`、`OPEN_DIALOG 22`、`SELECT_CHANGE 2`、`SUBMIT_FORM 9`、`UI_STATE_CHANGE 11`、`UNKNOWN 20`、`VALIDATE 19`，與新預期不同。
- 來源不遺失不變量以 commit `27a5af6` 的 WP55 前圖建立 49 個 `(source file,line,behavior type)` tuple，修正後圖含 53 個 tuple；測試確認 49 個舊 tuple 全部保留。新增 tuple 來自 `workspace:config.json` 與 Struts config 證據，不是刪除來源的替代品。
- 來源歸屬對照：

| 移除的版型／片段畫面 | 依據 | 去重後仍保留的行為來源 |
|---|---|---|
| `base` | `tiles-defs.xml:1`，`child` extends `base`；`base` template 為 `layout.jsp`、body put 為 `page.jsp` | `WEB-INF/views/page.jsp:3–28` 與 `js/owned.min.js:1` 等來源仍歸到 `page`／`outer`；來源 tuple 測試逐項覆蓋全部 49 筆 |
| `child` | `tiles-defs.xml:1`，`outer` extends `child` | 同上；繼承只合併畫面歸屬，不移除來源 |
| `nested` | `tiles-defs.xml:1`，`outer` 以 `put-attribute` 引用 `nested`；其 path 為 `page.jsp` | `page.jsp:3–28` 的 component/behavior sources 保留在 `page`／`outer`；`page` 作為直接 JSP 畫面仍保留 |
| `layout.jsp` 隱含畫面 | `base` 的模板引用；不是獨立 page definition | 該 fixture 的 layout 本身沒有額外行為來源；其頁面與 JS 行為仍由上述 49-tuple 不變量驗證 |
- faces-example2 的 layout JSP `/layout.jsp` 不由 `.base` 的 `/layout.faces` 唯一映射；依 OQ-029 不猜測該檔案關係，故保留 `layout` 無入口畫面。其他明確 put 的 JSP 則歸入 page definition；實際例外及完整來源見 [R16 報告](../reports/R16.md)。
- `everyUnreferencedPageDefinitionRemainsAScreenAndItsJspControlsStayGrouped` 新增對唯一 root JSP `/header.jsp` 解析的失敗斷言；舊輸出產生 `TILES_REFERENCE_UNRESOLVED`，修正後唯一檔案匹配成功，Tiles 未解析診斷由 35 降為 0。沒有放寬既有斷言或 fixture。
- OQ-031 授權更新 `struts1-spring.summary.json` 的數量欄位。以需求方設定的 `/fixture` workspace context path，重新執行 R16 前提交 `1c61d76` 的 CLI 得到舊值；修正後值取自兩次一致的現行 fixture 報表。逐欄記錄如下：

| 欄位 | 舊值 | 新值 | 差異來源 |
|---|---:|---:|---|
| `screens` | 7 | 3 | Tiles 的 `base`（`tiles-defs.xml:1`，被 `child` extends）、`child`（同檔同列，被 `outer` extends）、`nested`（同檔同列，被 `outer` 的 `put-attribute` 引用）與 `layout`（`WEB-INF/views/layout.jsp:1`，為 `base` 的 template）歸為版型／片段；頁面定義 `outer`、Spring controller 畫面 `page` 與直接 JSP 畫面 `page` 保留。 |
| `apis.total` | 40 | 37 | 七組已證明的 Struts action 路徑與公開 URL 合併為單一 endpoint；來源如下表。 |
| `apis.by_status.UNREFERENCED` | 12 | 9 | 同一批 alias 合併後，三個重複端點不再各自計為無來源；`IN_USE=28`、`REMOVABLE=0` 不變。 |
| `diagnostics_by_code.URL_UNRESOLVED` | 11 | 19 | 重新分析後仍無法靜態證明的 8 個呼叫新增為未解析診斷：`page.jsp:3,26,37`；`owned.min.js:4,15,16,17,24`。其他未解析來源仍保留，沒有把它們升為已解析。 |

七組 alias 的實際 endpoint 與 mapping 來源：

| 合併後 endpoint | 邏輯 path／別名 | 設定來源 | 呼叫來源情況 |
|---|---|---|---|
| `ANY /save.do` | `/save`、`/save.action` | `struts-config.xml:6` | 保留原有頁面與 JavaScript 呼叫證據。 |
| `ANY /page.do` | `/page`、`/page.action` | `struts-config.xml:5` | 保留原有頁面連結與 controller 畫面。 |
| `ANY /lookup.do` | `/lookup`、`/lookup.action` | `struts-config.xml:7` | 保留原有表單與連結來源。 |
| `ANY /mapping.do` | `/mapping`、`/mapping.action` | `struts-config.xml:8` | 保留原有表單與連結來源。 |
| `ANY /api/exact.do` | `/api/exact`、`/api/exact.action` | `struts-config.xml:9` | 保留原有 JS 呼叫來源；無法唯一配對的呼叫仍為未解析／歧義。 |
| `ANY /managed.do` | `/managed`、`/managed.action` | `struts-config.xml:10` | 保留原有頁面操作證據。 |
| `ANY /admin/save.do` | `/admin/save`、`/admin/save.action` | `struts-config-admin.xml:1` | 保留原有頁面操作證據。 |

`struts1-spring` 的 `behaviors_by_type` 未變，仍為 CALL_API 61、NAVIGATE 24、OPEN_DIALOG 29、SELECT_CHANGE 3、SUBMIT_FORM 16、UI_STATE_CHANGE 20、UNKNOWN 27、VALIDATE 32。WP10 `struts1` 的來源不遺失不變量另以原始 WP55 前來源集合逐項驗證：49 個舊 `(檔案, 行號, 行為類型)` tuple 全部包含於修正後的 53 個 tuple；沒有畫面來源或行為來源被 Tiles 收斂刪除。`1c61d76` 的同設定舊輸出仍為 7 個畫面、40 個 API、12 個 `UNREFERENCED` 與 11 個 `URL_UNRESOLVED`，因此所有已授權的新期望均會在 R16 前實作上失敗。除上述數量欄位外，`struts1-spring` golden 沒有修改。
- OQ-031 授權更新 `struts1.summary.json`：`IN_USE` 20→22、`UNREFERENCED` 5→3、`URL_UNRESOLVED` 9→13。endpoint alias 合併來源、兩個畫面保留情況與來源不遺失證據見上方 OQ-030 對照及 R16 報告；`apis.total=25`、所有 behavior 數和其餘欄位不變。修正前提交 `1c61d76` 的 fixture 輸出仍為舊值，故新期望會失敗。
- `GraphIntegrityValidatorTest.acceptsNavigationThroughAnExplicitScreenRouteAlias` 先行失敗（舊驗證回報 `Navigation target does not match screen route or view`），之後鎖定宣告過的畫面路由別名；`StrutsR16RoutingTest.actionLinkForwardChainDeclaresScreenRouteAliasForGraphValidation` 覆蓋完整 Struts forward 鏈。
- R16 前已存在的測試與 fixture 未修改；OQ-028 授權的兩個 R16 新測試預期另記於 ADR 0073。
