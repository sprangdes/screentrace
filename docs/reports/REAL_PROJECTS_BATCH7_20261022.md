# 第七批公開專案實測：功能與流程解析（2026-10-22）

受測 ScreenTrace：分支 `fix/spring-tiles-screens`，commit `ba7a011`（`mvn -DskipTests package` 重新建置的 CLI jar）。本批只測試與記錄，沒有修改產品程式碼或目標專案。

**結論：4 個專案中只有 Struts + Spring 混合專案的主要流程大致正確；Spring MVC Tiles 專案有 4／7 個 Tiles 頁面被丟掉版型、Spring Boot + React 專案完全沒有畫面（0 screens）、大型 Struts 1 專案讀錯設定檔、把 Javadoc HTML 當成頁面導致 198 個畫面全部沒有預覽，且分析耗時約 1 小時 46 分。** 共記錄 20 個問題（P1 × 6、P2 × 9、P3 × 5）。**2026-10-23 更新：19 個已修復並合併到 `main`（sprangdes/screentrace#25–#41；其中 RP7-11 只修了 Spring MVC 一側），RP7-14 部分修復**；逐項狀態、修復時另外發現的問題與後續待辦見[修復狀態](#修復狀態2026-10-23)。下方問題清單保留原始實測紀錄。

## 專案與版本

四個 repository 皆非 fork，與前六批 24 個 repository 無交集（排除清單見 [batch6 non-duplication](completeness-batch6-20261020/non-duplication.json)）。

