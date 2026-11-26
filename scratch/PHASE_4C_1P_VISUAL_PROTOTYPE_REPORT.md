# Phase 4C.1P Visual Prototype Report

**VISUAL PROTOTYPES READY — AWAITING OWNER DESIGN ACCEPTANCE**

The lab is isolated under [scratch/design-lab](design-lab/index.html) on `test`, based on `c49734a768ccc3b967e2f0c97d8d662bc77a0ec2`. The application owner’s visual rejection is the starting point for this phase. This report records prototype measurements and a design recommendation. Acceptance belongs to the owner.

## Open the lab

From the repository root, run the same loopback development server used for the readable application source.

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open [http://127.0.0.1:8080/scratch/design-lab/](http://127.0.0.1:8080/scratch/design-lab/). The lab needs no account, Supabase connection, install, or build step. It uses synthetic November 2026 financial data. Choose the treatment IDs in either dashboard, then try moving across the toolbar and opening the transaction menu in each preview. Selections sync across the previews for the visit. The controls in the button section reset independently to the Balanced preset.

## Diagnosis

| Rejected behavior | Observation and response |
|---|---|
| The lap feels like it speeds up and slows down | The current rotating highlight advances at a constant angle. Its intersection with the long and short sides of a rounded rectangle advances at uneven distances. For example, on a straight horizontal edge the intersection point follows a tangent function of the angle. A3 advances a stroke dash over the measured SVG path length at a constant rate. |
| Too many controls draw attention | The existing selector covers nearly every button and gives the same traveling effect to frequent utilities. The lab limits decoration to explicit signature actions. Frequent finance actions get semantic border and surface feedback. Utilities use quiet direct feedback. |
| Financial cards look flat | The pre-4C.1 theme used a low-alpha card fill and broader 20px and 32px blur tokens. Some surfaces looked nearly black on the old canvas, but the softer backdrop helped separate layers. The current translucent graphite token and faint ambient light produce comparatively even panels. C1 and C3 restore directional light and edge depth. C2 lets more of the canvas show through a single 9px matte layer. |
| Combined treatment lacks cohesion | Meaningful wallet and country gradients already provide strong color. The lab places them beside neutral, directionally lit panels and one bronze signature action. The dashboard previews show how the choices interact with actual financial information density. |

Reviewed the current local-built app at [1440px](design-lab/evidence/current-app-desktop.webp) and [390px](design-lab/evidence/current-app-mobile.webp) with synthetic accounts and Supabase blocked. Compared those screens with the existing [pre-4C.1 desktop](phase4c1-evidence/before-1440-home.webp) and [mobile](phase4c1-evidence/before-390-home.webp) captures. The current shared geometry, financial semantics, privacy affordance, visible focus and deployment architecture are the foundation for future integration.

## Treatments and screenshots

| Area | Decisions available in the lab | Browser evidence |
|---|---|---|
| Primary action | **A1** stroke-to-fill and still edge. **A2** a short fixed rim highlight with one fade. **A3** one clockwise lap with a fixed dash length. Each sample uses the same 168×44px geometry, text and icon. | [All button variants](design-lab/evidence/buttons.webp), [A3 edge positions](design-lab/evidence/lap-frames.png) |
| Toolbar hierarchy | Signature, standard financial and utility actions sit together. Standard actions retain their semantic accents. Privacy, filter, theme, sheen and sample removal controls all respond. | [Toolbar](design-lab/evidence/toolbar.webp) |
| Mobile input | A1–A3 respond to touch. A circular 54px FAB opens the synthetic menu. Fill holds for 170ms after release, then fades back over the selected fill time plus 40ms. Travel duration stays independent. Native scrolling and cancellation clear decorative feedback. Keyboard activation uses fill feedback and reduced-motion preference suppresses moving effects. | [Touch examples](design-lab/evidence/mobile-press.webp), [FAB menu](design-lab/evidence/mobile-menu.webp) |
| Glass | **C1** satin with directional light and a fine rim. **C2** lower-opacity frosted glass with one 9px backdrop blur. **C3** darker layered graphite with stronger edge depth. All three show the same account summary. | [C1–C3](design-lab/evidence/glass.webp) |
| Graphite atmosphere | **D1** restrained with warm/neutral alpha .10/.035. **D2** balanced at .19/.065. **D3** directional at .26/.084. Every D example displays the selected C material. | [D1–D3 behind C2](design-lab/evidence/atmospheres.webp) |
| Budget | Safe 40%, warning 85%, and over limit 114% share a 3.5px track. The visible over-limit bar is capped at the edge while the label retains 114%. Static light and optional 3.5-second sheen use the original color gradients. | [Three budget treatments](design-lab/evidence/budgets.webp) |
| Integrated previews | Compact desktop rail and toolbar, three KPI columns, regional account and wallet cards, budgets, and transactions. The mobile counterpart stacks the content and uses its own FAB. Both use the selected A, C and D controls. | [Desktop](design-lab/evidence/dashboard-desktop.webp), [mobile](design-lab/evidence/dashboard-mobile.webp), [mobile budget and rows](design-lab/evidence/dashboard-mobile-detail.webp), [India and wallet treatment](design-lab/evidence/regional-gradients.webp) |

The Subtle, Balanced and Expressive presets adjust the same six motion values. The edge-effect toggle is shared by A2 and A3. A2 uses a shorter portion of the length value for its localized catch. The round FAB caps the dash at roughly a quarter of its circumference for longer settings.

## Real-time motion evidence

- [A1–A3 hover comparison](design-lab/evidence/motion-desktop.mp4) shows the same three buttons activated twice at their normal rates.
- [Toolbar pass](design-lab/evidence/motion-toolbar.mp4) shows the pointer moving from a signature action through the other controls twice.
- [Mobile press and FAB](design-lab/evidence/motion-mobile.mp4) shows actual Chrome touch dispatch for all three variants, a repeat A3 tap, and the opening and selection of the menu.
- [Budget sheen](design-lab/evidence/motion-budget.mp4) shows one full cycle at its normal rate.

A3 starts at the top and follows an SVG rounded rectangle or circle. One Web Animations API effect changes `stroke-dashoffset` linearly and fades only at the ends. The SVG is mounted with the explicit signature control. The implementation measures the path once, then replays it without a per-frame JavaScript loop, moving geometry, or creating new overlays. A2 uses the same path with a fixed offset and fades in place. The visual review considered repeated normal-rate browser dispatch and recorded playback frames, with a separate stepped sequence for diagnosing the rim movement.

## Performance and verification

Chrome passed **34 prototype checks** and observed no document overflow at 320, 390, 680, 768, 1024 or 1440px. Controls changed the rendered states, keyboard focus stayed visible, the FAB opened in the release dispatch, and scroll and cancellation cleared decoration. The lab made only loopback requests.

The default A3 path measured 400.07 CSS px. Sampling at 180ms intervals during the 900ms run yielded 80.01–80.02 CSS px of travel per interval and a constant 29px dash. The top, lower rim, left side and top again are visible in sequence at the recorded positions.

The following medians compare four windows per variant and input mode. All windows used the Balanced settings and the same 1.37-second observation window. Desktop includes pointer entry and exit. Mobile includes native touch activation and the same synthetic status update for every variant. Chrome ran in headless mode with hardware GPU disabled.

| Mode | Variant | Main-thread task ms | Style ms | Layout ms | Paint ms / calls | Median frame interval |
|---|---|---:|---:|---:|---:|---:|
| Desktop | A1 | 117.18 | 11.26 | 0.00 | 27.40 / 34 | 16.70ms |
| Desktop | A2 | 110.52 | 11.04 | 0.00 | 21.29 / 34 | 16.70ms |
| Desktop | A3 | 157.80 | 11.87 | 0.00 | 68.75 / 130 | 16.70ms |
| Emulated touch | A1 | 106.44 | 11.13 | 0.31 | 24.05 / 35 | 16.70ms |
| Emulated touch | A2 | 82.43 | 8.76 | 0.22 | 17.00 / 35 | 16.70ms |
| Emulated touch | A3 | 154.47 | 10.99 | 0.23 | 57.24 / 115 | 16.70ms |

A3 increased paint work in both modes while meeting the measured arc-length target. In this run, none of the sampled browser animation callbacks were more than 25ms apart. Callback timing is a pacing signal and does not establish presented frame rate or physical-device performance. The measurements include the lab page and cannot be compared directly with the previous report’s different app surface and timing windows. The traces recorded paint, so they do not establish compositor-only animation. [Browser checks, trace samples, and capture timing](design-lab/evidence/browser-results.json).

A second trace compared four warmed desktop scroll windows per glass treatment under D2. Median main-thread task time was 57.98ms for C1, 57.11ms for C2, and 55.14ms for C3. The measured renderer recorded no main-thread layout or paint in those windows. That captures the warm scroll path. It leaves C2’s backdrop compositing and GPU cost on a physical device open.

The readable app, CSS, financial logic, authentication, synchronization, persistence and build configuration remain untouched. A local `branch-deploy/test` build produced the existing 11-file allowlisted package. The output was byte-identical with the finished lab and its evidence present in the input tree. The existing deployment suite passed all 16 tests.

## Design skills utilization

| Skill | Applied decision |
|---|---|
| `frontend-design` | Planned a neutral graphite canvas, restrained bronze selection, SF Pro/system typography, a fixed comparison grid and dense real finance UI. The browser critique adjusted the collapsed rail labels and kept the sample screens visually comparable. |
| `emil-design-eng`, `animate` | Applied the purpose and frequency gate. The normal state change is the fill. Decoration is opt-in for a small set of signature actions. The button recipe informed prompt response and custom easing. The brief’s stable geometry overrides its press-scaling example. |
| `apple-design` | Used contact-first feedback, translucent material hierarchy and directional edge lighting. The mobile press response ends promptly and the native modal handles focus and dismissal. |
| `review-animations`, `animation-performance` | Used the motion standards and browser profiling workflow. Compared real input sequences, inspected the SVG perimeter against elapsed time, and measured equal windows for the A variants. The reports distinguish rendering costs from visual preference. |
| `design-taste-frontend` | Applied consistent edges, straightforward labels, restrained effects and product screens as the centerpiece. Marketing hero and image workflows were inapplicable to the financial comparison tool. |
| `responsive-design`, `mobile-native`, `web-design-guidelines` | Used fluid gutters, a dedicated stacked phone preview, visible focus, native controls, sufficient touch targets for actions, pointer-capability checks and reduced motion. Used the bundled web-interface guideline reference to review focus and interaction. |
| `verification-before-completion` | Used current Chromium results, synthetic fixtures, screenshots, recorded input, computed measurements and a generated build inventory. These checks establish prototype behavior. Owner review establishes visual acceptance. |

The motion recipe and standards files, bundled accessibility checklist, existing reports and rendering captures informed the review. DevTools Protocol scripts captured browser input, frame pacing, and recordings. No project dependency was installed.

## Recommended combination and handoff

**A1 + C1 + D2 with static budget illumination.** A1 gives the frequently used Add transaction action an immediate, readable state change. C1 and D2 restore directional depth while allowing the approved regional and wallet colors to carry identity. Start owner review with A2 as the optional finish for a rare signature action. A3 stays available for direct comparison if the owner prefers a full lap. The lab’s selectors allow all combinations.

Keep the exact `linear-gradient(90.81deg, #9B794B 0%, #E7CBA3 99.75%)`, filled ink `#14110C`, resting outline, tabular numerals, semantic status colors, original wallet and regional gradients, flag affordance and 3.5px budget progress. The lab uses compact representative content and fresh synthetic values.

After owner approval, carry the chosen fill state and materials into the existing shared definitions. If motion is selected, opt in by signature action and verify runtime costs on the real application before broad adoption. The next desktop phase still owns the compact rail, overlay expansion without content reflow, keyboard and click alternatives, active navigation, consistent widths and three-column KPI arrangements. The mobile phase still owns navigation, comfortable touch targets, density and press behavior. Review duplicate navbar and page headings, action wording, financial terminology and repeated currency indicators alongside those layout changes.

This review used Chrome mouse, keyboard and emulated touch. Physical phone feel, cross-engine blur and rendering cost, and the owner’s visual preference remain open. The prototype stays isolated until that review.
