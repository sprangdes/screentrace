# ADR 0070: R14 design tokens and review workspace alignment

- Status: Accepted
- Date: 2026-10-09

## Context

R14 §8 introduced repository design images and a fixed offline visual system after WP45 had shipped. The subsequent §9 acceptance response explicitly expanded §2.4 to authorize changing assertions that lock the old locations of specified controls. The capability of every removed control must remain reachable, and every affected test location must be recorded here. Data correctness, decision keys, Markdown contracts, simulation, security, and zero-network assertions remain unchanged.

## Decision

Use §8.3 system font stacks directly; do not load remote fonts or other network resources. The viewer maps the supplied palette to CSS variables: page `#F6F6F3`, card `#FFFFFF`, secondary card `#FAFAF8`, separators `#ECEDE9` and `#EEEFEB`, card border `#E2E3DF`, input border `#D5D7D2`, text `#1B1E22` / `#3A3F45` / `#5B6168`, primary action `#2347C5`, and the specified keep/remove/caution/inferred colors. Dashboard and review content follow the supplied section order and spacing.

The old progress overlay and its topbar trigger are removed. Progress and conflicts live on the home dashboard; the complete screen queue and navigation live on the review page; review preferences remain in More; export is the first More item until WP49. In the review page, map/file/feature navigation remains in the Function Map page and URL search remains in global search. The center preview keeps the full viewer, decisions live in the right decision card and the post-preview component list, while styles, validation, library mapping, source, and diagnostics remain reachable in the collapsed technical details. Decision reason fields use the outcome-specific labels.

## Authorized test expectation updates (§9.1)

These rows identify the exact affected tests, old and new expectations, and where the removed capability remains reachable. The §9.1 authorization covers these old-location expectations; it does not relax the underlying decision or data assertions.

| Test / location | Old expectation | New expectation | Capability and reason |
|---|---|---|---|
| `r12-wp41.e2e.mjs` — `WP41 top bar exposes the added delivery action and overflow menu and overflow menu exposes every moved action` | Topbar has 5 direct action groups, including direct review progress and next-undecided controls. Export is outside the More menu. | Topbar has 4 direct action groups; review-progress and next-undecided controls are absent there; export is the first More item. | Progress and conflicts are on the home dashboard; the complete queue advances with the existing `n` action; export and other utilities remain in More. The test still verifies the menu items and keyboard access. |
| `r12-wp41.e2e.mjs` — `WP41 first-run guide is in normal layout and never overlaps interactive controls`; `WP41 right-side controls fit without overflow at 1024px` | Progress statistics are asserted in the old overlay; the topbar progress reads `已確認 N／總數`. | Dashboard progress is asserted on the home page; topbar reads `已決定 N / 總數`. | Progress remains visible in the home dashboard and the delivery-progress chip. This reflects the §9.3 terminology and placement. |
| `review.e2e.mjs` — `review composite selections, inherited state, statistics, filtering, conflicts and local restore` | Open the confirmation dashboard and assert conflicts and progress inside `.review-progress-panel`; close it with Escape. | Navigate to the home page and assert `.dashboard-conflicts` and `.dashboard-progress`. | Conflict and progress summaries moved to the home dashboard. Composite decisions, inheritance, filtering, conflict content, and local restore assertions remain. |
| `wp37-confirmation-workflow.e2e.mjs` — progress grouping / next item | Open a floating dashboard, use its region jump and next-undecided controls. | Verify home progress and region groups; use the full review queue and keyboard `n` to advance. | Grouped progress remains on home; queue navigation is in the review page; auto-advance preference remains in More. |
| `wp37-confirmation-workflow.e2e.mjs` — dashboard close and impact | Require the floating panel to close by Escape and outside click; require it to remain open after REMOVE. | Assert there is no floating panel, and verify the assumed REMOVE impact remains visible beside the decision. | There is no overlay to dismiss or cover the right column. Progress remains on home; REMOVE impact is directly available in the decision workspace. |
| `wp37-confirmation-workflow.e2e.mjs` — all-confirmed navigation | Click topbar `下一個未確認`, expect `全部已確認`. | Open the review queue, press `n`, expect `全部畫面已確認`. | Next-screen navigation remains in the review workflow with the updated §9.4 wording. |
| `wp40-always-on-decisions.e2e.mjs` — progress and touch controls | Assert `已確認` in the topbar and read statistics from the floating review panel. | Assert `已決定` in the delivery chip and home progress track; assert the old panel is absent. | Status remains accessible from the header and home. Touch decisions, batch decisions, and shared state assertions remain. |
| `wp42-display-names.e2e.mjs` — progress names and export | Read names from `.review-progress-panel`; click a direct export button. | Read names from the home dashboard; open export from More. | The summary and export capability remain available at their new locations. The display-name and export-content assertions remain. |
| `r4-shell.e2e.mjs` — inherited component filter | Open the progress overlay and click `.inherited-filter`. | Open Function Map and use the inherited-remove state chip. | The inherited-component filtering capability remains in the map; the file-tree decision assertions are unchanged. |
| `r4-responsive.e2e.mjs` — responsive information drawer | Open the drawer from the prior topbar menu markup. | Open More, focus its menu item, and use the same drawer. | Information content, Escape close, focus return, and responsive behavior remain asserted. Only its entry point changed. |
| `wp46-review-workspace.e2e.mjs` and `wp46-structure.e2e.mjs` — screen review layout | Left sidebar has map/file/feature tabs, URL search, and checkbox filters; decisions and duplicate screen details can appear in the preview toolbar/right component list. | Left column is the complete review queue with three toggle filters; no URL field or map/file tabs; one center `h1`; no toolbar decisions; right rationale and decision cards; component decisions after the preview. | Map/file/feature and URL search remain on Function Map/global search. Decision, preview, and technical-detail capabilities remain reachable in the three-column workspace. Structural E2E covers the §9.4 layout requirements. Against old snapshot `8687d38`, the queue-filter check expected 3 and found 0. |
| `wp47-reason-labels.e2e.mjs` — outcome labels | Both outcomes use the generic label `原因`. | REMOVE uses `移除原因`; KEEP uses `保留原因`. | This is the §9.5 wording requirement; the stored reason values and Markdown contract are unchanged. In the old `8687d38` implementation the new REMOVE label assertion failed: expected `移除原因`, actual `原因`. |
| `r4-canvas.e2e.mjs` — visible preview notice | Visible notice is `示意畫面：資料為範例值`. | Visible notice is `示意畫面：資料為範例值，不是真實系統`. | Matches §9.4’s required notice. Old snapshot `8687d38` failed this assertion with the shorter old text. |
| `r5-endpoints.e2e.mjs` — page-route category navigation | Click the separate button `另有 2 個頁面路由`. | Click the existing `[data-endpoint-group="SCREEN"]` category tab, now labelled `畫面網址`; the count appears in the single `API N · 畫面網址 M` header. | §11.1 item 2 removes the duplicate count/button while retaining direct access to page routes. The category filter and row assertions remain. |