| 專案 | 固定 commit | 技術重點 | 分析時間 | Screens／Endpoints／Components |
| --- | --- | --- | ---: | --- |
| [oussamazoghlami/SpringStrutsHibernate](https://github.com/oussamazoghlami/SpringStrutsHibernate) | `4bc925b` | Struts 1.3 + Spring `DelegatingActionProxy`、Tiles 1、struts-menu、Spring Security 3、Maven 子模組 `StrutsSpringExample/` | 2 s | 3／4／16 |
| [RawSanj/spring-tiles-sample-app](https://github.com/RawSanj/spring-tiles-sample-app) | `7cb7c61` | Spring MVC 4.0 + Tiles 3（`UrlBasedViewResolver`+`TilesView`）、Spring Security 3.2 XML、AdminLTE、jQuery Ajax | 6 s | 10／12／151 |
| [oktadev/okta-spring-boot-react-crud-example](https://github.com/oktadev/okta-spring-boot-react-crud-example) | `6d75759` | Spring Boot 3 REST + Create React App（`.js` 檔內寫 JSX）、react-router v6、reactstrap | 0 s | **0**／7／**0** |
| [chrisekelley/zeprs](https://github.com/chrisekelley/zeprs) | `6ea4232` | 大型 Struts 1.2 醫療紀錄系統：197 JSP、661 Java、100 個 `.tag` 檔；實際設定 `/WEB-INF/foo.xml`（276 actions） | 6,357 s | 198／266／148,598 |

另以 `okta-jsx-variant`（把 okta 前端 6 個 `.js` 改名為 `.jsx` 的副本，內容不變）驗證 React 分析器本身：3 screens／9 endpoints／14 components。

## 執行方式

```bash
java -Duser.home=<scratch-home> -Dscreentrace.home=<repo> \
  -Dscreentrace.js.module=<repo>/screentrace-js/cli.mjs \
  -jar screentrace-cli/target/screentrace-cli-0.1.0-SNAPSHOT.jar analyze <project-name>
```

`<scratch-home>/.screentrace/config.json` 指向暫存的 projects／out 目錄，避免改動使用者設定與自動開啟瀏覽器。之後以 [summarize-graph.py](real-projects-batch7-20261022/summarize-graph.py) 列出 Screen／Endpoint／Handler／關係／診斷，逐項對照原始 XML、Controller、JSP 與 React 原始碼。

## 修復狀態（2026-10-23）

全部修正以 merge commit 合併到 `main`，最後一個合併 commit 為 `bc4c22e`，其 CI（`build-and-test`、`dependency-audit`、`node-dependency-audit`）全部通過。合併前先在本機依序整合 17 個 PR 並跑完 Maven、JS 分析器、capture、viewer e2e 與四個專案實測，確認整合結果與 `main` 內容一致。

### 逐項狀態

| 編號 | 狀態 | PR | 修正後效果 |
| --- | --- | --- | --- |
| RP7-01 | 已修復 | [#26](https://github.com/sprangdes/screentrace/pull/26) | `package.json` 依賴 `react` 即偵測為 React；原始 okta 專案（`.js`）產生 3 個畫面 |
| RP7-02 | 已修復 | [#25](https://github.com/sprangdes/screentrace/pull/25) | 屬性值等於自身定義名稱時視為字串；7 個 Tiles 頁面皆以版型組成 |
| RP7-03 | 已修復 | [#28](https://github.com/sprangdes/screentrace/pull/28) | 依 web.xml `config`／`config/<module>` 載入設定；zeprs 550 個 endpoint 來自 `foo.xml`，舊樣板 0 個 |
| RP7-04 | 已修復 | [#27](https://github.com/sprangdes/screentrace/pull/27) | 共用 `SafeProjectFiles.parseXml` 接受外部 DOCTYPE（仍拒絕內部宣告）；`URL_MAPPING_UNRESOLVED` 消失 |
| RP7-05 | 已修復 | [#33](https://github.com/sprangdes/screentrace/pull/33) | `tag`／`as`／`component` 指向 router `Link` 的元件視為連結；okta 元件 14 → 20 |
| RP7-06 | 已修復 | [#36](https://github.com/sprangdes/screentrace/pull/36) | 只覆寫 `execute()` 的 `DispatchAction` 子類視為一般 Action；`STRUTS_DISPATCH_UNRESOLVED` 3 → 0 |
| RP7-07 | 已修復 | [#36](https://github.com/sprangdes/screentrace/pull/36) | 可證明程式從未回傳的 forward 改為 `STRUTS_FORWARD_UNUSED`，不再列為目的頁 |
| RP7-08 | 已修復 | [#37](https://github.com/sprangdes/screentrace/pull/37) | capture 由畫面推得巢狀 web root，並在子模組找 message bundle；Name／Address 等標籤正確 |
| RP7-09 | 已修復 | [#37](https://github.com/sprangdes/screentrace/pull/37)、[#38](https://github.com/sprangdes/screentrace/pull/38) | struts-menu 項目展開為連結；#38 讓版型內的相對連結到達 `/AddCustomer.do`、`/ListCustomer.do` |
| RP7-10 | 已修復 | [#35](https://github.com/sprangdes/screentrace/pull/35) | 依專案設定或宣告的 Spring 版本決定結尾斜線配對（INFERRED）；兩個假端點消失 |
| RP7-11 | 已修復（spring-tiles） | [#35](https://github.com/sprangdes/screentrace/pull/35) | Spring MVC 讀取 XML namespace 的 `<form-login>`／`<logout>`；spring-tiles 的登入表單與登出連結都有端點。SpringStrutsHibernate 走 Struts 分析流程，仍未處理（見後續待辦） |
| RP7-12 | 已修復 | [#34](https://github.com/sprangdes/screentrace/pull/34) | 相對 `fetch` 網址依畫面路由解析（INFERRED）；`GET /api/groups`、`GET /api/user` 有呼叫者 |
| RP7-13 | 已修復 | [#34](https://github.com/sprangdes/screentrace/pull/34) | 同一條件決定 URL 與 method 時拆成兩個請求；`URL_METHOD_MISMATCH` 2 → 0 |
| RP7-14 | 部分修復 | [#28](https://github.com/sprangdes/screentrace/pull/28) | 耗時主要來自 Javadoc 頁面，略過後 zeprs 6,357 s → 約 330 s；`JspTagFileExpander` 每個標籤重掃整頁、沒有進度輸出兩點仍待處理 |
| RP7-15 | 已修復 | [#27](https://github.com/sprangdes/screentrace/pull/27) | 解析錯誤不再印到 stderr，`mvc:resources` 每次分析只解析一次；zeprs `[Fatal Error]` 1,529 → 0 |
| RP7-16 | 已修復 | [#41](https://github.com/sprangdes/screentrace/pull/41) | 解析 Tiles 清單屬性並展開版型的 `c:forEach`；AdminLTE 樣式表正確載入 |
| RP7-17 | 已修復 | [#40](https://github.com/sprangdes/screentrace/pull/40) | 只有指令的 JSP 視為片段；`includes` 空白畫面消失 |
| RP7-18 | 已修復 | [#40](https://github.com/sprangdes/screentrace/pull/40) | `analyze <路徑>` 可用；未知名稱給出可讀錯誤與 exit 2，不再有 stack trace |
| RP7-19 | 已修復 | [#28](https://github.com/sprangdes/screentrace/pull/28) | 略過帶 javadoc 標記的 HTML，並以一則計數診斷回報 |
| RP7-20 | 已修復 | [#29](https://github.com/sprangdes/screentrace/pull/29) | 每個 forward 循環只回報一次；zeprs `STRUTS_REDIRECT_CYCLE` 73,970 → 17 |

### 合併後實測（`main` `bc4c22e`）

| 專案 | 修正前 Screens／Endpoints／Components | 修正後 Screens／Endpoints／Components | 預覽 |
| --- | --- | --- | --- |
| SpringStrutsHibernate | 3／4／16 | 2／4／20 | 2／2 |
| spring-tiles-sample-app | 10／12／151 | 10／12／151 | 10／10，AdminLTE 樣式載入 |
| okta-spring-boot-react-crud-example（原始 `.js`） | 0／7／0 | 3／9／20 | 3／3 |
| zeprs | 198／266／148,598（6,357 s，預覽 0） | 197／563／2,042（329 s） | 197／197 |

spring-tiles 的畫面數相同，但其中 4 個 Tiles 頁面由單獨的 body JSP 改為完整版型，並有登入、登出與 Ajax 端點。

### 修復時另外發現並修復的問題

- **預覽讀取上限與 context path（[#29](https://github.com/sprangdes/screentrace/pull/29)）**：capture 讀 graph 的上限 16 MiB 改為 256 MiB；JSP 寫死 context path 的樣式網址（`<td background="/zeprs/images/…">`）在預覽中會變成輸出目錄外的 `file:///zeprs/…`，造成整個分析中止，改為無害的 `about:blank`。
- **27 個畫面被跳過（[#30](https://github.com/sprangdes/screentrace/pull/30)）**：`convertControls` 把 `<bean:write>` 本身的屬性再跳脫一次；`createElementNS` 拒絕由 JavaScript 文字產生的元素名稱。
- **只以 `<script src>` 載入的 JSP 被當成畫面（[#31](https://github.com/sprangdes/screentrace/pull/31)）**：zeprs 的 `engine2.jsp`；同時移除 script `src` 的 `;jsessionid` 路徑參數，JSP 不再當成 JavaScript 分析。
- **JavaScript 行為依呼叫路徑爆量（[#32](https://github.com/sprangdes/screentrace/pull/32)）**：同一效果改為一筆行為，條件以 OR 合併；zeprs 行為 42,555 → 9,488、報表 150 MB → 81 MB。同時修正 `else` 分支遺失外層條件，並更新 WP10 golden 計數。
- **Tiles 版型與轉送 JSP 的相對連結（[#38](https://github.com/sprangdes/screentrace/pull/38)）**：改依畫面被請求的 action 網址目錄解析，不再依 JSP 檔案所在資料夾。
- **JSP 連結的 `NAVIGATE` 使用原始 href 樣板（[#35](https://github.com/sprangdes/screentrace/pull/35)）**：改用已解析的目標；並避免覆蓋 adapter 已證明的精確端點（整合 #25 與 #35 時發現）。
- **`safe-files` 在 Linux CI 偶發 `EBADF`（[#39](https://github.com/sprangdes/screentrace/pull/39)）**：讀檔改由 FileHandle 單一擁有描述符。

### 後續待辦

- RP7-14 剩餘部分：`JspTagFileExpander` 每個標籤重新掃描整頁；大型分析沒有進度輸出。
- `.properties` 以 UTF-8 讀取，Latin-1 的 `©` 顯示為 `�`。
- Struts + Spring 混合專案不執行 `SpringSecurityProcessors`，SpringStrutsHibernate 的 `/j_spring_security_logout` 仍未解析。
- React：`window.location.href = //host:port/api/private` 仍產生協定相對的假端點；axios 的 URL／method 三元式未成對展開。
- Struts：一般 `<form action="x.do">` 內送出按鈕的相對網址仍依 JSP 資料夾解析；`return null` 後直接寫出 PDF 的下載沒有表示。
- Tiles：Tiles 3 `inherit="true"` 的清單合併未支援；Struts adapter 尚未輸出 Tiles 清單屬性。
- Gradle 專案沒有版本來源，不會套用結尾斜線規則。
- 依離線政策，Bootstrap 與圖示字型等 CDN 資源不封裝，預覽中部分元件仍不完整；struts-menu 的 displayer 樣式未重現。
- `NonInteractiveCliTest` 的 symlink 報表逐位元組比對曾在 CI 失敗一次（重跑通過，原因未查明）。
- zeprs 合併後最長的 OR 條件達 1,877 字元，內容正確但可讀性差。

## 問題清單

優先度：**P1** 主要畫面或流程遺失／錯誤；**P2** 部分流程錯誤或誤判；**P3** 雜訊、易用性或效能。

### P1

| 編號 | 專案 | 問題 | 來源證據 | 實測結果 |
| --- | --- | --- | --- | --- |
| RP7-01 | okta React | **React 只以 `.tsx`／`.jsx` 副檔名偵測**；Create React App 慣用 `.js` 寫 JSX，整個前端被略過 | `ProjectScanner.java:101` 只看 `.tsx`／`.jsx`；`ReactGraphContribution.applies()` 只看 technology `React`，但它的 `EXTENSIONS` 已含 `.js`。`app/package.json` 依賴 `react`、`react-router-dom` | 0 screens、0 components，只剩 7 個無呼叫者的 REST endpoint；`.jsx` 副本即產生 3 screens |
| RP7-02 | spring-tiles | **Tiles 定義的屬性值剛好等於某個定義名稱時，整個頁面定義被當成片段丟掉** | `general.xml` 的 `login`／`register`／`account` 有 `<put-attribute name="current" value="login|register|account"/>`、`upload` 有 `upload=upload`；版型只以 `tilesx:useAttribute` 當字串讀取。`SpringMvcAnalyzer.addTilesDefinitions()` 把 `names.contains(attribute.value())` 的定義全加入 `fragments` | 7 個 Tiles 頁面只產生 3 個（home／error404／error500）；另外 4 個退化為單獨的 body JSP 畫面，沒有 `common.jsp`／`page.jsp` 版型、側欄與登出連結（截圖只剩 body）。**已修復**：屬性值等於自身定義名稱時視為字串；重跑後 7 個 Tiles 頁面皆以版型組成，回歸測試 `keepsTilesPagesWhoseAttributeValueNamesTheirOwnDefinition` |
| RP7-03 | zeprs | **Struts 設定檔只以檔名 `struts-config*.xml` 發現，忽略 web.xml 的 `config` init-param** | `web.xml:15` `config=/WEB-INF/foo.xml`（276 actions，由自訂 `DynasiteConfigServlet` 載入）；同目錄的 `struts-config.xml`（126 actions）是舊樣板。`ProjectScanner.strutsConfigFiles()` 只比對檔名；capture 端 `struts-messages.mjs` 卻有讀 `config` 參數，兩邊不一致 | 266 個 endpoint 中 250 個來自 `struts-config.xml`，`foo.xml` 的 276 個 action 完全沒進圖；畫面流程是舊樣板而非實際系統 |
| RP7-04 | SpringStrutsHibernate、spring-tiles | **含 DOCTYPE 的 web.xml 無法解析 servlet mapping**。Servlet 2.3 的 web.xml 一定有 DOCTYPE，legacy 專案很常見 | `UrlGraphContribution.extensions()` 以 `disallow-doctype-decl=true` 直接 parse，沒有像 `StrutsSources.xml()` 先遮蔽 DOCTYPE | `URL_MAPPING_UNRESOLVED`（web.xml:1）；stderr 印出 `[Fatal Error] :1:10: DOCTYPE is disallowed` |
| RP7-05 | okta React（`.jsx` 副本） | **reactstrap `<Button tag={Link} to=…>` 不被視為導覽元件，元件本身也消失** | `GroupList.js:57` Edit、`:69` Add Group、`GroupEdit.js:93` Cancel、`AppNavbar.js:11` `NavbarBrand tag={Link} to="/"` | groups 畫面只剩 NavbarToggler 與 Delete；列表→新增／編輯、編輯→取消、品牌→首頁的導覽全部缺失 |
| RP7-19 | zeprs | **生成的 Javadoc HTML 被當成前端頁面解析**，graph 爆量後靜態預覽整批失敗 | `docs/` 下 1,877 個 javadoc `.html`（非 web root、不會被部署） | 148,598 個 Component 中 146,662 個（98.7%）來自 `docs/`；`application-graph.json` 262 MB，超過 capture 的 16 MiB 讀取上限（`safe-files.mjs:108` `File exceeds 16777216 byte limit`），**198 個畫面全部沒有預覽**；報表 205 MB |

### P2

| 編號 | 專案 | 問題 | 來源證據 | 實測結果 |
| --- | --- | --- | --- | --- |
| RP7-06 | SpringStrutsHibernate | 繼承 `DispatchAction` 但**覆寫 `execute()`** 的 Action 仍被當成 dispatch，Handler 名為 `<dispatch>()` | `AddCustomerAction`、`ListCustomerAction`、`JasperListCustomerAction` 都 `extends DispatchAction` 並覆寫 `execute`；mapping 沒有 `parameter` | 3 個 `STRUTS_DISPATCH_UNRESOLVED`；3 條 `HANDLED_BY` 為 UNRESOLVED |
| RP7-07 | SpringStrutsHibernate | Java 未使用的 XML forward 被記為 CONFIRMED 目的頁 | `JasperListCustomerAction.execute()` 只 `findForward("error")`（XML 無此 forward）或 `return null`（直接寫出 PDF）；XML 宣告的 `success` 從未被使用 | `FORWARDS_TO … → List of customers` 為 CONFIRMED；PDF 下載（回傳 null）沒有被表示 |
| RP7-08 | SpringStrutsHibernate | Struts message bundle 只在專案根目錄的 `src/main/resources` 等固定路徑尋找，**Maven 子模組**找不到 | `struts-messages.mjs` 候選為 `projectRoot/src/main/resources/Customer.properties`；實際在 `StrutsSpringExample/src/main/resources/`。Java 端以尾碼比對能找到 | 預覽全部顯示「（訊息 key：customer.label.name）」等 key，不是 Name／Address／Submit |
| RP7-09 | SpringStrutsHibernate | 不支援 struts-menu（`menu-config.xml` + `<menu:displayMenu>`） | `mainLayout.jsp` 以 `menu:useMenuDisplayer` 顯示 `adminCustomer`／`contact` 兩組選單，共 4 個項目指向 `AddCustomer.do`／`ListCustomer.do` | 左側選單在預覽中是空白，4 個導覽元件與關係不存在 |
| RP7-10 | spring-tiles | Ajax URL 的**結尾斜線**不配對；Spring 4.0 預設 `useTrailingSlashMatch=true` | `account.jsp:86` `url:'/account/upload/'`、`:106` `'/account/ajaxreturn/'`；Controller 為 `POST /account/upload`、`POST /account/ajaxreturn` | 2 個 `URL_UNRESOLVED`，另外生出兩個不存在的 endpoint `POST /account/upload/`、`POST /account/ajaxreturn/` |
| RP7-11 | spring-tiles、SpringStrutsHibernate | Spring Security **XML namespace** 的 `<form-login>`／`<logout>` 處理 URL 不被識別（`SpringSecurityProcessors` 只處理 Java DSL） | `security.xml:16-17` `form-login login-page="/login"`、`logout logout-url="/logout"`；Security 3.2 預設處理 URL `/j_spring_security_check`。`ApplicationContext-Security.xml` 的 `<form-login/>`／`<logout/>` 同理 | 登入表單 `/j_spring_security_check`、登出 `/logout`、`/j_spring_security_logout` 皆 UNRESOLVED |
| RP7-12 | okta React（`.jsx` 副本） | 相對路徑 `fetch('api/groups')`／`fetch('api/user')`（無開頭 `/`）沒有對到 endpoint | `GroupList.js:16`、`Home.js:17`；路由 `/groups`、`/` 下解析結果應為 `/api/groups`、`/api/user`，皆有 Controller | 兩個 load 行為 `targetId=null`；`GET /api/groups`、`GET /api/user` 在 API 頁會顯示為未被使用 |
| RP7-13 | okta React（`.jsx` 副本） | URL 與 method 由**同一條件**決定的 ternary 沒有成對展開 | `GroupEdit.js:38-39` ``fetch(`/api/group${group.id ? `/${group.id}` : ''}`, {method: (group.id) ? 'PUT' : 'POST'})`` | 2 個 `URL_METHOD_MISMATCH`，送出表單的 `POST /api/group`、`PUT /api/group/{id}` 都沒有呼叫者 |
| RP7-20 | zeprs | Struts forward 循環偵測以路徑窮舉回報，診斷爆量 | 例：`/ChooseReportAction → /home → /admin/users → /home` | 12,977 筆 `STRUTS_REDIRECT_CYCLE`（9,128 種不同訊息），實際循環只有少數幾個；應以循環（強連通分量）為單位回報一次 |

### P3

| 編號 | 專案 | 問題 | 來源證據 | 實測結果 |
| --- | --- | --- | --- | --- |
| RP7-14 | zeprs | **大型專案分析極慢且沒有進度輸出**。熱點在 `JspTagFileExpander.expand()`：每個標籤都呼叫 `tagFile(root,pagePath,text,name)`，而這個多載每次重新 `prefixes(text)` 掃描整頁（O(標籤數 × 頁面長度)），再乘上 100 個 `.tag` 檔的遞迴展開 | 分析開始後 4–8 分鐘內三次 `jstack` 取樣 main thread 都在 `JspTagFileExpander.prefixes → MarkupTag.scan` | 分析耗時 6,357 秒（約 1 小時 46 分），全程單核心、無任何進度輸出；另印出 1,529 行 `[Fatal Error]` |
| RP7-15 | spring-tiles | 解析失敗的 XML 直接印到 stderr，且同一檔案被重複 parse | `ScriptSources.resourceMappings()` 對每個 script src 都重新 parse 所有含 `resources` 字樣的 XML，沒有設定 ErrorHandler；含 DOCTYPE 的 `general.xml` 每次失敗 | 一次分析印出 60 行 `[Fatal Error] :2:10: DOCTYPE is disallowed…` |
| RP7-16 | spring-tiles | Tiles `put-list-attribute`（stylesheets／javascripts）沒有展開，`<c:forEach>` 內的 `<c:url value="${css}"/>` 無法解析 | `general.xml` 的 `stylesheets`／`javascripts` 清單；`common.jsp` 以 `tilesx:useAttribute` + `c:forEach` 輸出 | AdminLTE 與 skin CSS 未封裝，home 預覽無樣式（頭像圖片撐滿整頁） |
| RP7-17 | SpringStrutsHibernate | 只含 taglib 宣告的 `includes.jsp` 被當成畫面 | `pages/tiles/includes.jsp` 只有 5 行 `<%@ taglib %>`，無任何 include 者 | 出現空白畫面 `includes` |
| RP7-18 | CLI | `analyze` 傳入路徑時丟出 Java stack trace | `./bin/screentrace analyze /abs/path` → `IllegalArgumentException: Project not found` from `ProjectCatalog.named`；README 只說明 `analyze 專案名稱`，但一步式 `./bin/screentrace /path` 接受路徑，兩者不一致 | 使用者看到未處理例外；應接受路徑或給出可讀錯誤 |

## 正確解析的部分

- SpringStrutsHibernate：`DelegatingActionProxy` 透過 `StrutsActionBeans.xml` 的 `<bean name="/AddCustomer">` 正確解析到實際 Action class；`ForwardAction parameter=.page.addCustomer`、`input=.page.addCustomer`（檢核失敗回原頁）、`redirect="true"` 到 `/ListCustomer.do` 都正確；Tiles 1 `extends` 組合與 `title` put 命名畫面正確；`JasperListCustomerAction` 的未定義 forward `error` 有 `STRUTS_FORWARD_UNRESOLVED`。
- spring-tiles：`@RequestMapping("account")`（無開頭斜線）與方法層級路徑組合正確；`<form:form>` 無 action 時提交到目前 URL 並配對 `POST /register`（但與 `ANY /register` 並列為 AMBIGUOUS；Spring 會選較具體的 POST 映射，可再收斂）；`return "redirect:/account"`、`redirect:/account/upload?success=…` 的 query string 被忽略並正確配對；`login` 畫面帶有 Security `LOGIN_PAGE` 證據；AdminLTE 範本的 35 個死連結（`../../index2.html` 等）誠實標為 `JSP_ROUTE_UNRESOLVED`；`href="javascript::;"` 的 9 個 `JS_SYNTAX_ERROR` 是來源本身的錯字，回報正確。
- okta（`.jsx` 副本）：react-router v6 `<Routes>/<Route element>` 三條路由、`useNavigate` 提交後導回 `/groups`、`id !== 'new'` guard、`DELETE /api/group/${id}`、`POST /api/logout` 都正確；`window.location.href` 到 `/api/private` 保留為 UNRESOLVED（同源 OAuth2 入口，可再正規化成 `/api/private`，列入 RP7-12 同類改善）。

## 未驗證範圍

- 沒有建置或執行任何目標專案，也沒有連線資料庫或外部服務；所有預期都來自原始碼。
- 只在 graph 與截圖層級核對，未操作報表中的原型點擊流程，也沒有重做前批的 Playwright 操作測試。
- `okta-jsx-variant` 是改名副本，只用來證明 RP7-01 之後的 React 分析能力，不代表原專案目前的結果。
- 分析產物留在暫存目錄（未提交）；[evidence](real-projects-batch7-20261022/) 只保存專案清單、摘要腳本與 graph 摘要文字。
