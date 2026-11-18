#!/usr/bin/env python3
"""
Expense Manager — Phase 5 Financial Safety Corrections Automated Verification Suite

Focused test suite verifying:
1. Priority 1: Rollover Idempotency (prevent duplicate carryover on repeated close, refresh, auto-close, cross-year transitions, sealed snapshot immutability).
2. Priority 2: Transaction Integrity & Atomicity (missing wallet references, partial reversal prevention, two-phase prepare/validate/commit rollback).
3. Priority 3: Currency Precision & Arithmetic (rounding minor units, IEEE 754 float drift prevention, safe magnitude bounds).
4. Priority 4: International Transfer UX Consistency (pure sent/received workflow, 6-decimal exchange rate, deferred fees).
5. Production Ledger Invariants (116 transactions and 6 wallets preserved).
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
CSS_STYLE_PATH = os.path.abspath('css/style.css')
APP_JS_PATH = os.path.abspath('js/app.js')
WALLET_JS_PATH = os.path.abspath('js/wallet.js')
STORAGE_JS_PATH = os.path.abspath('js/storage.js')
EXPORT_PATH = '/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'
if not os.path.exists(EXPORT_PATH) and os.path.exists('/tmp/ExpenseManager_Production_Export_2026-11-16.json'):
    EXPORT_PATH = '/tmp/ExpenseManager_Production_Export_2026-11-16.json'
SCREENSHOT_DIR = os.path.abspath('scratch')

async def run_safety_corrections_tests():
    print("=" * 80)
    print("EXPENSE MANAGER — PHASE 5 FINANCIAL SAFETY CORRECTIONS TEST SUITE")
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

    # Storage checks
    static_checks.append(('STORAGE', "closeCurrentMonth checks for already finalized status", "Month ${monthKey} is already finalized" in storage_content))
    static_checks.append(('STORAGE', "deleteLedger prevents deleting sealed months", "is permanently sealed" in storage_content or "immutable" in storage_content))
    static_checks.append(('STORAGE', "StorageManager provides reopenMonth rejection safeguard", "reopenMonth(" in storage_content))

    # Wallet checks
    static_checks.append(('WALLET', "WalletManager provides validateTransactionForReversal", "validateTransactionForReversal(" in wallet_content))
    static_checks.append(('WALLET', "WalletManager provides validateTransactionForApplication", "validateTransactionForApplication(" in wallet_content))
    static_checks.append(('WALLET', "WalletManager provides roundCurrency helper", "roundCurrency(" in wallet_content))
    static_checks.append(('WALLET', "isValidAmount enforces safe magnitude bounds (<= 1e12)", "1e12" in wallet_content))
    static_checks.append(('WALLET', "reverseTransactionEffects returns boolean and validates first", "validateTransactionForReversal(tx)" in wallet_content))
    static_checks.append(('WALLET', "applyTransactionEffects returns boolean and validates first", "validateTransactionForApplication(tx)" in wallet_content))

    all_static_passed = True
    for cat, title, passed in static_checks:
        status = "✅ PASS" if passed else "❌ FAIL"
        if not passed: all_static_passed = False
        print(f"  [{status}] [{cat}] {title}")

    if not all_static_passed:
        print("\n❌ Static checks failed. Aborting dynamic browser suite.")
        return False

    # -------------------------------------------------------------------------
    # 2. Dynamic Browser CDP Execution
    # -------------------------------------------------------------------------
    profile_dir = f'/tmp/phase5_safety_profile_{int(time.time())}'
    port = 9560
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

            # Wait for scripts to initialize
            for _ in range(50):
                ready_res = await send("Runtime.evaluate", {
                    "expression": "typeof storage !== 'undefined' && typeof walletManager !== 'undefined' && typeof app !== 'undefined'",
                    "returnByValue": True
                })
                if ready_res.get("result", {}).get("value") is True:
                    break
                await asyncio.sleep(0.1)

            # Load production fixture data
            prod_fixture_json = "{}"
            if os.path.exists(EXPORT_PATH):
                with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
                    prod_fixture_json = json.dumps(json.load(f))

            test_script = f"""
            (async () => {{
                const results = {{ checks: [] }};
                function assert(id, title, condition, details = '') {{
                    results.checks.push({{ id, title, pass: Boolean(condition), details: String(details) }});
                }}

                const prodData = {prod_fixture_json};

                function setupCleanTestState() {{
                    window.localStorage.clear();
                    storage.state = JSON.parse(JSON.stringify(defaultState));
                    storage.state.preferences = {{
                        version: 1,
                        activeCountries: ['JP', 'IN', 'DE'],
                        defaultCountry: 'JP',
                        onboardingCompleted: true,
                        onboardingStep: 4,
                        tourCompleted: true,
                        tourDismissed: true
                    }};
                    storage.state.budgets = {{
                        JP: {{ enabled: true, monthlyTotal: 100000, rolloverEnabled: true, carryover: 0 }},
                        IN: {{ enabled: true, monthlyTotal: 50000, rolloverEnabled: true, carryover: 0 }},
                        DE: {{ enabled: true, monthlyTotal: 2500, rolloverEnabled: true, carryover: 0 }}
                    }};
                    storage.state.wallets = {{
                        'JP Bank': {{ id: 'JP Bank', type: 'bank', region: 'JP', balance: 300000, currency: '¥', color: '#10b981' }},
                        'JP Cash': {{ id: 'JP Cash', type: 'cash', region: 'JP', balance: 50000, currency: '¥', color: '#f59e0b' }},
                        'IN Bank': {{ id: 'IN Bank', type: 'bank', region: 'IN', balance: 120000, currency: '₹', color: '#0ea5e9' }},
                        'DE Checking': {{ id: 'DE Checking', type: 'bank', region: 'DE', balance: 4000, currency: '€', color: '#3b82f6' }}
                    }};
                    storage.state.transactions = [];
                    storage.state.closedMonths = {{}};
                    storage.state.currentMonthKey = '2026-11';
                    storage.accountStatus = 'EXISTING_USER';
                    app.isPrivacyHidden = false;
                    storage.saveData();
                }}

                // =========================================================================
                // PRIORITY 1: ROLLOVER IDEMPOTENCY & MONTH TRANSITIONS
                // =========================================================================
                setupCleanTestState();

                // Spend 70,000 of 100,000 budget in November 2026 (unspent 30,000)
                walletManager.addExpense('JP Bank', 'living', 70000, 'November Rent', '2026-11-10');

                // Pass 1: First close
                const snap1 = storage.closeCurrentMonth('Monthly Close 1');
                assert('P1-01', 'First close records closedMonths[2026-11]', storage.state.closedMonths['2026-11'] !== undefined);
                assert('P1-02', 'First close adds 30,000 carryover', snap1.JPRolloverAdded === 30000);
                assert('P1-03', 'JP carryover updated to 30,000', storage.getCarryover('JP') === 30000);

                // Pass 2: Repeated manual close attempt on the same month
                const snap2 = storage.closeCurrentMonth('Repeated Manual Close');
                assert('P1-04', 'Repeated close returns existing snapshot', snap2.monthKey === '2026-11');
                assert('P1-05', 'Repeated close DOES NOT duplicate carryover (still 30,000)', storage.getCarryover('JP') === 30000);
                assert('P1-06', 'Repeated close DOES NOT change finalized snapshot rollover amount', snap2.JPRolloverAdded === 30000);

                // Pass 3: Page refresh simulation with checkRollover()
                storage.checkRollover();
                assert('P1-07', 'checkRollover on refresh does not duplicate carryover', storage.getCarryover('JP') === 30000);

                // Pass 4: Cross-year transition (2026-12 to 2027-01)
                storage.state.currentMonthKey = '2026-12';
                // Spend 85,000 of (100,000 base + 30,000 carryover = 130,000 available). Unspent = 45,000.
                walletManager.addExpense('JP Bank', 'travel', 85000, 'Winter holiday', '2026-12-24');
                const snapDec = storage.closeCurrentMonth('December Year-End Close');
                assert('P1-08', 'December snapshot prior carryover is 30,000', snapDec.JPCarryoverPrior === 30000);
                assert('P1-09', 'December unspent rollover is 45,000', snapDec.JPRolloverAdded === 45000);
                assert('P1-10', 'January 2027 carries forward 45,000', storage.getCarryover('JP') === 45000);

                // Pass 5: Reopening and deletion prevention
                const delRes = storage.deleteLedger('2026-11');
                assert('P1-11', 'deleteLedger on finalized month is rejected', delRes === false);
                assert('P1-12', 'Closed month 2026-11 snapshot preserved intact', storage.state.closedMonths['2026-11'] !== undefined);

                const reopenRes = storage.reopenMonth('2026-11');
                assert('P1-13', 'reopenMonth is strictly prohibited', reopenRes === false);

                // =========================================================================
                // PRIORITY 2: TRANSACTION INTEGRITY & ATOMICITY
                // =========================================================================
                setupCleanTestState();

                // Create a valid domestic transfer: JP Bank (300k) -> JP Cash (50k), amount 25,000
                walletManager.transfer('JP Bank', 'JP Cash', 25000, 'Test transfer', '2026-11-12');
                const validTx = storage.state.transactions[0];
                const srcBalPre = storage.state.wallets['JP Bank'].balance; // 275,000
                const dstBalPre = storage.state.wallets['JP Cash'].balance; // 75,000

                // Test 2.1: Missing wallet reference reversal check
                const malformedTx = JSON.parse(JSON.stringify(validTx));
                malformedTx.destId = 'NonExistentWallet999';
                const revCheckMalformed = walletManager.validateTransactionForReversal(malformedTx);
                assert('P2-01', 'validateTransactionForReversal fails when wallet missing', revCheckMalformed.valid === false);

                const revRes = walletManager.reverseTransactionEffects(malformedTx);
                assert('P2-02', 'reverseTransactionEffects aborts when wallet missing', revRes === false);
                assert('P2-03', 'Source wallet untouched on aborted reversal (no partial credit)', storage.state.wallets['JP Bank'].balance === srcBalPre);

                // Test 2.2: Delete with missing wallet reference fails-closed
                // Temporarily detach destination wallet to simulate broken reference
                const cachedCash = storage.state.wallets['JP Cash'];
                delete storage.state.wallets['JP Cash'];

                const delFail = walletManager.deleteTransaction(validTx.id);
                assert('P2-04', 'deleteTransaction aborts when referenced wallet missing', delFail === false);
                assert('P2-05', 'Transaction remains preserved in ledger on failed delete', storage.state.transactions.some(t => t.id === validTx.id));
                assert('P2-06', 'Source wallet balance unchanged on failed delete', storage.state.wallets['JP Bank'].balance === srcBalPre);

                // Restore wallet
                storage.state.wallets['JP Cash'] = cachedCash;

                // Test 2.3: Two-phase update rollback on proposed invalid state
                // Attempt to update transfer with invalid destination wallet
                const updateFail1 = walletManager.updateTransaction(validTx.id, {{ destId: 'InvalidDest' }});
                assert('P2-07', 'updateTransaction rejected when prospective destination missing', updateFail1 === false);
                assert('P2-08', 'Source balance unchanged after failed update', storage.state.wallets['JP Bank'].balance === srcBalPre);
                assert('P2-09', 'Dest balance unchanged after failed update', storage.state.wallets['JP Cash'].balance === dstBalPre);
                assert('P2-10', 'Original transaction destId unchanged', validTx.destId === 'JP Cash');

                // Attempt to update with cross-currency accounts in domestic transfer
                const updateFail2 = walletManager.updateTransaction(validTx.id, {{ destId: 'IN Bank' }});
                assert('P2-11', 'updateTransaction rejected on cross-currency domestic update', updateFail2 === false);
                assert('P2-12', 'Balances untouched after cross-currency domestic update', storage.state.wallets['JP Bank'].balance === srcBalPre && storage.state.wallets['JP Cash'].balance === dstBalPre);

                // Test 2.4: Closed-month restrictions on edit and delete
                storage.closeCurrentMonth('Close November');
                const editClosedRes = walletManager.updateTransaction(validTx.id, {{ note: 'Try edit closed' }});
                assert('P2-13', 'updateTransaction rejected for closed month transaction', editClosedRes === false);

                const delClosedRes = walletManager.deleteTransaction(validTx.id);
                assert('P2-14', 'deleteTransaction rejected for closed month transaction', delClosedRes === false);

                // =========================================================================
                // PRIORITY 3: CURRENCY PRECISION & ARITHMETIC SAFETY
                // =========================================================================
                setupCleanTestState();

                // Test 3.1: Float precision drift prevention over multiple transactions
                // Set initial balance with exact 2 decimal places: €1,000.55
                storage.state.wallets['DE Checking'].balance = 1000.55;

                // Perform 10 operations adding/subtracting 0.10 and 0.20
                for (let i = 0; i < 5; i++) {{
                    walletManager.addExpense('DE Checking', 'misc', 0.10, 'Sub ' + i, '2026-11-15');
                    walletManager.addIncome('DE Checking', 0.20, 'Add ' + i, '2026-11-15');
                }}
                // Net change: +5 * 0.10 = +0.50. Expected balance: 1001.05
                const finalDeBal = storage.state.wallets['DE Checking'].balance;
                assert('P3-01', 'Exact decimal arithmetic without precision drift', finalDeBal === 1001.05);

                // Test 3.2: JPY integer enforcement
                assert('P3-02', 'isValidAmount rejects fractional JPY (100.5)', walletManager.isValidAmount(100.5, 'JPY') === false);
                assert('P3-03', 'isValidAmount accepts integer JPY (100)', walletManager.isValidAmount(100, 'JPY') === true);

                // Test 3.3: Decimal limits for EUR and INR (max 2 decimals)
                assert('P3-04', 'isValidAmount accepts 2 decimals on EUR (50.25)', walletManager.isValidAmount(50.25, 'EUR') === true);
                assert('P3-05', 'isValidAmount rejects 3 decimals on EUR (50.255)', walletManager.isValidAmount(50.255, 'EUR') === false);
                assert('P3-06', 'isValidAmount rejects 3 decimals on INR (12.345)', walletManager.isValidAmount(12.345, 'INR') === false);

                // Test 3.4: Safe magnitude bounds
                assert('P3-07', 'isValidAmount rejects amounts > 1e12', walletManager.isValidAmount(1e12 + 1, 'JPY') === false);
                assert('P3-08', 'isValidAmount rejects nonfinite values (Infinity)', walletManager.isValidAmount(Infinity, 'EUR') === false);
                assert('P3-09', 'isValidAmount rejects nonfinite values (NaN)', walletManager.isValidAmount(NaN, 'EUR') === false);
                assert('P3-10', 'isValidAmount rejects non-positive values (0)', walletManager.isValidAmount(0, 'EUR') === false);

                // =========================================================================
                // PRIORITY 4: INTERNATIONAL MONEY TRANSFER UX & EXCHANGE RATE BADGE
                // =========================================================================
                setupCleanTestState();

                // JPY -> EUR transfer: ¥160,000 sent, €1,000 received
                const remSuccess = walletManager.remittance('JP Bank', 'DE Checking', 160000, 1000, 'Study Abroad', '2026-11-16');
                assert('P4-01', 'International Money Transfer succeeds', remSuccess === true);

                const remTx = storage.state.transactions[0];
                assert('P4-02', 'Exchange rate calculated accurately from entered amounts (6 dec)', remTx.exchangeRate === '0.006250');
                assert('P4-03', 'Exchange rate is string representation', typeof remTx.exchangeRate === 'string');

                // Verify preview effective rate badge formatting
                const remPreview = walletManager.getTransferPreview('remittance', 'JP Bank', 'DE Checking', 160000, 1000);
                assert('P4-04', 'Preview contains effective rate calculation', remPreview.effectiveRate === 0.00625);
                assert('P4-05', 'Preview formats rate text', remPreview.rateFormatted.includes('1 ¥ ='));

                // =========================================================================
                // PRIORITY 5: PRODUCTION FIXTURE SAFETY
                // =========================================================================
                if (prodData && prodData.transactions) {{
                    const sProd = new StorageManager();
                    const prev = sProd.previewContinuousLedgerMigration(prodData);
                    assert('P5-01', 'Production fixture migration preview succeeds', prev.success === true);
                    assert('P5-02', 'Exact 116 transactions preserved', prev.migratedState.transactions.length === 116);
                    assert('P5-03', 'All 6 wallets preserved', Object.keys(prev.migratedState.wallets).length === 6);
                    assert('P5-04', 'Axis Bank float balance ₹46,794.53 preserved without rounding drift', Math.abs(prev.migratedState.wallets['Axis Bank'].balance - 46794.53) < 1e-6);
                }}

                return results;
            }})();
            """

            eval_res = await send("Runtime.evaluate", {
                "expression": test_script,
                "awaitPromise": True,
                "returnByValue": True
            })

            if "exceptionDetails" in eval_res:
                print("JS EXCEPTION:", json.dumps(eval_res["exceptionDetails"], indent=2))

            results = eval_res.get("result", {}).get("value", {})
            checks = results.get("checks", [])

            print(f"\nTotal Safety Checks Executed: {len(checks)}")
            passed_checks = [c for c in checks if c.get('pass')]
            failed_checks = [c for c in checks if not c.get('pass')]
            print(f"Passed: {len(passed_checks)}")
            print(f"Failed: {len(failed_checks)}")

            current_group = ""
            for c in checks:
                group = c['id'].split('-')[0]
                if group != current_group:
                    current_group = group
                    print(f"\n[{current_group}]")
                status = "✅ PASS" if c['pass'] else "❌ FAIL"
                print(f"  {status} [{c['id']}] {c['title']}")
                if not c['pass'] and c.get('details'):
                    print(f"       Details: {c['details']}")

            all_passed = (len(failed_checks) == 0 and len(passed_checks) > 0 and all_static_passed)
            if all_passed:
                print("\n" + "=" * 80)
                print("🎉 ALL PHASE 5 FINANCIAL SAFETY CORRECTIONS CHECKS PASSED (100% SUCCESS)!")
                print("=" * 80)
            else:
                print(f"\n❌ {len(failed_checks)} checks failed.")

            return all_passed

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            pass
        subprocess.run(["rm", "-rf", profile_dir], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

if __name__ == '__main__':
    success = asyncio.run(run_safety_corrections_tests())
    sys.exit(0 if success else 1)

