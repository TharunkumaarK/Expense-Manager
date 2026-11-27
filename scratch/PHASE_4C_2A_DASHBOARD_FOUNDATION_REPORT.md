# Phase 4C.2A — Dashboard foundation and sidebar

Implemented on `test` from `9ac2ea9e4db5bfadb831810352ff284f975d5d5f`.

| Before | After | Why |
| --- | --- | --- |
| C2-derived card fill and backdrop blur | **C3 Sculpted dark glass** uses the lab’s exact 158° padding-box gradient and 145° border-box gradient. A 1px transparent border reveals the rim. The shadow is `0 12px 23px rgb(0 0 0 / .39), inset 0 1px rgb(255 255 255 / .085), inset 0 -1px rgb(255 255 255 / .035)`. | Reproduces the selected tonal layering and edge lighting with no card backdrop sampling. |
| D2 workspace atmosphere | **D1 Restrained graphite atmosphere** uses base `#141414`, upper-left `rgba(155,121,75,.10)` and lower-right `rgba(130,140,155,.035)`. Gradient sizes adapt to the workspace. Scrollbars use the shared graphite tokens. | Keeps the surrounding canvas subdued. |
| Neutral Sign In and dashboard See All | Sign In uses the primary bronze outline and fill. See All is the dashboard’s opt-in secondary action. | Establishes the action hierarchy on the two relevant screens. |
| A desktop toggle changed the sidebar width in the layout | The sticky sidebar reserves 76px and reveals up to 260px with a 240ms clip transition using `cubic-bezier(0.32, 0.72, 0, 1)`. | Keeps nav icons and the underlying workspace fixed throughout the interaction. |

**Button source.** The pre-bronze primary recipe is in `3366db5e6322a7f254014fff9bbb4fcf989a88e4`, in `.btn-primary`, `.btn-primary::before` and `.btn-primary:hover` in `css/style.css`. It used a 92.19° interior with 50%-opaque RGB 81/35/81 gray stops at 4.11%, 51.26% and 97.28%. Its 1px transparent border carried a 145° white outline at .70/.30/.09/.38 opacity with stops at 0%/22%/55%/100%. Resting text and icons were `#F5F5F5`. The historical hover fill `rgba(255,255,255,.85)` and ink `rgba(28,28,28,.92)` now serve the secondary interaction state. Primary retains `linear-gradient(90.81deg, #9B794B 0%, #E7CBA3 99.75%)` and filled ink `#14110C`.

**Glimmer and navigation.** Desktop Add transaction, mobile FAB and Sign In use the bronze glimmer. Recent Activity’s See All uses the silver-white glimmer. The shared SVG perimeter runs one linear 900ms lap with a 29px highlight and .67 peak opacity. Filters, privacy and other utilities use quiet feedback. The sidebar stays open across the full revealed area and closes on exit. Click and keyboard offer a pinned mode with outside-click and Escape dismissal. The toggle exposes its expanded state, current links expose the active page, and keyboard activation and reduced motion skip sidebar travel.

**Workspace geometry.** Measurements are `(x, y, width, height)` in CSS pixels for `#desktop-content-area`. Scrollbar space is included in the reported viewport width.

| Chromium viewport | Collapsed | Expanded |
| --- | --- | --- |
| 1024 × 900 | (76, 64, 933, 2476.91) | (76, 64, 933, 2476.91) |
| 1440 × 1000 | (76, 64, 1349, 1450.28) | (76, 64, 1349, 1450.28) |
| 1920 × 1080 | (150.5, 64, 1680, 1450.28) | (150.5, 64, 1680, 1450.28) |

The outer workspace and dashboard grid rectangles also matched in both states. The first navigation icon stayed at `(29, 123.27, 18, 18)` at all three widths.

**Verification.** Local Chromium rendered the fingerprinted build with synthetic November 2026 Japan and India data. The checks covered dashboard materials, KPI and chart rendering, country portfolio and region switching, six wallet treatments, and the 3.5px safe and warning budget streaks with visibility-gated sheen. All seven views passed a desktop smoke check. The 390px smoke check covered login press, cancellation and submission, drawer navigation and the FAB. The branch build, deployment tests including the local production build and service-worker checks, and all 30 design identity assertions passed.

**Files changed.** `css/style.css` for materials, shared actions and sidebar presentation. `index.html` for sidebar semantics and action SVGs. `js/app.js` for sidebar interaction and current-page state. `js/startup.js` for shared secondary touch feedback. `js/supabaseClient.js` for label-only updates that keep the Sign In SVG mounted during sign-in and password-recovery requests.

**Evidence**

1. [Desktop dashboard, collapsed at 1440px](phase4c2a-evidence/dashboard-collapsed.webp)
2. [Desktop dashboard, expanded at 1440px](phase4c2a-evidence/dashboard-expanded.webp)
3. [Primary and secondary actions at rest and on hover](phase4c2a-evidence/button-interactions.webp)
4. [Sign In at rest, on hover and pending](phase4c2a-evidence/login-action.webp)
5. [Normal-speed sidebar recording](phase4c2a-evidence/sidebar.mp4)
6. [Mobile drawer at 390px](phase4c2a-evidence/mobile-drawer.webp)

**Acceptance limits.** Browser verification used headless Chromium, with touch emulation for mobile and a mocked sign-in response. The owner’s manual dashboard review is the acceptance gate.

**DASHBOARD VISUAL FOUNDATION AND SIDEBAR IMPLEMENTED — AWAITING OWNER ACCEPTANCE**
