# Phase 4C.3-R1 application integration corrections

The work is on `test` from `e6f74c23528796a399e3128d1637d019ef617ac4`. The login geometry comes from `089efeea969063ed3c70f5936b891352cb4f9d4d`. Chromium rendered those versions and the approved typography lab before implementation. The app, lab, and previous integration evidence supplied the visual references. The mobile scope follows the owner’s decisions on the login, text layout, and standalone action button.

## Application corrections

**Login.** The integration hid the divider and card details, replaced the existing card overlap with a compact grid, and removed the authentication card’s surface. Removing the joined-pane rules restored the original proportions, card details, and independent form. The 460px form card grows with its content and keeps its top position when messages appear. The phone layout shows a small centered Playfair title and tagline above the form. The reset screen uses the same compact branding.

| Geometry at 1440 × 970 CSS px | Original | Phase 4C.3 | Corrected |
| --- | ---: | ---: | ---: |
| Outer composition width | 1280 | 1090 | 1280 |
| Brand-pane width | 703.56 | 544 | 703.56 |
| Each wallet card, width × height | 388 × 220 | 261.33 × 109 | 388 × 220 |
| Second card offset, inline × block | 162 × 30 | 130.66 × 78 | 162 × 30 |
| Divider, width × height | 2 × 560 | Hidden | 2 × 560 |
| Sign-in card, width × height | 460 × 434.86 | 450 × 318.72 | 460 × 426.72 |
| Sign-in card top | 267.56 | 325.63 | 267.50 |

**Dashboard.** The category wrapper originally applied a 16px inline inset from 768px upward, so the budget card and category grid aligned while the country and KPI rows extended out on both sides. The financial column now supplies the shared inset. At 1440px, the four groups measure left/right edges of 108/1007, 108/1007, 108/1007 and 108/1006.98 CSS px. The maximum edge spread was 0.016px across all 42 JP, IN and DE measurements at 390, 767, 768, 769, 1024, 1440 and 1920px with the rail or drawer closed and open. [Full edge measurements](phase4c3-r1-evidence/alignment.json)

All three KPIs have identical matte-glass backgrounds, borders, shadows, padding and radii. Their labels use the existing `--text-primary` token. The amount colors retain their income, outflow and net semantics. At 1440px the regional balance, KPI, overall budget and category amounts render at approximately 33.2, 21.8, 26.2 and 18.9px respectively. Playfair stays on the page title, regional editorial headings, and prominent amounts, including wallet balances and the donut total. Geist leads functional headings, currency and account labels, supporting limits, percentages, and activity rows. The Balances, Overall budget, Expense breakdown and Recent activity headings have more weight. Long amounts are measured against available card width and shrink only on overflow. At 430px the multi-column KPI layout fitted a full India-format amount. At 390px the KPI cards stack.

**Loan Tracker.** Outstanding principal is the standalone Playfair figure. The widget has one outstanding figure, backed by the existing remaining-principal value. Total Loan, Monthly EMI, Amount Paid, Principal Paid, Total Interest, progress, tenure, and payment timing use Geist with tabular numbers where values repeat or align. The existing controls and calculation paths are used.

**Reports.** The date-bearing editorial role previously inherited the default numeral setting. It now requests lining proportional numerals. Chromium DevTools reported native Playfair Display for all 26 glyphs in `2026-11 Financial Snapshot`. The period format and title size were retained.

**Settings.** Smooth `scrollIntoView()` could scroll the workspace as well as the tab strip. The active border and font-weight change also affected tab dimensions while `transition: all` animated them. Tabs now reserve their border and use one weight. Only color and background treatments transition. Panel replacement is immediate. A hidden selected tab is revealed by changing the strip’s horizontal scroll position. Nine successive selections across panels of different heights held the tab coordinates and header position at 390px. Keyboard selection also passed.

## Synchronization

Settings → About shows the full status, pending changes when offline, and the last genuinely confirmed timestamp. The sidebar uses the same storage-derived status and is the only persistent indicator. The header and account-popover duplicates were removed. The desktop rail shows the icon, and the expanded rail and phone drawer also show the text. Its button supports retry and conflict review.

The renderer uses the active account’s engine state, confirmed revision, financial and persisted fingerprints, and confirmation timestamp. A saved timestamp can be displayed while the current session checks the cloud. A new session starts at Checking sync and earns confirmation when the engine verifies the current state. Logout and account changes clear the outgoing account’s visible metadata. In-flight completion and error paths check account identity. Manual retry uses the existing serialized queue and makes a real push attempt even when an earlier confirmation matches. The existing cloud request format, CAS conditions, and conflict options are reused.

