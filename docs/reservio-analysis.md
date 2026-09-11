# Reservio Static Analysis Report

Analysis target: `/Users/machi/IntelliJ/reservio` (read-only).  Analysis date: 2026-09-11.

Resolution terminology: **CONFIRMED** is directly declared in source; **INFERRED** is a deterministic composition of declarations (for example, a parameterized URL or conditional route); **UNRESOLVED** cannot be proven statically.

## 1. Project Overview

| Concern | Finding | Confidence / evidence |
| --- | --- | --- |
| Backend | Single Maven Spring Boot application, Spring Boot **3.2.5**, Java **17** | CONFIRMED: `pom.xml` |
| Backend dependencies | Spring MVC/web, Spring Data JPA, Security, Mail, OAuth2 Client, PostgreSQL, Springdoc OpenAPI; Lombok | CONFIRMED: `pom.xml` |
| Backend web style | 12 `@RestController` classes; no `@Controller`, `Model`, `ModelAndView`, view-name return, JSP, Thymeleaf, or server-rendered HTML template was found | CONFIRMED: `src/main/java`, `src/main/resources` inventory |
| Frontend | Separate `frontend/` Vite + React 18 + TypeScript application, using React Router 6, Bootstrap and Flatpickr | CONFIRMED: `frontend/package.json` |
| View technology | React TSX components rendered client-side. `frontend/index.html` is the Vite shell; the backend serves JSON plus two explicit OAuth redirect endpoints. | CONFIRMED: `frontend/src/App.tsx`, `frontend/src/api.ts`, controller sources |
| Deployment boundary | Development Vite proxy and production Nginx proxy send `/api`, `/oauth2`, and `/login/oauth2` to Spring Boot. | CONFIRMED: `README.md`, `frontend/vite.config.js`, `frontend/nginx.conf` |
| Modules | Maven backend source is in `src/main/java`; React application is an independent `frontend/` npm module. Backend packages include controller, service, repository, entity, config, exception, and `line/` integration packages. | CONFIRMED: repository inventory |

The applicable ScreenTrace model is therefore SPA-oriented: React routes are screen entry points, React components are views, and Spring mappings are independently rendered API endpoints. There are **no server-side MVC screen endpoints** to correlate with a template.

## 2. Screen Inventory

This inventory contains **29 renderable screen variants** over **32 concrete React routes**. Three reservation-management routes share one screen implementation; two legacy routes are compatibility views/redirects. The `*` fallback is excluded from the screen count.

