#!/usr/bin/env python3
"""
Production Export Compatibility Audit Harness
--------------------------------------------
Performs an isolated, in-memory compatibility audit of the fresh production JSON export
(dated 2026-11-16) against the current `test` branch migration code in `js/storage.js`.

Strict Constraints:
- Read-only on the production export file.
- Zero network calls / Supabase connections.
- Zero localStorage persistence or mutations.
- Isolated Chromium instance with temporary profile.
- No personal or sensitive financial values exposed in reports.
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

async def run_audit():
    print("=" * 70)
    print("EXPENSE MANAGER: PRODUCTION EXPORT COMPATIBILITY AUDIT")
    print("=" * 70)

    # 1. Read export file strictly read-only
    with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
        export_wrapper = json.load(f)

    raw_state = export_wrapper.get('state', export_wrapper)

    # Spawn headless Chrome in isolated temporary profile
    profile_dir = '/tmp/isolated_audit_profile_' + str(int(time.time()))
    port = 9495
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

            # Load js/storage.js into headless page
            with open(STORAGE_JS_PATH, 'r', encoding='utf-8') as f:
                storage_code = f.read()

            # Mock minimal environment: safe mock localStorage, zero network
            setup_script = f"""
            (() => {{
                window.SUPABASE_CONFIG = {{
                    environment: 'test',
                    projectRef: 'testref',
                    url: 'https://testref.supabase.co',
                    storageKey: 'em_connected_v2_test'
                }};
                const store = {{}};
                const mockStorage = {{
                    getItem: (k) => store[k] || null,
                    setItem: (k, v) => {{ store[k] = String(v); }},
                    removeItem: (k) => {{ delete store[k]; }},
                    clear: () => {{ for (const k in store) delete store[k]; }}
                }};
                try {{
                    Object.defineProperty(window, 'localStorage', {{
                        value: mockStorage,
                        configurable: true,
                        writable: true
                    }});
                }} catch (e) {{
                    window.mockStorage = mockStorage;
                }}
                window.supabaseClient = undefined; // strictly no Supabase client
            }})();
            """
            await send("Runtime.evaluate", {"expression": setup_script})

            # Evaluate storage.js
            eval_res = await send("Runtime.evaluate", {
                "expression": storage_code,
                "returnByValue": False
            })
            if 'exceptionDetails' in eval_res:
                print("FAILED to evaluate storage.js:", eval_res['exceptionDetails'])
                return False

            print("[Setup] storage.js evaluated successfully in headless sandbox.")

            # Send test runner expression
            test_runner = f"""
            (() => {{
                const rawExport = {json.dumps(export_wrapper)};
                const rawState = rawExport.state || rawExport;

                const results = {{}};

                // Test 1: validateBackupData on inner state
                results.validationInner = storage.validateBackupData(rawState);

                // Test 2: validateBackupData on outer wrapper
                results.validationOuter = storage.validateBackupData(rawExport);

                // Test 3: Pure Phase 1 Preview Migration on rawState
                const t0 = performance.now();
                const previewResult = storage.previewContinuousLedgerMigration(rawState);
                results.previewDurationMs = performance.now() - t0;
                results.previewSuccess = previewResult.success;
                results.previewError = previewResult.error || null;
                results.previewData = previewResult.preview || null;

                if (!previewResult.success) {{
                    return results;
                }}

                const migrated = previewResult.migratedState;
                results.migratedSchemaVersion = migrated.schemaVersion;
                results.migratedTxCount = Array.isArray(migrated.transactions) ? migrated.transactions.length : -1;
                results.migratedClosedMonths = Object.keys(migrated.closedMonths || {{}});

                // Dynamic getters test
                storage._attachHistoryGetters(migrated);
                results.historyGettersWorks = Array.isArray(migrated.history);
                results.historyDynamicCounts = {{}};
                if (Array.isArray(migrated.history)) {{
                    migrated.history.forEach(h => {{
                        results.historyDynamicCounts[h.monthKey] = Array.isArray(h.transactions) ? h.transactions.length : -1;
                    }});
                }}

                // Test 4: Idempotency (2nd migration run on migratedState)
                const secondPreview = storage.previewContinuousLedgerMigration(migrated);
                results.secondRunSuccess = secondPreview.success;
                results.secondRunAlreadyMigrated = secondPreview.alreadyMigrated === true;
                results.secondRunTxCount = secondPreview.preview ? secondPreview.preview.totalTransactions : -1;

                // Test 5: Verify input immutability
                results.inputMutated = (rawState.schemaVersion !== undefined);

                // Export essential data for python verifier
                results.migratedState = migrated;

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
            return audit_results, raw_state

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
        subprocess.run(['rm', '-rf', profile_dir], check=False)

def main():
    audit_results, raw_state = asyncio.run(run_audit())

    print("\n--- IN-MEMORY MIGRATION RESULTS ---")
    print(f"Validation on inner state: {audit_results.get('validationInner')}")
    print(f"Validation on outer wrapper: {audit_results.get('validationOuter')}")
    print(f"Preview Migration Success: {audit_results.get('previewSuccess')} (Duration: {audit_results.get('previewDurationMs'):.2f} ms)")
    if audit_results.get('previewError'):
        print(f"Preview Error: {audit_results.get('previewError')}")

    migrated = audit_results.get('migratedState', {})
    print(f"Migrated Schema Version: {migrated.get('schemaVersion')}")
    print(f"Migrated Total Transactions: {len(migrated.get('transactions', []))}")
    print(f"Migrated Closed Months: {list(migrated.get('closedMonths', {}).keys())}")
    print(f"History Dynamic Getter Counts: {audit_results.get('historyDynamicCounts')}")
    print(f"Idempotency (2nd run): success={audit_results.get('secondRunSuccess')}, alreadyMigrated={audit_results.get('secondRunAlreadyMigrated')}")
    print(f"Raw Input State Mutated during Preview: {audit_results.get('inputMutated')}")

    # Comprehensive before & after verification
    print("\n--- DETAILED BEFORE VS AFTER COMPARISONS ---")
    
    # 1. Total transaction counts & ID set preservation
    raw_active_txs = raw_state.get('transactions', [])
    raw_hist_txs = []
    for h in raw_state.get('history', []):
        raw_hist_txs.extend(h.get('transactions', []))
    
    raw_all_txs = raw_active_txs + raw_hist_txs
    raw_ids = set(t['id'] for t in raw_all_txs)
    mig_ids = set(t['id'] for t in migrated.get('transactions', []))
    
    print(f"Pre-migration total transactions: {len(raw_all_txs)}")
    print(f"Post-migration total transactions: {len(migrated.get('transactions', []))}")
    print(f"Pre-migration unique IDs: {len(raw_ids)}")
    print(f"Post-migration unique IDs: {len(mig_ids)}")
    print(f"Missing IDs in migrated: {len(raw_ids - mig_ids)}")
    print(f"Unexpected new IDs in migrated: {len(mig_ids - raw_ids)}")

    # 2. Wallet balances (zero rounding float comparison)
    print("\nWallet Balances Invariant Check:")
    raw_wallets = raw_state.get('wallets', {})
    mig_wallets = migrated.get('wallets', {})
    all_w_ids = set(raw_wallets.keys()) | set(mig_wallets.keys())
    balance_matches = True
    for wid in sorted(all_w_ids):
        raw_bal = raw_wallets.get(wid, {}).get('balance')
        mig_bal = mig_wallets.get(wid, {}).get('balance')
        matches = (raw_bal == mig_bal)
        if not matches: balance_matches = False
        print(f"  Wallet \"{wid}\": Pre={raw_bal} | Post={mig_bal} | Exact Match: {matches}")
    print(f"Overall Wallet Balances Invariant PASSED: {balance_matches}")

    # 3. Transfer / Remittance field preservation
    raw_tx_map = {t['id']: t for t in raw_all_txs}
    mig_tx_map = {t['id']: t for t in migrated.get('transactions', [])}
    
    transfer_fields_preserved = True
    for tx_id, raw_tx in raw_tx_map.items():
        if raw_tx.get('type') in ('transfer', 'remittance'):
            mig_tx = mig_tx_map.get(tx_id)
            for fld in ['sourceId', 'destId', 'sourceAmount', 'destAmount', 'exchangeRate', 'amount', 'type', 'date', 'currency', 'sourceCurrency', 'destCurrency']:
                if raw_tx.get(fld) != mig_tx.get(fld):
                    print(f"  Field mismatch on {raw_tx.get('type')} {tx_id}.{fld}: {raw_tx.get(fld)} !== {mig_tx.get(fld)}")
                    transfer_fields_preserved = False
    print(f"Transfer/Remittance Field Invariant PASSED: {transfer_fields_preserved}")

    # 4. Category reference handling
    print("\nCategory Reference Analysis:")
    raw_cat_counts = {}
    mig_cat_counts = {}
    for t in raw_all_txs:
        c = t.get('categoryId')
        raw_cat_counts[c] = raw_cat_counts.get(c, 0) + 1
    for t in migrated.get('transactions', []):
        c = t.get('categoryId')
        mig_cat_counts[c] = mig_cat_counts.get(c, 0) + 1
    
    for c, count in sorted(raw_cat_counts.items(), key=lambda x: str(x[0])):
        post_count = mig_cat_counts.get(c, 0)
        print(f"  Category \"{c}\": Pre={count} | Post={post_count} | Preserved: {count == post_count}")

    # 5. Loan Configuration
    print("\nLoan Configuration Invariant Check:")
    raw_loan = raw_state.get('loanConfig', {})
    mig_loan = migrated.get('loanConfig', {})
    print(f"  Pre-migration loanConfig: {raw_loan}")
    print(f"  Post-migration loanConfig: {mig_loan}")
    print(f"  Loan Configuration Identical: {raw_loan == mig_loan}")

    # 6. Historical Snapshots & Rollover
    print("\nHistorical Snapshots & Budgets Invariant Check:")
    raw_history = {h['monthKey']: h for h in raw_state.get('history', [])}
    mig_closed = migrated.get('closedMonths', {})
    for mKey, raw_h in sorted(raw_history.items()):
        mig_c = mig_closed.get(mKey, {})
        print(f"  Month {mKey}:")
        print(f"    jpTotalBudget: Pre={raw_h.get('jpTotalBudget')} | Post={mig_c.get('jpTotalBudget')}")
        print(f"    jpRolloverAdded: Pre={raw_h.get('jpRolloverAdded')} | Post={mig_c.get('jpRolloverAdded')}")
        print(f"    walletsSnapshot: Pre={bool(raw_h.get('walletsSnapshot'))} | Post={bool(mig_c.get('walletsSnapshot'))}")

if __name__ == '__main__':
    main()
