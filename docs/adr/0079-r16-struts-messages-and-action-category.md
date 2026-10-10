# ADR 0079 — R16 Struts messages and action category

## Status

Accepted for WP57.

## Context

Struts JSP pages commonly use `bean:message` for visible screen and control labels. Leaving the tag in static analysis output produces technical markup instead of requester-facing text. Struts action endpoints also need to be distinguished from REST APIs and screen URLs in the API view.

## Decision

- Resolve only statically named message keys from `message-resources` configured in the project. The first unkeyed resource is the default bundle; an explicit `bundle` attribute selects its configured resource alias or resource name.
- Read only the base `.properties` file. Locale-suffixed resources remain available as alternative candidates for future UI work and are never selected as the default.
- Missing keys render as `（訊息 key：<key>）`; no raw `bean:message` tag is presented as a label. Static title and component labels use the resolved value. The static preview resolves the same tags without executing application code.
- Dynamic argument expressions are displayed with a sample value in the static preview and remain identified as dynamic preview content. No project code is run and no network request is made.
- An `ACTION` endpoint that reaches a screen through its handler/forward relationships is grouped as a screen URL. Otherwise it stays in the API list with the readable category `Struts 動作`; the raw graph category remains available in the row tooltip.

## Verification

- `StrutsR16MessageResolutionTest` uses a self-authored temporary Struts fixture with two bundles and a locale-specific file. It verifies explicit and default bundle resolution, base-locale selection, missing-key fallback, screen title, and button labels.
- `r16-struts-messages.test.mjs` uses a self-authored temporary webapp to verify preview substitution, bundle selection, locale exclusion, missing-key fallback, and demonstration values for dynamic arguments.
- `r16-struts-action-label.e2e.mjs` verifies that an action forwarding to a screen is grouped as a screen URL and an action without a screen destination is labeled `Struts 動作`.
- Before implementation, the Java test failed because the component was named `save` instead of the resolved bundle text. The viewer test failed because the API row showed `其他` instead of `Struts 動作`.
- No pre-R16 fixture or assertion was changed. No golden quantity changed in WP57.
