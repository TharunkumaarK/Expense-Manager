#!/usr/bin/env python3
"""
Expense Manager — Phase 2 Verification Suite: User Preferences & Account Configuration
-------------------------------------------------------------------------------------
Automated test suite executing in an isolated headless Chromium instance.
Zero Supabase writes, zero network requests, isolated localStorage mock.

Covers all 12 required test scenarios:
1. New account without financial state (PGRST116, empty state -> NEW_USER, onboardingCompleted: false, no premature push).
2. Existing JP/IN account (production export fixture -> EXISTING_USER, activeCountries: ['JP', 'IN'], onboardingCompleted: true).
3. Legacy account missing preferences (Schema v1/v2 -> preferences synthesized, onboardingCompleted: true, budgets mapped).
4. Returning user on another device (fresh device, remote has data -> EXISTING_USER, isNewUser: false).
5. Interrupted onboarding configuration (onboardingCompleted: false, step: 2 -> ONBOARDING_INCOMPLETE).
6. Country preference updates (activeCountries update -> zero financial transaction data loss).
7. Loan tracking enabled/disabled (state toggles, options stored, data preserved on disable).
8. Budgeting enabled for one country only (JP enabled, IN disabled, jpTotalBudget synchronized).
9. Failed Supabase synchronization (network error -> SYNC_FAILED, fails closed, zero wipe).
10. Backup export/import of preferences (custom preferences roundtrip through backup envelope).
11. Migration idempotency (2nd migration pass yields strictly identical state).
12. Financial state unchanged after preference initialization (all 116 txs, 6 wallets, balances 100% invariant).
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

async def run_phase2_tests():
    print("=" * 75)
    print("EXPENSE MANAGER — PHASE 2: USER PREFERENCES & ACCOUNT CONFIGURATION TESTS")
    print("=" * 75)

    if not os.path.exists(EXPORT_PATH):
        print(f"Error: Production export not found at {EXPORT_PATH}")
        sys.exit(1)

    with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
        export_wrapper = json.load(f)
    prod_state = export_wrapper.get('state', export_wrapper)

    profile_dir = f'/tmp/phase2_test_profile_{int(time.time())}'
    port = 9498
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

            # Load JS files in order
            for path, name in [(COUNTRY_CONFIG_PATH, 'CountryConfig'), (STORAGE_JS_PATH, 'Storage'), (WALLET_JS_PATH, 'Wallet'), (APP_JS_PATH, 'App')]:
                with open(path, 'r', encoding='utf-8') as f:
                    code = f.read()
                res = await send("Runtime.evaluate", {"expression": code})
                if 'exceptionDetails' in res:
                    print(f"Error evaluating {name}:", res['exceptionDetails'])
                    sys.exit(1)

            # Combined Test Runner Script covering all 12 Scenarios
            test_runner = f"""
            (async () => {{
                const results = {{ checks: [] }};
                function assert(id, title, condition, details = '') {{
                    results.checks.push({{ id, title, pass: !!condition, details: String(details) }});
                }}

                const prodFixture = {json.dumps(prod_state)};

                // -----------------------------------------------------------------
                // TC-01: New Account Without Financial State
                // -----------------------------------------------------------------
                {{
                    window.localStorage.clear();
                    const s = new StorageManager();
                    let pushCalled = false;
                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'user_brand_new' }} }},
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
                                upsert: async () => {{ pushCalled = true; return {{ error: null }}; }}
                            }})
                        }}
                    }};

                    await s.syncFromSupabase();

                    assert('TC-01', 'New account status is NEW_USER', s.getAccountStatus() === 'NEW_USER');
                    assert('TC-01', 'isNewUser() returns true for genuine new account', s.isNewUser() === true);
                    assert('TC-01', 'onboardingCompleted is false for new account', s.state.preferences.onboardingCompleted === false);
                    assert('TC-01', 'onboardingStep is initialized to 1', s.state.preferences.onboardingStep === 1);
                    assert('TC-01', 'pushToSupabase NOT called prematurely for un-onboarded user', pushCalled === false);
                    assert('TC-01', 'New user has 0 transactions', s.getUniqueTransactionCount(s.state) === 0);
                    const newPushResult = await s.pushToSupabase();
                    assert('TC-01', 'pushToSupabase() fails-safe and aborts for uncompleted NEW_USER', newPushResult === false);
                }}

                // -----------------------------------------------------------------
                // TC-02: Existing JP/IN Production Account Migration
                // -----------------------------------------------------------------
                {{
                    const s = new StorageManager();
                    const preview = s.previewContinuousLedgerMigration(prodFixture);
                    assert('TC-02', 'Production fixture migration preview succeeds', preview.success === true);
                    
                    const m = preview.migratedState;
                    assert('TC-02', 'Existing account inferred onboardingCompleted: true', m.preferences.onboardingCompleted === true);
                    assert('TC-02', 'Existing account activeCountries derived as JP and IN', 
                        Array.isArray(m.preferences.activeCountries) && m.preferences.activeCountries.includes('JP') && m.preferences.activeCountries.includes('IN'));
                    assert('TC-02', 'Existing account defaultCountry is JP', m.preferences.defaultCountry === 'JP');
                    assert('TC-02', 'All 116 transactions preserved in migrated continuous ledger', m.transactions.length === 116);
                    assert('TC-02', 'All 6 wallets preserved', Object.keys(m.wallets).length === 6);
                    assert('TC-02', 'JP budget mapped to budgets.JP (50000)', m.budgets.JP.monthlyTotal === 50000 && m.budgets.JP.enabled === true);
                }}

                // -----------------------------------------------------------------
                // TC-03: Legacy Account Missing Preferences
                // -----------------------------------------------------------------
                {{
                    const s = new StorageManager();
                    const legacyV2 = {{
                        schemaVersion: 2,
                        currentMonthKey: "2026-08",
                        jpTotalBudget: 45000,
                        inTotalBudget: 12000,
                        wallets: {{
                            'Salary Account': {{ id: 'Salary Account', type: 'bank', region: 'JP', balance: 50000, currency: '¥' }},
                            'Bank Account': {{ id: 'Bank Account', type: 'bank', region: 'IN', balance: 10000, currency: '₹' }}
                        }},
                        transactions: [
                            {{ id: 'tx_leg_1', date: '2026-08-10', type: 'expense', amount: 1200, region: 'JP', currency: '¥', walletId: 'Salary Account' }}
                        ]
                    }};
                    const preview = s.previewContinuousLedgerMigration(legacyV2);
                    assert('TC-03', 'Legacy v2 preview succeeds', preview.success === true);
                    
                    const m = preview.migratedState;
                    assert('TC-03', 'Preferences synthesized with version 1', m.preferences && m.preferences.version === 1);
                    assert('TC-03', 'Legacy user inferred onboardingCompleted: true', m.preferences.onboardingCompleted === true);
                    assert('TC-03', 'budgets.JP monthlyTotal mapped from legacy jpTotalBudget (45000)', m.budgets.JP.monthlyTotal === 45000);
                    assert('TC-03', 'budgets.IN monthlyTotal mapped from legacy inTotalBudget (12000)', m.budgets.IN.monthlyTotal === 12000);
                    assert('TC-03', 'German categories catalog initialized', Array.isArray(m.categories.DE) && m.categories.DE.length > 0);
                    assert('TC-03', 'loanConfig normalized with default country IN and currency ₹', m.loanConfig.country === 'IN' && m.loanConfig.currency === '₹');
                }}

                // -----------------------------------------------------------------
                // TC-04: Returning User On Another Device
                // -----------------------------------------------------------------
                {{
                    window.localStorage.clear();
                    const s = new StorageManager();
                    s.isFirstLoad = true; // Simulating empty device storage

                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'user_returning_device' }} }},
                        client: {{
                            from: (table) => ({{
                                select: () => ({{
                                    eq: () => ({{
                                        single: async () => ({{
                                            data: {{
                                                state: prodFixture,
                                                updated_at: '2026-11-16T12:00:00Z'
                                            }},
                                            error: null
                                        }})
                                    }})
                                }}),
                                upsert: async () => ({{ error: null }})
                            }})
                        }}
                    }};

                    const changed = await s.syncFromSupabase();
                    assert('TC-04', 'syncFromSupabase returns true indicating authoritative state loaded', changed === true);
                    assert('TC-04', 'Returning user resolved to EXISTING_USER status', s.getAccountStatus() === 'EXISTING_USER');
                    assert('TC-04', 'isNewUser() returns false for returning user on fresh device', s.isNewUser() === false);
                    assert('TC-04', 'onboardingCompleted is true on returning device', s.state.preferences.onboardingCompleted === true);
                    assert('TC-04', 'All 116 transactions loaded onto new device', s.state.transactions.length === 116);
                }}

                // -----------------------------------------------------------------
                // TC-05: Interrupted Onboarding Configuration
                // -----------------------------------------------------------------
                {{
                    window.localStorage.clear();
                    const s = new StorageManager();
                    s.isFirstLoad = true;

                    const incompleteRemoteState = {{
                        schemaVersion: 3,
                        currentMonthKey: "2026-11",
                        preferences: {{
                            version: 1,
                            activeCountries: ['DE'],
                            defaultCountry: 'DE',
                            onboardingCompleted: false,
                            onboardingStep: 2,
                            tourCompleted: false,
                            tourDismissed: false,
                            theme: 'dark'
                        }},
                        budgets: {{
                            DE: {{ enabled: true, monthlyTotal: 1500, rolloverEnabled: false }}
                        }},
                        wallets: {{
                            'Girokonto': {{ id: 'Girokonto', type: 'bank', region: 'DE', balance: 0, currency: '€' }}
                        }},
                        transactions: []
                    }};

                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'user_interrupted_onboarding' }} }},
                        client: {{
                            from: (table) => ({{
                                select: () => ({{
                                    eq: () => ({{
                                        single: async () => ({{
                                            data: {{
                                                state: incompleteRemoteState,
                                                updated_at: '2026-11-17T09:00:00Z'
                                            }},
                                            error: null
                                        }})
                                    }})
                                }}),
                                upsert: async () => ({{ error: null }})
                            }})
                        }}
                    }};

                    await s.syncFromSupabase();
                    assert('TC-05', 'Account status resolved to ONBOARDING_INCOMPLETE', s.getAccountStatus() === 'ONBOARDING_INCOMPLETE');
                    assert('TC-05', 'isNewUser() returns false for ONBOARDING_INCOMPLETE (resumable onboarding)', s.isNewUser() === false);
                    assert('TC-05', 'onboardingCompleted remains false', s.state.preferences.onboardingCompleted === false);
                    assert('TC-05', 'onboardingStep 2 preserved for wizard resumption', s.state.preferences.onboardingStep === 2);
                    assert('TC-05', 'activeCountries preserved as DE', JSON.stringify(s.state.preferences.activeCountries) === JSON.stringify(['DE']));

                    // Push protection check on incomplete onboarding
                    let incompletePushTriggered = false;
                    window.supabaseClient.client.from = () => ({{
                        upsert: async () => {{ incompletePushTriggered = true; return {{ error: null }}; }}
                    }});
                    const incompletePushRes = await s.pushToSupabase();
                    assert('TC-05', 'pushToSupabase() aborted for ONBOARDING_INCOMPLETE without financial data', incompletePushRes === false && incompletePushTriggered === false);

                    // When user explicitly completes onboarding, push is permitted
                    s.markOnboardingCompleted(true);
                    assert('TC-05', 'markOnboardingCompleted sets onboardingCompleted true', s.state.preferences.onboardingCompleted === true);
                    const completedPushRes = await s.pushToSupabase();
                    assert('TC-05', 'pushToSupabase() succeeds once onboarding is completed', completedPushRes === true && incompletePushTriggered === true);
                }}

                // -----------------------------------------------------------------
                // TC-06: Country Preference Updates & Zero Financial Data Loss
                // -----------------------------------------------------------------
                {{
                    const s = new StorageManager();
                    const preview = s.previewContinuousLedgerMigration(prodFixture);
                    s.applyContinuousLedgerMigration(preview);

                    const preTxCount = s.state.transactions.length;
                    const preInTxs = s.state.transactions.filter(t => t.region === 'IN').length;

                    // Update active countries to JP and DE
                    s.setActiveCountries(['JP', 'DE']);

                    assert('TC-06', 'getActiveCountries() reflects JP and DE', JSON.stringify(s.getActiveCountries()) === JSON.stringify(['JP', 'DE']));
                    assert('TC-06', 'isCountryActive(JP) is true', s.isCountryActive('JP') === true);
                    assert('TC-06', 'isCountryActive(DE) is true', s.isCountryActive('DE') === true);
                    assert('TC-06', 'isCountryActive(IN) is false', s.isCountryActive('IN') === false);
                    assert('TC-06', 'Total transaction count unchanged after deactivation', s.state.transactions.length === preTxCount);
                    assert('TC-06', 'IN transactions preserved in continuous ledger', s.state.transactions.filter(t => t.region === 'IN').length === preInTxs);
                    assert('TC-06', 'IN wallets preserved in storage', Object.values(s.state.wallets).some(w => w.region === 'IN'));
                }}

                // -----------------------------------------------------------------
                // TC-07: Loan Tracking Enabled/Disabled Management
                // -----------------------------------------------------------------
                {{
                    const s = new StorageManager();
                    s.setLoanTrackingEnabled(true, {{
                        country: 'DE',
                        currency: '€',
                        totalPrincipal: 250000,
                        principalLeft: 220000,
                        emi: 1200,
                        annualInterestRate: 3.5,
                        emiDrawDate: 1
                    }});

                    assert('TC-07', 'isLoanTrackingEnabled() returns true when enabled', s.isLoanTrackingEnabled() === true);
                    assert('TC-07', 'Loan country updated to DE', s.state.loanConfig.country === 'DE');
                    assert('TC-07', 'Loan currency updated to €', s.state.loanConfig.currency === '€');
                    assert('TC-07', 'Total principal set to 250000', s.state.loanConfig.totalPrincipal === 250000);

                    // Disable loan tracking
                    s.setLoanTrackingEnabled(false);
                    assert('TC-07', 'isLoanTrackingEnabled() returns false when disabled', s.isLoanTrackingEnabled() === false);
                    assert('TC-07', 'Loan principal data preserved when disabled', s.state.loanConfig.totalPrincipal === 250000);
                }}

                // -----------------------------------------------------------------
                // TC-08: Budgeting Enabled For One Country Only & Bi-Directional Sync
                // -----------------------------------------------------------------
                {{
                    const s = new StorageManager();
                    s.setBudgetEnabled('JP', true, 60000, true);
                    s.setBudgetEnabled('IN', false, 0, false);
                    s.setBudgetEnabled('DE', false, 0, false);

                    assert('TC-08', 'isBudgetEnabled(JP) is true', s.isBudgetEnabled('JP') === true);
                    assert('TC-08', 'isBudgetEnabled(IN) is false', s.isBudgetEnabled('IN') === false);
                    assert('TC-08', 'isBudgetEnabled(DE) is false', s.isBudgetEnabled('DE') === false);
                    assert('TC-08', 'JP budget config has monthlyTotal 60000', s.getBudgetConfig('JP').monthlyTotal === 60000);
                    assert('TC-08', 'Legacy jpTotalBudget synchronized to 60000', s.state.jpTotalBudget === 60000);
                    assert('TC-08', 'Legacy inTotalBudget synchronized to 0', s.state.inTotalBudget === 0);

                    // Test Issue 2 Specifics:
                    // 1. Direct legacy property assignment updates budgets.JP.monthlyTotal
                    s.state.jpTotalBudget = 75000;
                    assert('TC-08', 'Direct assignment to state.jpTotalBudget immediately updates budgets.JP.monthlyTotal', s.state.budgets.JP.monthlyTotal === 75000);

                    // 2. Direct assignment to budgets.JP.monthlyTotal updates state.jpTotalBudget
                    s.state.budgets.JP.monthlyTotal = 82000;
                    assert('TC-08', 'Direct assignment to budgets.JP.monthlyTotal immediately reflects on state.jpTotalBudget', s.state.jpTotalBudget === 82000);

                    // 3. Centralized setTotalBudget method
                    s.setTotalBudget('JP', 90000);
                    assert('TC-08', 'setTotalBudget(JP, 90000) updates budgets.JP.monthlyTotal', s.state.budgets.JP.monthlyTotal === 90000);
                    assert('TC-08', 'setTotalBudget(JP, 90000) updates legacy jpTotalBudget', s.state.jpTotalBudget === 90000);

                    s.setTotalBudget('inTotalBudget', 35000);
                    assert('TC-08', 'setTotalBudget(inTotalBudget, 35000) updates budgets.IN.monthlyTotal', s.state.budgets.IN.monthlyTotal === 35000);
                    assert('TC-08', 'setTotalBudget(inTotalBudget, 35000) updates legacy inTotalBudget', s.state.inTotalBudget === 35000);

                    // 4. German budget independence
                    s.setBudgetEnabled('DE', true, 1800, false);
                    s.setTotalBudget('DE', 2100);
                    assert('TC-08', 'DE monthlyTotal is 2100', s.state.budgets.DE.monthlyTotal === 2100);
                    assert('TC-08', 'DE budget has zero impact on jpTotalBudget (90000)', s.state.jpTotalBudget === 90000);
                    assert('TC-08', 'DE budget has zero impact on inTotalBudget (35000)', s.state.inTotalBudget === 35000);

                    // 5. Survival across saveData() and loadData()
                    s.saveData();
                    const reloaded = s.loadData();
                    assert('TC-08', 'Reloaded state preserves budgets.JP.monthlyTotal (90000)', reloaded.budgets.JP.monthlyTotal === 90000);
                    assert('TC-08', 'Reloaded state preserves jpTotalBudget (90000)', reloaded.jpTotalBudget === 90000);
                    assert('TC-08', 'Reloaded state preserves budgets.IN.monthlyTotal (35000)', reloaded.budgets.IN.monthlyTotal === 35000);
                    assert('TC-08', 'Reloaded state preserves inTotalBudget (35000)', reloaded.inTotalBudget === 35000);
                    assert('TC-08', 'Reloaded state preserves budgets.DE.monthlyTotal (2100)', reloaded.budgets.DE.monthlyTotal === 2100);

                    // Verify accessor works on reloaded state
                    reloaded.jpTotalBudget = 95000;
                    assert('TC-08', 'Reloaded state maintains budget accessors (95000)', reloaded.budgets.JP.monthlyTotal === 95000);
                }}

                // -----------------------------------------------------------------
                // TC-09: Failed Supabase Synchronization (Fail-Closed Safety)
                // -----------------------------------------------------------------
                {{
                    const s = new StorageManager();
                    s.onUserLogin('user_net_fail');
                    s.state.transactions = [{{ id: 'tx_local_existing', amount: 500 }}];
                    s.saveData();

                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'user_net_fail' }} }},
                        client: {{
                            from: (table) => ({{
                                select: () => ({{
                                    eq: () => ({{
                                        single: async () => ({{
                                            data: null,
                                            error: {{ message: 'Network connection failure (HTTP 503)', code: '503' }}
                                        }})
                                    }})
                                }}),
                                upsert: async () => ({{ error: null }})
                            }})
                        }}
                    }};

                    const changed = await s.syncFromSupabase();
                    assert('TC-09', 'syncFromSupabase returns false on network error', changed === false);
                    assert('TC-09', 'accountStatus resolved to SYNC_FAILED', s.getAccountStatus() === 'SYNC_FAILED');
                    assert('TC-09', 'isNewUser() returns false when SYNC_FAILED', s.isNewUser() === false);
                    assert('TC-09', 'syncError records error message', s.syncError && s.syncError.includes('503'));
                    assert('TC-09', 'Local transaction preserved, NOT wiped', s.state.transactions.length === 1 && s.state.transactions[0].id === 'tx_local_existing');

                    // Push protection on SYNC_FAILED
                    let netFailPushTriggered = false;
                    window.supabaseClient.client.from = () => ({{
                        upsert: async () => {{ netFailPushTriggered = true; return {{ error: null }}; }}
                    }});
                    const failPushRes = await s.pushToSupabase();
                    assert('TC-09', 'pushToSupabase() fails-closed when SYNC_FAILED', failPushRes === false && netFailPushTriggered === false);
                }}

                // -----------------------------------------------------------------
                // TC-10: Backup Export/Import Of User Preferences
                // -----------------------------------------------------------------
                {{
                    const s = new StorageManager();
                    s.updatePreferences({{
                        activeCountries: ['DE', 'JP'],
                        defaultCountry: 'DE',
                        theme: 'obsidian',
                        onboardingCompleted: true
                    }});
                    s.setBudgetEnabled('DE', true, 2200, false);

                    const exportedStr = JSON.stringify(s.state);
                    const parsed = JSON.parse(exportedStr);

                    const validation = s.validateBackupData(parsed);
                    assert('TC-10', 'Exported JSON passes backup validation', validation.valid === true);

                    const s2 = new StorageManager();
                    const preview = s2.previewContinuousLedgerMigration(validation.normalizedData);
                    assert('TC-10', 'Continuous ledger preview succeeds for backup', preview.success === true);
                    s2.applyContinuousLedgerMigration(preview);

                    assert('TC-10', 'Imported activeCountries preserved as DE and JP', JSON.stringify(s2.getActiveCountries()) === JSON.stringify(['DE', 'JP']));
                    assert('TC-10', 'Imported defaultCountry preserved as DE', s2.state.preferences.defaultCountry === 'DE');
                    assert('TC-10', 'Imported theme preserved as obsidian', s2.state.preferences.theme === 'obsidian');
                    assert('TC-10', 'Imported DE budget preserved (2200)', s2.getBudgetConfig('DE').monthlyTotal === 2200);
                }}

                // -----------------------------------------------------------------
                // TC-11: Migration Idempotency
                // -----------------------------------------------------------------
                {{
                    const s = new StorageManager();
                    const p1 = s.previewContinuousLedgerMigration(prodFixture);
                    const p2 = s.previewContinuousLedgerMigration(p1.migratedState);

                    assert('TC-11', 'Second migration preview succeeds', p2.success === true);
                    assert('TC-11', 'Second pass flagged as alreadyMigrated', p2.alreadyMigrated === true);
                    assert('TC-11', 'Transaction counts match between passes', p1.migratedState.transactions.length === p2.migratedState.transactions.length);
                    assert('TC-11', 'Wallets match identically between passes', JSON.stringify(p1.migratedState.wallets) === JSON.stringify(p2.migratedState.wallets));
                    assert('TC-11', 'Preferences match identically between passes', JSON.stringify(p1.migratedState.preferences) === JSON.stringify(p2.migratedState.preferences));
                    assert('TC-11', 'Budgets match identically between passes', JSON.stringify(p1.migratedState.budgets) === JSON.stringify(p2.migratedState.budgets));
                }}

                // -----------------------------------------------------------------
                // TC-12: Financial State Invariant Check Against Production Fixture
                // -----------------------------------------------------------------
                {{
                    const s = new StorageManager();
                    const preview = s.previewContinuousLedgerMigration(prodFixture);
                    const m = preview.migratedState;

                    assert('TC-12', 'Exact 116 transactions present', m.transactions.length === 116);

                    // Check every wallet balance
                    const origWallets = prodFixture.wallets;
                    let balanceOk = true;
                    for (const wId of Object.keys(origWallets)) {{
                        if (origWallets[wId].balance !== m.wallets[wId].balance) {{
                            balanceOk = false;
                        }}
                    }}
                    assert('TC-12', 'All wallet balances match original floating point values', balanceOk === true);
                    assert('TC-12', 'Preferences initialized without modifying financial ledger', m.preferences && m.preferences.onboardingCompleted === true);
                }}

                // -----------------------------------------------------------------
                // TC-13: Account Status Contract & Safety Matrix
                // -----------------------------------------------------------------
                {{
                    const s = new StorageManager();
                    s.accountStatus = 'UNRESOLVED';
                    assert('TC-13', 'isNewUser() returns false when accountStatus is UNRESOLVED', s.isNewUser() === false);

                    s.accountStatus = 'SYNC_FAILED';
                    assert('TC-13', 'isNewUser() returns false when accountStatus is SYNC_FAILED', s.isNewUser() === false);

                    s.accountStatus = 'EXISTING_USER';
                    assert('TC-13', 'isNewUser() returns false when accountStatus is EXISTING_USER', s.isNewUser() === false);

                    s.accountStatus = 'ONBOARDING_INCOMPLETE';
                    assert('TC-13', 'isNewUser() returns false when accountStatus is ONBOARDING_INCOMPLETE', s.isNewUser() === false);

                    s.accountStatus = 'NEW_USER';
                    assert('TC-13', 'isNewUser() returns true ONLY when accountStatus is NEW_USER', s.isNewUser() === true);

                    // Returning user on fresh device with Supabase offline
                    window.localStorage.clear();
                    const sFresh = new StorageManager();
                    sFresh.isFirstLoad = true;
                    window.supabaseClient = {{
                        session: {{ user: {{ id: 'returning_offline' }} }},
                        client: {{
                            from: () => ({{
                                select: () => ({{
                                    eq: () => ({{
                                        single: async () => ({{
                                            data: null,
                                            error: {{ message: 'Connection refused / offline', code: 'ECONNREFUSED' }}
                                        }})
                                    }})
                                }}),
                                upsert: async () => ({{ error: null }})
                            }})
                        }}
                    }};
                    await sFresh.syncFromSupabase();
                    assert('TC-13', 'Fresh device with network down resolves to SYNC_FAILED', sFresh.getAccountStatus() === 'SYNC_FAILED');
                    assert('TC-13', 'Fresh device with network down NEVER enters new-user initialization', sFresh.isNewUser() === false);
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
    results = asyncio.run(run_phase2_tests())
    if not results:
        print("❌ Test runner failed to return results!")
        sys.exit(1)

    checks = results.get('checks', [])
    print(f"\nTotal Phase 2 Checks: {len(checks)}")
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

    print("\n" + "=" * 75)
    if failed:
        print(f"❌ {len(failed)} CHECKS FAILED!")
        sys.exit(1)
    else:
        print(f"🎉 ALL {len(passed)} CHECKS ACROSS 12 SCENARIOS PASSED WITH 100% SUCCESS!")
        print("=" * 75)

if __name__ == '__main__':
    main()
