/**
 * EXPENSE MANAGER — PHASE 1 FINAL CORRECTIONS BEHAVIORAL VERIFICATION SUITE
 * 
 * Verifies the 5 Phase 1 Final Corrections:
 * 1. Remittance display across all 4 supported currency pairs (JPY->INR, EUR->INR, JPY->EUR, INR->JPY)
 * 2. Transfer terminology: "Transfer Between Accounts" matching same-currency validation
 * 3. First-use CTA opens unified transaction selector (Dashboard & Continuous Ledger)
 * 4. Distinct Budget states: Disabled vs Enabled/Unconfigured vs Configured No-Spend vs Spending vs Exceeded
 * 5. Existing transaction functionality preserved
 */

const fs = require('fs');
const vm = require('vm');

let total = 0;
let passed = 0;

function assert(cond, msg) {
    total++;
    if (cond) {
        passed++;
        console.log(`  [PASS] ${msg}`);
    } else {
        console.error(`  [FAIL] ${msg}`);
        throw new Error(`Assertion failed: ${msg}`);
    }
}

// Build mock browser, DOM, storage, and app environment
function createMockEnvironment() {
    const store = {};
    const mockStorage = {
        state: {
            onboardingCompleted: true,
            activeCountries: ['JP', 'IN', 'DE'],
            defaultCountry: 'JP',
            currentMonthKey: '2026-11',
            wallets: {
                'jp-bank': { id: 'jp-bank', name: 'Japan Bank', balance: 300000, region: 'JP', currency: '¥', type: 'bank' },
                'in-bank': { id: 'in-bank', name: 'India Bank', balance: 50000, region: 'IN', currency: '₹', type: 'bank' },
                'de-bank': { id: 'de-bank', name: 'German Bank', balance: 2500, region: 'DE', currency: '€', type: 'bank' }
            },
            budgets: {
                JP: { enabled: true, monthlyTotal: 0, rolloverEnabled: false },
                IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false },
                DE: { enabled: true, monthlyTotal: 1000, rolloverEnabled: false }
            },
            categories: {
                JP: [{ id: 'jp-food', name: 'Food', budget: 30000, isActive: true, contributesToTotalBudget: true }],
                IN: [{ id: 'in-food', name: 'Food', budget: 10000, isActive: true, contributesToTotalBudget: true }],
                DE: [{ id: 'de-food', name: 'Food', budget: 400, isActive: true, contributesToTotalBudget: true }]
            },
            transactions: []
        },
        saveData: () => true,
        getActiveCountries: () => ['JP', 'IN', 'DE'],
        getPrimaryCountry: () => 'JP',
        isBudgetEnabled: (region) => Boolean(mockStorage.state.budgets?.[region]?.enabled),
        getTotalBudget: (region) => Number(mockStorage.state.budgets?.[region]?.monthlyTotal || 0),
        getCarryover: () => 0,
        getBudgetRecoveryStatus: () => 'HEALTHY'
    };

    const mockElement = (id = '') => ({
        id,
        style: {},
        classList: {
            add: () => { },
            remove: () => { },
            contains: () => false,
            toggle: () => { }
        },
        setAttribute: () => { },
        removeAttribute: () => { },
        innerText: '',
        innerHTML: '',
        value: '',
        options: [],
        children: [],
        querySelector: () => mockElement(),
        querySelectorAll: () => []
    });

    const mockDocument = {
        getElementById: (id) => mockElement(id),
        querySelector: () => mockElement(),
        querySelectorAll: () => [],
        createElement: (tag) => mockElement(tag),
        body: mockElement('body')
    };

    const context = {
        console,
        window: {
            addEventListener: () => { },
            WALLET_THEMES: [{ id: 'emerald-salary', name: 'Emerald', color: '#10b981' }],
            lucide: { createIcons: () => { } }
        },
        document: mockDocument,
        localStorage: {
            getItem: (k) => store[k] || null,
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
            clear: () => { Object.keys(store).forEach(k => delete store[k]); }
        },
        storage: mockStorage,
        setTimeout: (fn) => fn(),
        clearTimeout: () => { },
        CountryConfig: {
            get: (reg) => ({ name: reg, currency: reg === 'JP' ? '¥' : reg === 'DE' ? '€' : '₹' })
        }
    };

    vm.createContext(context);
    const walletCode = fs.readFileSync('js/wallet.js', 'utf8');
    const appCode = fs.readFileSync('js/app.js', 'utf8');
    vm.runInContext(walletCode, context);
    vm.runInContext(appCode, context);

    return context;
}

