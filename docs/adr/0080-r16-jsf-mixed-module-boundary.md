# ADR 0080 — R16 JSF mixed-module boundary

## Status

Accepted under OQ-026 option B for WP58.

## Decision

- JSF stays outside the Struts analysis scope. A FacesServlet declaration and each JSP/HTML page with a JSF HTML/Core taglib plus JSF tags produce `UNSUPPORTED_COMPONENT_FRAMEWORK` diagnostics with source file and line.
- A screen with JSF markup carries `unsupportedComponentFramework=JSF`. JSF controls do not become graph components, resolved behaviors, or API callers.
- The dashboard and that screen's review rationale show the same limitation text and count screens with JSF markup. Markdown section 8 names each affected screen and source location. Screens and projects without JSF do not show the reminder.
- Static preview replaces JSF tags with the fixed `（JSF 元件，未分析）` placeholder and strips JSF Core tags. It does not evaluate JSF or execute project code.

## Verification

- `StrutsR16JsfBoundaryTest` is a self-authored mixed Struts/JSF fixture. It verifies the JSF screen marker and source-line diagnostic and asserts that `h:commandButton` is not added as an analyzed component. It failed before implementation because the screen had no framework marker.
- `r16-jsf-warning.e2e.mjs` verifies the dashboard count, affected-screen warning, no warning on a non-JSF screen, Markdown section 8, and the no-JSF reminder case. It failed before implementation because the dashboard had no JSF reminder.
- `r16-jsf-placeholder.test.mjs` verifies that rendered preview markup contains the fixed placeholder and no raw JSF tags or control values.
- No Apache example or pre-R16 fixture was copied or changed.
