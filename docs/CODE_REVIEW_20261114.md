# ScreenTrace 全專案 Code Review — 2026-11-14

- 基準：`e796e3a`（main，含 WP123）；分支：`claude/jolly-hamilton-htyxgq`。
- 範圍：7 個 Maven 模組的 `src/main`、`screentrace-js`、`screentrace-capture`、`screentrace-viewer`、`bin/` 啟動腳本。
- 方法：依模組分組做靜態程式審查（閱讀原始碼、追蹤呼叫路徑），未執行目標應用程式，也未修改任何產品程式碼。
- 驗證狀態：標 **［已核對］** 的項目已回到原始碼逐行確認；其餘為審查推論，修正前應先以合成 fixture 重現。
- 前次 [CODE_REVIEW_20261031](CODE_REVIEW_20261031.md) 與 [HEALTH_CHECK_20261111](HEALTH_CHECK_20261111.md) 已結案項目不重列。

優先度：

- **P1**：整次分析中止、資料遺失、或產出確定錯誤且無診斷的結果。
- **P2**：特定情境下關係錯誤、遺漏或誤判；或安全防線有缺口但仍有第二道防線。
- **P3**：效能（多為 O(n²) 以上或重複解析）、重複程式碼、死碼。

## 總表

| 模組 | P1 | P2 |
|---|---|---|
| bin／cli／core／scanner／report | 3 | 17 |
| adapter-spring | 1 | 21 |
| adapter-struts | 2 | 24 |
| parser-jsp | 2 | 28 |
| js／capture | 2 | 22 |
| viewer | 1 | 12 |
| **合計** | **11** | **124** |

P3 依主題合併為 18 組（RV-701～710 效能、RV-801～808 重複程式碼與死碼），每組涵蓋多個位置。

P1 處理結果見各項「狀態」（R53，[ADR 0144](adr/0144-r53-code-review-p1-fixes.md)）：9 項修正、RV-006 不成立、RV-009 降為 P2 性質。

建議修正順序：先處理 P1（RV-001～RV-011），再處理同一主題的 P2 群組（見文末「跨模組主題」），P3 依效能量測結果挑選。

---

## P1

### RV-001 ［已核對］`bin/screentrace setup` 安裝 node@18，但需求是 Node 22

位置：`bin/screentrace:6,54,63`。`required_node=22`，`ensure_runtime` 卻 `brew install node@18` 並把它放到 PATH 最前面；之後 `needs_node` 必然失敗，macOS 上自動 setup 永遠無法完成。
建議：改為 `node@22`，並讓版本號由 `required_node` 推導。
狀態：已修正（R53）。

### RV-002 ［已核對］`RelationshipsByFrom` 的索引在 `removeIf` 後殘留已刪除的邊

位置：`screentrace-parser-jsp/.../UrlGraphContribution.java:341`、`RelationshipsByFrom.java:14`。類別只覆寫 `put`，`entrySet().removeIf` 繞過 `byFrom` 索引；後續 `edges.from(trigger)`（`:84`、`:152`）仍回傳已刪除的 TRIGGERS 邊，對應 behavior 被 `continue` 跳過而永遠不解析。
建議：覆寫 `remove`／`entrySet` 或提供 `removeIf` 同步索引；或改為組合（has-a）而非繼承 `TreeMap`。
狀態：已修正（R53）：覆寫 `remove`／`clear`，`from()` 過濾已不在 map 中的關聯。

### RV-003 ［已核對］`workflow-gates.mjs` 對無大括號的 `if (n==1) stmt;` 拋 TypeError，整個 JS 分析中止

位置：`screentrace-js/workflow-gates.mjs:148`。`remaining[0].consequent.body` 在 consequent 為 ExpressionStatement 時是 `undefined`，下一行 `remaining.length` 拋錯，`cli.mjs` 不回傳任何 behavior。
建議：consequent 為 BlockStatement 才取 `.body`，否則包成 `[consequent]`。
狀態：已修正（R53）。

### RV-004 ［已核對］viewer 重新載入時，舊的 `:library-transfer` 暫存蓋掉之後的所有決策

位置：`screentrace-viewer/src/shared/review.ts:388,413-415`。`loadReview` 優先讀 `:library-transfer`，但 `saveReview` 只在 state 有 `manifest_sha256` 或 orphans 時才更新該鍵；`main.ts` 用 `withoutRetiredFields` 清掉這兩個欄位後，transfer 鍵永遠停在舊快照。曾用舊版報告做過元件庫覆寫的使用者，每次重新整理都會遺失新決策。
建議：沒有 transfer 資料時刪除該鍵；或載入時比較時間戳／版本，取較新者。
狀態：已修正（R53）：transfer 鍵存在時，每次儲存都一併更新。

### RV-005 重新分析沿用上一次的 `static-preview/` 等輸出

