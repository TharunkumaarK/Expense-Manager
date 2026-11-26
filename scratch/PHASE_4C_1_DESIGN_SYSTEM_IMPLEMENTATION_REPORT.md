# Phase 4C.1 Design System, Visual Foundation and CSS Architecture

## Executive summary

Expense Manager now has a midnight workspace with slate and bronze ambient light, satin-gold primary actions, quieter financial surfaces and a single interaction language. The live financial UI remains the focal point. Country and wallet gradients carry regional and brand identity. Typography, contrast and spacing guide the eye from balances to supporting detail.

Work started from the clean `test` branch at `3366db5e6322a7f254014fff9bbb4fcf989a88e4`. The [Phase 4C.0A](PHASE_4C_0A_FRONTEND_CLEANUP_REPORT.md) and [Phase 4C.0B](PHASE_4C_0B_IMPLEMENTATION_REPORT.md) baselines informed CSS organization, rendering measurement and security checks. The previous navigation binding guard and single Dashboard render per update were observed in the browser trace harness. Testing used localhost, synthetic accounts and blocked Supabase traffic. There was no deployment.

## Visual identity and architecture

| Area | Decision and application |
|---|---|
| Background | The authenticated workspace combines a steady `#11141b` base with static radial pools of slate and bronze. Mobile repositions the pools around the stacked reading order. Header, sidebar and cards use distinct surface values to keep adjacent levels distinguishable. |
| Financial surfaces | Most cards use an opaque `#1b1f28` surface and a quiet border. Selected shell and backdrop layers supply separation. The modal sheet is opaque, so text stays readable with or without blur. Redundant blur on shared panels, nested category rows and report cards was removed. |
| Gradients | The existing country treatments and customizable wallet gradients retain their original regional and brand colors. Gold identifies the primary action and the active navigation edge. Income, expense, transfer and budget colors retain their financial meanings. |
| Typography | Existing SF Pro and system fallback stacks remain. Desktop headings use the shared title size and weight, supporting text is lighter, and tabular figures keep comparisons aligned. Monthly totals can wrap at long values. |
| Spacing and geometry | The existing 4–40px scale now drives more shared padding, control spacing and workspace gaps. The desktop gutter is fluid, with tablet and phone values at existing layout boundaries. Sidebar widths and drawer elevation have named tokens for Phase 4C.2. |
| CSS structure | The cascade remains one readable, minifiable stylesheet with the glass tokens consolidated into the central token block. Shared action and panel styles replace their earlier implementations in place. Existing responsive, print and page-specific rules keep their order. |

One stylesheet gives the production build one fingerprinted CSS request, no import waterfall and the same predictable order for legacy app and print rules. A wholesale split or conversion to cascade layers would change how unlayered page overrides and existing important rules win. Major page-specific consolidation remains scheduled for the layout phases.

### Token inventory

| Role | Examples |
|---|---|
| Base, foreground and handoff | `--bg-workspace`, `--bg-sidebar`, `--glass-bg-card`, `--glass-bg-elevated`, `--text-primary`, `--text-muted`, `--text-faint` |
| Actions and financial state | `--action-gradient`, `--action-ink`, `--action-edge`, `--focus-ring`, `--income`, `--expense`, `--transfer`, `--success`, `--warning`, `--error` |
| Spacing, shell and controls | `--space-1` through `--space-8`, `--page-gutter`, `--workspace-gap`, `--control-height`, `--control-height-compact`, `--control-touch-height`, `--radius-card`, `--sidebar-width`, `--sidebar-collapsed-width`, `--sidebar-drawer-width`, `--sidebar-overlay-elevation` |
| Effects, budget and motion | `--workspace-ambient`, `--surface-highlight`, `--glass-blur`, `--glass-blur-heavy`, `--budget-track`, `--budget-safe`, `--budget-warning`, `--budget-danger`, `--budget-sheen`, `--button-sheen`, `--duration-button`, `--button-glimmer-duration`, `--ease-out` |

## Shared components and behavior

- Primary, secondary, ghost, icon and financial buttons use shared geometry, focus or press treatment according to their roles. Destructive actions retain their red semantics. The mobile creation button uses the same primary action finish as the desktop creation button. The transaction submit button exposes its busy state while saving. Its visual and accessibility state clears when the operation ends.
- The reflection sweeps once for 280ms using transform and opacity. Hover is gated to a fine pointer. A passive delegated listener starts the touch or pen sweep on contact and cleans up after completion or cancellation. The pseudo-element passes pointer events through. Disabled, busy, destructive and reduced-motion states omit the reflection.
- Inputs and native selects have a shared dark surface and border. Transaction fields now have explicit label associations where updated. The date-picker indicator uses the native dark-scheme glyph and the sheets contain scroll chaining.
- Financial cards, toolbar panels, rails and monthly totals share the new surface hierarchy. Segment controls share the control background. Budget indicators retain their 4px structure, status gradients and desktop sheen. The budget sheen now moves with transforms. Its existing mobile and reduced-motion conditions remain.
- Existing filter chips, badges, tooltips, empty states, separators and loading indicators inherit the palette and typography. Their device-specific layout and markup remain candidates for focused migration.