function runBehavioralTests() {
    console.log("================================================================================");
    console.log("EXPENSE MANAGER — PHASE 1 FINAL CORRECTIONS BEHAVIORAL SUITE");
    console.log("================================================================================");

    const ctx = createMockEnvironment();
    const app = ctx.window.app || ctx.app;
    const wm = ctx.window.walletManager || ctx.walletManager;
    app.isPrivacyHidden = false;

    // -------------------------------------------------------------------------
    // TEST 1: Currency-Specific Remittance Display Across Supported Pairs
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 1: Remittance Multi-Currency Formatting ---");

    // Pair 1: JPY -> INR
    const txJpyInr = {
        type: 'remittance',
        sourceId: 'jp-bank',
        destId: 'in-bank',
        sourceAmount: 50000,
        destAmount: 27500,
        sourceCurrency: '¥',
        destCurrency: '₹',
        exchangeRate: '0.550000'
    };
    const curJpyInr = app.getRemittanceCurrencies(txJpyInr);
    assert(curJpyInr.srcCur === '¥' && curJpyInr.dstCur === '₹', '1.1: JPY->INR currencies resolved as ¥ and ₹');
    const amtJpyInr = app.formatRemittanceAmount(txJpyInr);
    assert(amtJpyInr === '¥50,000 → ₹27,500', `1.1: JPY->INR amount formatted correctly (actual: ${amtJpyInr})`);
    const cJpyInr = app.getRemittanceCountryNames(txJpyInr);
    assert(cJpyInr.srcName === 'Japan' && cJpyInr.dstName === 'India', '1.1: JPY->INR countries resolved as Japan and India');

    // Pair 2: EUR -> INR
    const txEurInr = {
        type: 'remittance',
        sourceId: 'de-bank',
        destId: 'in-bank',
        sourceAmount: 500,
        destAmount: 45000,
        sourceCurrency: '€',
        destCurrency: '₹',
        exchangeRate: '90.000000'
    };
    const curEurInr = app.getRemittanceCurrencies(txEurInr);
    assert(curEurInr.srcCur === '€' && curEurInr.dstCur === '₹', '1.2: EUR->INR currencies resolved as € and ₹');
    const amtEurInr = app.formatRemittanceAmount(txEurInr);
    assert(amtEurInr === '€500 → ₹45,000', `1.2: EUR->INR amount formatted correctly (actual: ${amtEurInr})`);
    const cEurInr = app.getRemittanceCountryNames(txEurInr);
    assert(cEurInr.srcName === 'Germany' && cEurInr.dstName === 'India', '1.2: EUR->INR countries resolved as Germany and India');

    // Pair 3: JPY -> EUR
    const txJpyEur = {
        type: 'remittance',
        sourceId: 'jp-bank',
        destId: 'de-bank',
        sourceAmount: 100000,
        destAmount: 620,
        sourceCurrency: '¥',
        destCurrency: '€',
        exchangeRate: '0.006200'
    };
    const curJpyEur = app.getRemittanceCurrencies(txJpyEur);
    assert(curJpyEur.srcCur === '¥' && curJpyEur.dstCur === '€', '1.3: JPY->EUR currencies resolved as ¥ and €');
    const amtJpyEur = app.formatRemittanceAmount(txJpyEur);
    assert(amtJpyEur === '¥100,000 → €620', `1.3: JPY->EUR amount formatted correctly (actual: ${amtJpyEur})`);
    const cJpyEur = app.getRemittanceCountryNames(txJpyEur);
    assert(cJpyEur.srcName === 'Japan' && cJpyEur.dstName === 'Germany', '1.3: JPY->EUR countries resolved as Japan and Germany');

    // Pair 4: INR -> JPY
    const txInrJpy = {
        type: 'remittance',
        sourceId: 'in-bank',
        destId: 'jp-bank',
        sourceAmount: 50000,
        destAmount: 90000,
        sourceCurrency: '₹',
        destCurrency: '¥',
        exchangeRate: '1.800000'
    };
    const curInrJpy = app.getRemittanceCurrencies(txInrJpy);
    assert(curInrJpy.srcCur === '₹' && curInrJpy.dstCur === '¥', '1.4: INR->JPY currencies resolved as ₹ and ¥');
    const amtInrJpy = app.formatRemittanceAmount(txInrJpy);
    assert(amtInrJpy === '₹50,000 → ¥90,000', `1.4: INR->JPY amount formatted correctly (actual: ${amtInrJpy})`);
    const cInrJpy = app.getRemittanceCountryNames(txInrJpy);
    assert(cInrJpy.srcName === 'India' && cInrJpy.dstName === 'Japan', '1.4: INR->JPY countries resolved as India and Japan');

    // Privacy concealment test
    app.isPrivacyHidden = true;
    assert(app.formatRemittanceAmount(txJpyInr) === '******', '1.5: Remittance privacy concealment returns ******');
    app.isPrivacyHidden = false;

    // -------------------------------------------------------------------------
    // TEST 2: Correct Transfer Terminology
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: Transfer Terminology Matching Same-Currency Validation ---");
    const html = fs.readFileSync('index.html', 'utf8');
    assert(html.includes('Transfer Between Accounts'), '2.1: Transaction selector card titled "Transfer Between Accounts"');
    assert(html.includes('Move money between your accounts in the same currency'), '2.2: Description clarifies same-currency movement');
    assert(!html.includes('Domestic Transfer'), '2.3: Inaccurate "Domestic Transfer" title completely removed');
    assert(!html.includes('Move money between accounts in the same country'), '2.4: Inaccurate same-country restriction removed');

    // -------------------------------------------------------------------------
    // TEST 3: First-Use CTAs Open Unified Transaction Selector
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: First-Use Transaction Entry Points ---");
    const appJsContent = fs.readFileSync('js/app.js', 'utf8');

    // Check Dashboard first-use
    assert(appJsContent.includes(`app.openUnifiedTransactionSelector()" style="gap: 5px;">`), '3.1: Dashboard first-use CTA calls openUnifiedTransactionSelector()');

    // Check Continuous ledger first-use
    assert(appJsContent.includes(`app.openUnifiedTransactionSelector()" style="margin-top: 6px;">`), '3.2: Continuous Ledger first-use CTA calls openUnifiedTransactionSelector()');

    // -------------------------------------------------------------------------
    // TEST 4: Clarify Enabled-But-Unconfigured Budgets (5 UI States)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 4: Five Distinct Budget UI States ---");

    // State A: Budgeting Disabled
    const htmlDisabled = app.getBudgetOverviewCardHtml({
        region: 'IN',
        enabled: false,
        totalSpent: 0,
        allocatedBudget: 0
    });
    assert(htmlDisabled.includes('Budgeting is turned off for this region'), '4.1: Disabled budget clearly indicates budgeting is turned off');
    assert(htmlDisabled.includes('Enable & Configure Budget'), '4.1: Disabled budget provides clear enable CTA');
    assert(!htmlDisabled.includes('budget-streak-track'), '4.1: Disabled budget omits progress bar');

    // State B: Budgeting Enabled but No Positive Limit Configured
    const htmlUnconfigured = app.getBudgetOverviewCardHtml({
        region: 'JP',
        enabled: true,
        totalSpent: 12000,
        allocatedBudget: 0
    });
    assert(htmlUnconfigured.includes('Set Monthly Budget'), '4.2: Enabled but unconfigured budget presents "Set Monthly Budget" CTA');
    assert(htmlUnconfigured.includes('Limit: Not Set'), '4.2: Enabled but unconfigured budget clearly labels "Limit: Not Set"');
    assert(htmlUnconfigured.includes('Expense tracking continues without a spending limit'), '4.2: Explains tracking continues without spending limit');
    assert(!htmlUnconfigured.includes('budget-streak-track'), '4.2: Enabled but unconfigured budget omits misleading 0% progress bar');

    // State C: Positive Budget Configured With No Spending
    const htmlNoSpend = app.getBudgetOverviewCardHtml({
        region: 'DE',
        enabled: true,
        totalSpent: 0,
        allocatedBudget: 1000
    });
    assert(htmlNoSpend.includes('budget-streak-track'), '4.3: Configured budget renders progress track');
    assert(htmlNoSpend.includes('Spent: <strong>' + app.formatMoney(0, '€') + '</strong>'), '4.3: Configured zero-spend shows Spent: €0');
    assert(htmlNoSpend.includes('Remaining: <strong>' + app.formatMoney(1000, '€') + '</strong>'), '4.3: Configured zero-spend shows full remaining budget');

    // State D: Positive Budget Configured With Normal Spending
    const htmlSpending = app.getBudgetOverviewCardHtml({
        region: 'DE',
        enabled: true,
        totalSpent: 400,
        allocatedBudget: 1000
    });
    assert(htmlSpending.includes('Spent: <strong>' + app.formatMoney(400, '€') + '</strong>'), '4.4: Configured spending shows spent amount');
    assert(htmlSpending.includes('Remaining: <strong>' + app.formatMoney(600, '€') + '</strong>'), '4.4: Configured spending shows remaining amount');

    // State E: Budget Exceeded
    const htmlExceeded = app.getBudgetOverviewCardHtml({
        region: 'DE',
        enabled: true,
        totalSpent: 1250,
        allocatedBudget: 1000
    });
    assert(htmlExceeded.includes('Over limit: <strong class="text-danger">' + app.formatMoney(250, '€') + '</strong>'), '4.5: Exceeded budget renders Over limit warning');
    assert(htmlExceeded.includes('neon-danger'), '4.5: Exceeded budget renders neon-danger progress track');

    // -------------------------------------------------------------------------
    // TEST 5: Existing Transaction Functionality Unchanged
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 5: Existing Accounting & Operations Integrity ---");

    // Add expense
    const preBal = ctx.storage.state.wallets['jp-bank'].balance;
    const okExp = wm.addExpense('jp-bank', 'jp-food', 5000, 'Test Bento', '2026-11-24');
    assert(okExp === true, '5.1: addExpense succeeds');
    assert(ctx.storage.state.wallets['jp-bank'].balance === preBal - 5000, '5.1: Cash balance debited accurately');

    // Add income
    const okInc = wm.addIncome('jp-bank', 20000, 'Bonus', '2026-11-24');
    assert(okInc === true, '5.2: addIncome succeeds');
    assert(ctx.storage.state.wallets['jp-bank'].balance === preBal - 5000 + 20000, '5.2: Balance credited accurately');

    // Multi-currency remittance execution
    const preSrc = ctx.storage.state.wallets['de-bank'].balance;
    const preDst = ctx.storage.state.wallets['in-bank'].balance;
    const okRemit = wm.remittance('de-bank', 'in-bank', 200, 18000, 'Living Expenses', '2026-11-24');
    assert(okRemit === true, '5.3: Cross-currency remittance succeeds between EUR and INR');
    assert(ctx.storage.state.wallets['de-bank'].balance === preSrc - 200, '5.3: Source EUR balance debited');
    assert(ctx.storage.state.wallets['in-bank'].balance === preDst + 18000, '5.3: Dest INR balance credited');

    console.log("================================================================================");
    console.log(`RESULTS: All ${passed}/${total} Phase 1 Final Corrections assertions passed!`);
    console.log("================================================================================");
}

runBehavioralTests();