位置：`screentrace-cli/.../ScreenTraceCli.java:559,700`。分析前未清除 `static-preview/`、`viewer-documents.json`、`react-preview.json`；擷取逾時、失敗或本次不需擷取時，`packPreview` 與 `PreviewCaptureReader` 會讀到舊檔。結果是 `Preview component does not belong to its screen` 使整次分析失敗，或報告靜默顯示舊原始碼的預覽。
建議：擷取前清空預覽輸出目錄，或在 manifest 記錄 graph 指紋並於讀取時比對。
狀態：已修正（R53）：寫完分析圖後、產生預覽前刪除 `static-preview/`、`screenshots/`、`viewer-documents.json`。

### RV-006 Spring `ModelAndView` 多路徑產生重複 FORWARDS_TO 邊 id，整次分析失敗

位置：`screentrace-adapter-spring/.../SpringControllerFlow.java:39`（`addApiRedirects` `:192` 同理）。`m.setViewName(...)` 前有不影響 view 的 `if` 時，`SpringControllerReturns` 回傳兩個除 guard 外完全相同的 Target，邊 id 重複，`GraphIntegrityValidator.requireAnalysis` 拋 `Duplicate or blank relationship`。
建議：`assignedPaths` 依 (value, source) 去重，或 `edges.add` 前以 id 去重。
狀態：**不成立**：以 `if`／`if-else`／連續 `if`／`switch` 接 `setViewName`、一般 view 與 `redirect:` 共 8 種寫法重現，邊 id 都不重複，FORWARDS_TO／RENDERS 各 1 條；路徑在上游已去重。

### RV-007 Struts 框架偵測遇到任一檔案讀取／解析失敗就中止整個分析

位置：`screentrace-adapter-struts/.../StrutsFrameworkDetector.java:78`。單一超過 8 MB 的 XML/Java（測試資料、WSDL）或格式錯誤的 `pom.xml` 會回傳 `FRAMEWORK_DETECTION_UNRESOLVED`，CLI 視為不支援的框架並拋 `UnsupportedFrameworkException`；連純 Spring 專案也會被擋。
建議：與 `javaTypes` 一致，把讀取失敗降為非致命診斷，只在證據互相矛盾時才判定 unresolved。
狀態：已修正（R53）。**更正**：掃描器已略過超過 8 MiB 的檔案、讀取不會因編碼失敗，實際觸發點是格式錯誤的 XML（例如 `pom.xml`）。修法：無法解析的檔案改掃描原始位元組，不含 `struts2` 即略過，含有時維持停止分析。

### RV-008 Struts 根目錄的 JSP 觸發 NPE

位置：`screentrace-adapter-struts/.../StrutsInteractions.java:487`（`collectIncludeSources` 同理）。`Path.of(jspPath).getParent()` 對根目錄檔案回傳 `null`，NPE 不在 catch 範圍內，`analyze()` 整體失敗。
建議：`getParent()` 為 null 時以空路徑解析。
狀態：已修正（R53）。

### RV-009 Tiles 畫面以顯示名稱當作 Tiles definition 名稱，畫面內元件全部遺失

位置：`screentrace-parser-jsp/.../MarkupGraphContribution.java:89`。投影根用 `screen.name()`，但 Struts adapter 把它設成 title put／body JSP／人性化名稱；真正的 definition 名稱在 `tilesDefinitionName` 屬性。結果 roots 被換成不存在的名稱，畫面沒有任何 CONTAINS 邊，原本的 view root 也被移除。
建議：改讀 `tilesDefinitionName` 屬性。
狀態：已修正（R53）。**更正**：Struts adapter 本身已建立 CONTAINS 邊，元件不會消失；遺失的是標記投影的證據（JspMarkupParser）、guard 與 repeated 資訊，實際應屬 P2。

### RV-010 `ScreenTraceCli` 的 `library` 子命令與用法錯誤一律以例外或 exit 0 結束

位置：`ScreenTraceCli.java:64,771`。`library import` 寫入失敗時在 stdout 印錯誤訊息但 exit 0；`IllegalArgumentException`（無效 manifest、參數錯誤、`Command.parse` 的 Usage）未被 `runReportingRefusals` 捕捉，直接印 stack trace。腳本與 CI 會把失敗當成功。
建議：統一捕捉並回傳非 0（用法錯誤 exit 2）。
狀態：已修正（R53）：用法錯誤與無效 `library` 指令 exit 2，`library` 讀寫失敗 exit 1，皆只印一行訊息。

### RV-011 `spring-resource-mappings.mjs` 的 `mapping` 未過濾 `..`，資源可寫出 `static-preview/assets` 之外

位置：`screentrace-capture/spring-resource-mappings.mjs:97`。`<mvc:resources mapping="/../../**">` 會把專案檔複製到輸出根目錄，可能覆蓋 `application-graph.json`；更多層的 `..` 讓 `assertOutputPathWithin` 拋錯而整個預覽失敗。註解掉的 `<mvc:resources>` 也會被比對到。
建議：assetKey 正規化後拒絕含 `..` 的值並發出診斷；解析前先移除 XML 註解。
狀態：已修正（R53）：含 `.`、`..`、空段或反斜線的 mapping 不採用，並先移除 XML 註解。

