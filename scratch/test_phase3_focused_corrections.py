#!/usr/bin/env python3
"""
Expense Manager — Phase 3 Focused Corrections Verification Suite
Validates:
1. Onboarding draft persistence & recovery (destination step on next/back, browser refresh at each step,
   preserving countries, primary country, budgets, wallets, balances, loanConfig, no wallet duplication).
2. Safe input rendering (wallet names with quotes, apostrophes, Unicode, HTML tags; event delegation; no inline handlers).
3. Supabase synchronization failure handling (SYNC_FAILED displays #sync-error-screen, halts app, retryInitialSync).
4. Loan tracking optionality & dynamic currency (JPY ¥, EUR €, INR ₹, multi-country dropdown, restrained copy).
5. PWA integration (sw.js cache name em-v122, ASSETS manifest, index.html script version sync).
6. Desktop design & live reactive showcase (cascade hierarchy with Indian card in front, clean copy, real-time balance sync).
"""

import os
import sys
import json
import time
import base64
import asyncio
import subprocess
import urllib.request
import websockets

CHROME_BIN = '/usr/bin/google-chrome'
if not os.path.exists(CHROME_BIN):
    candidates = [
        '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ]
    for c in candidates:
        if os.path.exists(c):
            CHROME_BIN = c
            break
INDEX_HTML_PATH = os.path.abspath('index.html')
SW_JS_PATH = os.path.abspath('sw.js')
EXPORT_PATH = '/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'
if not os.path.exists(EXPORT_PATH) and os.path.exists('/tmp/ExpenseManager_Production_Export_2026-11-16.json'):
    EXPORT_PATH = '/tmp/ExpenseManager_Production_Export_2026-11-16.json'
SCREENSHOT_DIR = os.path.abspath('scratch')

async def run_focused_tests():
    print("=" * 80)
    print("EXPENSE MANAGER — PHASE 3 FOCUSED CORRECTIONS TEST SUITE")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # Static PWA and File Verification
    # -------------------------------------------------------------------------
    print("\n--- Running Static Architecture & PWA Checks ---")
    static_checks = []

    # Check 1: sw.js CACHE_NAME
    with open(SW_JS_PATH, 'r', encoding='utf-8') as f:
        sw_content = f.read()

    has_v122_cache = ("const CACHE_NAME = 'em-v122';" in sw_content) or ("const CACHE_NAME = 'em-v123';" in sw_content)
    static_checks.append(('PWA', "sw.js CACHE_NAME is bumped to 'em-v122' or later", has_v122_cache))

    # Check 2: sw.js ASSETS contains modern scripts
    required_assets = [
        './js/supabase-config.js',
        './js/supabaseClient.js',
        './js/country-config.js',
        './js/storage.js',
        './js/wallet.js',
        './js/charts.js',
        './js/onboarding.js',
        './js/app.js'
    ]
    for asset in required_assets:
        has_asset = f"'{asset}'" in sw_content
        static_checks.append(('PWA', f"sw.js manifest includes {asset}", has_asset))

    # Check 3: index.html script tag versions
    with open(INDEX_HTML_PATH, 'r', encoding='utf-8') as f:
        index_content = f.read()

    has_index_v122 = ('js/onboarding.js?v=20261117_v122' in index_content or 'js/onboarding.js?v=20261118_v123' in index_content) and ('js/storage.js?v=20261117_v122' in index_content or 'js/storage.js?v=20261118_v123' in index_content)
    static_checks.append(('PWA', "index.html script tags use ?v=20261117_v122 or later", has_index_v122))

    # Check 4: #sync-error-screen present in index.html
    has_sync_screen = 'id="sync-error-screen"' in index_content and 'id="sync-retry-btn"' in index_content
    static_checks.append(('SYNC', "index.html contains #sync-error-screen and #sync-retry-btn", has_sync_screen))

    # Check 5: No 'treasury' copy in index.html
    has_no_treasury_title = 'Cross-border finances,<br>unified in one ledger.' in index_content
    static_checks.append(('DESIGN', "index.html uses refined cross-border copy (no corporate treasury phrasing)", has_no_treasury_title))

    # Check 6: Production export exists
    has_prod = os.path.exists(EXPORT_PATH)
    static_checks.append(('PROD', "Production fixture is accessible", has_prod))

    for cat, title, passed in static_checks:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  [{status}] [{cat}] {title}")

    if not all(p for _, _, p in static_checks):
        print("\n❌ Static checks failed. Aborting dynamic browser suite.")
        sys.exit(1)

    with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
        export_data = json.load(f)
    prod_state = export_data.get('state', export_data)

    # -------------------------------------------------------------------------
    # Launch Headless Chrome for Live DOM Execution
    # -------------------------------------------------------------------------
    profile_dir = f'/tmp/phase3_focused_profile_{int(time.time())}'
    port = 9520
    cmd = [
        CHROME_BIN,
        "--headless=new",
        f"--remote-debugging-port={port}",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1440,900",
        f"--user-data-dir={profile_dir}",
        f"file://{INDEX_HTML_PATH}"
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    try:
        targets_url = f"http://127.0.0.1:{port}/json"
        with urllib.request.urlopen(targets_url) as resp:
            targets = json.loads(resp.read().decode())
        ws_url = [t for t in targets if t.get("type") == "page"][0]["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url) as ws:
            msg_id = 0
            async def send(method, params=None):
                nonlocal msg_id
                msg_id += 1
                payload = {'id': msg_id, 'method': method}
                if params: payload['params'] = params
                await ws.send(json.dumps(payload))
                while True:
                    resp_raw = await ws.recv()
                    data = json.loads(resp_raw)
                    if data.get('id') == msg_id:
                        return data.get('result', {})

            await send("Page.enable")
            await send("Runtime.enable")
            await send("Emulation.setDeviceMetricsOverride", {
                "width": 1440,
                "height": 900,
                "deviceScaleFactor": 1,
                "mobile": False
            })

            async def capture_screen(filename):
                res = await send("Page.captureScreenshot", {"format": "png"})
                if res and 'data' in res:
                    img_data = base64.b64decode(res['data'])
                    out_path = os.path.join(SCREENSHOT_DIR, filename)
                    with open(out_path, 'wb') as f:
                        f.write(img_data)
                    print(f"  [📸 Screenshot Captured] {out_path}")

            complex_name = "Grandma's \"Special\" Fund <script>alert(\"xss\")</script> 💰"
            complex_wallet_json = json.dumps(complex_name)

            test_script = f"""
            (async () => {{
                const results = {{ checks: [] }};
                function assert(id, title, condition, details = '') {{
                    results.checks.push({{ id, title, pass: !!condition, details: String(details) }});
                }}

                const prodFixture = {json.dumps(prod_state)};
                const complexWalletName = {complex_wallet_json};

                // =============================================================
                // SUITE 1: Destination Step Persistence on Next / Back Navigation
                // =============================================================
                {{
                    window.localStorage.clear();
                    storage.onUserLogout();

                    window.supabaseClient.session = {{ user: {{ id: 'user_draft_nav', email: 'nav@example.com' }} }};
                    window.supabaseClient.client = {{
                        from: () => ({{
                            select: () => ({{ eq: () => ({{ single: async () => ({{ data: null, error: {{ code: 'PGRST116' }} }}) }}) }}),
                            upsert: async () => ({{ error: null }})
                        }})
                    }};

                    await window.supabaseClient.updateUI();

                    assert('NAV_1', 'Starts at Step 1', onboardingController.currentStep === 1);

                    // Click Next (advances to Step 2)
                    onboardingController.handleNext();
                    assert('NAV_2', 'Advanced to Step 2 in memory', onboardingController.currentStep === 2);
                    assert('NAV_3', 'Destination Step 2 saved in storage.state.preferences', storage.state.preferences.onboardingStep === 2);

                    // Re-read from localStorage directly to verify persistence
                    const rawSaved1 = JSON.parse(window.localStorage.getItem(storage.getActiveStorageKey()) || '{{}}');
                    assert('NAV_4', 'Destination Step 2 saved to localStorage', rawSaved1.preferences && rawSaved1.preferences.onboardingStep === 2);

                    // Advance to Step 3
                    onboardingController.handleNext();
                    assert('NAV_5', 'Advanced to Step 3 in memory', onboardingController.currentStep === 3);
                    assert('NAV_6', 'Destination Step 3 saved in storage.state.preferences', storage.state.preferences.onboardingStep === 3);

                    // Advance to Step 4
                    onboardingController.handleNext();
                    assert('NAV_7', 'Advanced to Step 4 in memory', onboardingController.currentStep === 4);
                    assert('NAV_8', 'Destination Step 4 saved in storage.state.preferences', storage.state.preferences.onboardingStep === 4);

                    // Navigate BACK to Step 3
                    onboardingController.handleBack();
                    assert('NAV_9', 'Retreated to Step 3 in memory', onboardingController.currentStep === 3);
                    assert('NAV_10', 'Destination Step 3 saved upon backward navigation', storage.state.preferences.onboardingStep === 3);

                    const rawSavedBack = JSON.parse(window.localStorage.getItem(storage.getActiveStorageKey()) || '{{}}');
                    assert('NAV_11', 'Destination Step 3 saved to localStorage upon back', rawSavedBack.preferences && rawSavedBack.preferences.onboardingStep === 3);
                }}

                // =============================================================
                // SUITE 2: Interrupted Session & Browser Refresh Recovery
                // =============================================================
                {{
                    // User is at Step 3. Let's customize countries, budgets, wallets, and balances
                    onboardingController.toggleCountry('DE'); // Activates DE and initializes DE starter wallets
                    onboardingController.setPrimaryCountry('JP');
                    onboardingController.setBudgetAmount('JP', 85000);
                    onboardingController.setBudgetAmount('DE', 2500);
                    onboardingController.toggleBudgetEnabled('DE', true);
                    onboardingController.setWalletBalance('Salary Account', 150000);
                    onboardingController.setWalletBalance('Cash', 20000);
                    onboardingController.setWalletBalance('Checking Account', 3500);

                    // Save draft locally
                    onboardingController.persistDraftLocally();

                    // Count wallets before simulated refresh
                    const walletCountBefore = Object.keys(onboardingController.draft.wallets).length;

                    // SIMULATE BROWSER REFRESH: re-run storage.loadData() and onboardingController.init()
                    storage.loadData();
                    onboardingController.init();

                    assert('RECOVERY_1', 'Step 3 restored on refresh', onboardingController.currentStep === 3);
                    assert('RECOVERY_2', 'Active countries restored (JP, DE)', onboardingController.draft.activeCountries.length === 2 && onboardingController.draft.activeCountries.includes('DE'));
                    assert('RECOVERY_3', 'Primary country restored as JP', onboardingController.draft.defaultCountry === 'JP');
                    assert('RECOVERY_4', 'JP budget amount restored to 85000', onboardingController.draft.budgets.JP.monthlyTotal === 85000);
                    assert('RECOVERY_5', 'DE budget amount restored to 2500', onboardingController.draft.budgets.DE.monthlyTotal === 2500);
                    assert('RECOVERY_6', 'DE budget enabled restored to true', onboardingController.draft.budgets.DE.enabled === true);
                    assert('RECOVERY_7', 'Salary Account balance restored to 150000', onboardingController.draft.wallets['Salary Account']?.balance === 150000);
                    assert('RECOVERY_8', 'Cash balance restored to 20000', onboardingController.draft.wallets['Cash']?.balance === 20000);
                    assert('RECOVERY_9', 'Checking Account balance restored to 3500', onboardingController.draft.wallets['Checking Account']?.balance === 3500);

                    // Verify NO WALLET DUPLICATION occurred on refresh
                    const walletCountAfter = Object.keys(onboardingController.draft.wallets).length;
                    assert('RECOVERY_10', 'No wallet duplication on refresh', walletCountAfter === walletCountBefore);
                }}

                // =============================================================
                // SUITE 3: Safe Input Rendering & Event Delegation
                // =============================================================
                {{
                    // Test special wallet names with quotes, apostrophes, Unicode, and script tags
                    onboardingController.draft.wallets[complexWalletName] = {{
                        id: complexWalletName,
                        name: complexWalletName,
                        type: 'bank',
                        region: 'JP',
                        currency: '¥',
                        color: '#3b82f6',
                        balance: 50000
                    }};

                    onboardingController.renderStep3();

                    const step3El = document.getElementById('onboarding-step-3');
                    const renderedHtml = step3El.innerHTML;

                    // Verify raw script tag was NOT inserted into HTML
                    assert('SAFE_1', 'Script tag is properly escaped (no raw <script>)', !renderedHtml.includes('<script>alert('));
                    assert('SAFE_2', 'Script tag rendered as HTML entities', renderedHtml.includes('&lt;script&gt;alert'));
                    assert('SAFE_3', 'Apostrophe escaped in attribute', renderedHtml.includes('&#39;') || renderedHtml.includes('&quot;'));

                    // Verify that no inline onclick or oninput handlers have the unescaped wallet string
                    assert('SAFE_4', 'No inline onclick interpolating raw complex wallet ID', !renderedHtml.includes("deleteWallet('Grandma") && !renderedHtml.includes('deleteWallet("Grandma'));

                    // Verify balance input element has data-wallet-id matching complex name
                    const balanceInputs = Array.from(step3El.querySelectorAll('.onboarding-balance-input'));
                    const targetInput = balanceInputs.find(inp => inp.getAttribute('data-wallet-id') === complexWalletName);
                    assert('SAFE_5', 'Input element successfully retrieved data-wallet-id attribute', !!targetInput);
                    assert('SAFE_6', 'Input has initial value 50000', targetInput && targetInput.value === '50000');

                    // Test Event Delegation: simulate user typing in balance input
                    if (targetInput) {{
                        targetInput.value = '75000';
                        targetInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        assert('SAFE_7', 'Event delegation updated complex wallet balance to 75000', onboardingController.draft.wallets[complexWalletName].balance === 75000);
                    }}

                    // Test Event Delegation: simulate clicking delete button
                    const deleteButtons = Array.from(step3El.querySelectorAll('.onboarding-wallet-delete-btn'));
                    const targetDelete = deleteButtons.find(btn => btn.getAttribute('data-wallet-id') === complexWalletName);
                    assert('SAFE_8', 'Delete button has matching data-wallet-id', !!targetDelete);

                    if (targetDelete) {{
                        targetDelete.click();
                        assert('SAFE_9', 'Event delegation safely deleted complex wallet', !onboardingController.draft.wallets[complexWalletName]);
                    }}
                }}

                // =============================================================
                // SUITE 4: Cloud Sync Failure (SYNC_FAILED) & Retry Screen
                // =============================================================
                {{
                    window.localStorage.clear();
                    storage.onUserLogout();

                    // Simulate a network failure on initial sync
                    window.supabaseClient.session = {{ user: {{ id: 'user_sync_fail', email: 'syncfail@example.com' }} }};
                    window.supabaseClient.client = {{
                        from: () => ({{
                            select: () => ({{
                                eq: () => ({{
                                    single: async () => ({{
                                        data: null,
                                        error: {{ message: 'Failed to fetch (net::ERR_INTERNET_DISCONNECTED)' }}
                                    }})
                                }})
                            }})
                        }})
                    }};

                    await window.supabaseClient.updateUI();

                    const syncErrorScreen = document.getElementById('sync-error-screen');
                    const appContent = document.getElementById('app-content');
                    const obScreen = document.getElementById('onboarding-screen');
                    const errorDetails = document.getElementById('sync-error-details');

                    assert('SYNC_1', 'Account status is SYNC_FAILED', storage.getAccountStatus() === 'SYNC_FAILED');
                    assert('SYNC_2', 'Sync error screen is displayed', syncErrorScreen && syncErrorScreen.style.display === 'flex');
                    assert('SYNC_3', 'App content is strictly hidden', appContent && appContent.style.display === 'none');
                    assert('SYNC_4', 'Onboarding screen is strictly hidden', obScreen && obScreen.style.display === 'none');
                    assert('SYNC_5', 'Error details displayed to user', errorDetails && errorDetails.textContent.includes('Failed to fetch'));
                    assert('SYNC_6', 'Storage refused to mark as NEW_USER', storage.isNewUser() === false);

                    // Test retryInitialSync recovery
                    window.supabaseClient.client = {{
                        from: () => ({{
                            select: () => ({{
                                eq: () => ({{
                                    single: async () => ({{
                                        data: null,
                                        error: {{ code: 'PGRST116' }} // Row not found = new user
                                    }})
                                }})
                            }})
                        }})
                    }};

                    await window.supabaseClient.retryInitialSync();

                    assert('SYNC_7', 'After retry, sync error screen is hidden', syncErrorScreen && syncErrorScreen.style.display === 'none');
                    assert('SYNC_8', 'After retry, onboarding screen is shown for genuine new user', obScreen && obScreen.style.display === 'flex');
                }}

                // =============================================================
                // SUITE 5: Loan Tracking Optionality & Dynamic Regional Currency
                // =============================================================
                {{
                    // Fresh start for Japan-only user
                    onboardingController.init();
                    onboardingController.draft.activeCountries = ['JP'];
                    onboardingController.draft.defaultCountry = 'JP';

                    onboardingController.currentStep = 4;
                    onboardingController.renderStep4();

                    assert('LOAN_1', 'Loan tracking disabled by default', onboardingController.draft.loanConfig.enabled === false);
                    assert('LOAN_2', 'Japan-only loan currency defaults to ¥', onboardingController.draft.loanConfig.currency === '¥');

                    const step4El = document.getElementById('onboarding-step-4');
                    assert('LOAN_3', 'Restrained loan wording present', step4El.textContent.includes('Monitor your loan principal balance and monthly payment benchmark'));
                    assert('LOAN_4', 'Summary reflects loan disabled', step4El.textContent.includes('Disabled'));

                    // Test Germany-only user
                    onboardingController.draft.activeCountries = ['DE'];
                    onboardingController.draft.defaultCountry = 'DE';
                    onboardingController.renderStep4();
                    assert('LOAN_5', 'Germany-only loan currency defaults to €', onboardingController.draft.loanConfig.currency === '€');

                    // Test India-active user
                    onboardingController.draft.activeCountries = ['IN', 'JP'];
                    onboardingController.draft.loanConfig.country = 'IN';
                    onboardingController.renderStep4();
                    assert('LOAN_6', 'India active loan currency is ₹', onboardingController.draft.loanConfig.currency === '₹');

                    // Enable loan tracking and set benchmark amounts
                    onboardingController.toggleLoanTracking(true);
                    onboardingController.setLoanField('totalPrincipal', 1500000);
                    onboardingController.setLoanField('principalLeft', 1200000);
                    onboardingController.setLoanField('emi', 25000);
                    onboardingController.renderStep4();

                    assert('LOAN_7', 'Loan tracking enabled in draft', onboardingController.draft.loanConfig.enabled === true);
                    assert('LOAN_8', 'Summary reflects enabled loan with currency and balance', step4El.textContent.includes('Enabled (₹1,200,000 remaining)'));
                }}

                // =============================================================
                // SUITE 6: Live Showcase Card Cascade & Reactive Balance Sync
                // =============================================================
                {{
                    onboardingController.draft.activeCountries = ['JP', 'DE', 'IN'];
                    onboardingController.draft.wallets = {{
                        'Salary Account': {{ id: 'Salary Account', region: 'JP', balance: 500000 }},
                        'Cash': {{ id: 'Cash', region: 'JP', balance: 50000 }},
                        'Checking Account': {{ id: 'Checking Account', region: 'DE', balance: 4200 }},
                        'Bank Account': {{ id: 'Bank Account', region: 'IN', balance: 180000 }}
                    }};

                    onboardingController.updateLiveShowcase();

                    const showcase = document.getElementById('onboarding-live-showcase');
                    const jpCard = showcase.querySelector('.auth-card-jp');
                    const inCard = showcase.querySelector('.auth-card-in');
                    const deCard = showcase.querySelector('.auth-card-de');

                    assert('CASCADE_1', 'Live showcase renders JPY card', !!jpCard);
                    assert('CASCADE_2', 'Live showcase renders INR card', !!inCard);
                    assert('CASCADE_3', 'Live showcase renders EUR card', !!deCard);

                    // Check z-index hierarchy: INR card in the forefront
                    const inZ = parseInt(inCard.style.zIndex, 10);
                    const jpZ = parseInt(jpCard.style.zIndex, 10);
                    const deZ = parseInt(deCard.style.zIndex, 10);

                    assert('CASCADE_4', 'INR card has highest z-index in 3-tier cascade', inZ > jpZ && inZ > deZ);

                    // Check real-time reactive balance calculation
                    assert('CASCADE_5', 'JPY card displays summed balance ¥ 550,000', jpCard.querySelector('.auth-card-balance').textContent.includes('550,000'));
                    assert('CASCADE_6', 'EUR card displays balance € 4,200', deCard.querySelector('.auth-card-balance').textContent.includes('4,200'));
                    assert('CASCADE_7', 'INR card displays balance ₹ 180,000', inCard.querySelector('.auth-card-balance').textContent.includes('180,000'));

                    // Test live reactivity: update salary account and verify instant card balance sync
                    onboardingController.setWalletBalance('Salary Account', 750000);
                    const updatedJpCard = showcase.querySelector('.auth-card-jp');
                    assert('CASCADE_8', 'Reactive update: JPY card instantly updates to ¥ 800,000', updatedJpCard && updatedJpCard.querySelector('.auth-card-balance').textContent.includes('800,000'));
                }}

                return results;
            }})();
            """

            eval_res = await send("Runtime.evaluate", {
                "expression": test_script,
                "awaitPromise": True,
                "returnByValue": True
            })

            if 'exceptionDetails' in eval_res:
                print("FAILED test execution:", eval_res['exceptionDetails'])
                return False

            val = eval_res.get('result', {}).get('value', {})
            checks = val.get('checks', [])

            # Take visual verification screenshots
            await capture_screen('focused_corrections_desktop_cascade.png')

            print(f"\nTotal Focused Checks: {len(checks)}")
            passed_checks = [c for c in checks if c['pass']]
            failed_checks = [c for c in checks if not c['pass']]

            print(f"Passed: {len(passed_checks)}")
            print(f"Failed: {len(failed_checks)}")

            print("\n--- DETAILED CHECK RESULTS ---")
            current_suite = ""
            for i, c in enumerate(checks, 1):
                suite = c['id'].split('_')[0]
                if suite != current_suite:
                    current_suite = suite
                    print(f"\n[{current_suite}]")
                status = "✅ PASS" if c['pass'] else "❌ FAIL"
                print(f"  {i:2d}. [{status}] {c['title']}")
                if not c['pass'] and c.get('details'):
                    print(f"       Details: {c['details']}")

            print("\n" + "=" * 80)
            if failed_checks:
                print(f"❌ {len(failed_checks)} CHECKS FAILED!")
                return False
            else:
                print("🎉 ALL FOCUSED CORRECTIONS CHECKS PASSED WITH 100% SUCCESS!")
                print("=" * 80)
                return True

    finally:
        proc.terminate()

if __name__ == '__main__':
    success = asyncio.run(run_focused_tests())
    sys.exit(0 if success else 1)
