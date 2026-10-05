# ScreenTrace Technical Architecture

R3 WP18 controller flows: `SpringControllerReturns` in `screentrace-adapter-spring` classifies annotation-handler returns with JavaParser, retaining each return line, class/method, original expression and enclosing branch conditions. Literal views use `RENDERS`; application-relative `redirect:`/`forward:` and constant RedirectView targets resolve through existing endpoints into `FORWARDS_TO`. A constant redirect prefix plus an unknown whole path segment becomes an `INFERRED` template, never a concrete runtime value. `SpringControllerFlow` projects only proven navigation/form `TRIGGERS → HANDLED_BY → RENDERS/FORWARDS_TO` chains into `NAVIGATES_TO`; AJAX responses do not imply page navigation. All endpoint candidates and return branches remain visible, including validation self returns. Mutable/aliased ModelAndView values, unsupported targets and unknown methods remain unresolved; redirect recursion has a cycle guard and depth 10. No graph schema change. Details: [ADR 0037](adr/0037-controller-return-flow.md).

## Current POC implementation

The current implementation analyzes server-rendered JSP applications using Struts 1, Spring MVC, Spring Boot, or their supported combinations.

R3 WP17 parser behavior: `JspTagFileExpander` in `screentrace-parser-jsp` follows statically declared taglib `tagdir` mappings, substitutes only literal call-site attributes, expands nested tag files and `<jsp:doBody/>`, and guards recursion at depth 12 with cycle/depth diagnostics. Dynamic attributes remain unresolved. Components are projected from each consuming JSP, retaining both the page call-site and tag-file definition as evidence. `SpringMvcAnalyzer` resolves a relative JSP URL only when exactly one controller route is proven to render that JSP; it joins the relative value to that route's directory and records `INFERRED` evidence. Multiple routes remain `AMBIGUOUS`; no route remains `UNRESOLVED`. The legacy exception in ADR 0005 still excludes `c:set` from URL-variable resolution.

```text
Target source (read-only) -> scanner -> selected Spring and/or Struts adapter -> ApplicationGraph JSON -> embedded standalone HTML
```

`screentrace-core` has no Spring dependency. `screentrace-scanner` inventories files and technology signals only. `screentrace-parser-jsp` is the shared, framework-neutral parser for JSP, JSPF, literal interactive targets, JSP includes, Tiles definitions, and literal Spring URL-tag variables. `screentrace-adapter-spring` consumes that contribution and adds annotation and XML Controller endpoint correlation, `SimpleUrlHandlerMapping`, `InternalResourceViewResolver`, and Tiles view resolution. `screentrace-adapter-struts` consumes the same contribution, resolves Struts 1 Action mappings, ActionForms, local/global forwards, and Spring XML-managed Action beans. A project with Struts and annotation-based Spring MVC/Boot combines both contributions through the core graph merger; a classic Struts + Spring XML project is resolved directly by the Struts adapter. The static JSP renderer expands supported local markup and resources into `static-preview/`; Playwright Chromium then captures each rendered page, all DOM elements, deduplicated computed-style differences and graph-component correspondence without starting the target application. `screentrace-report` strictly validates schema 2.2 and injects Graph, Preview, asset dictionaries and manifest into a compiled `screentrace-viewer` template. `screentrace-cli` persists the workspace configuration in `~/.screentrace/config.json`, writes each result to `<output-root>/<project-name>/`, and opens the single report HTML with file://; no report server runs.

The viewer is split into graph projection/search (`map.ts`), focused relations (`relations.ts`), requester/API details (`details.ts`, `api-page.ts`), preview rendering and element-style display (`preview.ts`), and shared review state. URL search strips a context-path prefix only when `UrlResolution` evidence records an adopted value. Preview style records contain computed-style deltas from clean browser defaults for each captured non-script/style DOM element; this preserves effects from inline and external styles without embedding the original CSS source.

R11 WP39 removes the screen viewer's operation/inspection and element-visibility modes. Preview clicks continue through the existing static simulation path; Alt/Option-click and touch long-press select without simulation. The right panel keeps operation, API, validation, style, and technical evidence in fixed tabs; toolbar overflow actions remain keyboard accessible. These presentation changes do not alter graph data, simulation results, review state, or Markdown contracts. WP40's always-visible decision controls are not part of WP39.

OQ-016: `PreviewCaptureReader` normalizes computed local file URIs in styles/defaults into stable output-relative resource identifiers, rehashing changed style dictionaries and remapping element references. The original capture and packed documents remain unchanged; actual rendering still uses packed assets. URI paths outside the output root are rejected without disclosing paths. See [ADR 0047](adr/0047-report-local-resource-normalization.md).

## Prototype and Edit Mode

The report uses independent, durable contracts:

```text
application-graph.json   source-derived relationships and evidence
prototype-model.json     editable visual baseline projected from the graph
preview-model.json       static documents and graph-derived component trace data
screentrace-review.md    browser-generated reviewed migration instructions and machine state
```

The core EditOverlay model remains historical data; new analysis does not initialize it or consume it. Existing user-owned files are preserved. New review decisions use the shared composite-key TypeScript contract.

The viewer generates and imports a single review md file locally. Its human section isolates project text in bounded code spans; YAML and the final state appendix preserve complete IDs with strict escaping. A SHA-256 detects state corruption; orphan decisions remain intact. See [Review md contract](REVIEW_MD_CONTRACT.md). The legacy JSON generator and CLI export command have been removed at WP8.

## 1. Architectural Goal

ScreenTrace must separate framework-specific source interpretation from the canonical application representation.

The architecture therefore has three major stages:

```text
Source Project
     ↓
Discovery & Parsing
     ↓
Correlation / Analysis
     ↓
Application Graph
     ↓
Consumers
```

Consumers include:

- REST API
- Screen Explorer
- Prototype Viewer
- Flow Viewer
- Documentation generator
- Edit Mode
- Modernization analysis

---

## 2. 實際模組與分析流程

截至 WP0，根目錄 `pom.xml` 宣告七個 Maven 模組，另有一個 Node 模組。下圖只列目前存在的模組；箭頭表示資料流，不表示 Maven 相依方向。

```text
唯讀目標原始碼
        ↓
screentrace-scanner
        ↓
screentrace-parser-jsp ──→ screentrace-adapter-struts
        └───────────────→ screentrace-adapter-spring
                                    ↓
                         screentrace-core
                         Application Graph / merger
                                    ↓
                         screentrace-report
                         Graph / Prototype / Preview
                                    ↕
                         screentrace-capture (Node)
                         靜態 HTML / Chromium 截圖
                                    ↓
                         screentrace-cli
                         工作區 / 指令 / file:// 單檔 HTML
```

JavaScript AST 分析模組 screentrace-js 已建立（WP4 增量一）；單一 HTML 檢視器由 WP7 新增。WP7 單檔可離線直接開啟；圖／預覽／CSS／圖片／字型與 bundle 全部內嵌，沒有 localhost 或 fetch 相對資源。

## 3. 模組責任

### screentrace-core

框架中立的 Application Graph、evidence、resolution、API contract、graph merger、完整性驗證，以及 Prototype、Preview、Edit Overlay 契約。新分析 schemaVersion 一律 `2.2` 並嚴格驗證；`2.1` 僅供歷史相容資料／fixture。舊建構子與預設標 Deprecated，正式來源禁止使用。

### screentrace-scanner

`ProjectScanner` 建立原始碼清單與技術訊號；`SafeProjectFiles` 統一安全路徑、符號連結與檔案大小限制。

### screentrace-parser-jsp

共用 JSP/JSPF 標記解析、字面值互動目標、include、Tiles、`c:url`／`spring:url` 變數與 JSP tag file 展開。輸出 `JspAnalysis`，不自行解析後端路由或 handler。

### screentrace-adapter-spring

透過 JavaParser 解析 Spring annotation、Controller 與 API 契約，並解析 XML Controller、view resolver、Tiles 和 JSP 路由對應。Spring MVC 與 Spring Boot 共用此模組，沒有獨立 adapter-spring-boot 模組。

### screentrace-adapter-struts

解析 Struts 1 設定、Action Mapping、ActionForm、local/global forward，以及 Spring XML-managed Action；消費共用 JSP contribution 後建立圖關係。WP2 新增具真實行號的設定、Dyna form-property、plugins/exceptions、多模組前綴、Dispatch/Lookup/Mapping 方法解析、Validator / ActionForm 檢核、Tiles 繼承與巢狀 include，以及 Struts 2 的完整拒絕。新 Struts 圖使用 schema 2.2；詳細規則與未解析界線見 [ADR 0003](adr/0003-struts-static-resolution.md)。

### screentrace-report

SingleHtmlAnalysisWriter 彙整嚴格圖／Preview 與靜態封裝；SingleHtmlReportGenerator 只注入資料並驗證建置雜湊。舊 ReportGenerator／PreviewModelGenerator／樣式資源已於 WP7 E 移除。ReviewResultGenerator 歷史 JSON 入口與測試已於 WP8 移除。

### screentrace-cli

工作區設定、專案選單、分析協調、capture／pack 啟動與 file:// 單檔開啟；md 下載／匯入由檢視器處理。分析流程目前位於 adapters 和 CLI，沒有獨立 analyzer 模組。

### screentrace-capture

