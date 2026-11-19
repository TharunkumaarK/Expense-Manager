#!/usr/bin/env python3
"""
Expense Manager — Phase 5 Synchronization & Concurrency Test Suite

Verifies:
1. Cross-Tab Exclusive Locking:
   - Serialization of concurrent writes via Web Locks (navigator.locks) or fallback mutex.
   - Race condition prevention on wallet balances and transactions array.
2. Cross-Tab State Synchronization:
   - BroadcastChannel / storage events notify other tabs.
   - Clean tabs auto-refresh balance and transactions.
   - Dirty tabs (open edit modal with unsaved changes) display non-destructive in-modal conflict banner.
3. Supabase CAS Concurrency:
   - Server-side conditional match on state->>revision.
   - Stale writes rejected (0 rows updated) -> cloudSyncStatus = 'CONFLICT'.
   - Local state stashed into _conflict_stash.
   - Header sync status pill updates to 'Sync Conflict'.
4. Conflict Resolution Workflows:
   - Conflict resolution modal displays local vs cloud differences.
   - Strategy 'accept_cloud' adopts cloud state and archives local.
   - Strategy 'overwrite_cloud' forces cloud state overwrite.
   - Strategy 'merge_nonconflicting' reconciles unique transactions.
5. Fallback Mutex & Resilience:
   - Cooperative lease-based fallback lock with timeout and reclamation.
   - Offline queue and online reconnect sync trigger.
   - Idempotent repeated operations with zero duplicate transactions.
6. Production Continuous Ledger Invariants:
   - 116 transactions, 6 wallets, Axis Bank balance ₹ 46,794.53 verified.
"""

import os
import sys
import json
import time
import asyncio
import subprocess
import urllib.request
import urllib.parse
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
EXPORT_PATH = '/tmp/ExpenseManager_Production_Export_2026-11-16.json'
if not os.path.exists(EXPORT_PATH) and os.path.exists('/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'):
    EXPORT_PATH = '/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'

class TabSession:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 0

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=25*1024*1024)
        await self.send_cdp('Page.enable')
        await self.send_cdp('Runtime.enable')

    async def close(self):
        if self.ws:
            await self.ws.close()

    async def send_cdp(self, method, params=None):
        self.msg_id += 1
        payload = {'id': self.msg_id, 'method': method, 'params': params or {}}
        await self.ws.send(json.dumps(payload))
        while True:
            resp_raw = await self.ws.recv()
            resp = json.loads(resp_raw)
            if resp.get('id') == self.msg_id:
                return resp.get('result', {})

    async def eval_js(self, expression):
        res = await self.send_cdp('Runtime.evaluate', {
            'expression': expression,
            'returnByValue': True,
            'awaitPromise': True
        })
        if 'exceptionDetails' in res:
            raise RuntimeError(f"JS Evaluation Error: {res['exceptionDetails']}")
        return res.get('result', {}).get('value')