---

## P2 — bin／cli／core／scanner／report

- **RV-101** `bin/screentrace:121`、`bin/screentrace.ps1:101`：重建檢查沒排除預設輸出 `analyze/`，報告 HTML 比 jar 新，每次啟動都跑 `npm ci` + viewer build + `mvn package`。
- **RV-102** `bin/screentrace:32`：`maven_version` 直接取第一行第三欄；JDK 先印 WARNING 時取到單字，算術失敗且被視為通過 3.9 檢查。
- **RV-103** `ScreenTraceCli.java:727`：`packPreview` 固定 120 秒且逾時拋例外中止整次分析；擷取已依畫面數放寬到最多 30 分鐘，大專案更容易走到這裡。
- **RV-104** `ScreenTraceCli.java:701`：擷取逾時只結束直接的 `node` 程序，Playwright Chromium 與版本管理 shim 底下的實際 node 成為孤兒，並與後續 `packPreview` 競爭寫入。應沿用 `JavaScriptGraphContribution` 的 `descendants().forEach(destroyForcibly)`。
- **RV-105** `ScreenTraceCli.java:684`：30 分鐘上限約 840 個畫面就會碰到；擷取腳本只在全部完成後才寫 manifest，一旦被結束就失去所有預覽（HC-004 根因未解）。建議腳本自行管理截止時間並逐步寫出已完成畫面。
- **RV-106** `ScreenTraceCli.java:679`：WP123 把 `@SuppressWarnings("java:S4036")` 移到 `captureTimeoutSeconds`，Javadoc 也因在標註之後而成為懸空註解。
- **RV-107** `ApplicationGraphMerger.java:113`：兩邊合併同一 behavior、只有一邊解析出 target 時，合併結果 target 變 null 且不留證據。
- **RV-108** `ApplicationGraphMerger.java:152,154`：`mergeNode` 只保留左邊的屬性、型別、名稱、confidence，右邊衝突值與屬性（例如 `routeAliases`）靜默丟失；evidence 未去重。
- **RV-109** `GraphIntegrityValidator.java:41,86`：同一種驗證失敗依有無 personas 拋不同例外型別；`Set.of(...).contains(null)` 在欄位為 null 時拋 NPE 而非驗證訊息。
- **RV-110** `ApiUsage.java:275`（viewer `usage.ts:41` 同理）：巢狀 CALL_API behavior（無 triggerId、經 parentId 回溯）沒有抑制對應的 CALLS 邊，同一呼叫計兩次。
- **RV-111** `PrototypeModelGenerator.java:128`：佈局計數器跨畫面共用且 x 永不前進，第 7 個元件與第 1 個完全重疊。
- **RV-112** `PrototypeModelGenerator.java:76`：被多個畫面 CONTAINS 的元件產生多筆相同 id 的 prototype 元件。
- **RV-113** `ProjectScanner.java:287`：`build`、`target` 等忽略目錄比對任何深度的路徑段，`com/acme/build/` 套件或 `webapp/target/` 被靜默略過。
- **RV-114** `BuildVersions.java:51`：所有 POM 的 properties 合併成一張表且 `putIfAbsent`，子模組覆寫的版本被根 POM 的值取代。
- **RV-115** `PreviewModel.java:230`（`PrototypeModel:328`、`EditOverlay` 同理）：`Map.copyOf(new TreeMap(...))` 丟失排序，序列化結果跨 JVM 不穩定；null 值拋 NPE。
- **RV-116** `InteractiveConsole.java:44,274`：路徑提示不展開 `~`，未處理 Ctrl-D／Ctrl-C 與 `InvalidPathException`；選單寬度未限制，長標籤換行後重繪殘影。
- **RV-117** `ReportBrowser.java:241`：`readAllBytes()` 在 `waitFor(5s)` 之前，`reg query` 卡住時整個流程掛住。

## P2 — adapter-spring