Reference token pairs measured 15.15:1 for primary text, 6.92:1 for muted text and 5.53:1 for faint text on the opaque card. The focus and primary action pairs measured 9.56:1 and at least 7.88:1 respectively. This was a token-level check. It does not establish contrast for every retained wallet theme, inline style or legacy control.

### Wording inventory

| Current wording | Proposed wording or treatment | Where and status |
|---|---|---|
| Add Transaction | Add transaction | Desktop shared action, implemented |
| Amount, Date, Wallet and Category | Keep the existing visible words and associate labels with their controls | Representative transaction forms, implemented |
| Dashboard and Financial Overview | Keep both because the first names the view and the second names the balance section | Dashboard, retained |
| Wallets in the header and page title | Review whether the desktop page needs a second heading once the header structure is decided | Wallets, deferred to 4C.2 |
| Total Outflows | Review against “Expenses” only after confirming which outflows the view includes | Dashboard, deferred |
| Click to inspect Japan wallets & accounts | View Japan accounts | Country cards, deferred until desktop and touch affordances are reviewed |

## Design Skills Utilization

| Skill | Use |
|---|---|
| `frontend-design` | Applied the two-pass plan and visual critique. The initial frame uses the user's real finance workspace and established wallet themes as the visual emphasis. The new palette is restrained around those cards. The review used desktop and phone screenshots of Dashboard, Wallets and forms. |
| `design-taste-frontend` | Used its software classification, live product UI, aligned edges, clear actions and visual finish checklist. Kept the existing app stack and verified actual authenticated synthetic screens. The landing-page dealer, hero sizing gate, stock visuals, decorative scenes and scroll effects were inapplicable to this signed-in UI foundation and would have exceeded the phase scope. |
| `responsive-design` and `mobile-native` | Used the existing layout boundaries for adaptive gutters, kept safe-area spacing and checked seven viewport widths. Applied coarse-pointer press handling and retained native forms. Deferred device chrome and installed behavior to actual hardware. |
| `animate` | Used its button-press recipe, pointer gating and transform/opacity guidance. Chose a short, one-shot sweep with immediate action dispatch. Retained the current drawer and modal motion hierarchy for their appropriate phase. |
| `web-design-guidelines` | Read the bundled pinned `references/command.md` and reviewed changed controls for keyboard focus, label associations, pointer feedback, reduced motion, and modal scrolling. Kept broader audits of legacy components outside the redesign foundation. |
| Antigravity `modern-web-guidance` | Searched with its CLI and retrieved `natural-interactions`, `accessibility` and `css`. Used named focus states, combined press/hover feedback, compositor-friendly reflection and semantic tokens. Retained the legacy cascade order because introducing layer precedence across the existing sheet would affect untouched routes. |
| `verification-before-completion` | Located and read the Superpowers skill. Used current exit codes, fresh source/build browser suites, measured artifact inventories and paired screenshots to support each completion claim. |
| `systematic-debugging` | Located and read the Superpowers skill. Diagnosed the original CSS edit against the parsed stylesheet and anchored its replacement to the actual shared rule. Diagnosed desktop focus and hover verification by inspecting the input state and using real CDP keyboard and mouse input with an explicit fine-pointer device configuration. |
| `ui-ux-pro-max` | Unavailable in the inspected project, Antigravity, Gemini, user agent and plugin-cache skill roots. The design direction and evaluation used the available skills above. |

Project layout, security, reduced motion and financial semantics took precedence over generic presentation recipes. No skill assets, scripts, templates or development playgrounds enter the deployment.

## Visual evidence

| View | Before | After |
|---|---|---|
| Desktop Dashboard | [Before](phase4c1-evidence/before-1440-home.webp) | [After](phase4c1-evidence/after-1440-home.webp) |
| Desktop forms and modal | [Before](phase4c1-evidence/before-1440-transaction-modal.webp) | [After](phase4c1-evidence/after-1440-transaction-modal.webp) |
| Wallet cards | [Before](phase4c1-evidence/before-1440-wallets.webp) | [After](phase4c1-evidence/after-1440-wallets.webp) |
| Budget progress | [Before](phase4c1-evidence/before-1440-budgets.webp) | [After](phase4c1-evidence/after-1440-budgets.webp) |
| Mobile Dashboard | [Before](phase4c1-evidence/before-390-home.webp) | [After](phase4c1-evidence/after-390-home.webp) |
| Mobile controls | [Before](phase4c1-evidence/before-390-transaction-modal.webp) | [After](phase4c1-evidence/after-390-transaction-modal.webp) |

