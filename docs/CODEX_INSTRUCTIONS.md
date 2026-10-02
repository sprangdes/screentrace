# ScreenTrace 調整指示(給 Codex)

- 文件版本:1.3(2026-10-03;依 OQ-003 決定補充 WP4 第 2 點,變更見第 11 節)
- 建議放置位置:`docs/CODEX_INSTRUCTIONS.md`,並在 `AGENTS.md` 第 10 節的閱讀清單加入本文件
- 對照基準:`sprangdes/screentrace` main(含 review-result v2 匯出的版本)

---

## 0. 使用規則(先讀)

### 0.1 用語

- **MUST / MUST NOT**:必須 / 禁止,違反即視為未完成。
- **SHOULD**:預設要做;不做時必須在回報中寫明理由。
- **需求方**:未來操作系統的非工程師角色。**後端人員**:查看 API 頁的工程師。

### 0.2 文件優先序

1. 本文件(第 1、2 節為需求方原意,不得改寫)
2. `AGENTS.md`(與本文件衝突時以本文件為準,並在 `docs/adr/` 記錄衝突點與決定)
3. `docs/ARCHITECTURE.md`、`docs/PRODUCT_SPEC.md`
4. `docs/ROADMAP.md`(目前為過時文件,WP0 會整理)

### 0.3 停止條件(不得自行猜測)

遇到以下任一情況,**必須停止該工作包**,把問題寫入 `docs/OPEN_QUESTIONS.md`(格式:編號、情境、可選方案、影響範圍),在回報中提出,**不得自行選擇方案繼續**:

- 本文件對需求的描述有兩種以上合理解讀,且第 9 節未列出預設解讀。
- 需要的外部資訊(例如真實元件庫的格式、context path)不存在於專案或本文件。
- 實作需要違反第 4 節的任何硬性約束。
- 驗收標準在技術上無法達成(必須回報實測數據,不得自行放寬標準)。

### 0.4 一律禁止

- 為了讓測試通過而修改、刪除或放寬既有測試斷言(新增行為造成的合理變更須在 ADR 說明)。
- 以 LLM 或任何機率式方法取代確定性分析。
- 在輸出中捏造證據、補上無法由原始碼確認的值,或把 `UNRESOLVED` / `AMBIGUOUS` 升級為 `CONFIRMED`。
- 硬編碼特定範例專案(例如 PetClinic)的路徑、類別名或畫面名。
- 修改被分析的目標專案(一律唯讀)。

### 0.5 工作方式

- 依第 6 節的里程碑順序進行,**每個里程碑結束時停止並提交回報**(格式見第 7 節),等待確認後再進入下一個里程碑。
- 每個工作包:先寫失敗的測試 → 實作 → 全部測試通過 → 更新文件。
- 每個工作包獨立提交(可追溯),commit 訊息以 `WPn:` 開頭。
- 設計取捨一律寫入 `docs/adr/NNNN-標題.md`(背景、選項、決定、後果)。

---

## 1. 需求方原始需求(原文,不得更動)

> 一個JSP專案的逆向工程系統(以下簡稱系統)，分析現有專案(以下簡稱專案)的架構可以是Struts, Struts+Spring, Spring, Spring Boot(純後端)
> 透過分析現有專案的程式碼，產出一個互動式的網頁，讓使用者可以透過操作網頁了解專案的功能(以畫面及流程的角度)，未來操作系統的角色不是工程師，而是需求方，目的是讓需求方確認專案中是否有已經停用的畫面或流程，以及連帶不再使用的API等，需求方標示可移除的畫面、按鈕，而後產出md檔供AI做指示，以利後續的作業。
>
> 後續的作業為，把原本Struts, Struts+Spring, Spring, Spring Boot(純後端)，前端使用JSP的專案，升版到Spring Boot 4架構，改為前後端分離，前端使用angular技術。另外有個需求為，需要把原本畫面的元件，替換成特定元件庫(需求方自行開發的)提供的元件
>
> 分析結果的需求：
> 分析過程中不啟動專案，所有的分析皆為靜態分析原始程式碼
> 分析的資料要能做出Screen Map，展示所有畫面之間的關聯
> 列出所有畫面的檔案架構，且可以透過實際該畫面url做搜尋
> 分析一個畫面中的所有可操作行為，按鈕、下拉選單、選擇器、轉導畫面、呼叫API、送出表單、彈窗、資料檢核等。
> 分析畫面中所有元素的樣式
>
> 分析結果呈現：
> 分為畫面、API兩大類
> 畫面提供給需求方查看以及確認功能，畫面為Screen Map呈現，一個畫布呈現所有的畫面，以及畫面之間的關聯。點選畫面聚焦在選取的畫面，畫面四周透過關聯線連往畫面外呈現聚焦的畫面可以前往的其他畫面，hover在關聯線上會顯示即將前往的畫面url和縮圖，點擊該條關聯線可以直接前往該畫面，畫布右側列出該畫面的資訊，包含呼叫的API、各個按鈕。點擊右側欄位API或按鈕可以展示API或按鈕的資訊。
> Screen Map有review模式，在review模式中可以標記畫面及按鈕為保留或刪除，不做任何記號則為未確認。
> API提供給後端人員，列出所有API，清楚呈現API在哪些畫面及哪些按鈕被呼叫。

---

## 2. 已確認的決策(需求方已回覆,不得推翻)

| 編號 | 決策 |
|---|---|
| D1 | Struts **只支援 1.x**。偵測到 Struts 2 必須明確拒絕(見 WP2),不得部分解析。 |
| D2 | **JavaScript 全解析**:inline script、外部 `.js`、事件屬性、jQuery 等,以 AST 解析,不執行。 |
| D3 | 系統要能**匯入元件庫**。元件庫目前**沒有統一形式**,因此由本專案定義匯入用 manifest 格式(見 WP9),不得假設真實元件庫的結構。 |
| D4 | API 判定「可移除」的條件:**所有呼叫來源都被標為移除**。 |
| D5 | **沒有任何畫面呼叫的 API,由系統主動標示「未被使用」**。 |
| D6 | 交付形式為**單一 HTML,可直接開啟**(不依賴 localhost 伺服器、網路、其他檔案)。 |
| D7 | **允許大幅重構**現有程式碼。 |
| D8 | review 結果匯出**只輸出 md,取代現有 `review-result.json`**。 |