- **RV-201** `SpringServerValidation.java:68`：自建 JavaParser 用 JAVA_17，其餘用 `JavaSources`（JAVA_21）；含 record pattern 的檔案在這裡解析失敗、驗證規則遺失。
- **RV-202** `SpringMvcAnalyzer.java:1379`、`SpringBootAnalyzer.java:318`：`method = {GET, POST}` 被轉成字串 `"{ GET, POST }"`，`methodMatches` 永遠不成立，表單無 TRIGGERS 邊。
- **RV-203** `SpringSecurityProcessors.java:350`：同一 XML 多個 `<http>` 的 form-login handler 共用 id，互相覆寫，各登入端點指向對方的目的地。
- **RV-204** `SpringSecurityRedirects.java:21`：先讀檔再檢查副檔名，所有 jar／圖片都被讀取；超過 8 MB 產生無關的 `SPRING_SECURITY_PARSE` 診斷。
- **RV-205** `SpringMvcAnalyzer.java:668`：`BeanNameUrlHandlerMapping` 只認 `id` 以 `/` 開頭，常見的 `name="/x.htm"` 寫法不產生端點。
- **RV-206** `SpringControllerFlow.java:551`：`project()` 以相同 id 公式產生 NAVIGATES_TO，`put` 覆蓋既有 CONFIRMED 邊而降為 INFERRED。
- **RV-207** `SpringMvcAnalyzer.java:745`：XML controller 只記 `screensByEndpoint`，沒記 `endpointsByScreen`，無 action 的 form 與相對連結無法解析。
- **RV-208** `SpringMvcAnalyzer.java:1151`：相對 URL 只做字串串接，未正規化 `..`／`.`。
- **RV-209** `SpringMvcAnalyzer.java:1005`：多個 Tiles definition 共用 body JSP 時，靜默摺疊到字母序第一個，未發 AMBIGUOUS 診斷。
- **RV-210** `SpringMvcAnalyzer.java:446`：含 `throw` 且 view 無法解析的 handler，在未設定例外 resolver 時完全沒有診斷。
- **RV-211** `SpringSecurityProcessors.java:177`：Java config 的 formLogin／logout 新增端點後，未清除先前的 `URL_UNRESOLVED`／`URL_METHOD_MISMATCH` 診斷。
- **RV-212** `SpringDtoSimulation.java:256`：覆寫而非合併 `simulationBindings`，SpringDataSimulation 的示範資料遺失。
- **RV-213** `SpringBootAnalyzer.java:342`：`returnLiteral` 只取第一個字串 return，含 lambda 內的 return，其他分支的畫面遺失。
- **RV-214** `SpringControllerReturns.java:455`：未重新指派的 `String view = "home"; return view;` 判為 UNKNOWN。
- **RV-215** `SpringMvcAnalyzer.java:217`：`jspPreview` 不看 input type，hidden `_csrf` 與 text 預設值被當成 ACTION 按鈕。
- **RV-216** `SpringProjectAnalyzer.java:159`：只認根目錄的 `src/main/resources/templates/`，多模組 Thymeleaf 專案被導到 SpringBootAnalyzer 而遺失伺服器端畫面。
- **RV-217** `SpringExternalCalls.java:53`：任一 Java／XML 讀取或解析失敗就整個略過 externalCall 標註，且無診斷。
- **RV-218** `SpringFormBindings.java:104`：FORM_MODEL 欄位包含 static 欄位（`serialVersionUID`）。
- **RV-219** `SpringMvcAnalyzer.java:641`：properties view resolver 要求 prefix 與 suffix 都設定（Spring 預設空字串）；且讀入 test resources 的設定。
- **RV-220** `SpringWebFlowContribution.java:76`：registry 中一個 flow 失敗就中斷整個迴圈，其他 flow 全部遺失且保留部分寫入結果。
- **RV-221** `SpringControllerReturns.java:152`：`branchKey`（影響邊 id）與 `fullPage` 旗標是從中文證據文字字串比對取出，改寫文案就會改變 id。

## P2 — adapter-struts

