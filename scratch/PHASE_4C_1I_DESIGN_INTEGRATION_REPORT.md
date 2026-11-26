# Phase 4C.1I Design System Integration

**DESIGN SYSTEM INTEGRATED — AWAITING OWNER VISUAL ACCEPTANCE**

Implemented on `test` from `90c30d307bb7995d038b9c5dc895db7a6b14b9f4`. The working tree integrates A3, C2 and D2 into the existing application. The owner can review the [desktop dashboard](phase4c1-integration-evidence/1440-home.webp), [mobile dashboard](phase4c1-integration-evidence/390-home.webp), and [normal-speed FAB recording](phase4c1-integration-evidence/mobile-fab.mp4).

## Interaction hierarchy

| Eligibility | Controls | Rest and activation |
|---|---|---|
| Signature | Header **Add transaction** and mobile **+** FAB | Both opt in explicitly with `data-signature-action` and a resident, assistive-technology-hidden SVG. Mouse entry or intentional touch starts one lap. |
| Standard | Ledger Add, wallet and budget creation, modal saves, transaction-type choices and speed-dial actions | Workspace primary buttons share the gradient outline and translucent interior. Transaction saves and speed-dial icons retain their financial colors. The neutral authentication and setup styles keep their existing treatment. |
| Utility | Privacy, navigation, country segments, search, filters, close, wallet menus, delete, settings controls | Surface, border, foreground, focus or active-state feedback. Delegated mouse feedback also works after a list or toolbar re-renders. |

One accent token supplies the outline and interaction fill, `linear-gradient(90.81deg, #9B794B 0%, #E7CBA3 99.75%)`. The resting foreground is `#E7CBA3` and the filled ink is `#14110C`. The permanently masked gradient supplies the fine outline while an independent gradient layer fades in over the glass. Native focus is visible before activation. [Filled header action](phase4c1-integration-evidence/add-filled.webp).

The Balanced preset uses a 1px outline, 1.45px highlight stroke, 29px dash, 65% white mixed into the light bronze, 0.67 peak opacity, and 900ms travel. The first and last 8% fade the light. The SVG rounded rectangle fits each rendered control in CSS pixels, including the circular FAB. Its measured path length drives the dash offset. The FAB plus rotates independently to indicate the open menu. The desktop path measured 327.76px, advancing approximately 65.55px every 180ms. The decoration ends while the stationary pointer can maintain the fill. [Arc samples and interaction checks](phase4c1-integration-evidence/interaction-checks.json).

Touch begins the 110ms fill on contact. Native release executes the action, holds the fill for 170ms, then lets it fade over 150ms. A cancelled pointer, lost capture during contact, or movement beyond 12px clears pressed feedback. Disabled, ARIA-disabled and busy signature controls suppress activation and decoration. Keyboard activation follows the existing native button path. Reduced motion suppresses the lap and sheen. The packaged test caught a time-unit conversion error when minification serialized `900ms` as `.9s`. The runtime now handles both units. [Desktop hover](phase4c1-integration-evidence/desktop-toolbar.mp4) · [Mobile repeated taps and transaction form](phase4c1-integration-evidence/mobile-fab.mp4).

## Materials and CSS consolidation

| Before | After | Reason |
|---|---|---|
| Flat translucent graphite card fill and several rules cancelling the shadow | C2-derived directional highlights, illuminated border, subtle inset edge and ambient shadow | Provides depth across summaries, charts and financial panels while leaving enough dark area behind values. |
| Static lighting sized to a single canvas | D2 warm upper-left alpha 0.19, opposite neutral alpha 0.065, on `#141414` | Clamped horizontal extents adapt to phones and wide workspaces. Lighting stays still. |
| Repeated component-specific glass and large stacked blurs | One 9px frosted-card treatment with tonal layers for nested cards and the dense report table. Modal sheets, the transaction picker, country portfolio and drawer use the elevated material. | Separates dense data, chrome and overlay text without filtering each child surface. |
| Rotating conic overlay, broad animation eligibility, 1100ms press lifetime, and a body subtree observer | Two pre-mounted rounded SVG paths and one finite Web Animations effect per interaction. Native click handlers remain independent of motion. | Constant distance per unit time. Repeated input reuses the geometry. |
| Sheen on every desktop budget fill and none on phones | 3.5px fill with the original safe, warning and danger gradients. Visible summary bars can run a narrow 3.5s sheen with 0.22 peak alpha. | Limits competing motion. An intersection observer watches four persistent summary hosts. Offscreen, hidden-document and reduced-motion states stop the effect. Category and loan bars remain static. |

