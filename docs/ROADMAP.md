# ScreenTrace Implementation Roadmap

> Current POC direction (2026-09-11): Spring Boot plus React static analysis is the first milestone. Struts is deferred. The executable pipeline is `scanner -> spring adapter -> framework-neutral Application Graph JSON -> standalone report -> CLI`.

## Spring Boot / React POC

- [x] Maven modules: core, scanner, adapter-spring, report, CLI
- [x] Framework-neutral graph JSON contract with source locations and confidence
- [x] Spring annotation analysis through JavaParser
- [x] Static React route, navigation, and API-literal extraction
- [x] Generated, standalone interactive report
- [x] Prototype Model and non-destructive Edit Overlay contracts
- [x] `analyze`, `--output`, `--serve`, and `serve` CLI workflows
- [ ] Expand React JSX/component extraction based on Reservio gaps
- [ ] Record full Reservio validation results

## Phase 0 — Repository Foundation

Goal: establish a stable project structure before implementing framework analysis.

### Tasks

- [ ] Create Maven multi-module structure
- [ ] Create `screentrace-core`
- [ ] Create `screentrace-scanner`
- [ ] Create `screentrace-parser`
- [ ] Create `screentrace-analyzer`
- [ ] Create `screentrace-server`
- [ ] Define package naming convention
- [ ] Add unit-test framework
- [ ] Add sample fixture directory
- [ ] Add CI build

### Exit Criteria

```text
mvn clean verify
```

passes with all modules.

---

## Phase 1 — Core Application Graph

Goal: define the canonical framework-neutral representation.

### Tasks

- [ ] Define graph node abstraction
- [ ] Define graph edge abstraction
- [ ] Define Screen
- [ ] Define Component
- [ ] Define Endpoint
- [ ] Define Handler
- [ ] Define EntryPoint
- [ ] Define View
- [ ] Define SourceArtifact
- [ ] Define AnalysisEvidence
- [ ] Define ResolutionStatus
- [ ] Add JSON serialization

### Exit Criteria

A graph can be constructed manually in a test and serialized into JSON.

---

## Phase 2 — Project Scanner

Goal: inventory a legacy Web project.

### Tasks

- [ ] Recursive file discovery
- [ ] Ignore target/build directories
- [ ] Detect Java files
- [ ] Detect JSP files
- [ ] Detect `struts-config*.xml`
- [ ] Detect `web.xml`
- [ ] Produce `ProjectInventory`
- [ ] Add technology detection

### Exit Criteria

Given a sample Struts project, ScreenTrace reports its relevant source artifacts correctly.

---

## Phase 3 — Struts Configuration Parser

Goal: resolve Struts routing metadata.

### Tasks

- [ ] Parse Struts config XML
- [ ] Extract action path
- [ ] Extract action type
- [ ] Extract form bean
- [ ] Extract input view
- [ ] Extract forwards
- [ ] Track evidence
- [ ] Handle multiple Struts config files

### Exit Criteria

Example:

```text
/query
  -> QueryAction
  -> success
  -> /result.jsp
```

can be derived from the fixture project.

---

## Phase 4 — JSP Parser

Goal: discover screen interactions.

### Tasks

- [ ] Identify JSP screens
- [ ] Parse HTML forms
- [ ] Parse Struts `<html:form>`
- [ ] Parse anchors
- [ ] Parse submit controls
- [ ] Parse buttons
- [ ] Parse input fields
- [ ] Resolve labels where practical
- [ ] Track source evidence

### Exit Criteria

Given a JSP, ScreenTrace can describe its major interactive components and actions.

---

## Phase 5 — Struts Correlation Analyzer

Goal: connect frontend behavior with backend routes.

### Tasks

- [ ] Normalize JSP action paths
- [ ] Match form actions to Struts mappings
- [ ] Match handlers
- [ ] Resolve forwards
- [ ] Connect target JSP screens
- [ ] Identify unresolved routes
- [ ] Generate diagnostics

### Exit Criteria

ScreenTrace can reconstruct:

```text
Screen A
   ↓
Search button
   ↓
POST /query.do
   ↓
QueryAction
   ↓
Screen B
```

from a fixture project.

---

## Phase 6 — Application Graph JSON POC

Goal: validate the analysis model before investing in UI.

### Tasks

- [ ] Build complete graph from sample project
- [ ] Serialize graph to JSON
- [ ] Add CLI or REST trigger
- [ ] Add regression fixtures
- [ ] Review unresolved relationships

### Exit Criteria

A sample Struts repository can be analyzed using one command/API call and produces a readable Application Graph JSON document.

This is the first major project milestone.

---

## Phase 7 — Minimal Screen Explorer

Goal: make graph data easy to inspect.

### Tasks

- [ ] Project summary page
- [ ] Screen list
- [ ] Screen detail
- [ ] Component list
- [ ] Entry-point display
- [ ] Backend handler trace
- [ ] Next-screen navigation

### Exit Criteria

A user can inspect the analyzed system without opening source code for basic flow questions.

---

## Phase 8 — Prototype Viewer

Goal: convert discovered screen metadata into an interactive prototype representation.

### Tasks

- [ ] Basic screen canvas
- [ ] Represent forms
- [ ] Represent buttons
- [ ] Represent links
- [ ] Navigation simulation
- [ ] Trace overlay

### Exit Criteria

The user can navigate a simplified representation of the analyzed application.

---

## Phase 9 — Edit Mode

Goal: support target-state discussions during modernization projects.

### Tasks

- [ ] Introduce edit-overlay model
- [ ] Hide/remove component
- [ ] Replace component representation
- [ ] Add annotations
- [ ] Compare current vs target state
- [ ] Persist edits separately from discovery graph

### Exit Criteria

Users can discuss a future-state UI without changing source-code analysis results.

---

## Phase 10 — Spring MVC Adapter

Goal: prove that the Application Graph is framework-neutral.

### Tasks

- [ ] Parse `@RequestMapping`
- [ ] Parse `@GetMapping`
- [ ] Parse `@PostMapping`
- [ ] Identify controllers
- [ ] Resolve returned view names
- [ ] Resolve ModelAndView
- [ ] Resolve JSP views

### Exit Criteria

The same Screen Explorer can display both Struts and Spring MVC projects.

---

## Phase 11 — Spring Boot / REST Analysis

Goal: support REST-oriented backend interactions.

### Tasks

- [ ] Detect REST controllers
- [ ] Discover API endpoints
- [ ] Correlate frontend requests where possible
- [ ] Model API-only endpoints

---

## Phase 12 — Modern Frontend Adapters

Potential sequence:

1. Angular
2. React
3. Vue

Capabilities:

- route discovery
- component discovery
- HTTP client usage
- frontend-to-API correlation

---

## Phase 13 — Modernization Intelligence

Future capabilities:

- current-state vs target-state comparison
- obsolete-screen review
- unused-function candidate detection
- migration work-item generation
- legacy screen → Angular component mapping
- backend API gap analysis
- migration documentation generation

---

# Recommended First Codex Task

Start with Phase 0 and Phase 1 only.

Suggested prompt:

```text
Read AGENTS.md, docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md.

We are starting ScreenTrace from Phase 0 and Phase 1.

First inspect the current repository. Then:
1. propose the Maven multi-module structure,
2. create only the minimum modules required for screentrace-core and screentrace-scanner,
3. implement the initial framework-neutral Application Graph domain model,
4. add unit tests for graph construction and JSON serialization.

Do not implement Struts parsing yet.
Keep framework-specific types out of screentrace-core.
Run the test suite and report the resulting repository structure and key design decisions.
```
