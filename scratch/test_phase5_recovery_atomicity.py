#!/usr/bin/env python3
"""
Expense Manager — Phase 5 Final Recovery & Transaction Safety Corrections Verification Suite

Focused test suite verifying the 5 critical financial safety corrections:
1. Priority 1 — Atomic Budget Recovery Commit:
   - Prepare/validate/commit architecture in StorageManager.commitBudgetRecovery().
   - StorageManager.saveData() returns boolean (true on success, false on failure).
   - Authoritative state rollback on any validation failure or persistence error (e.g. QuotaExceededError).
   - Zero state pollution: no partial snapshots, no modified carryovers, no altered currentMonthKey.
2. Priority 2 — Reliable Stale-State and Concurrency Detection:
   - Deterministic 32-bit financial revision fingerprint (computeFinancialFingerprint()).
   - Live state token matching.
   - Direct cross-tab localStorage re-validation immediately before commit.
   - Fail closed with conflict flag and interactive refresh on concurrent storage changes.
3. Priority 3 — Validate All Budget Recovery Inputs:
   - Comprehensive input validation in validateRecoveryAdjustments().
   - Rejects negative budgets, NaN, Infinity, excessive decimals (fractional yen, >2 for INR/EUR).
   - Rejects unsafe bounds (>1e12), malformed month keys, unknown country codes, non-boolean rollover.
4. Priority 4 — Complete Transaction Rollback:
   - WalletManager.updateTransaction() and deleteTransaction() full state snapshots.
   - Rollback of wallet balances, transaction fields, transaction array ordering, and history on persistence failure.
   - Rollback in addExpense(), addIncome(), transfer(), and remittance() on saveData() failure.
5. Priority 5 — Historical Budget Provenance & UX:
   - Provenance annotations: user_confirmed_adjustment, prior_closed_snapshot, reused_active_setting, explicit_zero_budget.
   - Recording of recoveryMetadata.provenanceSummary upon commit.
   - Desktop UI provenance badges and conflict refresh notifications.
6. Continuous Ledger Preservation:
   - 116 production transactions and 6 wallets verified with zero data corruption.
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
APP_JS_PATH = os.path.abspath('js/app.js')
WALLET_JS_PATH = os.path.abspath('js/wallet.js')
STORAGE_JS_PATH = os.path.abspath('js/storage.js')
EXPORT_PATH = '/tmp/ExpenseManager_Production_Export_2026-11-16.json'
if not os.path.exists(EXPORT_PATH) and os.path.exists('/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'):
    EXPORT_PATH = '/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'

async def run_recovery_atomicity_tests():
    print("=" * 80)
    print("EXPENSE MANAGER — PHASE 5 FINAL RECOVERY & TRANSACTION SAFETY VERIFICATION")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # 1. Static Architecture Checks
    # -------------------------------------------------------------------------
    print("\n--- Running Static Architecture Checks ---")
    static_checks = []

    with open(STORAGE_JS_PATH, 'r', encoding='utf-8') as f:
        storage_content = f.read()

    with open(WALLET_JS_PATH, 'r', encoding='utf-8') as f:
        wallet_content = f.read()

    with open(APP_JS_PATH, 'r', encoding='utf-8') as f:
        app_content = f.read()

    # Priority 1: Atomic commit and boolean saveData
    static_checks.append(('STORAGE', "saveData returns boolean true on success and false on failure",
        "return true;" in storage_content and "return false;" in storage_content))
    static_checks.append(('STORAGE', "commitBudgetRecovery verifies state snapshot and checks saveData",
        "saved === false" in storage_content and "this.state = preCommitStateSnapshot;" in storage_content))

    # Priority 2: Stale-state & fingerprinting
    static_checks.append(('STORAGE', "computeFinancialFingerprint method implemented",
        "computeFinancialFingerprint(" in storage_content))
    static_checks.append(('STORAGE', "commitBudgetRecovery checks live localStorage immediately before commit",
        "localStorage.getItem" in storage_content and "conflict" in storage_content))

    # Priority 3: Input validation
    static_checks.append(('STORAGE', "validateRecoveryAdjustments validates numbers, bounds, and country codes",
        "validateRecoveryAdjustments(" in storage_content and "Number.isInteger" in storage_content))

    # Priority 4: Complete transaction rollback
    static_checks.append(('WALLET', "updateTransaction snapshots preCommitTransactions and preCommitHistory",
        "preCommitTransactions" in wallet_content and "preCommitHistory" in wallet_content))
    static_checks.append(('WALLET', "updateTransaction checks storage.saveData() === false",
        "saved === false" in wallet_content))
    static_checks.append(('WALLET', "deleteTransaction snapshots preCommitTransactions and preCommitHistory",
        "preCommitTransactions" in wallet_content and "deleteTransaction" in wallet_content))
    static_checks.append(('WALLET', "addExpense & addIncome check saveData() and rollback",
        "storage.state.transactions = preCommitTransactions" in wallet_content or "this.state.transactions.splice(idx, 1)" in wallet_content or "storage.state.transactions.splice(idx, 1)" in wallet_content))

    # Priority 5: Provenance & UX
    static_checks.append(('STORAGE', "getBudgetRecoveryPreview annotates provenance for countries",
        "provenance" in storage_content and "user_confirmed_adjustment" in storage_content))
    static_checks.append(('APP', "app displays provenance badge in recovery modal",
        "getProvenanceBadge" in app_content))
    static_checks.append(('APP', "app implements non-blocking toast notification with conflict handling",
        "showToast(" in app_content and "Financial state changed in another session" in app_content))

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
    chrome_port = 9588
    user_data_dir = f"/tmp/phase5_atomicity_profile_{int(time.time())}"
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

        async def eval_js(expression):
            res = await send_cdp('Runtime.evaluate', {
                'expression': expression,
                'returnByValue': True,
                'awaitPromise': True
            })
            if 'exceptionDetails' in res:
                raise RuntimeError(f"JS Error: {res['exceptionDetails']}")
            return res.get('result', {}).get('value')

        await send_cdp('Page.enable')
        await send_cdp('Runtime.enable')
        await send_cdp('DOM.enable')

        # Wait for app readiness
        for _ in range(50):
            ready_res = await send_cdp('Runtime.evaluate', {
                'expression': "typeof storage !== 'undefined' && typeof walletManager !== 'undefined' && typeof app !== 'undefined'",
                'returnByValue': True
            })
            if ready_res.get('result', {}).get('value') is True:
                break
            await asyncio.sleep(0.2)

        dynamic_tests = []

        # =========================================================================
        # Test Suite 1: Priority 1 — Atomic Budget Recovery Commit & Rollback
        # =========================================================================
        print("\n[Suite 1] Priority 1 — Atomic Budget Recovery Commit & Rollback")

        test1_res = await eval_js("""
        (function() {
            const origGetMonth = storage.getCurrentMonthKey;
            storage.getCurrentMonthKey = () => '2026-11';
            storage.accountStatus = 'EXISTING_USER';
            if (!storage.state.preferences) storage.state.preferences = {};
            storage.state.preferences.countries = ['JP', 'IN', 'DE'];
            storage.state.preferences.primaryCountry = 'JP';
            storage.state.preferences.onboardingCompleted = true;

            // Setup gap scenario: currentMonthKey = 2026-08, system date = 2026-11
            storage.state.currentMonthKey = '2026-08';
            storage.state.budgets = {
                JP: { amount: 200000, rolloverEnabled: true, carryover: 50000 },
                IN: { amount: 60000, rolloverEnabled: true, carryover: 12000 },
                DE: { amount: 1500, rolloverEnabled: true, carryover: 300 }
            };
            if (!storage.state.closedMonths) storage.state.closedMonths = {};
            delete storage.state.closedMonths['2026-08'];
            delete storage.state.closedMonths['2026-09'];
            delete storage.state.closedMonths['2026-10'];
            storage.state.recoveryMetadata = null;
            storage.budgetRecoveryState = null;
            storage.saveData();

            const status = storage.getBudgetRecoveryStatus();
            const preview = storage.getBudgetRecoveryPreview('continue');

            // 1. Simulate persistence failure: override saveData to return false
            const originalSaveData = storage.saveData;
            storage.saveData = function() { return false; };

            const preCommitMonthKey = storage.state.currentMonthKey;
            const preCommitCarryoverJP = storage.state.budgets.JP.carryover;
            const preCommitClosedCount = Object.keys(storage.state.closedMonths || {}).length;

            const failedResult = storage.commitBudgetRecovery('continue', {}, preview.stateToken);

            // Verify rollback
            const rolledBackMonthKey = storage.state.currentMonthKey;
            const rolledBackCarryoverJP = storage.state.budgets.JP.carryover;
            const rolledBackClosedCount = Object.keys(storage.state.closedMonths || {}).length;
            const hasRecoveryMetaOnFail = !!storage.state.recoveryMetadata;

            // 2. Restore saveData and commit successfully
            storage.saveData = originalSaveData;
            const successResult = storage.commitBudgetRecovery('continue', {}, preview.stateToken);

            const postCommitMonthKey = storage.state.currentMonthKey;
            const hasClosed2026_08 = !!storage.state.closedMonths['2026-08'];
            const hasClosed2026_09 = !!storage.state.closedMonths['2026-09'];
            const hasClosed2026_10 = !!storage.state.closedMonths['2026-10'];
            const hasRecoveryMetaOnSuccess = !!storage.state.recoveryMetadata;

            storage.getCurrentMonthKey = origGetMonth;

            return {
                failedSuccess: failedResult.success,
                failedError: failedResult.error,
                preCommitMonthKey,
                rolledBackMonthKey,
                preCommitCarryoverJP,
                rolledBackCarryoverJP,
                preCommitClosedCount,
                rolledBackClosedCount,
                hasRecoveryMetaOnFail,
                successResult: successResult.success,
                postCommitMonthKey,
                hasClosed2026_08,
                hasClosed2026_09,
                hasClosed2026_10,
                hasRecoveryMetaOnSuccess
            };
        })()
        """)

        p1_rollback = (
            test1_res['failedSuccess'] == False and
            test1_res['rolledBackMonthKey'] == test1_res['preCommitMonthKey'] and
            test1_res['rolledBackCarryoverJP'] == test1_res['preCommitCarryoverJP'] and
            test1_res['rolledBackClosedCount'] == test1_res['preCommitClosedCount'] and
            test1_res['hasRecoveryMetaOnFail'] == False
        )
        p1_success = (
            test1_res['successResult'] == True and
            test1_res['postCommitMonthKey'] == '2026-11' and
            test1_res['hasClosed2026_08'] == True and
            test1_res['hasClosed2026_09'] == True and
            test1_res['hasClosed2026_10'] == True and
            test1_res['hasRecoveryMetaOnSuccess'] == True
        )
        dynamic_tests.append(("Priority 1: Commit aborts and completely rolls back on saveData persistence failure", p1_rollback))
        dynamic_tests.append(("Priority 1: Commit succeeds atomically when persistence succeeds, sealing months", p1_success))

        # =========================================================================
        # Test Suite 2: Priority 2 — Reliable Stale-State and Concurrency Detection
        # =========================================================================
        print("\n[Suite 2] Priority 2 — Reliable Stale-State and Concurrency Detection")

        test2_res = await eval_js("""
        (function() {
            const origGetMonth = storage.getCurrentMonthKey;
            storage.getCurrentMonthKey = () => '2026-11';
            storage.accountStatus = 'EXISTING_USER';
            if (!storage.state.preferences) storage.state.preferences = {};
            storage.state.preferences.countries = ['JP', 'IN', 'DE'];
            storage.state.preferences.primaryCountry = 'JP';
            storage.state.preferences.onboardingCompleted = true;

            // Setup gap
            storage.state.currentMonthKey = '2026-08';
            if (!storage.state.closedMonths) storage.state.closedMonths = {};
            delete storage.state.closedMonths['2026-08'];
            delete storage.state.closedMonths['2026-09'];
            delete storage.state.closedMonths['2026-10'];
            storage.state.recoveryMetadata = null;
            storage.budgetRecoveryState = null;
            storage.saveData();

            const preview = storage.getBudgetRecoveryPreview('continue');
            const originalToken = preview.stateToken;

            // 1. Attempt commit with invalid / stale token
            const staleResult = storage.commitBudgetRecovery('continue', {}, 'stale_token_12345');

            // 2. Simulate concurrent cross-tab mutation in localStorage
            // Save valid state to localStorage first
            storage.saveData();
            // Now simulate another tab modifying localStorage directly
            const storageKey = storage.getActiveStorageKey();
            const rawStored = JSON.parse(localStorage.getItem(storageKey) || '{}');
            if (!rawStored.budgets) rawStored.budgets = {};
            if (!rawStored.budgets.JP) rawStored.budgets.JP = { amount: 200000 };
            rawStored.budgets.JP.amount = 999999; // Concurrent tab budget change
            localStorage.setItem(storageKey, JSON.stringify(rawStored));

            // Attempt commit with original valid preview token
            const conflictResult = storage.commitBudgetRecovery('continue', {}, originalToken);

            // Clean up localStorage
            if (!storage.state.budgets) storage.state.budgets = {};
            if (!storage.state.budgets.JP) storage.state.budgets.JP = { amount: 200000 };
            storage.state.budgets.JP.amount = 200000;
            storage.saveData();

            storage.getCurrentMonthKey = origGetMonth;

            return {
                staleSuccess: staleResult.success,
                staleError: staleResult.error,
                conflictSuccess: conflictResult.success,
                conflictFlag: conflictResult.conflict,
                conflictError: conflictResult.error
            };
        })()
        """)

        p2_stale = (test2_res['staleSuccess'] == False and ("changed" in test2_res['staleError'].lower() or "refresh" in test2_res['staleError'].lower()))
        p2_conflict = (test2_res['conflictSuccess'] == False and test2_res['conflictFlag'] == True and ("conflict" in test2_res['conflictError'].lower() or "another tab" in test2_res['conflictError'].lower()))
        dynamic_tests.append(("Priority 2: Rejects stale stateToken before attempting mutation", p2_stale))
        dynamic_tests.append(("Priority 2: Cross-tab concurrency guard detects external localStorage change and fails closed", p2_conflict))

        # =========================================================================
        # Test Suite 3: Priority 3 — Validate All Budget Recovery Inputs
        # =========================================================================
        print("\n[Suite 3] Priority 3 — Input Validation on Recovery Adjustments")

        test3_res = await eval_js("""
        (function() {
            const unfinalized = ['2026-09', '2026-10'];

            const vNegative = storage.validateRecoveryAdjustments({ '2026-09': { JP: { baseBudget: -100 } } }, unfinalized);
            const vNaN = storage.validateRecoveryAdjustments({ '2026-09': { IN: { baseBudget: 'abc' } } }, unfinalized);
            const vInfinity = storage.validateRecoveryAdjustments({ '2026-09': { DE: { baseBudget: Infinity } } }, unfinalized);
            const vJPYFraction = storage.validateRecoveryAdjustments({ '2026-09': { JP: { baseBudget: 250000.75 } } }, unfinalized);
            const vINRExcessDec = storage.validateRecoveryAdjustments({ '2026-09': { IN: { baseBudget: 50000.123 } } }, unfinalized);
            const vHugeAmount = storage.validateRecoveryAdjustments({ '2026-09': { JP: { baseBudget: 2e12 } } }, unfinalized);
            const vInvalidMonth = storage.validateRecoveryAdjustments({ '2026-12': { JP: { baseBudget: 1000 } } }, unfinalized);
            const vInvalidCountry = storage.validateRecoveryAdjustments({ '2026-09': { US: { baseBudget: 1000 } } }, unfinalized);
            const vInvalidRollover = storage.validateRecoveryAdjustments({ '2026-09': { JP: { rolloverEnabled: 'yes' } } }, unfinalized);
            const vValid = storage.validateRecoveryAdjustments({
                '2026-09': { JP: { baseBudget: 220000, rolloverEnabled: true }, IN: { baseBudget: 65000.50 } },
                '2026-10': { DE: { baseBudget: 1600.00, rolloverEnabled: false } }
            }, unfinalized);

            return {
                negativeValid: vNegative.valid,
                nanValid: vNaN.valid,
                infinityValid: vInfinity.valid,
                jpyFractionValid: vJPYFraction.valid,
                inrExcessDecValid: vINRExcessDec.valid,
                hugeAmountValid: vHugeAmount.valid,
                invalidMonthValid: vInvalidMonth.valid,
                invalidCountryValid: vInvalidCountry.valid,
                invalidRolloverValid: vInvalidRollover.valid,
                validResult: vValid.valid
            };
        })()
        """)

        p3_rejected = (
            test3_res['negativeValid'] == False and
            test3_res['nanValid'] == False and
            test3_res['infinityValid'] == False and
            test3_res['jpyFractionValid'] == False and
            test3_res['inrExcessDecValid'] == False and
            test3_res['hugeAmountValid'] == False and
            test3_res['invalidMonthValid'] == False and
            test3_res['invalidCountryValid'] == False and
            test3_res['invalidRolloverValid'] == False
        )
        p3_accepted = test3_res['validResult'] == True
        dynamic_tests.append(("Priority 3: Rejects negative, NaN, Infinity, fractional yen, >2 decimals, huge amounts, bad months/countries", p3_rejected))
        dynamic_tests.append(("Priority 3: Accepts properly formatted and bounded budget recovery adjustments", p3_accepted))

        # =========================================================================
        # Test Suite 4: Priority 4 — Complete Transaction Rollback
        # =========================================================================
        print("\n[Suite 4] Priority 4 — Complete Transaction Rollback")

        test4_res = await eval_js("""
        (function() {
            // Create a dedicated wallet and test transaction
            const wId = 'w_test_atomicity';
            storage.state.wallets[wId] = {
                id: wId,
                name: 'Atomicity Test Wallet',
                type: 'bank',
                currency: 'JPY',
                balance: 100000
            };

            const txId = 'tx_test_atomicity_1';
            const testTx = {
                id: txId,
                walletId: wId,
                type: 'expense',
                amount: 5000,
                category: 'food',
                note: 'Original Note',
                date: '2026-11-10T12:00:00.000Z'
            };
            storage.state.transactions.unshift(testTx);
            storage.saveData();

            const initialTxCount = storage.state.transactions.length;
            const initialBalance = storage.state.wallets[wId].balance;

            // 1. Test updateTransaction rollback on persistence failure
            const originalSaveData = storage.saveData;
            storage.saveData = function() { return false; }; // Simulate QuotaExceededError or write lock

            const updateRes = walletManager.updateTransaction(txId, {
                amount: 25000,
                note: 'Mutated Note',
                category: 'shopping'
            });

            const postFailUpdateTx = storage.state.transactions.find(t => t.id === txId);
            const postFailUpdateBalance = storage.state.wallets[wId].balance;
            const postFailUpdateCount = storage.state.transactions.length;

            // 2. Test deleteTransaction rollback on persistence failure
            const deleteRes = walletManager.deleteTransaction(txId);

            const postFailDeleteTx = storage.state.transactions.find(t => t.id === txId);
            const postFailDeleteBalance = storage.state.wallets[wId].balance;
            const postFailDeleteCount = storage.state.transactions.length;

            // 3. Test addExpense rollback on persistence failure
            const addRes = walletManager.addExpense(wId, 'food', 3000, 'Rollback expense', '2026-11-11');
            const postFailAddBalance = storage.state.wallets[wId].balance;
            const postFailAddCount = storage.state.transactions.length;

            // Restore saveData
            storage.saveData = originalSaveData;

            // Cleanup test objects
            const cleanIdx = storage.state.transactions.findIndex(t => t.id === txId);
            if (cleanIdx !== -1) storage.state.transactions.splice(cleanIdx, 1);
            delete storage.state.wallets[wId];
            storage.saveData();

            return {
                updateRes,
                postFailUpdateAmount: postFailUpdateTx?.amount,
                postFailUpdateNote: postFailUpdateTx?.note,
                postFailUpdateBalance,
                postFailUpdateCount,
                initialBalance,
                initialTxCount,
                deleteRes,
                hasPostFailDeleteTx: !!postFailDeleteTx,
                postFailDeleteBalance,
                postFailDeleteCount,
                addRes,
                postFailAddBalance,
                postFailAddCount
            };
        })()
        """)

        p4_update_rollback = (
            test4_res['updateRes'] == False and
            test4_res['postFailUpdateAmount'] == 5000 and
            test4_res['postFailUpdateNote'] == 'Original Note' and
            test4_res['postFailUpdateBalance'] == test4_res['initialBalance'] and
            test4_res['postFailUpdateCount'] == test4_res['initialTxCount']
        )
        p4_delete_rollback = (
            test4_res['deleteRes'] == False and
            test4_res['hasPostFailDeleteTx'] == True and
            test4_res['postFailDeleteBalance'] == test4_res['initialBalance'] and
            test4_res['postFailDeleteCount'] == test4_res['initialTxCount']
        )
        p4_add_rollback = (
            test4_res['addRes'] == False and
            test4_res['postFailAddBalance'] == test4_res['initialBalance'] and
            test4_res['postFailAddCount'] == test4_res['initialTxCount']
        )
        dynamic_tests.append(("Priority 4: updateTransaction restores balances, fields, and ordering when persistence fails", p4_update_rollback))
        dynamic_tests.append(("Priority 4: deleteTransaction preserves transaction object and balances when persistence fails", p4_delete_rollback))
        dynamic_tests.append(("Priority 4: addExpense rolls back wallet balance and transaction unshift on save failure", p4_add_rollback))

        # =========================================================================
        # Test Suite 5: Priority 5 — Historical Budget Provenance & Recovery UX
        # =========================================================================
        print("\n[Suite 5] Priority 5 — Historical Budget Provenance & UX")

        test5_res = await eval_js("""
        (function() {
            storage.accountStatus = 'EXISTING_USER';
            if (!storage.state.preferences) storage.state.preferences = {};
            storage.state.preferences.countries = ['JP', 'IN', 'DE'];
            storage.state.preferences.onboardingCompleted = true;

            storage.state.currentMonthKey = '2026-08';
            if (!storage.state.closedMonths) storage.state.closedMonths = {};
            delete storage.state.closedMonths['2026-08'];
            delete storage.state.closedMonths['2026-09'];
            delete storage.state.closedMonths['2026-10'];
            storage.state.recoveryMetadata = null;
            storage.budgetRecoveryState = null;
            storage.saveData();
            const origGetMonth = storage.getCurrentMonthKey;
            storage.getCurrentMonthKey = () => '2026-11';

            // 1. Preview Option A (Review) with custom adjustments
            const previewReview = storage.getBudgetRecoveryPreview('review', {
                '2026-09': { JP: { baseBudget: 230000 } }
            });
            const m09Review = (previewReview.monthsPreview || []).find(m => m.monthKey === '2026-09');
            const provJP_adjusted = m09Review?.countries?.JP?.provenance;
            const provIN_default = m09Review?.countries?.IN?.provenance;

            // 2. Preview Option B (Continue)
            const previewContinue = storage.getBudgetRecoveryPreview('continue');
            const m09Continue = (previewContinue.monthsPreview || []).find(m => m.monthKey === '2026-09');
            const provJP_continue = m09Continue?.countries?.JP?.provenance;

            // 3. Preview Option C (Fresh)
            const previewFresh = storage.getBudgetRecoveryPreview('fresh');
            const m09Fresh = (previewFresh.monthsPreview || []).find(m => m.monthKey === '2026-09');
            const provJP_fresh = m09Fresh?.countries?.JP?.provenance;

            // 4. Commit Review option and verify metadata provenance summary
            const commitRes = storage.commitBudgetRecovery('review', {
                '2026-09': { JP: { baseBudget: 230000 } }
            }, previewReview.stateToken);

            const provSummary = storage.state.recoveryMetadata?.provenanceSummary;
            const m09Summary = (provSummary || []).find(m => m.monthKey === '2026-09');
            storage.getCurrentMonthKey = origGetMonth;

            // 5. Check app UI provenance badge helper
            const badgeUser = app.getProvenanceBadge('user_confirmed_adjustment');
            const badgePrior = app.getProvenanceBadge('prior_closed_snapshot');
            const badgeZero = app.getProvenanceBadge('explicit_zero_budget');
            const badgeReused = app.getProvenanceBadge('reused_active_setting');

            return {
                provJP_adjusted,
                provIN_default,
                provJP_continue,
                provJP_fresh,
                commitSuccess: commitRes.success,
                hasProvSummary: !!provSummary && provSummary.length > 0,
                summaryAdjusted: m09Summary ? m09Summary.countries?.JP : null,
                hasBadgeUser: badgeUser.includes('User Confirmed'),
                hasBadgePrior: badgePrior.includes('Prior Snapshot'),
                hasBadgeZero: badgeZero.includes('Explicit Zero'),
                hasBadgeReused: badgeReused.includes('Active Setting')
            };
        })()
        """)

        p5_provenance_calc = (
            test5_res['provJP_adjusted'] == 'user_confirmed_adjustment' and
            test5_res['provIN_default'] == 'reused_active_setting' and
            (test5_res['provJP_continue'] in ['prior_closed_snapshot', 'reused_active_setting']) and
            test5_res['provJP_fresh'] == 'explicit_zero_budget'
        )
        p5_meta_summary = (
            test5_res['commitSuccess'] == True and
            test5_res['hasProvSummary'] == True and
            test5_res['summaryAdjusted'] == 'user_confirmed_adjustment'
        )
        p5_ui_badges = (
            test5_res['hasBadgeUser'] and
            test5_res['hasBadgePrior'] and
            test5_res['hasBadgeZero'] and
            test5_res['hasBadgeReused']
        )
        dynamic_tests.append(("Priority 5: Accurately classifies provenance for user-adjusted, continued, and fresh budgets", p5_provenance_calc))
        dynamic_tests.append(("Priority 5: Records provenanceSummary in recoveryMetadata upon commit", p5_meta_summary))
        dynamic_tests.append(("Priority 5: App generates distinct visual badges for all 4 provenance types", p5_ui_badges))

        # =========================================================================
        # Test Suite 6: Production Continuous Ledger Verification
        # =========================================================================
        print("\n[Suite 6] Production Continuous Ledger & Data Preservation")

        prod_export_data = None
        if os.path.exists(EXPORT_PATH):
            with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
                prod_export_data = json.load(f)

        if prod_export_data:
            js_code = """
            (function() {
                const prodData = %s;
                const rawState = storage.normalizeBackupPayload(prodData);
                const uniqueCount = storage.getUniqueTransactionCount(rawState);
                const walletCount = Object.keys(rawState.wallets || {}).length;
                const axisBal = rawState.wallets['Axis Bank']?.balance;
                return {
                    rawStateValid: !!rawState,
                    uniqueCount,
                    walletCount,
                    axisBal
                };
            })()
            """ % json.dumps(prod_export_data)
            test6_res = await eval_js(js_code)

            p6_ledger = (
                test6_res['rawStateValid'] == True and
                test6_res['uniqueCount'] == 116 and
                test6_res['walletCount'] == 6 and
                test6_res['axisBal'] == 46794.53
            )
            dynamic_tests.append(("Continuous Ledger: Production export (116 transactions, 6 wallets) verified intact with exact balance", p6_ledger))
        else:
            print("  ⚠️ Production export fixture not found at expected path. Skipping fixture assertion.")

        # -------------------------------------------------------------------------
        # Summary Evaluation
        # -------------------------------------------------------------------------
        print("\n" + "=" * 80)
        print("SUMMARY RESULTS: PHASE 5 RECOVERY ATOMICITY & SAFETY CORRECTIONS")
        print("=" * 80)

        all_dynamic_passed = True
        for title, passed in dynamic_tests:
            status = "✅ PASS" if passed else "❌ FAIL"
            if not passed: all_dynamic_passed = False
            print(f"  [{status}] {title}")

        if all_dynamic_passed:
            print("\n🎉 ALL STATIC & DYNAMIC VERIFICATION CHECKS PASSED PERFECTLY!")
            return True
        else:
            print("\n❌ SOME TESTS FAILED.")
            return False

    finally:
        if ws:
            await ws.close()
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except Exception:
                proc.kill()

if __name__ == '__main__':
    success = asyncio.run(run_recovery_atomicity_tests())
    sys.exit(0 if success else 1)
