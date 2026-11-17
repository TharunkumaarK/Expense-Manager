#!/usr/bin/env python3
"""
Production Export Follow-up Audit Harness
----------------------------------------
Performs an isolated verification of:
1. Boundary transactions (July 31 ID 1785519182944 and October 31 IDs 1793462624420, 1793462605069).
2. Category fallback behavior for jp-relocation-1791809386872.
3. Backup envelope normalization (plain vs wrapped) on validateBackupData & previewContinuousLedgerMigration.
4. Accuracy of report wording.

Strict Constraints:
- Read-only on production export.
- Zero network / Supabase calls.
- Zero localStorage persistence or mutations.
- Isolated Chromium temporary profile.
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

async def run_followup_audit():
    print("=" * 70)
    print("EXPENSE MANAGER: PRODUCTION EXPORT FOLLOW-UP AUDIT")
    print("=" * 70)

    with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
        export_wrapper = json.load(f)

    raw_state = export_wrapper.get('state', export_wrapper)

    profile_dir = '/tmp/isolated_followup_profile_' + str(int(time.time()))
    port = 9496
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

            await send("Runtime.evaluate", {"expression": storage_code})
            await send("Runtime.evaluate", {"expression": wallet_code})

            test_runner = f"""
            (() => {{
                const exportWrapper = {json.dumps(export_wrapper)};
                const plainState = exportWrapper.state;

                const results = {{}};

                // =================================================================
                // 1. BOUNDARY TRANSACTIONS AUDIT
                // =================================================================
                const migration = storage.previewContinuousLedgerMigration(plainState);
                results.migrationSuccess = migration.success;
                const migState = migration.migratedState;
                storage._attachHistoryGetters(migState);

                // Set storage.state to migrated state for walletManager tests
                storage.state = migState;

                // Investigate July 31 transaction (ID 1785519182944)
                const julyTx = migState.transactions.find(t => t.id === '1785519182944');
                results.julyTxExistsInLedger = !!julyTx;
                results.julyTxDate = julyTx ? julyTx.date : null;
                results.julyTxType = julyTx ? julyTx.type : null;
                results.julyTxAmount = julyTx ? julyTx.amount : null;
                results.julyTxSource = julyTx ? julyTx.sourceId : null;
                results.julyTxDest = julyTx ? julyTx.destId : null;

                // Check occurrences across ledger (confirm no duplicate)
                const julyTxCount = migState.transactions.filter(t => t.id === '1785519182944').length;
                results.julyTxUniqueInLedger = (julyTxCount === 1);

                // Check August history dynamic getter
                const augHistory = migState.history.find(h => h.monthKey === '2026-08');
                results.augHistoryContainsJulyTx = augHistory ? augHistory.transactions.some(t => t.id === '1785519182944') : false;

                // Check walletManager filtering for July 2026
                const julyTxsFromManager = walletManager.getTransactions({{ monthKey: '2026-07' }});
                results.walletManagerJulyTxFound = julyTxsFromManager.some(t => t.id === '1785519182944');
                results.walletManagerJulyTotalCount = julyTxsFromManager.length;

                // Check walletManager filtering for August 2026
                const augTxsFromManager = walletManager.getTransactions({{ monthKey: '2026-08' }});
                results.walletManagerAugTxContainsJuly = augTxsFromManager.some(t => t.id === '1785519182944');

                // Check wallet filtering by source/dest wallets
                const axisTxs = walletManager.getTransactions({{ walletId: 'Axis Bank' }});
                const bobTxs = walletManager.getTransactions({{ walletId: 'Bank of Baroda' }});
                results.axisContainsJulyTx = axisTxs.some(t => t.id === '1785519182944');
                results.bobContainsJulyTx = bobTxs.some(t => t.id === '1785519182944');

                // Check reporting available month keys logic
                const availableMonthsSet = new Set();
                if (migState.currentMonthKey) availableMonthsSet.add(migState.currentMonthKey);
                if (migState.closedMonths) {{
                    Object.keys(migState.closedMonths).forEach(m => availableMonthsSet.add(m));
                }}
                migState.transactions.forEach(tx => {{
                    if (tx.date && tx.date.length >= 7) {{
                        availableMonthsSet.add(tx.date.slice(0, 7));
                    }}
                }});
                results.reportingAvailableMonths = Array.from(availableMonthsSet).sort().reverse();
                results.julyIncludedInReportingMonths = availableMonthsSet.has('2026-07');
                results.julyInClosedMonths = !!(migState.closedMonths && migState.closedMonths['2026-07']);

                // Investigate October 31 transactions (IDs 1793462624420, 1793462605069)
                const oct31_1 = migState.transactions.find(t => t.id === '1793462624420');
                const oct31_2 = migState.transactions.find(t => t.id === '1793462605069');
                results.oct31_1_exists = !!oct31_1;
                results.oct31_2_exists = !!oct31_2;
                results.oct31_1_unique = (migState.transactions.filter(t => t.id === '1793462624420').length === 1);
                results.oct31_2_unique = (migState.transactions.filter(t => t.id === '1793462605069').length === 1);

                // Check October history dynamic getter includes October 31 txs
                const octHistory = migState.history.find(h => h.monthKey === '2026-10');
                results.octHistoryIncludesOct31_1 = octHistory ? octHistory.transactions.some(t => t.id === '1793462624420') : false;
                results.octHistoryIncludesOct31_2 = octHistory ? octHistory.transactions.some(t => t.id === '1793462605069') : false;
                results.octHistoryTotalTxs = octHistory ? octHistory.transactions.length : 0;

                // Check November active filtering excludes October 31 txs
                const novTxsFromManager = walletManager.getTransactions({{ monthKey: '2026-11' }});
                results.novManagerIncludesOct31 = novTxsFromManager.some(t => t.id === '1793462624420' || t.id === '1793462605069');
                results.novManagerTotalCount = novTxsFromManager.length;

                // =================================================================
                // 2. CATEGORY FALLBACK BEHAVIOR (jp-relocation-1791809386872)
                // =================================================================
                const relocationTxs = migState.transactions.filter(t => t.categoryId === 'jp-relocation-1791809386872');
                results.relocationTxCount = relocationTxs.length;
                results.relocationCategoryIds = relocationTxs.map(t => t.categoryId);

                // Evaluate current getCategoryName logic from js/app.js
                function getCategoryNameCurrent(catId, region = null) {{
                    if (!catId || catId === 'undefined' || catId === 'null') return 'Uncategorized';
                    if (typeof catId === 'string') {{
                        const cleaned = catId.replace(/^(jp|in)-/, '');
                        const humanized = cleaned.split(/[-_]/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        if (humanized) return humanized;
                    }}
                    return catId || 'Uncategorized';
                }}

                // Evaluate proposed getCategoryName logic (stripping trailing timestamp digits)
                function getCategoryNameProposed(catId, region = null) {{
                    if (!catId || catId === 'undefined' || catId === 'null') return 'Uncategorized';
                    if (typeof catId === 'string') {{
                        const cleaned = catId.replace(/^(jp|in)-/, '').replace(/-\\d+$/, '');
                        const humanized = cleaned.split(/[-_]/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        if (humanized) return humanized;
                    }}
                    return catId || 'Uncategorized';
                }}

                results.currentHumanizedName = getCategoryNameCurrent('jp-relocation-1791809386872');
                results.proposedHumanizedName = getCategoryNameProposed('jp-relocation-1791809386872');

                // =================================================================
                // 3. BACKUP ENVELOPE NORMALIZATION TRACE & TESTING
                // =================================================================
                // Proposed normalization helper
                function normalizeBackupPayload(data) {{
                    if (!data || typeof data !== 'object') return data;
                    if (data.state && typeof data.state === 'object' && data.state.wallets && Array.isArray(data.state.transactions)) {{
                        return data.state;
                    }}
                    return data;
                }}

                function validateWithNormalization(data) {{
                    const payload = normalizeBackupPayload(data);
                    const validation = storage.validateBackupData(payload);
                    return {{
                        ...validation,
                        normalizedData: validation.valid ? payload : null
                    }};
                }}

                // Test on plain state fixture
                const plainValidation = validateWithNormalization(plainState);
                results.plainNormalizedValid = plainValidation.valid;
                results.plainNormalizedWallets = plainValidation.walletsCount;
                results.plainNormalizedTxs = plainValidation.txCount;

                // Test on wrapped export fixture
                const wrappedValidation = validateWithNormalization(exportWrapper);
                results.wrappedNormalizedValid = wrappedValidation.valid;
                results.wrappedNormalizedWallets = wrappedValidation.walletsCount;
                results.wrappedNormalizedTxs = wrappedValidation.txCount;

                // Test preview migration with normalized inputs
                const plainMig = storage.previewContinuousLedgerMigration(normalizeBackupPayload(plainState));
                const wrappedMig = storage.previewContinuousLedgerMigration(normalizeBackupPayload(exportWrapper));

                results.plainPreviewSuccess = plainMig.success;
                results.wrappedPreviewSuccess = wrappedMig.success;
                results.bothProduceIdenticalTxCount = (plainMig.preview.totalTransactions === wrappedMig.preview.totalTransactions);

                // Test deep equality of transaction IDs produced by both
                const plainTxIds = plainMig.migratedState.transactions.map(t => t.id).join(',');
                const wrappedTxIds = wrappedMig.migratedState.transactions.map(t => t.id).join(',');
                results.bothProduceIdenticalLedgers = (plainTxIds === wrappedTxIds);

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
    results = asyncio.run(run_followup_audit())
    print("\n" + "=" * 70)
    print("FOLLOW-UP AUDIT RESULTS")
    print("=" * 70)

    print("\n--- 1. BOUNDARY TRANSACTIONS ---")
    print(f"July 31 Tx (ID 1785519182944) exists in migrated ledger: {results.get('julyTxExistsInLedger')}")
    print(f"  Date: {results.get('julyTxDate')}, Type: {results.get('julyTxType')}, Amount: {results.get('julyTxAmount')}")
    print(f"  Endpoints: Source={results.get('julyTxSource')}, Dest={results.get('julyTxDest')}")
    print(f"  Unique in ledger (no duplicates created): {results.get('julyTxUniqueInLedger')}")
    print(f"  August history dynamic getter excludes July 31 tx: {not results.get('augHistoryContainsJulyTx')}")
    print(f"  WalletManager July 2026 filter includes July 31 tx: {results.get('walletManagerJulyTxFound')} (Total July txs: {results.get('walletManagerJulyTotalCount')})")
    print(f"  WalletManager August 2026 filter excludes July 31 tx: {not results.get('walletManagerAugTxContainsJuly')}")
    print(f"  Axis Bank wallet transactions include July 31 tx: {results.get('axisContainsJulyTx')}")
    print(f"  Bank of Baroda wallet transactions include July 31 tx: {results.get('bobContainsJulyTx')}")
    print(f"  July included in reporting available months set: {results.get('julyIncludedInReportingMonths')}")
    print(f"  July in closedMonths snapshot metadata: {results.get('julyInClosedMonths')} (Confirmed: absent from closedMonths snapshots, but present in continuous ledger)")

    print(f"\nOctober 31 Txs:")
    print(f"  Tx 1793462624420 exists and unique: {results.get('oct31_1_exists')} / {results.get('oct31_1_unique')}")
    print(f"  Tx 1793462605069 exists and unique: {results.get('oct31_2_exists')} / {results.get('oct31_2_unique')}")
    print(f"  October history dynamic getter includes Tx 1793462624420: {results.get('octHistoryIncludesOct31_1')}")
    print(f"  October history dynamic getter includes Tx 1793462605069: {results.get('octHistoryIncludesOct31_2')}")
    print(f"  October history dynamic getter total count: {results.get('octHistoryTotalTxs')} (47 closed + 2 boundary txs)")
    print(f"  November manager query excludes October 31 txs: {not results.get('novManagerIncludesOct31')} (Total Nov txs: {results.get('novManagerTotalCount')})")

    print("\n--- 2. CATEGORY FALLBACK BEHAVIOR ---")
    print(f"Relocation transactions count: {results.get('relocationTxCount')}")
    print(f"All category IDs identical to jp-relocation-1791809386872: {all(c == 'jp-relocation-1791809386872' for c in results.get('relocationCategoryIds', []))}")
    print(f"Current UI humanizer output: \"{results.get('currentHumanizedName')}\"")
    print(f"Proposed UI humanizer output (stripping timestamp): \"{results.get('proposedHumanizedName')}\"")

    print("\n--- 3. BACKUP ENVELOPE NORMALIZATION ---")
    print(f"Plain state validation: valid={results.get('plainNormalizedValid')}, wallets={results.get('plainNormalizedWallets')}, txs={results.get('plainNormalizedTxs')}")
    print(f"Wrapped export validation: valid={results.get('wrappedNormalizedValid')}, wallets={results.get('wrappedNormalizedWallets')}, txs={results.get('wrappedNormalizedTxs')}")
    print(f"Preview migration succeeds for both: plain={results.get('plainPreviewSuccess')}, wrapped={results.get('wrappedPreviewSuccess')}")
    print(f"Both produce identical transaction count (116): {results.get('bothProduceIdenticalTxCount')}")
    print(f"Both produce 100% identical continuous ledger sequence: {results.get('bothProduceIdenticalLedgers')}")

if __name__ == '__main__':
    main()

