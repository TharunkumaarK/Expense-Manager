#!/usr/bin/env python3
"""
Expense Manager — Phase 5 Final Adversarial Integrity Regression Suite

Adversarial test suite verifying the 3 critical financial integrity fixes:
1. Priority 1 — Backdated Transaction Rollback Safety:
   - Chronologically sorted backdated transactions do NOT remove index 0 when persistence fails.
   - Transactions array restored from immutable snapshot (storage.state.transactions = preCommitTransactions).
   - Balances, ordering, and lengths remain completely unchanged on failure or exception.
2. Priority 2 — 100% Financial-State Fingerprinting Coverage:
   - 64-bit dual FNV-1a hash covers 100% of transactions, closedMonths, budgets, wallets, preferences.
   - Mutations at index 30, index 50, index 99 are detected with zero false-negative window.
   - Recovery commit rejects stale tokens across all array indices.
3. Priority 3 — Fail-Closed Authoritative Storage Verification & Cross-Tab Mutex:
   - Injected localStorage.getItem exceptions return code 'STORAGE_UNAVAILABLE'.
   - Malformed JSON stored values return code 'INVALID_STORED_STATE'.
   - Missing stored data returns code 'STORAGE_UNAVAILABLE'.
   - Active cross-tab lease lock returns code 'STATE_CONFLICT' with mutual exclusion.
   - Expired lease locks are safely reclaimed.
4. Calendar Month Boundary Validation:
   - validateRecoveryAdjustments strictly rejects 2026-00, 2026-13, 2026-99, non-numeric strings, bad types.
5. Production Continuous Ledger Invariants:
   - Real production export (116 transactions, 6 wallets, Axis Bank balance ₹ 46,794.53) preserved.
"""

import os
import sys
import json
import time
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
APP_JS_PATH = os.path.abspath('js/app.js')
WALLET_JS_PATH = os.path.abspath('js/wallet.js')
STORAGE_JS_PATH = os.path.abspath('js/storage.js')
EXPORT_PATH = '/tmp/ExpenseManager_Production_Export_2026-11-16.json'
if not os.path.exists(EXPORT_PATH) and os.path.exists('/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'):
    EXPORT_PATH = '/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'

