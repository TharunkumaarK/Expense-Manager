#!/usr/bin/env python3
"""
Expense Manager — Phase 3 Desktop Onboarding Verification Suite
---------------------------------------------------------------
Executes in an isolated headless Chromium instance (1440x900 desktop viewport).
Verifies the complete desktop onboarding experience:
1. Onboarding activation for new users.
2. Step 1 (Sovereign Country selection & live showcase).
3. Step 2 (Independent Country Budgets).
4. Step 3 (Mandatory Wallets & Opening Balances with English-alone naming).
5. Step 4 (Optional Loans & Configuration Review).
6. Back navigation and local draft state preservation.
7. Cloud failure recovery on Step 4 (Blocking Cloud Requirement).
8. Cloud retry success and transition to main dashboard.
9. Existing production user bypass (zero disruption).
10. Desktop visual screenshot captures.
"""

import subprocess
import json
import time
import urllib.request
import asyncio
import os
import sys
import websockets
import base64

CHROME_BIN = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'
EXPORT_PATH = '/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'
INDEX_HTML_PATH = os.path.abspath('index.html')
SCREENSHOT_DIR = os.path.abspath('scratch')

async def run_phase3_desktop_tests():
    print("=" * 80)
    print("EXPENSE MANAGER — PHASE 3 DESKTOP ONBOARDING VERIFICATION SUITE")
    print("=" * 80)

    if not os.path.exists(EXPORT_PATH):
        print(f"Error: Production export not found at {EXPORT_PATH}")
        sys.exit(1)

    with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
        export_wrapper = json.load(f)
    prod_state = export_wrapper.get('state', export_wrapper)

    profile_dir = f'/tmp/phase3_desktop_profile_{int(time.time())}'
    port = 9502
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

            # Helper for taking screenshots
            async def capture_screen(filename):
                res = await send("Page.captureScreenshot", {"format": "png"})
                if res and 'data' in res:
                    img_data = base64.b64decode(res['data'])
                    out_path = os.path.join(SCREENSHOT_DIR, filename)
                    with open(out_path, 'wb') as f:
                        f.write(img_data)
                    print(f"  [📸 Screenshot Captured] {out_path}")

            # Combined test script running inside live DOM
            test_script = f"""
            (async () => {{
                const results = {{ checks: [] }};
                function assert(id, title, condition, details = '') {{
                    results.checks.push({{ id, title, pass: !!condition, details: String(details) }});
                }}

                const prodFixture = {json.dumps(prod_state)};

                // -------------------------------------------------------------
                // TEST 1: New User Sign-in & Onboarding Activation
                // -------------------------------------------------------------
                {{
                    window.localStorage.clear();
                    storage.onUserLogout();

                    // Mock Supabase new user session
                    window.supabaseClient.session = {{ user: {{ id: 'user_desktop_new', email: 'newuser@example.com' }} }};
                    window.supabaseClient.client = {{
                        from: (table) => ({{
                            select: () => ({{
                                eq: () => ({{
                                    single: async () => ({{
                                        data: null,
                                        error: {{ code: 'PGRST116', message: 'Row not found' }}
                                    }})
                                }})
                            }}),
                            upsert: async () => ({{ error: null }})
                        }})
                    }};

                    // Run updateUI (simulates sign-in flow)
                    await window.supabaseClient.updateUI();

                    const obScreen = document.getElementById('onboarding-screen');
                    const appContent = document.getElementById('app-content');
                    const authScreen = document.getElementById('auth-screen');

                    assert('T1', 'Onboarding screen is visible', obScreen && obScreen.style.display === 'flex');
                    assert('T1', 'App content is hidden during onboarding', appContent && appContent.style.display === 'none');
                    assert('T1', 'Auth screen is hidden', authScreen && authScreen.style.display === 'none');
                    assert('T1', 'Step 1 is active initially', onboardingController.currentStep === 1);

                    const stepIndicator = document.getElementById('onboarding-step-indicator');
                    assert('T1', 'Step indicator displays Step 1 of 4', stepIndicator && stepIndicator.textContent.includes('Step 1 of 4'));
                }}

                // -------------------------------------------------------------
                // TEST 2: Step 1 (Sovereign Countries & Live Showcase)
                // -------------------------------------------------------------
                {{
                    // Initially JP is active
                    assert('T2', 'Initial active countries contains JP', onboardingController.draft.activeCountries.includes('JP'));

                    // Select Germany and India
                    onboardingController.toggleCountry('DE');
                    onboardingController.toggleCountry('IN');

                    assert('T2', 'Active countries now has 3 regions (JP, DE, IN)', onboardingController.draft.activeCountries.length === 3);

                    // Check live showcase code-rendered cards
                    const showcase = document.getElementById('onboarding-live-showcase');
                    const hasJpCard = showcase.querySelector('.auth-card-jp') !== null;
                    const hasInCard = showcase.querySelector('.auth-card-in') !== null;
                    const hasDeCard = showcase.querySelector('.auth-card-de') !== null;

                    assert('T2', 'Live showcase renders JPY Tokyo Slate card', hasJpCard);
                    assert('T2', 'Live showcase renders INR Bengaluru card', hasInCard);
                    assert('T2', 'Live showcase renders EUR Frankfurt card', hasDeCard);

                    const inCard = showcase.querySelector('.auth-card-in');
                    const inZIndex = inCard ? parseInt(inCard.style.zIndex, 10) : 0;
                    const allCards = Array.from(showcase.querySelectorAll('.auth-card-preview'));
                    const maxZ = Math.max(...allCards.map(c => parseInt(c.style.zIndex, 10) || 0));
                    assert('T2', 'INR card is in the front of the cascade (highest z-index)', inZIndex === maxZ && inZIndex > 1);

                    // Verify validation: cannot unselect all countries
                    onboardingController.toggleCountry('JP');
                    onboardingController.toggleCountry('DE');
                    // IN is only one left, attempt to remove IN
                    onboardingController.toggleCountry('IN');
                    assert('T2', 'Cannot deselect all countries (IN remains)', onboardingController.draft.activeCountries.length === 1);

                    // Re-add JP and DE for full flow
                    onboardingController.toggleCountry('JP');
                    onboardingController.toggleCountry('DE');
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
                print("FAILED test execution Part 1:", eval_res['exceptionDetails'])
                return False

            checks_part1 = eval_res.get('result', {}).get('value', {}).get('checks', [])
            await capture_screen("desktop_onboarding_step1.png")

            # Part 2: Step 2, Step 3, Step 4 & Recovery
            test_script_part2 = """
            (async () => {
                const results = { checks: [] };
                function assert(id, title, condition, details = '') {
                    results.checks.push({ id, title, pass: !!condition, details: String(details) });
                }

                // Advance to Step 2
                onboardingController.handleNext();
                assert('T3', 'Advanced to Step 2', onboardingController.currentStep === 2);
                const step2El = document.getElementById('onboarding-step-2');
                assert('T3', 'Step 2 DOM element is displayed', step2El && step2El.style.display === 'block');

                // Configure Budgets on Step 2
                onboardingController.setBudgetAmount('JP', 70000);
                onboardingController.setBudgetAmount('DE', 2000);
                onboardingController.toggleBudgetEnabled('DE', true);
                onboardingController.toggleBudgetRollover('DE', true);

                assert('T3', 'JP budget draft updated to 70000', onboardingController.draft.budgets.JP.monthlyTotal === 70000);
                assert('T3', 'DE budget draft updated to 2000', onboardingController.draft.budgets.DE.monthlyTotal === 2000);
                assert('T3', 'DE budget enabled is true', onboardingController.draft.budgets.DE.enabled === true);

                return results;
            })();
            """

            eval_res2 = await send("Runtime.evaluate", {
                "expression": test_script_part2,
                "awaitPromise": True,
                "returnByValue": True
            })
            checks_part2 = eval_res2.get('result', {}).get('value', {}).get('checks', [])
            await capture_screen("desktop_onboarding_step2.png")

            # Part 3: Step 3 (Wallets & Balances)
            test_script_part3 = """
            (async () => {
                const results = { checks: [] };
                function assert(id, title, condition, details = '') {
                    results.checks.push({ id, title, pass: !!condition, details: String(details) });
                }

                // Advance to Step 3
                onboardingController.handleNext();
                assert('T4', 'Advanced to Step 3', onboardingController.currentStep === 3);

                // Verify English-alone starter accounts
                const wallets = Object.values(onboardingController.draft.wallets);
                const walletNames = wallets.map(w => w.name);

                assert('T4', 'JP Salary Account exists in draft', walletNames.includes('Salary Account'));
                assert('T4', 'IN Bank Account exists in draft', walletNames.includes('Bank Account'));
                assert('T4', 'DE Checking Account exists in English (no Girokonto)', walletNames.includes('Checking Account'));
                assert('T4', 'DE Cash exists in English (no Bargeld)', wallets.some(w => w.name === 'Cash' && w.region === 'DE'));

                // Set opening balances
                onboardingController.setWalletBalance('Salary Account', 85000);
                onboardingController.setWalletBalance('Checking Account', 3200);
                onboardingController.setWalletBalance('Bank Account', 45000);

                assert('T4', 'Salary Account balance updated to 85000', onboardingController.draft.wallets['Salary Account'].balance === 85000);
                assert('T4', 'Checking Account balance updated to 3200', onboardingController.draft.wallets['Checking Account'].balance === 3200);
                assert('T4', 'Bank Account balance updated to 45000', onboardingController.draft.wallets['Bank Account'].balance === 45000);

                // Verify draft progress saved locally without cloud push
                onboardingController.persistDraftLocally();
                assert('T4', 'storage.state has draft balances', storage.state.wallets['Salary Account'].balance === 85000);
                assert('T4', 'storage.state onboardingCompleted is false', storage.state.preferences.onboardingCompleted === false);

                return results;
            })();
            """

            eval_res3 = await send("Runtime.evaluate", {
                "expression": test_script_part3,
                "awaitPromise": True,
                "returnByValue": True
            })
            checks_part3 = eval_res3.get('result', {}).get('value', {}).get('checks', [])
            await capture_screen("desktop_onboarding_step3.png")

            # Part 4a: Step 4 (Loans & Review)
            test_script_part4a = """
            (async () => {
                const results = { checks: [] };
                function assert(id, title, condition, details = '') {
                    results.checks.push({ id, title, pass: !!condition, details: String(details) });
                }

                // Advance to Step 4
                onboardingController.handleNext();
                assert('T5', 'Advanced to Step 4', onboardingController.currentStep === 4);

                // Configure Optional Loan
                onboardingController.toggleLoanTracking(true);
                onboardingController.setLoanField('totalPrincipal', 300000);
                onboardingController.setLoanField('principalLeft', 270000);
                onboardingController.setLoanField('emi', 9500);

                assert('T5', 'Loan enabled in draft', onboardingController.draft.loanConfig.enabled === true);
                assert('T5', 'Loan principal is 300000', onboardingController.draft.loanConfig.totalPrincipal === 300000);

                return results;
            })();
            """

            eval_res4a = await send("Runtime.evaluate", {
                "expression": test_script_part4a,
                "awaitPromise": True,
                "returnByValue": True
            })
            checks_part4a = eval_res4a.get('result', {}).get('value', {}).get('checks', [])
            await capture_screen("desktop_onboarding_step4_review.png")

            # Part 4b: Back Navigation, Cloud Failure & Launch
            test_script_part4b = """
            (async () => {
                const results = { checks: [] };
                function assert(id, title, condition, details = '') {
                    results.checks.push({ id, title, pass: !!condition, details: String(details) });
                }

                // Test Back navigation: go back to Step 3 then back to Step 4
                onboardingController.handleBack();
                assert('T5', 'Back navigation returns to Step 3', onboardingController.currentStep === 3);
                assert('T5', 'Balances preserved after back navigation', onboardingController.draft.wallets['Salary Account'].balance === 85000);
                onboardingController.handleNext();
                assert('T5', 'Forward navigation returns to Step 4', onboardingController.currentStep === 4);

                // Test Cloud Failure on Step 4 (Blocking Cloud Requirement)
                window.supabaseClient.client = {
                    from: (table) => ({
                        upsert: async () => ({
                            error: { message: 'HTTP 503 Network Unavailable', code: '503' }
                        })
                    })
                };

                await onboardingController.confirmAndLaunch();

                assert('T5', 'Cloud failure keeps user on Step 4 (blocking cloud requirement)', onboardingController.currentStep === 4);
                assert('T5', 'App content remains hidden on cloud failure', document.getElementById('app-content').style.display === 'none');
                assert('T5', 'Onboarding screen remains displayed', document.getElementById('onboarding-screen').style.display === 'flex');
                assert('T5', 'Error banner is displayed', document.getElementById('onboarding-error-banner').style.display === 'block');
                assert('T5', 'Retry button displayed with Retry Cloud Sync text', document.getElementById('onboarding-next-text').textContent.includes('Retry Cloud Sync'));
                assert('T5', 'Local storage safely preserved completed config', storage.state.preferences.onboardingCompleted === true);

                return results;
            })();
            """

            eval_res4b = await send("Runtime.evaluate", {
                "expression": test_script_part4b,
                "awaitPromise": True,
                "returnByValue": True
            })
            checks_part4b = eval_res4b.get('result', {}).get('value', {}).get('checks', [])
            await capture_screen("desktop_onboarding_step4_cloud_error.png")

            # Part 4c: Successful Cloud Retry & App Launch
            test_script_part4c = """
            (async () => {
                const results = { checks: [] };
                function assert(id, title, condition, details = '') {
                    results.checks.push({ id, title, pass: !!condition, details: String(details) });
                }

                // Test Cloud Retry Success
                window.supabaseClient.client = {
                    from: (table) => ({
                        upsert: async () => ({ error: null })
                    })
                };

                await onboardingController.retryCloudSync();

                assert('T5', 'Successful retry hides onboarding screen', document.getElementById('onboarding-screen').style.display === 'none');
                assert('T5', 'Successful retry displays app content', document.getElementById('app-content').style.display === 'block');
                assert('T5', 'accountStatus transitioned to EXISTING_USER', storage.getAccountStatus() === 'EXISTING_USER');
                assert('T5', 'cloudSyncStatus is CONFIRMED', storage.getCloudSyncStatus() === 'CONFIRMED');

                return results;
            })();
            """

            eval_res4c = await send("Runtime.evaluate", {
                "expression": test_script_part4c,
                "awaitPromise": True,
                "returnByValue": True
            })
            checks_part4c = eval_res4c.get('result', {}).get('value', {}).get('checks', [])
            await capture_screen("desktop_onboarding_step4_and_launch.png")

            checks_part4 = checks_part4a + checks_part4b + checks_part4c

            # Part 5: Existing User Bypass Verification
            test_script_part5 = f"""
            (async () => {{
                const results = {{ checks: [] }};
                function assert(id, title, condition, details = '') {{
                    results.checks.push({{ id, title, pass: !!condition, details: String(details) }});
                }}

                // Existing production user login simulation
                window.localStorage.clear();
                storage.onUserLogout();

                window.supabaseClient.session = {{ user: {{ id: 'user_prod_existing', email: 'existing@example.com' }} }};
                window.supabaseClient.client = {{
                    from: (table) => ({{
                        select: () => ({{
                            eq: () => ({{
                                single: async () => ({{
                                    data: {{
                                        state: {json.dumps(prod_state)},
                                        updated_at: '2026-11-17T12:00:00Z'
                                    }},
                                    error: null
                                }})
                            }})
                        }}),
                        upsert: async () => ({{ error: null }})
                    }})
                }};

                await window.supabaseClient.updateUI();

                const obScreen = document.getElementById('onboarding-screen');
                const appContent = document.getElementById('app-content');

                assert('T6', 'Existing production user bypasses onboarding', obScreen.style.display === 'none');
                assert('T6', 'Existing user app content displays immediately', appContent.style.display === 'block');
                assert('T6', 'Existing user account status is EXISTING_USER', storage.getAccountStatus() === 'EXISTING_USER');
                assert('T6', 'All 116 production transactions intact', storage.state.transactions.length === 116);

                return results;
            }})();
            """

            eval_res5 = await send("Runtime.evaluate", {
                "expression": test_script_part5,
                "awaitPromise": True,
                "returnByValue": True
            })
            checks_part5 = eval_res5.get('result', {}).get('value', {}).get('checks', [])

            all_checks = checks_part1 + checks_part2 + checks_part3 + checks_part4 + checks_part5
            return {"checks": all_checks}

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
        subprocess.run(['rm', '-rf', profile_dir], check=False)

def main():
    results = asyncio.run(run_phase3_desktop_tests())
    if not results:
        print("❌ Test execution failed!")
        sys.exit(1)

    checks = results.get('checks', [])
    print(f"\nTotal Phase 3 Desktop Checks: {len(checks)}")
    passed = [c for c in checks if c['pass']]
    failed = [c for c in checks if not c['pass']]

    print(f"Passed: {len(passed)}")
    print(f"Failed: {len(failed)}")

    print("\n--- DETAILED CHECK RESULTS ---")
    current_tc = ""
    for i, c in enumerate(checks, 1):
        if c['id'] != current_tc:
            current_tc = c['id']
            print(f"\n[{current_tc}]")
        status_sym = "✅ PASS" if c['pass'] else "❌ FAIL"
        print(f"  {i:2d}. [{status_sym}] {c['title']}")
        if not c['pass'] or c['details']:
            print(f"       Details: {c['details']}")

    print("\n" + "=" * 80)
    if failed:
        print(f"❌ {len(failed)} CHECKS FAILED!")
        sys.exit(1)
    else:
        print(f"🎉 ALL {len(passed)} CHECKS PASSED WITH 100% SUCCESS!")
        print("=" * 80)

if __name__ == '__main__':
    main()