The C2 adaptation reduces the brightness of the broad secondary gradient and concentrates edge light in the border and inset highlight. Financial semantics, branded wallets and country gradients retain their own paint. Browser comparison found identical rendered background-image lists for all six fixture wallets and the three regional cards across builds. Clicking the India flag opened **India Overview**. The ledger country selector and filter popover also responded during a pointer sweep. [Wallets](phase4c1-integration-evidence/1440-wallets.webp) · [Ledger toolbar recording](phase4c1-integration-evidence/ledger-toolbar.mp4).

The changes live in the existing token, control, material, and progress sections of [css/style.css](../css/style.css). Removed the conic rotor, semantic glimmer-color rules, unused pulse keyframes, empty glass-reflection layer and repeated card material declarations. [index.html](../index.html) identifies the two signature controls and persistent budget hosts. [js/startup.js](../js/startup.js) handles finite input feedback and summary visibility. The isolated [design lab](design-lab/index.html) remains the reference. The report and its evidence live under `scratch/`.

## Actual application evidence

All images and recordings use the local deployment-format application with synthetic accounts. For a matched starting point, see the [baseline desktop](phase4c1-integration-evidence/before-desktop.webp) and [baseline phone](phase4c1-integration-evidence/before-mobile.webp).

| View | Desktop, 1440px | Phone, 390px |
|---|---|---|
| Dashboard | [Desktop](phase4c1-integration-evidence/1440-home.webp) | [Phone](phase4c1-integration-evidence/390-home.webp) |
| Transactions | [Desktop](phase4c1-integration-evidence/1440-transactions.webp) | [Phone](phase4c1-integration-evidence/390-transactions.webp) |
| Analytics | [Desktop](phase4c1-integration-evidence/1440-analytics.webp) | [Phone](phase4c1-integration-evidence/390-analytics.webp) |
| Budgets | [Desktop](phase4c1-integration-evidence/1440-budgets.webp) | [Phone](phase4c1-integration-evidence/390-budgets.webp) |
| Wallets | [Desktop](phase4c1-integration-evidence/1440-wallets.webp) | [Phone](phase4c1-integration-evidence/390-wallets.webp) |
| Reports | [Desktop](phase4c1-integration-evidence/1440-reports.webp) | [Phone](phase4c1-integration-evidence/390-reports.webp) |
| Settings | [Desktop](phase4c1-integration-evidence/1440-settings.webp) | [Phone](phase4c1-integration-evidence/390-settings.webp) |

All seven views fit at 360, 390, 768, 1024, 1440 and 1920px with zero horizontal document overflow. The motion clips use browser screencast timestamps and 30fps MP4 playback. The ledger clip covers search, all four country choices, Filters, the secondary Add, filter dismissal and regional selection. [Transaction form](phase4c1-integration-evidence/transaction-form.webp) · [Phone budget detail](phase4c1-integration-evidence/390-budget-summary.webp) · [One budget sheen cycle](phase4c1-integration-evidence/budget-summary.mp4).

The budget renderer produced 40%, 85% and capped 100% fill at 40%, 85% and 114% usage. All three tracks measured 3.5px. Desktop KPI contrast measured against adjacent rendered background pixels was 4.87:1 for the small labels and 5.59:1, 3.86:1 and 13.02:1 for the large income, outflow and savings figures. The outflow sample uses the large-figure threshold. These samples cover the dashboard fixture. [Measurements](phase4c1-integration-evidence/financial-surfaces.json).

## Rendering cost

Three 1.25s observation windows per build and interaction used the same fixture, viewport, local libraries and headless Chromium configuration with the hardware GPU disabled. Each cell below gives the baseline and integrated medians. The scroll case uses the same ten wheel events. FAB windows include opening the actual speed dial.

| Interaction | Main thread ms | Style ms | Layout ms | Paint ms | Paint calls | Median rAF interval ms |
|---|---:|---:|---:|---:|---:|---:|
| Add hover | 60.57 → 56.12 | 13.95 → 9.61 | 0.37 → 0.00 | 1.17 → 6.16 | 17 → 112 | 16.70 → 16.70 |
| Privacy hover | 58.52 → 40.99 | 13.87 → 7.17 | 0.79 → 0.00 | 0.44 → 0.25 | 7 → 4 | 16.70 → 16.70 |
| Dashboard scroll | 49.41 → 51.68 | 6.63 → 7.61 | 0.00 → 0.00 | 0.00 → 0.00 | 0 → 0 | 16.70 → 16.70 |
| FAB open | 61.45 → 58.06 | 18.38 → 15.13 | 0.44 → 0.16 | 1.99 → 4.56 | 37 → 134 | 16.70 → 16.70 |

