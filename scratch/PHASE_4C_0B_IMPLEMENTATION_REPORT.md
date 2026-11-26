# Phase 4C.0B Security, Production Build and Deployment Hardening

## Executive summary

Netlify now publishes a generated, allowlisted `dist/` directory. Its browser dependencies and application code are served as fingerprinted same-origin assets. Enforced security headers and a worker limited to public static assets define the browser deployment boundary.

The committed baseline was the clean `test` branch at `f638d193e8a3014d551037156b3d113d15070366`. I inspected parent `926f79ba9aea44c8aa7afc3dfe61661a29ce7ff2` and the [Phase 4C.0A report](PHASE_4C_0A_FRONTEND_CLEANUP_REPORT.md). The earlier navigation listener guard, reduced Dashboard render work and retired wallet markup cleanup remain in place. No production deployment, live production request or database change was made.

## Findings and corrections

| Finding | Evidence and correction |
|---|---|
| DOM injection in Dashboard activity and India Analytics | An inert account-data marker became an HTML element in both views at baseline. Fixed the confirmed sinks and related transaction, wallet, category, chart legend, history, loan and report templates. Text is escaped at HTML insertion, IDs travel through escaped data attributes, and styles use validated color or numeric values. Imported country preferences are constrained to supported region codes before rendering. The existing ledger and its financial calculations retain their behavior. |
| Account A content retained after logout | Chrome still found Account A's wallet and memo text in inactive ledger, Analytics, Wallets and report-filter DOM after logout and after signing into synthetic Account B. The cleanup now clears previous view output, filter options and account-scoped UI caches. Re-entering an account rerenders the active view. The two-account reproduction passed after the fix. |
| Legacy exports changed global privacy state | The older archive and custom PDF paths wrote the app-wide privacy flag and independently scheduled print callbacks. All three PDF paths now request full values for print alone and share cancellable print jobs. The browser confirmed that concealed state survives print preparation and that logout cancels pending old-account output. |
| Repository root selected for deployment | The former Netlify configuration selected `.`. Under that configuration the root contained reports, tests, migration SQL and other files outside the browser runtime. The change was verified from local configuration and artifacts without inspecting the live site's directory exposure. |
| Overbroad legacy worker behavior | The previous worker expected missing assets, used a broad cache lookup and deleted caches by exclusion. The source page also unregistered service workers at startup. The generated worker now registers from the built application and caches only build-listed immutable files. |

See [application rendering and logout](../js/app.js), [chart legends](../js/charts.js), [onboarding](../js/onboarding.js), [build pipeline](../scripts/build.mjs) and [worker](../sw.js).

## Build and deployment boundary

The shell entry point delegates to Node 22 and a lockfile-pinned esbuild. The app keeps its readable classic source files and script ordering during development. A clean install from the lockfile and a production-config build succeeded in an isolated source copy. The build scopes those scripts inside one private function, minifies application JS and CSS, and packages the same versions of Lucide, Supabase JS and Chart.js as the pinned source HTML. Those three libraries are existing runtime dependencies. Esbuild is the only new direct build tool. Bundled third-party license notices ship with the site. Browser source maps and dependency directories are excluded.

The generated output contains 11 files.

| Output | Purpose |
|---|---|
| `index.html` | Entry page referencing fingerprinted assets |
| `manifest.json`, `icons/icon.svg` | Install metadata and existing icon |
| `sw.js`, `_headers` | Static cache manifest and Netlify response headers |
| Five fingerprinted JS/CSS files | Application bundle, stylesheet and three libraries |
| One fingerprinted license file | Copyright and license notices |

Development previews and branch deploys build only with the development config. The `production/main` combination builds with the production config. Unsupported combinations, absent configs and invalid credentials fail before replacing the build output. The source development config is never overwritten. The output includes neither alternate configuration files nor the alternate public key. No internal reports, tests, fixtures, migration SQL, local env files, screenshots, repository metadata or development scripts are copied. Chrome received 404 responses for sampled developer paths.