- **RV-301** `StrutsActionInheritance.java:42`：action 內的 `<exception>` 被當成模組內所有 action 的出口，產生大量錯誤 CALLS 邊。
- **RV-302** `StrutsBehaviorProjection.java:174`：`forward()` 寫入 state 的診斷與既有節點更新沒有回寫到回傳的 graph。
- **RV-303** `StrutsConfigParser.java:255`：`inputForward="true"` 只查 global forwards，未先查 action 本地 forward。
- **RV-304** `StrutsForwards.java:351`：模組相對 forward 指向 action 時未加模組前綴，且 fallback 把 query string 一起當 key。
- **RV-305** `StrutsScreens.java:165`：welcome-file 依規格沒有前導 `/`，`index.do` 永遠對不到路由。
- **RV-306** `StrutsInteractions.java:97`：`<logic:forward name="...">` 的 `name` 沒被讀取，典型 index.jsp 轉址沒有目標。
- **RV-307** `StrutsControls.java:346`：`dispatchMethod`／`dispatchMethodStatus` 寫在已複製完的 map 上，為死寫入。
- **RV-308** `StrutsBehaviorProjection.java:137`：dispatch 端點寫死 `PROVEN`／`CONFIRMED`，並覆蓋既有 UNRESOLVED／AMBIGUOUS 節點與證據。
- **RV-309** `StrutsActionInheritance.java:197`：dispatch 方法只查目的類別自身方法，繼承自抽象父類別或 LookupDispatchAction 的情況失敗。
- **RV-310** `ActionContracts.java:37`、`StrutsWildcards.java:146`：用 XML 原始 `type` 而非 Spring 解析後的 `actionType`，`DelegatingActionProxy` 找不到實際類別；`effectiveType` 的 fallback 是死碼。
- **RV-311** `StrutsConfigParser.java:492`：任何 `struts-` 開頭的 artifact／jar（spring-webmvc-struts、struts-menu）都算 Struts 版本，造成版本衝突而所有 wildcard 變 AMBIGUOUS。
- **RV-312** `StrutsTiles.java:232,294`：`(?s).*\$\{|.*#\{|.*<%.*` 搭配 `matches()` 只偵測以 `${` 結尾的字串，含 EL 的標題被當成靜態。
- **RV-313** `StrutsDispatch.java:57`（`StrutsControls` 同理）：query string 未解碼 `&amp;`，XHTML 寫法的 dispatch 參數找不到。
- **RV-314** `StrutsServletMappings.java:251`：ActionServlet mapping 只讀排序第一個 web.xml，可能取到 `docs/sample/web.xml`。
- **RV-315** `StrutsControls.java:469`：任何同時有 `prefix` 與 `page` 參數的連結都被改寫成 SwitchAction 路徑（分頁連結誤判）。
- **RV-316** `StrutsControls.java:348`：MappingDispatchAction 產生不存在的 `?save=save` 請求參數。
- **RV-317** `StrutsInteractions.java:464`、`StrutsGraphSupport.java:48`：多處寫死 `src/main/webapp`／`WebContent`／`web`，未使用 `inventory.webRoots()`。
- **RV-318** `StrutsMessages.java:45`：`endsWith(param + ".properties")` 無路徑邊界，`Messages` 也比對到 `AdminMessages.properties`。
- **RV-319** `StrutsServletMappings.java:439`：route 已含前綴／後綴時不再加上，prefix mapping 的公開 URL 錯誤並產生假 DUPLICATE_ROUTE。
- **RV-320** `StrutsConfigParser.java:387`：未列於 `config/<module>` 的設定檔以子字串猜模組，且忽略預設 `config` 參數。
- **RV-321** `StrutsValidation.java:173`：只讀固定檔名，忽略 ValidatorPlugIn 的 `pathnames`。
- **RV-322** `StrutsTiles.java:40,199`：`<put>` 只讀 `value`，忽略 Tiles 1 的 `content`；fallback 用 `endsWith` 無路徑邊界，`/body.jsp` 對到 `userbody.jsp`。
- **RV-323** `StrutsActionInheritance.java:376`：證據迴圈與偵測迴圈的 `extends` 比對規則不同（無模組前綴），繼承範本缺少證據。
- **RV-324** `StrutsControls.java:225`：未對應路由分支傳 `control` 而非 `contextual`，behavior id 與元件 target 不一致。

## P2 — parser-jsp

- **RV-401** `JspProjectParser.java:592`、`MarkupGraphContribution.java:548`、`JspTagFileExpander.java:252`：絕對 include 與 tagdir 寫死 `src/main/webapp`，WebContent／WebRoot 專案的 include 與自訂標籤全部無法解析（主要目標的舊專案受影響最大）。
- **RV-402** `ScriptSources.java:97`：以預設語言層級的 JavaParser 解析，任一 record／switch expression 失敗就設全域 `unknownDefinitions`，關閉整個專案的 EL 值解析。
- **RV-403** `ScriptSources.java:131`：任何 `map.put(key, v)`（key 非字面值）都設 `unknownDefinitions`，幾乎所有專案都會觸發，`<c:set var>` 值永遠不會傳給 JS 分析器。
- **RV-404** `ThymeleafFragments.java:106`：fragment 檔不存在時例外跳出整個檔案的迴圈，後續合法的 `th:replace` 全部略過。
- **RV-405** `ThymeleafFragments.java:45`：只支援 `name(args)` 形式與 `th:replace`；最常見的無參數 `:: header` 與 `th:insert`／`th:include` 全部 unresolved 或被忽略。
- **RV-406** `ThymeleafFragments.java:30`：參數含 `${...}` 就回傳空清單，呼叫被無診斷地略過，或誤配到零參數 fragment。
- **RV-407** `JspTagFileExpander.java:50`：每一行都對應到頁面上所有展開過的 tag file 證據，追溯性錯誤。
- **RV-408** `StrutsMenus.java:352`：跨行的 `displayMenu` 被替換成單行，之後所有行號偏移。
- **RV-409** `MarkupGraphContribution.java:430`：依某畫面 include 情境得出的 `conditional`／`repeated` 寫到共用元件節點，影響其他畫面。
- **RV-410** `MarkupAnalysis.java:271`：無 type 的 `<button>`（HTML 預設 submit）與大寫 `SUBMIT` 被歸為 BUTTON，與 `submitsForm` 不一致。
- **RV-411** `ApiContractExtractor.java:58`：HttpSession、Principal、Locale、Pageable 等被記為 QUERY 欄位並覆寫 `bodyType`。
- **RV-412** `UrlGraphContribution.java:640`：`user.home` 遮蔽沒有路徑邊界，以 root 執行時 `/rootCategory/list` 變成 `[home]Category/list`。
- **RV-413** `ScriptSources.java:527`：AngularJS 取最外層 `ng-controller`，且忽略 `data-ng-controller`。
- **RV-414** `JavaScriptGraphContribution.java:260`：`valueOf` 失敗會丟棄迴圈內其餘所有 behavior 與診斷。
- **RV-415** `JavaScriptGraphContribution.java:409`：Node AST 分析器固定 60 秒逾時，大專案 JS／React 畫面全部遺失。
- **RV-416** `JspProjectParser.java:821`：parent 無法解析（含重複定義被移除）的 Tiles definition 整個消失。
- **RV-417** `JspProjectParser.java:733`：`put`／`put-attribute` 只讀 `value`，忽略 body content 與 `content=`。
- **RV-418** `MarkupTag.java:145`（`ScriptSources:484`）：每個 script／style 都重新 `toLowerCase` 整份原始碼；土耳其 `İ` 使長度改變、索引錯位。
- **RV-419** `ScriptSources.java:668`：每個 `mvc:resources` 的行號都取檔案中第一個 "mapping"。
- **RV-420** `ReactGraphContribution.java:776`：`targetRoutes` 候選畫面未去重，同一畫面被判為 AMBIGUOUS。
- **RV-421** `ReactGraphContribution.java:414`：空 route 時 `substring(1)` 拋例外，整個 React 貢獻中止。
- **RV-422** `JspProjectParser.java:567`：菱形 include 讓 fragment 的互動被加入兩次。
- **RV-423** `JspProjectParser.java:697`：標籤文字搜尋 `"</" + tag` 區分大小寫且無邊界，`</a` 也比對到 `</abbr>`。
- **RV-424** `ThymeleafMarkup.java:151`、`StrutsMenus.java:358`：URL 被 HTML escape 成 `&amp;` 後未解碼，graph 中保留 `&amp;`。
- **RV-425** `StrutsMenus.java:266`：假設 struts-config 位於 `WEB-INF/` 下一層，`WEB-INF/config/` 時找不到 menu 設定。
- **RV-426** `MarkupAnalysis.java:265`：不認 Struts `nested:` taglib。
- **RV-427** `JspProjectParser.java:537`：include 路徑含 query string 時未去除，判為找不到。
- **RV-428** `ScriptSources.java:157`：結束標籤不比對名稱就 pop scope，stray `</div>` 提前結束 `c:if` 範圍。

