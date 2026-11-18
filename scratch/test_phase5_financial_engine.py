#!/usr/bin/env python3
"""
Expense Manager — Phase 5: Financial Engine, International Transfers & Budget Rollover Verification Suite

Comprehensive automated test suite covering:
1. Same-Currency Domestic Transfers (JPY-JPY, INR-INR, EUR-EUR, validation, atomic balances, reversal).
2. Generalized International Money Transfers (JPY ↔ INR, JPY ↔ EUR, INR ↔ EUR, rate calculation, validation).
3. Pure Transfer Preview & Interactive Live Preview Card DOM Verification.
4. Independent Multi-Country Budget Rollover Engine (JP, IN, DE carryover, cushion badge, month close snapshot).
5. Wallet Rendering & Event Security (XSS prevention, special characters, data-wallet-id event delegation).
6. Financial Ledger Invariants & Production Fixture Safety (116 transactions, exact balances).
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

async def run_phase5_tests():
    print("=" * 80)
    print("EXPENSE MANAGER — PHASE 5 FINANCIAL ENGINE & ROLLOVER TEST SUITE")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # 1. Static Architecture & Integrity Checks
    # -------------------------------------------------------------------------
    print("\n--- Running Static Code & Architecture Checks ---")
    static_checks = []

    with open(CSS_STYLE_PATH, 'r', encoding='utf-8') as f:
        css_content = f.read()

    with open(INDEX_HTML_PATH, 'r', encoding='utf-8') as f:
        html_content = f.read()

    with open(WALLET_JS_PATH, 'r', encoding='utf-8') as f:
        wallet_content = f.read()

    with open(STORAGE_JS_PATH, 'r', encoding='utf-8') as f:
        storage_content = f.read()

    with open(APP_JS_PATH, 'r', encoding='utf-8') as f:
        app_content = f.read()

    # CSS Checks
    static_checks.append(('CSS', "Transfer preview card styling (.transfer-preview-card)", '.transfer-preview-card' in css_content))
    static_checks.append(('CSS', "Preview balance flow styling (.preview-balance-flow)", '.preview-balance-flow' in css_content))
    static_checks.append(('CSS', "Exchange rate chip styling (.exchange-rate-chip)", '.exchange-rate-chip' in css_content))
    static_checks.append(('CSS', "Budget rollover cushion badge styling (.budget-cushion-badge)", '.budget-cushion-badge' in css_content))

    # HTML Checks
    static_checks.append(('HTML', "Generalized International Money Transfer label in transaction modal", 'International Money Transfer' in html_content))
    static_checks.append(('HTML', "Generalized International Transfers filter option", 'International Transfers Only' in html_content))
    static_checks.append(('HTML', "Asset cache version bumped to v123", '20261118_v123' in html_content))

    # Wallet & Storage JS Checks
    static_checks.append(('JS', "WalletManager provides isValidAmount", 'isValidAmount(' in wallet_content))
    static_checks.append(('JS', "WalletManager provides getTransferPreview", 'getTransferPreview(' in wallet_content))
    static_checks.append(('JS', "WalletManager getTransactions supports EUR (€)", "c === '€'" in wallet_content or "cur === 'EUR'" in wallet_content))
    static_checks.append(('JS', "StorageManager provides getCarryover and setCarryover", 'getCarryover(' in storage_content and 'setCarryover(' in storage_content))
    static_checks.append(('JS', "StorageManager provides getTotalAvailableBudget", 'getTotalAvailableBudget(' in storage_content))
    static_checks.append(('JS', "StorageManager closeCurrentMonth calculates independent multi-country rollover", 'snapshot[`${code}TotalBudget`]' in storage_content or 'CarryoverPrior' in storage_content))
    static_checks.append(('JS', "App provides escapeHtml method", 'escapeHtml(' in app_content))
    static_checks.append(('JS', "App provides onTransferSourceChange and updateTransferPreview", 'onTransferSourceChange(' in app_content and 'updateTransferPreview(' in app_content))
    static_checks.append(('JS', "Wallets view uses data-wallet-id event delegation", 'data-wallet-id' in app_content and 'data-edit-wallet-id' in app_content))

    all_static_passed = True
    for cat, title, passed in static_checks:
        status = "✅ PASS" if passed else "❌ FAIL"
        if not passed: all_static_passed = False
        print(f"  [{status}] [{cat}] {title}")

    if not all_static_passed:
        print("\n❌ Static checks failed. Aborting dynamic browser suite.")
        return False

    # -------------------------------------------------------------------------
    # 2. Launch Headless Chrome for Live Dynamic DOM Execution
    # -------------------------------------------------------------------------
    profile_dir = f'/tmp/phase5_financial_profile_{int(time.time())}'
    port = 9550
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

            async def capture_screen(filename):
                res = await send("Page.captureScreenshot", {"format": "png"})
                if res and 'data' in res:
                    img_data = base64.b64decode(res['data'])
                    out_path = os.path.join(SCREENSHOT_DIR, filename)
                    with open(out_path, 'wb') as f:
                        f.write(img_data)
                    print(f"  [📸 Screenshot Captured] {out_path}")

            # Wait for page scripts to fully initialize
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

                // Helper to initialize clean authenticated state with tri-country wallets
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
                    storage.state.regionalPreferences = {{
                        defaultCountry: 'JP',
                        defaultCurrency: 'JPY',
                        dateFormat: 'YYYY-MM-DD',
                        weekStart: 'monday',
                        numberFormat: 'standard',
                        timezone: 'Asia/Tokyo'
                    }};
                    storage.state.budgets = {{
                        JP: {{ enabled: true, monthlyTotal: 100000, rolloverEnabled: true, carryover: 0 }},
                        IN: {{ enabled: true, monthlyTotal: 50000, rolloverEnabled: true, carryover: 0 }},
                        DE: {{ enabled: true, monthlyTotal: 2500, rolloverEnabled: true, carryover: 0 }}
                    }};
                    storage.state.wallets = {{
                        'JP Bank': {{ id: 'JP Bank', type: 'bank', region: 'JP', balance: 300000, currency: '¥', color: '#10b981', theme: 'emerald-salary' }},
                        'JP Cash': {{ id: 'JP Cash', type: 'cash', region: 'JP', balance: 50000, currency: '¥', color: '#f59e0b', theme: 'amber-gold' }},
                        'IN Bank': {{ id: 'IN Bank', type: 'bank', region: 'IN', balance: 120000, currency: '₹', color: '#0ea5e9', theme: 'cobalt-card' }},
                        'IN Cash': {{ id: 'IN Cash', type: 'cash', region: 'IN', balance: 15000, currency: '₹', color: '#f59e0b', theme: 'amber-gold' }},
                        'DE Checking': {{ id: 'DE Checking', type: 'bank', region: 'DE', balance: 4000, currency: '€', color: '#3b82f6', theme: 'frankfurt-slate' }},
                        'DE Savings': {{ id: 'DE Savings', type: 'savings', region: 'DE', balance: 10000, currency: '€', color: '#10b981', theme: 'emerald-salary' }}
                    }};
                    storage.state.transactions = [];
                    storage.state.closedMonths = {{}};
                    storage.state.currentMonthKey = '2026-11';
                    storage.accountStatus = 'EXISTING_USER';
                    app.isPrivacyHidden = false;
                    storage.saveData();
                }}

                setupCleanTestState();
                app.renderAll();

                // =========================================================================
                // 1. DOMESTIC TRANSFERS (SAME CURRENCY)
                // =========================================================================
                // Test 1.1: JPY-JPY Domestic Transfer
                const resTransferJP = walletManager.transfer('JP Bank', 'JP Cash', 20000, 'ATM withdrawal', '2026-11-05');
                assert('T1-01', 'JPY-JPY domestic transfer executes successfully', resTransferJP === true);
                assert('T1-02', 'JPY Source wallet debited exactly', storage.state.wallets['JP Bank'].balance === 280000);
                assert('T1-03', 'JPY Dest wallet credited exactly', storage.state.wallets['JP Cash'].balance === 70000);
                
                const txJP = storage.state.transactions.find(t => t.type === 'transfer' && t.sourceId === 'JP Bank');
                assert('T1-04', 'Transfer transaction recorded in ledger', txJP && txJP.amount === 20000 && txJP.currency === '¥');

                // Test 1.2: INR-INR Domestic Transfer with 2 decimal places
                const resTransferIN = walletManager.transfer('IN Bank', 'IN Cash', 4500.50, 'Cash for groceries', '2026-11-06');
                assert('T1-05', 'INR-INR domestic transfer with 2 decimals executes', resTransferIN === true);
                assert('T1-06', 'INR Source wallet debited with precision', Math.abs(storage.state.wallets['IN Bank'].balance - 115499.50) < 1e-6);
                assert('T1-07', 'INR Dest wallet credited with precision', Math.abs(storage.state.wallets['IN Cash'].balance - 19500.50) < 1e-6);

                // Test 1.3: EUR-EUR Domestic Transfer
                const resTransferDE = walletManager.transfer('DE Checking', 'DE Savings', 1500.75, 'Savings transfer', '2026-11-07');
                assert('T1-08', 'EUR-EUR domestic transfer with 2 decimals executes', resTransferDE === true);
                assert('T1-09', 'EUR Source wallet debited with precision', Math.abs(storage.state.wallets['DE Checking'].balance - 2499.25) < 1e-6);
                assert('T1-10', 'EUR Dest wallet credited with precision', Math.abs(storage.state.wallets['DE Savings'].balance - 11500.75) < 1e-6);

                // Test 1.4: Validation - same wallet rejected
                const resSame = walletManager.transfer('JP Bank', 'JP Bank', 5000, 'Self transfer');
                assert('T1-11', 'Same wallet transfer rejected', resSame === false);

                // Test 1.5: Validation - cross currency rejected on domestic transfer
                const resCross = walletManager.transfer('JP Bank', 'IN Bank', 5000, 'Cross currency transfer');
                assert('T1-12', 'Cross-currency transfer rejected in domestic transfer method', resCross === false);

                // Test 1.6: Validation - decimal precision rules
                const resJpyDec = walletManager.transfer('JP Bank', 'JP Cash', 500.75, 'Invalid decimal on JPY');
                assert('T1-13', 'JPY domestic transfer rejects floating decimals', resJpyDec === false);

                const resInrDec3 = walletManager.transfer('IN Bank', 'IN Cash', 50.125, '3 decimals on INR');
                assert('T1-14', 'INR domestic transfer rejects >2 decimal places', resInrDec3 === false);

                const resEurDec3 = walletManager.transfer('DE Checking', 'DE Savings', 25.999, '3 decimals on EUR');
                assert('T1-15', 'EUR domestic transfer rejects >2 decimal places', resEurDec3 === false);

                // Test 1.7: Reversal on delete
                const balBeforeDelSrc = storage.state.wallets['JP Bank'].balance;
                const balBeforeDelDst = storage.state.wallets['JP Cash'].balance;
                const delTxId = txJP.id;
                const delRes = walletManager.deleteTransaction(delTxId);
                const balAfterDelSrc = storage.state.wallets['JP Bank'].balance;
                const balAfterDelDst = storage.state.wallets['JP Cash'].balance;
                assert('T1-16', 'Transfer transaction deletion succeeds', delRes === true);
                assert('T1-17', 'Source wallet balance restored on transfer delete', balAfterDelSrc === balBeforeDelSrc + 20000);
                assert('T1-18', 'Dest wallet balance reverted on transfer delete', balAfterDelDst === balBeforeDelDst - 20000);

                // =========================================================================
                // 2. GENERALIZED INTERNATIONAL MONEY TRANSFERS (ALL 6 DIRECTIONAL PAIRS)
                // =========================================================================
                setupCleanTestState();

                // Test 2.1: JPY -> INR (e.g. ¥100,000 -> ₹55,000)
                const resJpyInr = walletManager.remittance('JP Bank', 'IN Bank', 100000, 55000, 'Support family', '2026-11-08');
                assert('T2-01', 'JPY -> INR international transfer succeeds', resJpyInr === true);
                assert('T2-02', 'JPY Source debited exact sent amount', storage.state.wallets['JP Bank'].balance === 200000);
                assert('T2-03', 'INR Dest credited exact received amount', storage.state.wallets['IN Bank'].balance === 175000);
                const txJpyInr = storage.state.transactions.find(t => t.type === 'remittance' && t.sourceId === 'JP Bank' && t.destId === 'IN Bank');
                assert('T2-04', 'Effective rate computed accurately for JPY -> INR', txJpyInr && txJpyInr.exchangeRate === '0.550000');

                // Test 2.2: INR -> JPY (e.g. ₹55,000 -> ¥99,500)
                const resInrJpy = walletManager.remittance('IN Bank', 'JP Bank', 55000, 99500, 'Return funds', '2026-11-09');
                assert('T2-05', 'INR -> JPY international transfer succeeds', resInrJpy === true);
                assert('T2-06', 'INR Source debited exact sent amount', storage.state.wallets['IN Bank'].balance === 120000);
                assert('T2-07', 'JPY Dest credited exact received amount', storage.state.wallets['JP Bank'].balance === 299500);

                // Test 2.3: JPY -> EUR (e.g. ¥160,000 -> €1,000.50)
                const resJpyEur = walletManager.remittance('JP Bank', 'DE Checking', 160000, 1000.50, 'Tuition payment', '2026-11-10');
                assert('T2-08', 'JPY -> EUR international transfer succeeds', resJpyEur === true);
                assert('T2-09', 'JPY Source debited exact sent amount', storage.state.wallets['JP Bank'].balance === 139500);
                assert('T2-10', 'EUR Dest credited exact received amount', Math.abs(storage.state.wallets['DE Checking'].balance - 5000.50) < 1e-6);

                // Test 2.4: EUR -> JPY (e.g. €1,000 -> ¥159,800)
                const resEurJpy = walletManager.remittance('DE Checking', 'JP Bank', 1000, 159800, 'Living expense refund', '2026-11-11');
                assert('T2-11', 'EUR -> JPY international transfer succeeds', resEurJpy === true);
                assert('T2-12', 'EUR Source debited exact sent amount', Math.abs(storage.state.wallets['DE Checking'].balance - 4000.50) < 1e-6);
                assert('T2-13', 'JPY Dest credited exact received amount', storage.state.wallets['JP Bank'].balance === 299300);

                // Test 2.5: INR -> EUR (e.g. ₹90,000 -> €980.25)
                const resInrEur = walletManager.remittance('IN Bank', 'DE Checking', 90000, 980.25, 'Consulting transfer', '2026-11-12');
                assert('T2-12', 'INR -> EUR international transfer succeeds', resInrEur === true);
                assert('T2-13', 'INR Source debited exact sent amount', storage.state.wallets['IN Bank'].balance === 30000);
                assert('T2-14', 'EUR Dest credited exact received amount', Math.abs(storage.state.wallets['DE Checking'].balance - 4980.75) < 1e-6);

                // Test 2.6: EUR -> INR (e.g. €500 -> ₹45,500.50)
                const resEurInr = walletManager.remittance('DE Checking', 'IN Bank', 500, 45500.50, 'Support payment', '2026-11-13');
                assert('T2-15', 'EUR -> INR international transfer succeeds', resEurInr === true);
                assert('T2-16', 'EUR Source debited exact sent amount', Math.abs(storage.state.wallets['DE Checking'].balance - 4480.75) < 1e-6);
                assert('T2-17', 'INR Dest credited exact received amount', Math.abs(storage.state.wallets['IN Bank'].balance - 75500.50) < 1e-6);

                // Test 2.7: International Validation - same currency rejected
                const resRemSameCur = walletManager.remittance('JP Bank', 'JP Cash', 10000, 10000, 'Same currency remittance');
                assert('T2-18', 'International transfer rejects same currency accounts', resRemSameCur === false);

                // Test 2.8: Precision validation on international transfer
                const resRemJpyDec = walletManager.remittance('JP Bank', 'DE Checking', 1000.5, 6.25, 'JPY decimal sent');
                assert('T2-19', 'International transfer rejects invalid JPY sent precision', resRemJpyDec === false);

                const resRemEurDec3 = walletManager.remittance('DE Checking', 'JP Bank', 50.123, 8000, 'EUR 3 decimal sent');
                assert('T2-20', 'International transfer rejects invalid EUR sent precision (>2 dec)', resRemEurDec3 === false);

                // Test 2.9: Reversal on international transfer delete
                const txToDelete = storage.state.transactions.find(t => t.type === 'remittance' && t.sourceId === 'DE Checking' && t.destId === 'IN Bank');
                const deBalPre = storage.state.wallets['DE Checking'].balance;
                const inBalPre = storage.state.wallets['IN Bank'].balance;
                const delRemRes = walletManager.deleteTransaction(txToDelete.id);
                assert('T2-21', 'International transfer deletion succeeds', delRemRes === true);
                assert('T2-22', 'EUR Source wallet balance restored (+€500)', Math.abs(storage.state.wallets['DE Checking'].balance - (deBalPre + 500)) < 1e-6);
                assert('T2-23', 'INR Dest wallet balance reverted (-₹45,500.50)', Math.abs(storage.state.wallets['IN Bank'].balance - (inBalPre - 45500.50)) < 1e-6);

                // =========================================================================
                // 3. PURE PREVIEW FUNCTION & ATOMIC ROLLBACK SAFETY
                // =========================================================================
                setupCleanTestState();

                // Test 3.1: getTransferPreview is pure and has zero side effects
                const stateSnapshotBefore = JSON.stringify(storage.state);
                const prevValid = walletManager.getTransferPreview('transfer', 'JP Bank', 'JP Cash', 50000);
                assert('T3-01', 'Transfer preview reports valid: true for valid input', prevValid.valid === true);
                assert('T3-02', 'Transfer preview calculates source new balance accurately', prevValid.source.newBalance === 250000);
                assert('T3-03', 'Transfer preview calculates dest new balance accurately', prevValid.dest.newBalance === 100000);
                assert('T3-04', 'Transfer preview leaves storage.state completely untouched', JSON.stringify(storage.state) === stateSnapshotBefore);

                // Test 3.2: getTransferPreview international rates
                const prevRem = walletManager.getTransferPreview('remittance', 'JP Bank', 'DE Checking', 160000, 1000);
                assert('T3-05', 'Remittance preview reports valid: true', prevRem.valid === true);
                assert('T3-06', 'Remittance preview formats effective rate chip string', prevRem.effectiveRate === 0.00625 && prevRem.rateFormatted.includes('1 ¥ ='));

                // Test 3.3: updateTransaction atomic rollback safety on invalid edit
                const origTxRes = walletManager.transfer('JP Bank', 'JP Cash', 15000, 'Original transfer', '2026-11-14');
                const testTx = storage.state.transactions[0];
                const srcBalBeforeEdit = storage.state.wallets['JP Bank'].balance;
                const dstBalBeforeEdit = storage.state.wallets['JP Cash'].balance;

                // Attempt invalid update (e.g. invalid precision decimal on JPY)
                const invalidUpdateRes = walletManager.updateTransaction(testTx.id, {{ amount: 20000.50 }});
                assert('T3-07', 'Invalid transaction update is rejected', invalidUpdateRes === false);
                assert('T3-08', 'Source wallet balance unchanged after failed update', storage.state.wallets['JP Bank'].balance === srcBalBeforeEdit);
                assert('T3-09', 'Dest wallet balance unchanged after failed update', storage.state.wallets['JP Cash'].balance === dstBalBeforeEdit);
                assert('T3-10', 'Original transaction amount untouched after failed update', testTx.amount === 15000);

                // Attempt valid update
                const validUpdateRes = walletManager.updateTransaction(testTx.id, {{ amount: 25000 }});
                assert('T3-11', 'Valid transaction update succeeds', validUpdateRes === true);
                assert('T3-12', 'Source wallet debited for additional 10000', storage.state.wallets['JP Bank'].balance === srcBalBeforeEdit - 10000);
                assert('T3-13', 'Dest wallet credited for additional 10000', storage.state.wallets['JP Cash'].balance === dstBalBeforeEdit + 10000);

                // =========================================================================
                // 4. INDEPENDENT MULTI-COUNTRY BUDGET ROLLOVER ENGINE
                // =========================================================================
                setupCleanTestState();

                // Setup budgets: JP=100,000 (rollover on), IN=50,000 (rollover on), DE=2,500 (rollover off)
                storage.state.budgets.JP = {{ enabled: true, monthlyTotal: 100000, rolloverEnabled: true, carryover: 0 }};
                storage.state.budgets.IN = {{ enabled: true, monthlyTotal: 50000, rolloverEnabled: true, carryover: 0 }};
                storage.state.budgets.DE = {{ enabled: true, monthlyTotal: 2500, rolloverEnabled: false, carryover: 0 }};
                storage.state.currentMonthKey = '2026-11';

                // Add expenses in November:
                // JP: spent 75,000 (unspent 25,000)
                walletManager.addExpense('JP Bank', 'food', 75000, 'Groceries & Dining', '2026-11-15');
                // IN: spent 60,000 (overspent by 10,000 -> rollover should be 0, never negative)
                walletManager.addExpense('IN Bank', 'rent', 60000, 'House Rent', '2026-11-16');
                // DE: spent 1,800 (unspent 700, but rollover disabled -> rollover should be 0)
                walletManager.addExpense('DE Checking', 'living', 1800, 'Supermarket', '2026-11-17');

                assert('T4-01', 'Initial JP carryover is 0', storage.getCarryover('JP') === 0);
                assert('T4-02', 'Initial JP total available is base monthlyTotal (100,000)', storage.getTotalAvailableBudget('JP') === 100000);

                // Close month
                storage.closeCurrentMonth('Monthly Audit Close');
                assert('T4-03', 'Closed month 2026-11 recorded in closedMonths', Boolean(storage.state.closedMonths['2026-11']));
                const closedSnap = storage.state.closedMonths['2026-11'];
                assert('T4-04', 'Snapshot records JP base budget', closedSnap.JPTotalBudget === 100000);
                assert('T4-05', 'Snapshot records JP spent amount 75,000', closedSnap.JPSpent === 75000);
                assert('T4-06', 'Snapshot records JP rollover added 25,000', closedSnap.JPRolloverAdded === 25000);
                assert('T4-07', 'Snapshot records IN overspending resulting in 0 rollover', closedSnap.INRolloverAdded === 0);
                assert('T4-08', 'Snapshot records DE rollover added 0 when disabled', closedSnap.DERolloverAdded === 0);

                // Verify state carries forward to subsequent month
                assert('T4-09', 'JP carryover updated to 25,000', storage.getCarryover('JP') === 25000);
                assert('T4-10', 'JP recurring base monthlyTotal stays constant (100,000)', storage.getTotalBudget('JP') === 100000);
                assert('T4-11', 'JP total available budget is 125,000 (base + carryover)', storage.getTotalAvailableBudget('JP') === 125000);
                assert('T4-12', 'IN carryover remains 0 after overspending', storage.getCarryover('IN') === 0);
                assert('T4-13', 'DE carryover remains 0 when rollover disabled', storage.getCarryover('DE') === 0);

                // Test subsequent month spending against rollover cushion
                // In December 2026:
                storage.state.currentMonthKey = '2026-12';
                // Spend 110,000 in December:
                walletManager.addExpense('JP Bank', 'travel', 110000, 'Year end holiday', '2026-12-20');
                // Total available was 125,000. Spent 110,000. Unspent = 15,000.
                storage.closeCurrentMonth('December Close');
                const decSnap = storage.state.closedMonths['2026-12'];
                assert('T4-14', 'December snapshot prior carryover is 25,000', decSnap.JPCarryoverPrior === 25000);
                assert('T4-15', 'December rollover correctly carries remaining 15,000 cushion', decSnap.JPRolloverAdded === 15000);
                assert('T4-16', 'January carryover is 15,000', storage.getCarryover('JP') === 15000);

                // Test disabling rollover wipes carryover safely
                storage.setBudgetEnabled('JP', true, 100000, false);
                assert('T4-17', 'Disabling rollover resets carryover to 0', storage.getCarryover('JP') === 0);
                assert('T4-18', 'Total available returns to base budget', storage.getTotalAvailableBudget('JP') === 100000);

                // =========================================================================
                // 5. WALLET RENDERING & EVENT SECURITY (XSS & INJECTION PROTECTION)
                // =========================================================================
                setupCleanTestState();

                // Add wallet with quotes, apostrophes, and HTML tags
                const maliciousWalletId = 'O\\'Connor "Offshore" <script>alert(1)<\\/script> & Co';
                storage.state.wallets[maliciousWalletId] = {{
                    id: maliciousWalletId,
                    type: 'savings',
                    region: 'JP',
                    balance: 777000,
                    currency: '¥',
                    color: '#10b981',
                    theme: 'emerald-salary'
                }};
                storage.saveData();

                // Render wallets page
                app.renderWallets();
                app.renderWalletsPage();

                const walletOptionHtml = app.getWalletOptionsHtml();
                assert('T5-01', 'Wallet options dropdown escapes <script> tag', !walletOptionHtml.includes('<script>alert(1)</script>'));
                assert('T5-02', 'Wallet options dropdown contains escaped &lt;script&gt;', walletOptionHtml.includes('&lt;script&gt;'));
                assert('T5-03', 'Wallet options dropdown escapes quotes', walletOptionHtml.includes('&quot;Offshore&quot;'));

                // Verify DOM card in Wallets page
                const jpWalletsGrid = document.getElementById('wallets-page-jp-grid');
                assert('T5-04', 'Wallets grid container rendered', Boolean(jpWalletsGrid));
                const dangerousCard = Array.from(document.querySelectorAll('.wallet-card[data-wallet-id]'))
                    .find(el => el.getAttribute('data-wallet-id') === maliciousWalletId);
                assert('T5-05', 'Wallet card uses safe data-wallet-id attribute', Boolean(dangerousCard));
                assert('T5-06', 'Wallet card does not contain unescaped raw script elements', dangerousCard ? dangerousCard.querySelectorAll('script').length === 0 : false);

                // Verify click event delegation works on wallet card without inline onclick eval error
                let openedWalletId = null;
                const origOpenFocus = app.openWalletFocus.bind(app);
                app.openWalletFocus = (wId) => {{
                    openedWalletId = wId;
                }};

                if (dangerousCard) dangerousCard.click();
                assert('T5-07', 'Event delegation safely routed wallet click with special characters', openedWalletId === maliciousWalletId);
                app.openWalletFocus = origOpenFocus;

                // =========================================================================
                // 6. PRODUCTION FIXTURE GUARANTEE & HISTORICAL LEDGER SAFETY
                // =========================================================================
                if (prodData && prodData.transactions) {{
                    const sProd = new StorageManager();
                    const prev = sProd.previewContinuousLedgerMigration(prodData);
                    assert('T6-01', 'Production fixture migration succeeds', prev.success === true);
                    assert('T6-02', 'Exact 116 transactions preserved', prev.migratedState.transactions.length === 116);
                    assert('T6-03', 'All 6 wallets preserved', Object.keys(prev.migratedState.wallets).length === 6);
                    assert('T6-04', 'Historical July 31 transaction (1785519182944) preserved', prev.migratedState.transactions.some(t => String(t.id) === '1785519182944'));
                    assert('T6-05', 'Historical October 31 transactions preserved', prev.migratedState.transactions.some(t => String(t.id) === '1793462624420'));
                    assert('T6-06', 'Budgets initialized with carryover: 0', prev.migratedState.budgets.JP.carryover === 0 && prev.migratedState.budgets.IN.carryover === 0);
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

            print(f"\nTotal Financial Checks Executed: {len(checks)}")
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

            # -------------------------------------------------------------------------
            # 3. Interactive DOM Modal & Preview UI Testing with Screenshots
            # -------------------------------------------------------------------------
            print("\n--- Testing UI Live Preview Card & Capturing Artifact Screenshots ---")

            ui_script = """
            (() => {
                // Prepare clean tri-country state with rollover cushion for screenshots
                window.localStorage.clear();
                storage.state = JSON.parse(JSON.stringify(defaultState));
                storage.state.preferences = {
                    version: 1,
                    activeCountries: ['JP', 'IN', 'DE'],
                    defaultCountry: 'JP',
                    onboardingCompleted: true,
                    onboardingStep: 4,
                    tourCompleted: true,
                    tourDismissed: true
                };
                storage.state.budgets = {
                    JP: { enabled: true, monthlyTotal: 150000, rolloverEnabled: true, carryover: 18500 },
                    IN: { enabled: true, monthlyTotal: 65000, rolloverEnabled: true, carryover: 6200 },
                    DE: { enabled: true, monthlyTotal: 3000, rolloverEnabled: true, carryover: 450 }
                };
                storage.state.wallets = {
                    'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 420000, currency: '¥', color: '#10b981', theme: 'emerald-salary' },
                    'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 35000, currency: '¥', color: '#f59e0b', theme: 'amber-gold' },
                    'HDFC Bank': { id: 'HDFC Bank', type: 'bank', region: 'IN', balance: 185000, currency: '₹', color: '#0ea5e9', theme: 'cobalt-card' },
                    'Deutsche Bank': { id: 'Deutsche Bank', type: 'bank', region: 'DE', balance: 5200, currency: '€', color: '#3b82f6', theme: 'frankfurt-slate' }
                };
                storage.state.currentMonthKey = '2026-11';
                storage.accountStatus = 'EXISTING_USER';
                app.isPrivacyHidden = false;
                storage.saveData();
                app.renderAll();
                app.switchView('dashboard');
                return true;
            })();
            """
            await send("Runtime.evaluate", {"expression": ui_script, "awaitPromise": True})
            await asyncio.sleep(0.5)

            # Capture Dashboard with Rollover Cushion badge
            await capture_screen("phase5_budget_rollover_cushion.png")

            # Open Domestic Transfer Modal and populate values
            modal_domestic_script = """
            (() => {
                app.openTransactionModal('transfer');
                const srcSelect = document.getElementById('tx-source');
                const dstSelect = document.getElementById('tx-dest');
                const amtInput = document.getElementById('tx-amount');
                if (srcSelect && dstSelect && amtInput) {
                    srcSelect.value = 'Salary Account';
                    app.onTransferSourceChange();
                    dstSelect.value = 'Cash';
                    amtInput.value = '45000';
                    app.updateTransferPreview('transfer');
                }
                return true;
            })();
            """
            await send("Runtime.evaluate", {"expression": modal_domestic_script, "awaitPromise": True})
            await asyncio.sleep(0.5)
            await capture_screen("phase5_domestic_transfer_modal.png")

            # Close modal and Open International Money Transfer Modal
            modal_remittance_script = """
            (() => {
                app.closeModal('transaction-modal');
                app.openTransactionModal('remittance');
                const srcSelect = document.getElementById('tx-source');
                const dstSelect = document.getElementById('tx-dest');
                const sAmtInput = document.getElementById('tx-source-amount');
                const dAmtInput = document.getElementById('tx-dest-amount');
                if (srcSelect && dstSelect && sAmtInput && dAmtInput) {
                    srcSelect.value = 'Salary Account';
                    app.onRemittanceSourceChange();
                    dstSelect.value = 'Deutsche Bank';
                    app.onRemittanceDestChange();
                    sAmtInput.value = '150000';
                    dAmtInput.value = '945.50';
                    app.updateTransferPreview('remittance');
                }
                return true;
            })();
            """
            await send("Runtime.evaluate", {"expression": modal_remittance_script, "awaitPromise": True})
            await asyncio.sleep(0.5)
            await capture_screen("phase5_international_transfer_modal.png")

            all_passed = (len(failed_checks) == 0 and len(passed_checks) > 0 and all_static_passed)
            if all_passed:
                print("\n" + "=" * 80)
                print("🎉 ALL PHASE 5 FINANCIAL ENGINE & ROLLOVER CHECKS PASSED (100% SUCCESS)!")
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
    success = asyncio.run(run_phase5_tests())
    sys.exit(0 if success else 1)