---

## 3. 現況與落差(已對照程式碼驗證)

| 編號 | 需求 | 現況(證據) | 對應工作包 |
|---|---|---|---|
| G1 | 輸出 md | 全專案無任何 md 匯出;只有 `ReviewResultGenerator` 產生 JSON(v2) | WP8 |
| G2 | 連帶不再使用的 API | `REVIEW_RESULT_CONTRACT.md` 明定 API 無決策、不推導;無「未被使用」標示 | WP5、WP7、WP8 |
| G3 | 所有可操作行為 | `JspProjectParser` 只處理 `a`、`form`、`button`、`input` 及少數 taglib;無下拉、選取、彈窗、檢核;`InteractionType.API_TRIGGER` 已宣告但解析器從不產生 | WP1、WP3 |
| G4 | JS 全解析 | 無任何 JS 解析;`capture-static-jsp.mjs` 為了安全會刪除 `<script>` 與 `on*` 屬性 | WP4 |
| G5 | 所有元素樣式 | 只擷取 `a[href]`、`button`、`input[type=submit/button]`、`form[action]`,且只有 18 個 CSS 屬性 | WP6 |
| G6 | Struts 1 檢核與 Dispatch | `StrutsProjectAnalyzer` 只讀 `form-bean`、action、forward;未處理 `validation.xml`、DispatchAction | WP2 |
| G7 | Spring 檢核 | `adapter-spring` 未偵測 `@Valid`、Bean Validation 約束、`Validator`、`@InitBinder` | WP5 |
| G8 | 單一 HTML | 報表前端是內嵌在 `ReportGenerator.java` 文字區塊的壓縮 JS,疊加十餘層樣式注入;執行時 `fetch('/application-graph.json')` 等,需 localhost | WP7 |
| G9 | 元件庫 | 完全沒有元件庫相關程式或資料模型 | WP9 |
| G10 | 畫面忠實度 | 預覽為「重建」:動態值以範例值取代,`c:if` / `c:choose` 標籤被直接剝除 | WP6 |
| G11 | 文件與實況不一致 | `ROADMAP.md` 新舊兩套清單並存;`ARCHITECTURE.md` 列出 analyzer / server / ui 等 repo 內不存在的模組;README 仍描述 v1 匯出 | WP0 |

---

## 4. 全域硬性約束

- **C1 純靜態**:MUST NOT 啟動目標專案、執行目標專案的任何程式碼(JSP、JS、Java)、連資料庫、發出網路請求。解析 JS 只能用 AST;MUST NOT 對目標程式碼使用 `eval`、`Function`、`vm`、`require`。Playwright 只能渲染「本工具產生的靜態化 HTML」,且維持 JavaScript 關閉。
- **C2 證據與信心**:每個節點、邊、行為、檢核規則 MUST 帶 `source`(專案相對路徑 + 行號)、解析器名稱、解析狀態(`CONFIRMED` / `INFERRED` / `AMBIGUOUS` / `UNRESOLVED`)。無法確定就保持 `UNRESOLVED` 並保留原始運算式文字。
- **C3 決定性**:同一份原始碼輸入,輸出(圖、HTML、md)MUST 位元組相同,僅 `generatedAt` 可不同。所有集合 MUST 有明確排序。
- **C4 框架隔離**:`core` 的圖模型 MUST NOT 出現框架名稱;框架專屬語意只放在 adapter 與 evidence。
- **C5 不可信輸入**:目標專案的所有文字(標籤、URL、路徑、JS 字串、CSS)都視為不可信。輸出 HTML MUST 僅以 `textContent` / 屬性 API 寫入,MUST NOT 使用 `innerHTML` 拼接目標內容;預覽 iframe MUST 使用 `sandbox`(不含 `allow-scripts`)。
- **C6 輸出 HTML 的 CSP**:單一 HTML MUST 內含 CSP `<meta>`:`default-src 'none'`,`script-src` 以**建置時計算的 SHA-256 雜湊**指定(不得使用 `'unsafe-inline'`),樣式與圖片限於 `data:` 與雜湊/nonce 允許項;MUST NOT 引用任何遠端資源或 CDN。
- **C7 路徑安全**:沿用 `SafeProjectFiles` 與 `safe-files.mjs` 的路徑限制、檔案大小上限、寫入範圍限制;新增的讀寫一律走同一套。
- **C8 相依套件**:新增相依 MUST 釘選版本、確認授權相容、通過 CI 的 npm audit 與 Dependency-Check;每個新相依 MUST 在 ADR 說明必要性。
- **C9 穩定 ID**:畫面、元件、行為、API 的 ID MUST 由穩定鍵(路由、來源路徑、元素種類、屬性、同類出現序)決定,重新分析後 ID 不得無故改變(review 標記靠它保存,見 WP1)。
- **C10 語言**:使用者介面與 md 內的說明文字使用繁體中文;欄位鍵、程式碼、ID 使用英文。

---

## 5. 工作包

### WP0 基線與文件整理

**目的**:建立可驗證的起點,消除文件與實況的落差。

**要求**
1. 執行 `mvn test` 與 `screentrace-capture` 的 Node 測試,結果(含失敗項)記錄到 `docs/BASELINE.md`,不得隱藏失敗。
2. 建立 `docs/REQUIREMENTS.md`,內容為本文件第 1、2 節原文。
3. 整理 `docs/ROADMAP.md`:移除過時清單,改為對照本文件的工作包與進度。
4. 更新 `docs/ARCHITECTURE.md` 的模組圖,只列 repo 內實際存在的模組(含本次新增的);尚未存在的標示為「規劃中」。
5. 建立 `docs/adr/`、`docs/OPEN_QUESTIONS.md`(可為空檔含格式說明)。

