# Phase 4C.2T — Editorial financial typography

Baseline `0bf5884771910c40ee081c084bc7dc05097bf260` on `test`. T2 is the lab default. The Typography section switches both preview surfaces to the approved SF Pro baseline and can copy the computed type specification. Phase edits are confined to the lab and this report. The pre-existing `skills-lock.json` edit was preserved.

## Type system

Playfair Display carries the brand, Welcome, page and section headings, regional balances, KPIs, budget spend, wallet balances and chart-center totals. Geist carries navigation, actions, inputs, account and category names, dates, limits, percentages, ledger values and chart labels. The login uses the written reference and the application’s two-pane structure. Desktop pairs the serif brand with a two-line Geist statement, overlapping regional account cards, a divider and the form. Mobile leads with the same brand and form. The Figma screenshot was absent from the attachment, so direct visual comparison remains open.

Sizes below are rendered CSS pixels at 1440px desktop and 390px mobile. Tracking is expressed in ems. The copyable lab specification reports the computed values at the current preview widths.

| Role | Typeface | Desktop / mobile size | Weight | Leading | Tracking |
| --- | --- | --- | ---: | ---: | ---: |
| Brand display | Playfair | 46.2 / 31.92 | 550 | 1.13 | −.012 |
| Page title | Playfair | 28.7 / 21.7 dashboard, 26.88 mobile Welcome | 550 | 1.18 | −.012 |
| Section title | Playfair | 21.28 / 18.62 | 550 | 1.22 | −.012 |
| Hero balance | Playfair | 40.92 / 27.65 | 575 | 1.15 | −.006 |
| Primary KPI | Playfair | 29.18 / 18.81 | 575 | 1.15 | −.006 |
| Budget amount | Playfair | 20.72 / 17.92 | 575 | 1.15 | −.006 |
| Wallet balance | Playfair | 27.3 / 23.52 | 575 | 1.15 | −.006 |
| Functional heading | Geist | 14 / 13.16 | 550 | 1.35 | normal |
| Standard interface | Geist | 14 / 14 | 400 | 1.45 | normal |
| Button | Geist | 13.44 / 13.44 | 500 | 1.3 | normal |
| Input | Geist | 16 / 16 | 400 | 1.4 | normal |
| Ledger amount | Geist | 14 / 14 | 500 | 1.3 | normal |
| Supporting label | Geist | 13.02 / 12.18 | 400 | 1.45 | normal |
| Metadata | Geist | 12.04 / 12.04 | 400 | 1.4 | normal |
| Chart text | Geist | 12.6 / 12.6 | 400 | 1.4 | normal |

## Fonts and numeral features