The source stylesheet still supports optional local font files. The deployment keeps system font and installed font faces while omitting URLs for fonts absent from this checkout.

## Globals, credentials and Supabase

The source workflow retains its existing debug-friendly globals. Built Chrome pages no longer exposed `window.storage`, `window.walletManager`, `window.charts`, the local date helper, the wallet theme/color exports or the onboarding constructor. The app and auth controllers remain available for existing static actions. The onboarding controller, country metadata, public runtime config and vendor entry points also remain available. These are client-side interfaces. Authorization still belongs on the backend.

Production omits verbose application logs. Account identifiers, backend error objects and financial values were removed from the reviewed diagnostics. A signature scan of tracked text and generated deployment files found no Supabase secret keys or service-role JWTs, private-key blocks, database URLs carrying passwords, or common GitHub and AWS credential formats. The frontend publishable key is intentionally public. The npm advisory check returned zero reported vulnerabilities for the locked tree at test time.

Static inspection found that the frontend scopes Supabase reads and updates by the active user ID and checks ownership in synchronization responses. The checked-in CAS migration restricts execution to authenticated users and derives ownership from `auth.uid()`. Repository evidence does not establish which table RLS policies are currently deployed. Live development RLS, unauthenticated and cross-account read/write/delete, token expiry, recovery email and live sync remain **BLOCKED** pending approved disposable development accounts and access to deployed policy evidence. Synthetic browser tests covered the corresponding frontend behavior where possible. No remote authorization request was sent. [Client sync implementation](../js/storage.js), [CAS migration](supabase_concurrency_cas_migration.sql).

## Enforced headers and worker behavior

The build emits Netlify's `_headers` file. CSP denies framing, plugins and unlisted resource origins. Script elements load from the application's own origin. Connections are limited to the application's origin and the selected project's exact HTTPS and WebSocket origins. Images may use same-origin sources, data URLs and blob URLs. Fonts, manifests and workers use the application origin. Other headers enforce MIME checking, HTTPS transport, no referrer, denied framing, and denied camera, microphone and geolocation permissions.