**驗收**:文件與實況一致;`BASELINE.md` 有實測結果;`ARCHITECTURE.md` 不再列出不存在的模組。

---

### WP1 圖模型 v2 與穩定 ID(core)

**目的**:讓圖能表達「所有可操作行為」與「檢核規則」,並讓 review 標記能跨重新分析保存。

**要求**
1. `ApplicationGraph` 加入 `schemaVersion`,`GraphIntegrityValidator` 同步更新規則。
2. 每個**元件**必須有 `kind`,至少涵蓋:`BUTTON`、`LINK`、`SUBMIT`、`TEXT_INPUT`、`TEXTAREA`、`SELECT`(下拉)、`CHECKBOX`、`RADIO`、`DATE_PICKER`、`FILE_INPUT`、`MULTI_SELECT`、`FORM`、`MODAL`、`TABLE`、`OTHER`。
3. 新增**行為(Behavior)**概念,每個行為 MUST 能回答:
   - 誰觸發:元件 + 事件(`click`、`change`、`submit`、`load`…)
   - 做什麼:`NAVIGATE`、`SUBMIT_FORM`、`CALL_API`、`OPEN_DIALOG`(含 modal、dialog、`alert` / `confirm` / `prompt`、`window.open`)、`VALIDATE`、`UI_STATE_CHANGE`、`SELECT_CHANGE`、`UNKNOWN`
   - 結果指向:畫面 / API / 彈窗 / 檢核規則 / 無
   - 條件(guard):例如 `c:if`、JS `if` 的條件文字(原文保留)
   - 父行為:例如 ajax `success` 回呼內的 `location.href` 是該 ajax 行為的子行為
   - 證據:`source`、解析器、解析狀態
4. 新增**檢核規則(ValidationRule)**概念:規則種類(required、pattern、length、range、email、custom…)、作用欄位、錯誤訊息(若可靜態得知)、來源層級(`MARKUP` / `CLIENT` / `SERVER`;框架名稱只放 `evidence.detail`,不進 core 分類)、證據。
5. 節點 / 邊的具體命名由你決定,但 MUST 遵守 C4,並在 `docs/adr/` 與 `ARCHITECTURE.md` 完整記載。既有的 `TRIGGERS`、`NAVIGATES_TO`、`CALLS` 語意不得改變(可作為由行為推導的簡化關係保留)。
6. **ID 規則**(C9):定義並文件化各類 ID 的產生演算法;提供「舊 ID 清單 vs 新分析」的比對函式,回傳 `matched` / `orphaned`(舊標記找不到對應)/ `new`。
7. 提供**API 使用狀態推導函式**(純函式,位於 core,檢視器與 md 匯出共用):
   - 輸入:圖 + 需求方決策集合。**決策鍵**:畫面決策以 `screenId`;元件決策以 (`screenId`, `componentId`) 複合鍵(同一元件可出現在多個畫面,各畫面獨立決策,不得以單一 `componentId` 跨畫面套用)
   - 呼叫來源(caller)= 呼叫該 API 的 (畫面) 或 (畫面, 元件/行為)
   - 輸出狀態(見 9.5 規則):`IN_USE` / `REMOVABLE` / `UNREFERENCED`

**驗收**:模型單元測試;完整性驗證測試(不合法的邊 / 缺證據 / 缺 kind 會被拒絕);ID 在「重新排序檔案、無關檔案修改」後不變的測試;API 狀態推導的窮舉測試(見 9.5 各情境)。

---

### WP2 Struts 1.x 支援完整化

**要求**
1. **框架偵測**:偵測到 Struts 2(`struts.xml`、`org.apache.struts2` 相依或套件、`.action` 副檔名搭配 `struts2-core`)時,產生診斷 `UNSUPPORTED_FRAMEWORK`(說明僅支援 Struts 1.x),且**不得**進行部分分析並輸出看似完整的結果。
2. `struts-config.xml`:action mapping 完整屬性(`path`、`type`、`name`、`scope`、`validate`、`input`、`parameter`)、`global-forwards`、`global-exceptions`、`form-bean`(含 `DynaActionForm` 的 `form-property`)、`plug-in`(Validator、Tiles)、多模組設定檔。
3. **DispatchAction 系列**(`DispatchAction`、`LookupDispatchAction`、`MappingDispatchAction`):依 `parameter` 屬性與 JSP 中對應的請求參數 / 按鈕 `property`,解析出實際呼叫的 Action 方法;解析不到時保持 `UNRESOLVED`。
4. **Struts Validator**:解析 `validation.xml` 與 `validator-rules.xml`,把每個 form 的欄位規則轉為 `ValidationRule`(`SERVER`,`evidence.detail` 記錄 Struts Validator)。
5. `ActionForm.validate()`:以 Java 原始碼解析找出 `ActionErrors.add(...)` 所涉及的欄位(**SHOULD**,信心 `INFERRED`;條件式無法確定時不得推論)。
6. `mapping.findForward("name")`:以字串常值靜態解析可能的 forward 目標;非常值保持 `UNRESOLVED`。
7. Tiles:`extends`、巢狀定義、`put-attribute` 與 JSP 的 `tiles:insert` / `tiles:put` 組合出的畫面。
8. Struts taglib(`html:*`、`logic:*`、`bean:*`)轉為對應的元件 `kind`(`html:text`、`html:password`、`html:textarea`、`html:select` + `html:options` / `html:optionsCollection`、`html:checkbox`、`html:multibox`、`html:radio`、`html:file`、`html:hidden`、`html:submit`、`html:button`、`html:cancel`、`html:reset`、`html:link`、`html:form`…)。
9. Struts + Spring:維持既有 Spring-managed Action 解析,並補測試。

**驗收**:fixture 專案(Struts 1 純 / Struts 1 + Spring)涵蓋以上每一項;Struts 2 fixture 產生 `UNSUPPORTED_FRAMEWORK`;每項解析結果在輸出中可追溯到 `source`。

