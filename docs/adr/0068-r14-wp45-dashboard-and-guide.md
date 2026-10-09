# ADR 0068: R14 WP45 dashboard and onboarding

## Context

R14 replaces the old overview-first entry page and its four-step onboarding with the six-page inventory workspace and a three-step guide. R14 §2.4 explicitly authorizes assertion updates for the replaced first-run guide text.

## Decision

The first-run guide has three steps matching the WP45 dashboard workflow: inventory home, screen review, and delivery checklist. At tablet widths, the selected-item panel is limited to 34dvh so it does not cover the lower part of the preview that remains interactive.

## Authorized test assertion update

- Test: `WP38 flow outline, global search, first-run guide and help can be used without changing decisions` in `screentrace-viewer/test/wp38.e2e.mjs`.
- Old expectation: four sequential guide phrases: “瀏覽地圖”, “點畫面看完整頁”, “試操作”, and “隨時標記並匯出”; it advanced after the third phrase as if there were a fourth screen.
- New expectation: three step labels: “盤點首頁”, “逐頁確認”, and “交付清單”; the test advances only between those three steps.
- Reason: WP45 §7.7 item 7 and §2.4 replace the prior guide with three steps corresponding to the new dashboard workflow.
- The new expectation fails on the pre-WP45 guide because it presents four steps and none of the three replacement page labels.

No other existing assertion was changed.


## Additional authorized layout assertion update

- Test: `UI1 shell separates top navigation, screen context and selected details` in `screentrace-viewer/test/r4-shell.e2e.mjs`.
- Old expectation: the side panel's empty prompt (“點選畫面或關聯線”) is visible on initial load.
- New expectation: the dashboard initially hides the side panel; selecting a screen opens its screen summary directly.
- Reason: WP45 replaces the initial map with the inventory dashboard and explicitly keeps details hidden until needed. The new initial-state assertion fails on the pre-WP45 screen-map entry page.
