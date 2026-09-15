# ScreenTrace Product Specification

## POC priority

The executable POC supports server-rendered JSP applications using Struts 1, Struts + Spring, Spring MVC, or Spring Boot. Spring MVC support resolves annotation and XML Controller mappings, literal `ModelAndView` views, `InternalResourceViewResolver` JSP paths, Tiles definitions, literal Spring URL-tag variables, and literal JSP form/link/button targets. JSP reports expand supported local tag files, transform supported Spring/JSTL markup into standalone static HTML, fill dynamic JSP values with deterministic demonstration data, then use Playwright Chromium to capture rendered screenshots and component bounds. FreeMarker and Thymeleaf remain unsupported. ScreenTrace is standalone: it never joins the target Maven/Gradle build and does not execute or modify target source, apart from writing analysis data to the user-configured analysis results directory.

## Prototype and Edit Mode Contract

Edit Mode operates on a framework-neutral prototype model containing screen/component IDs, bounds, style overrides, actions, source locations, and confidence. User edits are persisted as an overlay and never mutate the source-derived Application Graph or the analyzed application.

## 1. Product Vision

ScreenTrace analyzes an existing Web application from the perspective of its screens and reconstructs the functional relationships between UI, navigation, backend handlers, and APIs.

The system should allow a customer, analyst, or development team to inspect a project visually without first understanding the entire source-code architecture.

The primary product question is:

> For this screen, how is it opened, what does every important UI element do, what backend code handles that behavior, and where can the user go next?

---

## 2. Target Use Cases

### 2.1 Legacy-system discovery

Analyze applications using technologies such as:

- Struts 1.x
- JSP
- Spring MVC
- Spring Boot MVC

and reconstruct their screen flows.

### 2.2 Customer-facing system walkthrough

Generate an interactive representation that can be used to explain:

- existing screens
- functions on each screen
- transitions between screens
- APIs called by a screen
- backend handlers involved

### 2.3 Modernization discovery

Use the generated prototype and graph during modernization projects to discuss:

- obsolete functions
- screens that should be removed
- UI components that should be replaced
- functions that should remain
- target-state frontend redesign

### 2.4 Frontend/backend separation planning

ScreenTrace should eventually help teams transform a legacy server-rendered system into architectures such as:

```text
Angular / React frontend
        ↓
REST API
        ↓
Spring Boot backend
```

by showing which legacy screen operations map to which backend behaviors.

---

## 3. User Experience

### 3.1 Project import

The user provides a source project.

ScreenTrace scans the project and detects supported technologies.

Example:

```text
Detected
- Struts 1.x
- JSP
- Spring XML configuration
- Java source
```

### 3.2 Screen Explorer

ScreenTrace lists all discovered screens.

Example:

```text
Screens
├── Login
├── Home
├── Policy Search
├── Search Result
├── PDF Download
└── Error Page
```

### 3.3 Screen detail

Selecting a screen should show:

- screen name
- source view file
- URL / entry point
- controller or action responsible for rendering it
- forms
- buttons
- links
- relevant API calls
- possible next screens

### 3.4 Component trace

Example:

```text
[Search Button]
      ↓
POST /policy/search.do
      ↓
PolicySearchAction.execute()
      ↓
PolicySearchService.search()
      ↓
search-result.jsp
```

The user should be able to select the button and inspect this trace.

---

## 4. Interactive Prototype

The generated prototype is a visualization of the Application Graph.

It is not initially intended to reproduce all runtime behaviors.

The prototype should allow users to:

- open a screen
- inspect UI elements
- follow navigation flows
- inspect backend relationships
- switch between screens

Future iterations may include higher-fidelity rendering.

---

## 5. Edit Mode

Edit Mode represents a proposed target state without modifying the source application.

Example original screen:

```text
Name       [________]
ID Number  [________]
Phone      [________]

[Search] [Reset] [History]
```

After customer review:

```text
Name       [________]
ID Number  [________]

[Search] [Reset]
```