Node 模組，使用 Playwright 1.55.1；靜態化 JSP、展開支援的標記與本地資源、移除 active markup，在關閉 JavaScript 的 Chromium context 內產生截圖、元件 bounds 與樣式。`safe-files.mjs` 提供安全讀寫。正式 CLI 使用 `--preview-v2`，輸入嚴格 schema 2.2；完整元素／差異樣式與預設字典寫入 `static-preview/element-styles.json`，由 PreviewCaptureReader 轉為 PreviewModel version 2。條件分支原文、動態運算式、320px PNG data URI 縮圖與超量診斷完整保留。舊 capture 入口維持歷史相容，WP7 隨舊檢視器移除；詳見 ADR 0018。

### screentrace-parser（規劃中）

統整多種解析器的概念性邊界；目前以實際存在的 `screentrace-parser-jsp` 實作，不是 Maven aggregator。

### screentrace-analyzer（規劃中）

若未來需要拆分分析協調與關係解析，再建立獨立模組；目前功能由 adapters、core merger 與 CLI 負責。

### screentrace-server（規劃中）

未建立獨立 REST server。原 CLI localhost HTTP server 已於 WP7 E 移除，沒有新增此模組。

### screentrace-ui（規劃中）

未建立此模組；正式 UI 位於 screentrace-viewer。WP7 指定新增的名稱是 `screentrace-viewer`。

### 後續工作包指定的新模組（規劃中）

- `screentrace-js`：已建立的 Node 模組，Acorn / acorn-loose AST 與容錯診斷；ADR 0007 記錄釘選與 JSON 邊界。
- `screentrace-viewer`：WP7 TypeScript + esbuild 離線檢視器。
- `review-md`：WP8 瀏覽器與 Node 共用匯出邏輯，名稱可依 ADR 調整。

---

## 4. Application Graph

The Application Graph is the canonical representation of an analyzed system.

### 4.1 Schema contract and compatibility

`application-graph.json` is versioned. New analyses emit strict schema version `2.2`. Historical reading accepts versions `1.0`, `2.0`, `2.1` and versionless legacy JSON; versionless JSON keeps the historical `2.1` default. Historical data cannot silently become `2.2`.

Schema 2 preserves schema-1 fields (`source`, `confidence`) and constructors. It adds an `evidence` collection to nodes, relationships, and diagnostics so multiple source assertions can support one discovered relationship. Each evidence item records source location, parser, resolution status, and optional detail. This keeps existing report output readable while allowing Struts, Spring, JSP, and Tiles adapters to contribute independently.

The graph remains framework-neutral. Framework identifiers belong in evidence/parser metadata or node attributes, never in node or edge type names.

Schema 2.1 adds `apiContracts`, keyed by `ENDPOINT` ID. A contract records the statically discovered request parameters/body and response status/body, including field type, location, source location, and confidence. `SCREEN -> CALLS -> ENDPOINT` represents an API invoked during page load; `COMPONENT -> TRIGGERS -> ENDPOINT` represents an API invoked by an interactive component. An absent or unresolved contract is never synthesized from runtime assumptions.

### 4.2 WP1 行為與檢核 schema 2.2

新增 `behaviors` / `validationRules`（皆依 ID 排序）。schema 2.2 節點與邊必須具來源相對路徑/行號、解析器名稱與解析狀態；COMPONENT 的 attributes.kind 必須是 BUTTON、LINK、SUBMIT、TEXT_INPUT、TEXTAREA、SELECT、CHECKBOX、RADIO、DATE_PICKER、FILE_INPUT、MULTI_SELECT、FORM、MODAL、TABLE、OTHER。

Behavior 欄位為 id、triggerId、event、type、targetId、guard、parentId、expression、evidence。type 包含 NAVIGATE、SUBMIT_FORM、CALL_API、OPEN_DIALOG、VALIDATE、UI_STATE_CHANGE、SELECT_CHANGE、UNKNOWN。guard / expression 保留原文；父行為可提供回呼觸發來源。targetId 缺值表示無靜態已知目標，不捏造節點。

ValidationRule 欄位為 id、kind、fields、message、layer、parameters、evidence。layer 只用 MARKUP / CLIENT / SERVER；需求方指定框架語意保留於 evidence.detail（OQ-001 已決定）。validator 拒絕不合法引用、缺證據、kind 以及父循環。

`StableGraphIds` 定義不含行號與絕對路徑的鍵與 matched / orphaned / new 比對。`ApiUsage.derive(graph, screenDecisions, componentDecisions)` 共用純函式輸出 IN_USE / REMOVABLE / UNREFERENCED 與排序 callers；畫面決策以 screenId 為鍵，元件決策以 ComponentKey(screenId, componentId) 為鍵；共用元件在不同畫面各自決策。畫面 REMOVE 或該畫面的元件 REMOVE 才算移除來源。KEEP / UNDECIDED 皆保留；未偵測 caller 不授權移除。規則與相容策略見 [ADR 0002](adr/0002-behavior-model-and-stable-ids.md)。