| Screen ID | Screen name | Entry URL | Controller / method | View | Confidence |
| --- | --- | --- | --- | --- | --- |
| public-home | Public home | `/` (unauthenticated) | None; React Router | `PublicHomePage` | CONFIRMED |
| business-overview | Business operations overview | `/` (`ROLE_BUSINESS`) | None; React Router | `OperationsOverviewPage` in `BusinessWorkspaceShell` | CONFIRMED |
| login | Login | `/login` | None; React Router | `LoginPage` | CONFIRMED |
| register-customer | Customer registration | `/register` | None; React Router | `RegisterPage` | CONFIRMED |
| register-business | Business registration | `/register-business` | None; React Router | `RegisterBusinessPage` | CONFIRMED |
| password-reset-request | Forgot password | `/forgot-password` | None; React Router | `ForgotPasswordPage` | CONFIRMED |
| password-reset-verify | Verify reset OTP | `/forgot-password/verify` | None; React Router | `ForgotPasswordVerifyPage` | CONFIRMED |
| force-change-password | Forced password change | `/force-change-password` | None; React Router | `ForceChangePasswordPage` | CONFIRMED |
| customer-dashboard | Customer dashboard | `/dashboard` | None; React Router | `CustomerDashboardPage` | CONFIRMED |
| reservation-new | Create reservation | `/reservation/new` | None; React Router | `ReservationNewPage` / booking feature | CONFIRMED |
| my-reservations | Customer reservation workspace | `/my/reservations` | None; React Router | `MyReservationsPage` / `MyReservationsWorkspace` | CONFIRMED |
| preferred-businesses | Preferred businesses | `/preferred-businesses` | None; React Router | `PreferredBusinessesPage` | CONFIRMED |
| reservation-center | Business reservation center | `/reservation/manage`, `/reservation/today/manage`, `/reservation/pending/manage` | None; React Router | `ReservationCenterPage` with `all`, `today`, or `pending` preset | CONFIRMED |
| service-management | Service management | `/service/manage` | None; React Router | `ServiceManagementPage` | CONFIRMED |
| service-editor | Add/edit service | `/service/new`, `/service/:id/edit` | None; React Router | `ServiceEditorScaffold` / `ServiceEditorPage` | CONFIRMED |
| notifications-customer | Customer notifications | `/notifications` (`ROLE_USER`) | None; React Router | `NotificationsPage` | CONFIRMED |
| notifications-business | Business notifications | `/notifications` (`ROLE_BUSINESS` with business) | None; React Router | `MerchantNotificationsPage` | CONFIRMED |
| notification-settings-customer | Customer notification settings | `/notifications/settings` (`ROLE_USER`) | None; React Router | `NotificationSettingsPage` | CONFIRMED |
| business-setup | Initial business setup | `/business/setup` | None; React Router | `BusinessSetupPage` | CONFIRMED |
| business-info-compatibility | Legacy business-info hub | `/business/info` | None; React Router | `LegacyBusinessInfoCompatibility` | CONFIRMED |
| business-settings | Business settings overview | `/business/settings` | None; React Router | `SettingsLandingPage` | CONFIRMED |
| business-profile-settings | Business profile settings | `/business/settings/profile` | None; React Router | `BusinessProfileEditor` | CONFIRMED |
| business-booking-settings | Booking interval settings | `/business/settings/booking` | None; React Router | `BookingIntervalEditor` | CONFIRMED |
| business-hours-settings | Business hours settings | `/business/settings/hours` | None; React Router | `BusinessHoursEditor` | CONFIRMED |
| business-notification-settings | Business notification settings | `/business/settings/notifications` | None; React Router | `NotificationSettingsEditor` | CONFIRMED |
| line-integration-settings | LINE Messaging settings | `/business/settings/integrations/line` | None; React Router | `LineIntegrationEditor` | CONFIRMED |
| business-account-settings | Business account settings | `/business/settings/account` | None; React Router | `AccountSettingsPage` | CONFIRMED |
| line-account-link | LINE account link request | `/line/account-link?requestToken={token}` | None; React Router | `LineAccountLinkPage` | CONFIRMED for route; INFERRED for token instance |
| line-account-links | Linked LINE accounts | `/settings/line-accounts` | None; React Router | `LineAccountLinksPage` | CONFIRMED |
| customer-profile | Customer profile | `/profile` | None; React Router | `ProfilePage` | CONFIRMED |
| line-integration-compatibility | Legacy LINE route | `/business/line-integration` | None; redirects to `/business/settings/integrations/line` | CONFIRMED |

Route guards are source-visible: unauthenticated protected routes redirect to `/login?returnTo=...`; role mismatches redirect to the role-specific post-auth destination; incomplete business profiles redirect to `/business/setup`; and `mustChangePassword` redirects to `/force-change-password`.

## 3. Endpoint Inventory

All mappings were read from Spring annotations. `REST_API` mappings return a JSON/body response; the two `REDIRECT` mappings invoke `HttpServletResponse.sendRedirect`. There are **0 MVC_SCREEN**, **0 FORM_ACTION**, **64 REST_API**, and **2 REDIRECT** mappings (**66 total Spring mappings**).