---

### WP3 JSP / HTML 元件與行為解析

**要求**
1. 以容錯的標記掃描取代零散的 regex 判斷;保留行號;正確處理 scriptlet、EL、自訂標籤、註解、`<%@ include %>`、`jsp:include`、Tiles。
2. 辨識所有元件 `kind`(WP1 第 2 點),涵蓋純 HTML5、Spring `form:*`、Struts `html:*`、JSTL 產生的元素。
3. **HTML5 內建檢核**屬性(`required`、`pattern`、`min`、`max`、`minlength`、`maxlength`、`type=email/url/number/date`…)轉為 `ValidationRule`(`MARKUP`)。
4. **控制流程**(`c:if`、`c:choose/when/otherwise`、`c:forEach`、`logic:present/notPresent/equal`…):其內元件須標記 `conditional=true` 與條件文字原文;迴圈內元件標記 `repeated=true`。
5. **彈窗標記**:`data-toggle="modal"` / `data-bs-toggle="modal"` 與其目標、`class="modal"`、`role="dialog"`、`<dialog>` → `MODAL` 元件,並與觸發它的元件建立行為關聯。
6. **表單綁定**:`name` / `path` / `property` 與表單模型(Spring model attribute、Struts form-bean)的欄位對應(解析不到則 `UNRESOLVED`)。
7. 事件屬性(`onclick`、`onchange`、`onsubmit` 等)的內容交給 WP4 解析,WP3 只負責擷取與位置。
8. 目標為運算式(EL / scriptlet)者保持 `UNRESOLVED` 並保留運算式原文,僅下列例外可靜態解析:
   - 變數由同一 JSP 來源內的 `c:url` / `spring:url` 定義,且 `value` 為不含 EL 的字面字串。
   - 變數在使用點之前定義、無重新賦值、作用域可證明(不得在互斥條件分支中以不同值定義)。
   - 使用處為純變數 `${var}`,或 `${fn:escapeXml(var)}`。
   - `value` 字面字串中的 `{name}` 路徑佔位符保留為樣板,`spring:param` / `c:param` 的值不解析。
   - 解析結果須保留原始運算式與定義處證據(檔案、行號)。其他 EL、scriptlet、未知函式(含其他 `fn:*`)、include 內定義的跨檔案變數、`c:set` 一律 `UNRESOLVED`,不得把未知函式當作透明包裝。
   - 不得修改任何既有測試斷言。若現行信心等級與本規則衝突,依 §0.3 停止再提問。

**驗收**:fixture 涵蓋每種元件與標籤組合、每種控制流程、巢狀 include;解析結果以 golden 檔比對。

---

### WP4 JavaScript 全解析

**要求**
1. **技術**:新增獨立 Node 模組(例如 `screentrace-js`),使用成熟的 JS 解析器(如 acorn 或 @babel/parser,擇一並在 ADR 說明),輸出供 Java adapter 讀取的 JSON。支援 ES5 至現行語法與 `type="module"`;語法錯誤採容錯模式並產生診斷,不得中斷整體分析。
2. **來源範圍**:JSP 內 inline script、`<script src>`(解析為專案內檔案,含經 `c:url` / `spring:url` / `${ctx}` 的路徑)、事件屬性運算式、`javascript:` URL。
   - OQ-003 例外僅用於找出要分析的 JS 檔案：script src 開頭是單一變數（如 `${ctx}`）或 `${pageContext.request.contextPath}`／`${pageContext.servletContext.contextPath}`，且整個專案原始碼沒有將該變數定義為其他值時，可將剩餘路徑比對 web root（src/main/webapp、WebContent 等）內實際檔案。恰好一個符合標 INFERRED；多個符合標 AMBIGUOUS、全部列出且不得擇一；無符合 UNRESOLVED 並診斷。保留原始運算式與比對證據。
   - 來源有 c:set 等定義時依定義處證據解析；定義與不透明部署前綴假設矛盾時 UNRESOLVED。變數在中間、完整 URL（http://、//）、多個變數串接不適用，一律 UNRESOLVED。本例外不得套用到 JS 內 API URL；API URL context path 留給 WP5。
3. **第三方函式庫**:依檔名與檔頭標記辨識(jQuery、Bootstrap、jQuery UI、jquery.validate、select2、日期選擇器等),**不分析其內部**,改以內建的 API 對照表(資料檔 + 測試)理解其公開 API。未知函式庫的呼叫記為 `UNKNOWN_CALL`,保留被呼叫者文字。
4. **必須辨識的行為**:
   - 導頁:`location.href`、`location.assign/replace`、`window.location`、`history.pushState`、`window.open`、`form.submit()`
   - API 呼叫:`$.ajax`、`$.get`、`$.post`、`$.getJSON`、`.load()`、`fetch`、`XMLHttpRequest`、`axios`(如專案有使用)
   - 彈窗:`alert`、`confirm`、`prompt`、Bootstrap modal、jQuery UI dialog、自訂 dialog 函式
   - 檢核:jquery.validate 設定、自訂 `validate*()` 函式中對欄位的檢查與訊息、`setCustomValidity`(層級為 `CLIENT`)
   - UI 狀態:`show/hide/toggle`、`addClass/removeClass`、分頁籤、折疊
   - 欄位連動:`change` 事件中載入下拉選項、改變其他欄位