The changes should be stored separately from the discovered graph.

Example:

```json
{
  "screen": "policy-search",
  "changes": [
    {
      "component": "historyButton",
      "action": "REMOVE"
    },
    {
      "component": "phoneInput",
      "action": "REMOVE"
    }
  ]
}
```

Conceptual flow:

```text
Existing Application
        ↓
ScreenTrace Analysis
        ↓
Current-State Prototype
        ↓
Business Review
        ↓
Edit Mode
        ↓
Target-State Prototype
```

---

## 6. Supported Framework Strategy

ScreenTrace should not create a separate product implementation for every framework.

Instead:

```text
             ScreenTrace Core
                   │
       ┌───────────┼───────────┐
       │           │           │
    Struts     Spring MVC   Spring Boot
    Adapter      Adapter       Adapter
       │           │           │
       └───────────┼───────────┘
                   ↓
          Application Graph
```

Future adapters may support:

- Angular
- React
- Vue
- Thymeleaf
- JSF
- other server-side rendering technologies

---

## 7. Functional Requirements

### FR-001 Project scanning

ScreenTrace shall scan a supplied project directory and inventory relevant source files.

### FR-002 Technology detection

ScreenTrace shall identify supported frameworks and view technologies when possible.

### FR-003 Screen discovery

ScreenTrace shall identify application views/screens.

### FR-004 Entry-point discovery

ScreenTrace shall identify URLs and routes associated with screens.

### FR-005 Backend handler discovery

ScreenTrace shall identify controller/action classes and methods associated with routes.

### FR-006 Component discovery

ScreenTrace shall identify major interactive screen components such as:

- forms
- buttons
- links
- inputs

### FR-007 Action resolution

ScreenTrace shall resolve interactions to backend URLs or client-side actions where possible.

### FR-008 Navigation resolution

ScreenTrace shall identify possible screen-to-screen transitions.

### FR-009 Application Graph generation

ScreenTrace shall serialize the discovered system into a framework-neutral graph model.

### FR-010 Evidence tracking

Each discovered entity should retain traceability to source artifacts where possible.

### FR-011 Prototype visualization

ScreenTrace shall eventually render the discovered screens and interactions as an interactive prototype.

### FR-012 Edit Mode

ScreenTrace shall allow non-destructive modifications to the visual target state.

### FR-013 Page API trace

ScreenTrace shall show APIs relevant to a screen in two groups: APIs called as the page loads and APIs triggered by an interactive component. For statically resolvable Spring APIs, it shall show the request and response contract. Selecting a component-bound API, its component, or its navigation target shall keep the related items highlighted together.

---

## 8. Non-Functional Requirements

### Extensibility

Adding framework support should not require redesigning the domain model.

### Explainability

The system should be able to show why a relationship exists.

Example:

```text
Relationship:
/query.jsp -> POST /query.do

Evidence:
/WEB-INF/jsp/query.jsp:42
<html:form action="/query">
```

### Determinism

Repeated analysis of unchanged source should produce equivalent graph results.

### Performance

Large legacy repositories should be analyzable without loading the complete project into memory when avoidable.

### Security

Source projects may contain sensitive enterprise code.

ScreenTrace should be designed so that static analysis can run locally without requiring source upload to external services.

---

## 9. Initial V1 Acceptance Scenario

Given a Struts project containing:

```text
struts-config.xml
Java Action classes
JSP files
```

ScreenTrace should generate graph data equivalent to:

```json
{
  "screens": [
    {
      "id": "query",
      "view": "/WEB-INF/jsp/query.jsp",
      "entryPoints": [
        {
          "url": "/query.do",
          "handler": "QueryAction"
        }
      ],
      "components": [
        {
          "type": "button",
          "label": "Search",
          "action": {
            "method": "POST",
            "url": "/query.do"
          }
        }
      ]
    }
  ]
}
```

The exact JSON schema may change during domain-model design.

The important acceptance criterion is trace correctness.
