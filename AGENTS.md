# ScreenTrace — Codex Working Instructions

## 1. Project Purpose

ScreenTrace is a source-code analysis platform for legacy and modern Web applications.

Its primary goal is to reconstruct the relationship between:

- Screens / Views
- Entry points / URLs
- Controllers / Actions
- UI components
- Navigation flows
- Form submissions
- API calls
- Backend handlers

ScreenTrace then converts these relationships into an **Application Graph** that can be used to generate an interactive prototype, system documentation, flow visualization, and modernization planning artifacts.

The project should support legacy systems first, especially Struts 1.x and Spring MVC, while keeping the architecture extensible for Spring Boot, Angular, React, Vue, and other frameworks.

---

## 2. Core Engineering Principles

When implementing ScreenTrace, follow these principles:

1. **Deterministic analysis first**
   - Do not use AI as the primary mechanism for source-code discovery or dependency resolution.
   - Prefer parsers, AST analysis, XML parsing, template parsing, route extraction, and static code analysis.
   - AI may later be used for explanation, classification, ambiguity resolution, or modernization suggestions.

2. **Framework-specific logic must not leak into the core domain model**
   - Struts, Spring MVC, Spring Boot, JSP, Angular, React, etc. should be implemented through adapters/parsers.
   - The Core module must remain framework-neutral.

3. **Application Graph is the canonical output**
   - UI prototype generation, flow diagrams, reports, and migration analysis must consume the same graph model.

4. **Traceability is mandatory**
   - Every discovered graph element should retain source information when possible:
     - file path
     - class name
     - method name
     - line number or source range
     - parser that produced the result

5. **Do not silently guess**
   - If static analysis cannot prove a relationship, represent it as unresolved, inferred, or low-confidence.

6. **Prefer incremental analysis**
   - The architecture should allow individual parsers to contribute nodes and edges without requiring one giant analysis pass.

7. **Preserve original source code**
   - ScreenTrace V1 analyzes projects; it does not modify the analyzed project.

---

## 3. Initial Technology Direction

Unless there is a strong technical reason to change it, use:

### Backend
- Java 17+
- Spring Boot
- Maven multi-module project

### Frontend
- Angular or React may be selected later.
- Keep frontend implementation separate from graph generation logic.

### Parsing
Prefer dedicated parsers where possible:

- XML parser for Struts configuration and Spring XML
- JavaParser or equivalent AST parser for Java source
- HTML/JSP parser for markup
- JavaScript parser when required

Avoid regex as the primary parser for structured programming languages.

---

## 4. Proposed Module Boundaries

Target structure:

```text
screentrace/
├── screentrace-core
├── screentrace-scanner
├── screentrace-parser
│   ├── struts
│   ├── spring-mvc
│   ├── spring-boot
│   ├── jsp
│   ├── html
│   └── javascript
├── screentrace-analyzer
├── screentrace-server
└── screentrace-ui
```

The exact Maven structure may evolve, but responsibilities should remain separated.

---

## 5. Core Domain Model

The following concepts should exist independently of framework implementation:

- Project
- SourceArtifact
- Screen
- EntryPoint
- Handler
- View
- Component
- Action
- Endpoint
- Navigation
- DataFlow (future)
- GraphNode
- GraphEdge
- AnalysisEvidence
- Confidence / ResolutionStatus

Example relationship:

```text
Screen
  -> contains Component
Component
  -> triggers Action
Action
  -> invokes Endpoint
Endpoint
  -> handledBy Handler
Handler
  -> renders Screen
```

Do not encode Struts-specific names such as `ActionMapping` into the core model.

---

## 6. Parser / Adapter Contract

Framework-specific analyzers should follow a common extension mechanism.

Example conceptual interface:

```java
public interface AnalysisAdapter {
    boolean supports(ProjectContext context);
    AnalysisContribution analyze(ProjectContext context);
}
```

A contribution may include:

- discovered nodes
- discovered edges
- evidence
- unresolved references
- diagnostics

Adapters should be independently testable.

---

## 7. V1 Scope

V1 is a Struts-focused proof of concept.

Input:

```text
Legacy Struts project
```

Analysis:

```text
Source discovery
  -> struts-config.xml parsing
  -> JSP discovery
  -> JSP form/link/button parsing
  -> Action / Forward resolution
  -> Screen Graph construction
```

Output:

```text
Application Graph JSON
```

The V1 success criterion is NOT a polished UI.

The success criterion is that ScreenTrace can correctly answer questions such as:

- What screens exist?
- Which URL opens this screen?
- Which Action / Controller renders it?
- Which buttons or forms exist on the screen?
- What request does each interactive component trigger?
- Which backend Action handles that request?
- Which screen may be shown next?

---

## 8. Out of Scope for Initial Implementation

Do not implement these before the core Struts analysis pipeline is stable:

- automatic source-code modification
- automatic Struts-to-Spring conversion
- production-grade visual editor
- AI-generated application graph as the primary discovery mechanism
- runtime browser crawling as the only analysis mechanism
- database schema reverse engineering
- full JavaScript execution

---

## 9. Testing Requirements

Every parser should include fixture projects or focused fixture files.

Minimum tests:

- valid parsing
- missing configuration
- unresolved reference
- duplicate route
- multiple forwards
- nested JSP paths
- form actions
- links
- buttons

Prefer small deterministic test fixtures over large application snapshots.

---

## 10. Implementation Workflow for Codex

Before implementing a task:

1. Read `AGENTS.md`.
2. Read `docs/PRODUCT_SPEC.md`.
3. Read `docs/ARCHITECTURE.md`.
4. Check `docs/ROADMAP.md` for current phase.
5. Inspect existing code before creating new abstractions.
6. Keep changes scoped to the requested task.
7. Add tests for newly introduced parsing or graph behavior.
8. Update documentation if the architecture or graph schema changes.

When requirements are ambiguous, prefer the smallest implementation that preserves extensibility.

---

## 11. Naming

Project name: **ScreenTrace**

Important terms:

- Application Graph: canonical internal representation
- Screen Graph: screen-focused projection of the Application Graph
- Analyzer: correlates parser results
- Parser: extracts structured information from one source type
- Adapter: adds framework-specific interpretation
- Prototype: visual representation generated from graph data
- Edit Mode: non-destructive target-state customization layer

