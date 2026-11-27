# Phase 4C.2V — Reference-driven visual laboratory

[Open the lab](http://127.0.0.1:8080/scratch/design-lab/) · [Desktop](http://127.0.0.1:8080/scratch/design-lab/?preview=desktop) · [Mobile](http://127.0.0.1:8080/scratch/design-lab/?preview=mobile)

**Baseline** `9ac2ea9e4db5bfadb831810352ff284f975d5d5f` on `test`. Updated the lab’s `index.html`, `lab.css` and `lab.js`. Added `identity.css` for the copied regional and wallet rules, `icons.js` for the application’s Lucide glyphs and license, and five evidence files. The prior lab variants remain in `90c30d307bb7995d038b9c5dc895db7a6b14b9f4` and their existing evidence is still in the lab. The pre-existing 4C.2A working-tree changes were preserved.

## Visual direction

The request arrived with the written description and no image file. The prototype follows the described near-black surfaces, localized edge diffusion, directional reflections, and dark reading areas. A direct comparison against the reference image remains open.

| Before | After | Why |
| --- | --- | --- |
| Warm D1–D3 workspace studies | Flat `#09090B` workspace and `#0D0D10` navigation | Gives the existing country and wallet cards room to carry the color. |
| Three general glass recipes | **A · Signature luminous glass** combines localized neutral elliptical lighting, a directional rim, and a faint lower reflection. The dashboard uses A only for Net Savings. **B · Dark matte glass** uses graphite layering, a fine directional edge, a static inset highlight, and a short shadow. | Distinguishes the signature surface from KPI, budget, and chart panels. |
| Budget examples in isolation | Nine category cards use B in three desktop columns and two mobile columns. **B1** moves a feathered edge highlight, **B2** moves an interior sheen, and **B3** combines them. | Tests the effect at realistic dashboard density. |

Both optical layers animate transform and opacity over a stationary matte surface. The 790ms preview default uses a 105ms desktop dwell, a soft 19% edge radius, 37% shine width, 56% edge intensity and 11% shine intensity. The controls update both previews, persist changes, and offer copy and reset. B3 is the initial demonstration setting. The 3.5px semantic tracks stay static in category cards. The optional overall-budget sheen plays while visible.

**Typography.** `b6d32ec70252271ecfdacdec4214478b962c48d7` declared local SF Pro Text and Display faces at 400, 500, 600 and 700 with relative font-file fallbacks and `font-display: swap`. `0033eb5` consolidated the app’s aliases to SF Pro. The repository history contained no tracked font binaries. The lab uses local font resolution and ships no font files. Chromium’s platform-font inspection identified **SF Pro** (`SFPro-Regular`) on the dashboard heading, yen amount and budget status label. Country balances and KPI figures use the app’s 600 weight and tabular digits. Machines without SF Pro use the platform font stack.

**Protected treatments.** The Japan, India and Germany card backgrounds and hover rules match the application source, as do the PayPay, Salary account, Axis Bank and Bank of Baroda wallet treatments. Regional selection updates the reporting data, and the sample wallet selector changes the card’s theme independently of its account and balance.

**Actions and navigation.** Sign In and Add transaction retain the exact bronze ramp and graphite filled ink. View ledger uses the earlier `.btn-primary` recipe from `3366db5e6322a7f254014fff9bbb4fcf989a88e4` with the 92.19° gray glass surface, 145° white rim, `#F5F5F5` resting text, and .85 white fill with .92 charcoal ink. The accent-aware path runs one 900ms clockwise lap for eligible actions. The frameless desktop rail reserves 64px and clips a 230px overlay with a 240ms `cubic-bezier(0.32, 0.72, 0, 1)` transition. Hover stays active across the full drawer. Click, keyboard activation and Escape work independently of hover. The mobile preview has a separate touch drawer and FAB.

## Verification

Used frontend-design and design-taste for composition, Emil and Apple design for feedback and reflections, animate, review-animations and animation-performance for the interaction pass, responsive-design and mobile-native for viewport and touch behavior, and the bundled Web Interface Guidelines and verification-before-completion for the checks. Consulted the locally available frontend-app-builder and frontend-testing-debugging guides. Browser tooling was unavailable through the plugin, so the existing local Chromium setup ran the checks through DevTools Protocol.

| Viewport | Main content before expansion | Main content after expansion |
| --- | --- | --- |
| 1440 × 1000 | (64, 0, 1376, 959.078) | (64, 0, 1376, 959.078) |
| 1024 × 1000 | (64, 0, 960, 939.547) | (64, 0, 960, 939.547) |

Coordinates are `(x, y, width, height)` in CSS pixels. The first nav icon stayed at `(23.5, 86.5, 17, 17)` in both states. Chromium checked reflection eligibility, stationary hover, rapid crossings, unchanged card geometry and colors, local settings, regional switching, wallet customization, both action accents, login states, and reduced motion. The 390px touch emulation covered the drawer, FAB, budget taps and scroll cancellation, and Sign In feedback. Sampled contrast was 4.69:1 for dark ink on the darkest gold stop and 7.27:1 for muted budget text over matte glass. The lab ran with synthetic data and generated no browser runtime errors. Physical mobile devices and other browser engines remain unverified.

## Evidence

- [Desktop dashboard and collapsed sidebar](design-lab/evidence/4c2v-desktop.webp)
- [Complete mobile dashboard](design-lab/evidence/4c2v-mobile.webp)
- [Budget reflection comparison](design-lab/evidence/4c2v-budget-comparison.webp)
- [Normal-speed budget reflection recording](design-lab/evidence/4c2v-budget-reflection.mp4)
- [Expanded sidebar](design-lab/evidence/4c2v-sidebar-expanded.webp)

**REFERENCE-DRIVEN VISUAL LABORATORY READY — AWAITING OWNER DESIGN ACCEPTANCE**
