# Phase 4C.3 — Application design integration

Integrated on `test` from approved baseline `089efeea969063ed3c70f5936b891352cb4f9d4d`. Visual evidence uses synthetic records in a local production-context build.

## Implementation

| Application files | Approved source and integration |
| --- | --- |
| `css/style.css`, `index.html`, `manifest.json` | `lab.css` supplies the #09090B workspace, #0D0D10 navigation, desktop and mobile graphite surfaces, and localized luminous glass. Dashboard Net Savings is the signature surface. `identity.css` and the original application supply the regional and wallet recipes. Login uses the joined two-pane composition and compact stacked mobile form, with the existing authentication controls. |
| `css/style.css`, `index.html`, `js/app.js`, `js/charts.js` | `typography.css` supplies T3. Playfair Display serves page, brand and editorial headings and prominent financial figures. Geist serves controls, labels, functional headings, supporting amounts, ledgers and charts. Serif figures use native lining proportional numerals. Ledger amounts use Geist tabular numerals. The app keeps its existing root size and translates the lab’s 14px rem values. Chart.js updates existing application charts once when Geist becomes available. |
| `css/style.css`, `index.html`, `js/app.js`, `js/startup.js` | `lab.css` and `lab.js` supply the primary bronze and secondary silver stroke-to-fill treatments, the 900ms opt-in SVG perimeter lap, and B1’s 105ms desktop dwell, 790ms sweep, 56% opacity and 19% radius. Budget cards retain their stable matte surface. One delegated handler set serves dynamically rendered cards. Summary sheen remains visibility-gated and individual 3.5px streaks are static. |
| `typefaces/`, `scripts/build.mjs`, `scripts/test-deployment.mjs`, `scratch/test_wallets_pass5.js`, `scratch/test_budgets_pass4.js` | Exact lab WOFF2 binaries and OFL notices, font allowlist and packaging assertions, plus wallet and budget assertions for the approved type roles, shared page heading, and shrinkable three-column grid. |

The Dashboard keeps its country balances, monthly cash flow, categories, chart and activity. Transactions retains Geist rows and filters. Budgets uses the summary and quieter T3 category amounts. Wallets uses serif card balances over the existing themes and a single page title. Analytics uses matte chart panels and Geist canvas text. Reports uses an editorial snapshot heading and serif summary amounts. Settings, History, forms, sheets and notifications share the neutral surface and control palette. Settings and forms retain Geist. PDF rendering keeps its previous system font stack and existing composition.

The mobile FAB now occupies its own safe-area-aware row below the scrolling workspace. Its existing speed dial and press interaction are available without covering the budget status labels. The desktop rail clips a 230px overlay to 64px at rest, animates for 240ms with the approved easing, and preserves the workspace and icon coordinates. Chromium measured identical workspace geometry before and after expansion on all eight views at 1024, 1440 and 1920px. Hover over the open bounds, pointer-leave collapse, the keyboard toggle, Escape and the mobile drawer passed.

The stylesheet consolidates the former SF Pro declarations, warm workspace treatment, old budget hover inversion, and superseded type overrides. Source size moved from 337,481 to 338,727 bytes across 27 fewer lines. The total `!important` count fell from 816 to 768. The 54 existing regional, wallet and login illustration material rules retain their background, border and shadow declarations. Chromium rendered all 15 wallet theme gradients with the same Playfair balance role.

## Font packaging and native glyphs

| Face | Exact source and binary version | Packaged file |
| --- | --- | --- |
| Geist | Vercel v1.8.1, font version 1.800 | `geist-variable-2ffebe993e969069a978.woff2` |
| Playfair Display | Google Fonts upright variable source at `1e1aa08e994ff7db50116e86ccc7b52a4e4ae5b8`, font version 1.203 | `playfair-display-variable-c1b9d34c126239b67bb3.woff2` |

The exact source and conversion are recorded in the [typography lab report](PHASE_4C_2T_TYPOGRAPHY_LAB_REPORT.md). The two WOFF2 files total 182,052 bytes. Deployment rewrites CSS and preload URLs to the fingerprinted files, includes both notices in the license bundle, and precaches both with the immutable static assets. The build keeps `font-src 'self'`. The Playfair face has no `unicode-range` restriction.

FontTools found 659 Playfair mappings, including U+20B9 → `uni20B9`, U+00A5 → `yen`, U+20AC → `Euro`, and U+2212 → `minus`. Chromium DevTools `CSS.getPlatformFontsForNode` reported the custom face `PlayfairDisplay-Regular` for every glyph in the following figures.

