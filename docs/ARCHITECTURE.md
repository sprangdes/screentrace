# ScreenTrace Technical Architecture

## Current POC implementation

The current implementation analyzes server-rendered JSP applications using Struts 1, Spring MVC, Spring Boot, or their supported combinations.

```text
Target source (read-only) -> scanner -> selected Spring adapter -> ApplicationGraph JSON -> standalone report
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

## 2. High-Level Architecture

```text
┌──────────────────────────────────────────────┐
│                Source Project                │
│ Java / JSP / XML / HTML / JavaScript / ... │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│             screentrace-scanner              │
│ File inventory / technology detection       │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│             screentrace-parser               │
│                                              │
│ Struts | Spring MVC | Spring Boot | JSP ... │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│            screentrace-analyzer              │
│ Resolve references and build relationships  │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│               screentrace-core               │
│             Application Graph                │
└──────────────────────┬───────────────────────┘
                       ↓
      ┌────────────────┼────────────────┐
      ↓                ↓                ↓
 REST Server      Prototype UI      Documentation
```

---

## 3. Module Responsibilities

### screentrace-core

Contains only framework-neutral abstractions.

Responsibilities:

- graph model
- domain entities
- evidence model
- resolution status
- serialization contracts

Must not depend on Struts, Spring MVC, JSP, or frontend framework-specific classes.

### screentrace-scanner

Responsibilities:

- recursively scan source trees
- classify files
- detect likely technologies
- build project inventory
- provide source access to parsers

Potential concepts:

```text
ProjectContext
SourceFile
SourceType
TechnologyProfile
```

### screentrace-parser

Responsibilities:

- parse individual source technologies
- produce normalized contributions

Initial parsers:

```text
StrutsConfigParser
JspParser
JavaActionParser
```

Future parsers:

```text
SpringMvcParser
SpringBootParser
AngularParser
ReactParser
VueParser
JavaScriptParser
```

### screentrace-parser-jsp

Responsibilities:

- discover JSP screens and JSPF fragments
- extract literal HTML, Spring tag, and Struts tag interactions
- extract JSP include relationships
- parse Tiles definitions without loading external entities
- emit framework-neutral `JspAnalysis`; do not resolve routes or handlers

### screentrace-adapter-struts

Responsibilities:

- parse every `struts-config*.xml` module
- resolve Action Mapping, ActionForm, input page, local forward, and global forward
- resolve Struts Action bean IDs against Spring XML bean classes when available
- correlate shared JSP interactions with Struts request paths, including `.do` aliases
- emit only framework-neutral Application Graph nodes and edges

### screentrace-analyzer

Responsibilities:

- merge parser contributions
- resolve references
- correlate route/view/action/component data
- detect unresolved relationships
- construct final Application Graph

Example correlation:

```text
JSP form action="/query"
             +
Struts mapping path="/query"
             +
Action type="com.example.QueryAction"
             +
Forward name="success" path="/result.jsp"
             ↓
Screen relationship
```

### screentrace-server

Responsibilities:

- expose analysis API
- manage imported projects
- execute analysis pipeline
- provide graph queries
- persist analysis results if required

### screentrace-ui

Responsibilities:

- Screen Explorer
- Screen Detail
- Component Trace
- Flow Viewer
- Prototype Viewer
- Edit Mode

The UI must not contain framework-specific analysis logic.

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

Every graph assertion should optionally contain evidence.

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
