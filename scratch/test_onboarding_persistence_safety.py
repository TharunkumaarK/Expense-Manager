#!/usr/bin/env python3
"""
Expense Manager — Onboarding Persistence Safety Verification Suite
------------------------------------------------------------------
Automated test suite executing in an isolated headless Chromium instance.
Tests the two critical account-lifecycle risks with isolated Supabase mocks:
1. Incomplete onboarding push bypass (draft opening balance isolation).
2. Completion before synchronization confirmation (dual tracking & retry).

Covers all 8 required verification scenarios:
1. New user enters a nonzero wallet opening balance.
2. New user stops onboarding before confirmation.
3. Incomplete setup attempts automatic synchronization.
4. User completes onboarding but cloud write fails.
5. User retries synchronization successfully.
6. Returning user logs in on a different device.
7. Existing legacy financial data remains intact.
8. Existing production-export financial invariants remain unchanged.
"""

import subprocess
import json
import time
import urllib.request
import asyncio
import os
import sys
import websockets

CHROME_BIN = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'
EXPORT_PATH = '/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'
COUNTRY_CONFIG_PATH = os.path.abspath('js/country-config.js')
STORAGE_JS_PATH = os.path.abspath('js/storage.js')
WALLET_JS_PATH = os.path.abspath('js/wallet.js')
APP_JS_PATH = os.path.abspath('js/app.js')

