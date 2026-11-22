// Test Suite for Loan EMI Transaction Deletion, Edit Rollback, and Tenure Progress Display
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runTests() {
    console.log("================================================================================");
    console.log("TEST SUITE: LOAN EMI DELETION ROLLBACK, EDIT & TENURE PROGRESS DISPLAY");
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
        SUPABASE_CONFIG: { storageKey: 'em_test_loan_del' },
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

    // 1. Initial State Setup
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
        totalPrincipal: 500000,
        principalLeft: 400000,
        totalDues: 24,
        duesPaid: 5,
        emi: 25000,
        emiDrawDate: 7
    };
    storage.state.categories = {
        IN: [{ id: 'in-loan', name: 'Loan EMI', icon: 'landmark' }]
    };
    storage.saveData();

    // 2. Test Tenure Progress Display in renderLoanTracker
    console.log("1. Testing tenure summary display in renderLoanTracker():");
    app.currentView = 'home-view';
    app.isPrivacyHidden = false;
    app.renderLoanTracker();
    const loanWidget = domStore['loan-tracker-widget'];
    assert(loanWidget.innerHTML.includes('5</strong> out of 24 months paid'), "Should display '5 out of 24 months paid'");
    assert(loanWidget.innerHTML.includes('19</strong> months left'), "Should display '19 months left'");
    console.log("  [PASS] Tenure progress '5 out of 24 months paid' and '19 months left' displayed accurately.");

    // 3. Test Logging EMI Payment
    console.log("2. Testing logging new EMI payment:");
    app.openLogEmiModal();
    domStore['log-emi-date'].value = '2026-11-22';
    domStore['log-emi-amount'].value = '25000';
    domStore['log-emi-wallet'].value = 'HDFC Bank';
    domStore['log-emi-note'].value = 'Loan EMI Payment #6';

    await app.saveLogEmiPayment();

    assert.strictEqual(storage.state.wallets['HDFC Bank'].balance, 75000, "Wallet should be debited by 25000 (100k -> 75k)");
    assert.strictEqual(storage.state.loanConfig.duesPaid, 6, "duesPaid should advance from 5 to 6");
    assert.strictEqual(storage.state.loanConfig.principalLeft, 375000, "principalLeft should reduce from 400k to 375k");
    assert.strictEqual(storage.state.transactions.length, 1, "One transaction should be recorded");

    const createdTx = storage.state.transactions[0];
    assert.strictEqual(createdTx.isLoanPayment, true, "Transaction must have isLoanPayment: true flag");
    console.log("  [PASS] Log EMI payment recorded: duesPaid=6, principalLeft=375k, balance=75k, flagged as loan payment.");

    // 4. Test updated tenure display
    app.renderLoanTracker();
    assert(loanWidget.innerHTML.includes('6</strong> out of 24 months paid'), "Should now display '6 out of 24 months paid'");
    assert(loanWidget.innerHTML.includes('18</strong> months left'), "Should now display '18 months left'");
    console.log("  [PASS] Tenure progress dynamically updated to 6 out of 24 months paid (18 months left).");

    // 5. Test Deleting the Logged EMI Payment
    console.log("3. Testing deleting the logged EMI payment:");
    const txId = createdTx.id;
    const delRes = await app.deleteTx(txId);
    assert.strictEqual(delRes, true, "deleteTx should return true");

    assert.strictEqual(storage.state.wallets['HDFC Bank'].balance, 100000, "Wallet balance must be restored to 100000");
    assert.strictEqual(storage.state.loanConfig.duesPaid, 5, "duesPaid must be rolled back from 6 to 5");
    assert.strictEqual(storage.state.loanConfig.principalLeft, 400000, "principalLeft must be restored to 400000");
    assert.strictEqual(storage.state.transactions.length, 0, "Transaction collection must now be empty");
    console.log("  [PASS] Transaction deleted and loan tracker atomically rolled back (duesPaid=5, principalLeft=400k, balance=100k).");

    // 6. Test Tenure display after deletion
    app.renderLoanTracker();
    assert(loanWidget.innerHTML.includes('5</strong> out of 24 months paid'), "Should revert to '5 out of 24 months paid'");
    assert(loanWidget.innerHTML.includes('19</strong> months left'), "Should revert to '19 months left'");
    console.log("  [PASS] Tenure progress display restored to 5 out of 24 months paid.");

    // 7. Test Editing an Existing EMI Payment Amount
    console.log("4. Testing editing an EMI payment amount:");
    await app.saveLogEmiPayment(); // Re-log payment #6 of 25000
    const reLoggedTx = storage.state.transactions[0];
    assert.strictEqual(storage.state.loanConfig.principalLeft, 375000, "Principal left should be 375000");

    // Edit amount to 35000 (+10000 extra payment)
    const updateRes = walletManager.updateTransaction(reLoggedTx.id, { amount: 35000 });
    assert.strictEqual(updateRes, true, "updateTransaction should return true");
    assert.strictEqual(storage.state.wallets['HDFC Bank'].balance, 65000, "Wallet balance should be 65000");
    assert.strictEqual(storage.state.loanConfig.principalLeft, 365000, "Principal left should be reduced by extra 10k (375k -> 365k)");
    console.log("  [PASS] Editing payment amount from 25k to 35k automatically adjusted principalLeft to 365k.");

    // Edit amount to 20000 (-15000 reduced payment)
    const updateRes2 = walletManager.updateTransaction(reLoggedTx.id, { amount: 20000 });
    assert.strictEqual(updateRes2, true, "updateTransaction should return true");
    assert.strictEqual(storage.state.wallets['HDFC Bank'].balance, 80000, "Wallet balance should be 80000");
    assert.strictEqual(storage.state.loanConfig.principalLeft, 380000, "Principal left should be restored by 15k (365k -> 380k)");
    console.log("  [PASS] Editing payment amount from 35k to 20k automatically adjusted principalLeft to 380k.");

    // Final cleanup delete
    await app.deleteTx(reLoggedTx.id);
    assert.strictEqual(storage.state.loanConfig.duesPaid, 5, "Final duesPaid restored to 5");
    assert.strictEqual(storage.state.loanConfig.principalLeft, 400000, "Final principalLeft restored to 400k");
    assert.strictEqual(storage.state.wallets['HDFC Bank'].balance, 100000, "Final wallet balance restored to 100k");
    console.log("  [PASS] Final cleanup deletion restored all loan counters and balances cleanly.");

    console.log("\nALL LOAN DELETION, EDIT & TENURE TESTS PASSED (100% SUCCESS)!");
}

runTests().catch(e => {
    console.error("Test failed:", e);
    process.exit(1);
});
