# Expense Manager Phase 4C.0A frontend cleanup

## Baseline and scope

The starting branch was `test` at `926f79ba9aea44c8aa7afc3dfe61661a29ce7ff2` (`4a.1`). The working tree already contained a change in `skills-lock.json`, which was preserved. The application serves one HTML entry point, one stylesheet and eight classic scripts. It loads Lucide, Supabase JS and Chart.js externally. The manifest uses one tracked SVG icon (3,064 bytes). The checkout contains no bundled font files.

Both test copies were built outside the repository with Netlify's `branch-deploy` / `test` settings. Chrome confirmed the development project `nyetklojxqnawdtrrhma` at runtime. All browser requests to Supabase were blocked and the functional tests used disposable synthetic state in a fresh profile.

## Implemented improvements

| Source | Confirmed debt and implementation | Verification |
|---|---|---|
| [Stylesheet](../css/style.css) | Kept the single-request stylesheet and consolidated transaction icons, ledger date groups, wallet accordion headers and the budget edit button at their effective definitions. Shared the cushion styling between its two selectors and kept the responsive font size. Removed retired authentication and wallet selectors after checking HTML, generated templates and class manipulation. | Removed all 37 exact repeats of a selector and declaration in the same context from the source audit. Computed layout and screenshots were compared at six widths. This preserves the existing order of responsive and print rule groups. |
| [HTML](../index.html) and [application UI](../js/app.js) | Removed three permanently hidden Dashboard containers, their generated wallet rows, their click listeners and their CSS. Country cards still calculate totals and counts from the existing wallets and open the visible wallet workflows. | The synthetic Dashboard had 44 fewer elements. Wallet cards, balances, country navigation and concealment passed the browser checks. |
| [Application UI](../js/app.js) | Bound the static navigation controls once. Removed duplicate summary, chart and wallet rendering from `renderAll()` and the extra refresh after updating a wallet balance. | After two reinitializations, Chrome counted one navigation click listener where the baseline had three. Each measured Dashboard summary, Dashboard chart and wallet-page refresh invoked its renderer once where the baseline invoked it twice. |
| [Authentication CSS](../css/style.css) | Removed the reference to an absent login background image. The existing black background was already the visible fallback. | Removed one observed startup HTTP 404. All six login screenshot pairs were pixel-identical. |

No design tokens were merged solely because they shared a value. Privacy, print, modal visibility and reduced-motion overrides were retained where their priority defines behavior. The desktop budget glimmer remained active in the probe, and the existing mobile and reduced-motion rules were preserved.

## Source and asset measurements

The source audit tokenized comments, quoted strings and CSS delimiters before counting declarations. Style-rule counts exclude at-rule containers and keyframe steps. Backdrop totals include prefixed and unprefixed declarations. Compression uses gzip level 9 and Brotli quality 11.

| Metric | Before | After | Change |
|---|---:|---:|---:|
| CSS, raw bytes | 345,351 | 341,638 | −3,713 |
| CSS, gzip bytes | 50,049 | 49,788 | −261 |
| CSS, Brotli bytes | 38,288 | 38,126 | −162 |
| CSS lines | 15,048 | 14,853 | −195 |
| Style rules | 1,928 | 1,901 | −27 |
| CSS declarations | 8,148 | 8,027 | −121 |
| Unique / repeated selector strings | 1,845 / 327 | 1,828 / 319 | −17 / −8 |
| Exact repeat declarations across rules with the same selector and context | 37 | 0 | −37 |
| Exact repeats within a single declaration block | 0 | 0 | 0 |
| `!important` declarations | 889 | 872 | −17 |
| Media queries / keyframe definitions | 66 / 8 | 66 / 8 | 0 |
| Backdrop-filter / box-shadow / filter declarations | 82 / 173 / 8 | 82 / 172 / 8 | 0 / −1 / 0 |
| HTML, bytes | 281,178 | 280,826 | −352 |
| JavaScript, bytes across all ten source files | 938,905 | 936,749 | −2,156 |
| JavaScript loaded by HTML, bytes across eight files | 938,171 | 936,015 | −2,156 |
| Median same-origin resource body bytes on login | 1,287,476 | 1,281,147 | −6,329 |

The individual JavaScript source sizes were `app.js` 530,638 → 528,482 bytes, `storage.js` 198,633, `onboarding.js` 78,955, `wallet.js` 58,314, `charts.js` 33,616, `supabaseClient.js` 24,675, `country-config.js` 12,970 and the active, development and production config files 370, 370 and 364 bytes respectively. Resource body counts exclude the main HTML document and CDN resources. They include the local server's response body for the removed image request.

## Chrome performance

