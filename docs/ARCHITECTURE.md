# ScreenTrace Technical Architecture

## Current POC implementation

The current implementation follows two product pipelines: Spring Boot with React, and annotation-based Spring MVC with JSP.

```text
Target source (read-only) -> scanner -> selected Spring adapter -> ApplicationGraph JSON -> standalone report
```

`screentrace-core` has no Spring dependency. `screentrace-scanner` inventories files and technology signals only. `screentrace-adapter-spring` dispatches Spring Boot projects to REST/React analysis and Spring MVC projects to controller, literal view, conventional JSP, form, link, and button analysis. It uses JavaParser for Java and bounded static extraction for markup. For React routes, `screentrace-capture` starts only the target frontend's local Vite process, fulfills API requests with isolated mock responses, freezes the rendered DOM/CSS/resources to `static-preview/`, then stops Vite; it never starts the target Spring Boot backend. The capture process can explore supported multi-step forms using internally generated data. It emits `flow-states.json`; `FlowStateGraphAugmenter` adds the reached states and their button transitions to the Application Graph with `INFERRED` confidence and a synthetic `#step-n` identity, preserving the source route separately. `screentrace-report` reads only `application-graph.json` and static report artifacts in the browser. `screentrace-cli` writes output to `<target>/.screentrace` unless `--output` is supplied and hosts the report independently on port 8088.

## Prototype and Edit Mode

The report emits three independent, durable contracts:

```text
application-graph.json   source-derived relationships and evidence
prototype-model.json     editable visual baseline projected from the graph
edit-overlay.json        user-owned target-state operations
```

`edit-overlay.json` is initialized once and never overwritten by later analyses. Operations (`HIDE`, `UPDATE`, `MOVE`, `ADD`) target stable prototype component IDs. Runtime screenshots are optional visual references under `screenshots/`; they are not the editable model.

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

`application-graph.json` is versioned. New analyses emit schema version `2.0`; consumers must also accept explicit version `1.0` and versionless legacy JSON. Versionless JSON is normalized to `2.0` when read.

Schema 2 preserves schema-1 fields (`source`, `confidence`) and constructors. It adds an `evidence` collection to nodes, relationships, and diagnostics so multiple source assertions can support one discovered relationship. Each evidence item records source location, parser, resolution status, and optional detail. This keeps existing report output readable while allowing Struts, Spring, JSP, and Tiles adapters to contribute independently.

The graph remains framework-neutral. Framework identifiers belong in evidence/parser metadata or node attributes, never in node or edge type names.

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
