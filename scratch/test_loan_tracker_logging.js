// Test Suite for Loan Tracker Repositioning & Log EMI Payment Feature
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runTests() {
    console.log("================================================================================");
    console.log("TEST SUITE: LOAN TRACKER POSITIONING & LOG EMI PAYMENT WORKFLOW");
    console.log("================================================================================");

    // 1. Verify HTML Structure & Positioning
    const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const loanPos = indexHtml.indexOf('id="loan-tracker-widget"');
    const recentPos = indexHtml.indexOf('id="dashboard-recent-tx-card"');

    assert(loanPos !== -1, "loan-tracker-widget must exist in index.html");
    assert(recentPos !== -1, "dashboard-recent-tx-card must exist in index.html");
    assert(loanPos < recentPos, "loan-tracker-widget must be positioned BEFORE dashboard-recent-tx-card in index.html");
    console.log("  [PASS] Loan tracker is positioned above the small transactions list in the dashboard rail.");

    assert(indexHtml.includes('id="log-emi-modal"'), "log-emi-modal must be present in index.html");
    console.log("  [PASS] Log EMI modal is present in index.html.");

    // 2. Setup mock environment for JS tests
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
        SUPABASE_CONFIG: { storageKey: 'em_test_loan' },
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

    // Configure test loan and wallets
    storage.state.preferences = { onboardingCompleted: true, activeCountries: ['JP', 'IN'] };
    storage.state.revision = 1;
    storage.state.loanConfig = {
        enabled: true,
        country: 'IN',
        currency: '₹',
        totalPrincipal: 500000,
        principalLeft: 400000,
        totalDues: 24,
        duesPaid: 5,
        emi: 25000,
        emiDrawDate: 7
    };
    storage.state.wallets = {
        'Axis Bank': { id: 'Axis Bank', type: 'bank', region: 'IN', currency: '₹', balance: 80000 },
        'Cash JP': { id: 'Cash JP', type: 'cash', region: 'JP', currency: '¥', balance: 50000 }
    };
    storage.state.categories = {
        IN: [
            { id: 'in-loan', name: 'Loan EMI', icon: 'landmark' },
            { id: 'in-home', name: 'Home Needs', icon: 'home' }
        ]
    };
    storage.state.transactions = [];
    storage.saveData();

    app.renderAll = () => {};
    app.renderLoanTracker = () => {};

    console.log("3. Testing openLogEmiModal():");
    app.openLogEmiModal();

    const modal = domStore['log-emi-modal'];
    assert(modal && modal.classList.contains('active'), "Modal should be marked active");

    const amountInput = domStore['log-emi-amount'];
    assert.strictEqual(amountInput.value, 25000, "EMI amount should pre-fill from loanConfig.emi (25000)");

    const noteInput = domStore['log-emi-note'];
    assert.strictEqual(noteInput.value, 'Loan EMI Payment #6', "Note should pre-fill with installment #6");

    const walletSelect = domStore['log-emi-wallet'];
    assert(walletSelect.innerHTML.includes('Axis Bank'), "Wallet dropdown must contain Axis Bank");
    console.log("  [PASS] openLogEmiModal() pre-filled correctly.");

    console.log("4. Testing updateLogEmiPreview():");
    app.updateLogEmiPreview();
    const princPreview = domStore['log-emi-preview-principal'];
    const duesPreview = domStore['log-emi-preview-dues'];
    assert(princPreview.innerText.includes('375,000'), "Principal reduction should show 400,000 → 375,000");
    assert(duesPreview.innerText.includes('5/24 → 6/24'), "Dues preview should show 5/24 → 6/24");
    console.log("  [PASS] updateLogEmiPreview() displays accurate amortization impact.");

    console.log("5. Testing saveLogEmiPayment() execution:");
    domStore['log-emi-wallet'].value = 'Axis Bank';
    domStore['log-emi-amount'].value = 25000;
    domStore['log-emi-date'].value = '2026-11-22';
    domStore['log-emi-note'].value = 'Axis Bank Home Loan EMI #6';

    let alertTriggered = false;
    sandbox.alert = (msg) => {
        alertTriggered = true;
        assert(msg.includes('recorded successfully'), "Success message alerted");
    };

    await app.saveLogEmiPayment();

    // Verify wallet balance
    assert.strictEqual(storage.state.wallets['Axis Bank'].balance, 55000, "Wallet balance must decrease from 80000 to 55000");

    // Verify loanConfig
    assert.strictEqual(storage.state.loanConfig.duesPaid, 6, "duesPaid must increment from 5 to 6");
    assert.strictEqual(storage.state.loanConfig.principalLeft, 375000, "principalLeft must reduce from 400000 to 375000");

    // Verify created transaction
    assert.strictEqual(storage.state.transactions.length, 1, "Exactly one expense transaction must be created");
    const tx = storage.state.transactions[0];
    assert.strictEqual(tx.type, 'expense', "Transaction type must be 'expense'");
    assert.strictEqual(tx.walletId, 'Axis Bank', "Transaction walletId must be 'Axis Bank'");
    assert.strictEqual(tx.categoryId, 'in-loan', "Transaction categoryId must be 'in-loan'");
    assert.strictEqual(tx.amount, 25000, "Transaction amount must be 25000");
    assert.strictEqual(tx.currency, '₹', "Transaction currency must be '₹'");
    assert.strictEqual(tx.region, 'IN', "Transaction region must be 'IN'");
    assert.strictEqual(tx.note, 'Axis Bank Home Loan EMI #6', "Transaction note preserved");

    // Verify modal closed
    assert(!modal.classList.contains('active'), "Modal should be closed after submission");

    console.log("  [PASS] saveLogEmiPayment() atomically updated wallet, loan counters, and continuous ledger.");

    console.log("\nALL LOAN TRACKER & LOG EMI TESTS PASSED (100% SUCCESS)!");
}

runTests();