| HTTP | URL | Handler | Type | Result |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | `AuthController.register` | REST_API | Creates customer account via `UserDataService` |
| POST | `/api/auth/register-business` | `AuthController.registerBusiness` | REST_API | Creates business account via `UserDataService` |
| POST | `/api/auth/login` | `AuthController.login` | REST_API | Authenticates and persists security context |
| POST | `/api/auth/logout` | `AuthController.logout` | REST_API | Invalidates authenticated session; 204 |
| POST | `/api/auth/forgot-password/request-otp` | `AuthController.requestOtp` | REST_API | Sends/rate-limits password-reset OTP |
| POST | `/api/auth/forgot-password/verify-otp` | `AuthController.verifyOtp` | REST_API | Verifies OTP and creates authenticated session |
| POST | `/api/auth/force-change-password` | `AuthController.forceChangePassword` | REST_API | Changes forced password |
| GET | `/api/auth/line/user` | `AuthController.lineUserLogin` | REDIRECT | Redirects to `/oauth2/authorization/line-user` |
| GET | `/api/auth/line/business` | `AuthController.lineBusinessLogin` | REDIRECT | Redirects to `/oauth2/authorization/line-business` |
| GET | `/api/businesses` | `BusinessApiController.getBusinesses` | REST_API | Lists businesses |
| GET | `/api/businesses/category` | `BusinessApiController.getCategories` | REST_API | Lists business categories |
| POST | `/api/businesses/setup` | `BusinessApiController.setupBusiness` | REST_API | Creates current business profile |
| GET | `/api/businesses/{businessId}/services` | `BusinessApiController.getBusinessServices` | REST_API | Lists business services |
| GET | `/api/businesses/{businessId}/services/active` | `BusinessApiController.getActiveServices` | REST_API | Lists active business services |
| POST | `/api/businesses/services` | `BusinessApiController.addServiceItem` | REST_API | Creates service item |
| POST | `/api/businesses/services/{id}/on` | `BusinessApiController.serviceItemOn` | REST_API | Enables service item |
| POST | `/api/businesses/services/{id}/off` | `BusinessApiController.serviceItemOff` | REST_API | Disables service item |
| POST | `/api/businesses/services/{id}/delete` | `BusinessApiController.deleteServiceItem` | REST_API | Deletes service item |
| POST | `/api/businesses/services/{id}/modify` | `BusinessApiController.modifyServiceItem` | REST_API | Updates service item |
| POST | `/api/businesses/info/update` | `BusinessApiController.updateBusinessInfo` | REST_API | Updates current business profile |
| POST | `/api/businesses/slot/default` | `BusinessApiController.setDefaultSlot` | REST_API | Saves default weekly hours/interval |
| GET | `/api/businesses/slot/default` | `BusinessApiController.getDefaultSlot` | REST_API | Gets default weekly hours/interval |
| POST | `/api/businesses/slot/date` | `BusinessApiController.getDateSlot` | REST_API | Gets effective hours for one date |
| GET | `/api/businesses/slot/adjusted` | `BusinessApiController.getDateSlots` | REST_API | Lists date-specific overrides |
| POST | `/api/businesses/slot/date/adjust` | `BusinessApiController.saveDateSlot` | REST_API | Saves date-specific override |
| POST | `/api/businesses/slot/date/delete` | `BusinessApiController.deleteAdjustedDateSlot` | REST_API | Deletes date-specific override |
| GET | `/api/csrf` | `CsrfController.csrf` | REST_API | Returns CSRF header/token data |
| GET | `/api/dashboard` | `DashboardController.dashboard` | REST_API | Returns account and reservation-count summary |
| POST | `/api/email-verification/request` | `EmailVerificationController.request` | REST_API | Sends email-verification OTP |
| POST | `/api/email-verification/verify` | `EmailVerificationController.verify` | REST_API | Verifies email OTP |
| GET | `/api/notifications` | `NotificationController.list` | REST_API | Lists paged notifications |
| GET | `/api/notifications/unread-count` | `NotificationController.unreadCount` | REST_API | Returns unread count |
| POST | `/api/notifications/{id}/read` | `NotificationController.markRead` | REST_API | Marks notification read; 204 |
| POST | `/api/notifications/read-all` | `NotificationController.markAllRead` | REST_API | Marks all notifications read; 204 |
| GET | `/api/notifications/preferences` | `NotificationController.preferences` | REST_API | Returns notification preferences |
| PUT | `/api/notifications/preferences` | `NotificationController.updatePreferences` | REST_API | Updates notification preferences |
| POST | `/api/reservations/customer/query` | `ReservationApiController.queryReservationForCustomer` | REST_API | Returns filtered customer reservation page |
| POST | `/api/reservations/business/query` | `ReservationApiController.queryReservationsForBusiness` | REST_API | Returns filtered business reservation page |
| GET | `/api/reservations/business/{id}` | `ReservationApiController.getReservationForBusiness` | REST_API | Gets business-visible reservation detail |
| POST | `/api/reservations` | `ReservationApiController.createReservation` | REST_API | Creates reservation |
| POST | `/api/reservations/{id}/cancel` | `ReservationApiController.cancelReservation` | REST_API | Customer cancellation request |
| POST | `/api/reservations/{id}/status` | `ReservationApiController.updateStatus` | REST_API | Updates reservation status/action |
| GET | `/api/reservations/slots` | `ReservationApiController.getTimeSlotsForDate` | REST_API | Lists available time slots |
| GET | `/api/reservations/disabled-dates` | `ReservationApiController.getDisabledDates` | REST_API | Lists unavailable dates |
| GET | `/api/reservations/customer/reserved-businesses` | `ReservationApiController.getReservedBusinesses` | REST_API | Lists customer-reserved businesses |
| GET | `/api/reservations/today` | `ReservationApiController.getTodayReservations` | REST_API | Returns today calendar data |
| GET | `/api/reservations/week` | `ReservationApiController.getWeekReservations` | REST_API | Returns week calendar data |
| GET | `/api/reservations/month` | `ReservationApiController.getMonthReservations` | REST_API | Returns month calendar data |
| GET | `/api/session` | `SessionController.session` | REST_API | Returns session timeout/warning configuration |
| PUT | `/api/me/profile` | `UserController.updateProfile` | REST_API | Updates current user profile and context |
| GET | `/api/me` | `UserController.me` | REST_API | Gets current authenticated user |
| GET | `/api/businesses/{category}` | `UserController.fetchBusinessByCategory` | REST_API | Lists businesses by category |
| POST | `/api/preferred-businesses` | `UserController.setPreferredBusinesses` | REST_API | Saves preferred businesses |
| GET | `/api/preferred-businesses` | `UserController.getPreferredBusinesses` | REST_API | Lists preferred businesses |
| GET | `/api/line/account-links/{requestToken}` | `LineAccountLinkController.status` | REST_API | Gets LINE-link request status |
| POST | `/api/line/account-links/{requestToken}/confirm` | `LineAccountLinkController.confirm` | REST_API | Confirms LINE-link request |
| GET | `/api/line/account-links` | `LineAccountLinkController.list` | REST_API | Lists linked LINE businesses |
| DELETE | `/api/line/account-links/{lineCustomerId}` | `LineAccountLinkController.unlink` | REST_API | Removes LINE business link; 204 |
| GET | `/api/integrations/line/settings` | `LineIntegrationController.getSettings` | REST_API | Gets LINE Messaging settings |
| PUT | `/api/integrations/line/settings` | `LineIntegrationController.saveSettings` | REST_API | Saves LINE Messaging settings |
| POST | `/api/integrations/line/settings/disable` | `LineIntegrationController.disable` | REST_API | Disables LINE Messaging integration |
| POST | `/api/integrations/line/settings/rotate-webhook-key` | `LineIntegrationController.rotateWebhookKey` | REST_API | Rotates webhook key |
| GET | `/api/integrations/line/status` | `LineIntegrationController.getStatus` | REST_API | Gets LINE integration health/status |
| POST | `/api/integrations/line/test-connection` | `LineIntegrationController.testConnection` | REST_API | Tests LINE connection/webhook |
| POST | `/api/integrations/line/rich-menu` | `LineIntegrationController.provisionRichMenu` | REST_API | Creates/updates LINE rich menu |
| POST | `/api/integrations/line/webhook/{webhookKey}` | `LineWebhookController.receive` | REST_API | Ingests LINE platform webhook; no frontend caller found |