| Figure | Playfair glyphs |
| --- | ---: |
| ¥350,000 | 8 / 8 |
| ₹85,000 | 7 / 7 |
| €12,450 | 7 / 7 |
| ₹12,34,567.89 | 13 / 13 |
| −₹25,000 | 8 / 8 |

The real Japan, India and Germany balance nodes, both login illustrations, wallet balances and dashboard donut center used native Playfair glyphs. Chromium reported Geist for the ledger.

## Rendered verification

Chromium 157 rendered the fingerprinted production app under its generated CSP. Dashboard and Login were compared with the approved lab first. The eight application views then passed the horizontal overflow check at 390, 767, 768, 769, 1024, 1440 and 1920px at default text size. The figures, category and wallet labels, leading and variable weights match the approved T3 role values at 390 and 1440px, with desktop regional balances and KPIs measuring 38.73px and 26.21px. The 15px Chromium scrollbar accounts for the 0.18px and 0.10px differences from the lab’s fluid reference sizes.

| Width | Dashboard overall budget to first and last category cards in JP, IN and DE |
| --- | --- |
| 390, 767, 768, 769, 1024 and 1920px | 0px on both edges |
| 1440px | 0px on the left and 0.016px on the right |

The alignment checks used expanded sections, and the collapse and reopen path rechecked the measured rows. At 390px, −₹25,000.50 stayed on one line. At 320px and 200% root text size, exceptional amounts, the long category label, and the login layout reflowed within the viewport. The browser also verified the bronze fill, single rim lap, B1 dwell and playback, rapid crossing, touch activation, scroll cancellation, reduced motion and privacy masking. A cold login at 180ms latency and 100 KiB/s requested exactly the two same-origin fonts and recorded a cumulative layout shift of 0 in that run.

## Functional and build verification

- **Packaged build.** All 16 deployment checks passed, covering environment selection, reproducibility, allowed assets, font fingerprints and notices, CSP, exclusion of developer files, and service-worker cache installation, update cleanup and request scope. Chromium confirmed both fonts in the active static cache with zero CSP violations or unhandled exceptions.
- **Local Chromium with synthetic data.** Verified transaction creation, edits and deletion, domestic transfer and wallet balance reconciliation, wallet creation, theme changes, renaming and deletion, budget creation and edits, ledger search and its empty state, regional switching, locale formatting, concealment and chart tooltips. Existing budget and wallet verification scripts passed.
- **Mocked services.** Exercised the sign-in busy and registration states, password visibility, recovery request, recovery URL, reset response, two account-scoped ledgers and logout cleanup. Live Supabase authentication, synchronization and RLS were outside this run. Browser emulation covered touch and responsive layouts. Physical devices, Safari and Firefox remain unverified.
- **PDF smoke check.** The existing monthly report generated a local Chromium PDF with full amounts in the print target while the interface remained concealed. Print cleanup preserved the concealment state. PDF composition and pagination remain for owner review in the next phase.

## Evidence

| View | Desktop | Mobile |
| --- | --- | --- |
| Login | [Desktop](phase4c3-evidence/login-desktop.webp) | [Mobile](phase4c3-evidence/login-mobile.webp) |
| Dashboard | [Desktop](phase4c3-evidence/home-desktop.webp) | [Mobile](phase4c3-evidence/home-mobile.webp) |
| Transactions | [Desktop](phase4c3-evidence/transactions-desktop.webp) | [Mobile](phase4c3-evidence/transactions-mobile.webp) |
| Budgets | [Desktop](phase4c3-evidence/budgets-desktop.webp) | [Mobile](phase4c3-evidence/budgets-mobile.webp) |
| Wallets | [Desktop](phase4c3-evidence/wallets-desktop.webp) | [Mobile](phase4c3-evidence/wallets-mobile.webp) |
| Analytics | [Desktop](phase4c3-evidence/analytics-desktop.webp) | |
| Reports | [Desktop](phase4c3-evidence/reports-desktop.webp) | |
| Settings | [Desktop](phase4c3-evidence/settings-desktop.webp) | |
| History | [Desktop empty state](phase4c3-evidence/history-desktop.webp) | |

[Recording of primary glimmer, sidebar expansion and B1 budget reflection](phase4c3-evidence/approved-interactions.mp4)

**APPROVED VISUAL AND T3 TYPOGRAPHY SYSTEM INTEGRATED ACROSS APPLICATION — AWAITING OWNER ACCEPTANCE**
