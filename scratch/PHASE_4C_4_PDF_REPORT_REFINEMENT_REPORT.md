# Phase 4C.4 PDF report refinement

Historical reference `86788206e30ab7ebb97c86276c9c5bc8cbdd3875` (first commit) and implementation baseline `7b0fca3` (sidebar polish) on `test`. The historical Git checkout was rendered locally with synthetic Japan and India data in an isolated Chromium session.

## Implementation

- The monthly settings export, Reports snapshot, and custom date-range export use the same browser-print renderer in [print-report.js](../js/print-report.js). It restores the monthly heading and count, period-specific country balance cards, regional donuts and legends, overall and two-column category budget cards, and a date-grouped transaction ledger.
- A4 portrait uses a neutral `#09090B` background, the existing country gradients, thin static budget indicators, and a running Chromium page footer. Playfair Display uses lining proportional numerals for editorial headings and prominent amounts. Geist uses lining tabular numerals for comparison figures, budgets, legends, and ledger rows.
- Donuts use vector arcs with the same color palette and vertical gradient stops as the site's analytics charts. Every positive spending category has a matching textual legend entry. Zero-expense regions show an empty state. For unusual legacy ledgers with negative category totals, the chart identifies positive spending and expenditure includes the adjustment.
- Cards, chart blocks, category rows, and individual transactions stay together where they fit. A date heading stays with the first transaction, and larger groups flow across pages. Each included month begins on a new page. After inspecting the first renders, the chart and legend were tightened to fit six entries alongside the ring, the card spacing was reduced, and unusually large donut values were refitted. The multi-region and long samples each saved a page. The owner review added vertical padding to the balance, chart, overall budget, and category cards and set the main serif amounts to 21 pt for balances, 16 pt for overall budgets, 12.75 pt for categories, and 13.5 pt for donut totals. The five re-rendered samples kept their page counts.
- The continuous ledger supplies dated transactions and monthly scope. Expenses, income, transfers, and remittances retain their own semantics. Spending and income are tallied in separate region and currency buckets. Monthly budgets use active allocations and carryover or stored historical values. Available historical category definitions and wallet names take precedence over current names.
- Current balances use live wallet values. Historical cards use stored period snapshots when available. Budget recovery copies live wallets into historical records, so those cards show **Balance unavailable**. A legacy transaction with an identifiable month and an invalid day appears under **Unknown date**. Custom statements keep their selected dates, region, wallet, and category. They show expenditure without assigning a monthly budget or wallet balance to a partial period.
- Print preparation awaits the local font faces. Charts and flags are inline vectors. The print markup is transient, with cleanup on browser print completion or cancellation and invalidation on account change or logout. Export uses formatter-level access to exact amounts and preserves on-screen concealment.

## Synthetic PDFs

| Sample | Pages | Evidence |
| --- | ---: | --- |
| [01-monthly-japan.pdf](pdf-report-evidence/01-monthly-japan.pdf) | 2 | ¥1,026,000 balance, ¥85,442 expenditure, six legend entries, and 11 transactions including a domestic transfer and a remittance |
| [02-multi-region.pdf](pdf-report-evidence/02-multi-region.pdf) | 4 | Japan, India, and Germany, each with a balance, donut, budget, and local number formatting |
| [03-multi-month.pdf](pdf-report-evidence/03-multi-month.pdf) | 6 | October ¥123,456 historical balance and ¥44,500 available budget, including ¥2,500 carryover, followed by November's current data |
| [04-long-statement.pdf](pdf-report-evidence/04-long-statement.pdf) | 10 | 153 complete records, 32 spending categories, a ¥1,290,123,405,678 transaction, over-budget states, and a long note containing literal HTML-like text |
| [05-custom-date-range.pdf](pdf-report-evidence/05-custom-date-range.pdf) | 1 | Two matching Japan expenses on the inclusive date boundaries, totaling ¥32,410 |

## Verification

- Generated all five PDFs through the application's real export entry points with Chromium DevTools Protocol. `pdfinfo` reported tagged A4 portrait pages at 594.96 × 841.92 points. `pdffonts` found embedded Unicode-mapped subsets of Geist and Playfair Display in every PDF. `pdftotext` confirmed selectable report text, native ¥, ₹, and € glyphs, Indian digit grouping, German decimals, complete amounts, and page footers. Page rasters confirmed the dark background to the paper edge and were inspected for chart geometry, legibility, page breaks, and blank pages. Bounds checks passed on all 23 pages. The 390px browser viewport produced the same Japan PDF layout and text as desktop.
- Browser assertions covered one-country snapshots for JP, IN, and DE, a multi-region month, date-range and category/account exclusions, missing balances, no expense and no allocation states, historical categories, HTML escaping, and financial state equality before and after export. Synthetic account switching and logout invalidated queued output. Repeated requests and print/cancel events cleaned up correctly while on-screen amounts stayed concealed.
- Production-context packaging loaded the bundled runtime and both font assets under the local production CSP. All 16 deployment checks passed, including exclusion of scratch files and evidence. The wallet and budget redesign suites and the adversarial financial integrity suite passed. The older financial-engine suite stopped at a transfer-label assertion that also fails on the baseline. The release-candidate suite stopped because its fixture was absent from its hardcoded path.
- Rendering was verified in Chromium. Native system print dialogs, Firefox, Safari, physical printers, and live Supabase were outside this verification. Browser settings and engines can differ in background printing and support for the running page footer.

**PDF REPORT RESTORATION AND EDITORIAL DESIGN COMPLETE — AWAITING OWNER ACCEPTANCE**
