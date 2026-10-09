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