## P2 — js／capture

- **RV-501** `capture-static-jsp.mjs:638,641`：`String.replace` 以原始碼當替換字串，jQuery 的 `$'`、`$&` 被展開，預覽中重複出現版面內容。
- **RV-502** `struts-messages.mjs:22`：不解碼 `\uXXXX`、不處理行接續、以 UTF-8 讀取 ISO-8859-1 檔；native2ascii 產生的訊息檔顯示成原始跳脫字元。
- **RV-503** `struts-messages.mjs:58`：`config` init-param 為逗號分隔清單時被當成單一路徑。
- **RV-504** `capture-static-jsp.mjs:307,1013,205`：lexical 路徑與 realpath 混用；輸出或專案位於 symlink 下（macOS `/tmp`）時，CSS 資源被擋、`element-styles.json` 洩漏本機絕對路徑（HC-009 回歸）、CSS 編碼永遠無法解析。
- **RV-505** `analyzer.mjs:1077`：所有 `axios.*` 都當成 HTTP 請求，`axios.create` 產生 method `CREATE` 的假端點。
- **RV-506** `analyzer.mjs:1584`：`occurrences` 每個 unit 重設，同檔案兩段 inline script 的相同 behavior 產生相同 id 而互相覆蓋。
- **RV-507** `analyzer.mjs:1082`：不認 jQuery < 3 的 `$(window).load(fn)`，handler 內容不分析。
- **RV-508** `analyzer.mjs:1382`：validator 名稱檢查用 `call.name`（CallExpression 沒有），`var validateForm = function(){}` 寫法的規則被略過。
- **RV-509** `capture-static-jsp.mjs:301`：`rewriteCssUrls` 以 UTF-8 讀寫所有 CSS，刻意保留原樣的 Big5／GBK 檔被破壞；assetKey 為空時重寫兩次。
- **RV-510** `capture-static-jsp.mjs:821`：CSP meta 用 `/<head([^>]*)>/i` 插入，會比對到 `<header>`；且在補上 `<head>` 之前執行，片段頁面沒有 CSP。
- **RV-511** `react-preview.mjs:68`：超大或無法讀取的 CSS 拋例外中止整個擷取，而非產生 `REACT_STYLESHEET_MISSING`。
- **RV-512** `spring-resource-mappings.mjs:75`：只掃 `target/src/main`，WebContent 等 web root 下的 dispatcher XML 找不到。
- **RV-513** `react/markup.mjs:103`：屬性 denylist 區分大小寫、`xlink:href` 未檢查 scheme；字串 `style` 繞過 `url(` 過濾。React 預覽文件無 CSP。
- **RV-514** `analyzer.mjs:1366`：解構或預設值參數未綁定，取到外層同名變數並產生 CONFIRMED 的錯誤導覽。
- **RV-515** `template-fragments.mjs:156`：`startLine` 未驗證，0 或負值拋 RangeError，畫面標為擷取失敗。
- **RV-516** `element-styles.mjs:75`：COMPONENT 無 `source` 時 TypeError。
- **RV-517** `values.mjs:200`：`+` 結果未帶 type，`1 + 2 + 3` 變成字串串接 `'33'` 並標 CONFIRMED。
- **RV-518** `bindings.mjs:223`：任何以 `on` 開頭的成員指派（`user.online`、`arr[one]`）都當成事件綁定。
- **RV-519** `parser.mjs:46`：regex literal 內的引號讓 JSP `${}` 遮罩錯位，降級為 loose parser。
- **RV-520** `preview-markup.mjs:36`：未關閉的 `<!--` 在檔案開頭時只產生兩字元 token，註解內標籤變成真的標記。
- **RV-521** `pack-preview.mjs:272`：style 屬性 HTML 解碼兩次。
- **RV-522** `capture-static-jsp.mjs:749`：未解碼 `url.pathname`，含空白或中文的資源檔找不到。