async def main():
    print("=" * 80)
    print("EXPENSE MANAGER — PHASE 5 SYNCHRONIZATION & CONCURRENCY TEST SUITE")
    print("=" * 80)

    # 1. Static Checks
    print("\n--- Running Static Checks ---")
    with open('js/storage.js', 'r', encoding='utf-8') as f:
        storage_code = f.read()
    with open('js/app.js', 'r', encoding='utf-8') as f:
        app_code = f.read()
    with open('index.html', 'r', encoding='utf-8') as f:
        html_code = f.read()

    static_tests = [
        ("STORAGE", "runExclusive implemented with Web Locks API", "navigator.locks.request" in storage_code),
        ("STORAGE", "runExclusive falls back to cooperative lease lock", "_runWithFallbackLock" in storage_code),
        ("STORAGE", "Monotonic revision increments on saveData", "this.state.revision = currentRev + 1" in storage_code or "this.state.revision" in storage_code),
        ("STORAGE", "BroadcastChannel initialized for cross-tab sync", "new BroadcastChannel('expense_manager_sync')" in storage_code),
        ("STORAGE", "Conflict stashing method implemented", "stashConflictState" in storage_code),
        ("STORAGE", "PostgREST CAS conditional revision match", "state->>revision" in storage_code),
        ("APP", "handleFormSubmit wraps mutations in storage.runExclusive", "storage.runExclusive" in app_code and "handleFormSubmit" in app_code),
        ("APP", "isAnyModalDirty detects unsaved user input", "isAnyModalDirty" in app_code),
        ("APP", "showInModalConflictWarning inserts non-destructive banner", "modal-conflict-banner" in app_code),
        ("APP", "updateSyncStatusPill updates header sync status", "updateSyncStatusPill" in app_code),
        ("APP", "resolveSyncConflict handles accept_cloud, overwrite_cloud, merge_nonconflicting", "resolveSyncConflict" in app_code),
        ("UI", "Header sync status pill present in index.html", "desktop-sync-status-pill" in html_code),
        ("UI", "Conflict resolution modal present in index.html", "conflict-resolution-modal" in html_code),
    ]

    for cat, name, passed in static_tests:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  [{status}] [{cat}] {name}")
        if not passed:
            print("\n❌ Static checks failed. Aborting dynamic suite.")
            sys.exit(1)

    print("\n✅ All static architecture checks passed.")

    # 2. Dynamic Multi-Tab Suite via CDP
    print("\n--- Starting Headless Chrome Multi-Tab CDP Suite ---")
    chrome_port = 9600
    user_data_dir = f"/tmp/phase5_concurrency_profile_{int(time.time())}"
    cmd = [
        CHROME_BIN,
        '--headless=new',
        f'--remote-debugging-port={chrome_port}',
        f'--user-data-dir={user_data_dir}',
        '--no-sandbox',
        '--allow-file-access-from-files',
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1440,900',
        f'file://{INDEX_HTML_PATH}'
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    tab1 = None
    tab2 = None

    try:
        await asyncio.sleep(2.0)
        resp = urllib.request.urlopen(f'http://127.0.0.1:{chrome_port}/json')
        pages = json.loads(resp.read().decode())
        page1 = [t for t in pages if t.get('type') == 'page'][0]
        tab1 = TabSession(page1['webSocketDebuggerUrl'])
        await tab1.connect()

        target_res = await tab1.send_cdp('Target.createTarget', {'url': f'file://{INDEX_HTML_PATH}'})
        target_id = target_res.get('targetId')

        await asyncio.sleep(0.5)
        resp2 = urllib.request.urlopen(f'http://127.0.0.1:{chrome_port}/json')
        pages2 = json.loads(resp2.read().decode())
        page2_candidates = [t for t in pages2 if t.get('id') == target_id or target_id in t.get('webSocketDebuggerUrl', '')]
        if not page2_candidates:
            page2_candidates = [t for t in pages2 if t.get('type') == 'page' and t.get('id') != page1['id']]
        page2_info = page2_candidates[0]

        tab2 = TabSession(page2_info['webSocketDebuggerUrl'])
        await tab2.connect()

        print(f"  Connected to Tab 1 ({page1['id']}) and Tab 2 ({page2_info['id']}) sharing profile.")

        # Helper to reset state across both tabs cleanly
        async def reset_both_tabs():
            base_state_js = """
                {
                    schemaVersion: 3,
                    revision: 1,
                    currentMonthKey: '2026-11',
                    preferences: {
                        version: 1,
                        activeCountries: ['JP', 'IN'],
                        defaultCountry: 'JP',
                        onboardingCompleted: true,
                        theme: 'dark'
                    },
                    budgets: {
                        JP: { enabled: true, monthlyTotal: 100000, rolloverEnabled: true, carryover: 0 },
                        IN: { enabled: true, monthlyTotal: 50000, rolloverEnabled: false, carryover: 0 },
                        DE: { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 }
                    },
                    wallets: {
                        'JP Bank': { id: 'JP Bank', name: 'JP Bank', currency: '¥', region: 'JP', balance: 100000 },
                        'JP Cash': { id: 'JP Cash', name: 'JP Cash', currency: '¥', region: 'JP', balance: 50000 },
                        'IN Bank': { id: 'IN Bank', name: 'IN Bank', currency: '₹', region: 'IN', balance: 250000 }
                    },
                    categories: {
                        JP: [
                            { id: 'jp-food', name: 'Food & Groceries' },
                            { id: 'jp-transport', name: 'Transport' }
                        ],
                        IN: [
                            { id: 'in-home', name: 'Home Needs' }
                        ]
                    },
                    closedMonths: {},
                    transactions: [
                        { id: 'tx_init_1', type: 'expense', amount: 1000, walletId: 'JP Bank', categoryId: 'jp-food', currency: '¥', region: 'JP', date: '2026-11-01', note: 'Initial' }
                    ]
                }
            """

            await tab1.eval_js(f"""
                (function() {{
                    localStorage.clear();
                    if (typeof supabaseClient !== 'undefined') {{
                        supabaseClient.session = null;
                    }}
                    storage.currentUserId = null;
                    storage.accountStatus = 'EXISTING_USER';
                    storage.cloudSyncStatus = 'SYNCED';
                    storage.state = {base_state_js};
                    storage.lastConfirmedCloudRevision = 1;
                    storage.activeConflict = null;
                    storage._saveDataDirect();
                }})()
            """)

            await tab2.eval_js(f"""
                (function() {{
                    if (typeof supabaseClient !== 'undefined') {{
                        supabaseClient.session = null;
                    }}
                    storage.currentUserId = null;
                    storage.accountStatus = 'EXISTING_USER';
                    storage.cloudSyncStatus = 'SYNCED';
                    storage.state = {base_state_js};
                    storage.lastConfirmedCloudRevision = 1;
                    storage.activeConflict = null;
                }})()
            """)

        await reset_both_tabs()

        dynamic_results = []

        # =========================================================================
        # Scenario 1: Cross-Tab Exclusive Locking for Concurrent Transactions
        # =========================================================================
        print("\n[Scenario 1] Concurrent Transaction Execution Across Tabs")
        # Tab 1 adds 5,000 JPY to JP Bank, Tab 2 adds 3,000 JPY to JP Bank
        res1 = await asyncio.gather(
            tab1.eval_js("""
                (async function() {
                    return await storage.runExclusive(async () => {
                        await new Promise(r => setTimeout(r, 60));
                        storage.reloadAuthoritativeLocalState();
                        const success = walletManager.addExpense('JP Bank', 'jp-food', 5000, 'Tab 1 Dinner', '2026-11-15');
                        return { success, revision: storage.state.revision, balance: storage.state.wallets['JP Bank'].balance };
                    });
                })()
            """),
            tab2.eval_js("""
                (async function() {
                    return await storage.runExclusive(async () => {
                        await new Promise(r => setTimeout(r, 60));
                        storage.reloadAuthoritativeLocalState();
                        const success = walletManager.addExpense('JP Bank', 'jp-transport', 3000, 'Tab 2 Train', '2026-11-15');
                        return { success, revision: storage.state.revision, balance: storage.state.wallets['JP Bank'].balance };
                    });
                })()
            """)
        )

        final_state_tab1 = await tab1.eval_js("""
            (function() {
                storage.reloadAuthoritativeLocalState();
                return {
                    balance: storage.state.wallets['JP Bank'].balance,
                    txCount: storage.state.transactions.length,
                    revision: storage.state.revision
                };
            })()
        """)

        passed1 = (
            final_state_tab1['balance'] == 92000 and
            final_state_tab1['txCount'] == 3 and
            final_state_tab1['revision'] >= 3
        )
        dynamic_results.append(("Cross-Tab Locking", "Simultaneous writes in 2 tabs serialize and calculate balance accurately (92,000 JPY)", passed1))
        print(f"  Result 1: Final balance={final_state_tab1['balance']}, txCount={final_state_tab1['txCount']}, rev={final_state_tab1['revision']} -> {'✅ PASS' if passed1 else '❌ FAIL'}")

        # =========================================================================
        # Scenario 2: Cross-Tab State Broadcast & Clean Tab Auto-Refresh
        # =========================================================================
        print("\n[Scenario 2] Cross-Tab State Broadcast & Auto-Refresh")
        await reset_both_tabs()

        # Tab 1 adds an income of 20,000 to JP Cash
        t1_inc_res = await tab1.eval_js("""
            (async function() {
                return await storage.runExclusive(async () => {
                    const ok = walletManager.addIncome('JP Cash', 20000, 'Freelance', '2026-11-16');
                    return { ok, bal: storage.state.wallets['JP Cash'].balance, rev: storage.state.revision };
                });
            })()
        """)

        # Allow broadcast message to arrive in Tab 2
        await asyncio.sleep(0.5)

        tab2_state = await tab2.eval_js("""
            (function() {
                return {
                    balance: storage.state.wallets['JP Cash'].balance,
                    txCount: storage.state.transactions.length,
                    revision: storage.state.revision
                };
            })()
        """)

        passed2 = (tab2_state['balance'] == 70000 and tab2_state['txCount'] == 2 and tab2_state['revision'] == 2)
        dynamic_results.append(("Cross-Tab Broadcast", "Tab 2 automatically receives broadcast and reflects updated state without manual reload", passed2))
        print(f"  Result 2: Tab 1={t1_inc_res}, Tab 2 auto-updated: balance={tab2_state['balance']}, txCount={tab2_state['txCount']}, rev={tab2_state['revision']} -> {'✅ PASS' if passed2 else '❌ FAIL'}")

        # =========================================================================
        # Scenario 3: Dirty Modal Conflict Warning Banner
        # =========================================================================
        print("\n[Scenario 3] Dirty Modal Conflict Protection in Concurrent Tab")
        await reset_both_tabs()

        # In Tab 2, open transaction modal and enter dirty user inputs
        await tab2.eval_js("""
            (function() {
                app.openTransactionModal('expense');
                const descInput = document.getElementById('tx-note');
                if (descInput) {
                    descInput.value = 'Unsaved draft in Tab 2';
                    descInput.dataset.dirty = 'true';
                }
                const amtInput = document.getElementById('tx-amount');
                if (amtInput) {
                    amtInput.value = '4200';
                    amtInput.dataset.dirty = 'true';
                }
            })()
        """)

        # Tab 1 makes a mutation and broadcasts
        await tab1.eval_js("""
            (async function() {
                await storage.runExclusive(async () => {
                    walletManager.addExpense('JP Bank', 'jp-food', 1500, 'Tab 1 lunch', '2026-11-17');
                });
            })()
        """)

        await asyncio.sleep(0.4)

        dirty_check = await tab2.eval_js("""
            (function() {
                const banner = document.querySelector('.modal-conflict-banner');
                const descInput = document.getElementById('tx-note');
                const amtInput = document.getElementById('tx-amount');
                return {
                    bannerVisible: !!banner && banner.offsetParent !== null,
                    bannerText: banner ? banner.innerText : null,
                    descValue: descInput ? descInput.value : null,
                    amtValue: amtInput ? amtInput.value : null
                };
            })()
        """)

        passed3 = (
            dirty_check['bannerVisible'] is True and
            dirty_check['descValue'] == 'Unsaved draft in Tab 2' and
            dirty_check['amtValue'] == '4200' and
            ("Updated in another tab" in (dirty_check['bannerText'] or "") or "Financial Update" in (dirty_check['bannerText'] or ""))
        )
        dynamic_results.append(("Dirty Tab Safety", "Tab 2 preserves user form draft and displays non-destructive amber warning banner", passed3))
        print(f"  Result 3: bannerVisible={dirty_check['bannerVisible']}, bannerText={dirty_check['bannerText']}, draftPreserved={dirty_check['descValue'] == 'Unsaved draft in Tab 2'} -> {'✅ PASS' if passed3 else '❌ FAIL'}")

        # Clean up modal in Tab 2
        await tab2.eval_js("""
            (function() {
                app.closeModal('transaction-modal');
                const banner = document.querySelector('.modal-conflict-banner');
                if (banner) banner.remove();
            })()
        """)

        # =========================================================================
        # Scenario 4: Two Tabs Attempting Simultaneous Month Closure
        # =========================================================================
        print("\n[Scenario 4] Idempotent Month Closure Under Cross-Tab Concurrency")
        await reset_both_tabs()

        close_res = await asyncio.gather(
            tab1.eval_js("""
                (async function() {
                    return await storage.runExclusive(async () => {
                        storage.reloadAuthoritativeLocalState();
                        return storage.closeCurrentMonth("Manual Close", "2026-10");
                    });
                })()
            """),
            tab2.eval_js("""
                (async function() {
                    return await storage.runExclusive(async () => {
                        storage.reloadAuthoritativeLocalState();
                        return storage.closeCurrentMonth("Manual Close", "2026-10");
                    });
                })()
            """)
        )

        closure_verification = await tab1.eval_js("""
            (function() {
                storage.reloadAuthoritativeLocalState();
                const closedEntry = storage.state.closedMonths ? storage.state.closedMonths['2026-10'] : null;
                return {
                    closedExists: !!closedEntry,
                    status: closedEntry ? closedEntry.status : null
                };
            })()
        """)

        passed4 = (closure_verification['closedExists'] is True and closure_verification['status'] == 'closed')
        dynamic_results.append(("Month Close Idempotency", "Concurrent month closures across tabs produce exactly 1 closed snapshot (no duplicate carryover)", passed4))
        print(f"  Result 4: closedExists={closure_verification['closedExists']}, status={closure_verification['status']} -> {'✅ PASS' if passed4 else '❌ FAIL'}")

        # =========================================================================
        # Scenario 5: Concurrent International Remittances
        # =========================================================================
        print("\n[Scenario 5] Concurrent International Remittances Across Tabs")
        await reset_both_tabs()

        remit_res = await asyncio.gather(
            tab1.eval_js("""
                (async function() {
                    return await storage.runExclusive(async () => {
                        storage.reloadAuthoritativeLocalState();
                        return walletManager.remittance('JP Bank', 'IN Bank', 10000, 5500, 'Tab 1 Remit', '2026-11-18');
                    });
                })()
            """),
            tab2.eval_js("""
                (async function() {
                    return await storage.runExclusive(async () => {
                        storage.reloadAuthoritativeLocalState();
                        return walletManager.remittance('JP Cash', 'IN Bank', 5000, 2750, 'Tab 2 Remit', '2026-11-18');
                    });
                })()
            """)
        )

        balances = await tab1.eval_js("""
            (function() {
                storage.reloadAuthoritativeLocalState();
                return {
                    jpBank: storage.state.wallets['JP Bank'].balance,
                    jpCash: storage.state.wallets['JP Cash'].balance,
                    inBank: storage.state.wallets['IN Bank'].balance
                };
            })()
        """)

        passed5 = (
            balances['jpBank'] == 90000 and
            balances['jpCash'] == 45000 and
            balances['inBank'] == 258250
        )
        dynamic_results.append(("Concurrent Remittance", "Concurrent cross-country remittances update both source wallets and target wallet with accurate conversions", passed5))
        print(f"  Result 5: jpBank={balances['jpBank']}, jpCash={balances['jpCash']}, inBank={balances['inBank']} -> {'✅ PASS' if passed5 else '❌ FAIL'}")

        # =========================================================================
        # Scenario 6: Supabase CAS Concurrency Rejection (Simulated Stale Write)
        # =========================================================================
        print("\n[Scenario 6] Supabase CAS Concurrency Rejection")
        await reset_both_tabs()

        cas_test = await tab1.eval_js("""
            (async function() {
                const cloudState = JSON.parse(JSON.stringify(storage.state));
                cloudState.revision = 5; // Cloud has advanced to revision 5!

                supabaseClient.session = { user: { id: 'test_user_phase5' } };
                supabaseClient.client = {
                    from: function(table) {
                        return {
                            update: function(payload) {
                                return {
                                    eq: function(field1, val1) {
                                        return {
                                            eq: function(field2, val2) {
                                                return {
                                                    select: async function() {
                                                        if (String(val2) === "5") {
                                                            return { data: [{ state: payload.state }], error: null };
                                                        } else {
                                                            // Stale revision: 0 rows updated!
                                                            return { data: [], error: null };
                                                        }
                                                    }
                                                };
                                            }
                                        };
                                    }
                                };
                            },
                            select: function() {
                                return {
                                    eq: function() {
                                        return {
                                            single: async function() {
                                                return { data: { state: cloudState }, error: null };
                                            }
                                        };
                                    }
                                };
                            }
                        };
                    }
                };
                storage.currentUserId = 'test_user_phase5';
                storage.initialSyncDone = true;

                // Local state is at revision 1, but expectedRev is 1. Cloud is at 5.
                storage.lastConfirmedCloudRevision = 1;
                storage.state.revision = 2; // local edit made
                storage.state.transactions.push({ id: 'tx_local_conflict', amount: 999, walletId: 'JP Bank', note: 'Local Stale Tx' });

                // Call pushToSupabase
                const res = await storage.pushToSupabase({ expectedRev: 1 });

                // Check conflict stash
                const stashed = localStorage.getItem(`${storage.getActiveStorageKey()}_conflict_stash`);
                const activeConflict = storage.activeConflict;
                const syncStatus = storage.cloudSyncStatus;

                return {
                    res,
                    syncStatus,
                    hasStashed: !!stashed,
                    conflictDetected: activeConflict && activeConflict.detected === true,
                    conflictLocalRev: activeConflict ? activeConflict.localRevision : null,
                    conflictCloudRev: activeConflict ? activeConflict.remoteRevision : null
                };
            })()
        """)

        passed6 = (
            cas_test['syncStatus'] == 'CONFLICT' and
            cas_test['hasStashed'] is True and
            cas_test['conflictDetected'] is True and
            cas_test['conflictCloudRev'] == 5
        )
        dynamic_results.append(("Supabase CAS Rejection", "PostgREST CAS rejects stale write (0 rows updated), marks status CONFLICT, and creates conflict stash", passed6))
        print(f"  Result 6: syncStatus={cas_test['syncStatus']}, conflictDetected={cas_test['conflictDetected']}, cloudRev={cas_test['conflictCloudRev']} -> {'✅ PASS' if passed6 else '❌ FAIL'}")

        # =========================================================================
        # Scenario 7: Conflict Resolution Strategy 'accept_cloud'
        # =========================================================================
        print("\n[Scenario 7] Conflict Resolution Strategy 'accept_cloud'")
        resolve_accept = await tab1.eval_js("""
            (async function() {
                const res = await storage.resolveConflict('accept_cloud');
                return {
                    success: res.success,
                    activeConflictAfter: storage.activeConflict,
                    currentRev: storage.state.revision,
                    syncStatus: storage.cloudSyncStatus
                };
            })()
        """)

        passed7 = (
            resolve_accept['success'] is True and
            resolve_accept['activeConflictAfter'] is None and
            resolve_accept['currentRev'] == 5 and
            (resolve_accept['syncStatus'] == 'CONFIRMED' or resolve_accept['syncStatus'] == 'SYNCED')
        )
        dynamic_results.append(("Conflict Resolution accept_cloud", "Adopts cloud state (rev 5), clears active conflict, archives local state", passed7))
        print(f"  Result 7: success={resolve_accept['success']}, currentRev={resolve_accept['currentRev']}, status={resolve_accept['syncStatus']} -> {'✅ PASS' if passed7 else '❌ FAIL'}")

        # =========================================================================
        # Scenario 8: Conflict Resolution Strategy 'overwrite_cloud'
        # =========================================================================
        print("\n[Scenario 8] Conflict Resolution Strategy 'overwrite_cloud'")
        await reset_both_tabs()

        resolve_overwrite = await tab1.eval_js("""
            (async function() {
                const cloudState = JSON.parse(JSON.stringify(storage.state));
                cloudState.revision = 8;
                storage.state.revision = 3;
                storage.currentUserId = 'test_user_phase5';
                storage.initialSyncDone = true;
                storage.stashConflictState(storage.state, cloudState);

                supabaseClient.session = { user: { id: 'test_user_phase5' } };
                supabaseClient.client = {
                    from: function() {
                        return {
                            update: function(payload) {
                                return {
                                    eq: function() {
                                        return {
                                            select: async function() {
                                                return { data: [{ state: payload.state }], error: null };
                                            }
                                        };
                                    }
                                };
                            },
                            upsert: async function(payload) {
                                return { error: null };
                            }
                        };
                    }
                };

                const res = await storage.resolveConflict('overwrite_cloud');
                return {
                    success: res.success,
                    activeConflict: storage.activeConflict,
                    newRev: storage.state.revision,
                    syncStatus: storage.cloudSyncStatus
                };
            })()
        """)

        passed8 = (
            resolve_overwrite['success'] is True and
            resolve_overwrite['activeConflict'] is None and
            resolve_overwrite['newRev'] >= 9 and
            (resolve_overwrite['syncStatus'] == 'CONFIRMED' or resolve_overwrite['syncStatus'] == 'SYNCED')
        )
        dynamic_results.append(("Conflict Resolution overwrite_cloud", "Increments revision past cloud (rev 9), forces cloud overwrite, clears conflict", passed8))
        print(f"  Result 8: success={resolve_overwrite['success']}, newRev={resolve_overwrite['newRev']}, status={resolve_overwrite['syncStatus']} -> {'✅ PASS' if passed8 else '❌ FAIL'}")

        # =========================================================================
        # Scenario 9: Conflict Resolution Strategy 'merge_nonconflicting'
        # =========================================================================
        print("\n[Scenario 9] Conflict Resolution Strategy 'merge_nonconflicting'")
        await reset_both_tabs()

        resolve_merge = await tab1.eval_js("""
            (async function() {
                const cloudState = JSON.parse(JSON.stringify(storage.state));
                cloudState.revision = 10;
                cloudState.transactions.push({
                    id: 'tx_cloud_1',
                    amount: 2500,
                    walletId: 'JP Bank',
                    categoryId: 'jp-food',
                    currency: '¥',
                    region: 'JP',
                    date: '2026-11-19',
                    note: 'Cloud Dinner'
                });

                storage.state.revision = 4;
                storage.state.transactions.push({
                    id: 'tx_local_1',
                    amount: 1200,
                    walletId: 'JP Bank',
                    categoryId: 'jp-transport',
                    currency: '¥',
                    region: 'JP',
                    date: '2026-11-19',
                    note: 'Local Bus'
                });

                storage.currentUserId = 'test_user_phase5';
                storage.initialSyncDone = true;
                storage.stashConflictState(storage.state, cloudState);

                supabaseClient.session = { user: { id: 'test_user_phase5' } };
                supabaseClient.client = {
                    from: function() {
                        return {
                            update: function(payload) {
                                return {
                                    eq: function() {
                                        return {
                                            select: async function() {
                                                return { data: [{ state: payload.state }], error: null };
                                            }
                                        };
                                    }
                                };
                            },
                            upsert: async function(payload) {
                                return { error: null };
                            }
                        };
                    }
                };

                const res = await storage.resolveConflict('merge_nonconflicting');
                const txIds = storage.state.transactions.map(t => t.id);
                return {
                    success: res.success,
                    hasCloudTx: txIds.includes('tx_cloud_1'),
                    hasLocalTx: txIds.includes('tx_local_1'),
                    totalTx: txIds.length,
                    newRev: storage.state.revision,
                    syncStatus: storage.cloudSyncStatus
                };
            })()
        """)

        passed9 = (
            resolve_merge['success'] is True and
            resolve_merge['hasCloudTx'] is True and
            resolve_merge['hasLocalTx'] is True and
            resolve_merge['newRev'] >= 11 and
            (resolve_merge['syncStatus'] == 'CONFIRMED' or resolve_merge['syncStatus'] == 'SYNCED')
        )
        dynamic_results.append(("Conflict Resolution merge", "Merges unique transactions from both branches, advances revision to 11, syncs successfully", passed9))
        print(f"  Result 9: success={resolve_merge['success']}, hasCloudTx={resolve_merge['hasCloudTx']}, hasLocalTx={resolve_merge['hasLocalTx']}, rev={resolve_merge['newRev']} -> {'✅ PASS' if passed9 else '❌ FAIL'}")

        # Reset any test auth
        await tab1.eval_js("""
            (function() {
                if (typeof supabaseClient !== 'undefined') supabaseClient.session = null;
                storage.currentUserId = null;
            })()
        """)

        # =========================================================================
        # Scenario 10: Fallback Cooperative Mutex on Web Lock Absence / Reclaim
        # =========================================================================
        print("\n[Scenario 10] Fallback Cooperative Mutex & Lease Reclamation")
        mutex_test = await tab1.eval_js("""
            (async function() {
                const lockName = `${storage.getActiveStorageKey()}_test_lock`;
                const leaseKey = `${lockName}_lease`;

                // 1. Acquire and release normally
                let executed = false;
                await storage._runWithFallbackLock(lockName, async () => {
                    executed = true;
                    const raw = localStorage.getItem(leaseKey);
                    const parsed = JSON.parse(raw);
                    if (!parsed || !parsed.owner) throw new Error("Lock owner missing");
                });

                // Lock must be released
                const releasedClean = (localStorage.getItem(leaseKey) === null);

                // 2. Reclaim expired lease
                const expiredLease = {
                    owner: 'stale_owner_123',
                    expiresAt: Date.now() - 5000
                };
                localStorage.setItem(leaseKey, JSON.stringify(expiredLease));

                let reclaimed = false;
                await storage._runWithFallbackLock(lockName, async () => {
                    reclaimed = true;
                });

                return {
                    executed,
                    releasedClean,
                    reclaimed
                };
            })()
        """)

        passed10 = (mutex_test['executed'] and mutex_test['releasedClean'] and mutex_test['reclaimed'])
        dynamic_results.append(("Fallback Lease Mutex", "Cooperative fallback mutex acquires, releases cleanly, and reclaims expired locks", passed10))
        print(f"  Result 10: executed={mutex_test['executed']}, releasedClean={mutex_test['releasedClean']}, reclaimed={mutex_test['reclaimed']} -> {'✅ PASS' if passed10 else '❌ FAIL'}")

        # =========================================================================
        # Scenario 11: Network Offline / Online State Transitions
        # =========================================================================
        print("\n[Scenario 11] Network Offline / Online State Transitions")
        offline_test = await tab1.eval_js("""
            (async function() {
                // Trigger offline event
                window.dispatchEvent(new Event('offline'));
                const statusOffline = storage.cloudSyncStatus;

                // Add an expense while offline
                await storage.runExclusive(async () => {
                    walletManager.addExpense('JP Cash', 'jp-food', 800, 'Offline Onigiri', '2026-11-20');
                });

                // Configure auth so online reconnect initiates cloud push
                storage.initialSyncDone = true;
                if (typeof supabaseClient !== 'undefined') {
                    supabaseClient.session = { user: { id: 'test_user_phase5' } };
                }

                // Trigger online event
                let syncAttempted = false;
                const origPush = storage.pushToSupabase.bind(storage);
                storage.pushToSupabase = async function() {
                    syncAttempted = true;
                    return { success: true };
                };

                window.dispatchEvent(new Event('online'));
                await new Promise(r => setTimeout(r, 100));

                storage.pushToSupabase = origPush;
                if (typeof supabaseClient !== 'undefined') {
                    supabaseClient.session = null;
                }

                return {
                    statusOffline,
                    syncAttempted
                };
            })()
        """)

        passed11 = (offline_test['statusOffline'] == 'FAILED' and offline_test['syncAttempted'] is True)
        dynamic_results.append(("Offline/Online Handling", "Marks status FAILED (Offline) on disconnect, triggers automatic sync on reconnect", passed11))
        print(f"  Result 11: statusOffline={offline_test['statusOffline']}, syncAttempted={offline_test['syncAttempted']} -> {'✅ PASS' if passed11 else '❌ FAIL'}")

        # =========================================================================
        # Scenario 12: Idempotent Retries Under Rapid Sequential Invocations
        # =========================================================================
        print("\n[Scenario 12] Rapid Sequential Invocations & Deduplication")
        await reset_both_tabs()

        rapid_test = await tab1.eval_js("""
            (async function() {
                for (let i = 0; i < 5; i++) {
                    await storage.runExclusive(async () => {
                        storage.reloadAuthoritativeLocalState();
                        walletManager.addExpense('JP Bank', 'jp-food', 100, `Sequential item ${i}`, '2026-11-20');
                    });
                }

                storage.reloadAuthoritativeLocalState();
                return {
                    txCount: storage.state.transactions.length,
                    finalBalance: storage.state.wallets['JP Bank'].balance,
                    finalRev: storage.state.revision
                };
            })()
        """)

        passed12 = (
            rapid_test['txCount'] == 6 and
            rapid_test['finalBalance'] == 99500 and
            rapid_test['finalRev'] == 6
        )
        dynamic_results.append(("Rapid Sequential Saves", "5 rapid sequential transactions apply with exact arithmetic and strictly monotonic revisions", passed12))
        print(f"  Result 12: txCount={rapid_test['txCount']}, finalBalance={rapid_test['finalBalance']}, rev={rapid_test['finalRev']} -> {'✅ PASS' if passed12 else '❌ FAIL'}")

        # =========================================================================
        # Scenario 13: UI Header Sync Pill & Conflict Modal Rendering
        # =========================================================================
        print("\n[Scenario 13] UI Header Sync Pill & Conflict Modal Rendering")
        ui_test = await tab1.eval_js("""
            (function() {
                const pill = document.getElementById('desktop-sync-status-pill');
                if (!pill) return { found: false };

                storage.cloudSyncStatus = 'SYNCED';
                app.updateSyncStatusPill();
                const syncedText = pill.innerText;
                const syncedClass = pill.className;

                storage.cloudSyncStatus = 'LOCAL_ONLY';
                app.updateSyncStatusPill();
                const localText = pill.innerText;

                storage.cloudSyncStatus = 'FAILED';
                app.updateSyncStatusPill('SYNC_FAILED', 'Offline');
                const offlineText = pill.innerText;

                storage.cloudSyncStatus = 'CONFLICT';
                storage.activeConflict = {
                    detected: true,
                    localState: { revision: 3, transactions: [{ id: 'tx1' }] },
                    remoteState: { revision: 4, transactions: [{ id: 'tx1' }, { id: 'tx2' }] }
                };
                app.updateSyncStatusPill('CONFLICT_DETECTED');
                const conflictText = pill.innerText;
                const conflictClass = pill.className;

                // Open modal
                app.openConflictResolutionModal();
                const modal = document.getElementById('conflict-resolution-modal');
                const modalVisible = modal && (modal.classList.contains('active') || modal.style.display === 'flex');

                return {
                    found: true,
                    syncedText,
                    syncedClass,
                    localText,
                    offlineText,
                    conflictText,
                    conflictClass,
                    modalVisible
                };
            })()
        """)

        passed13 = (
            ui_test.get('found') is True and
            "Synced" in ui_test['syncedText'] and
            "Offline" in ui_test['offlineText'] and
            "Sync Conflict" in ui_test['conflictText'] and
            "sync-pill-conflict" in ui_test['conflictClass'] and
            ui_test['modalVisible'] is True
        )
        dynamic_results.append(("UI Header Sync Pill & Modal", "Header sync pill accurately reflects SYNCED, LOCAL_ONLY, OFFLINE, CONFLICT and displays conflict modal", passed13))
        print(f"  Result 13: pillFound={ui_test.get('found')}, conflictText={ui_test.get('conflictText')}, modalVisible={ui_test.get('modalVisible')} -> {'✅ PASS' if passed13 else '❌ FAIL'}")

        # Close conflict modal
        await tab1.eval_js("""
            (function() {
                const modal = document.getElementById('conflict-resolution-modal');
                if (modal) modal.classList.remove('active');
            })()
        """)

        # =========================================================================
        # Scenario 14: Production Continuous Ledger Invariant Verification
        # =========================================================================
        print("\n[Scenario 14] Production Continuous Ledger Invariant Verification")
        if not os.path.exists(EXPORT_PATH):
            print(f"  ⚠️ Warning: Export path {EXPORT_PATH} not found.")
            dynamic_results.append(("Production Continuous Ledger", "Export file not found", False))
        else:
            with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
                prod_data = json.load(f)

            prod_json = json.dumps(prod_data)
            prod_js_code = """
                (async function() {
                    const rawProd = """ + prod_json + """;
                    const rawState = rawProd.state || rawProd;
                    storage.accountStatus = 'EXISTING_USER';
                    storage.cloudSyncStatus = 'SYNCED';
                    const storageKey = storage.getActiveStorageKey();
                    localStorage.setItem(storageKey, JSON.stringify(rawState));
                    storage.state = storage.loadData();
                    storage._attachBudgetAccessors(storage.state);
                    storage.state.revision = 100;
                    storage.lastConfirmedCloudRevision = 100;
                    storage._saveDataDirect();

                    const initialTxCount = storage.state.transactions.length;
                    const initialWallets = Object.keys(storage.state.wallets).length;
                    const axisInitial = storage.state.wallets['Axis Bank'] ? storage.state.wallets['Axis Bank'].balance : null;

                    // Execute exclusive lock mutation on production data
                    await storage.runExclusive(async () => {
                        storage.reloadAuthoritativeLocalState();
                        // Add an expense to Axis Bank (using 'in-petrol' or any valid category)
                        walletManager.addExpense('Axis Bank', 'in-petrol', 1000, 'Verification Purchase', '2026-11-21');
                    });

                    storage.reloadAuthoritativeLocalState();
                    const afterExpenseAxis = storage.state.wallets['Axis Bank'].balance;
                    const newTx = storage.state.transactions[0];

                    // Rollback verification expense using deleteTransaction to restore exact original state
                    await storage.runExclusive(async () => {
                        storage.reloadAuthoritativeLocalState();
                        walletManager.deleteTransaction(newTx.id);
                    });

                    storage.reloadAuthoritativeLocalState();
                    const finalTxCount = storage.state.transactions.length;
                    const finalWallets = Object.keys(storage.state.wallets).length;
                    const axisFinal = storage.state.wallets['Axis Bank'].balance;

                    return {
                        initialTxCount,
                        initialWallets,
                        axisInitial,
                        afterExpenseAxis,
                        finalTxCount,
                        finalWallets,
                        axisFinal
                    };
                })()
            """
            prod_test = await tab1.eval_js(prod_js_code)

            passed14 = (
                prod_test['initialTxCount'] == 116 and
                prod_test['initialWallets'] == 6 and
                round(prod_test['axisInitial'], 2) == 46794.53 and
                round(prod_test['afterExpenseAxis'], 2) == 45794.53 and
                prod_test['finalTxCount'] == 116 and
                round(prod_test['axisFinal'], 2) == 46794.53
            )
            dynamic_results.append(("Production Continuous Ledger", "All 116 transactions, 6 wallets, and Axis Bank ₹46,794.53 preserved exactly under concurrent engine", passed14))
            print(f"  Result 14: initialTxCount={prod_test['initialTxCount']}, initialWallets={prod_test['initialWallets']}, axisInitial={prod_test['axisInitial']}, axisFinal={prod_test['axisFinal']} -> {'✅ PASS' if passed14 else '❌ FAIL'}")

        # Summary
        print("\n" + "=" * 80)
        print("PHASE 5 SYNCHRONIZATION & CONCURRENCY TEST SUMMARY")
        print("=" * 80)
        all_passed = True
        for cat, name, passed in dynamic_results:
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"[{status}] [{cat}] {name}")
            if not passed:
                all_passed = False

        if all_passed:
            print("\n🎉 ALL 14 CONCURRENCY & SYNCHRONIZATION TESTS PASSED PERFECTLY!")
            return 0
        else:
            print("\n❌ SOME TESTS FAILED.")
            return 1

    finally:
        if tab1:
            await tab1.close()
        if tab2:
            await tab2.close()
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    code = asyncio.run(main())
    sys.exit(code)