### Example nodes

```text
SCREEN
COMPONENT
ENTRY_POINT
HANDLER
ENDPOINT
VIEW
SOURCE_ARTIFACT
FORM_MODEL
TEMPLATE_FRAGMENT
INTEGRATION
```

### Example edges

```text
RENDERS
CONTAINS
TRIGGERS
CALLS
HANDLED_BY
NAVIGATES_TO
DEFINED_IN
FORWARDS_TO
INCLUDES
BINDS_TO
DECLARED_BY
```

Example:

```text
SCREEN:query
   │ contains
   ↓
COMPONENT:searchButton
   │ triggers
   ↓
ENDPOINT:POST /query.do
   │ handled_by
   ↓
HANDLER:QueryAction.execute
   │ forwards_to
   ↓
SCREEN:result
```

---

## 5. Evidence Model

目前模型可接受缺 evidence 的舊資料；附件 C2 要求新的節點、邊、行為與檢核規則具有來源行號、解析器與解析狀態。WP1 已實作 schema 2.2 的嚴格驗證，歷史 schema 仍走相容路徑；所有 adapter 已遷移至嚴格 2.2；歷史 API 不供新分析使用。

Suggested structure:

```json
{
  "source": "src/main/webapp/WEB-INF/jsp/query.jsp",
  "lineStart": 42,
  "lineEnd": 44,
  "parser": "JspParser",
  "resolution": "CONFIRMED"
}
```

Possible resolution states:

```text
CONFIRMED
INFERRED
AMBIGUOUS
UNRESOLVED
```

This is important because static analysis cannot always determine runtime behavior.

---

## 6. Struts V1 Analysis Pipeline

### Step 1 — Source inventory

Find:

```text
struts-config*.xml
*.jsp
*.java
web.xml
```

### Step 2 — Parse Struts configuration

Extract:

- action mapping path
- action class
- form bean
- forwards
- input page

Example:

```xml
<action
    path="/query"
    type="com.example.QueryAction"
    name="queryForm"
    input="/query.jsp">

    <forward
        name="success"
        path="/result.jsp"/>
</action>
```

Normalize to framework-neutral objects.

### Step 3 — Parse JSP

Discover:

- forms
- form actions
- anchors
- submit controls
- buttons
- inputs
- Struts tags

Example:

```jsp
<html:form action="/query">
    <html:text property="id" />
    <html:submit value="Search" />
</html:form>
```

### Step 4 — Resolve route relationships

Match:

```text
/query
```

from JSP action to Struts ActionMapping.

### Step 5 — Resolve forwards

Connect Action mappings to views.

### Step 6 — Generate Application Graph

Produce graph nodes, edges, evidence, and unresolved diagnostics.

### Step 7 — Serialize JSON

Expose initial graph output for validation before building a sophisticated UI.

---

## 7. Suggested Java Model

Conceptual only; refine during implementation.

```java
public record Screen(
        String id,
        String name,
        String viewPath,
        List<ComponentRef> components,
        List<EntryPointRef> entryPoints,
        List<AnalysisEvidence> evidence) {
}
```

```java
public record Endpoint(
        String id,
        String httpMethod,
        String path,
        ResolutionStatus resolutionStatus) {
}
```

```java
public record GraphEdge(
        String from,
        String to,
        EdgeType type,
        List<AnalysisEvidence> evidence) {
}
```

Prefer immutable data structures where practical.

---

## 8. Adapter Strategy

A parser extracts syntax.

An adapter interprets framework semantics.

For example:

```text
XML parser
   ↓
StrutsConfigAdapter
   ↓
Route / Handler / Forward contributions
```

Suggested extension point:

```java
public interface AnalysisAdapter {
    boolean supports(ProjectContext context);

    AnalysisContribution analyze(ProjectContext context);
}
```

A later implementation may split this into more focused interfaces such as:

```text
SourceParser
FrameworkAdapter
GraphContributor
ReferenceResolver
```

Do not over-engineer this before the first Struts pipeline works.

---

## 9. Persistence

Persistence is not mandatory for the first POC.

Initial approach:

```text
Project source
   ↓
Analysis execution
   ↓
ApplicationGraph object
   ↓
JSON file / REST response
```

Later persistence options may include:

- relational database
- document storage
- graph database

Do not introduce a graph database solely because the domain is graph-shaped.

---

## 10. UI Architecture

Initial UI should consume backend graph APIs.

Suggested views:

### Project Overview

- framework detection
- screen count
- route count
- unresolved references

### Screen Explorer

```text
Screen list | Screen preview | Trace details
```

### Trace Panel

Selecting a component displays:

```text
Component
   ↓
Action
   ↓
Endpoint
   ↓
Handler
   ↓
Target Screen
```

### Flow Viewer

Graph-oriented view showing screen transitions.

### Edit Mode

Maintains a separate overlay model:

```text
Discovered Graph
      +
Edit Overlay
      ↓
Target-State View
```

Do not mutate discovery results when a user edits a prototype.

---

## 11. AI Integration Strategy

AI is a secondary capability.

Appropriate future uses:

- explain a discovered flow in business language
- classify screens
- suggest component names
- identify potentially obsolete functions
- summarize modernization impact
- resolve ambiguous code patterns with explicit confidence markers

AI must not silently overwrite deterministic analysis results.

---

## 12. Architecture Decision Priorities

When trade-offs occur, prioritize in this order:

1. Trace correctness
2. Explainability
3. Framework extensibility
4. Testability
5. Performance
6. UI polish

### WP3 標記與圖貢獻

`JspAnalysis.markup` 按來源相對路徑提供 `MarkupAnalysis`，涵蓋 JSP/JSPF/HTML：元件種類、穩定 ID、原始屬性、行號、條件原文、迴圈、表單／欄位、事件運算式、MARKUP 檢核與彈窗行為。事件／檢核來源使用屬性實際行號。主解析直接掃描原始文字，忽略註解、scriptlet、script/style 與 EL 字串中的假標籤，保留真實行號；`preprocess` 僅保留既有相容 API，不作為解析入口。

R3 的 `JspTagFileExpander` 靜態讀取 taglib `tagdir` 內的 `.tag`，只代入呼叫處提供的字面屬性，遞迴展開自訂標籤及 `<jsp:doBody/>`。最大深度為 12，循環與超深度均產生診斷；動態屬性保留原運算式並維持未解析。tag file 產生的元件使用實際畫面作為擁有者，證據包含呼叫與定義位置。Spring adapter 只在該 JSP 有唯一 controller route 時，才以路由目錄解析相對 URL；多路由保持歧義，缺路由保持未解析。URL 變數只延續 ADR 0005 的 `c:url`／`spring:url` 邊界，`c:set` 不作為定義來源。

`UrlVariableResolver` 僅實作 v1.2 WP3.8 指定的同來源 URL 常值例外。Interaction 保留 `originalExpression`、`definitionEvidence` 及 `componentId`，投影至 include 使用者時不改寫定義來源。OQ-013 僅允許 spring:url 的單一靜態定義與使用位於同一已證明迴圈作用域；迴圈外／不同迴圈、第二次定義、EL 值與可能改寫均未解析，c:url 迴圈維持原邊界。來源字串 CONFIRMED 與後端路由對應信心分開；{name} 保留樣板，param 不解析，未知函式不作透明包裝。見 ADR 0005。

`MarkupGraphContribution` 將元件、MARKUP 規則、檢核／彈窗／導覽／表單行為整合到 canonical graph，遞迴展開 directive／jsp include、Tiles insert／put、定義參照與繼承。共享片段維持同一 component ID、各畫面 CONTAINS 所有權，包含位置的條件與 repeated 證據保留於所有權邊；元件 conditional／repeated 為任一使用處存在此性質的標記，詳情以該畫面的邊證據為準。

Spring 只在來源中的正式 `@ModelAttribute`、名稱、類別、欄位及表單提交／畫面 rendering 處理器作用域可唯一證明時綁定；同名非 Spring 註解、缺少／多個型別等保留 UNRESOLVED。Struts 以 action 對應的 form-bean、Dyna 屬性或可解析 ActionForm 欄位／getter 來源建立 BINDS_TO。未證明的欄位保留 `bindingStatus=UNRESOLVED`。已發現元件的存在性、kind、目標、模型綁定各自記錄信心，既有 UNRESOLVED 元件信心不升級。

WP3 未引入相依；Spring 輸出仍保留既有 schema 2.1 相容路徑，Struts 為 2.2。所有 adapter 統一為 2.2 與移除混合降版屬 WP5，尚未宣稱完成。WP4 已加入靜態 JavaScript 貢獻（見下節）；WP5／WP6 未開始。

### WP4 靜態 JavaScript 貢獻

獨立 screentrace-js 模組以 Acorn／acorn-loose AST 解析，bindings 對 ScriptSources 的原始靜態 DOM 解析事件，api-table.json 識別公開第三方 API 並略過其內部。values 提供抽象值，modules 只解析安全的本地相對 import；analyzer 追蹤函式及回呼，預設深度 10、循環保護，所有失敗保留來源與診斷。