5. **事件綁定解析**:`$(selector).on/click/change/submit/...`、委派事件(`on('click', child, fn)`)、`addEventListener`、`onclick=` 屬性。選擇器 MUST 對 JSP 靜態 DOM 解析(`#id`、`.class`、`[name=…]`、標籤、後代關係、`this`),比對到的元件建立行為關聯;比對不到或為動態產生元素者記為 `UNRESOLVED` 並保留選擇器原文。
6. **跨函式追蹤**:函式宣告 / 函式表達式 / 物件方法;從事件處理函式追蹤到其呼叫的函式(預設深度上限 10,可設定),須有循環保護。ajax 的 `success` / `done` / `then` 回呼內的行為記為**子行為**。
7. **值解析**:字串常值、串接、樣板字串、單次賦值的 `const` / `var`、物件常值屬性(如 `config.url`)、JSP 運算式展開(例如 `'${ctx}/api/x'`)。部分可解析者保留樣板(未知部分以 `{expr}` 佔位)並標 `INFERRED`;完全無法解析標 `UNRESOLVED`。**不得**用猜測補齊。
8. **請求內容**:盡可能擷取 HTTP 方法、URL、資料欄位名稱(`data: {a: …}`、`serialize()` 對應表單欄位)。
9. **限制**:單檔大小上限沿用 `SafeProjectFiles` 規範;minified 的專案自有 JS 照常解析;超過上限者產生診斷,不得靜默略過。
10. 渲染階段(WP6)仍 MUST 移除 `<script>` 並維持 JS 關閉;分析與渲染完全分離。
11. **呼叫來源不得遺失**:頁面載入時(`ready` / `load` / 內嵌立即執行)的 API 呼叫,觸發者記為**畫面**;事件綁定解析失敗者記為 `UNRESOLVED` 的呼叫來源並保留選擇器原文。MUST NOT 因找不到觸發元件而丟棄行為(否則 API 會被誤標為「未被使用」)。

**驗收**:每一種行為、選擇器、委派、跨函式追蹤、值解析各至少一個 fixture;對抗性測試(`eval`、動態屬性存取 `obj[x]`、字串由使用者輸入組成)全部落在 `UNRESOLVED`,且分析器**不執行**目標程式碼(測試以內含副作用探針的 JS 驗證探針未被觸發)。

---

### WP5 後端對應、API 契約與檢核

**要求**
1. **URL 對應引擎**(Java,放在共用位置供 Spring 與 Struts adapter 使用):
   - 正規化:移除 context path、query、fragment、`;jsessionid`。
   - 比對:精確 → `CONFIRMED`;路徑樣板(`{var}`、`*`、`**`)或副檔名映射(`*.do`、`*.action`)→ `INFERRED`;多個候選 → `AMBIGUOUS`(列出全部候選,不得擇一)。
   - HTTP 方法:取自 JS / 表單,缺省為 GET;方法與端點不符則不建立關聯並產生診斷。
2. **Context path**:Spring Boot 讀 `server.servlet.context-path`(properties / yml);WAR 專案無法由原始碼得知時,讀取工作區設定檔中的明確設定;**沒有就不假設**,並在診斷中說明。
3. WP4 的 API 行為與 WP3 的表單送出,經對應引擎產生 `CALLS` / `TRIGGERS` 與行為結果指向。
4. **API 契約**:沿用 `ApiContractExtractor`;補上 `@RestController` / `@ResponseBody` / `ResponseEntity` 端點(可能沒有任何畫面對應)、Struts action 端點。
5. **Spring 檢核**:`@Valid` / `@Validated` 參數、Bean Validation 約束(`javax.validation` 與 `jakarta.validation` 的常用約束)、自訂 `Validator`、`@InitBinder`,轉為 `ValidationRule` 並連結到欄位與端點。若需引入 Java 解析函式庫,依 C8 於 ADR 說明。層級為 `SERVER`,`evidence.detail` 記錄 Bean Validation / Validator / `@InitBinder` 來源。
6. 端點資料需能支援 API 頁:方法、路徑、處理類別#方法、請求 / 回應欄位、檢核規則、信心、來源。
7. **schema 退場**:WP5 完成時,所有 adapter MUST 輸出 schema 2.2;移除「混合輸出降為 2.1」的路徑,2.1 僅保留讀取歷史資料。

**驗收**:fixture 涵蓋精確 / 樣板 / 副檔名映射 / 歧義 / 方法不符 / 無 context path;每種結果的信心等級正確。

---

### WP6 樣式擷取(所有元素)與渲染忠實度

**要求**
1. 擷取畫面中**所有元素**(`html`、`body` 與其下所有元素;排除 `script`、`style`、`head` 內容)的樣式,不再只限互動元素。
2. 每個元素記錄:穩定路徑(例如 `body>div[2]>form[1]>input[3]`)、標籤、`id`、`class`、前 80 字文字、座標與尺寸、computed style。
3. **computed style 的儲存**:與同標籤的瀏覽器預設值比對,只存**非預設值**;相同樣式集合去重,放入樣式表 `styles[styleId]`,元素以 `styleId` 參照。MUST NOT 因容量而靜默截斷;超過設定上限時產生診斷並在報表標示。
4. 元素與圖中的元件(WP1)建立對應(依來源順序、`id`、`name`);對應不到者仍保留元素樣式。
5. **忠實度標示**:每個畫面記錄 `rendering.mode = reconstructed`、被範例值取代的動態運算式清單(`dynamicExpressions`),檢視器 MUST 顯示橫幅「示意畫面:動態資料為範例值」。
6. **條件分支**(預設解讀 I4):`c:if` / `c:choose` 的所有分支**全部渲染**,條件元素加上 `data-st-conditional` 與條件文字,檢視器可在元素資訊中查看。
7. 預覽縮圖(供關聯線 hover)另行產生小尺寸圖(最大寬度 320px),內嵌為 data URI。

**驗收**:fixture 畫面中每個元素皆有樣式紀錄;樣式去重後的往返測試(還原後與原 computed style 一致);條件分支元素帶標記;超量時產生診斷而非截斷。

---

### WP7 單一 HTML 檢視器(Screen Map、API 頁、review 模式)