- **Geist** uses Vercel’s upright variable WOFF2 from tag `v1.8.1` (`e1f671c`). The exact downloaded binary reports Version 1.800. It is 69,760 bytes with weights 100–900. It contains `pnum`, `tnum` and GPOS kerning. Its default digits already line up vertically, and the file exposes no `lnum` feature. At weight 500, all ten tabular glyphs advance 612 of 1,000 font units. [Release](https://github.com/vercel/geist-font/releases/tag/v1.8.1) · [Exact source file](https://raw.githubusercontent.com/vercel/geist-font/v1.8.1/packages/next/dist/fonts/geist-sans/Geist-Variable.woff2) · [OFL notice](design-lab/typefaces/Geist-OFL.txt)
- **Playfair Display** uses the complete official Google Fonts upright variable TTF at revision `1e1aa08e994ff7db50116e86ccc7b52a4e4ae5b8`, binary Version 1.203, weights 400–900. The lab serves a 112,292-byte WOFF2 conversion. FontTools verified all 659 character mappings and all 1,103 glyphs were retained. The decoded tables match the TTF apart from the container flag and checksum in `head` and omission of the empty `DSIG` table. The face contains `lnum`, `onum`, and GPOS kerning. Its lining figures have proportional advances and it exposes neither `pnum` nor `tnum`. [Pinned Google Fonts source](https://github.com/google/fonts/blob/1e1aa08e994ff7db50116e86ccc7b52a4e4ae5b8/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf) · [OFL notice](design-lab/typefaces/Playfair-OFL.txt)

Both faces use SIL OFL 1.1. The total compressed payload is **182,052 bytes (177.8 KiB)**. The old Latin web subset omitted U+20B9. FontTools verified the complete source TTF and the shipped WOFF2 both map `₹` (U+20B9) to `uni20B9`, `¥` (U+00A5) to `yen`, and `€` (U+20AC) to `Euro`. The Playfair Display `@font-face` has no `unicode-range` restriction. Japanese text resolved to the host’s Noto Sans CJK JP. The specimen retains the original eleven values and includes the additional euro and negative rupee figures, a long category name, Japanese text, and a Canvas label measured in Geist. Currency formatting and grouping follow the existing lab formatter.

### Native currency verification

Chromium DevTools `CSS.getPlatformFontsForNode` identified the locally served `PlayfairDisplay-Regular` webfont as the sole font for each isolated currency symbol and each complete serif specimen. Actual Japan, India, and Germany regional card amounts and the India login illustration also used Playfair Display for every glyph. The paired ledger specimen rendered in Geist.

| Serif specimen | Playfair Display glyphs |
| --- | ---: |
| ¥350,000 | 8 / 8 |
| ₹85,000 | 7 / 7 |
| €12,450 | 7 / 7 |
| ₹12,34,567.89 | 13 / 13 |
| −₹25,000 | 8 / 8 |

## Browser verification

Chromium via DevTools Protocol verified the actual HTML faces, login, and dashboard at 390, 768, 1024, 1440 and 1920px. Both JP and IN budget grids stayed within 0.5px of the summary edges, and their 3.5px tracks remained intact. The overlay kept dashboard geometry stable. Oversized values and long Japanese labels reflowed within their cards. The dashboard and login also fit at 320px with the root text size doubled. Keyboard focus, synthetic sign-in, privacy masking, the baseline toggle and the copy action passed. Sign In retained the bronze hover fill, one 900ms rim lap, and touch press and cancellation feedback.

Sample contrast ratios were 16.48:1 for Japan, 15.51:1 for India, 17.32:1 on the signature KPI, 14.38:1 on the wallet, 7.27:1 for muted budget text and 7.12:1 for login input text. All samples cleared the 4.5:1 normal-text target, which was also used for the serif samples. The rendered serif hairlines were reviewed at desktop and mobile sizes. [WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

The lab serves two same-origin font files with `font-display: swap`. It resolves the preview route and selected type treatment before first paint. A cold run at 180ms latency and 100 KiB/s downloaded both fonts locally. The observed non-input layout-shift sums were 0.00054 for the desktop dashboard and 0.00010 for login. The Firefox and Safari engines and physical mobile hardware were outside this Chromium check.

Consulted better-typography, web-typography, visual-design-foundations, frontend-design, design-taste-frontend and frontend-testing-debugging. Their role, font-loading, hierarchy and reflow guidance informed the typography changes and browser checks.

## Future application packaging

Add the two WOFF2 files to the explicit production asset allowlist and preserve the OFL notices. Fingerprint the font binaries and rewrite the CSS references to the emitted filenames. Serve with `font/woff2` and same-origin `font-src 'self'`; include the fingerprinted fonts in the versioned static PWA cache and check updates and offline rendering. Initialize the type treatment through a CSP-compatible same-origin entry point. Canvas charts should redraw after the relevant font loads. PDF export typography belongs to its own phase.

## Evidence

- [Desktop dashboard](design-lab/evidence/4c2t-dashboard-desktop.webp)
- [Mobile dashboard](design-lab/evidence/4c2t-dashboard-mobile.webp)
- [Desktop login](design-lab/evidence/4c2t-login-desktop.webp)
- [Mobile login](design-lab/evidence/4c2t-login-mobile.webp)
- [Financial typography specimen](design-lab/evidence/4c2t-financial-specimen.webp)

**T2 EDITORIAL FINANCIAL TYPOGRAPHY READY — AWAITING OWNER ACCEPTANCE**