JavaScriptGraphContribution 以 JSON 邊界整合 Spring／Struts adapter 的 inline script、src、事件屬性、javascript URL 及 include 使用者。載入來源使用畫面 ID；失敗綁定保留 selector／UNRESOLVED 呼叫來源。CLIENT 規則、父子行為、HTTP method／URL／資料欄位、條件與呼叫鏈進入 canonical graph。已解析的前端請求建立 backendStatus=UNRESOLVED 的描述節點，後端匹配與統一 schema 2.2 屬 WP5。ApiUsage 對 canonical 行為與簡化邊去重。見 ADR 0007–0010。

script src 的不透明 context 前綴依 v1.3／OQ-003，僅用於定位來源檔案；API URL 不套用該例外。相同來源可證明的單次常值定義附 evidence；未知 API context 部分保留樣板。目標程式不執行，渲染仍移除 script 並關閉 JavaScript。

### WP5 增量一

UrlResolution 為 Spring／Struts 的共用 URL 引擎，保留全部候選及信心、方法不符與 context 診斷。設定以 Properties／安全 SnakeYAML 2.4 解析，工作區 contextPaths 以專案絕對路徑為鍵、候選陣列為值，透過 ProjectInventory 傳入；無設定不推測。見 ADR 0011。圖關聯接入、契約與 SERVER 檢核、schema 退場依序在後續增量實作。

### WP5 增量二

UrlGraphContribution 對 canonical API／表單請求套用共用引擎，保留全部候選、方法診斷及載入／失敗綁定來源。唯一結果連端點，多候選 targetId=null 並建立全部歧義關聯。workspace context 證據使用 workspace:config.json 與設定鍵行號，detail 只有鍵／候選／採用值；reserved 目標名稱被 scanner／safe read 拒絕。圖輸出前遮蔽使用者家目錄文字，工作區真實設定路徑不進圖。見 ADR 0012／0013 與 OQ-004；契約／SERVER 檢核及 schema 退場待後續增量。

### WP5 增量三

共用 ApiContractExtractor 以來源 DTO 擷取欄位（含 getter／record／繼承），正式 import 唯一解析；無唯一型別時列出全部候選並標 AMBIGUOUS。Spring 辨識純後端 ResponseBody／ResponseEntity，Struts ActionContracts 擷取 ActionForm、getParameter 常值與設定 forward。SpringServerValidation 以 JavaParser AST 擷取正式 javax／jakarta constraints、Valid／Validated、InitBinder 與可解析 Validator，不執行目標程式；SERVER 規則用穩定 ID，endpointIds／validationRuleIds 保持雙向對照，fields 同時保留欄位與對應元件 ID。動態 groups／message 保留原文與 UNRESOLVED；循環與未證明註冊有診斷。見 ADR 0014。

### WP5 增量四與歷史入口

所有 adapter／CLI 新分析回傳 2.2 並通過 requireAnalysis。合併嚴格 2.2 輸入／輸出均驗證；混合版本與缺證據 2.2 拒絕，兩份 2.1 僅回傳明確標示的歷史圖，不升版。相同行為的證據合併、不同結果不擇一，CLI 再執行共用 URL 配對。ReportGenerator 歷史入口與原測試已於 WP7 E 移除；ReviewResultGenerator 與其測試已於 WP8 移除；新檢視器／共用 review／md 模組只接受嚴格 2.2。見 ADR 0015／0016。

### screentrace-viewer

WP7 新單檔檢視器；TypeScript 7.0.2／esbuild 0.28.2 僅建置期，執行期無 UI 框架。Java SingleHtmlReportGenerator 嚴格 2.2，僅注入資料並驗證建置 script 雜湊。單檔 file:// 不 fetch 任何資源；CSP style-src unsafe-inline 依 v1.5 授權，script-src 僅雜湊，srcdoc sandbox 不含 allow-scripts。E 已移除舊 ReportGenerator 與 server。B 自製 SCC 分層；C srcdoc 及全部樣式／來源面板；D review 共用模組；E API 頁。資料／版本契約見 REVIEW_STATE_CONTRACT，設計見 ADR 0019–0021。

### WP8 本地 review md

shared/review-md 與 strict-graph 供瀏覽器／Node 共用，建置同時提供 ESM artifact。Acorn 8.18.0 MIT 只解析輸出運算式的內容邊界，不執行。md-controls 以 Blob 下載和檔案選擇器讀本地內容；通過最後附錄／已知鍵／決策／大小／SHA 驗證後才原子更新目前狀態。指紋不同／orphan 保留決策並提示，不猜測改名。正文／機器區隔離、格式、排序與容量見 REVIEW_MD_CONTRACT、ADR 0022–0025；元件庫覆寫已於 WP9 接入同一共用狀態模型。

### WP9 元件庫選用與覆寫

