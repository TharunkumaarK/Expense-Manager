# Phase 4C.1 Visual Corrections and Design-System Acceptance

The correction starts at `bbbddf9d01851edfb6c7c5d6d111483ae178b173` on `test`. The baseline filled primary actions continuously, swept a reflection across their interior, scaled controls on press, used a conspicuous blue-slate workspace, and rendered 4px budget tracks. This pass addresses those defects in the shared definitions. Browser testing used synthetic accounts on localhost with Supabase requests blocked. No deployment took place.

The shared control geometry, typography, fluid gutters, wallet customization, country layouts and financial color meanings carry forward. Transaction form labels, submission busy-state handling, listener migration, the single stylesheet, asset fingerprinting and existing CSP carry forward. The [original Phase 4C.1 report](PHASE_4C_1_DESIGN_SYSTEM_IMPLEMENTATION_REPORT.md#wording-inventory) retains the wording inventory.

## Accent, surfaces and controls

| Area | Corrected treatment |
|---|---|
| Bronze accent | `--action-gradient: linear-gradient(90.81deg, #9B794B 0%, #E7CBA3 99.75%)`. The action foreground is `#E7CBA3` at rest and `#14110C` when filled. The transitional edge is `#C5A67C`, also used for input borders and derived focus halos. The sidebar marker uses the exact gradient. Selected segments use a dark bronze-tinted surface with accent-colored text. |
| Primary button | A 1px gradient edge surrounds a graphite `#191919` interior. The gradient stays fixed while the interior fades out in 100ms and returns in 140ms using the existing ease-out curve. Icons using `currentColor` follow the foreground. Focus rings stay visible at rest. Space activation supplies fill feedback and dispatches the normal click immediately on release. Auth and setup retain neutral actions. |
| Semantic glimmer | Primary uses a warm light tint. Secondary and neutral icon actions use silver. Transaction actions and choices use emerald for income, crimson for expenses and sapphire for transfers and remittances. The month-close confirmation uses amber. Destructive buttons and the ledger delete icon use restrained rose. Toolbar, modal and generated buttons use the delegated mechanism. Active navigation remains a persistent selection. |
| Graphite workspace | `#141414` workspace with `rgba(155, 121, 75, 0.16)` near the upper-left and `rgba(130, 140, 155, 0.06)` near the opposite corner. Both are static and use the same token at desktop and mobile widths. Sidebar is `#171717`. |
| Financial surfaces | Card graphite uses `rgba(37, 37, 37, 0.72)`, with fine borders and existing inner highlights. Elevated graphite is `#282828`. Dense sheets keep their opaque modal surface. No extra backdrop-filter declarations were added. Wallet, country and flag color compositions are preserved. Static financial panels keep quiet surfaces. |
| Budget tracks | `3.5px` high with a neutral track, the existing safe/warning/danger gradients and an independent 3.5-second transform-based sheen. The white peak is `0.22` alpha. Existing reduced-motion and mobile gates apply. |

## Motion and feedback lifecycle

One 950ms linear CSS keyframe rotates a small conic highlight behind a fixed 1.5px rounded mask. The wrapper follows each control’s shape and the speed-dial actions use the circle around their existing icon. The overlay is absolute, hidden from assistive technology and transparent to pointer input. The angle makes one clockwise turn and the highlight fades in and out at the endpoints. A persistent hover retains the fill after the overlay is removed. CSS suppresses the overlay on disabled or busy controls and in reduced-motion mode.

Mouse hover is scoped to mouse events on fine-pointer devices. Touch and pen start feedback at pointer-down. One 1100ms timer holds the filled state through a quick tap. A repeated tap restarts the current lap and refreshes that timer. A cancellation or scroll gesture clears feedback. A single observer active during press follows availability and removal. A live change to reduced motion clears in-flight press motion and allows subsequent static press feedback. Existing click handlers open, save or navigate as before.

| Previous motion | Correction | Reason |
|---|---|---|
| Interior reflection and permanent gold | Short graphite crossfade and one perimeter lap | Removes movement beneath labels and keeps the primary state distinct at rest, hover and focus. |
| Button, FAB and mobile press scale | Fill, border and surface feedback | Keeps control geometry stationary under the pointer. |
| Country press scale, auth preview lift, color-swatch scale, and moving wallet/navigation hints | Stable outlines, color and lighting | Keeps card and control edges tied to what the user is pointing at. Previously settled overlay entrances, drawer movement and chart motion remain in place. |
| First correction animated a conic gradient angle | Rotated the highlight behind a fixed mask | Chrome captured repeated paint for the changing gradient. The measurement comparison below records the effect of the alternative. |

## Design Skills Utilization

| Skills inspected and applied | Method and influence |
|---|---|
| `emil-design-eng`, `animate` | Used the purpose and frequency checks, button recipe in `RECIPES.md`, asymmetric feedback timing, pointer gating and frame-by-frame review. Fill responds within 100ms and the lap never delays an action. Retained established easing tokens. The brief governs the longer decorative lap and prohibits the generic press-scale recipe. |
| `review-animations`, `animation-performance` | Used the motion standards in `STANDARDS.md` and the layout, style, paint and raster diagnostic sequence. Stepped through frames, inspected keyframes and compared DevTools traces. A rotating layer behind a static mask replaced the repainting conic-angle trial. |
| `apple-design`, `mobile-native` | Applied contact-first feedback, immediate activation, a hierarchy of translucent chrome and readable sheets, native gesture cancellation and pointer-type gating. Kept springs, additional blur and haptics outside this correction. Chrome touch emulation supplied evidence for the browser event lifecycle. |
| `frontend-design`, `design-taste-frontend`, `responsive-design` | Used a token-first plan followed by real screenshots and an alignment/legibility review. Kept the financial views and preserved wallet gradients as the visual focus. The marketing asset and hero workflows were inapplicable to an authenticated dashboard. |
| `improve-animations`, `animation-vocabulary` | Used the motion inventory and scope checks to identify prohibited presses and lifts while keeping purposeful overlay transitions. Used crossfade and perimeter terms to describe the effects. The application correction was implemented through the construction workflow. |
| `web-design-guidelines` | Applied the bundled `references/command.md` checks for focus visibility, input feedback, touch behavior, reduced motion and contrast to the changed surfaces. |
| `verification-before-completion`, `systematic-debugging` | Loaded from the local Superpowers cache. Compared the same DOM mock failure before and after, fixed the fixture at its source, checked actual computed states, and used fresh source and build browser results before evaluating readiness. |

All priority skills were available. No skills or dependencies were installed. The prior phase recorded `ui-ux-pro-max` as unavailable. Local Chrome DevTools Protocol scripts drove comparisons, native mouse and keyboard input, emulated touch and animation inspection. Python image tools assembled captured frames for the report.

## Browser evidence

| View or control | Baseline | Corrected |
|---|---|---|
| Desktop Dashboard | [1440px](phase4c1-corrections-evidence/before-desktop-dashboard.webp) | [1440px](phase4c1-corrections-evidence/after-desktop-dashboard.webp) |
| Mobile Dashboard | [390px](phase4c1-corrections-evidence/before-mobile-dashboard.webp) | [390px](phase4c1-corrections-evidence/after-mobile-dashboard.webp) |
| Wallets | [1440px](phase4c1-corrections-evidence/before-wallets.webp) | [1440px](phase4c1-corrections-evidence/after-wallets.webp) |
| Budgets | [1440px](phase4c1-corrections-evidence/before-budgets.webp) | [1440px](phase4c1-corrections-evidence/after-budgets.webp) |
| Transaction sheet | [390px](phase4c1-corrections-evidence/before-transaction.webp) | [390px](phase4c1-corrections-evidence/after-transaction.webp) |
| Header action | [Rest and hover](phase4c1-corrections-evidence/before-header-states.png) | [Rest, hover, keyboard focus and busy](phase4c1-corrections-evidence/after-header-states.png) |

The [desktop lap frames](phase4c1-corrections-evidence/desktop-lap.png) and [mobile tap and lap frames](phase4c1-corrections-evidence/mobile-lap.png) come from actual Chromium rendering. The browser inspector paused the lap at the displayed elapsed times. The mobile sequence also includes the quick-tap and settled frames from native touch dispatch. The inset mask confines the light to the edge and the angle advances clockwise through the frame sequence. The [browser measurements](phase4c1-corrections-evidence/browser-results.json) include the measured angle, transition samples, tap and retrigger timings, and the observed computed states.

## Performance and package size

| Metric | Baseline | Corrected |
|---|---:|---:|
| Source CSS | 341,527 B | 340,758 B |
| Source rules | 1,894 | 1,883 |
| Backdrop-filter declarations | 72 | 72 |
| Minified CSS | 240,087 B | 239,558 B |
| Minified CSS gzip / Brotli | 39,268 B / 31,391 B | 39,288 B / 31,570 B |
| Minified app JS | 530,958 B | 532,437 B |
| Startup JS including vendors | 1,469,199 B | 1,470,678 B |
| Development package | 11 files / 2,010,680 B | 11 files / 2,011,894 B |

Node’s default gzip and Brotli compressors were used for both columns. The deployment-format development build requests the same five same-origin fingerprinted JavaScript and CSS resources. The header file matched byte for byte. The worker allowlist and exclusion of development artifacts passed the existing deployment checks.

The navigation run used three cache-disabled login loads and three repetitions at each viewport for each version. The journey visits all seven workspaces and opens and closes a transaction sheet. These values are medians.

| Navigation metric in ms | Desktop baseline | Desktop corrected | 390px baseline | 390px corrected |
|---|---:|---:|---:|---:|
| Layout | 24.88 | 22.95 | 20.52 | 22.24 |
| Style recalculation | 47.95 | 55.76 | 48.57 | 51.54 |
| Main-thread task time | 260.19 | 269.88 | 234.60 | 254.67 |

Median cold login load was 251.90ms before and 325.80ms after. Desktop layout time fell while style, total task time and cold load increased in this small sample. The timing includes the readable-source CDN paths. It provides no basis for a broad runtime improvement claim. The trace uses Chrome 157 in headless mode with its hardware GPU disabled.

The interaction trace compares five accepted desktop hover and five mobile FAB tap cycles per version. Each desktop sample includes leaving the button. Each mobile sample includes opening and dismissing the existing speed dial. The renderer medians below include the entire interaction.

| Interaction metric | Desktop baseline | Desktop corrected | 390px baseline | 390px corrected |
|---|---:|---:|---:|---:|
| Layout time | 0.00ms | 1.25ms | 0.17ms | 0.27ms |
| Style recalculation | 6.71ms | 22.22ms | 8.41ms | 12.92ms |
| Main-thread task time | 36.77ms | 80.64ms | 27.04ms | 36.16ms |
| Paint events / duration | 9 / 2.60ms | 33 / 7.02ms | 18 / 1.15ms | 41 / 1.91ms |
| Raster task duration | 27.67ms | 13.22ms | 7.80ms | 4.56ms |

The fixed-mask transform design reduced the mobile paint cost measured for the first conic-angle approach from 9.46ms to 1.91ms. Clipping the rotating layer to its own bounds reduced its exploratory desktop paint median from 15.81ms to 7.02ms. Compared with the committed 280ms reflection, the specified 950ms lap and the new fill transitions increased main-thread and paint work. The longest recorded individual main-thread task during corrected desktop hover was 12.17ms on this machine. Desktop layout appeared near overlay insertion and removal, and the button and surrounding controls held their positions. The trace includes paint work, so it does not establish a compositor-only path or device-level frame pacing.

## Regression results

| Verification | Result |
|---|---|
| Source browser workflow suite | 67 passed |
| Deployment-format development browser suite with generated headers | 15 passed |
| Visual interaction suite on source | 30 passed |
| Visual interaction and financial workflow suite on the development package | 37 passed |
| Standard Node regression assertions | 374 passed |
| Deployment and worker suite | 16 passed |
| Existing budget, wallet rename and loan logging suites | Passed |
| Browser widths | Dashboard, Transactions, Analytics, Budgets, Wallets, Reports and Settings fit at 360, 390, 430, 768, 1024, 1440 and 1920px. No document overflow in 49 view and width combinations. |
| Source and artifact integrity | `git diff --check`, JavaScript syntax checks, development build and artifact inventory passed. |

Browser coverage includes create and edit through native transaction forms, busy-state release, wallet creation and rename, budget views, privacy toggle, keyboard activation, the mobile FAB, modal open and close, dynamically created buttons, and account switching. The older Phase 5 suite failed equally on the baseline and the corrected source before the fixture update. Its mock button lacked the DOM methods already used for `aria-busy`. The mock now implements those attribute operations and all 203 existing assertions complete.

## Visual compliance matrix

| Requirement | Status | Evidence |
|---|---|---|
| Exact bronze gradient and graphite interaction ink | Pass | Computed styles of the actual header and FAB show the specified gradient stops and `rgb(20, 17, 12)` filled foreground. |
| Resting gradient stroke, graphite interior and accent foreground | Pass | Desktop rest and mobile rest captures show the edge. The computed header interior is `rgb(25, 25, 25)` with `rgb(231, 203, 163)` text. |
| Smooth fill and return | Pass | Browser samples record intermediate opacity in each direction. The fill remains on stationary desktop hover and clears after pointer exit. |
| Clockwise 950ms perimeter glimmer | Pass | Actual sequential frames and inspected transform angles show the clockwise passage around rectangular and circular controls. The 1.5px mask follows the control shape. |
| One lap and no stationary repeat | Pass | Animation completion removes the overlay while retaining hover fill. No animation remains when the pointer stays in place. |
| Semantic colors and coverage | Pass | Actual transaction and modal controls show emerald, crimson, sapphire and silver. Synthetic buttons exercising production markup rules show amber, restrained rose and neutral icon silver. |
| Mobile quick tap and immediate activation | Pass | Native touch dispatch opens the existing action menu on release. The FAB stays a 54px circle with the same bounds during fill. The post-tap fill clears without sticky hover. |
| Repeated taps, cancellation, scroll, unavailable controls, removal and reduced motion | Pass | Browser dispatch exercised each condition. Both taps ran their clicks. Scroll and cancellation produced no click. The reduced-motion variant produced static feedback. |
| Keyboard focus and activation | Pass | Tab shows a 2px focus ring with the resting treatment. Space supplies fill feedback and opens the transaction selector. The source regression suite also exercises Enter through the native form. |
| Stable geometry and contrast | Pass | Browser bounds were identical across primary and FAB states and financial card and transaction row hover. The endpoint contrast is 11.28:1 at rest, at least 4.69:1 on the filled gradient and 9.46:1 for the focus color against the elevated card token. |
| Neutral graphite and shared responsive surfaces | Pass | Matched screenshots show warm upper-left light, weaker opposite-corner light and graphite cards at desktop and phone widths. The browser audit reports consistent fit. |
| Wallet and country gradients | Pass | Computed background images in the Wallets view match the baseline and screenshots retain the original colors. |
| 3.5px budget streak and independent sheen | Pass | The browser measured safe, warning and danger tracks at 3.5px with unchanged gradients and fill widths of 40%, 85% and 100%. The sheen reports 3.5 seconds and a 0.22 peak alpha. |
| Build, CSP and regression coverage | Pass | Browser suites ran with generated local headers. All builds and deployment checks above passed. |
| Physical touch and cross-engine validation | Limitation | Browser evidence covers Chrome mouse, keyboard and emulated touch. Hardware timing, pen hardware, Safari and Firefox were outside the available environment. |

## Phase 4C.2 handoff

The desktop compact rail, overlay expansion without workspace reflow, keyboard and click alternatives, duplicated-heading review and layout reorganization remain Phase 4C.2 work. The mobile navigation redesign remains separate. Physical-device motion and cross-engine checks remain the verification limitations for this correction.

**READY WITH DOCUMENTED NON-BLOCKING LIMITATIONS**