**架構要求**
1. 新增前端模組 `screentrace-viewer/`(TypeScript + esbuild;不使用 UI 框架,除非 ADR 證明必要)。**移除** `ReportGenerator.java` 內的整段內嵌 HTML / JS / 樣式注入。
2. `ReportGenerator`(Java)只負責**注入資料**:把圖、預覽資料、樣式表、縮圖、元件庫 manifest 序列化為 `<script type="application/json">` 區塊(須跳脫 `</script>` 與 U+2028/2029),並計算 C6 的 CSP 雜湊。
3. 產出單一檔案 `report/screentrace-report.html`:以 `file://` 開啟即可完整運作;MUST NOT 需要 localhost、`fetch` 相對路徑、外部資源。**移除**本機伺服器與 `POST /review-result.json` 端點(連同其 token 機制)。
4. 預覽:每個畫面的重建 HTML 以 `iframe srcdoc` 顯示(C5 的 sandbox);所需 CSS / 圖片以 data URI 內嵌並以雜湊去重。產出時輸出檔案大小報告,超過 100 MB 時警告(不中止)。

**介面行為(對應第 1 節原文)**

A. 版面:左側導覽(畫面 / API)、中央畫布、右側面板。

B. **畫面 — 總覽**
   - 一個畫布呈現**所有畫面**及**畫面之間所有關聯線**;可平移、縮放;決定性的版面配置演算法(C3)。
   - 提供第二種檢視「檔案結構」:以專案檔案路徑列出所有畫面的樹狀結構。
   - **URL 搜尋**(解讀 I3):輸入實際 URL(如 `/owners/5/pets/3/edit`),以路由樣板比對找出畫面(`{var}`、`*`、副檔名映射);同時支援子字串搜尋。結果同時在地圖與檔案樹中高亮。

C. **畫面 — 聚焦**
   - 點選畫面進入聚焦:選取的畫面以可閱讀尺寸顯示,四周以關聯線連往它可前往的其他畫面。
   - **hover 關聯線**:顯示目標畫面的 URL 與縮圖;同一對畫面有多個觸發元件時,tooltip 列出觸發元件(最多 10 個,其餘顯示數量)。
   - **點擊關聯線**:直接聚焦到目標畫面;提供「返回上一個畫面」。