## 4. Screen Component Inventory

React uses controlled inputs plus `onClick`/`onSubmit` handlers rather than native HTML `action` forms. The following groups record source-visible interactive components and their direct effects; `navigate(...)`, `<Link>`, and API-client invocations are all statically confirmed.

- **public-home** — Header/mobile-menu links and audience CTA navigate to login, registrations, and reservation creation. Navigation is client-side; no API call is made by this page.
- **login** — Username/password form calls `POST /api/auth/login`; customer/business LINE buttons navigate the browser to the corresponding `/api/auth/line/{role}` redirect endpoint; registration and reset links navigate to their routes. Successful post-auth route is role-conditional.
- **register-customer** — Registration form calls `POST /api/auth/register`; login link navigates to `/login`.
- **register-business** — Category selector loads `GET /api/businesses/category`; registration form calls `POST /api/auth/register-business`; success goes to the business setup flow.
- **password-reset-request** — Identifier form calls `POST /api/auth/forgot-password/request-otp`, then navigates to `/forgot-password/verify` on success.
- **password-reset-verify** — OTP input submits `POST /api/auth/forgot-password/verify-otp`; resend calls the request-OTP endpoint; back link returns to the request screen.
- **force-change-password** — Password form calls `POST /api/auth/force-change-password`; source-visible guard determines the next role-specific route.
- **customer-dashboard** — Action links navigate to new reservation, reservation workspace, and preferred businesses. Its data load calls customer reservation query and preferred-business APIs.
- **reservation-new** — Business/service/date/time selectors call preferred/all businesses, business services, disabled-date and slot APIs as selections change; submit creates a reservation with `POST /api/reservations`. URL values containing selected IDs/dates are INFERRED instances of confirmed templates.
- **my-reservations** — Filter controls and pagination call `POST /api/reservations/customer/query`; business filter loads reserved businesses and services; cancel overlay calls `POST /api/reservations/{id}/cancel`; empty-state CTA navigates to reservation creation.
- **preferred-businesses** — Category selector calls category and category-business APIs; selection save calls `POST /api/preferred-businesses`.
- **reservation-center** — View switcher, filters, pagination and calendar/list selection execute JavaScript state transitions; query calls `POST /api/reservations/business/query`; active-service filter calls its service API; detail actions call `POST /api/reservations/{id}/status`. Preset URL selects today/pending/all client state.
- **service-management** — Add link navigates to `/service/new`; enable/disable/delete buttons call the respective service endpoint and reload the list.
- **service-editor** — Inputs submit create (`POST /api/businesses/services`) or modify (`POST /api/businesses/services/{id}/modify`), then navigate to `/service/manage`; edit mode first locates the ID in `GET /api/businesses/{businessId}/services`.
- **notifications-customer / notifications-business** — Pagination and notification rows call list/read/read-all notification APIs; settings link navigates to `/notifications/settings` where available.
- **notification-settings-customer / business-notification-settings** — Preference controls load/save `GET`/`PUT /api/notifications/preferences`; Email verification dialog sends and verifies OTP through `/api/email-verification/request` and `/verify`.
- **business-setup** — Category selector loads categories; setup form posts `/api/businesses/setup`; links navigate home or legacy business-info screen.
- **business-info-compatibility** — Navigation links move to profile, booking, hours, and service-management settings; it does not submit backend data itself.
- **business-settings** — Section links navigate to focused settings pages. Its overview hook reads default slots, services, notification preferences, and LINE settings/status.
- **business-profile-settings** — Controlled fields load categories and save through `POST /api/businesses/info/update`.
- **business-booking-settings** — Interval radio controls read/write default slot configuration via `GET`/`POST /api/businesses/slot/default`.
- **business-hours-settings** — Weekly-hours controls read/write default slots; date override controls list, query, save, and delete date-slot APIs. Dialog close/selection behavior is JavaScript-only.
- **line-integration-settings** — Form saves LINE settings (`PUT`); action buttons test connection, provision rich menu, rotate webhook key, or disable integration; initial load reads settings and status.
- **business-account-settings** — Navigation links go to `/profile` and notification settings; account data comes from the shared authentication context (`GET /api/me`), not a page-local call.
- **line-account-link** — Query-string token selects the request; page fetches link status, conditionally opens the browser OAuth redirect, and confirms with `POST /api/line/account-links/{requestToken}/confirm`.
- **line-account-links** — List reads linked businesses; unlink dialog calls `DELETE /api/line/account-links/{lineCustomerId}`.
- **customer-profile** — Profile form calls `PUT /api/me/profile`.
- **shared navigation / session controls** — Navbar/header links provide client navigation; logout calls `POST /api/auth/logout`. `AuthContext` reads `/api/me`; `SessionTimeoutManager` reads `/api/session`, checks `/api/me`, and can log out. Before unsafe requests, the API client may implicitly call `GET /api/csrf`.

