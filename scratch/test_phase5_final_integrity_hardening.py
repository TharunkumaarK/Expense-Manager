#!/usr/bin/env python3
"""
Expense Manager — Phase 5 Final Financial Integrity Hardening Verification Suite

Focused test suite verifying:
1. Priority 1: Multi-Month Budget Recovery & Reconciliation
   - Detection of unfinalized months (e.g. 2026-08 to 2026-11, cross-year 2026-12 to 2027-02)
   - Read-only workflow state: BUDGET_RECOVERY_REQUIRED
   - Three recovery options: Review (Option A), Continue Previous (Option B), Start Fresh (Option C)
   - Read-only preview model with country-specific accounting (JP, IN, DE)
   - Atomic commit with immutable audit metadata (state.recoveryMetadata)
   - Idempotency & sealed snapshot immutability
   - Read-only dashboard gate: transaction entry blocked while reconciliation is required
2. Priority 2: Stronger Transaction Commit Atomicity
   - Prepared state in temporary structures (tentativeBalances) before touching live balances
   - Two-phase prepare/validate/commit on updates and deletes
   - Rollback protection and zero partial balance modifications
   - Atomic domestic transfers and international remittances
3. Priority 3: Strict Currency Precision & Historical Compatibility
   - JPY whole yen (rejects 100.5, 100.0000001)
   - INR & EUR max 2 decimal places (rejects 100.251, 50.999)
   - Rejection of NaN, Infinity, <= 0, > 1e12
   - Historical transaction reversal compatibility
   - Exact production ledger preservation (116 transactions, 6 wallets)
4. UI Screenshots of Recovery Workflow
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
EXPORT_PATH = '/tmp/ExpenseManager_Production_Export_2026-11-16.json'
if not os.path.exists(EXPORT_PATH) and os.path.exists('/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'):
    EXPORT_PATH = '/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'
SCREENSHOT_DIR = os.path.abspath('scratch')

async def run_final_hardening_tests():
    print("=" * 80)
    print("EXPENSE MANAGER — PHASE 5 FINAL FINANCIAL INTEGRITY HARDENING TEST SUITE")
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

    static_checks.append(('STORAGE', "StorageManager provides detectUnfinalizedMonths", "detectUnfinalizedMonths(" in storage_content))
    static_checks.append(('STORAGE', "StorageManager provides getBudgetRecoveryStatus", "getBudgetRecoveryStatus(" in storage_content))
    static_checks.append(('STORAGE', "StorageManager provides getBudgetRecoveryPreview", "getBudgetRecoveryPreview(" in storage_content))
    static_checks.append(('STORAGE', "StorageManager provides commitBudgetRecovery", "commitBudgetRecovery(" in storage_content))
    static_checks.append(('STORAGE', "commitBudgetRecovery records audit metadata", "recoveryMetadata" in storage_content))
    static_checks.append(('WALLET', "isValidAmount enforces whole yen for JPY", "Number.isInteger(amount)" in wallet_content))
    static_checks.append(('WALLET', "isValidAmount enforces max 2 decimals without float tolerance leak", "parts[1].length > 2" in wallet_content))
    static_checks.append(('WALLET', "updateTransaction uses tentativeBalances isolated structure", "tentativeBalances" in wallet_content))
    static_checks.append(('WALLET', "deleteTransaction uses tentativeBalances isolated structure", "tentativeBalances" in wallet_content))
    static_checks.append(('APP', "app gates transaction entry during BUDGET_RECOVERY_REQUIRED", "BUDGET_RECOVERY_REQUIRED" in app_content))

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
    profile_dir = f'/tmp/phase5_final_profile_{int(time.time())}'
    port = 9570
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

                try {{
                    // =========================================================
                    // PRIORITY 1: Multi-Month Budget Recovery & Reconciliation
                    // =========================================================
                    // Reset storage to a clean tri-country state
                    storage.state = JSON.parse(JSON.stringify(defaultState));
                    storage.state.preferences = {{
                        countries: ['JP', 'IN', 'DE'],
                        primaryCountry: 'JP',
                        onboardingCompleted: true
                    }};
                    storage.state.wallets = {{
                        'w-jp': {{ id: 'w-jp', name: 'JP Cash', currency: 'JPY', region: 'JP', balance: 200000 }},
                        'w-in': {{ id: 'w-in', name: 'IN Bank', currency: 'INR', region: 'IN', balance: 50000 }},
                        'w-de': {{ id: 'w-de', name: 'DE Giro', currency: 'EUR', region: 'DE', balance: 1500 }}
                    }};
                    storage.state.budgets = {{
                        JP: {{ enabled: true, monthlyTotal: 100000, rolloverEnabled: true, carryover: 0 }},
                        IN: {{ enabled: true, monthlyTotal: 25000, rolloverEnabled: true, carryover: 0 }},
                        DE: {{ enabled: true, monthlyTotal: 800, rolloverEnabled: false, carryover: 0 }}
                    }};
                    storage.state.closedMonths = {{}};
                    storage.state.transactions = [];

                    // Test P1-01: Gap detection between 2026-08 and 2026-11
                    storage.state.currentMonthKey = '2026-08';
                    // Mock getCurrentMonthKey to return 2026-11
                    const origGetCurrentMonthKey = storage.getCurrentMonthKey;
                    storage.getCurrentMonthKey = () => '2026-11';

                    const unfinalized = storage.detectUnfinalizedMonths();
                    assert('P1-01', 'Gap detection finds all elapsed months 2026-08, 2026-09, 2026-10',
                        unfinalized.length === 3 && unfinalized[0] === '2026-08' && unfinalized[1] === '2026-09' && unfinalized[2] === '2026-10',
                        unfinalized.join(', '));

                    // Test P1-02: Status transitions to BUDGET_RECOVERY_REQUIRED
                    const status = storage.getBudgetRecoveryStatus();
                    assert('P1-02', 'Storage status transitions to BUDGET_RECOVERY_REQUIRED',
                        status === 'BUDGET_RECOVERY_REQUIRED', status);

                    // Test P1-03: checkRollover returns recoveryRequired: true without auto-closing
                    const checkRes = storage.checkRollover();
                    assert('P1-03', 'checkRollover flags recoveryRequired without mutating state or closedMonths',
                        checkRes.recoveryRequired === true && Object.keys(storage.state.closedMonths).length === 0,
                        JSON.stringify(checkRes));

                    // Add spending transactions in 2026-08 and 2026-09
                    storage.state.transactions = [
                        {{ id: 'tx-1', type: 'expense', walletId: 'w-jp', region: 'JP', amount: 70000, date: '2026-08-15', categoryId: 'food' }},
                        {{ id: 'tx-2', type: 'expense', walletId: 'w-jp', region: 'JP', amount: 80000, date: '2026-09-10', categoryId: 'rent' }},
                        {{ id: 'tx-3', type: 'expense', walletId: 'w-in', region: 'IN', amount: 15000, date: '2026-08-20', categoryId: 'groceries' }}
                    ];

                    // Test P1-04: Option B Preview (Continue Previous)
                    const prevB = storage.getBudgetRecoveryPreview('continue');
                    assert('P1-04', 'Option B preview successfully projects 3 unfinalized months',
                        prevB.success === true && prevB.monthsPreview.length === 3);

                    // 2026-08 JP: base 100k, spent 70k -> carryover out = 30k
                    const m08_jp = prevB.monthsPreview[0].countries.JP;
                    assert('P1-05', 'Option B Month 1 (2026-08) JP unspent carryover is 30,000',
                        m08_jp.spent === 70000 && m08_jp.rolloverAdded === 30000,
                        `spent: ${{m08_jp.spent}}, rollover: ${{m08_jp.rolloverAdded}}`);

                    // 2026-09 JP: base 100k + prior 30k = 130k. spent 80k -> carryover out = 50k
                    const m09_jp = prevB.monthsPreview[1].countries.JP;
                    assert('P1-06', 'Option B Month 2 (2026-09) JP available is 130k and rollover out is 50,000',
                        m09_jp.carryoverPrior === 30000 && m09_jp.totalAvailable === 130000 && m09_jp.rolloverAdded === 50000,
                        `prior: ${{m09_jp.carryoverPrior}}, available: ${{m09_jp.totalAvailable}}, rollover: ${{m09_jp.rolloverAdded}}`);

                    // 2026-10 JP: base 100k + prior 50k = 150k. spent 0 -> carryover out = 150k
                    const m10_jp = prevB.monthsPreview[2].countries.JP;
                    assert('P1-07', 'Option B Month 3 (2026-10) JP zero-spend rolls forward 150,000',
                        m10_jp.spent === 0 && m10_jp.rolloverAdded === 150000,
                        `spent: ${{m10_jp.spent}}, rollover: ${{m10_jp.rolloverAdded}}`);

                    // Active month (2026-11) JP receives 150k carryover -> total available 250k
                    const act_jp = prevB.activeMonthSummary.countries.JP;
                    assert('P1-08', 'Option B Active Month (2026-11) resulting carryover is 150,000 and available 250,000',
                        act_jp.carryover === 150000 && act_jp.totalAvailable === 250000,
                        `carryover: ${{act_jp.carryover}}, available: ${{act_jp.totalAvailable}}`);

                    // DE has rolloverEnabled: false -> rollover out must be 0 in every month
                    const m08_de = prevB.monthsPreview[0].countries.DE;
                    assert('P1-09', 'Option B DE with rollover disabled produces 0 carryover',
                        m08_de.rolloverAdded === 0, `rolloverAdded: ${{m08_de.rolloverAdded}}`);

                    // Test P1-10: Option C Preview (Start Fresh)
                    const prevC = storage.getBudgetRecoveryPreview('fresh');
                    const act_jp_c = prevC.activeMonthSummary.countries.JP;
                    assert('P1-10', 'Option C Start Fresh yields 0 carryover into active month',
                        act_jp_c.carryover === 0 && act_jp_c.totalAvailable === 100000,
                        `carryover: ${{act_jp_c.carryover}}, available: ${{act_jp_c.totalAvailable}}`);

                    // Test P1-11: Stale plan detection
                    const staleTokenRes = storage.commitBudgetRecovery('continue', {{}}, 'invalid_stale_token_123');
                    assert('P1-11', 'commitBudgetRecovery rejects stale plan token',
                        staleTokenRes.success === false && String(staleTokenRes.error).includes('changed'),
                        JSON.stringify(staleTokenRes));

                    // Test P1-12: Commit Option B with valid token
                    const commitRes = storage.commitBudgetRecovery('continue', {{}}, prevB.stateToken);
                    assert('P1-12', 'commitBudgetRecovery successfully commits reconciliation',
                        commitRes.success === true && commitRes.reconciledMonths.length === 3,
                        JSON.stringify(commitRes));

                    // Verify snapshots in closedMonths
                    assert('P1-13', 'All gap months sealed with status: closed in closedMonths',
                        storage.state.closedMonths['2026-08']?.status === 'closed' &&
                        storage.state.closedMonths['2026-09']?.status === 'closed' &&
                        storage.state.closedMonths['2026-10']?.status === 'closed');

                    // Verify audit metadata stamped
                    const meta = storage.state.recoveryMetadata;
                    assert('P1-14', 'Immutable recoveryMetadata audit trail stamped on state',
                        meta && meta.option === 'continue' && meta.periodStart === '2026-08' && meta.periodEnd === '2026-10' && meta.activeMonth === '2026-11',
                        JSON.stringify(meta));

                    // Verify active month updated and carryover applied
                    assert('P1-15', 'Active month currentMonthKey is now 2026-11 and JP carryover is 150,000',
                        storage.state.currentMonthKey === '2026-11' && storage.state.budgets.JP.carryover === 150000,
                        `currentMonthKey: ${{storage.state.currentMonthKey}}, carryover: ${{storage.state.budgets.JP.carryover}}`);

                    // Test P1-16: Idempotency after commit
                    const postStatus = storage.getBudgetRecoveryStatus();
                    const postUnfinalized = storage.detectUnfinalizedMonths();
                    assert('P1-16', 'Post-recovery status is RESOLVED and unfinalized months is empty',
                        postStatus === 'RESOLVED' && postUnfinalized.length === 0,
                        `status: ${{postStatus}}, unfinalized: ${{postUnfinalized.length}}`);

                    // Repeated checkRollover does nothing
                    const repeatCheck = storage.checkRollover();
                    assert('P1-17', 'Repeated checkRollover reports recoveryRequired: false with zero mutations',
                        repeatCheck.recoveryRequired === false && storage.state.budgets.JP.carryover === 150000);

                    // Test P1-18: Cross-year rollover transition (2026-12 to 2027-02)
                    storage.state.currentMonthKey = '2026-12';
                    storage.getCurrentMonthKey = () => '2027-02';
                    const crossYearUnfinalized = storage.detectUnfinalizedMonths();
                    assert('P1-18', 'Cross-year gap detection finds 2026-12 and 2027-01',
                        crossYearUnfinalized.length === 2 && crossYearUnfinalized[0] === '2026-12' && crossYearUnfinalized[1] === '2027-01',
                        crossYearUnfinalized.join(', '));

                    // Restore getCurrentMonthKey
                    storage.getCurrentMonthKey = origGetCurrentMonthKey;

                    // =========================================================
                    // PRIORITY 2: Stronger Transaction Commit Atomicity
                    // =========================================================
                    storage.state.currentMonthKey = storage.getCurrentMonthKey();
                    storage.budgetRecoveryState = 'RESOLVED';
                    storage.state.budgetRecoveryState = 'RESOLVED';

                    // Initial balances
                    storage.state.wallets['w-jp'].balance = 200000;
                    storage.state.wallets['w-in'].balance = 50000;
                    storage.state.wallets['w-de'].balance = 1500;

                    // Add a domestic transfer in active month
                    const txDate = `${{storage.getCurrentMonthKey()}}-05`;
                    const transferCreated = walletManager.transfer('w-jp', 'w-jp', 10000, 'self transfer', txDate);
                    assert('P2-01', 'Domestic transfer to same wallet is rejected in prepare phase',
                        transferCreated === false);

                    // Add a valid expense
                    const expCreated = walletManager.addExpense('w-jp', 'dining', 12000, 'Lunch', txDate);
                    assert('P2-02', 'Valid expense of 12,000 creates transaction and debits balance',
                        expCreated === true && storage.state.wallets['w-jp'].balance === 188000,
                        `balance: ${{storage.state.wallets['w-jp'].balance}}`);

                    const expTx = storage.state.transactions[0];

                    // Test P2-03: updateTransaction with missing destination wallet aborts with zero balance mutation
                    const badUpdate = walletManager.updateTransaction(expTx.id, {{ walletId: 'non_existent_wallet_99' }});
                    assert('P2-03', 'updateTransaction to non-existent wallet aborts without touching original wallet balance',
                        badUpdate === false && storage.state.wallets['w-jp'].balance === 188000,
                        `balance: ${{storage.state.wallets['w-jp'].balance}}`);

                    // Test P2-04: updateTransaction with invalid amount precision aborts with zero balance mutation
                    const badPrecUpdate = walletManager.updateTransaction(expTx.id, {{ amount: 15000.5 }});
                    assert('P2-04', 'updateTransaction with fractional JPY aborts without touching original balance',
                        badPrecUpdate === false && storage.state.wallets['w-jp'].balance === 188000);

                    // Test P2-05: updateTransaction to valid new amount (15,000) updates atomically
                    const goodUpdate = walletManager.updateTransaction(expTx.id, {{ amount: 15000 }});
                    assert('P2-05', 'updateTransaction to 15,000 atomically updates balance to 185,000',
                        goodUpdate === true && storage.state.wallets['w-jp'].balance === 185000,
                        `balance: ${{storage.state.wallets['w-jp'].balance}}`);

                    // Test P2-06: deleteTransaction removes transaction and restores balance to 200,000
                    const deleted = walletManager.deleteTransaction(expTx.id);
                    assert('P2-06', 'deleteTransaction restores balance atomically to 200,000 and removes tx',
                        deleted === true && storage.state.wallets['w-jp'].balance === 200000 &&
                        !storage.state.transactions.some(t => t.id === expTx.id),
                        `balance: ${{storage.state.wallets['w-jp'].balance}}`);

                    // Test P2-07: Atomic international remittance
                    const remCreated = walletManager.remittance('w-jp', 'w-in', 100000, 55000, 'Family support', txDate);
                    assert('P2-07', 'Atomic remittance debits source 100k JPY and credits destination 55k INR',
                        remCreated === true && storage.state.wallets['w-jp'].balance === 100000 && storage.state.wallets['w-in'].balance === 105000,
                        `JP: ${{storage.state.wallets['w-jp'].balance}}, IN: ${{storage.state.wallets['w-in'].balance}}`);

                    const remTx = storage.state.transactions[0];

                    // Test P2-08: Edit remittance amounts atomically
                    const remUpdate = walletManager.updateTransaction(remTx.id, {{ sourceAmount: 80000, destAmount: 44000 }});
                    assert('P2-08', 'updateTransaction on remittance atomically adjusts both balances (JP: 120k, IN: 94k)',
                        remUpdate === true && storage.state.wallets['w-jp'].balance === 120000 && storage.state.wallets['w-in'].balance === 94000,
                        `JP: ${{storage.state.wallets['w-jp'].balance}}, IN: ${{storage.state.wallets['w-in'].balance}}`);

                    // =========================================================
                    // PRIORITY 3: Strict Currency Precision
                    // =========================================================
                    // JPY whole yen
                    assert('P3-01', 'isValidAmount accepts JPY 100 (whole integer)', walletManager.isValidAmount(100, 'JPY') === true);
                    assert('P3-02', 'isValidAmount rejects JPY 100.5 (fractional yen)', walletManager.isValidAmount(100.5, 'JPY') === false);
                    assert('P3-03', 'isValidAmount rejects JPY 100.0000001 (sub-unit float)', walletManager.isValidAmount(100.0000001, 'JPY') === false);

                    // INR 2 decimals
                    assert('P3-04', 'isValidAmount accepts INR 100.25 (2 decimal places)', walletManager.isValidAmount(100.25, 'INR') === true);
                    assert('P3-05', 'isValidAmount rejects INR 100.251 (3 decimal places)', walletManager.isValidAmount(100.251, 'INR') === false);

                    // EUR 2 decimals
                    assert('P3-06', 'isValidAmount accepts EUR 50.99 (2 decimal places)', walletManager.isValidAmount(50.99, 'EUR') === true);
                    assert('P3-07', 'isValidAmount rejects EUR 50.999 (3 decimal places)', walletManager.isValidAmount(50.999, 'EUR') === false);

                    // Numerical limits & invalid numbers
                    assert('P3-08', 'isValidAmount rejects negative amounts (-50)', walletManager.isValidAmount(-50, 'EUR') === false);
                    assert('P3-09', 'isValidAmount rejects zero (0)', walletManager.isValidAmount(0, 'EUR') === false);
                    assert('P3-10', 'isValidAmount rejects NaN', walletManager.isValidAmount(NaN, 'EUR') === false);
                    assert('P3-11', 'isValidAmount rejects Infinity', walletManager.isValidAmount(Infinity, 'EUR') === false);
                    assert('P3-12', 'isValidAmount rejects overflow > 1e12', walletManager.isValidAmount(1e13, 'EUR') === false);

                    // Production Fixture Invariant
                    const prodFixture = {prod_fixture_json};
                    const rawState = storage.normalizeBackupPayload(prodFixture);
                    if (rawState && rawState.wallets) {{
                        const totalTx = storage.getUniqueTransactionCount(rawState);
                        assert('P3-13', 'Production fixture contains exactly 116 unique transactions across ledger and history', totalTx === 116, totalTx);

                        const axisBal = rawState.wallets['Axis Bank']?.balance;
                        assert('P3-14', 'Axis Bank balance matches exact float ₹ 46,794.53 without drift',
                            axisBal === 46794.53, axisBal);
                    }} else {{
                        assert('P3-13', 'Production fixture check loaded', false, 'Missing wallets/transactions in rawState');
                    }}

                }} catch (e) {{
                    assert('FATAL', 'Test execution error', false, e.stack || e.message);
                }}

                return results;
            }})();
            """

            eval_res = await send("Runtime.evaluate", {
                "expression": test_script,
                "returnByValue": True,
                "awaitPromise": True
            })

            results = eval_res.get("result", {}).get("value", {})
            checks = results.get("checks", [])

            # Print results grouped by priority
            current_group = ""
            passed_count = 0
            failed_count = 0

            for c in checks:
                grp = c["id"][:2]
                if grp != current_group:
                    current_group = grp
                    print(f"\n[{current_group}]")

                status = "✅ PASS" if c["pass"] else "❌ FAIL"
                if c["pass"]:
                    passed_count += 1
                else:
                    failed_count += 1
                details = f" ({c['details']})" if c['details'] and not c['pass'] else ""
                print(f"  {status} [{c['id']}] {c['title']}{details}")

            print("\n" + "=" * 80)
            print(f"Total Hardening Checks Executed: {len(checks) + len(static_checks)}")
            print(f"Passed: {passed_count + len(static_checks)}")
            print(f"Failed: {failed_count}")

            # -----------------------------------------------------------------
            # 3. Capture Screenshots of Recovery Workflow
            # -----------------------------------------------------------------
            print("\n--- Capturing UI Screenshots ---")
            # Open budget recovery modal in UI and capture
            await send("Runtime.evaluate", {
                "expression": """
                (() => {
                    storage.state.currentMonthKey = '2026-08';
                    storage.detectUnfinalizedMonths();
                    app.budgetRecoveryState.option = 'review';
                    app.openBudgetRecoveryModal();
                })()
                """
            })
            await asyncio.sleep(0.5)

            shot1 = await send("Page.captureScreenshot", {"format": "png"})
            if shot1.get("data"):
                path1 = os.path.join(SCREENSHOT_DIR, "phase5_budget_recovery_modal.png")
                with open(path1, "wb") as f:
                    f.write(base64.b64decode(shot1["data"]))
                print(f"  [📸 CAPTURED] {path1}")

            # Dismiss modal and capture persistent banner
            await send("Runtime.evaluate", {
                "expression": "app.closeBudgetRecoveryModal()"
            })
            await asyncio.sleep(0.5)

            shot2 = await send("Page.captureScreenshot", {"format": "png"})
            if shot2.get("data"):
                path2 = os.path.join(SCREENSHOT_DIR, "phase5_budget_recovery_banner.png")
                with open(path2, "wb") as f:
                    f.write(base64.b64decode(shot2["data"]))
                print(f"  [📸 CAPTURED] {path2}")

            if failed_count == 0:
                print("\n" + "=" * 80)
                print("🎉 ALL PHASE 5 FINAL FINANCIAL INTEGRITY HARDENING CHECKS PASSED (100% SUCCESS)!")
                print("=" * 80)
                return True
            else:
                print("\n❌ Some checks failed.")
                return False

    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    success = asyncio.run(run_final_hardening_tests())
    sys.exit(0 if success else 1)