Chrome 157 on Linux ran with GPU acceleration disabled in headless mode. Values are medians of three desktop initial loads with HTTP cache disabled, or three warm repeat journeys each at 1440 × 900 and 390 × 844. The repeat journey visited the seven main views and opened and closed the transaction modal. View and modal samples include two animation frames after the action. The page remained connected to the real CDN libraries during measurement.

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Login load event | 394.7 ms | 306.6 ms | −88.1 ms |
| Login first contentful paint | 396 ms | 280 ms | −116 ms |
| Stylesheet request | 5.9 ms | 6.8 ms | +0.9 ms |
| Stylesheet parsing trace | 1.73 ms | 1.92 ms | +0.19 ms |
| Main-thread JavaScript compile trace during load | 0.38 ms | 0.35 ms | −0.03 ms |
| Main-thread JavaScript evaluation trace during load | 17.63 ms | 19.35 ms | +1.72 ms |
| DOM elements, 1440px login / Dashboard | 2,539 / 4,105 | 2,536 / 4,061 | −3 / −44 |
| Dashboard navigation, desktop / mobile | 48.8 / 50.2 ms | 47.8 / 47.6 ms | −1.0 / −2.6 ms |
| Analytics navigation, desktop / mobile | 56.6 / 49.3 ms | 56.8 / 50.6 ms | +0.2 / +1.3 ms |
| Modal open, desktop / mobile | 33.6 / 33.5 ms | 31.7 / 33.8 ms | −1.9 / +0.3 ms |
| Modal close, desktop / mobile | 82.6 / 33.5 ms | 81.8 / 34.3 ms | −0.8 / +0.8 ms |
| Style recalculation per journey, desktop / mobile | 46.40 / 50.35 ms | 47.88 / 48.70 ms | +1.48 / −1.65 ms |
| Layout per journey, desktop / mobile | 22.39 / 23.96 ms | 22.78 / 22.41 ms | +0.39 / −1.55 ms |
| Paint events per journey, desktop / mobile | 11.54 / 11.73 ms | 11.92 / 13.86 ms | +0.38 / +2.13 ms |
| Main-thread compositor commits per journey, desktop / mobile | 6.78 / 5.30 ms | 6.46 / 4.64 ms | −0.32 / −0.66 ms |
| Layout-shift trace score per journey, desktop / mobile | 0.0007 / 0 | 0.0007 / 0 | 0 |
| Long tasks during measured loads and journeys | 0 | 0 | 0 |
| Visible elements with backdrop blur in the post-journey probe | 23 | 23 | 0 |
| Physical GPU rendering and Lighthouse score | NOT MEASURED | NOT MEASURED | — |

Load timing varied with the external scripts. Individual load times ranged from 295.8 to 464.2 ms before and 301.6 to 482.9 ms after. The repeat traces also moved in both directions. Fewer renders, DOM elements and local resource bytes are confirmed. These timing samples do not establish an overall speedup.

## Visual verification

Compared 72 pairs at widths of 1440, 1024, 768, 390, 375 and 320px. The paired pass held fixture dates fixed, disabled Chart.js animations for screenshots, and used reduced motion for the signed-in captures. Coverage included login, Dashboard, Transactions, Analytics, Budgets, Wallets, Reports, Settings, the loan tracker, loan-payment and transaction dialogs, and the concealed Dashboard.

63 pairs were pixel-identical. The other nine showed edge scrollbar position differences or very small pixel-level variation in the header and navigation. No material layout, wallet card or privacy difference was observed. There was no horizontal document overflow in the 42 main-view and width combinations. The profiling pass used normal motion and also captured each view. The screenshots and traces are in `/tmp/expense-4c0a.7gomkX/`.

## Regression verification

| Suite | Passed | Failed | Skipped or incomplete |
|---|---:|---:|---|
| Headless Chrome functional scenarios | 58 | 0 | 0 |
| Five standard Node suites | 374 | 0 | 0 |
| Wallet rename, budgets and four loan suites (reported checks) | 37 | 0 | 0 |
| Supplemental synthetic release-candidate assertions | 49 | 0 | 1 production-data fixture section |
| Isolated Netlify build matrix | 14 | 0 | 0 |
| Historical Wallets Pass 5 static assertions | 76 | 2 | 0 |

The two historical static failures look for older class combinations on Japan and India KPI totals. The baseline and edited build produced identical output for all 78 assertions in that suite. The Chrome tests confirmed wallet total concealment for all three currencies. Two older budget and edge-case diagnostic scripts emitted their results but remained open and were stopped. Those diagnostics have no pass/fail totals.

The browser covered synthetic login and logout UI, account switching, loan modal cleanup, transaction creation/edit/delete, transfers and remittances, balances, budgets, analytics and date filtering, closing and history, exports, report preparation and recovery. Authenticated Supabase, physical devices, native PDF dialogs and installed PWA operation were outside the observed test results. The browser used a print spy and simulated account and sync boundaries.

## Remaining technical debt

- **Security and deployment hardening** — P2 for the confirmed rendering defect. Dashboard recent activity still interpolates notes into HTML in [`renderTransactions()`](../js/app.js#L3689). An inert marker confirmed that a note can create a DOM element on both builds. Executable behavior and cross-account impact are unverified. Netlify also publishes the repository root under the current [build configuration](../netlify.toml#L5).
- **Redesign** — Broader token and breakpoint consolidation is deferred. The current breakpoints overlap intentionally in places and the shared layout rules still depend on source order. The active blurs and wallet effects were retained because an equivalent visual replacement and physical-device rendering gain were not established.
- **Assets and PWA** — Optional CSS font sources remain available to local installations. Review redistribution rights before bundling any fonts. Startup unregisters service workers, and the dormant [precache manifest](../sw.js#L15) still lists unavailable image and font files. Both builds showed no active worker. Its registration and caching strategy require separate verification.

## Changed files and readiness

- Modified `css/style.css`, `index.html` and `js/app.js`.
- Added this report. No files were deleted.
- The pre-existing `skills-lock.json` change was preserved.

JavaScript and worker syntax checks, Bash syntax and `git diff --check` passed. The complete implementation diff was reviewed. No commit, push, merge or deployment was performed.

**PARTIAL PASS — Cleanup complete, but verification limitations remain**