| Engine signal | Sidebar | Chromium with mocked network |
| --- | --- | --- |
| `IDLE` | Checking sync | First load, reopening with saved metadata, logout, and account switch |
| `LOCAL_SAVED`, `LOCAL_ONLY` | Saved locally | Successful local commit with no authenticated session |
| `SYNC_PENDING`, `SYNCING` | Sync pending, Syncing | Serialized overlapping revisions and in-flight request |
| `CONFIRMED`, `SYNCED` | Cloud synced | Checked pull, acknowledged uploads, retry, and conflict resolution |
| Offline | Offline | With and without waiting changes. Settings kept the real confirmation time |
| `FAILED`, `SYNC_FAILED` | Sync failed | Request failure, then native keyboard activation of Retry and successful acknowledgement |
| `CONFLICT`, `CONFLICT_DETECTED` | Sync conflict | Divergent revisions, drawer action, and explicit adoption of the cloud version |

One mock acknowledged an upload while a newer transaction edit was queued. Neither UI displayed Cloud synced before the newer state was acknowledged.

## Mobile audit and regression checks

Chromium rendered Dashboard, Transactions, Budgets, Wallets, Analytics, Reports, Settings, and History with synthetic records at 320, 360, 390, 430 and 820px. The text-focused pass corrected clipped region controls on Budgets, Analytics and Reports, wrapped ledger descriptions and kept signs with subtotals, and adjusted wallet headings, dashboard legends, and mobile KPI text. Login and reset, the Loan Tracker, the Settings strip, the quick-action menu and the transaction sheet were also inspected. The action button is centered in the viewport above the safe area, with end-of-scroll space to reach the final item above it.

- The production-context bundle built locally. All 16 deployment checks passed, covering the CSP, asset boundaries, fingerprinting, and service-worker behavior. Both self-hosted fonts loaded and were present in the active static cache in Chromium.
- The existing budget and wallet verification scripts passed. Two wallet assertions were updated to recognize line breaks between markup attributes. A real browser smoke test exercised expense creation, edit and deletion through the engine, reconciled the wallet balance, and verified the ledger updated. Privacy masking and mocked registration, recovery email, and password reset passed.
- The design skill’s generic site gate reported 27 open findings. These cover its marketing-page and layout-template rules, existing SPA placeholder links, labels on hidden wallet and quick-edit forms, and the sidebar’s icon-based focus treatment. Its mobile password-toggle target finding cleared after the touch target was increased to 44px. The app-specific rendered checks above supplied the acceptance measurements.
- The legacy Phase 5 hotfix suite stopped at A8, first submission completion. The same assertion failed in a clean copy of the baseline. The Chromium expense and reconciliation checks above passed.
- Browser emulation covered touch and viewport behavior. Physical mobile devices, Safari, Firefox, live Supabase authentication, live synchronization, and RLS remain unverified. The test and verification workflow used the available browser harness and `verification-before-completion`. The named `frontend-testing-debugging` skill was unavailable in the installed skill paths.

**Modified files:** `css/style.css`, `index.html`, `js/app.js`, `js/startup.js`, `js/storage.js`, `js/supabaseClient.js`, `scratch/test_wallets_pass5.js`, this report, and its evidence.

## Visual evidence

- [Restored desktop login](phase4c3-r1-evidence/login-desktop.webp)
- [Desktop dashboard](phase4c3-r1-evidence/dashboard-desktop.webp) and [mobile dashboard](phase4c3-r1-evidence/dashboard-390.webp)
- [Stacked mobile KPIs](phase4c3-r1-evidence/dashboard-kpis-mobile.webp) and [representative mobile views](phase4c3-r1-evidence/mobile-views.webp)
- [Loan Tracker and Reports type](phase4c3-r1-evidence/loan-and-reports.webp)
- [Settings tab switching](phase4c3-r1-evidence/settings-tabs.mp4)
- [Sidebar and About sync states](phase4c3-r1-evidence/sync-status.webp) and [mobile drawer conflict action](phase4c3-r1-evidence/sync-mobile-drawer.webp)

**APPLICATION INTEGRATION CORRECTIONS COMPLETE — AWAITING OWNER ACCEPTANCE**
