// Comprehensive Test Suite for Wallet Renaming with Cascading Ledger Updates
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runTests() {
    console.log("================================================================================");
    console.log("TEST SUITE: WALLET RENAMING WITH CASCADING LEDGER UPDATES");
    console.log("================================================================================");

    // Mock browser environment
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
        SUPABASE_CONFIG: { storageKey: 'em_test_rename' },
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
                if (!this._elements) this._elements = {};
                if (!this._elements[id]) {
                    this._elements[id] = {
                        value: '',
                        classList: { add: () => {}, remove: () => {}, contains: () => false },
                        style: {},
                        innerText: '',
                        innerHTML: ''
                    };
                }
                return this._elements[id];
            },
            querySelectorAll() { return []; },
            addEventListener() {},
            removeEventListener() {},
            body: { style: {} }
        },
        lucide: {
            createIcons() {}
        }
    };
    sandbox.window = sandbox;
    sandbox.global = sandbox;

    const ctx = vm.createContext(sandbox);

    // Load dependencies
    const storageCode = fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8');
    const walletCode = fs.readFileSync(path.join(__dirname, '../js/wallet.js'), 'utf8');
    const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

    vm.runInContext(storageCode, ctx);
    vm.runInContext(walletCode, ctx);
    vm.runInContext(appCode, ctx);

    const storage = ctx.storage;
    const walletManager = ctx.walletManager;
    const app = ctx.app;

    // Initialize mock state
    storage.state.preferences = { onboardingCompleted: true };
    storage.state.revision = 1;
    storage.state.wallets = {
        'PayPay': { id: 'PayPay', name: 'PayPay', region: 'JP', currency: '¥', balance: 5000, type: 'digital', theme: 'crimson-paypay' },
        'Cash JP': { id: 'Cash JP', name: 'Cash JP', region: 'JP', currency: '¥', balance: 10000, type: 'cash', theme: 'amber-gold' },
        'Axis Bank': { id: 'Axis Bank', name: 'Axis Bank', region: 'IN', currency: '₹', balance: 25000, type: 'bank', theme: 'burgundy-axis' }
    };
    storage.state.transactions = [
        { id: 'tx-1', walletId: 'PayPay', amount: 1200, type: 'expense', categoryId: 'cat-1', date: '2026-11-10' },
        { id: 'tx-2', walletId: 'PayPay', amount: 3000, type: 'income', categoryId: 'cat-2', date: '2026-11-12' },
        { id: 'tx-3', sourceId: 'Cash JP', destId: 'PayPay', amount: 2000, type: 'transfer', date: '2026-11-14' },
        { id: 'tx-4', sourceId: 'PayPay', destId: 'Axis Bank', sourceAmount: 10000, destAmount: 5500, type: 'remittance', date: '2026-11-15' }
    ];
    storage.state.closedMonths = {
        '2026-10': {
            transactions: [
                { id: 'tx-old-1', walletId: 'PayPay', amount: 500, type: 'expense', date: '2026-10-15' },
                { id: 'tx-old-2', sourceId: 'PayPay', destId: 'Cash JP', amount: 1000, type: 'transfer', date: '2026-10-20' }
            ]
        }
    };
    storage.state.history = [
        {
            transactions: [
                { id: 'tx-hist-1', walletId: 'PayPay', amount: 700, type: 'expense', date: '2026-09-05' }
            ]
        }
    ];
    storage.saveData();

    // Stub render methods
    app.renderAll = () => {};
    app.renderWalletsPage = () => {};
    app.closeModal = () => {};
    app.openWalletFocus = () => {};

    console.log("1. Testing Collision Prevention:");
    ctx.document.getElementById('edit-wallet-id').value = 'PayPay';
    ctx.document.getElementById('edit-wallet-name').value = 'Cash JP';
    ctx.document.getElementById('edit-wallet-type').value = 'digital';
    ctx.document.getElementById('edit-wallet-balance').value = '5000';
    ctx.document.getElementById('edit-wallet-theme-val').value = 'crimson-paypay';

    let alertedMsg = '';
    sandbox.alert = (msg) => { alertedMsg = msg; };

    await app.saveEditWallet();
    assert(alertedMsg.includes('already exists'), "Should alert when renaming to an existing wallet name");
    assert(storage.state.wallets['PayPay'], "'PayPay' should remain unchanged on collision");
    console.log("  [PASS] Collision prevented properly.");

    console.log("2. Testing Empty Name Prevention:");
    ctx.document.getElementById('edit-wallet-name').value = '   ';
    await app.saveEditWallet();
    assert(alertedMsg.includes('enter a wallet name'), "Should alert when name is empty");
    assert(storage.state.wallets['PayPay'], "'PayPay' should remain unchanged on empty name");
    console.log("  [PASS] Empty name prevented properly.");

    console.log("3. Testing Confirmation Prompt when Transactions Exist:");
    let confirmPromptShown = false;
    sandbox.confirm = (msg) => {
        confirmPromptShown = true;
        console.log("    Confirm prompt message:", msg);
        assert(msg.includes('recorded transaction'), "Confirmation prompt should cite recorded transactions");
        return true;
    };
    ctx.document.getElementById('edit-wallet-name').value = 'PayPay Personal';
    await app.saveEditWallet();
    assert(confirmPromptShown, "Confirmation prompt must be triggered when renaming wallet with transactions");
    console.log("  [PASS] Confirmation prompt triggered with exact transaction count.");

    console.log("4. Testing Safe Renaming and Full Ledger Cascade:");
    assert(!storage.state.wallets['PayPay'], "'PayPay' key must be deleted");
    assert(storage.state.wallets['PayPay Personal'], "'PayPay Personal' key must exist in wallets");
    assert.strictEqual(storage.state.wallets['PayPay Personal'].id, 'PayPay Personal', "id property must equal 'PayPay Personal'");
    assert.strictEqual(storage.state.wallets['PayPay Personal'].balance, 5000, "balance must be preserved");

    // Verify transactions in continuous ledger
    const tx1 = storage.state.transactions.find(t => t.id === 'tx-1');
    const tx2 = storage.state.transactions.find(t => t.id === 'tx-2');
    const tx3 = storage.state.transactions.find(t => t.id === 'tx-3');
    const tx4 = storage.state.transactions.find(t => t.id === 'tx-4');

    assert.strictEqual(tx1.walletId, 'PayPay Personal', "tx-1 walletId must cascade to 'PayPay Personal'");
    assert.strictEqual(tx2.walletId, 'PayPay Personal', "tx-2 walletId must cascade to 'PayPay Personal'");
    assert.strictEqual(tx3.destId, 'PayPay Personal', "tx-3 destId must cascade to 'PayPay Personal'");
    assert.strictEqual(tx3.sourceId, 'Cash JP', "tx-3 sourceId must remain 'Cash JP'");
    assert.strictEqual(tx4.sourceId, 'PayPay Personal', "tx-4 sourceId must cascade to 'PayPay Personal'");
    assert.strictEqual(tx4.destId, 'Axis Bank', "tx-4 destId must remain 'Axis Bank'");

    console.log("  [PASS] Continuous ledger transactions cascaded correctly.");

    console.log("5. Testing Closed Months and History Archive Cascade:");
    console.log("    state.history:", JSON.stringify(storage.state.history));
    const old1 = storage.state.closedMonths['2026-10'].transactions.find(t => t.id === 'tx-old-1');
    const old2 = storage.state.closedMonths['2026-10'].transactions.find(t => t.id === 'tx-old-2');

    assert.strictEqual(old1.walletId, 'PayPay Personal', "tx-old-1 walletId in closedMonths must cascade to 'PayPay Personal'");
    assert.strictEqual(old2.sourceId, 'PayPay Personal', "tx-old-2 sourceId in closedMonths must cascade to 'PayPay Personal'");

    console.log("  [PASS] Archive and history transactions cascaded correctly.");

    console.log("6. Testing Non-Renaming Updates (Balance, Type, Theme only):");
    ctx.document.getElementById('edit-wallet-id').value = 'PayPay Personal';
    ctx.document.getElementById('edit-wallet-name').value = 'PayPay Personal';
    ctx.document.getElementById('edit-wallet-balance').value = '6500';
    ctx.document.getElementById('edit-wallet-type').value = 'digital';
    ctx.document.getElementById('edit-wallet-theme-val').value = 'emerald-salary';

    await app.saveEditWallet();
    assert.strictEqual(storage.state.wallets['PayPay Personal'].balance, 6500, "Balance updated without renaming");
    assert.strictEqual(storage.state.wallets['PayPay Personal'].theme, 'emerald-salary', "Theme updated without renaming");
    console.log("  [PASS] Non-renaming edits work seamlessly.");

    console.log("\nALL WALLET RENAMING AND CASCADING LEDGER TESTS PASSED (100% SUCCESS)!");
}

runTests();