No frontend `axios`, `XMLHttpRequest`, or raw page-specific `fetch` calls were found outside the centralized `api.ts` `fetch` wrapper. The React application does not contain native form `action` attributes that resolve to MVC endpoints.

## 5. Navigation Graph

```text
Public home (/)
  -> Login (/login)
  -> Customer registration (/register)
  -> Business registration (/register-business)
  -> Create reservation (/reservation/new; protected)

Login
  -> POST /api/auth/login -> Customer dashboard (/dashboard) [ROLE_USER]
  -> POST /api/auth/login -> Business overview (/) [ROLE_BUSINESS]
  -> GET /api/auth/line/user|business -> Spring Security OAuth2 -> configured frontend callback [INFERRED]
  -> Forgot password -> Verify reset OTP

Customer dashboard
  -> Create reservation -> POST /api/reservations -> reservation result state
  -> My reservations -> POST /api/reservations/customer/query
  -> Preferred businesses -> POST /api/preferred-businesses
  -> Notifications / notification settings / profile / LINE accounts

Business registration
  -> Business setup -> POST /api/businesses/setup -> Business overview

Business overview
  -> Reservation center (all/today/pending presets)
  -> Service management -> add/edit service -> Service management
  -> Business settings -> profile | booking | hours | notification settings | LINE integration | account settings
  -> Notifications

All protected routes
  -> /login?returnTo=... when unauthenticated
  -> role-specific post-auth destination on role mismatch
  -> /business/setup for an unconfigured business
  -> /force-change-password while mustChangePassword is true
```