CSP permits existing inline **event attributes** and inline **styles**. Application data is separated from those handlers, but the event-attribute exception remains until the static handlers are migrated. CSP is enforced on built pages and was exercised in Chrome with the generated headers applied. [Netlify custom headers](https://docs.netlify.com/manage/routing/headers/), [CSP directives](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).

The worker precaches exactly five fingerprinted JS/CSS files with credentials omitted and redirects disallowed. Navigations, recovery URLs, API requests and session-bearing data stay outside its Cache Storage. Updates remove earlier app-owned caches, including known legacy names at the root scope. An unrelated cache survived the update test. HTML and the worker revalidate. Already-open tabs keep the application's existing local/offline path. Cold offline navigation needs network access. Chromium reported no installability errors for either build. Physical installation, native prompts and OS-level standalone behavior remain manual. [Service worker fetch behavior](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event).

## Measured build and load results

| Metric | Baseline | Hardened build |
|---|---:|---:|
| Tracked repository root versus generated deployment files | 361 | 11 |
| Tracked root bytes versus generated deployment bytes | 25,635,469 | 2,006,233 |
| JS loaded at startup, including equivalent vendor versions | 1,874,335 B | 1,465,203 B |
| JS gzip / Brotli | 421,013 / 335,186 B | 366,051 / 290,228 B |
| CSS | 341,638 B | 239,557 B |
| CSS gzip / Brotli | 49,788 / 38,126 B | 38,521 / 31,037 B |
| Startup JS plus CSS requests | 12 | 5 |
| External startup script requests | 3 | 0 |
| Median local build time, dependencies installed | 104.2 ms | 292.2 ms |
| Median localhost login page load | 314.3 ms | 96.7 ms |
| Median first contentful paint | 320 ms | 116 ms |

The size comparison includes the same vendor package versions on both sides. The baseline repository-root measurement is a tracked inventory, not a count of files served by live Netlify. Gzip level 9 and Brotli quality 11 were calculated per asset. The build timing uses three trials. The load timing uses three 1440px Chrome 157 localhost runs on each version, with the HTTP cache disabled and Supabase traffic blocked. The baseline fetched its CDN scripts and the hardened build served its scripts locally. The load sample preceded the final country and closing-month validation changes. Payload measurements are from the final artifact. Actual deployed latency and mobile hardware performance remain unmeasured.

## Local development and build commands

Run these from the repository root with Node 22. Authenticate only against the development build during previews.

```sh
npm ci

# Serve the readable development source over loopback.
python3 -m http.server 8080 --bind 127.0.0.1

# Generate a deployment-format development build.
CONTEXT=branch-deploy BRANCH=test npm run build
python3 -m http.server 8081 --bind 127.0.0.1 --directory dist

# Generate production-config output for isolated inspection.
CONTEXT=production BRANCH=main npm run build

# Execute the deployment and worker tests.
npm run test:deployment
node scratch/test_phase2_hotfix.js
node scratch/test_phase2_usability.js
node scratch/test_phase1_final_corrections.js
node scratch/test_ux_simplification_phase1.js
node scratch/test_phase5_final_hotfix.js
```

Python's preview server does not apply Netlify's `_headers`. The acceptance harness applied the generated headers explicitly for its Chrome tests. Production-config browser tests blocked every Supabase request before navigation.

## Regression results

| Verification | Passed | Failed | Notes |
|---|---:|---:|---|
| Deployment, reproducibility and worker tests | 16 | 0 | Includes the context matrix, rejected configs, fingerprinted inventory and cache boundary |
| Development source in Chrome | 67 | 0 | Includes the two baseline defects and pending PDF logout reproduction |
| Generated development build in Chrome | 15 | 0 | Enforced headers, PDF generation, viewports, onboarding, reload and real worker lifecycle |
| Generated production-config build in Chrome | 15 | 0 | Same browser checks with production endpoint blocked |
| Five standard Node regression suites | 374 | 0 | Finance, privacy, account state and UI checks |
| Wallet, budget and loan suites | 37 | 0 | Six focused suites |
| Live Supabase integration | 0 | 0 | Blocked |
| Physical devices and OS-level PWA installation | 0 | 0 | Manual test required |

The source browser established the app's development project at runtime. It covered decimal forms, balances, transfers/remittances, wallet create/edit/delete, budget and Analytics totals, month closing, snapshots, CSV/JSON, account changes and refresh. The build browser supplied synthetic SDK responses and inspected actual local persistence. It generated a Chrome PDF, checked its text and verified concealment. The build probes exercised Dashboard, Transactions, Analytics, Reports, Budgets, Wallets and Settings at 1440px and 390px. Source login and Dashboard checks used the seven sizes from 360px to 1920px. HTML tests used inert markers and special characters. Native recovery emails and authenticated server behavior were not simulated as live successes.

## Remaining work and design handoff

Before release, verify deployed development policies with two real disposable accounts, exercise unauthorized read/write/delete and account switching, and confirm real authentication, password recovery and sync. Check installed PWA behavior on physical desktop and mobile devices. Continue migrating static event attributes to listeners to remove the remaining CSP script exception. The generated output is suitable for that work because it requires no change to financial persistence or source editing.

Sidebar hover overlays and input alternatives, glimmer and touch motion, backgrounds, hierarchy, wording, shared tokens, responsive CSS architecture and glass effects remain design-system work. This phase preserved the established UI.

Final JavaScript and Bash syntax checks and `git diff --check` passed. Source changes are in `.gitignore`, `index.html`, `js/app.js`, `js/charts.js`, `js/onboarding.js`, `js/storage.js`, `js/supabaseClient.js`, `js/wallet.js`, `js/startup.js`, `netlify.toml`, `package.json`, `package-lock.json`, `scripts/build.sh`, `scripts/build.mjs`, `scripts/test-deployment.mjs` and `sw.js`. This report is new. Generated output is ignored.

**APPROVED WITH DOCUMENTED NON-BLOCKING LIMITATIONS**
