// Test Suite for Loan Region, Currency, and Wallet Configuration in Settings
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runTests() {
    console.log("================================================================================");
    console.log("TEST SUITE: LOAN REGION, CURRENCY & REPAYMENT WALLET SETTINGS");
    console.log("================================================================================");

    const domStore = {};
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Date,
        Math,
        Number,
        String,
        Boolean,
        Array,
        Object,
        JSON,
        RegExp,
        confirm: () => true,
        alert: () => {},
        SUPABASE_CONFIG: { storageKey: 'em_test_loan_region' },
        CountryConfig: require('../js/country-config.js').CountryConfig,
        localStorage: {
            _store: {},
            getItem(k) { return this._store[k] !== undefined ? this._store[k] : null; },
            setItem(k, v) { this._store[k] = String(v); },
            removeItem(k) { delete this._store[k]; },
            clear() { this._store = {}; }
        },
        document: {
            getElementById(id) {
                if (!domStore[id]) {
                    domStore[id] = {
                        id,
                        value: '',
                        classList: {
                            _classes: new Set(),
                            add(c) { this._classes.add(c); },
                            remove(c) { this._classes.delete(c); },
                            contains(c) { return this._classes.has(c); }
                        },
                        style: {},
                        innerText: '',
                        innerHTML: ''
                    };
                }
                return domStore[id];
            },
            querySelectorAll() { return []; },
            addEventListener() {},
            removeEventListener() {},
            body: { style: {} }
        },
        lucide: { createIcons: () => {} }
    };
    sandbox.window = sandbox;
    sandbox.global = sandbox;

    const ctx = vm.createContext(sandbox);

    const storageCode = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
    const walletCode = fs.readFileSync(path.join(__dirname, '../js/wallet.js'), 'utf8');
    const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

    vm.runInContext(storageCode, ctx);
    vm.runInContext(walletCode, ctx);
    vm.runInContext(appCode, ctx);

    const storage = ctx.storage;
    const app = ctx.app;

    // Setup multi-region wallets & state
    storage.state.preferences = { onboardingCompleted: true, activeCountries: ['JP', 'IN', 'DE'] };
    storage.state.primaryOperatingCountry = 'JP'; // User operating in Japan as primary
    storage.state.revision = 1;
    storage.state.transactions = [];
    storage.state.wallets = {
        'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', currency: '¥', balance: 15000 },
        'HDFC Bank': { id: 'HDFC Bank', type: 'bank', region: 'IN', currency: '₹', balance: 80000 },
        'SBI Account': { id: 'SBI Account', type: 'bank', region: 'IN', currency: '₹', balance: 50000 }
    };
    storage.state.loanConfig = {
        enabled: true,
        country: 'IN',
        currency: '₹',
        repaymentWallet: 'HDFC Bank',
        totalPrincipal: 500000,
        principalLeft: 400000,
        totalDues: 24,
        duesPaid: 5,
        emi: 25000,
        emiDrawDate: 7
    };
    storage.saveData();

    // Test 1: updateLoanPref with country change and auto-currency sync
    console.log("1. Testing country change and auto-currency sync:");
    await app.updateLoanPref('country', 'JP');
    assert.strictEqual(storage.state.loanConfig.country, 'JP', "Country should be updated to JP");
    assert.strictEqual(storage.state.loanConfig.currency, '¥', "Currency should auto-sync to ¥ for JP");
    assert.strictEqual(storage.state.loanConfig.repaymentWallet, '', "HDFC Bank (IN) should be cleared because it does not belong to JP");
    console.log("  [PASS] Country updated to JP, currency auto-synced to ¥, incompatible wallet cleared.");

    // Test 2: Setting a valid repayment wallet for JP
    console.log("2. Testing setting repayment wallet for JP:");
    await app.updateLoanPref('repaymentWallet', 'PayPay');
    assert.strictEqual(storage.state.loanConfig.repaymentWallet, 'PayPay', "Repayment wallet should be PayPay");
    console.log("  [PASS] Repayment wallet correctly set to PayPay.");

    // Test 3: Setting currency override
    console.log("3. Testing currency manual override:");
    await app.updateLoanPref('currency', '€');
    assert.strictEqual(storage.state.loanConfig.currency, '€', "Currency override should be set to €");
    console.log("  [PASS] Currency manual override preserved.");

    // Test 4: Switching back to India with HDFC Bank
    console.log("4. Testing switching back to India:");
    await app.updateLoanPref('country', 'IN');
    assert.strictEqual(storage.state.loanConfig.country, 'IN', "Country should be IN");
    assert.strictEqual(storage.state.loanConfig.currency, '₹', "Currency should be auto-set to ₹");
    await app.updateLoanPref('repaymentWallet', 'SBI Account');
    assert.strictEqual(storage.state.loanConfig.repaymentWallet, 'SBI Account', "Repayment wallet should be SBI Account");
    console.log("  [PASS] Country returned to IN with ₹ currency and SBI Account wallet.");

    // Test 5: Verify renderSettingsPage HTML contents
    console.log("5. Testing renderSettingsPage HTML structure for loan configuration:");
    app.renderSettingsPage();
    const loanContainer = domStore['settings-loan-config-container'];
    assert(loanContainer.innerHTML.includes('id="setting-loan-country"'), "Should contain setting-loan-country dropdown");
    assert(loanContainer.innerHTML.includes('id="setting-loan-currency"'), "Should contain setting-loan-currency dropdown");
    assert(loanContainer.innerHTML.includes('id="setting-loan-repayment-wallet"'), "Should contain setting-loan-repayment-wallet dropdown");
    assert(loanContainer.innerHTML.includes('value="SBI Account" selected'), "SBI Account should be selected in wallet dropdown");
    assert(loanContainer.innerHTML.includes('HDFC Bank'), "HDFC Bank should be an option in India wallet dropdown");
    assert(!loanContainer.innerHTML.includes('PayPay'), "PayPay (JP) must NOT be listed when loan country is India");
    console.log("  [PASS] Settings page cleanly renders country, currency, and strictly regional wallets.");

    // Test 6: Verify empty wallet list handling for region with 0 wallets
    console.log("6. Testing region with 0 wallets (Germany DE):");
    await app.updateLoanPref('country', 'DE');
    app.renderSettingsPage();
    assert(loanContainer.innerHTML.includes('No wallets configured in Germany'), "Must display 'No wallets configured in Germany' message");
    console.log("  [PASS] Handled region with 0 wallets gracefully.");

    // Test 7: Verify openLogEmiModal pre-selects default repayment wallet
    console.log("7. Testing openLogEmiModal pre-selection:");
    await app.updateLoanPref('country', 'IN');
    await app.updateLoanPref('repaymentWallet', 'HDFC Bank');
    app.openLogEmiModal();
    const walletSelect = domStore['log-emi-wallet'];
    assert(walletSelect.innerHTML.includes('value="HDFC Bank" selected'), "HDFC Bank must be selected in Log EMI modal dropdown");
    console.log("  [PASS] Log EMI modal pre-selects default repayment wallet.");

    // Test 8: Verify renderLoanTracker does NOT fall back to primary operating country (JP)
    console.log("8. Testing renderLoanTracker respects loanConfig.country independent of primaryOperatingCountry:");
    app.currentView = 'home-view';
    app.isPrivacyHidden = false;
    app.renderLoanTracker();
    const loanWidget = domStore['loan-tracker-widget'];
    assert(loanWidget.innerHTML.includes('₹'), "Loan tracker must format amounts using loan currency (₹), not primary JP currency (¥)");
    console.log("  [PASS] Loan tracker displays configured loan currency and locale, independent of primary country.");

    console.log("\nALL LOAN REGION & CURRENCY SETTINGS TESTS PASSED (100% SUCCESS)!");
}

runTests().catch(e => {
    console.error("Test failed:", e);
    process.exit(1);
});