async def run_safety_tests():
    print("=" * 80)
    print("EXPENSE MANAGER — ONBOARDING PERSISTENCE SAFETY VERIFICATION SUITE")
    print("=" * 80)

    if not os.path.exists(EXPORT_PATH):
        print(f"Error: Production export not found at {EXPORT_PATH}")
        sys.exit(1)

    with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
        export_wrapper = json.load(f)
    prod_state = export_wrapper.get('state', export_wrapper)

    profile_dir = f'/tmp/safety_test_profile_{int(time.time())}'
    port = 9499
    cmd = [
        CHROME_BIN,
        "--headless=new",
        f"--remote-debugging-port={port}",
        "--disable-gpu",
        "--no-sandbox",
        f"--user-data-dir={profile_dir}",
        "about:blank"
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

            # Environment setup
            setup_script = """
            (() => {
                window.SUPABASE_CONFIG = {
                    environment: 'test',
                    projectRef: 'testref',
                    url: 'https://testref.supabase.co',
                    storageKey: 'em_connected_v2_test'
                };
                const store = {};
                window.mockLocalStorage = {
                    getItem: (k) => store[k] || null,
                    setItem: (k, v) => { store[k] = String(v); },
                    removeItem: (k) => { delete store[k]; },
                    clear: () => { for (const k in store) delete store[k]; },
                    _dump: () => store
                };
                try {
                    Object.defineProperty(window, 'localStorage', {
                        value: window.mockLocalStorage,
                        configurable: true,
                        writable: true
                    });
                } catch (e) {
                    window.localStorage = window.mockLocalStorage;
                }
            })();
            """
            await send("Runtime.evaluate", {"expression": setup_script})

            # Load JS files in dependency order
            for path, name in [(COUNTRY_CONFIG_PATH, 'CountryConfig'), (STORAGE_JS_PATH, 'Storage'), (WALLET_JS_PATH, 'Wallet'), (APP_JS_PATH, 'App')]:
                with open(path, 'r', encoding='utf-8') as f:
                    code = f.read()
                res = await send("Runtime.evaluate", {"expression": code})
                if 'exceptionDetails' in res:
                    print(f"Error evaluating {name}:", res['exceptionDetails'])
                    sys.exit(1)

            # Execution script covering all 8 Scenarios
            test_runner = f"""
            (async () => {{
                const results = {{ checks: [] }};
                function assert(id, title, condition, details = '') {{
                    results.checks.push({{ id, title, pass: !!condition, details: String(details) }});
                }}

                const prodFixture = {json.dumps(prod_state)};

                // =================================================================
                // SCENARIO 1: New user enters a nonzero wallet opening balance
                // =================================================================
                {{
                    window.localStorage.clear();
                    const s = new StorageManager();
                    let pushDispatched = false;

                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'user_opening_balance' }} }},
                        client: {{
                            from: (table) => ({{
                                select: () => ({{
                                    eq: () => ({{
                                        single: async () => ({{
                                            data: null,
                                            error: {{ code: 'PGRST116', message: 'Row not found' }}
                                        }})
                                    }})
                                }}),
                                upsert: async () => {{
                                    pushDispatched = true;
                                    return {{ error: null }};
                                }}
                            }})
                        }}
                    }};

                    await s.syncFromSupabase();
                    assert('SC-01', 'Initial status is NEW_USER', s.getAccountStatus() === 'NEW_USER');

                    // User advances to Step 3 and enters opening balance of 50000 JPY
                    s.state.preferences.onboardingStep = 3;
                    s.state.wallets['Salary Account'].balance = 50000;
                    s.saveData();

                    assert('SC-01', 'Opening balance saved to local state', s.state.wallets['Salary Account'].balance === 50000);
                    assert('SC-01', 'onboardingCompleted remains false', s.state.preferences.onboardingCompleted === false);
                    assert('SC-01', 'isDraftOnboardingConfiguration returns true', s.isDraftOnboardingConfiguration(s.state) === true);
                    assert('SC-01', 'isEstablishedLegacyFinancialData returns false for draft state', s.isEstablishedLegacyFinancialData(s.state) === false);
                    assert('SC-01', 'pushToSupabase NOT dispatched during draft onboarding with opening balance', pushDispatched === false);
                }}

                // =================================================================
                // SCENARIO 2: New user stops onboarding before confirmation
                // =================================================================
                {{
                    // User closes browser or stops at step 3. Local storage has draft.
                    const key = 'em_connected_v2_test_user_opening_balance';
                    const localRaw = window.localStorage.getItem(key);
                    assert('SC-02', 'Local storage contains draft configuration', !!localRaw);
                    const parsedLocal = JSON.parse(localRaw);
                    assert('SC-02', 'Local storage has onboardingCompleted: false', parsedLocal.preferences.onboardingCompleted === false);
                    assert('SC-02', 'Local storage preserved step 3', parsedLocal.preferences.onboardingStep === 3);
                    assert('SC-02', 'Local storage preserved 50000 opening balance', parsedLocal.wallets['Salary Account'].balance === 50000);

                    // New session starts (page reload)
                    const sReloaded = new StorageManager();
                    sReloaded.onUserLogin('user_opening_balance');
                    assert('SC-02', 'Reloaded state has onboardingCompleted: false', sReloaded.state.preferences.onboardingCompleted === false);
                    assert('SC-02', 'Reloaded state recognized as draft onboarding', sReloaded.isDraftOnboardingConfiguration(sReloaded.state) === true);
                    assert('SC-02', 'Reloaded state not recognized as completed', sReloaded.hasCompletedOnboarding(sReloaded.state) === false);
                }}

                // =================================================================
                // SCENARIO 3: Incomplete setup attempts automatic synchronization
                // =================================================================
                {{
                    const s = new StorageManager();
                    s.onUserLogin('user_opening_balance');
                    let pushDispatched = false;

                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'user_opening_balance' }} }},
                        client: {{
                            from: (table) => ({{
                                select: () => ({{
                                    eq: () => ({{
                                        single: async () => ({{
                                            data: null,
                                            error: {{ code: 'PGRST116', message: 'Row not found' }}
                                        }})
                                    }})
                                }}),
                                upsert: async () => {{
                                    pushDispatched = true;
                                    return {{ error: null }};
                                }}
                            }})
                        }}
                    }};

                    await s.syncFromSupabase();
                    assert('SC-03', 'Account resolved to ONBOARDING_INCOMPLETE', s.getAccountStatus() === 'ONBOARDING_INCOMPLETE');
                    assert('SC-03', 'onboardingCompleted remains false after sync', s.state.preferences.onboardingCompleted === false);
                    assert('SC-03', 'isNewUser() returns false for resumable incomplete onboarding', s.isNewUser() === false);
                    assert('SC-03', 'pushToSupabase NOT dispatched on PGRST116 for incomplete draft', pushDispatched === false);
                    assert('SC-03', 'Opening balance preserved in local state', s.state.wallets['Salary Account'].balance === 50000);
                }}

                // =================================================================
                // SCENARIO 4: User completes onboarding but cloud write fails
                // =================================================================
                let cloudStatePayload = null;
                {{
                    const s = new StorageManager();
                    s.onUserLogin('user_opening_balance');

                    // Simulate offline/network failure during completion
                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'user_opening_balance' }} }},
                        client: {{
                            from: (table) => ({{
                                upsert: async () => ({{
                                    error: {{ message: '503 Service Unavailable (Network Offline)', code: '503' }}
                                }})
                            }})
                        }}
                    }};

                    const compResult = await s.markOnboardingCompleted(true);

                    assert('SC-04', 'markOnboardingCompleted reports localSaved: true', compResult.localSaved === true);
                    assert('SC-04', 'markOnboardingCompleted reports cloudSynced: false', compResult.cloudSynced === false);
                    assert('SC-04', 'markOnboardingCompleted returns error details', compResult.error && compResult.error.includes('503'));
                    assert('SC-04', 'preferences.onboardingCompleted is locally true', s.state.preferences.onboardingCompleted === true);
                    assert('SC-04', 'preferences.onboardingStep is locally 4', s.state.preferences.onboardingStep === 4);
                    assert('SC-04', 'accountStatus is SYNC_FAILED on network drop', s.getAccountStatus() === 'SYNC_FAILED');
                    assert('SC-04', 'cloudSyncStatus is FAILED', s.getCloudSyncStatus() === 'FAILED');
                    assert('SC-04', 'isCloudSyncConfirmed() is false', s.isCloudSyncConfirmed() === false);
                    assert('SC-04', 'isNewUser() returns false', s.isNewUser() === false);

                    // Ensure local storage safely holds completed configuration despite cloud failure
                    const key = 'em_connected_v2_test_user_opening_balance';
                    const storedData = JSON.parse(window.localStorage.getItem(key));
                    assert('SC-04', 'Local storage safely preserved completed config', storedData.preferences.onboardingCompleted === true);
                    assert('SC-04', 'Local storage safely preserved opening balance (50000)', storedData.wallets['Salary Account'].balance === 50000);
                }}

                // =================================================================
                // SCENARIO 5: User retries synchronization successfully
                // =================================================================
                {{
                    const s = new StorageManager();
                    s.onUserLogin('user_opening_balance');

                    // Network restored: Supabase upsert succeeds
                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'user_opening_balance' }} }},
                        client: {{
                            from: (table) => ({{
                                upsert: async (payload) => {{
                                    cloudStatePayload = payload;
                                    return {{ error: null }};
                                }}
                            }})
                        }}
                    }};

                    const retryResult = await s.retryCloudSync();

                    assert('SC-05', 'retryCloudSync reports success: true', retryResult.success === true);
                    assert('SC-05', 'accountStatus transitioned to EXISTING_USER upon confirmation', s.getAccountStatus() === 'EXISTING_USER');
                    assert('SC-05', 'cloudSyncStatus is CONFIRMED', s.getCloudSyncStatus() === 'CONFIRMED');
                    assert('SC-05', 'isCloudSyncConfirmed() returns true', s.isCloudSyncConfirmed() === true);
                    assert('SC-05', 'Cloud payload received onboardingCompleted: true', cloudStatePayload && cloudStatePayload.state.preferences.onboardingCompleted === true);
                    assert('SC-05', 'Cloud payload received opening balance 50000', cloudStatePayload && cloudStatePayload.state.wallets['Salary Account'].balance === 50000);
                }}

                // =================================================================
                // SCENARIO 6: Returning user logs in on a different device
                // =================================================================
                {{
                    // Clean fresh second device (empty localStorage)
                    window.localStorage.clear();
                    const sDev2 = new StorageManager();
                    sDev2.onUserLogin('user_opening_balance');

                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'user_opening_balance' }} }},
                        client: {{
                            from: (table) => ({{
                                select: () => ({{
                                    eq: () => ({{
                                        single: async () => ({{
                                            data: {{
                                                state: cloudStatePayload.state,
                                                updated_at: '2026-11-17T17:00:00Z'
                                            }},
                                            error: null
                                        }})
                                    }})
                                }}),
                                upsert: async () => ({{ error: null }})
                            }})
                        }}
                    }};

                    const changed = await sDev2.syncFromSupabase();
                    assert('SC-06', 'syncFromSupabase returns true on fresh device', changed === true);
                    assert('SC-06', 'Device 2 resolves to EXISTING_USER', sDev2.getAccountStatus() === 'EXISTING_USER');
                    assert('SC-06', 'Device 2 cloudSyncStatus is CONFIRMED', sDev2.getCloudSyncStatus() === 'CONFIRMED');
                    assert('SC-06', 'Device 2 isNewUser() returns false', sDev2.isNewUser() === false);
                    assert('SC-06', 'Device 2 has completed onboarding', sDev2.hasCompletedOnboarding(sDev2.state) === true);
                    assert('SC-06', 'Device 2 loaded Salary Account balance 50000', sDev2.state.wallets['Salary Account'].balance === 50000);

                    // Sub-check: If Device 1 stopped at draft (Scenario 2) and never confirmed to cloud,
                    // Device 2 logging in sees PGRST116 and does NOT see draft data
                    window.localStorage.clear();
                    const sDevDraft = new StorageManager();
                    sDevDraft.onUserLogin('user_draft_device1');
                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'user_draft_device1' }} }},
                        client: {{
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
                        }}
                    }};
                    await sDevDraft.syncFromSupabase();
                    assert('SC-06', 'Device 2 sees NEW_USER when cloud has no confirmed record', sDevDraft.getAccountStatus() === 'NEW_USER');
                    assert('SC-06', 'Device 2 does not contain draft balances', sDevDraft.state.wallets['Salary Account'].balance === 0);
                }}

                // =================================================================
                // SCENARIO 7: Existing legacy financial data remains intact
                // =================================================================
                {{
                    const s = new StorageManager();
                    const legacyEnvelope = {{
                        schemaVersion: 2,
                        currentMonthKey: "2026-08",
                        jpTotalBudget: 45000,
                        inTotalBudget: 15000,
                        wallets: {{
                            'Salary Account': {{ id: 'Salary Account', type: 'bank', region: 'JP', balance: 75000, currency: '¥' }},
                            'Cash': {{ id: 'Cash', type: 'cash', region: 'JP', balance: 5000, currency: '¥' }}
                        }},
                        transactions: [
                            {{ id: 'tx_leg_101', date: '2026-08-15', amount: 3200, region: 'JP', currency: '¥', walletId: 'Salary Account' }}
                        ]
                    }};

                    assert('SC-07', 'isEstablishedLegacyFinancialData returns true for legacy envelope', s.isEstablishedLegacyFinancialData(legacyEnvelope) === true);
                    assert('SC-07', 'isDraftOnboardingConfiguration returns false for legacy envelope', s.isDraftOnboardingConfiguration(legacyEnvelope) === false);

                    const preview = s.previewContinuousLedgerMigration(legacyEnvelope);
                    assert('SC-07', 'Legacy migration preview succeeds', preview.success === true);
                    assert('SC-07', 'Legacy migration marks onboardingCompleted: true', preview.migratedState.preferences.onboardingCompleted === true);
                    assert('SC-07', 'Legacy transaction preserved (tx_leg_101)', preview.migratedState.transactions.length === 1 && preview.migratedState.transactions[0].id === 'tx_leg_101');
                    assert('SC-07', 'Legacy wallet balances preserved (75000 and 5000)', preview.migratedState.wallets['Salary Account'].balance === 75000 && preview.migratedState.wallets['Cash'].balance === 5000);
                    assert('SC-07', 'budgets.JP mapped from legacy jpTotalBudget (45000)', preview.migratedState.budgets.JP.monthlyTotal === 45000);
                }}

                // =================================================================
                // SCENARIO 8: Existing production-export financial invariants remain unchanged
                // =================================================================
                {{
                    const s = new StorageManager();
                    const preview = s.previewContinuousLedgerMigration(prodFixture);
                    const m = preview.migratedState;

                    assert('SC-08', 'Exact 116 transactions present in continuous ledger', m.transactions.length === 116);
                    assert('SC-08', 'All 6 wallets preserved', Object.keys(m.wallets).length === 6);

                    // Float balances exact comparison
                    assert('SC-08', 'Cash balance matches 12698', m.wallets['Cash'].balance === 12698);
                    assert('SC-08', 'Salary Account balance matches 31907', m.wallets['Salary Account'].balance === 31907);
                    assert('SC-08', 'Axis Bank balance matches exact float 46794.53', m.wallets['Axis Bank'].balance === 46794.53);
                    assert('SC-08', 'PayPay balance matches 0', m.wallets['PayPay'].balance === 0);
                    assert('SC-08', 'Credit Card balance matches 0', m.wallets['Credit Card'].balance === 0);
                    assert('SC-08', 'Bank of Baroda balance matches 0', m.wallets['Bank of Baroda'].balance === 0);

                    // Boundary transactions check
                    const july31Tx = m.transactions.find(t => t.id === '1785519182944');
                    assert('SC-08', 'July 31 Tx (ID 1785519182944) preserved in ledger', !!july31Tx && july31Tx.date === '2026-07-31');

                    const oct31TxA = m.transactions.find(t => t.id === '1793462624420');
                    const oct31TxB = m.transactions.find(t => t.id === '1793462605069');
                    assert('SC-08', 'October 31 Tx A (1793462624420) preserved', !!oct31TxA && oct31TxA.date === '2026-10-31');
                    assert('SC-08', 'October 31 Tx B (1793462605069) preserved', !!oct31TxB && oct31TxB.date === '2026-10-31');

                    // Transfers and remittances check
                    const transfers = m.transactions.filter(t => t.type === 'transfer');
                    const remittances = m.transactions.filter(t => t.type === 'remittance');
                    assert('SC-08', 'All 14 transfers present', transfers.length === 14);
                    assert('SC-08', 'All 3 remittances present', remittances.length === 3);
                }}

                return results;
            }})();
            """

            eval_test = await send("Runtime.evaluate", {
                "expression": test_runner,
                "awaitPromise": True,
                "returnByValue": True
            })

            if 'exceptionDetails' in eval_test:
                print("FAILED test execution:", eval_test['exceptionDetails'])
                return False

            audit_results = eval_test.get('result', {}).get('value', {})
            return audit_results

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
        subprocess.run(['rm', '-rf', profile_dir], check=False)

def main():
    results = asyncio.run(run_safety_tests())
    if not results:
        print("❌ Test runner failed to return results!")
        sys.exit(1)

    checks = results.get('checks', [])
    print(f"\nTotal Safety Checks: {len(checks)}")
    passed = [c for c in checks if c['pass']]
    failed = [c for c in checks if not c['pass']]

    print(f"Passed: {len(passed)}")
    print(f"Failed: {len(failed)}")

    print("\n--- DETAILED CHECK RESULTS ---")
    current_sc = ""
    for i, c in enumerate(checks, 1):
        if c['id'] != current_sc:
            current_sc = c['id']
            print(f"\n[{current_sc}]")
        status_sym = "✅ PASS" if c['pass'] else "❌ FAIL"
        print(f"  {i:2d}. [{status_sym}] {c['title']}")
        if not c['pass'] or c['details']:
            print(f"       Details: {c['details']}")

    print("\n" + "=" * 80)
    if failed:
        print(f"❌ {len(failed)} CHECKS FAILED!")
        sys.exit(1)
    else:
        print(f"🎉 ALL {len(passed)} CHECKS ACROSS 8 SCENARIOS PASSED WITH 100% SUCCESS!")
        print("=" * 80)

if __name__ == '__main__':
    main()