CLI LibraryStore／LibraryCommands 使用工作區內容 SHA-256 定址、專案明確綁定／解除與 --replace；ComponentLibrary 在 report 邊界以打包的 draft 2020-12 Schema 驗證，不改 core。Java analyze／report 只注入選用 manifest 與摘要；viewer／Node 共用 library 精確比對／kind 涵蓋率與 review 可逆來源分區。外庫覆寫保留 orphan，不參與有效建議／API。md 動態 v1/v2 與同一分區往返，契約見 REVIEW_STATE_CONTRACT／REVIEW_MD_CONTRACT；設計 ADR 0027–0031。WP10 合成整合驗證見下節。

### WP10 合成來源與整合驗證

fixtures/wp10 是自行撰寫的 source-only 分析資料，不是 Maven 模組或可啟動系統。coverage.json 以要求編號、檔案及原始 token 清單覆蓋 WP2–WP5。CLI 測試透過現有 analyze 入口使用隔離來源／工作區，綁定虛構 manifest，兩次經 adapter／嚴格 2.2／capture／pack／SingleHtmlAnalysisWriter，保存實際產物供 Node 使用；沒有替換 payload 的測試捷徑。每份目標來源分析前後 SHA-256 相同。

screentrace-viewer/test/synthetic-project.e2e.mjs 直接讀取 Java 產物，Node md 決定性與 Chromium／Firefox／WebKit file:// 標記、覆寫、下載、清暫存、匯入還原共用正式資料與模組。預覽比較限定同次測試的相同 Chromium／viewport／字型環境；沒有跨環境圖片 golden。完整圖／預覽／HTML 不忽略任何欄位，md 只正規化 generated_at。

本輪只含 fixture、決定性、E2E、USER_GUIDE／README／架構文件；既有 security.yml 已涵蓋新增 Java 與 *.e2e.mjs，不修改 CI、效能、格式化或相容入口。決定見 ADR 0032；使用步驟與實際合成報表截圖位置見 USER_GUIDE。

R3 WP19：畫面顯示名稱由 viewer names.ts 單一決定，唯一 title → 唯一 h1 → 人性化 view basename，重名追加主要 URL／穩定序號。卡片只顯示名稱與主要 URL，來源保留於右欄／檔案樹；display graph 不修改 canonical graph 或 md，見 ADR 0038。

R3 WP17／WP20：JspTagFileExpander 在 JSP adapter 依已證明 tagdir 與呼叫屬性展開，保留呼叫／定義證據、循環與深度限制。僅已知字面屬性的 ${fn:escapeXml(var)} 做 XML 跳脫代入，動態屬性／未知函式保持資料及未解析邊界；不執行目標碼。Spring adapter 的 ControllerReturns 以 JavaParser 提取每個 return，保留 guard、來源與 INFERRED／AMBIGUOUS；經端點／handler 投射畫面邊，AJAX 不當成導頁。

R3 WP20：overview.ts 在 viewer 依相同連結目的／名稱／屬性跨至少兩個且 ≥50% 畫面計算全站導覽，混合關聯保留非導覽觸發者；canonical graph 與 schema 不變。總覽採穩定 ID 排序格狀座標、卡片間走廊正交路徑與進出邊 hover；聚焦將全站導覽另分組，未解析目的合併且保留所有觸發／證據。labels.ts 共用可讀元件標籤，diagnostics.ts 為每個現有代碼提供中文收合分類，英文與完整來源置技術明細。主要 URL 先選直接 render 的路由，再選入站路由；全部候選仍保留。見 ADR 0039。

R4 UI1：shell-ui.ts 只建立本地 SVG 圖示與外殼控制元件，main.ts 組織頂部導覽／左側畫面脈絡／右側空狀態；診斷與元件庫原內容移至本地 dialog。CSS 變數提供系統字型與 AA 色彩，不載入外部資源。md-controls 只更換檔案選擇的呈現入口，共用格式／決策／API 模組不變；見 ADR 0040。

R5 WP23：總覽改由流程邊（不含全站導覽與自我迴圈）做 sorted DFS 去回邊、DAG 最長路徑分層與重心排序；無流程關聯者獨立置右欄。保留卡片間走廊路由與聚焦版面，全站導覽只疊加較淡的線；>150 畫面或 >600 關聯使用原格狀保護。見 ADR 0049。單一 HTML 的 application.path 不注入，但指紋仍來自完整 canonical graph，見 ADR 0048。

R6 WP24–WP25：capture 縮圖為決定性的640px PNG，reader保留格式／範圍驗證。總覽卡片80%為縮圖，擴大既有走廊格距。prototype.ts 以原單一 sandbox iframe 顯示完整靜態文件，依原寬度縮放及內容高度撐高；FLIP使用父頁WAAPI300ms，reduced-motion直接切換。prototype-history.ts只在記憶體保存畫面與捲動位置，canvas保留平移縮放；流程視圖為明確切換入口。所有預覽文字仍經DOM及textContent顯示，inert-document先中和會預載的屬性再由DOMParser解析，offline-css沿用本專案capture的資源token掃描，僅允許嵌入資源、遞迴隔離data CSS，另有iframe CSP。父頁攔截點擊／送出與鍵盤，目標腳本移除且sandbox無allow-scripts；WP25僅提示，不執行WP26模擬。canonical graph、review/md/API規則與指紋不變；見ADR0050／0051。

