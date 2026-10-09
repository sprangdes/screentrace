# ADR 0070: R14 design tokens and review workspace alignment

- Status: Accepted
- Date: 2026-10-09

## Context

R14 §8 introduced repository design images and a fixed offline visual system after WP45 had already shipped. The existing viewer inherited the R4 green palette and three-column shell. WP45 and WP46 must follow the new layout and color guidance without removing the accepted review workflow, decision controls, preview behavior, or report data.

## Decision

Use §8.3's system font stacks directly in the viewer CSS; do not load remote fonts or other network resources. Map the supplied palette to the existing CSS variables: page background `--gray-50` is `#F6F6F3`, card `--gray-100` is `#FAFAF8`, card border `--gray-200` is `#E2E3DF`, input border `--gray-300` is `#D5D7D2`, separator tokens are `#ECEDE9` and `#EEEFEB`, and primary text/content/muted text use `--gray-900`/`--gray-700`/`--gray-500`. The primary action changes from inherited green `#145e50` to `#2347C5`; keep/remove/caution/inferred tokens use the exact §8.3 values. The dashboard hides the persistent sidebars, uses the specified 1360px content maximum, and follows the supplied section order. The review workspace keeps the entire existing viewer in its center column, lists every screen in the queue, and places rationale and decision controls in the right panel.

WP45 adds the exact `交付清單 · 已決定 N / 總數` action. It retains the earlier R10 progress control and direct `匯出 md` action because existing accepted R4/R10 workflow tests assert those affordances and behaviors; the delivery action opens the delivery checklist. Dashboard API cards show method and route, never internal endpoint IDs.

## Consequences

- The implementation remains self-contained and offline.
- Counts and labels are computed from each graph; screenshot figures are not copied into the UI.
- The design screenshots intentionally differ from the live data and from four §8.1 cases: the map keeps relationship edges, screen review uses the complete viewer, delivery does not add a progress-file format, and the queue lists all screens.
- The retained progress and direct-export controls make the top bar denser than the mock. They preserve already accepted behavior; the new delivery action is available alongside them.

## Authorized regression expectation updates (§2.4)

| Test | Previous expectation | Current expectation | Reason and old-implementation evidence |
|---|---|---|---|
| `WP41 top bar exposes the added delivery action and overflow menu exposes every moved action` in `r12-wp41.e2e.mjs` | Four direct action groups | Five direct action groups | WP45 adds the separately visible delivery-list action. Running the updated assertion against the pre-WP45 `c10afad` snapshot failed at the count: actual 4, expected 5. The final implementation passes. |
| `WP46 page review has a grouped queue, complete center preview, always-visible rationale and explicit screen decisions` in `wp46-review-workspace.e2e.mjs` | No assertion that the dashboard remains attached after replacing the sidebar | Added assertion that the visible dashboard is a direct child of `body` | WP46 replaces the sidebar content with the full-screen queue. On the pre-fix `09159dc` snapshot the new assertion timed out waiting for `body > .review-progress-panel`; the final implementation passes. |
| `UI2 leaves undecided cards quiet and exposes quick decisions without a review mode` in `r4-canvas.e2e.mjs` | Tooltip title `動態資料為範例值` | Visible preview notice `示意畫面：資料為範例值` | The title-only expectation did not verify what the reviewer sees in the complete preview. Against pre-WP46 `45f83ad`, the visible text was only `示意`, so the revised assertion failed. |
| `review composite selections, inherited state, statistics, filtering, conflicts and local restore` in `review.e2e.mjs` | Conflict details only | Retained the full detail assertion and added dashboard summary `衝突 1 個` | WP46 moves the workflow summary into the dashboard while preserving detailed conflict evidence. On `45f83ad` the new dashboard control was absent, so the new assertion timed out; the final implementation passes. |

These are the only changed existing expectations and added layout assertions. The existing detailed conflict assertion remains unchanged; no graph, security, decision, Markdown, golden, determinism, or simulation assertions were altered.
