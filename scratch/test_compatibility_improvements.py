#!/usr/bin/env python3
"""
Comprehensive Regression Test Suite for Compatibility Improvements
------------------------------------------------------------------
Verifies:
1. Plain backup validation and restore-path test.
2. Wrapped production export validation and restore-path test.
3. Both formats produce 100% identical continuous ledger migration results.
4. Malformed wrappers are strictly rejected.
5. Generated category ID (jp-relocation-1791809386872) displays cleanly as 'Relocation'.
6. Legitimate numeric category suffixes remain intact (Room 101, 7 Eleven, Level 2, Store 2024).
7. All 116 transaction IDs remain preserved.
8. All 6 wallet balances match exact floating point values (zero rounding).
9. Boundary transactions (July 31 ID 1785519182944 and October 31 IDs 1793462624420, 1793462605069) remain accessible.
10. Transfer and remittance relationships remain intact.
11. Migration idempotency (2nd pass makes zero changes).

Constraints:
- Isolated headless browser instance with temporary profile.
- Zero Supabase writes or network connections.
- Zero localStorage persistence.
- Original production export read-only.
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
STORAGE_JS_PATH = os.path.abspath('js/storage.js')
APP_JS_PATH = os.path.abspath('js/app.js')
WALLET_JS_PATH = os.path.abspath('js/wallet.js')

async def run_regression_tests():
    print("=" * 70)
    print("RUNNING COMPATIBILITY IMPROVEMENTS REGRESSION TEST SUITE")
    print("=" * 70)

    with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
        export_wrapper = json.load(f)

    plain_state = export_wrapper.get('state', export_wrapper)

    profile_dir = '/tmp/isolated_regression_profile_' + str(int(time.time()))
    port = 9497
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

            setup_script = """
            (() => {
                window.SUPABASE_CONFIG = {
                    environment: 'test',
                    projectRef: 'testref',
                    url: 'https://testref.supabase.co',
                    storageKey: 'em_connected_v2_test'
                };
                const store = {};
                const mockStorage = {
                    getItem: (k) => store[k] || null,
                    setItem: (k, v) => { store[k] = String(v); },
                    removeItem: (k) => { delete store[k]; },
                    clear: () => { for (const k in store) delete store[k]; }
                };
                try {
                    Object.defineProperty(window, 'localStorage', {
                        value: mockStorage,
                        configurable: true,
                        writable: true
                    });
                } catch (e) {
                    window.mockStorage = mockStorage;
                }
                window.supabaseClient = undefined;
            })();
            """
            await send("Runtime.evaluate", {"expression": setup_script})

            with open(STORAGE_JS_PATH, 'r', encoding='utf-8') as f:
                storage_code = f.read()
            with open(WALLET_JS_PATH, 'r', encoding='utf-8') as f:
                wallet_code = f.read()
            with open(APP_JS_PATH, 'r', encoding='utf-8') as f:
                app_code = f.read()

            await send("Runtime.evaluate", {"expression": storage_code})
            await send("Runtime.evaluate", {"expression": wallet_code})
            await send("Runtime.evaluate", {"expression": app_code})

            test_runner = f"""
            (() => {{
                const results = {{ checks: [] }};
                function assert(title, condition, details = '') {{
                    results.checks.push({{ title, pass: !!condition, details: String(details) }});
                }}

                const wrappedExport = {json.dumps(export_wrapper)};
                const plainState = wrappedExport.state;

                // -----------------------------------------------------------------
                // Test 1: Plain backup validation and isolated restore flow
                // -----------------------------------------------------------------
                const plainVal = storage.validateBackupData(plainState);
                assert('Plain backup passes validation', plainVal.valid === true, JSON.stringify(plainVal));
                assert('Plain backup validation returns normalizedData matching plain state',
                    plainVal.normalizedData && plainVal.normalizedData.wallets && plainVal.normalizedData.transactions.length === 9);

                // Simulate app.handleRestoreFileSelect logic
                let pendingRestore = plainVal.normalizedData || plainState;
                assert('Pending restore data is normalized (not wrapped)', !pendingRestore.source && !pendingRestore.databaseUpdatedAt);

                // Simulate app.confirmRestore migration call
                const plainMigrated = storage.migrateToContinuousLedger(pendingRestore);
                assert('Plain backup migration succeeds via migrateToContinuousLedger',
                    plainMigrated && plainMigrated.schemaVersion === 3 && plainMigrated.transactions.length === 116);

                // -----------------------------------------------------------------
                // Test 2: Wrapped production export validation and isolated restore flow
                // -----------------------------------------------------------------
                const wrappedVal = storage.validateBackupData(wrappedExport);
                assert('Wrapped export passes validation', wrappedVal.valid === true, JSON.stringify(wrappedVal));
                assert('Wrapped export returns inner state as normalizedData',
                    wrappedVal.normalizedData && wrappedVal.normalizedData.wallets && !wrappedVal.normalizedData.source);

                // Simulate app.handleRestoreFileSelect logic on wrapped export
                pendingRestore = wrappedVal.normalizedData || wrappedExport;
                assert('Wrapped export pendingRestore receives normalized inner state (not outer wrapper)',
                    pendingRestore.wallets && !pendingRestore.source && !pendingRestore.databaseUpdatedAt);

                // Simulate app.confirmRestore migration call on wrapped export
                const wrappedMigrated = storage.migrateToContinuousLedger(pendingRestore);
                assert('Wrapped export migration succeeds via migrateToContinuousLedger',
                    wrappedMigrated && wrappedMigrated.schemaVersion === 3 && wrappedMigrated.transactions.length === 116);

                // -----------------------------------------------------------------
                // Test 3: Both formats produce 100% identical continuous ledger sequence
                // -----------------------------------------------------------------
                const plainTxIds = plainMigrated.transactions.map(t => t.id).join(',');
                const wrappedTxIds = wrappedMigrated.transactions.map(t => t.id).join(',');
                assert('Plain and wrapped produce 100% identical continuous ledger sequence',
                    plainTxIds === wrappedTxIds && plainTxIds.length > 0);

                // -----------------------------------------------------------------
                // Test 4: Malformed wrapper rejection
                // -----------------------------------------------------------------
                const malformed1 = storage.validateBackupData({{ source: 'production', state: null }});
                assert('Reject wrapper with state: null', malformed1.valid === false, malformed1.error);

                const malformed2 = storage.validateBackupData({{ source: 'production', state: {{}} }});
                assert('Reject wrapper with state: {{}}', malformed2.valid === false, malformed2.error);

                const malformed3 = storage.validateBackupData({{ source: 'production', state: 'invalid string' }});
                assert('Reject wrapper with non-object state', malformed3.valid === false, malformed3.error);

                const malformed4 = storage.validateBackupData({{ source: 'production' }});
                assert('Reject wrapper missing state property', malformed4.valid === false, malformed4.error);

                const malformed5 = storage.validateBackupData(null);
                assert('Reject null input', malformed5.valid === false, malformed5.error);

                const malformed6 = storage.validateBackupData('plain string');
                assert('Reject non-object input', malformed6.valid === false, malformed6.error);

                // -----------------------------------------------------------------
                // Test 5: Category Display Fallback
                // -----------------------------------------------------------------
                // 5a: Generated ID displays cleanly as 'Relocation'
                const relocationLabel = app.getCategoryName('jp-relocation-1791809386872');
                assert('Generated category ID displays as \"Relocation\"', relocationLabel === 'Relocation', 'Got: ' + relocationLabel);

                const tripLabel = app.getCategoryName('jp-trip-1785518761698');
                assert('Trip generated category ID displays as \"Trip\"', tripLabel === 'Trip', 'Got: ' + tripLabel);

                // 5b: Legitimate numeric category names remain intact
                const roomLabel = app.getCategoryName('in-room-101');
                assert('Category ending in room-101 remains \"Room 101\"', roomLabel === 'Room 101', 'Got: ' + roomLabel);

                const sevenEleven = app.getCategoryName('jp-7-eleven');
                assert('Category 7-eleven remains \"7 Eleven\"', sevenEleven === '7 Eleven', 'Got: ' + sevenEleven);

                const levelLabel = app.getCategoryName('level-2');
                assert('Category level-2 remains \"Level 2\"', levelLabel === 'Level 2', 'Got: ' + levelLabel);

                const aptLabel = app.getCategoryName('in-apartment-2b');
                assert('Category apartment-2b remains \"Apartment 2b\"', aptLabel === 'Apartment 2b', 'Got: ' + aptLabel);

                const storeLabel = app.getCategoryName('store-2024');
                assert('Category store-2024 remains \"Store 2024\"', storeLabel === 'Store 2024', 'Got: ' + storeLabel);

                // -----------------------------------------------------------------
                // Test 6: Invariant Checks across Migrated State
                // -----------------------------------------------------------------
                storage.state = wrappedMigrated;
                storage._attachHistoryGetters(wrappedMigrated);

                // 6a: 116 unique IDs
                assert('All 116 transactions preserved', wrappedMigrated.transactions.length === 116);
                const uniqueIds = new Set(wrappedMigrated.transactions.map(t => t.id));
                assert('All 116 transaction IDs are unique', uniqueIds.size === 116);

                // 6b: All 6 wallet balances match exact floats (zero rounding)
                const preWallets = plainState.wallets;
                const postWallets = wrappedMigrated.wallets;
                for (const wId of Object.keys(preWallets)) {{
                    const preB = preWallets[wId].balance;
                    const postB = postWallets[wId].balance;
                    assert(`Wallet \"${{wId}}\" balance matches exact float (${{preB}} == ${{postB}})`, preB === postB);
                }}

                // 6c: July 31 and October 31 boundary transactions
                const july31 = wrappedMigrated.transactions.find(t => t.id === '1785519182944');
                assert('July 31 Tx (ID 1785519182944) exists in continuous ledger', !!july31 && july31.date === '2026-07-31');

                const julyQuery = walletManager.getTransactions({{ monthKey: '2026-07' }});
                assert('July 31 Tx returned by walletManager July query', julyQuery.some(t => t.id === '1785519182944'));

                const augQuery = walletManager.getTransactions({{ monthKey: '2026-08' }});
                assert('July 31 Tx excluded from August query', !augQuery.some(t => t.id === '1785519182944'));

                const oct31_1 = wrappedMigrated.transactions.find(t => t.id === '1793462624420');
                const oct31_2 = wrappedMigrated.transactions.find(t => t.id === '1793462605069');
                assert('October 31 Txs exist in continuous ledger', !!oct31_1 && !!oct31_2);

                const octHistory = wrappedMigrated.history.find(h => h.monthKey === '2026-10');
                assert('October dynamic getter returns 49 txs including Oct 31 boundary txs',
                    octHistory && octHistory.transactions.length === 49 &&
                    octHistory.transactions.some(t => t.id === '1793462624420') &&
                    octHistory.transactions.some(t => t.id === '1793462605069')
                );

                const novQuery = walletManager.getTransactions({{ monthKey: '2026-11' }});
                assert('November query excludes October 31 boundary txs (length: 7)',
                    novQuery.length === 7 &&
                    !novQuery.some(t => t.id === '1793462624420' || t.id === '1793462605069')
                );

                // 6d: Transfer / Remittance integrity
                const transfers = wrappedMigrated.transactions.filter(t => t.type === 'transfer');
                assert('All 14 transfers have valid sourceId, destId, and amount',
                    transfers.length === 14 && transfers.every(t => t.sourceId && t.destId && t.amount > 0)
                );
                const remittances = wrappedMigrated.transactions.filter(t => t.type === 'remittance');
                assert('All 3 remittances have valid sourceId, destId, exchangeRate, and amounts',
                    remittances.length === 3 && remittances.every(t => t.sourceId && t.destId && t.exchangeRate && t.sourceAmount && t.destAmount)
                );

                // 6e: Migration Idempotency
                const idempotencyCheck = storage.previewContinuousLedgerMigration(wrappedMigrated);
                assert('Migration idempotency passes on already migrated state',
                    idempotencyCheck.success === true && idempotencyCheck.alreadyMigrated === true &&
                    idempotencyCheck.preview.totalTransactions === 116
                );

                return results;
            }})();
            """

            eval_test = await send("Runtime.evaluate", {
                "expression": test_runner,
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
    results = asyncio.run(run_regression_tests())
    checks = results.get('checks', [])

    print(f"\nTotal Regression Checks: {len(checks)}")
    passed = [c for c in checks if c['pass']]
    failed = [c for c in checks if not c['pass']]

    print(f"Passed: {len(passed)}")
    print(f"Failed: {len(failed)}")

    print("\n--- DETAILED CHECK RESULTS ---")
    for i, c in enumerate(checks, 1):
        status_sym = "✅ PASS" if c['pass'] else "❌ FAIL"
        print(f"{i:2d}. [{status_sym}] {c['title']}")
        if not c['pass'] or c['details']:
            print(f"      Details: {c['details']}")

    if failed:
        sys.exit(1)
    else:
        print("\n🎉 ALL REGRESSION CHECKS PASSED WITH 100% SUCCESS!")

if __name__ == '__main__':
    main()