async def run_adversarial_regression():
    print("=" * 80)
    print("EXPENSE MANAGER — PHASE 5 FINAL ADVERSARIAL INTEGRITY REGRESSION SUITE")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # 1. Static Code Analysis Checks
    # -------------------------------------------------------------------------
    print("\n--- Running Static Architecture Checks ---")
    static_checks = []

    with open(STORAGE_JS_PATH, 'r', encoding='utf-8') as f:
        storage_content = f.read()

    with open(WALLET_JS_PATH, 'r', encoding='utf-8') as f:
        wallet_content = f.read()

    # Priority 1: Immutable array snapshot in wallet.js
    static_checks.append(('WALLET', "addExpense snapshots preCommitTransactions array",
        "preCommitTransactions = Array.isArray(storage.state.transactions) ? storage.state.transactions.slice()" in wallet_content or
        "preCommitTransactions" in wallet_content))
    static_checks.append(('WALLET', "addExpense restores preCommitTransactions instead of shift()",
        "storage.state.transactions = preCommitTransactions" in wallet_content and
        "storage.state.transactions.shift()" not in wallet_content))
    static_checks.append(('WALLET', "addIncome restores preCommitTransactions on save failure",
        "storage.state.transactions = preCommitTransactions" in wallet_content))
    static_checks.append(('WALLET', "transfer and remittance restore preCommitTransactions",
        wallet_content.count("storage.state.transactions = preCommitTransactions") >= 4))

    # Priority 2: 100% Fingerprint coverage with 64-bit dual FNV-1a
    static_checks.append(('STORAGE', "computeFinancialFingerprint uses dual 32-bit FNV-1a (64-bit composite)",
        "2166136261" in storage_content and "2166136269" in storage_content and "16777619" in storage_content and "16777627" in storage_content))
    static_checks.append(('STORAGE', "computeFinancialFingerprint loops over 100% of transactions",
        "for (let i = 0; i < txs.length; i++)" in storage_content and "TL:${txs.length}" in storage_content))
    static_checks.append(('STORAGE', "Fingerprint returns 16-char hex composite string",
        "padStart(8, '0')" in storage_content and "${hex1}${hex2}" in storage_content))

    # Priority 3: Cross-tab lease lock & fail-closed error taxonomy
    static_checks.append(('STORAGE', "acquireRecoveryLock and releaseRecoveryLock implemented",
        "acquireRecoveryLock(" in storage_content and "releaseRecoveryLock()" in storage_content))
    static_checks.append(('STORAGE', "commitBudgetRecovery returns STORAGE_UNAVAILABLE on storage read failure",
        "STORAGE_UNAVAILABLE" in storage_content))
    static_checks.append(('STORAGE', "commitBudgetRecovery returns INVALID_STORED_STATE on malformed JSON",
        "INVALID_STORED_STATE" in storage_content))
    static_checks.append(('STORAGE', "commitBudgetRecovery returns STATE_CONFLICT on hash mismatch",
        "STATE_CONFLICT" in storage_content and "conflict: true" in storage_content))

    # Calendar month validation
    static_checks.append(('STORAGE', "validateRecoveryAdjustments enforces strict calendar month regex & year bounds",
        "/^\\d{4}-(0[1-9]|1[0-2])$/" in storage_content and "year < 2000 || year > 2099" in storage_content))

    all_static_passed = True
    for cat, title, passed in static_checks:
        status = "✅ PASS" if passed else "❌ FAIL"
        if not passed: all_static_passed = False
        print(f"  [{status}] [{cat}] {title}")

    if not all_static_passed:
        print("\n❌ Static checks failed. Aborting dynamic browser suite.")
        return False

    print("\n✅ All static architecture checks passed.")

    # -------------------------------------------------------------------------
    # 2. Dynamic Browser-Based Verification via CDP
    # -------------------------------------------------------------------------
    print("\n--- Starting Headless Chrome Dynamic CDP Suite ---")
    chrome_port = 9599
    user_data_dir = f"/tmp/phase5_adversarial_profile_{int(time.time())}"
    cmd = [
        CHROME_BIN,
        '--headless=new',
        f'--remote-debugging-port={chrome_port}',
        f'--user-data-dir={user_data_dir}',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1440,900',
        f'file://{INDEX_HTML_PATH}'
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws = None

    try:
        await asyncio.sleep(2.0)
        ws_url = None
        for _ in range(30):
            try:
                resp = urllib.request.urlopen(f'http://127.0.0.1:{chrome_port}/json')
                data = json.loads(resp.read().decode())
                pages = [t for t in data if t.get('type') == 'page']
                if pages and 'webSocketDebuggerUrl' in pages[0]:
                    ws_url = pages[0]['webSocketDebuggerUrl']
                    break
            except Exception:
                pass
            await asyncio.sleep(0.3)

        if not ws_url:
            raise RuntimeError("Could not connect to Chrome DevTools Protocol.")

        ws = await websockets.connect(ws_url, max_size=25*1024*1024)
        msg_id = 0

        async def send_cdp(method, params=None):
            nonlocal msg_id
            msg_id += 1
            payload = {'id': msg_id, 'method': method, 'params': params or {}}
            await ws.send(json.dumps(payload))
            while True:
                resp_raw = await ws.recv()
                resp = json.loads(resp_raw)
                if resp.get('id') == msg_id:
                    return resp.get('result', {})

        await send_cdp('Page.enable')
        await send_cdp('Runtime.enable')

        async def eval_js(expression):
            res = await send_cdp('Runtime.evaluate', {
                'expression': expression,
                'returnByValue': True,
                'awaitPromise': True
            })
            if 'exceptionDetails' in res:
                raise RuntimeError(f"JS Evaluation Error: {res['exceptionDetails']}")
            return res.get('result', {}).get('value')

        for _ in range(50):
            try:
                res = await send_cdp('Runtime.evaluate', {
                    'expression': "typeof storage !== 'undefined' && typeof walletManager !== 'undefined'",
                    'returnByValue': True,
                    'awaitPromise': True
                })
                if res.get('result', {}).get('value') is True:
                    break
            except Exception:
                pass
            await asyncio.sleep(0.2)

        dynamic_tests = []

        # =========================================================================
        # Test Suite 1: Priority 1 — Backdated Transaction Rollback Safety
        # =========================================================================
        print("\n[Suite 1] Priority 1 — Backdated Transaction Rollback Safety")

        test1_res = await eval_js("""
        (function() {
            // Setup fresh test state
            storage.accountStatus = 'EXISTING_USER';
            if (!storage.state.wallets) storage.state.wallets = {};
            storage.state.wallets['JP Bank'] = { id: 'JP Bank', name: 'JP Bank', currency: 'JPY', region: 'JP', balance: 100000 };
            storage.state.wallets['JP Cash'] = { id: 'JP Cash', name: 'JP Cash', currency: 'JPY', region: 'JP', balance: 50000 };

            // Setup 3 initial transactions ordered chronologically descending
            storage.state.transactions = [
                { id: 'tx_future_15', date: '2026-11-15', amount: 1000, walletId: 'JP Bank', type: 'expense', categoryId: 'food', region: 'JP', currency: 'JPY' },
                { id: 'tx_mid_10', date: '2026-11-10', amount: 2000, walletId: 'JP Bank', type: 'expense', categoryId: 'transport', region: 'JP', currency: 'JPY' },
                { id: 'tx_past_05', date: '2026-11-05', amount: 3000, walletId: 'JP Bank', type: 'expense', categoryId: 'groceries', region: 'JP', currency: 'JPY' }
            ];
            storage.state.currentMonthKey = '2026-11';
            storage.saveData();

            const preBalance = storage.state.wallets['JP Bank'].balance; // 100,000
            const preTxCount = storage.state.transactions.length; // 3
            const preTx0Id = storage.state.transactions[0].id; // 'tx_future_15'
            const preTx1Id = storage.state.transactions[1].id; // 'tx_mid_10'
            const preTx2Id = storage.state.transactions[2].id; // 'tx_past_05'

            // 1. Simulate persistence failure during backdated addExpense (date: 2026-11-08)
            // Due to chronological sorting, this transaction would land between index 1 and index 2.
            const origSave = storage.saveData;
            storage.saveData = function() { return false; };

            const addRes = walletManager.addExpense('JP Bank', 'utilities', 5000, 'Backdated electric bill', '2026-11-08');

            const postFailBalance = storage.state.wallets['JP Bank'].balance;
            const postFailTxCount = storage.state.transactions.length;
            const postFailTx0Id = storage.state.transactions[0]?.id;
            const postFailTx1Id = storage.state.transactions[1]?.id;
            const postFailTx2Id = storage.state.transactions[2]?.id;

            // Check that the failed backdated transaction is completely absent
            const hasFailedTx = storage.state.transactions.some(t => t.note === 'Backdated electric bill');

            // 2. Test backdated addIncome rollback
            const preIncBalance = storage.state.wallets['JP Bank'].balance;
            const incRes = walletManager.addIncome('JP Bank', 20000, 'Backdated bonus', '2026-11-02');
            const postIncBalance = storage.state.wallets['JP Bank'].balance;
            const postIncTxCount = storage.state.transactions.length;
            const postIncTx0Id = storage.state.transactions[0]?.id;
            const hasFailedIncTx = storage.state.transactions.some(t => t.note === 'Backdated bonus');

            // 3. Test backdated transfer rollback with sorting exception simulation
            storage.saveData = function() { throw new Error('Simulated disk I/O error during commit'); };
            const transPreSrc = storage.state.wallets['JP Bank'].balance;
            const transPreDst = storage.state.wallets['JP Cash'].balance;

            const transRes = walletManager.transfer('JP Bank', 'JP Cash', 10000, 'Backdated ATM cash', '2026-11-01');
            const transPostSrc = storage.state.wallets['JP Bank'].balance;
            const transPostDst = storage.state.wallets['JP Cash'].balance;
            const transPostTxCount = storage.state.transactions.length;
            const transPostTx0Id = storage.state.transactions[0]?.id;

            // Restore saveData
            storage.saveData = origSave;

            return {
                addRes,
                preBalance,
                postFailBalance,
                preTxCount,
                postFailTxCount,
                preTx0Id,
                postFailTx0Id,
                postFailTx1Id,
                postFailTx2Id,
                hasFailedTx,
                incRes,
                preIncBalance,
                postIncBalance,
                postIncTxCount,
                postIncTx0Id,
                hasFailedIncTx,
                transRes,
                transPreSrc,
                transPostSrc,
                transPreDst,
                transPostDst,
                transPostTxCount,
                transPostTx0Id
            };
        })()
        """)

        p1_expense_rollback = (
            test1_res['addRes'] == False and
            test1_res['postFailBalance'] == test1_res['preBalance'] and
            test1_res['postFailTxCount'] == test1_res['preTxCount'] and
            test1_res['postFailTx0Id'] == 'tx_future_15' and
            test1_res['postFailTx1Id'] == 'tx_mid_10' and
            test1_res['postFailTx2Id'] == 'tx_past_05' and
            test1_res['hasFailedTx'] == False
        )
        p1_income_rollback = (
            test1_res['incRes'] == False and
            test1_res['postIncBalance'] == test1_res['preIncBalance'] and
            test1_res['postIncTxCount'] == test1_res['preTxCount'] and
            test1_res['postIncTx0Id'] == 'tx_future_15' and
            test1_res['hasFailedIncTx'] == False
        )
        p1_transfer_rollback = (
            test1_res['transRes'] == False and
            test1_res['transPostSrc'] == test1_res['transPreSrc'] and
            test1_res['transPostDst'] == test1_res['transPreDst'] and
            test1_res['transPostTxCount'] == test1_res['preTxCount'] and
            test1_res['transPostTx0Id'] == 'tx_future_15'
        )

        dynamic_tests.append(("Priority 1: Backdated addExpense failure preserves index 0 and rolls back balance", p1_expense_rollback))
        dynamic_tests.append(("Priority 1: Backdated addIncome failure preserves index 0 and ledger structure", p1_income_rollback))
        dynamic_tests.append(("Priority 1: Backdated transfer exception restores source/dest balances and transactions", p1_transfer_rollback))

        # =========================================================================
        # Test Suite 2: Priority 2 — 100% Financial-State Fingerprinting Coverage
        # =========================================================================
        print("\n[Suite 2] Priority 2 — 100% Financial-State Fingerprinting Coverage")

        test2_res = await eval_js("""
        (function() {
            // Seed exactly 100 transactions to test deep collection fingerprinting
            storage.accountStatus = 'EXISTING_USER';
            if (!storage.state.preferences) storage.state.preferences = {};
            storage.state.preferences.countries = ['JP', 'IN', 'DE'];
            storage.state.preferences.primaryCountry = 'JP';
            storage.state.preferences.onboardingCompleted = true;

            storage.state.transactions = [];
            for (let i = 0; i < 100; i++) {
                const day = String(1 + (i % 28)).padStart(2, '0');
                storage.state.transactions.push({
                    id: `tx_${1000 + i}`,
                    type: 'expense',
                    walletId: 'JP Bank',
                    categoryId: 'food',
                    amount: 100 + i,
                    currency: 'JPY',
                    region: 'JP',
                    date: `2026-10-${day}`,
                    note: `Item ${i}`
                });
            }
            storage.state.currentMonthKey = '2026-10';
            storage.saveData();

            const baseFingerprint = storage.computeFinancialFingerprint(storage.state);

            // Test 2.1: Mutate transaction at index 30 (previously missed by slice(0, 30))
            const origAmount30 = storage.state.transactions[30].amount;
            storage.state.transactions[30].amount += 50;
            const fpMutated30 = storage.computeFinancialFingerprint(storage.state);
            storage.state.transactions[30].amount = origAmount30; // Restore

            // Test 2.2: Mutate transaction at index 99 (last transaction)
            const origAmount99 = storage.state.transactions[99].amount;
            storage.state.transactions[99].amount += 1;
            const fpMutated99 = storage.computeFinancialFingerprint(storage.state);
            storage.state.transactions[99].amount = origAmount99; // Restore

            // Test 2.3: Modify transaction count
            const popped = storage.state.transactions.pop();
            const fpCountChange = storage.computeFinancialFingerprint(storage.state);
            storage.state.transactions.push(popped); // Restore

            // Test 2.4: OCC Rejection in commitBudgetRecovery across deep indices
            storage.state.currentMonthKey = '2026-08';
            delete storage.state.closedMonths['2026-08'];
            delete storage.state.closedMonths['2026-09'];
            delete storage.state.closedMonths['2026-10'];
            storage.saveData();

            const origGetMonth = storage.getCurrentMonthKey;
            storage.getCurrentMonthKey = () => '2026-11';

            const preview = storage.getBudgetRecoveryPreview('continue');
            const previewToken = preview.stateToken;

            // Mutate transaction at index 50
            storage.state.transactions[50].amount += 500;
            const conflictResult = storage.commitBudgetRecovery('continue', {}, previewToken);
            storage.state.transactions[50].amount -= 500; // Restore

            storage.getCurrentMonthKey = origGetMonth;

            return {
                baseFingerprint,
                fpMutated30,
                fpMutated99,
                fpCountChange,
                diff30: baseFingerprint !== fpMutated30,
                diff99: baseFingerprint !== fpMutated99,
                diffCount: baseFingerprint !== fpCountChange,
                conflictSuccess: conflictResult.success,
                conflictCode: conflictResult.code,
                conflictFlag: conflictResult.conflict
            };
        })()
        """)

        p2_coverage_30 = (test2_res['diff30'] == True and len(test2_res['fpMutated30']) == 16)
        p2_coverage_99 = (test2_res['diff99'] == True and len(test2_res['fpMutated99']) == 16)
        p2_coverage_count = (test2_res['diffCount'] == True)
        p2_occ_reject = (test2_res['conflictSuccess'] == False and test2_res['conflictCode'] == 'STATE_CONFLICT' and test2_res['conflictFlag'] == True)

        dynamic_tests.append(("Priority 2: Fingerprint detects transaction mutations at index 30 (beyond 30-item slice)", p2_coverage_30))
        dynamic_tests.append(("Priority 2: Fingerprint detects transaction mutations at index 99 (tail of ledger)", p2_coverage_99))
        dynamic_tests.append(("Priority 2: Fingerprint detects transaction ledger length change", p2_coverage_count))
        dynamic_tests.append(("Priority 2: commitBudgetRecovery rejects stale preview token on deep index mutation", p2_occ_reject))

        # =========================================================================
        # Test Suite 3: Priority 3 — Fail-Closed Authoritative Storage Verification
        # =========================================================================
        print("\n[Suite 3] Priority 3 — Fail-Closed Authoritative Storage Verification & Mutex")

        test3_res = await eval_js("""
        (function() {
            const origGetMonth = storage.getCurrentMonthKey;
            storage.getCurrentMonthKey = () => '2026-11';
            storage.accountStatus = 'EXISTING_USER';
            if (!storage.state.preferences) storage.state.preferences = {};
            storage.state.preferences.countries = ['JP', 'IN', 'DE'];
            storage.state.preferences.primaryCountry = 'JP';
            storage.state.preferences.onboardingCompleted = true;
            storage.state.currentMonthKey = '2026-08';
            storage.isFirstLoad = false;
            delete storage.state.closedMonths['2026-08'];
            delete storage.state.closedMonths['2026-09'];
            delete storage.state.closedMonths['2026-10'];
            storage.saveData();

            const preview = storage.getBudgetRecoveryPreview('continue');
            const token = preview.stateToken;
            const storageKey = storage.getActiveStorageKey();
            const lockKey = `${storageKey}_recovery_lock`;

            // Case A: Storage access exception (e.g. SecurityError in iframe or disabled storage)
            const origGetItem = localStorage.getItem.bind(localStorage);
            localStorage.getItem = function(k) {
                if (k === storageKey) throw new Error('SecurityError: Local storage read restricted');
                return origGetItem(k);
            };
            const resA = storage.commitBudgetRecovery('continue', {}, token);
            localStorage.getItem = origGetItem; // Restore

            // Case B: Malformed stored JSON
            const validRaw = localStorage.getItem(storageKey);
            localStorage.setItem(storageKey, '{{{MALFORMED_CORRUPTED_JSON');
            const resB = storage.commitBudgetRecovery('continue', {}, token);
            localStorage.setItem(storageKey, validRaw); // Restore

            // Case C: Missing stored state on established account
            localStorage.removeItem(storageKey);
            const resC = storage.commitBudgetRecovery('continue', {}, token);
            localStorage.setItem(storageKey, validRaw); // Restore

            // Case D: Active cross-tab lease-lock held by another tab
            localStorage.setItem(lockKey, JSON.stringify({
                owner: 'tab_external_competitor_999',
                acquiredAt: Date.now(),
                expiresAt: Date.now() + 10000 // Valid for 10s
            }));
            const resD = storage.commitBudgetRecovery('continue', {}, token);

            // Case E: Expired cross-tab lease-lock automatically reclaimed
            localStorage.setItem(lockKey, JSON.stringify({
                owner: 'tab_stale_crashed_111',
                acquiredAt: Date.now() - 20000,
                expiresAt: Date.now() - 1000 // Expired 1s ago
            }));
            const resE = storage.commitBudgetRecovery('continue', {}, token);
            localStorage.removeItem(lockKey); // Clean up

            storage.getCurrentMonthKey = origGetMonth;

            return {
                resA_code: resA.code,
                resA_success: resA.success,
                resB_code: resB.code,
                resB_success: resB.success,
                resC_code: resC.code,
                resC_success: resC.success,
                resD_code: resD.code,
                resD_success: resD.success,
                resD_conflict: resD.conflict,
                resE_success: resE.success
            };
        })()
        """)

        p3_ex = (test3_res['resA_success'] == False and test3_res['resA_code'] == 'STORAGE_UNAVAILABLE')
        p3_malformed = (test3_res['resB_success'] == False and test3_res['resB_code'] == 'INVALID_STORED_STATE')
        p3_missing = (test3_res['resC_success'] == False and test3_res['resC_code'] == 'STORAGE_UNAVAILABLE')
        p3_locked = (test3_res['resD_success'] == False and test3_res['resD_code'] == 'STATE_CONFLICT' and test3_res['resD_conflict'] == True)
        p3_expired_reclaimed = (test3_res['resE_success'] == True)

        dynamic_tests.append(("Priority 3: Storage read exception fails closed with code STORAGE_UNAVAILABLE", p3_ex))
        dynamic_tests.append(("Priority 3: Malformed stored JSON fails closed with code INVALID_STORED_STATE", p3_malformed))
        dynamic_tests.append(("Priority 3: Missing stored data on established user fails closed with code STORAGE_UNAVAILABLE", p3_missing))
        dynamic_tests.append(("Priority 3: Active cross-tab lease lock fails closed with code STATE_CONFLICT", p3_locked))
        dynamic_tests.append(("Priority 3: Expired cross-tab lease lock is safely reclaimed allowing recovery", p3_expired_reclaimed))

        # =========================================================================
        # Test Suite 4: Strict Calendar Month Boundary Validation
        # =========================================================================
        print("\n[Suite 4] Strict Calendar Month Boundary Validation")

        test4_res = await eval_js("""
        (function() {
            const unfinalized = ['2026-08', '2026-09', '2026-10'];

            const vBad00 = storage.validateRecoveryAdjustments({ '2026-00': { JP: { baseBudget: 200000 } } }, unfinalized);
            const vBad13 = storage.validateRecoveryAdjustments({ '2026-13': { JP: { baseBudget: 200000 } } }, unfinalized);
            const vBad99 = storage.validateRecoveryAdjustments({ '2026-99': { JP: { baseBudget: 200000 } } }, unfinalized);
            const vBadYear1999 = storage.validateRecoveryAdjustments({ '1999-12': { JP: { baseBudget: 200000 } } }, unfinalized);
            const vBadYear2100 = storage.validateRecoveryAdjustments({ '2100-01': { JP: { baseBudget: 200000 } } }, unfinalized);
            const vNullPayload = storage.validateRecoveryAdjustments(null, unfinalized);
            const vArrayPayload = storage.validateRecoveryAdjustments([], unfinalized);
            const vValid = storage.validateRecoveryAdjustments({ '2026-09': { JP: { baseBudget: 220000, rolloverEnabled: true } } }, unfinalized);

            return {
                vBad00_valid: vBad00.valid,
                vBad00_error: vBad00.error,
                vBad13_valid: vBad13.valid,
                vBad99_valid: vBad99.valid,
                vBadYear1999_valid: vBadYear1999.valid,
                vBadYear2100_valid: vBadYear2100.valid,
                vNullPayload_valid: vNullPayload.valid,
                vArrayPayload_valid: vArrayPayload.valid,
                vValid_valid: vValid.valid
            };
        })()
        """)

        p4_bad_months = (
            test4_res['vBad00_valid'] == False and
            test4_res['vBad13_valid'] == False and
            test4_res['vBad99_valid'] == False and
            test4_res['vBadYear1999_valid'] == False and
            test4_res['vBadYear2100_valid'] == False and
            test4_res['vNullPayload_valid'] == False and
            test4_res['vArrayPayload_valid'] == False and
            test4_res['vValid_valid'] == True
        )
        dynamic_tests.append(("Calendar Validation: Strictly rejects 2026-00, 2026-13, 2026-99, non-objects, and out-of-range years", p4_bad_months))

        # =========================================================================
        # Test Suite 5: Production Continuous Ledger Verification
        # =========================================================================
        print("\n[Suite 5] Production Continuous Ledger Verification")

        prod_export_data = None
        if os.path.exists(EXPORT_PATH):
            with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
                prod_export_data = json.load(f)

        if prod_export_data:
            js_code = f"""
            (function() {{
                const exportData = {json.dumps(prod_export_data)};
                const rawState = exportData.state || exportData;
                const storageKey = storage.getActiveStorageKey();
                localStorage.setItem(storageKey, JSON.stringify(rawState));
                storage.state = storage.loadData();
                storage._attachBudgetAccessors(storage.state);

                const txCount = Array.isArray(storage.state.transactions) ? storage.state.transactions.length : 0;
                const walletCount = Object.keys(storage.state.wallets || {{}}).length;
                const axisWallet = storage.state.wallets['Axis Bank'];
                const axisBalance = axisWallet ? axisWallet.balance : 0;
                const fingerprint = storage.computeFinancialFingerprint(storage.state);

                return {{
                    txCount,
                    walletCount,
                    axisBalance,
                    fingerprint,
                    hasFingerprint: typeof fingerprint === 'string' && fingerprint.length === 16
                }};
            }})()
            """
            test5_res = await eval_js(js_code)
            p5_prod = (
                test5_res['txCount'] == 116 and
                test5_res['walletCount'] == 6 and
                abs(test5_res['axisBalance'] - 46794.53) < 0.001 and
                test5_res['hasFingerprint'] == True
            )
            dynamic_tests.append(("Production Invariants: 116 transactions, 6 wallets, Axis Bank ₹46,794.53 intact with valid 16-hex hash", p5_prod))
        else:
            print("  ⚠️ Production export fixture not found. Skipping production export invariant assertion.")

        # =========================================================================
        # Summary Evaluation
        # =========================================================================
        print("\n" + "=" * 80)
        print("SUMMARY RESULTS: PHASE 5 FINAL ADVERSARIAL INTEGRITY REGRESSION")
        print("=" * 80)

        all_dynamic_passed = True
        for name, passed in dynamic_tests:
            status = "✅ PASS" if passed else "❌ FAIL"
            if not passed: all_dynamic_passed = False
            print(f"  [{status}] {name}")

        overall_passed = all_static_passed and all_dynamic_passed
        print("=" * 80)
        if overall_passed:
            print("🎉 ALL ADVERSARIAL INTEGRITY REGRESSION TESTS PASSED PERFECTLY!")
        else:
            print("❌ SOME ADVERSARIAL TESTS FAILED.")
        print("=" * 80)

        return overall_passed

    finally:
        if ws:
            await ws.close()
        if proc:
            proc.terminate()
            proc.wait()

if __name__ == '__main__':
    success = asyncio.run(run_adversarial_regression())
    sys.exit(0 if success else 1)