R6 WP26：simulation.ts 為純圖規則，exact preview path→元件→行為，保留全部候選／未知分支與來源證據，不執行條件。simulation-ui.ts 將效果轉為原型導覽、原生表單驗證／可能的 SERVER 訊息、既有 MODAL 覆蓋層及不發送的 API 提示；覆蓋率以真實靜態 DOM 計算，未配對／缺失文件不隱藏。WebKit 阻擋 sandbox 內父頁事件回呼，simulation-surface.ts 使用精確 DOM 矩形的父頁原生控制與暫時值同步，規則共用、目標 HTML／腳本不進父頁，原 iframe 保持無 allow-scripts。模擬狀態僅記憶體，重置重建；canonical graph、review/md、API 推導及指紋不變。見 ADR0052。

WP26驗收呈現補強（ADR0053）：操作模式以元素摘要為主，計算樣式收合、檢查模式保留樣式優先。送出結果窄條有高度上限及內部捲動，每個候選白話原因與完整證據分離、技術細節預設收合。覆蓋率分成互斥的圖支持行為／可直接輸入欄位／無法確認三類；不改推導、圖、review或md。

## R7 展開來源錨點

Java JspTagFileExpander 在原始檔案分組開啟標籤，臨時書籤保存來源鏈；書籤不進入任何輸出，也不參與 StableGraphIds、名稱、事件或檢核解析。展開後清除書籤，JspProjectParser 將旁表中的錨點加入元件 attributes.expansionAnchor。doBody 內容保留呼叫者的位置與同行序號。

capture 在 annotateSource 原文階段使用同一行號／序號规则，自訂 tag 展開時傳遞呼叫鏈。分組名稱轉小寫，但 tag 檔案查找保留原始名稱大小寫，避免大小寫不敏感檔案系統產生不同來源字串。componentLinks 僅在同畫面精確錨點相等時標記 ANCHOR；唯一候選為 INFERRED，多候選為 AMBIGUOUS 全列。無錨點候選時依既有 ID／name／field／來源證據標 HEURISTIC；移除無來源的同標籤第一筆猜測。

PreviewElement 增 optional expansionAnchor、matchBasis（ANCHOR／HEURISTIC）。PreviewCaptureReader 與 viewer.requirePreview 驗證已知值、同畫面全部錨點候選與解析狀態。capture 原始 HTML 保留 data-st-expansion-anchor；打包成展示用文件時移除這個重複的工具屬性，圖與 preview model 保留完整錨點。原始 capture 文件、身分與安全處理不變。

Java 與 Node 仍有獨立 tag 展開器；共用 docs/examples/expansion-anchor-vectors.json，配合 CLI 整合與真實專案唯讀驗收降低漂移。WP29 的未對應原因分類尚未實作。

## R7 WP29 預覽原因契約（OQ-018）

PreviewElement.unmappedReason 是可選的五類字串：NO_GRAPH_COMPONENT、AMBIGUOUS_CANDIDATES、ANCHOR_MISSING、DYNAMIC_OR_UNRESOLVED_SOURCE、OTHER；只用於 a/button/form/select/input/textarea 且元件未唯一對應。capture 配對完成後記錄，reader／viewer 拒絕未知值、已對應元件或非可操作元素誤用。舊預覽 fixture 缺少此欄位仍可讀取；新 capture 為適用元素輸出原因。沒有 graph schema 改動。

已對應但無法模擬的原因只由 viewer 推導，不寫入 unmappedReason。simulation.ts 的 assessSimulation 呼叫原 simulate／canSimulate，並共用 callback-root、事件適用、證據解析與 effect 判定；simulation-ui.ts 的 elementSimulationAssessment 統一 DOM 彈窗可用性與原生輸入條件；畫面／專案統計、右欄及點選提示使用同一 assessment。每個未知元素恰歸一類；原生可編輯欄位排除於未知分類，無行為與已記錄行為的歧義／目的未解析／類型或事件不支援用中文兩層呈現。見 ADR0055、reports/R7.md。

R7 決定性補強：capture 在元素樣式／bounds 量測前，先觸發版面、於 Node 有界輪詢各 FontFace 是否仍 loading；目標 JavaScript 始終停用。字型完成或失敗的 fallback 才記錄，5 秒逾時維持 capture 失敗診斷。沒有改寫或正規化原始 computed-style 數值，詳 ADR0055。
