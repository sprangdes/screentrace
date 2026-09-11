# Reservio POC Validation

Target: `/Users/machi/IntelliJ/reservio` (read-only), validated 2026-09-11.

The POC detected Maven, Java, Spring Boot, React, and HTML. Its generated graph contains 66 Spring endpoints, 66 handlers, 32 declared React routes/screens, and 65 statically declared navigation/API components. The endpoint count agrees with the previously inventoried 64 REST mappings plus 2 redirect mappings.

Representative confirmed traces:

- `GET /api/dashboard` → `DashboardController.dashboard()` at `src/main/java/com/reservio/controller/DashboardController.java`.
- `POST /api/auth/login` → `AuthController.login()`.
- React route `/login` is declared in `frontend/src/App.tsx`.

Known POC limits:

- React component ownership is not yet resolved: API and navigation literals discovered outside `App.tsx` are component nodes but are not attached to the screen that renders them.
- Template-literal endpoints and parameterized values are intentionally not promoted to confirmed endpoint links; they require an inferred relationship implementation.
- JSX labels, native form controls, guards, and centralized API-wrapper call-site resolution are not yet extracted.
- The report exposes source evidence and confidence for all emitted nodes. No Java parse failures were emitted for Reservio.

False-positive review: the route extractor reports 32 concrete declared routes rather than deduplicating shared render implementations; this is intentional at the entry-point layer. False-negative review: the prior manual inventory identifies 29 renderable variants, so screen implementation grouping is a next-step correlation feature.