D. **右側面板(畫面資訊)**
   - 畫面 URL(含所有路由)、來源檔案(JSP / Tiles / 處理器類別#方法)。
   - 呼叫的 API(分「載入時」與「由元件觸發」)。
   - **所有可操作行為**,依類型分組:按鈕、連結、下拉選單、選擇器(I1)、表單送出、彈窗、資料檢核、轉導;每個項目顯示標籤與信心。
   - 點擊 API → 顯示 API 詳情(方法、路徑、處理器、請求 / 回應、檢核、信心、來源、所有呼叫來源),並可返回。
   - 點擊行為 / 按鈕 → 顯示詳情:類型、事件、結果指向、條件、子行為、檢核規則、建議元件(WP9)、樣式、來源、信心。
   - 在預覽中點選任一元素,顯示其樣式(WP6)。

E. **review 模式**
   - 切換進入後,畫面卡片與按鈕出現三態控制:`未確認`(預設)/`保留`/`移除`。
   - 標記對象:**畫面**與**按鈕**(含其他有行為的元件)。
   - 標記畫面為「移除」**不會**自動改寫其下元件的標記;檢視器另以「隨畫面移除」標示其有效狀態(僅顯示,不寫入決策)。
   - 顯示統計(畫面 / 元件各狀態數量)、依狀態篩選。
   - **衝突警告**(SHOULD):被標「保留」的元件導向被標「移除」的畫面時列出警告;不得自動修正。

F. **API 頁(給後端人員)**
   - 表格:方法、路徑、處理器、狀態(`使用中` / `可移除` / `未被使用`)、呼叫來源數量;可搜尋、篩選、排序。
   - 詳情:呼叫來源清單,依畫面分組、列出每個按鈕 / 行為(含檔案與行號),可點擊跳到該畫面並高亮該按鈕。
   - 「未被使用」= 靜態分析未偵測到任何呼叫來源;MUST 在介面註明「外部系統、反射或動態路徑呼叫無法靜態偵測」。

G. **決策保存**
   - 自動暫存於 `localStorage`(鍵含應用名稱與分析指紋;存取失敗時須不影響使用)。
   - 「匯出 md」下載檔案;「匯入 md」還原決策(見 WP8)。匯入時若有找不到對應的舊 ID,列出 orphan 清單供檢視,不得靜默丟棄。

H. 品質
   - 鍵盤可操作、焦點可見;文案集中管理(繁體中文)。
   - 效能(初始目標,須實測並回報):合成資料 500 畫面 / 5,000 元件 / 3,000 條關聯,首次渲染 ≤ 3 秒,縮放 / 平移維持流暢;不可達時回報數據,不得自行放寬。

**驗收**:Playwright 端到端測試,以 `file://` 開啟建置後的單一 HTML,涵蓋 B~H 每一項行為;安全測試(含惡意字串的畫面標籤 / URL / JS 字串不會執行,以探針驗證);CSP 驗證(無 `unsafe-inline`、無遠端請求)。

---

### WP8 review md 匯出(取代 JSON)

**要求**
1. **移除**:`ReviewResultGenerator`、`docs/REVIEW_RESULT_CONTRACT.md`、`docs/examples/review-result.json`、CLI `export` 指令、相關測試(`ReviewResultGeneratorTest`、`ReviewExportContractTest`);同步更新 README。
2. md 由檢視器在瀏覽器內產生;產生邏輯放在可於 Node 單獨執行的共用模組(例如 `review-md`),供檢視器與測試共用。
3. 新增 `docs/REVIEW_MD_CONTRACT.md`,定義結構、排序、跳脫、缺值行為。結構如下(章節標題與鍵名固定):

```
---
screentrace_review_schema: 1
generated_at: <ISO-8601 UTC>
tool_version: <版本或 git 短雜湊>
analysis_fingerprint: <圖的正規化 JSON 之 SHA-256>
application: <名稱>
technologies: [...]
migration_target:
  backend: Spring Boot 4
  frontend: Angular
  component_library: <名稱@版本 或 none>
---
# <應用名稱> 審查結果(給 AI 的執行指示)

## 1. 如何使用本文件(AI 必讀)      ← 固定文字,見 8.2
## 2. 統計
## 3. 畫面                         ← 依路由、ID 排序
### 3.n <route> — <name>  [KEEP|REMOVE|UNDECIDED]
   - id / 來源檔案 / 處理器 / 路由
   #### 元件與行為(表格:id、kind、標籤、事件、行為類型、結果指向、條件、決策、建議元件、styleId、來源)
   #### 檢核規則
## 4. API                          ← 依 ID 排序
### 4.n <METHOD path> [IN_USE|REMOVABLE|UNREFERENCED]
   - 處理器 / 契約 / 檢核 / 呼叫來源(畫面、元件、行為、來源行號)/ 信心
## 5. 導覽關係
## 6. 元件庫對應(涵蓋率與未對應清單)
## 7. 衝突與警告
## 8. 分析限制(UNRESOLVED / AMBIGUOUS 清單,附來源)
## 9. 樣式表(去重,styleId → 屬性)
## 附錄 A. review state              ← ```json screentrace-review-state 區塊,供匯入還原
```

4. **規則**
   - 單一檔案,不得拆分。
   - 決定性:同輸入同輸出(C3),表格列依明確鍵排序。
   - 所有來自目標專案的文字需跳脫 markdown 特殊字元與表格分隔符;MUST NOT 輸出原始碼內容、HTML、base64 圖片。
   - 缺值一律省略該欄或標示 `—`,不得填入推測值。
   - 樣式只輸出於 §9 去重表,元件列以 `styleId` 參照。
5. **匯入**:檢視器能解析附錄 A 還原決策;格式不符時顯示錯誤並不改動目前決策。
6. md 內嵌的 review state 以 ID 為鍵(C9);MUST 包含 `analysis_fingerprint`,匯入時指紋不同要提示「分析結果已變更」並進入 orphan 檢查。
7. **未被使用的旁註**:若圖中存在目標無法解析(`UNRESOLVED` / `AMBIGUOUS`)的 API 呼叫,§4 的 `UNREFERENCED` 項目須註明「另有 N 個未解析呼叫,可能指向此 API」,並於 §8 列出這些呼叫。

**驗收**:golden 檔測試(固定 fixture → 固定 md);匯出 → 匯入 → 再匯出,內容(除 `generated_at`)位元組相同;惡意字串跳脫測試;orphan 流程測試。

---

### WP9 元件庫匯入

**背景**:真實元件庫沒有統一形式,因此**本工作包只實作 manifest 匯入與比對**。MUST NOT 實作 Angular 套件、Storybook、`.d.ts` 的自動解析,也 MUST NOT 捏造任何真實元件庫的名稱或元件(範例一律標明為 sample)。

**要求**
1. 提供 JSON Schema:`docs/schemas/component-library.schema.json`(draft 2020-12),與範例 `docs/examples/component-library.sample.json`(虛構名稱,檔內註明為範例)。manifest 欄位:
   - `schemaVersion`、`library { name, version, homepage? }`
   - `components[]`:`id`、`name`、`selector?`(Angular selector)、`category`、`description?`、`status`(`stable` / `deprecated`)
     - `inputs[]`:`name`、`type`、`required`、`default?`、`description?`、`mapsFromAttribute?`(原畫面屬性名,如 `maxlength`)
     - `outputs[]`:`name`、`description?`、`mapsFromEvent?`(如 `click`)
     - `slots[]`:`name`、`description?`
     - `usage?`(文字範例)、`docsUrl?`
     - `matches[]`:比對規則,`{ kind?, tag?, attributes?, priority }`,其中 `tag` 可寫原始標籤(如 `html:text`、`form:select`、`button`)
2. CLI:`screentrace library import <manifest> [--project <name>]`、`library validate <manifest>`、`library list`。驗證失敗須指出欄位路徑與原因。匯入的 manifest 儲存於工作區,並嵌入單一 HTML。
3. **比對引擎**(決定性,無模糊 / 機率比對):依 `matches[]` 的條件與 `priority`、規則特異度排序;同分多筆 → 標 `AMBIGUOUS` 並全數列出;無符合 → `NONE`。輸出涵蓋率(每種 `kind` 已對應 / 未對應數量)。
4. 檢視器:在元件詳情顯示「建議元件」、屬性對應提示(依 `mapsFromAttribute` / `mapsFromEvent`)、未對應者顯示「無對應元件」。**SHOULD**:review 模式下允許手動指定覆寫,覆寫結果進入 review state 與 md。
5. md(WP8)§6 與元件列的「建議元件」欄使用本工作包結果;未匯入元件庫時該章節標示「未匯入元件庫」。

**驗收**:schema 驗證測試(合法 / 非法);比對測試(優先序、歧義、無符合);涵蓋率報表測試;CLI 錯誤訊息測試。

---

### WP10 整合測試、CI、文件

**要求**
1. **Fixture 專案**(自行撰寫的小型合成專案,不複製第三方程式碼):Struts 1、Struts 1 + Spring、Spring MVC + JSP、Spring Boot + JSP、Struts 2(僅用於拒絕測試)。合計 MUST 涵蓋 WP2~WP5 列舉的每一種語法與樣式。
2. **決定性測試**:同一 fixture 連續分析兩次,圖、HTML、md 位元組相同(除時間戳)。
3. **端到端**:fixture → analyze → report → 以 `file://` 開啟單一 HTML → 標記 → 匯出 md → 匯入 md → 驗證決策還原。
4. **CI**(沿用既有 `security.yml` 並擴充):`mvn verify`、所有 Node 測試、npm audit、Dependency-Check、單一 HTML 大小報告。
5. **文件**:更新 `README.md`;新增 `docs/USER_GUIDE.md`(給需求方,繁體中文,以操作步驟為主:開啟 HTML → 搜尋畫面 → 聚焦 → review 標記 → 匯出 md);`REVIEW_MD_CONTRACT.md`;`ARCHITECTURE.md` 與 ADR 全數同步。

**驗收**:CI 全綠;第 7 節完成定義全部勾選。

---

## 6. 里程碑與順序

| 里程碑 | 內容 | 結束時 |
|---|---|---|
| M1 | WP0、WP1、WP2 | 停止並回報 |
| M2 | WP3、WP4、WP5 | 停止並回報 |
| M3 | WP6、WP7、WP8 | 停止並回報 |
| M4 | WP9、WP10 | 停止並回報(最終驗收) |

---

## 7. 完成定義與回報格式

**每個工作包完成須同時滿足**
- [ ] 驗收項目全部有對應的自動化測試,且全部通過
- [ ] 沒有放寬或刪除既有測試斷言(若有,附 ADR)
- [ ] 第 4 節約束 C1~C10 逐項確認
- [ ] 相關文件已更新
- [ ] `docs/OPEN_QUESTIONS.md` 中屬於該工作包的項目已處理或已在回報中提出

**里程碑回報格式**(提交於 PR 描述或 `docs/reports/Mx.md`)
1. 完成的工作包與對應 commit
2. 新增 / 修改 / 刪除的主要檔案
3. 測試:新增數量、執行結果(貼出指令與結果摘要,含失敗項)
4. 設計決策(ADR 連結)
5. 與本文件的差異與理由(無則寫「無」)
6. 開放問題與風險
7. 驗收項目逐項對照(通過 / 未通過 / 無法達成及原因)

---

## 8. md 內固定文字與 API 狀態

### 8.1 API 狀態規則(R-API)

- **R-API-1 呼叫來源**:一個 API 的呼叫來源包含(a)呼叫它的畫面(載入時)與(b)(畫面, 元件 / 行為)組合。同一元件出現在多個畫面(例如共用 include)視為多個來源。
- **R-API-2 `REMOVABLE`**:至少有一個呼叫來源,且**每一個**來源都被視為已移除。
- **R-API-3 來源視為已移除**:該來源的元件被明確標「移除」,**或**其所屬畫面被標「移除」(預設解讀 I5)。
- **R-API-4 `IN_USE`**:至少有一個來源未被視為已移除(含「未確認」)。
- **R-API-5 `UNREFERENCED`(顯示為「未被使用」)**:靜態分析未偵測到任何呼叫來源。此狀態與需求方決策無關,由系統自動標示。
- **R-API-6**:`UNREFERENCED` 的 API **不得**被視為已授權移除(外部系統 / 反射 / 動態路徑呼叫無法靜態偵測),須由後端人員確認。

### 8.2 md「如何使用本文件」固定文字(必須逐字寫入,可置於常數並有測試)

1. `REMOVE`:該畫面 / 元件不得遷移到新系統。
2. `KEEP`:必須遷移,行為須等價(導覽、API 呼叫、檢核、彈窗)。
3. `UNDECIDED`:尚未決定,不得移除;遷移時標註「待確認」並詢問人類。
4. API 狀態 `REMOVABLE`:所有呼叫來源皆已移除,後端可移除;`UNREFERENCED`:未偵測到呼叫來源,**不得自行移除**,須由人類確認;`IN_USE`:須保留。
5. 標示 `UNRESOLVED` / `AMBIGUOUS` 的項目,不得自行猜測,須向人類確認。
6. 若「元件庫對應」有建議元件,新畫面必須使用該元件庫元件;標示「無對應元件」者須向人類確認,不得自行以其他元件替代。
7. 樣式表僅供視覺對照;使用元件庫元件時,以元件庫樣式為準。

---

## 9. 預設解讀(需求方原文有多種讀法時,已採用的解讀;需求方可推翻)

| 編號 | 原文用語 | 採用的解讀 |
|---|---|---|
| I1 | 選擇器 | 選取型控制項:radio、checkbox、複選清單、日期選擇器、檔案選擇 |
| I2 | 彈窗 | `alert` / `confirm` / `prompt`、`window.open`、modal、dialog |
| I3 | 以實際 url 搜尋 | 輸入具體 URL(含實際參數值),與路由樣板比對;同時支援子字串搜尋 |
| I4 | 畫面呈現的條件分支 | 所有分支全部渲染並標記條件(不做分支切換) |
| I5 | 移除畫面時其按鈕的狀態 | 計算 API 狀態時,畫面被標移除即視為其下所有元件已移除;但介面與 md 不自動改寫元件的明確標記 |
| I6 | 畫面四周以關聯線連往畫面外 | 聚焦畫面居中,可前往的畫面分佈於其四周,以關聯線連接 |
| I7 | 決策保存方式 | 瀏覽器暫存 + md 內嵌 review state 作為還原來源(不另產生 JSON 檔) |

---

## 10. 不在本次範圍

- Struts 2、FreeMarker、Thymeleaf 等其他視圖技術。
- 任何形式的動態分析、啟動專案、連線資料庫。
- 自動產生 Spring Boot 4 / Angular 的遷移程式碼。
- 解析真實元件庫的原始格式(Angular 套件、Storybook、型別定義),待需求方提供格式後另開工作包。
- CSS 偽類狀態(hover / focus / disabled)、響應式斷點、CSS 規則來源追溯。
- 多人協作、帳號權限。


---

## 11. 修訂紀錄

- 1.3:依 OQ-003 決定補充 WP4 第 2 點的 script src 不透明 context 前綴例外與排除邊界；單一／多個／無候選分別 INFERRED／AMBIGUOUS／UNRESOLVED，保留原文與證據，不套用於 API URL，既有斷言不變。

- 1.2:依 OQ-002 方案 B 修訂 WP3 第 8 點,允許有同來源常值定義、使用前且無重新賦值與作用域證據的 URL 變數例外;保留原始運算式、定義位置與路徑樣板,排除未知函式、跨檔案變數、c:set 與 param 值解析,既有測試斷言不變。
- 1.1:檢核來源層級改為 `MARKUP` / `CLIENT` / `SERVER`(OQ-001);API 狀態推導的元件決策改用 (`screenId`, `componentId`) 複合鍵;新增 WP4 第 11 點、WP5 第 7 點、WP8 規則 7。
- 1.0:初版。