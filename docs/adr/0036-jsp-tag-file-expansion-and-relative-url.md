# ADR 0036: Bounded JSP tag-file expansion and relative URL evidence

## Context

R3 WP17 requires statically declared JSP tag files to contribute their visible controls and links to every consuming screen. It also requires relative JSP URLs to resolve only when their route base is proven. Existing URL-variable policy in ADR 0005 explicitly permits only `c:url` and `spring:url`; `c:set` remains unresolved under OQ-012.

## Decision

- Expand custom tags only when a taglib prefix maps to a `tagdir` and the corresponding `.tag` file is safely readable within the project root.
- Substitute call-site attributes as inert source text. Leave unknown or dynamic EL intact for the existing resolver to mark unresolved. Expand nested custom tags and `<jsp:doBody/>` with a maximum recursion depth of 12 and cycle detection.
- Project expanded controls onto the consuming JSP. Preserve call-site and tag-definition locations as analysis evidence. Flatten only tag-template lines; expand `<jsp:doBody/>` separately in the caller context and preserve its original definition/use lines and subsequent page lines. A dedicated failing source-line regression preceded this correction.
- Resolve a relative JSP target only when exactly one controller route is proven to render the source JSP. Join the target to that route's directory and label the result inferred. Multiple route bases are ambiguous; no proven route is unresolved.
- Keep `{name}` path placeholders as templates and do not evaluate or append `spring:param` / `c:param` values. Continue to exclude `c:set` URL definitions, as resolved by OQ-012.

## Consequences

Tag files can supply real components and navigation edges without executing JSP code or changing the graph schema. Layout components are represented on each consuming screen. Unsupported mappings, dynamic values, cycles, and depth overflow remain visible through unresolved status or diagnostics rather than guessed relationships.