The rounded SVG stroke incurs paint throughout its lap. The utility interaction avoids that cost. The warm scroll trace describes renderer main-thread work. Physical GPU bandwidth, backdrop compositor cost, energy use and presented frame rate remain unmeasured. [Baseline trace samples](phase4c1-integration-evidence/before-timings.json) · [Integrated trace samples](phase4c1-integration-evidence/after-timings.json).

## Design Skills Utilization

| Skill | Application in this integration |
|---|---|
| `emil-design-eng` | Used frequency and purpose to distinguish the main Add action from frequently traversed toolbar controls. Reviewed both at normal rates. |
| `frontend-design`, `apple-design` | Adapted the lab’s warm graphite light to actual workspace dimensions and its translucent depth to cards, dense rows, navigation and sheets. Preserved established SF Pro/system typography and financial identities. |
| `animate`, `review-animations` | Applied the button recipe and motion review standards to interruption, contact, release, utility feedback and reduced motion. The project’s stable geometry took priority over example press scales, springs and new easing curves. |
| `animation-performance` | Used equivalent trace windows, a resident SVG and native animation timing. Applied visibility gating to repeating sheen. |
| `responsive-design`, `mobile-native` | Checked all requested widths, real browser touch dispatch, scroll cancellation and repeated taps. |
| `design-taste-frontend`, `web-design-guidelines` | Reviewed rendered screens, component consistency, focus visibility, decorative SVG semantics and interaction feedback using the bundled interface guidelines. Existing app layouts and copy were retained for the later layout phases. |
| `verification-before-completion` | Required fresh application and package checks, verified the allowlisted output, and reconciled screenshots, traces and functional outcomes before reporting. |

All mandatory skills were available locally. The supporting motion references were `animate/RECIPES.md` and `review-animations/STANDARDS.md`. The accessibility review used `web-design-guidelines/references/command.md`. The brand, palette and landing-page generation workflows would change decisions already settled in the brief and were omitted.

## Regression and release scope

| Evidence | Result |
|---|---|
| Existing source browser acceptance suite | 67 passed. Used pinned local libraries for offline rendering. Covered decimal entry, transaction creation and editing, wallets, transfers and remittances, budgets, privacy, modal interaction, account switching, report reconciliation and reload. |
| Existing deployment-format browser suite | 15 passed with generated headers, fingerprinted local assets, synthetic auth, account cleanup, worker caching and print checks. |
| Existing packaged form scenarios | Seven passed, covering privacy, wallet create and rename, native transaction create and edit, busy-state release, budget geometry and account switch cleanup. |
| Integration browser checks | 22 input and motion checks passed. Four additional checks covered fixed signature bounds, India portfolio access, the ledger toolbar and three budget states. Six viewport widths covered all seven views. |
| Existing Node regressions | 374 counted assertions passed across the Phase 1 corrections, Phase 2 hotfix/usability, UX simplification and Phase 5 final hotfix suites. The budget, wallet rename and loan logging suites also passed. |
| Build and deployment | Development build succeeded. All 16 build/worker checks passed, including reproducible production packaging. The 11-file development artifact excludes the lab, report and evidence. |

The changes use existing application entry points. Financial calculations, account-specific persistence, synchronization, auth/recovery, rendering safeguards, CSP, worker restrictions and build configuration retain their existing implementations. This phase used isolated local fixtures and no live Supabase accounts. Physical touch and pen, Safari, Firefox and device-level GPU performance remain unverified. The work is local to the test branch working tree.

## Phase 4C.2 and 4C.3 handoff

- **Desktop, Phase 4C.2.** Implement the compact resting sidebar with hover expansion as an overlay. Preserve main-content bounds during expansion. Provide keyboard and click alternatives, one consistent active-navigation treatment, appropriate three-column financial KPI groups, consistent content widths and spacing.
- **Mobile, Phase 4C.3.** Preserve dedicated phone navigation and layout, comfortable touch targets, readable financial density and natural press feedback.
- **Content across both phases.** Review duplicate page/navigation headings and redundant currency labels. Standardize financial terms and action wording while keeping context needed to interpret amounts.
- **Owner review.** Review the frosted surfaces alongside branded cards, the normal-speed rectangular and circular laps, and the prominence of the summary sheen. Adjust the shared tokens if requested before proceeding with layout work.
