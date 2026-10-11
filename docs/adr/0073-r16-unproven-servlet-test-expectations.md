# ADR 0073: R16 unproven servlet mapping test expectations

## Context

OQ-027 scheme C requires an unproven or ambiguous ActionServlet mapping to retain the pre-R16 extension-candidate behavior. Two synthetic tests added by R16 commit `f655446` still expected the temporary mapping behavior that OQ-027 rejected. OQ-028 scheme A authorizes updating these R16-added assertions only; fixture content stays unchanged.

## Decision

Update only the assertions in the following R16-added tests to lock the pre-R16 behavior and the additional diagnostic that the mapping is not proven:

| Test | Old expectation | New expectation | Reason |
|---|---|---|---|
| `ambiguousActionServletMappingsDoNotGuessAnEndpointAlias` | One endpoint at `/save` | Two endpoints, `/save` and `/save.do`, each retaining the legacy inferred confidence; also require the `STRUTS_SERVLET_MAPPING_UNRESOLVED` diagnostic to say the mapping is unproven | Multiple mapping candidates cannot prove which public URL applies, so R16 must retain the old extension candidates rather than merge or guess. |
| `missingServletMappingKeepsLogicalAndLiteralPublicTargetsSeparate` | `/save.do` is `UNRESOLVED` | `/save.do` retains the legacy `INFERRED` alias confidence and its triggering relation; also require the unproven mapping diagnostic | Missing mapping evidence retains the pre-R16 candidate and confidence behavior; the diagnostic communicates the uncertainty without changing that behavior. |

No R16-preexisting test or fixture was changed. The existing fixture definitions remain byte-for-byte unchanged.

## Consequences

The tests distinguish proven mapping (one endpoint identity, public URL primary, confirmed call) from unproven mapping (legacy logical/public candidates plus a diagnostic). This follows OQ-024 and OQ-027 scheme C without modifying R16-preexisting tests.
