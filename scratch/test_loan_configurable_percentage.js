// Test Suite for Configurable Loan Percentage & Annual Interest Rate
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runTests() {
    console.log("================================================================================");
    console.log("TEST SUITE: CONFIGURABLE LOAN PERCENTAGE BASIS & ANNUAL INTEREST RATE");
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
        SUPABASE_CONFIG: { storageKey: 'em_test_loan_perc' },
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
                        innerHTML: '',
                        addEventListener: () => {},
                        removeEventListener: () => {}
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
    const walletManager = ctx.walletManager;
    const app = ctx.app;

    // 1. Initial State Setup with IN loan
    storage.state.preferences = { onboardingCompleted: true, activeCountries: ['IN'] };
    storage.state.primaryOperatingCountry = 'IN';
    storage.state.revision = 1;
    storage.state.transactions = [];
    storage.state.wallets = {
        'HDFC Bank': { id: 'HDFC Bank', type: 'bank', region: 'IN', currency: '₹', balance: 100000 }
    };
    storage.state.loanConfig = {
        enabled: true,
        country: 'IN',
        currency: '₹',
        repaymentWallet: 'HDFC Bank',
        percentMode: 'principal',
        totalPrincipal: 500000,
        principalLeft: 400000,
        totalDues: 24,
        duesPaid: 5,
        emi: 25000,
        annualInterestRate: 8.5,
        emiDrawDate: 7
    };
    storage.saveData();

    // 2. Test Principal Paid % Calculation (Default)
    console.log("1. Testing 'principal' mode (Principal Repaid %):");
    let state = walletManager.getLoanState();
    assert.strictEqual(state.percentMode, 'principal', "Mode must be 'principal'");
    assert.strictEqual(state.percentPaid, '20', "100k principal paid / 500k total principal = 20%");
    assert.strictEqual(state.percentLabel, 'Principal', "Label should be Principal");
    assert.strictEqual(state.subLabel, 'Repaid', "SubLabel should be Repaid");
    assert.strictEqual(state.totalInterest, 100000, "Total interest: 24*25k (600k) - 500k = 100k");

    app.currentView = 'home-view';
    app.isPrivacyHidden = false;
    app.renderLoanTracker();
    const loanWidget = domStore['loan-tracker-widget'];
    assert(loanWidget.innerHTML.includes('20%'), "Widget should display 20%");
    assert(loanWidget.innerHTML.includes('Principal'), "Widget should display Principal");
    assert(loanWidget.innerHTML.includes('Repaid'), "Widget should display Repaid");
    assert(loanWidget.innerHTML.includes('Total Interest'), "Widget should display Total Interest row");
    console.log("  [PASS] 'principal' mode correctly computes 20% and displays 'Principal Repaid'.");

    // 3. Test Total Repaid % (Principal + Interest)
    console.log("2. Testing 'total' mode (Total Repaid %):");
    await app.updateLoanPref('percentMode', 'total');
    state = walletManager.getLoanState();
    assert.strictEqual(state.percentMode, 'total', "Mode must be 'total'");
    assert.strictEqual(state.percentPaid, '21', "125k total paid / 600k total expected = 20.83% -> 21%");
    assert.strictEqual(state.percentLabel, 'Total', "Label should be Total");
    assert.strictEqual(state.subLabel, 'Repaid', "SubLabel should be Repaid");

    app.renderLoanTracker();
    assert(loanWidget.innerHTML.includes('21%'), "Widget should display 21%");
    assert(loanWidget.innerHTML.includes('Total'), "Widget should display Total");
    assert(loanWidget.innerHTML.includes('Repaid'), "Widget should display Repaid");
    console.log("  [PASS] 'total' mode correctly computes 21% and displays 'Total Repaid'.");

    // 4. Test Tenure Completed % (Months Paid)
    console.log("3. Testing 'tenure' mode (Tenure Completed %):");
    await app.updateLoanPref('percentMode', 'tenure');
    state = walletManager.getLoanState();
    assert.strictEqual(state.percentMode, 'tenure', "Mode must be 'tenure'");
    assert.strictEqual(state.percentPaid, '21', "5 dues paid / 24 total dues = 20.83% -> 21%");
    assert.strictEqual(state.percentLabel, 'Tenure', "Label should be Tenure");
    assert.strictEqual(state.subLabel, 'Completed', "SubLabel should be Completed");

    app.renderLoanTracker();
    assert(loanWidget.innerHTML.includes('21%'), "Widget should display 21%");
    assert(loanWidget.innerHTML.includes('Tenure'), "Widget should display Tenure");
    assert(loanWidget.innerHTML.includes('Completed'), "Widget should display Completed");
    console.log("  [PASS] 'tenure' mode correctly computes 21% and displays 'Tenure Completed'.");

    // 5. Test Settings Page Inputs and Annual Interest Rate
    console.log("4. Testing Settings Page inputs and Annual Interest Rate:");
    await app.updateLoanPref('annualInterestRate', 9.25);
    assert.strictEqual(storage.state.loanConfig.annualInterestRate, 9.25, "Annual interest rate should be 9.25");

    app.renderSettingsPage();
    const loanContainer = domStore['settings-loan-config-container'];
    assert(loanContainer.innerHTML.includes('id="setting-loan-percent-mode"'), "Settings must contain percent mode dropdown");
    assert(loanContainer.innerHTML.includes('id="setting-loan-interest-rate"'), "Settings must contain annual interest rate input");
    assert(loanContainer.innerHTML.includes('value="9.25"'), "Settings must reflect 9.25 value");
    assert(loanContainer.innerHTML.includes('Total Obligation'), "Settings must display total obligation summary");
    assert(loanContainer.innerHTML.includes('Estimated Total Interest'), "Settings must display estimated total interest");
    console.log("  [PASS] Settings page reflects configured interest rate and total interest summaries.");

    console.log("\nALL CONFIGURABLE LOAN PERCENTAGE & INTEREST RATE TESTS PASSED (100% SUCCESS)!");
}

runTests().catch(e => {
    console.error("Test failed:", e);
    process.exit(1);
});