## 6. REST API Graph

The following direct screen-to-API relationships are confirmed from `frontend/src/api.ts` call sites. Shared calls (`GET /api/me`, `GET /api/session`, and conditional `GET /api/csrf`) are omitted from individual rows and represented separately.

```text
Authentication screens
  login -> POST /api/auth/login; GET /api/auth/line/{user|business}
  register* -> POST /api/auth/register[ -business ]; GET /api/businesses/category (business)
  password reset -> POST /api/auth/forgot-password/{request-otp|verify-otp}
  force change -> POST /api/auth/force-change-password

Customer screens
  dashboard -> POST /api/reservations/customer/query; GET /api/preferred-businesses
  reservation-new -> GET /api/preferred-businesses|businesses|businesses/{id}/services
                     -> GET /api/reservations/disabled-dates|slots -> POST /api/reservations
  my-reservations -> POST /api/reservations/customer/query; GET reserved-businesses/services
                     -> POST /api/reservations/{id}/cancel
  preferred-businesses -> GET categories|businesses/{category}|preferred-businesses
                          -> POST /api/preferred-businesses
  profile -> PUT /api/me/profile

Business screens
  overview/reservation-center -> POST /api/reservations/business/query
                                 -> GET active services / reservation detail
                                 -> POST /api/reservations/{id}/status
  services -> GET /api/businesses/{id}/services
              -> POST /api/businesses/services[/...]
  settings -> GET/POST default slots; GET/POST date slots; POST business info update
  LINE integration -> GET/PUT settings; GET status; POST test/rich-menu/rotate/disable

Shared screens
  notifications -> GET list|unread-count; POST read|read-all
  notification settings -> GET/PUT preferences; POST email verification request|verify
  LINE account link -> GET/POST /api/line/account-links/{requestToken}; GET OAuth redirect
  LINE account links -> GET/DELETE /api/line/account-links[/{lineCustomerId}]
```