## P2 — viewer

- **RV-601** `inert-document.ts:21`：詞法惰性化與 DOMParser 解析不一致（`<!-->`、`--!>`、raw-text 元素結尾、`\v`／NBSP 空白），可讓 `<img src>` 保持有效；目前僅靠 iframe CSP 擋住請求。
- **RV-602** `preview.ts:43`：CSS 資源循環 import 時拋例外，且在設定 cache 前，任何畫面的預覽都無法顯示。
- **RV-603** `main.ts:1515`：啟動時記住的進度檔 handle 在 IndexedDB 回應後 `resume()`，覆蓋使用者在這之前做的決策。
- **RV-604** `main.ts:594`：`choose()` 直接 `writeNow()`，未串接 `writing` 也未清除 timer，可能並行寫入。
- **RV-605** `relations.ts:146`：tooltip 顯示全部觸發元件後又顯示「其餘 N 個」，沒有截斷。
- **RV-606** `labels.ts:398`：自寫 regex 不接受含 `:` 的標籤名，`html:form` 路徑成為無效 selector，Struts 元件失去文件標籤。應改用 `previewSelector`。
- **RV-607** `names.ts:91`：同名畫面中有 entryQuery 時只處理那些畫面，其餘仍同名。
- **RV-608** `personas.ts:124`：不確定路徑先標記 seen，之後確定路徑被跳過，依步驟順序產生不同結果。
- **RV-609** `main.ts:1076`：決策徽章 append 到 `<select>`／`<textarea>`／`<img>` 內，無法顯示。
- **RV-610** `shared/review-md.ts:760`：結尾多一個換行就拒絕匯入（編輯器常自動加入）。
- **RV-611** `prototype.ts:120`：無擷取高度且頁面為 `min-height:100vh` + margin 時，ResizeObserver 無限放大 iframe。
- **RV-612** `usage.ts:41`：同 RV-110，巢狀 CALL_API 重複計算呼叫者。

---

## P3 — 效能

- **RV-701** 重複解析 Java 原始碼：Spring（`SpringExternalLoginFlow`、`SpringExternalCalls`、`SpringSecurityRedirects`、`SpringServerValidation`、`SpringBootAnalyzer` 各自解析，未共用 `ParsedJavaUnits`）、Struts（偵測器跑兩次 + `javaTypes` + `ActionContracts`）、parser-jsp（`ScriptSources.collect` 跑兩次、`JspProjectParser.analyze` 為取 include 重跑、`UrlResolution.context` 多處重算）。
- **RV-702** 線性去重與 O(E²) 掃描：`SpringMvcAnalyzer:1412` addNode／edge、`SpringControllerFlow:531`、`SpringFormBindings:207`、`RouteTemplateInference:134`、`UrlGraphContribution:213`、`StrutsValidation:73`（五層巢狀）、`StrutsInteractions:175`、`ApiUsage:276`、`PreviewCaptureReader:219`、viewer `usage.ts:40`、`contracts.ts:152`。
- **RV-703** 重複讀取設定檔：`StrutsInteractions:100` 每個 tag 重讀 web.xml、`ActionContracts:100` 每個端點重新解析 struts-config、`StrutsServletMappings:49` 共用 layout 每個畫面重讀、`ProjectScanner:173` 與 `ProjectInventory` 多次讀取 XML。
- **RV-704** `StrutsTiles:367`：`isTilesLayoutPath` 每次呼叫重算所有 tile 範本。
- **RV-705** 每次呼叫建立 `ObjectMapper`：`SpringControllerReturns:231`、`SpringServerValidation`、`SpringSubmittedModel`、`SpringExternalCalls`、`SpringMvcAnalyzer.tilesAttributesJson`、`RouteTemplateInference:342,381,438`。
- **RV-706** 熱路徑重複編譯 regex：`StaticComponentNames:185,161`、`JspTagFileExpander:190`、`UrlGraphContribution:439`、`UrlResolution:475`（每組 path×endpoint 編譯一次）。
- **RV-707** 同一份 JSP 被 `MarkupTag.scan` 約 9 次（`JspProjectParser:145`）；`ThymeleafMarkup.normalize` 重跑（`ScriptSources:213`）；`JspProjectParser:330` 每個檔案重走所有已收集互動；`ScriptSources:244,588` 每個 tag 走全部定義／全部檔案。
- **RV-708** `SpringWebFlowContribution:197`：每個 transition 重新掃描整份 flow XML。
- **RV-709** JS／capture：`analyzer.mjs:132` 每個 unit 最多解析 4 次；`analyzer.mjs:351` trace 合併二次方；`preview-markup.mjs:178`、`template-preview.mjs:168` 每個 token 掃全部節點；`element-styles.mjs:177` 每個畫面重算預設樣式；`pack-preview.mjs:215` cache 命中前仍先讀檔。
- **RV-710** viewer：`screen-panel.ts:186` 每次點擊重建 graph index 4～6 次；`preview.ts:22` CSS 解析未 memo；`map.ts:307` 每次按鍵重掃所有證據；`simulation-data.ts:270` 每列重複比對範本。

