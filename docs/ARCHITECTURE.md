# ScreenTrace Technical Architecture

## Current POC implementation

The current implementation analyzes server-rendered JSP applications using Struts 1, Spring MVC, Spring Boot, or their supported combinations.

```text
Target source (read-only) -> scanner -> selected Spring and/or Struts adapter -> ApplicationGraph JSON -> localhost report
```

`screentrace-core` has no Spring dependency. `screentrace-scanner` inventories files and technology signals only. `screentrace-parser-jsp` is the shared, framework-neutral parser for JSP, JSPF, literal interactive targets, JSP includes, Tiles definitions, and literal Spring URL-tag variables. `screentrace-adapter-spring` consumes that contribution and adds annotation and XML Controller endpoint correlation, `SimpleUrlHandlerMapping`, `InternalResourceViewResolver`, and Tiles view resolution. `screentrace-adapter-struts` consumes the same contribution, resolves Struts 1 Action mappings, ActionForms, local/global forwards, and Spring XML-managed Action beans. A project with Struts and annotation-based Spring MVC/Boot combines both contributions through the core graph merger; a classic Struts + Spring XML project is resolved directly by the Struts adapter. The static JSP renderer expands supported local markup and resources into `static-preview/`; Playwright Chromium then captures each rendered page and its visible interactive-component bounds without starting the target application. `screentrace-report` reads only the Application Graph, Prototype, and Preview contracts (plus the user-owned edit overlay) in the browser. `screentrace-cli` persists the workspace configuration in `~/.screentrace/config.json`, writes each result to `<output-root>/<project-name>/`, and hosts every report on an available loopback port.

## Prototype and Edit Mode

The report uses independent, durable contracts:

```text
application-graph.json   source-derived relationships and evidence
prototype-model.json     editable visual baseline projected from the graph
preview-model.json       static documents and graph-derived component trace data
edit-overlay.json        user-owned target-state operations
review-result.json       version-2 review decisions and migration metadata (on export)
```

`edit-overlay.json` is initialized once and never overwritten by later analyses. Operations (`HIDE`, `UPDATE`, `MOVE`, `ADD`) target stable prototype component IDs.

CLI and authenticated browser exports share `ReviewResultGenerator`. The version-2 review contract combines decisions with graph-derived API contracts, direct navigation, source locations, and existing preview metadata. It never re-parses target source or assigns review decisions to APIs. See [Review result contract](REVIEW_RESULT_CONTRACT.md) for schema, provenance, missing-data behavior, and ordering.

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
                         工作區 / 指令 / localhost 報表
```

JavaScript AST 分析模組與單一 HTML 檢視器尚未建立，分別由 WP4、WP7 新增。目前報表仍需 CLI 的 localhost 伺服器；「standalone」表示工具獨立於目標專案建置，不代表現有報表已符合單一離線 HTML 的驗收。

## 3. 模組責任

### screentrace-core

框架中立的 Application Graph、evidence、resolution、API contract、graph merger、完整性驗證，以及 Prototype、Preview、Edit Overlay 契約。現行 schemaVersion 為 `2.1`；WP1 尚未完成，不能把已有版本欄位視為完整行為模型。

### screentrace-scanner

`ProjectScanner` 建立原始碼清單與技術訊號；`SafeProjectFiles` 統一安全路徑、符號連結與檔案大小限制。

### screentrace-parser-jsp

共用 JSP/JSPF 標記解析、字面值互動目標、include、Tiles 與 Spring URL tag 擷取。輸出 `JspAnalysis`，不自行解析後端路由或 handler。

### screentrace-adapter-spring

透過 JavaParser 解析 Spring annotation、Controller 與 API 契約，並解析 XML Controller、view resolver、Tiles 和 JSP 路由對應。Spring MVC 與 Spring Boot 共用此模組，沒有獨立 adapter-spring-boot 模組。

### screentrace-adapter-struts

解析 Struts 1 設定、Action Mapping、ActionForm、local/global forward，以及 Spring XML-managed Action；消費共用 JSP contribution 後建立圖關係。DispatchAction、Validator 與 Struts 2 明確拒絕的完整驗收屬於 WP2，尚未完成。

### screentrace-report

產生圖、Prototype、Preview、靜態報表與 version-2 review JSON。現行 HTML/JS/CSS 內嵌於 `ReportGenerator`；WP7 將以獨立檢視器取代，WP8 將以 md 匯出取代 JSON。

### screentrace-cli

工作區設定、專案選單、分析協調、capture 啟動、本機報表 HTTP server、review overlay 儲存與 JSON 匯出。分析流程目前位於 adapters 和 CLI，沒有獨立 analyzer 模組。

### screentrace-capture

Node 模組，使用 Playwright 1.55.1；靜態化 JSP、展開支援的標記與本地資源、移除 active markup，在關閉 JavaScript 的 Chromium context 內產生截圖、元件 bounds 與樣式。`safe-files.mjs` 提供安全讀寫。

### screentrace-parser（規劃中）

統整多種解析器的概念性邊界；目前以實際存在的 `screentrace-parser-jsp` 實作，不是 Maven aggregator。

### screentrace-analyzer（規劃中）

若未來需要拆分分析協調與關係解析，再建立獨立模組；目前功能由 adapters、core merger 與 CLI 負責。

### screentrace-server（規劃中）

未建立獨立 REST server。現有 localhost HTTP server 位於 CLI，WP7 要求移除報表伺服器，並非承諾新增此模組。

### screentrace-ui（規劃中）

未建立此模組；目前 UI 位於 report。WP7 指定新增的名稱是 `screentrace-viewer`。

### 後續工作包指定的新模組（規劃中）

- `screentrace-js`：WP4 JavaScript AST 分析，名稱可依 ADR 調整。
- `screentrace-viewer`：WP7 TypeScript + esbuild 離線檢視器。
- `review-md`：WP8 瀏覽器與 Node 共用匯出邏輯，名稱可依 ADR 調整。

---

## 4. Application Graph

The Application Graph is the canonical representation of an analyzed system.

### 4.1 Schema contract and compatibility

`application-graph.json` is versioned. New analyses emit schema version `2.1`; consumers must also accept explicit versions `1.0` and `2.0`, and versionless legacy JSON. Versionless JSON is normalized to `2.1` when read.

Schema 2 preserves schema-1 fields (`source`, `confidence`) and constructors. It adds an `evidence` collection to nodes, relationships, and diagnostics so multiple source assertions can support one discovered relationship. Each evidence item records source location, parser, resolution status, and optional detail. This keeps existing report output readable while allowing Struts, Spring, JSP, and Tiles adapters to contribute independently.

The graph remains framework-neutral. Framework identifiers belong in evidence/parser metadata or node attributes, never in node or edge type names.

Schema 2.1 adds `apiContracts`, keyed by `ENDPOINT` ID. A contract records the statically discovered request parameters/body and response status/body, including field type, location, source location, and confidence. `SCREEN -> CALLS -> ENDPOINT` represents an API invoked during page load; `COMPONENT -> TRIGGERS -> ENDPOINT` represents an API invoked by an interactive component. An absent or unresolved contract is never synthesized from runtime assumptions.

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

目前模型可接受缺 evidence 的舊資料；附件 C2 要求新的節點、邊、行為與檢核規則具有來源行號、解析器與解析狀態。嚴格驗證與相容性處理屬於 WP1，尚未完成。

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