`GET /api/dashboard`, `GET /api/reservations/today`, `GET /api/reservations/week`, and `GET /api/reservations/month` have backend mappings and API-client wrappers, but no current frontend call site was found. `POST /api/integrations/line/webhook/{webhookKey}` is an external LINE-platform ingress, not a screen request.

## 7. Unresolved Relationships

| Relationship | Status | Why static analysis cannot fully establish it |
| --- | --- | --- |
| Concrete OAuth authorization, callback, and provider result | UNRESOLVED | Spring Security supplies `/oauth2/authorization/*` and `/login/oauth2/code/*`; configured provider interaction and external LINE response are runtime behavior. The explicit initial redirect is confirmed. |
| OAuth final frontend URL | INFERRED | `LineOAuth2AuthenticationSuccessHandler` builds it from configuration properties plus role/query parameters; the exact deployed base URL/profile values are runtime configuration. |
| Dynamic parameter values (`{id}`, `{category}`, `{requestToken}`, dates, query filters) | INFERRED | URL templates and constructing code are known, but concrete values arise from state/API responses/user input. |
| Conditional render/navigation paths | INFERRED | Route guards and feature state are source-visible, but actual path depends on authenticated user, business setup, permissions, API outcomes, and browser state. |
| Backend-to-external effects | UNRESOLVED | Email delivery, PostgreSQL state, LINE Messaging requests, webhook delivery, and OAuth provider behavior are outside static source proof. |
| Complete semantic outcome of services | UNRESOLVED | Direct controller-to-service calls are identified, but a complete Java call graph, repository effects, transactions, exception paths, and scheduled worker behavior were deliberately not built. |
| Runtime-served SPA fallback | UNRESOLVED | Vite/Nginx deployment configuration supports the SPA, but the exact production web-server fallback behavior is deployment configuration rather than a Spring controller mapping. |
| Inline/reflection-generated routes | CONFIRMED absent in inspected frontend route/API layer | No Axios, XMLHttpRequest, or page-local raw fetch was found; however analysis should still flag future dynamic imports, computed route strings, or external scripts. |

## 8. Proposed ScreenTrace Application Graph

Reservio justifies the following framework-neutral minimum model. Do not add Spring- or React-specific fields to core nodes; preserve syntax-specific facts in evidence/adapter metadata.

| Node | Minimum fields justified by Reservio |
| --- | --- |
| `Application` | id, source root, technology profile |
| `Screen` | id, name, route patterns, access conditions, resolution status |
| `EntryPoint` | path pattern, kind (`CLIENT_ROUTE`, `SERVER_ROUTE`, `EXTERNAL_CALLBACK`), source evidence |
| `View` | implementation path, symbol/component name, render technology |
| `Component` | id/name, type (`FORM`, `BUTTON`, `LINK`, `INPUT`, `SELECT`, `DIALOG`, `NAVIGATION`), label/accessibility text where available |
| `Action` | kind (`CLIENT_NAVIGATION`, `API_REQUEST`, `BROWSER_REDIRECT`, `JAVASCRIPT_STATE_CHANGE`), HTTP method/path template when applicable |
| `BackendEndpoint` | method, path template, endpoint type, request/response type names, security evidence |
| `Handler` | class, method, direct service calls, result kind (`JSON`, `REDIRECT`) |
| `ApiCall` | frontend caller symbol, endpoint reference, request construction evidence |
| `Navigation` | source screen/component, target entry point/screen, condition, resolution status |
| `SourceLocation` / `AnalysisEvidence` | path, start/end lines, parser/adapter, resolution status |
| `UnresolvedReference` | subject, reason, source evidence |

Required relationships:

```text
Screen --RENDERED_BY--> View
Screen --ENTERED_BY--> EntryPoint
Screen --CONTAINS--> Component
Component --TRIGGERS--> Action
Action --NAVIGATES_TO--> EntryPoint / Screen
Action --CALLS--> BackendEndpoint
BackendEndpoint --HANDLED_BY--> Handler
Handler --INVOKES--> Service (direct only, optional POC edge)
ApiCall --EVIDENCES--> Action / BackendEndpoint
Node or edge --DEFINED_IN--> SourceLocation
```

This represents both the React route graph and the independent REST surface without pretending that a REST endpoint renders a screen.

## 9. Spring Boot Analyzer Requirements

### Required for POC

1. Source scanner that identifies a Maven/Spring Boot backend and a sibling/nested Vite React frontend, while excluding `target`, `node_modules`, build output, and tests by default.
2. Java AST parsing for `@RestController`, class/method `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, and `@PatchMapping`; compose class and method paths, including empty method mappings and path variables.
3. Java AST extraction of handler method signatures, `ResponseEntity`/body return types, `sendRedirect`, and direct injected-service method calls.
4. React/TSX parsing for `Routes`/`Route`, route path literals, route element component symbols, `Navigate`, `useNavigate`, `Link`/`NavLink`, and route wrappers/guards.
5. TS/TSX parsing for centralized HTTP wrappers: `fetch` requests, HTTP method defaults/overrides, literal and template-literal URL construction, and exported API-client function symbols.
6. Cross-file correlation from React API-client symbols to call sites, then from normalized frontend URL templates to Spring endpoint mappings.
7. Component extraction for `form`, `button`, anchor/Link, input, select, textarea, dialog, and React event-handler references; connect each to a navigation/API/JavaScript action only when source proves it.
8. Resolution/evidence propagation for every node and edge, plus diagnostics for unmatched client API calls, unmatched server endpoints, parameterized URLs, redirects, and guards.
9. Deterministic JSON serialization of the resulting Application Graph.

### Future

1. Resolve custom/composed Spring mapping annotations, multiple `value`/`path` alternatives, media types, request parameters, validation, exception handlers, and generated OpenAPI routes.
2. Interpret Spring Security authorization and OAuth2-generated routes as framework contributions with configuration-aware but explicitly bounded confidence.
3. Analyze React route lazy loading, dynamic imports, computed JSX props, context/state flows, hooks, and third-party router abstractions.
4. Track backend service/repository call graphs, persistence effects, async workers, transactions, events, mail, and external HTTP clients.
5. Model static assets, Vite/Nginx SPA fallback, reverse-proxy prefixes, environment/profile overrides, and deployment-specific base URLs.
6. Extend request analysis to Axios, XMLHttpRequest, GraphQL, WebSocket/SSE, generated API clients, and JavaScript built from nonliteral URLs.

## 10. Recommended Next Implementation Step

Implement a narrow, fixture-driven **Spring Boot + React route/API inventory adapter**—not a generic Spring Boot parser.

```text
Reservio source
  -> scanner: Maven/React source inventory and technology profile
  -> SpringMappingParser: annotated REST endpoint + handler + direct-service contribution
  -> ReactRouteApiParser: Route, view, Link/Navigate, centralized fetch-client contribution
  -> correlation analyzer: normalize paths and join React API calls to Spring mappings
  -> ApplicationGraph JSON: screens, client entry points, components, actions, APIs, handlers, evidence, unresolved diagnostics
```

The first acceptance fixture should reproduce this meaningful subset: `/login`, `/dashboard`, `/reservation/new`, `/reservation/manage`, `/business/settings/integrations/line`; their React routes, their directly invoked API templates, and the matching Spring handlers. It should emit unmatched but valid API-only endpoints separately, including the LINE webhook. This proves the canonical graph across a SPA + REST application while keeping the implementation bounded and deterministic.

## Source Evidence Scope

Primary source artifacts inspected: `pom.xml`; `frontend/package.json`; `frontend/src/App.tsx`; `frontend/src/api.ts`; React pages, features, hooks, and shared components referenced by those two files; every `@RestController` source file; `SecurityConfig`; `LineOAuth2AuthenticationSuccessHandler`; application YAML; Vite/Nginx configuration; and `README.md`. Reservio was not modified.
