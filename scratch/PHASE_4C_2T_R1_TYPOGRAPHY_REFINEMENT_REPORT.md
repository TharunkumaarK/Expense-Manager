# Phase 4C.2T-R1 — Optical typography and hierarchy

Baseline `f0dc67eb2c0ca81c9b05c28940d92db83549e5a1` on `test`.

## Rendered T2 audit before implementation

- On desktop, the two regional balances established the intended first focal point. The 29.18px, 575-weight KPI and donut amounts then drew nearly equal attention across different sections.
- Balances, Japan spending, Overall budget, Expense breakdown and Recent activity all used the same 21.28px, 550-weight serif. This made the main spending section harder to distinguish from its own card heading and the supporting column.
- The overall budget spend and all nine category amounts had the same size, weight and leading at both widths. The repeated category figures dominated the grid, and the adjacent Geist limits looked vertically centered against the serif figures instead of sharing a baseline.
- The mobile figures fit the sample, but three tight KPI columns had little room for a sign and longer grouping. Existing emergency wrapping allowed a split inside a number once the run exceeded the column.
- The login pairing read clearly. The Welcome title and the Geist introduction could ease back in weight without changing the card composition, form, or Sign In treatment.

## Optical refinement

T3 keeps Playfair Display on the brand, page titles, Japan spending and equivalent regional headings, Welcome, the illustrative accounts, and each prominent monetary role. Geist now sets Balances, Overall budget, Expense breakdown, Recent activity and other functional headings. Geist also carries category and wallet labels, limits, percentages, chart metadata, the ledger, navigation, and form controls.

Better-typography informed the real variable weights, natural kerning, role-specific leading and baseline-aligned number and limit pairs. Web-typography and visual-design-foundations informed the structural separation between headings, aggregates and repeated details. The typefaces have close cap proportions, while Geist has a slightly higher x-height and more even strokes. Its 16.52px panel headings read clearly beside 21.28px editorial headings. Frontend-design and design-taste-frontend informed the review at full viewport size and the decision to preserve card edges and retain a single financial focal hierarchy. Frontend-testing-debugging informed the Chromium comparison and platform-font checks.

The table records rendered sizes at 1440px and 390px. Each measurement is **desktop/mobile size in px · variable weight · unitless leading · tracking in em**. Normal means native spacing.

| Role | T2 | T3 |
| --- | --- | --- |
| Main page title | Playfair 28.70/21.70 · 550 · 1.18 · −.012 | Playfair 28.70/21.70 · 500 · 1.18 · −.008 |
| Major spending heading | Playfair 21.28/18.62 · 550 · 1.22 · −.012 | Playfair 21.28/18.62 · 500 · 1.22 · normal |
| Functional panel heading | Playfair 21.28/18.62 · 550 · 1.22 · −.012 | Geist 16.52/15.40 · 550 · 1.30 · normal |
| Regional balance | Playfair 40.92/27.65 · 575 · 1.15 · −.006 | Playfair 38.91/27.44 · 500 · 1.14 · −.006 |
| Three KPI amounts | Playfair 29.18/18.81 · 575 · 1.15 · −.006 | Playfair 26.31/18.34 · 475 · 1.14 · normal / −.008 |
| Overall budget amount | Playfair 20.72/17.92 · 575 · 1.15 · −.006 | Playfair 25.20/21.98 · 500 · 1.14 · normal |
| Category budget amount | Playfair 20.72/17.92 · 575 · 1.15 · −.006 | Playfair 19.60/18.34 · 440 · 1.18 · normal |
| Wallet balance | Playfair 27.30/23.52 · 575 · 1.15 · −.006 | Playfair 27.30/23.52 · 500 · 1.14 · normal |
| Donut center | Playfair 29.18/18.81 · 575 · 1.15 · −.006 | Playfair 24.92/20.16 · 475 · 1.14 · normal |
| Category and wallet labels | Geist 14.00/13.16 · 550 · 1.35 · normal | Same |
| Ledger amount | Geist 14.00/14.00 · 500 · 1.30 · normal | Same |
| Login brand | Playfair 46.20/31.92 · 550 · 1.13 · −.012 | Playfair 46.20/31.92 · 525 · 1.13 · −.008 |
| Login Welcome | Playfair 28.70/26.88 · 550 · 1.18 · −.012 | Playfair 28.70/26.88 · 500 · 1.18 · −.008 |
| Login introduction | Geist 19.88/19.88 · 500 · 1.42 · −.010 | Geist 19.88/19.88 · 450 · 1.50 · normal |
| Illustrated account balance | Playfair 29.68 · 575 · 1.15 · −.006 | Playfair 28.00 · 500 · 1.14 · −.006 |

The overall budget now leads its category figures by 5.60px on desktop and 3.64px on mobile. Geist limits share a baseline with spend and can move as a unit to the next line. Mobile KPI padding uses 2px less per side inside the same grid, keeping the signed decimal test on one line at 390px. The Playfair displays retain native proportional lining figures. Geist carries tabular ledger and supporting figures. The Playfair face exposes no tabular figure feature.

## Verification

Rendered both treatments at 390, 768, 1024, 1440 and 1920px in Chromium. Displayed financial strings matched across the treatments. Japan, India and Germany kept their budget summary and category grid aligned within 0.5px and retained their 3.5px tracks. All standard dashboard amounts were single-line. Stress strings including `¥12,345,678`, `€12,450.52`, `−₹25,000.50`, and `₹12,34,56,78,901.23` stayed complete. A long Indian-grouped decimal in the donut wraps within its narrow center when necessary. Privacy masking and reveal restored the original value. Both the mobile dashboard and login fit at 320px with 200% root text sizing.

Platform-font inspection confirmed Playfair on all prominent financial roles, including native `₹`, `¥`, and `€`, and Geist in the ledger and functional headings. Sampled contrast was 16.58:1 for Japan, 15.57:1 for India, 17.46:1 for Net savings and 7.21:1 for a muted category label. The full-size review found that serif hairlines remained distinct after the weight and tracking changes.

The selector supports baseline, T2 and T3, with T3 as the fresh default. The copyable spec reflects the active type treatment and preview widths. Changes were confined to the lab, its evidence and this report. Existing font binaries and the production tree matched the baseline. Browser verification used Chromium with mobile emulation. No new Figma attachment was present.

## Evidence

- [T2 and T3 desktop dashboards](design-lab/evidence/4c2t-r1-desktop-comparison.webp)
- [T2 and T3 mobile dashboards](design-lab/evidence/4c2t-r1-mobile-comparison.webp)
- [Refined T3 login](design-lab/evidence/4c2t-r1-t3-login.webp)
- [T3 regional balances, KPIs and budgets close-up](design-lab/evidence/4c2t-r1-financial-hierarchy.webp)

**T3 OPTICAL TYPOGRAPHY REFINEMENT COMPLETE — AWAITING OWNER ACCEPTANCE**