Dedicated input samples show [keyboard focus](phase4c1-evidence/desktop-focus.webp), [hover](phase4c1-evidence/desktop-hover.webp), [busy feedback](phase4c1-evidence/desktop-busy.webp) and [touch press](phase4c1-evidence/mobile-press.webp). Disabled and reduced-motion behavior were checked in computed styles. Stable screenshots use fixed synthetic dates and settled chart animations. The visual harness checked seven main views at 360, 390, 430, 768, 1024, 1440 and 1920px and found zero horizontal document overflows in 49 combinations. The packaged site excludes this evidence directory.

## Build and browser performance

| Metric | Before | After |
|---|---:|---:|
| Source CSS lines | 14,853 | 14,789 |
| Source CSS rules | 1,901 | 1,894 |
| Source declarations | 8,027 | 7,984 |
| `!important` declarations | 872 | 843 |
| Repeated selector strings | 319 | 321 |
| Exact repeated declarations in the same context | 0 | 0 |
| Media queries | 66 | 70 |
| Backdrop-filter declarations | 82 | 72 |
| Minified CSS | 239,557 B | 240,087 B |
| Minified CSS gzip / Brotli | 38,521 / 31,037 B | 38,995 / 31,391 B |
| Startup JS with vendor files | 1,467,747 B | 1,469,199 B |
| Deployment files / size | 11 / 2,008,777 B | 11 / 2,010,680 B |
| Startup JS and CSS requests / external script requests | 5 / 0 | 5 / 0 |

The CSS audit counted parsed source tokens, excluding comments and strings. The additional selector occurrences and media conditions scope pointer capabilities and reduced motion. The 530-byte minified CSS increase and 1,452-byte JS increase cover semantic tokens, shared states and the one delegated interaction. They add no runtime dependency, asset request or layout read.

| Browser metric | Before | After |
|---|---:|---:|
| Median login load, cache disabled | 281.4 ms | 282.3 ms |
| Layout per desktop / phone journey | 22.2 / 21.5 ms | 23.4 / 22.1 ms |
| Style recalculation per desktop / phone journey | 46.2 / 53.9 ms | 53.3 / 48.9 ms |
| Main-thread task time per desktop / phone journey | 262.7 / 231.7 ms | 296.7 / 243.5 ms |

Chrome ran two sequential before/after pairs with three samples per build and width in each pair. The warm journeys visited the seven main views and opened and closed a form. Early and late runs varied. The desktop style ranges overlapped at 40.2–57.7 ms before and 46.3–59.4 ms after. Desktop median task time rose by 34 ms over the full journey. Mobile style time fell while median task time rose modestly. These traces establish mixed results. A physical-device trace remains necessary to assess scrolling and animation on mobile hardware.

## Verification and security

| Verification | Passed | Failed |
|---|---:|---:|
| Chrome development source workflows | 67 | 0 |
| Chrome deployment-format development workflows | 15 | 0 |
| Chrome focus, hover, touch, busy and reduced-motion checks | 8 | 0 |
| Standard Node regression assertions | 374 | 0 |
| Deployment and worker tests | 16 | 0 |

Wallet rename, budget and loan logging suites also passed. The browser coverage includes login and recovery rendering, onboarding entry, logout and account isolation, decimal transactions, transfers and remittances, budgets and Analytics, printing to a real PDF, month closing, backups, reload, and synthetic sync behavior. Headless Chrome used disposable synthetic accounts without connecting to Supabase. No live policies, mail flows, physical touch behavior or OS-level PWA installation were verified.

The build pipeline, CSS fingerprinting, CSP, authority boundaries and cache allowlist remain in effect. Existing quick creation and static privacy controls now bind to known elements using listeners. The theme adds no private globals, unsafe HTML, dependencies or CSP exceptions.

## Files and Phase 4C.2 handoff

Changed `css/style.css`, `index.html`, `js/app.js` and `js/startup.js`. Added this report and the development-only evidence directory. Final syntax and whitespace checks passed.

Phase 4C.2 should convert the existing desktop sidebar to a fixed-width rail with overlay expansion, accessible keyboard and click controls, and no workspace reflow. Apply the spacing and surface tokens to page layouts in that pass. Review duplicated page headings and remaining legacy form, toolbar and card wrappers there. Phase 4C.3 should handle mobile navigation and dense arrangements independently, including device chrome and long-label review on hardware.

**READY WITH DOCUMENTED NON-BLOCKING LIMITATIONS**