The old-version test run on `8687d38` completed 36 of 37 tests; the failures were the preview notice above, while targeted old-version runs also confirmed the review queue’s three filters were absent and WP47 still showed the generic reason label. The revised WP45 import-feedback check also failed on the old implementation because its feedback disappeared when More closed. These are implementation-gap checks, not permission to remove unrelated coverage.

## Other requirement-driven expectation changes

| Test / location | Old expectation | New expectation | Reason |
|---|---|---|---|
| `wp35-36-corrections.e2e.mjs` — whole-project feature-region basis | Synthetic fixture defaults to `controller`. | Synthetic fixture defaults to `url`. | The §2.2 automatic selection rule chooses the basis with the fewest single-screen regions, then breaks ties in the specified order. eMusicStore fixture results now assert the selected basis and displayed label. |
| `wp46-structure.e2e.mjs` — rationale heading selector | Heading may be any `h2` nested below the rationale card. | Heading must be the card’s direct `h2` child. | This tightens the structural contract; expected text remains `判斷依據`. |
| `wp47-reason-labels.e2e.mjs` — label text selector | Compare the whole label’s rendered text. | Compare the label’s text node, excluding its tooltip/help content. | Keeps the exact visible label assertion while avoiding tooltip text in the accessible label. |
| `r14-design-api-label.e2e.mjs` fixture | Fixture endpoint lacked a category but was treated as an API. | Fixture explicitly declares `REST_API`. | Corrects fixture data to match the requirement that dashboard API counts include API-category endpoints only; no assertion was removed. |

## Consequences

- The implementation remains self-contained and offline.
- Counts, labels, entry classifications, and groupings are derived from each graph; screenshot figures are not copied into the UI.
- §8.1’s intentional differences remain: the map keeps relationship edges, review uses the complete viewer, delivery does not add a progress-file format, and the queue lists every screen.
- The R14 report records the actual eMusicStore/PetClinic counts, the three feature-grouping comparisons, and paired 1440×900 screenshots for synthetic and eMusicStore reports. The implementation screenshots have no external annotation strip.