## P3 — 重複程式碼與死碼

- **RV-801** `SpringBootAnalyzer:302` 重複實作 `SpringMvcAnalyzer` 的 mapping 邏輯且已分歧（RV-202 兩處都要修）。
- **RV-802** Struts dispatch 端點建構複製三份（`StrutsControls:328`、`StrutsActionInheritance:194`、`StrutsBehaviorProjection:87`），語意已分歧，可能產生重複端點節點。
- **RV-803** Struts 目標正規化重複（`StrutsInteractions:141` 與 `:193`），第二段覆蓋 JSP parser 已解析的目標；`StrutsControls.moduleTarget` 重複 `switchActionTarget`；`StrutsActionInheritance:347` 重複 `StrutsWildcards.extendedMapping`。
- **RV-804** parser-jsp：`JspProjectParser:156` 重複元件 id 推導（與 `MarkupAnalysis` 不同步就會靜默失效）；`literal()` 與 VOID 集合多份；`UrlGraphContribution:211` 寫死 `"<current-view>"`；javascript-request 修剪邏輯兩份。
- **RV-805** viewer：端點 method／path fallback 三份（`screen-panel`、`api-page`）；root trigger 回溯三份（`map.ts`、`usage.ts`、`callerKind`）；`review.ts:256` 排序比較器兩份。
- **RV-806** `react/styles.mjs:339` 重複 `resolveSpecifier` 且缺少 `..` 防護；`BuildVersions:107` 重複 `SafeProjectFiles.parseXml` 的強化 XML 設定。
- **RV-807** 死碼：`SpringMvcAnalyzer` 的 `State.endpointByPath`、`EndpointReference.category`、`SpringBootAnalyzer.line`、`SpringControllerReturns.feedback` 的 `values`；`StrutsServletMappings.servletClass`、`StrutsTiles.sameJspPath`、`StrutsGraphSupport.lineAt`、`State.inputForward`；`MarkupGraphContribution:469` 每畫面 modal 解析被全域覆寫；`UrlVariableResolver:100` 兩邊相同的三元運算；`ScriptSources:191` 無效的 `continue`；`JspProjectParser:850` 未使用的 `line()` 與只被測試使用的 regex 前處理；`MarkupTag:205` 恆真條件；`element-styles.mjs:249` 重複過濾；`ProjectScanner:370` 被忽略的參數；`ComponentLibrary:288` 重複的隱私檢查。
- **RV-808** `ScreenTraceCli:579,592`：SCREEN 數量算兩次且用兩種寫法（enum 比較與字串比較）。

---

## 跨模組主題

幾個問題在多個模組重複出現，集中修正比逐項修更有效：

1. **web root 寫死**：RV-317、RV-401、RV-512、RV-425。全部改用 `inventory.webRoots()`，在 capture 端也傳入同一份清單。
2. **Java 解析器設定不一致與重複解析**：RV-201、RV-402、RV-701。統一走 `JavaSources.parse` 與 `ParsedJavaUnits` 快取。
3. **單點失敗擴大為整體失敗**：RV-007、RV-217、RV-220、RV-404、RV-414、RV-421、RV-511、RV-602。錯誤應侷限在單一檔案／單一項目並留下診斷。
4. **預覽輸出生命週期**：RV-005、RV-103、RV-104、RV-105。擷取前清空、逐步寫 manifest、結束整棵程序樹、封裝逾時不中止報告。
5. **HTML 實體與 URL 編碼**：RV-313、RV-424、RV-521、RV-522。在 `MarkupTag` 取屬性時統一解碼一次。
6. **API 呼叫者重複計算**：RV-110 與 RV-612 在 Java 與 TypeScript 各有一份相同邏輯，應一起修並以同一組 fixture 驗證。
7. **路徑比對缺少邊界**：RV-318、RV-322、RV-412、RV-423。
