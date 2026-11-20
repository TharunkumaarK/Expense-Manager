/**
 * EXPENSE MANAGER — PHASE 5 FINAL HOTFIX REGRESSION TEST SUITE
 * 
 * Verifies the two critical Phase 5 release-candidate defect corrections:
 * 
 * DEFECT 1: Failed transactions can close the input form
 * - App.handleFormSubmit() and App.deleteTx() entry points
 * - Form values preserved, modal remains open on failure
 * - Atomic rollback on structured failures, exceptions, and storage unavailability
 * - Rapid double-submission protection via _isSubmitting
 * - Successful transitions on verified local commit
 * 
 * DEFECT 2: Cloud acknowledgment can confirm a revision that was never uploaded
 * - Immutable snapshot capture before outbound network dispatch
 * - Verified server acknowledgment discipline (serverRev vs outboundRev)
 * - Revision 10 vs Revision 11 concurrency race condition
 * - Outbound payload immutability after dispatch
 * - Account isolation across session changes during flight
 * - Stale response protection (monotonic non-regression)
 * - CAS zero-row conflict detection & stash
 * - Malformed server acknowledgment rejection
 * - Network timeouts and reconnect queue resumption
 * - Pending-sync metadata survival across temporary network failures
 */

const fs = require('fs');
const vm = require('vm');

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, message) {
    totalAssertions++;
    if (condition) {
        passedAssertions++;
        console.log(`  [PASS] ${message}`);
    } else {
        failedAssertions++;
        console.error(`  [FAIL] ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
}

// Helper to create a deferred promise
function createDeferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

// Build mock browser, DOM, storage, and app environment
function createMockEnvironment(options = {}) {
    const store = {};
    const listeners = {};
    let lockHolder = null;

    const mockLocalStorage = {
        getItem: (k) => store[k] !== undefined ? store[k] : null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { for (const k in store) delete store[k]; },
        _getStore: () => store
    };

    const mockLocks = {
        request: async (name, opts, callback) => {
            if (typeof opts === 'function') {
                callback = opts;
                opts = {};
            }
            while (lockHolder) {
                await new Promise(r => setTimeout(r, 5));
            }
            lockHolder = name;
            try {
                return await callback();
            } finally {
                lockHolder = null;
            }
        }
    };

    class MockBroadcastChannel {
        constructor(channelName) {
            this.name = channelName;
            this.onmessage = null;
            if (!listeners[channelName]) listeners[channelName] = [];
            listeners[channelName].push(this);
        }
        postMessage(data) {
            const list = listeners[this.name] || [];
            list.forEach(bc => {
                if (bc !== this && typeof bc.onmessage === 'function') {
                    bc.onmessage({ data: JSON.parse(JSON.stringify(data)) });
                }
            });
        }
        close() {
            if (listeners[this.name]) {
                listeners[this.name] = listeners[this.name].filter(bc => bc !== this);
            }
        }
    }

    // DOM mock elements map
    const domElements = {};

    function getOrCreateElement(id) {
        if (!domElements[id]) {
            const classes = new Set();
            domElements[id] = {
                id,
                value: '',
                innerText: '',
                innerHTML: '',
                style: {},
                options: [],
                selectedIndex: 0,
                classList: {
                    add: (c) => classes.add(c),
                    remove: (c) => classes.delete(c),
                    contains: (c) => classes.has(c),
                    _classes: classes
                },
                appendChild: (child) => {},
                removeChild: (child) => {}
            };
        }
        return domElements[id];
    }

    const alerts = [];
    let confirmReturnValue = true;

    const mockDocument = {
        body: { style: {} },
        getElementById: (id) => getOrCreateElement(id),
        createElement: (tag) => getOrCreateElement(`elem_${Math.random().toString(36).substring(2, 7)}`),
        addEventListener: () => {},
        removeEventListener: () => {}
    };

    const sandbox = {
        window: {},
        document: mockDocument,
        console: console,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        Date: Date,
        Math: Math,
        JSON: JSON,
        Number: Number,
        String: String,
        Boolean: Boolean,
        Array: Array,
        Object: Object,
        Set: Set,
        Map: Map,
        Error: Error,
        parseFloat: parseFloat,
        parseInt: parseInt,
        isNaN: isNaN,
        isFinite: isFinite,
        localStorage: mockLocalStorage,
        navigator: { locks: mockLocks, onLine: true },
        BroadcastChannel: MockBroadcastChannel,
        alert: (msg) => { alerts.push(msg); },
        confirm: (msg) => confirmReturnValue,
        CountryConfig: require('../js/country-config.js').CountryConfig,
        SUPABASE_CONFIG: { storageKey: options.storageKey || 'em_test_hotfix' },
        lucide: { createIcons: () => {} }
    };
    sandbox.window = sandbox;
    sandbox.global = sandbox;

    const context = vm.createContext(sandbox);

    // Load scripts in order
    const storageCode = fs.readFileSync('js/storage.js', 'utf8');
    const walletCode = fs.readFileSync('js/wallet.js', 'utf8');
    const appCode = fs.readFileSync('js/app.js', 'utf8');

    vm.runInContext(storageCode, context);
    vm.runInContext(walletCode, context);
    vm.runInContext(appCode, context);

    return {
        sandbox,
        context,
        mockLocalStorage,
        domElements,
        getOrCreateElement,
        alerts,
        setConfirmResult: (val) => { confirmReturnValue = val; }
    };
}

async function runHotfixTests() {
    console.log('================================================================================');
    console.log('EXPENSE MANAGER — FINAL PHASE 5 RC HOTFIX VERIFICATION SUITE');
    console.log('================================================================================\n');

    // =========================================================================
    // TEST GROUP A: FINANCIAL FORM FAILURE HANDLING
    // =========================================================================
    console.log('--- TEST GROUP A: Financial Form Failure Handling (app.handleFormSubmit & app.deleteTx) ---');

    // Setup basic valid financial environment
    function setupValidFormEnvironment() {
        const env = createMockEnvironment();
        const { context, getOrCreateElement } = env;

        // Initialize state
        context.storage.state.preferences.onboardingCompleted = true;
        context.storage.state.wallets = {
            'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 50000, currency: '¥' },
            'Bank': { id: 'Bank', type: 'bank', region: 'JP', balance: 100000, currency: '¥' },
            'IndiaBank': { id: 'IndiaBank', type: 'bank', region: 'IN', balance: 75000, currency: '₹' }
        };
        context.storage.state.transactions = [];
        context.storage.state.revision = 1;
        context.storage.saveData();

        // Stub rendering methods to avoid DOM rendering overhead
        let renderAllCalled = false;
        context.app.renderAll = () => { renderAllCalled = true; };
        context.app.renderTransactionsPage = () => {};
        context.app.renderAnalyticsPage = () => {};
        context.app.renderHistory = () => {};

        // Modal element
        const modal = getOrCreateElement('transaction-modal');
        modal.classList.add('active');

        // Form fields
        getOrCreateElement('tx-date').value = '2026-11-19';
        getOrCreateElement('tx-wallet').value = 'Cash';
        getOrCreateElement('tx-category').value = 'food';
        getOrCreateElement('tx-amount').value = '2500';
        getOrCreateElement('tx-note').value = 'Lunch buffet';
        getOrCreateElement('tx-source').value = 'Bank';
        getOrCreateElement('tx-dest').value = 'Cash';
        getOrCreateElement('tx-amount-jpy').value = '10000';
        getOrCreateElement('tx-amount-inr').value = '5500';

        return { env, modal, getRenderAllCalled: () => renderAllCalled };
    }

    // A1: Expense returns false (e.g. invalid amount precision or walletManager rejection)
    {
        const { env, modal, getRenderAllCalled } = setupValidFormEnvironment();
        const { context, alerts, getOrCreateElement } = env;

        // Mock walletManager.addExpense to simulate financial rejection returning false
        const origAddExpense = context.walletManager.addExpense.bind(context.walletManager);
        context.walletManager.addExpense = () => false;

        const revBefore = context.storage.state.revision;
        const balanceBefore = context.storage.state.wallets['Cash'].balance;
        const txCountBefore = context.storage.state.transactions.length;

        const result = await context.app.handleFormSubmit(null, null, 'expense');

        assert(result === false, 'A1: handleFormSubmit returns false when addExpense fails');
        assert(modal.classList.contains('active'), 'A1: Transaction modal remains active and open');
        assert(getOrCreateElement('tx-amount').value === '2500', 'A1: Form amount preserved unchanged');
        assert(getOrCreateElement('tx-note').value === 'Lunch buffet', 'A1: Form note preserved unchanged');
        assert(getOrCreateElement('tx-wallet').value === 'Cash', 'A1: Form wallet preserved unchanged');
        assert(context.storage.state.wallets['Cash'].balance === balanceBefore, 'A1: Cash balance remained unchanged');
        assert(context.storage.state.transactions.length === txCountBefore, 'A1: No transaction was created');
        assert(context.storage.state.revision === revBefore, 'A1: Financial revision remained unchanged');
        assert(getRenderAllCalled() === false, 'A1: renderAll was not called on failure');
        assert(alerts.length > 0 && alerts[alerts.length - 1].includes('Could not record expense'), 'A1: Meaningful error message displayed');
        assert(context.app._isSubmitting === false, 'A1: _isSubmitting reset to false in finally');

        context.walletManager.addExpense = origAddExpense;
    }

    // A2: Expense returns { success: false, code: 'STATE_CONFLICT' }
    {
        const { env, modal, getRenderAllCalled } = setupValidFormEnvironment();
        const { context, alerts, getOrCreateElement } = env;

        // Mock runExclusive to return structured failure
        const origRunExclusive = context.storage.runExclusive.bind(context.storage);
        context.storage.runExclusive = async () => ({
            success: false,
            code: 'STATE_CONFLICT',
            conflict: true,
            error: 'Financial revision changed in another window.'
        });

        const revBefore = context.storage.state.revision;
        const result = await context.app.handleFormSubmit(null, null, 'expense');

        assert(result === false, 'A2: handleFormSubmit returns false on STATE_CONFLICT');
        assert(modal.classList.contains('active'), 'A2: Modal remains open on revision conflict');
        assert(getOrCreateElement('tx-amount').value === '2500', 'A2: Form amount preserved');
        assert(context.storage.state.revision === revBefore, 'A2: Revision unchanged');
        assert(alerts[alerts.length - 1].includes('Financial revision changed in another window'), 'A2: Conflict error alert displayed to user');
        assert(getRenderAllCalled() === false, 'A2: renderAll suppressed');
        assert(context.app._isSubmitting === false, 'A2: _isSubmitting cleanly reset');

        context.storage.runExclusive = origRunExclusive;
    }

    // A3: Expense encounters localStorage failure during commit
    {
        const { env, modal, getRenderAllCalled } = setupValidFormEnvironment();
        const { context, alerts, getOrCreateElement } = env;

        // Force localStorage.setItem to throw quota error
        const origSetItem = env.mockLocalStorage.setItem;
        env.mockLocalStorage.setItem = () => { throw new Error('QuotaExceededError: storage full'); };

        const revBefore = context.storage.state.revision;
        const balanceBefore = context.storage.state.wallets['Cash'].balance;

        const result = await context.app.handleFormSubmit(null, null, 'expense');

        assert(result === false, 'A3: handleFormSubmit returns false on localStorage quota failure');
        assert(modal.classList.contains('active'), 'A3: Modal remains open');
        assert(getOrCreateElement('tx-amount').value === '2500', 'A3: Form values intact');
        assert(context.storage.state.wallets['Cash'].balance === balanceBefore, 'A3: In-memory balance rolled back');
        assert(context.storage.state.revision === revBefore, 'A3: Revision not advanced');
        assert(alerts.length > 0, 'A3: User alerted of storage failure');
        assert(context.app._isSubmitting === false, 'A3: Lock cleared');

        env.mockLocalStorage.setItem = origSetItem;
    }

    // A4: Income returns false
    {
        const { env, modal, getRenderAllCalled } = setupValidFormEnvironment();
        const { context, alerts, getOrCreateElement } = env;

        const origAddIncome = context.walletManager.addIncome.bind(context.walletManager);
        context.walletManager.addIncome = () => false;

        const balanceBefore = context.storage.state.wallets['Cash'].balance;
        const result = await context.app.handleFormSubmit(null, null, 'income');

        assert(result === false, 'A4: handleFormSubmit returns false when addIncome fails');
        assert(modal.classList.contains('active'), 'A4: Modal remains open on income failure');
        assert(getOrCreateElement('tx-amount').value === '2500', 'A4: Amount preserved');
        assert(context.storage.state.wallets['Cash'].balance === balanceBefore, 'A4: Balance unchanged');
        assert(alerts[alerts.length - 1].includes('Could not record income'), 'A4: Income failure error alerted');
        assert(context.app._isSubmitting === false, 'A4: _isSubmitting reset');

        context.walletManager.addIncome = origAddIncome;
    }

    // A5: Income returns structured failure (e.g. STORAGE_UNAVAILABLE)
    {
        const { env, modal, getRenderAllCalled } = setupValidFormEnvironment();
        const { context, alerts } = env;

        const origRunExclusive = context.storage.runExclusive.bind(context.storage);
        context.storage.runExclusive = async () => ({
            success: false,
            code: 'STORAGE_UNAVAILABLE',
            error: 'Authoritative local storage is unavailable or invalid.'
        });

        const result = await context.app.handleFormSubmit(null, null, 'income');

        assert(result === false, 'A5: handleFormSubmit returns false on STORAGE_UNAVAILABLE');
        assert(modal.classList.contains('active'), 'A5: Modal stays open');
        assert(alerts[alerts.length - 1].includes('Authoritative local storage is unavailable'), 'A5: Structured error alerted');
        assert(context.app._isSubmitting === false, 'A5: _isSubmitting reset');

        context.storage.runExclusive = origRunExclusive;
    }

    // A6: Transaction deletion fails (app.deleteTx)
    {
        const { env, modal, getRenderAllCalled } = setupValidFormEnvironment();
        const { context, alerts } = env;

        // Insert a real transaction to delete
        context.storage.state.transactions.push({
            id: 'tx_to_delete',
            type: 'expense',
            walletId: 'Cash',
            amount: 1000,
            currency: '¥',
            date: '2026-11-19',
            categoryId: 'food'
        });
        context.storage.state.wallets['Cash'].balance = 49000;
        context.storage.saveData();

        // 6a: Missing transaction
        const resMissing = await context.app.deleteTx('non_existent_id');
        assert(resMissing === false, 'A6a: deleteTx returns false for missing transaction');
        assert(modal.classList.contains('active'), 'A6a: Modal remains open on missing transaction');
        assert(alerts[alerts.length - 1].includes('not found'), 'A6a: Not found alert displayed');

        // 6b: Deletion in closed month
        context.storage.state.closedMonths = { '2026-10': { status: 'closed' } };
        context.storage.state.transactions.push({
            id: 'tx_closed_month',
            type: 'expense',
            walletId: 'Cash',
            amount: 500,
            currency: '¥',
            date: '2026-10-15',
            categoryId: 'food'
        });
        context.storage.saveData();
        const resClosed = await context.app.deleteTx('tx_closed_month');
        assert(resClosed === false, 'A6b: deleteTx returns false for transaction in closed month');
        assert(modal.classList.contains('active'), 'A6b: Modal remains open on closed month attempt');
        assert(alerts[alerts.length - 1].includes('permanently sealed'), 'A6b: Closed month alert displayed');

        // 6c: walletManager.deleteTransaction returns false
        const origDelete = context.walletManager.deleteTransaction.bind(context.walletManager);
        context.walletManager.deleteTransaction = () => false;

        const txCountBefore = context.storage.state.transactions.length;
        const resFailed = await context.app.deleteTx('tx_to_delete');

        assert(resFailed === false, 'A6c: deleteTx returns false when deleteTransaction fails');
        assert(modal.classList.contains('active'), 'A6c: Modal remains open on deletion failure');
        assert(context.storage.state.transactions.length === txCountBefore, 'A6c: Transaction not removed');
        assert(context.storage.state.wallets['Cash'].balance === 49000, 'A6c: Wallet balance unchanged');
        assert(alerts[alerts.length - 1].includes('Could not delete transaction'), 'A6c: Deletion failure alert shown');
        assert(context.app._isSubmitting === false, 'A6c: _isSubmitting reset');

        context.walletManager.deleteTransaction = origDelete;
    }

    // A7: Transaction mutation throws an unexpected exception
    {
        const { env, modal } = setupValidFormEnvironment();
        const { context, alerts } = env;

        const origRunExclusive = context.storage.runExclusive.bind(context.storage);
        context.storage.runExclusive = async () => {
            throw new Error('Unexpected fatal engine fault');
        };

        const result = await context.app.handleFormSubmit(null, null, 'expense');

        assert(result === false, 'A7: handleFormSubmit handles thrown exception and returns false');
        assert(modal.classList.contains('active'), 'A7: Modal remains open when exception thrown');
        assert(alerts[alerts.length - 1].includes('Unexpected fatal engine fault'), 'A7: Thrown error message displayed');
        assert(context.app._isSubmitting === false, 'A7: _isSubmitting reset in finally');

        context.storage.runExclusive = origRunExclusive;
    }

    // A8: Rapid double-submission attempts
    {
        const { env, modal } = setupValidFormEnvironment();
        const { context, getOrCreateElement } = env;

        let lockRelease = null;
        const deferredMutation = new Promise(r => { lockRelease = r; });

        const origAddExpense = context.walletManager.addExpense.bind(context.walletManager);
        context.walletManager.addExpense = async (...args) => {
            await deferredMutation;
            return origAddExpense(...args);
        };

        // First click
        const p1 = context.app.handleFormSubmit(null, null, 'expense');
        assert(context.app._isSubmitting === true, 'A8: _isSubmitting is true during in-flight submission');

        // Immediate second click while first is in flight
        const p2 = context.app.handleFormSubmit(null, null, 'expense');
        const res2 = await p2;

        assert(res2 === false, 'A8: Rapid second submission was immediately rejected due to _isSubmitting lock');

        // Release first submission
        lockRelease();
        const res1 = await p1;

        assert(res1 === true, 'A8: First submission completed successfully');
        assert(!modal.classList.contains('active'), 'A8: Modal closed after verified first commit');
        assert(context.app._isSubmitting === false, 'A8: _isSubmitting is false after completion');
        assert(context.storage.state.transactions.length === 1, 'A8: Exactly one transaction was created (no duplicate)');

        context.walletManager.addExpense = origAddExpense;
    }

    // A9: Successful expense transaction
    {
        const { env, modal, getRenderAllCalled } = setupValidFormEnvironment();
        const { context, getOrCreateElement } = env;

        getOrCreateElement('tx-amount').value = '3000';
        getOrCreateElement('tx-note').value = 'Dinner';

        const revBefore = context.storage.state.revision;
        const balanceBefore = context.storage.state.wallets['Cash'].balance;

        const result = await context.app.handleFormSubmit(null, null, 'expense');

        assert(result === true, 'A9: Successful expense returns true');
        assert(!modal.classList.contains('active'), 'A9: Modal closed on success');
        assert(getRenderAllCalled() === true, 'A9: Dashboard and UI re-rendered');
        assert(context.storage.state.wallets['Cash'].balance === balanceBefore - 3000, 'A9: Cash balance debited accurately');
        assert(context.storage.state.revision === revBefore + 1, 'A9: Revision advanced monotonically');
        assert(context.storage.state.transactions[0].amount === 3000, 'A9: Transaction recorded with correct amount');
        assert(context.app._isSubmitting === false, 'A9: _isSubmitting is false');
    }

    // A10: Successful income and successful deletion
    {
        const { env, modal, getRenderAllCalled } = setupValidFormEnvironment();
        const { context, getOrCreateElement } = env;

        // Income
        getOrCreateElement('tx-amount').value = '15000';
        getOrCreateElement('tx-note').value = 'Consulting payment';

        const balanceBeforeIncome = context.storage.state.wallets['Cash'].balance;
        const resultIncome = await context.app.handleFormSubmit(null, null, 'income');

        assert(resultIncome === true, 'A10: Successful income returns true');
        assert(!modal.classList.contains('active'), 'A10: Modal closed after income');
        assert(context.storage.state.wallets['Cash'].balance === balanceBeforeIncome + 15000, 'A10: Cash balance credited');
        const createdIncomeTx = context.storage.state.transactions[0];
        assert(createdIncomeTx.amount === 15000, 'A10: Income transaction created');

        // Deletion
        modal.classList.add('active'); // Re-open modal as in edit mode
        const resultDelete = await context.app.deleteTx(createdIncomeTx.id);

        assert(resultDelete === true, 'A10: Successful deleteTx returns true');
        assert(!modal.classList.contains('active'), 'A10: Modal closed after deletion');
        assert(context.storage.state.wallets['Cash'].balance === balanceBeforeIncome, 'A10: Cash balance restored');
        assert(context.storage.state.transactions.every(t => t.id !== createdIncomeTx.id), 'A10: Transaction removed from continuous ledger');
    }

    // A11: Form submission with unknown/invalid type and submitEdit with inferred type
    {
        const { env } = setupValidFormEnvironment();
        const { context, getOrCreateElement, alerts } = env;
        getOrCreateElement('tx-amount').value = '1000';

        // Unknown type
        const resBadType = await context.app.handleFormSubmit(null, null, 'unknown_type');
        assert(resBadType === false, 'A11a: handleFormSubmit returns false for invalid type');
        assert(alerts.some(a => a.includes('valid transaction type')), 'A11a: Invalid type alert shown');
        assert(context.storage.state.transactions.length === 0, 'A11a: No transaction created for invalid type');

        // Missing type (null)
        const resNullType = await context.app.handleFormSubmit(null, null, null);
        assert(resNullType === false, 'A11a: handleFormSubmit returns false for missing type');

        // submitEdit without explicit type inherits original transaction type
        await context.storage.runExclusive(async () => {
            return context.walletManager.addExpense('Cash', 'food', 2500, 'Original note', '2026-11-15');
        });
        const createdTx = context.storage.state.transactions[0];
        getOrCreateElement('tx-amount').value = '3500';
        getOrCreateElement('tx-note').value = 'Updated note';
        getOrCreateElement('tx-category').value = 'food';
        getOrCreateElement('tx-wallet').value = 'Cash';

        const resEdit = await context.app.submitEdit(createdTx.id); // type is omitted/undefined
        assert(resEdit === true, 'A11b: submitEdit without explicit type succeeds by inferring tx.type');
        assert(context.storage.state.transactions[0].amount === 3500, 'A11b: Transaction amount updated');
        assert(context.storage.state.transactions[0].note === 'Updated note', 'A11b: Transaction note updated');
    }

    // A12: deleteCurrentDetailTransaction() failure and success handling
    {
        const { env } = setupValidFormEnvironment();
        const { context, getOrCreateElement } = env;
        await context.storage.runExclusive(async () => {
            return context.walletManager.addExpense('Cash', 'food', 2000, 'Detail test', '2026-11-15');
        });
        const tx = context.storage.state.transactions[0];
        const detailModal = getOrCreateElement('transaction-detail-modal');
        detailModal.classList.add('active');
        context.app.currentDetailTxId = tx.id;

        // Mock deletion failure
        const origDelete = context.walletManager.deleteTransaction.bind(context.walletManager);
        context.walletManager.deleteTransaction = () => false;

        const failRes = await context.app.deleteCurrentDetailTransaction();
        assert(failRes === false, 'A12: deleteCurrentDetailTransaction returns false when walletManager fails');
        assert(detailModal.classList.contains('active'), 'A12: Transaction detail modal remains active on failure');
        assert(context.storage.state.wallets['Cash'].balance === 48000, 'A12: Balance unchanged on detail delete failure');

        // Restore normal deletion and succeed
        context.walletManager.deleteTransaction = origDelete;
        const succRes = await context.app.deleteCurrentDetailTransaction();
        assert(succRes === true, 'A12: deleteCurrentDetailTransaction returns true on success');
        assert(!detailModal.classList.contains('active'), 'A12: Transaction detail modal closed on verified deletion');
        assert(context.storage.state.wallets['Cash'].balance === 50000, 'A12: Cash balance restored after detail deletion');
        assert(context.storage.state.transactions.every(t => t.id !== tx.id), 'A12: Transaction removed from ledger');
    }

    console.log('--- TEST GROUP A COMPLETE: All failure and success assertions passed ---\n');

    // =========================================================================
    // TEST GROUP B: DELAYED CLOUD ACKNOWLEDGMENTS & REVISION SAFETY
    // =========================================================================
    console.log('--- TEST GROUP B: Delayed Cloud Acknowledgments (Revision 10 vs Revision 11) ---');

    // Helper to setup mock Supabase environment
    function setupSyncEnvironment() {
        const env = createMockEnvironment({ storageKey: 'em_test_sync_b' });
        const { context } = env;

        const sm = context.storage;
        sm.currentUserId = 'user_test_revs';
        sm.initialSyncDone = true;
        sm.state.preferences.onboardingCompleted = true;
        sm.state.wallets = {
            'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 50000, currency: '¥' }
        };
        sm.state.transactions = [];

        return { env, sm, context };
    }

    // B1: REQUIRED TEST: Revision 10 versus Revision 11 Concurrency Race
    {
        console.log('  Running B1: Mandatory Revision 10 vs Revision 11 Concurrency Test');
        const { sm, context } = setupSyncEnvironment();

        // Step 1: Establish cloud revision 9
        sm.state.revision = 9;
        sm.lastConfirmedCloudRevision = 9;
        sm.lastConfirmedCloudFingerprint = sm.computeFinancialFingerprint(sm.state);
        sm._persistConfirmedCloudRevision(9, sm.lastConfirmedCloudFingerprint);

        // Step 2: Commit local revision 10
        sm.state.revision = 10;
        sm.state.transactions.push({ id: 'tx_rev10', type: 'expense', walletId: 'Cash', amount: 1000, date: '2026-11-19' });
        sm.state.wallets['Cash'].balance = 49000;
        const fingerprintRev10 = sm.computeFinancialFingerprint(sm.state);
        sm._saveDataDirect();

        assert(sm.state.revision === 10, 'B1.1: Local state established at revision 10');
        assert(sm.lastConfirmedCloudRevision === 9, 'B1.1: Cloud confirmed revision is 9');

        // Setup controlled deferred promise for network request of revision 10
        const req10Deferred = createDeferred();
        let interceptedPayload10 = null;
        let updateCallCount = 0;

        const mockSupabase = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: (table) => ({
                    update: (payload) => {
                        updateCallCount++;
                        if (updateCallCount === 1) {
                            interceptedPayload10 = JSON.parse(JSON.stringify(payload.state));
                            return {
                                eq: (f1, v1) => ({
                                    eq: (f2, v2) => ({
                                        select: () => req10Deferred.promise
                                    })
                                })
                            };
                        } else if (updateCallCount === 2) {
                            // Request for revision 11
                            interceptedPayload11 = JSON.parse(JSON.stringify(payload.state));
                            return {
                                eq: (f1, v1) => ({
                                    eq: (f2, v2) => ({
                                        select: () => req11Deferred.promise
                                    })
                                })
                            };
                        }
                    }
                })
            }
        };
        context.supabaseClient = mockSupabase;

        let interceptedPayload11 = null;
        const req11Deferred = createDeferred();

        // Step 3: Begin network request containing revision 10
        const pushPromise10 = sm.pushToSupabase({ expectedRemoteRevision: 9 });

        // Step 4: Hold response unresolved. Verify outbound payload snapshot is captured.
        assert(interceptedPayload10 !== null, 'B1.2: Network request dispatched for revision 10');
        assert(interceptedPayload10.revision === 10, 'B1.2: Outbound snapshot has revision 10');

        // Step 5: Commit another operation, producing local revision 11 while request 10 is in flight
        sm.state.revision = 11;
        sm.state.transactions.push({ id: 'tx_rev11', type: 'expense', walletId: 'Cash', amount: 2000, date: '2026-11-19' });
        sm.state.wallets['Cash'].balance = 47000;
        const fingerprintRev11 = sm.computeFinancialFingerprint(sm.state);
        sm._saveDataDirect();

        assert(sm.state.revision === 11, 'B1.3: Local state advanced to revision 11 while request 10 was in flight');
        assert(interceptedPayload10.transactions.length === 1, 'B1.3: Outbound request snapshot 10 was NOT mutated by local revision 11');

        // Step 6: Resolve first request with successful acknowledgment of revision 10
        req10Deferred.resolve({
            data: [{ state: { revision: 10 }, updated_at: new Date().toISOString() }],
            error: null
        });
        const pushResult10 = await pushPromise10;

        assert(pushResult10 === true, 'B1.4: Push request 10 resolved true');

        // Step 7: Verify ONLY revision 10 is cloud-confirmed
        assert(sm.lastConfirmedCloudRevision === 10, `B1.5: ONLY revision 10 is cloud-confirmed (actual: ${sm.lastConfirmedCloudRevision})`);
        assert(sm.lastConfirmedCloudFingerprint === fingerprintRev10, 'B1.5: Confirmed cloud fingerprint corresponds to revision 10, not 11');

        // Step 8: Verify revision 11 remains pending
        assert(sm.state.revision === 11, 'B1.6: Local state remains at revision 11');
        assert(sm.cloudSyncStatus === 'SYNC_PENDING', `B1.6: Sync status remains SYNC_PENDING (actual: ${sm.cloudSyncStatus})`);

        // Step 9: Allow the next cloud synchronization attempt (for revision 11)
        const pushPromise11 = sm.pushToSupabase({ expectedRemoteRevision: 10 });
        assert(interceptedPayload11 !== null, 'B1.7: Second network request dispatched for revision 11');
        assert(interceptedPayload11.revision === 11, 'B1.7: Outbound snapshot 11 contains revision 11');
        assert(interceptedPayload11.transactions.length === 2, 'B1.7: Outbound payload 11 contains both transactions');

        // Step 10: Confirm revision 11
        req11Deferred.resolve({
            data: [{ state: { revision: 11 }, updated_at: new Date().toISOString() }],
            error: null
        });
        const pushResult11 = await pushPromise11;

        assert(pushResult11 === true, 'B1.8: Push request 11 resolved true');
        assert(sm.lastConfirmedCloudRevision === 11, 'B1.8: Revision 11 is now cloud-confirmed');
        assert(sm.lastConfirmedCloudFingerprint === fingerprintRev11, 'B1.8: Confirmed cloud fingerprint corresponds to revision 11');

        // Step 11: Verify application reports Synced only after the second acknowledgment
        assert(sm.cloudSyncStatus === 'CONFIRMED', `B1.9: Application reports CONFIRMED/Synced only after revision 11 acknowledgment (actual: ${sm.cloudSyncStatus})`);
    }

    // B2: Old response arrives after a newer local mutation and newer confirmation
    {
        const { sm, context } = setupSyncEnvironment();

        sm.state.revision = 12;
        sm.lastConfirmedCloudRevision = 12;
        sm._persistConfirmedCloudRevision(12);

        const oldDeferred = createDeferred();
        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => oldDeferred.promise
                            })
                        })
                    })
                })
            }
        };

        // Simulated stale in-flight request dispatched for revision 10
        sm.state.revision = 10;
        const stalePush = sm.pushToSupabase({ expectedRemoteRevision: 9 });
        sm.state.revision = 12; // Local is now 12 and already confirmed 12

        // Resolve stale request 10
        oldDeferred.resolve({
            data: [{ state: { revision: 10 } }],
            error: null
        });
        await stalePush;

        assert(sm.lastConfirmedCloudRevision === 12, 'B2: Stale response 10 did not regress confirmed cloud revision from 12');
    }

    // B3: Network timeout before server commit
    {
        const { sm, context, env } = setupSyncEnvironment();
        sm.state.revision = 10;
        sm.lastConfirmedCloudRevision = 9;

        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => Promise.reject(new Error('Network timeout: connection reset'))
                            })
                        })
                    })
                })
            }
        };

        sm.enqueueCloudSync(10);
        await new Promise(r => setTimeout(r, 20));

        assert(sm.cloudSyncStatus === 'FAILED', 'B3: Sync status is FAILED on network timeout');
        assert(sm.lastConfirmedCloudRevision === 9, 'B3: Confirmed revision remains at 9');
        assert(env.mockLocalStorage.getItem(`${sm.getActiveStorageKey()}_pending_sync`) !== null, 'B3: Pending sync metadata survives network failure');
    }

    // B4: Network timeout after server commit (client error)
    {
        const { sm, context, env } = setupSyncEnvironment();
        sm.state.revision = 10;
        sm.lastConfirmedCloudRevision = 9;

        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => Promise.reject(new Error('HTTP 504 Gateway Timeout'))
                            })
                        })
                    })
                })
            }
        };

        const res = await sm.pushToSupabase({ expectedRemoteRevision: 9 });
        assert(res === false, 'B4: pushToSupabase returns false on 504 timeout');
        assert(sm.lastConfirmedCloudRevision === 9, 'B4: Revision not blindly incremented without authoritative ack');
        assert(sm.cloudSyncStatus === 'FAILED', 'B4: Sync status is FAILED');
    }

    // B5: CAS returns zero updated rows (cloud modified by another device)
    {
        const { sm, context } = setupSyncEnvironment();
        sm.state.revision = 10;
        sm.lastConfirmedCloudRevision = 9;

        const remoteConflictingState = JSON.parse(JSON.stringify(sm.state));
        remoteConflictingState.revision = 11;
        remoteConflictingState.transactions.push({ id: 'remote_tx_b', amount: 500 });

        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => Promise.resolve({ data: [], error: null }) // 0 rows updated
                            })
                        })
                    }),
                    select: () => ({
                        eq: () => ({
                            single: () => Promise.resolve({ data: { state: remoteConflictingState }, error: null })
                        })
                    })
                })
            }
        };

        const res = await sm.pushToSupabase({ expectedRemoteRevision: 9 });

        assert(res === false, 'B5: pushToSupabase returns false on 0 rows updated');
        assert(sm.cloudSyncStatus === 'CONFLICT', 'B5: Sync status transitioned to CONFLICT');
        assert(sm.activeConflict !== null, 'B5: Conflict stash created with local and remote states');
        assert(sm.lastConfirmedCloudRevision === 9, 'B5: Confirmed revision not advanced on conflict');
    }

    // B6: Supabase returns a server error
    {
        const { sm, context } = setupSyncEnvironment();
        sm.state.revision = 10;

        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => Promise.resolve({ data: null, error: { message: 'Database disk full', code: '500' } })
                            })
                        })
                    })
                })
            }
        };

        const res = await sm.pushToSupabase();
        assert(res === false, 'B6: pushToSupabase returns false on database error');
        assert(sm.cloudSyncStatus === 'FAILED', 'B6: Sync status is FAILED');
        assert(sm.syncError === 'Database disk full', 'B6: Error message captured accurately');
    }

    // B7: Supabase returns malformed or unexpected acknowledgment data
    {
        const { sm, context } = setupSyncEnvironment();
        sm.state.revision = 10;
        sm.lastConfirmedCloudRevision = 9;

        // Malformed 1: Mismatched revision
        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => Promise.resolve({ data: [{ state: { revision: 999 } }], error: null })
                            })
                        })
                    })
                })
            }
        };

        const resMismatch = await sm.pushToSupabase({ expectedRemoteRevision: 9 });
        assert(resMismatch === false, 'B7.1: Mismatched server revision rejected');
        assert(sm.lastConfirmedCloudRevision === 9, 'B7.1: Confirmed revision not corrupted by malformed response');
        assert(sm.cloudSyncStatus === 'FAILED', 'B7.1: Status is FAILED');

        // Malformed 2: state is not an object
        context.supabaseClient.client.from = () => ({
            update: () => ({
                eq: () => ({
                    eq: () => ({
                        select: () => Promise.resolve({ data: [{ state: "corrupt_string" }], error: null })
                    })
                })
            })
        });

        const resCorrupt = await sm.pushToSupabase({ expectedRemoteRevision: 9 });
        assert(resCorrupt === false, 'B7.2: Corrupt state payload in response rejected');
        assert(sm.lastConfirmedCloudRevision === 9, 'B7.2: Confirmed revision remains safe');
    }

    // B8: Authentication changes while a request is pending
    {
        const { sm, context } = setupSyncEnvironment();
        sm.state.revision = 10;
        sm.currentUserId = 'user_initial';

        const deferredAuth = createDeferred();
        context.supabaseClient = {
            session: { user: { id: 'user_initial' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => deferredAuth.promise
                            })
                        })
                    })
                })
            }
        };

        const pushAuth = sm.pushToSupabase({ expectedRemoteRevision: 9 });

        // While request is in flight, user switches accounts
        context.supabaseClient.session.user.id = 'user_different';
        sm.currentUserId = 'user_different';

        // Resolve original request
        deferredAuth.resolve({
            data: [{ state: { revision: 10 } }],
            error: null
        });
        const resAuth = await pushAuth;

        assert(resAuth === false, 'B8: In-flight push discarded when user session changed');
    }

    // B9: Browser restart after locally saved but unconfirmed edits
    {
        const { sm, env } = setupSyncEnvironment();
        sm.state.revision = 7;
        sm._persistConfirmedCloudRevision(5);
        sm._saveDataDirect();

        // Simulate new browser session reloading state
        const smRestarted = new env.context.storage.constructor();
        smRestarted.onUserLogin('user_test_revs');

        assert(smRestarted.state.revision === 7, 'B9: Local revision 7 restored on restart');
        assert(smRestarted.lastConfirmedCloudRevision === 5, 'B9: Confirmed cloud revision 5 restored from metadata');
        assert(smRestarted.state.revision > smRestarted.lastConfirmedCloudRevision, 'B9: Restarted application recognizes unconfirmed local changes');
    }

    // B10: Queue resumes after network reconnect
    {
        const { sm, context, env } = setupSyncEnvironment();
        sm.state.revision = 10;
        sm.lastConfirmedCloudRevision = 9;

        // Store pending sync
        env.mockLocalStorage.setItem(`${sm.getActiveStorageKey()}_pending_sync`, JSON.stringify({
            userId: 'user_test_revs',
            targetRevision: 10,
            timestamp: Date.now()
        }));

        let pushCalledOnReconnect = false;
        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => {
                                    pushCalledOnReconnect = true;
                                    return Promise.resolve({ data: [{ state: { revision: 10 } }], error: null });
                                }
                            })
                        })
                    })
                })
            }
        };

        // Simulate browser firing online event
        sm.onNetworkOnline();
        await new Promise(r => setTimeout(r, 20));

        assert(pushCalledOnReconnect === true, 'B10: Cloud synchronization resumed automatically on network online');
        assert(sm.lastConfirmedCloudRevision === 10, 'B10: Pending revision 10 confirmed after reconnect');
        assert(sm.cloudSyncStatus === 'CONFIRMED', 'B10: Status reports CONFIRMED after reconnect drain');
    }

    // B11: Outbound state payload cannot be mutated after request dispatch
    {
        const { sm, context } = setupSyncEnvironment();
        sm.state.revision = 10;
        sm.state.wallets['Cash'].balance = 50000;

        let capturedPayload = null;
        const deferredDispatch = createDeferred();

        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: (p) => {
                        capturedPayload = p.state;
                        return {
                            eq: () => ({
                                eq: () => ({
                                    select: () => deferredDispatch.promise
                                })
                            })
                        };
                    }
                })
            }
        };

        const pushPromise = sm.pushToSupabase({ expectedRemoteRevision: 9 });

        // Attempt malicious mutation of live in-memory state while request is in flight
        sm.state.wallets['Cash'].balance = 999999;
        sm.state.transactions.push({ id: 'injected_tx', amount: 12345 });

        assert(capturedPayload.wallets['Cash'].balance === 50000, 'B11: Outbound payload balance was not affected by subsequent in-memory mutation');
        assert(capturedPayload.transactions.length === 0, 'B11: Outbound payload transactions array was isolated from subsequent push');

        deferredDispatch.resolve({ data: [{ state: { revision: 10 } }], error: null });
        await pushPromise;
    }

    // B12: Acknowledged fingerprint differs from current local fingerprint
    {
        const { sm, context } = setupSyncEnvironment();
        sm.state.revision = 10;
        sm.lastConfirmedCloudRevision = 9;

        const deferredFP = createDeferred();
        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => deferredFP.promise
                            })
                        })
                    })
                })
            }
        };

        const pushP = sm.pushToSupabase({ expectedRemoteRevision: 9 });

        // Local state mutates
        sm.state.revision = 11;
        sm.state.wallets['Cash'].balance = 12345; // Changes fingerprint

        deferredFP.resolve({ data: [{ state: { revision: 10 } }], error: null });
        await pushP;

        assert(sm.lastConfirmedCloudRevision === 10, 'B12: Revision 10 confirmed');
        assert(sm.cloudSyncStatus === 'SYNC_PENDING', 'B12: Status is SYNC_PENDING because local fingerprint differs');
    }

    // B13: Initial cloud creation (isInitialization) respects snapshot and acknowledgment discipline
    {
        const { sm, context } = setupSyncEnvironment();
        sm.state.revision = 1;
        sm.lastConfirmedCloudRevision = 0;

        let insertedPayload = null;
        const deferredInit = createDeferred();

        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    insert: (p) => {
                        insertedPayload = p.state;
                        return {
                            select: () => deferredInit.promise
                        };
                    }
                })
            }
        };

        const initPromise = sm.pushToSupabase({ isInitialization: true });

        // While insert is pending, local state mutates to revision 2
        sm.state.revision = 2;
        sm.state.wallets['Cash'].balance = 48000;

        assert(insertedPayload.revision === 1, 'B13: Inserted initial payload captured snapshot with revision 1');

        deferredInit.resolve({ data: [{ state: { revision: 1 } }], error: null });
        const initRes = await initPromise;

        assert(initRes === true, 'B13: isInitialization push returns true');
        assert(sm.lastConfirmedCloudRevision === 1, 'B13: Cloud confirmed revision is 1, not mutated local revision 2');
        assert(sm.cloudSyncStatus === 'SYNC_PENDING', 'B13: Sync status is SYNC_PENDING because local revision 2 is unconfirmed');
    }

    // B14: Account isolation - server response user_id mismatch rejected
    {
        const { sm, context } = setupSyncEnvironment();
        sm.state.revision = 10;
        sm.currentUserId = 'user_test_revs';

        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => Promise.resolve({
                                    data: [{ user_id: 'attacker_user_id', state: { revision: 10 } }],
                                    error: null
                                })
                            })
                        })
                    })
                })
            }
        };

        const resMismatchUser = await sm.pushToSupabase({ expectedRemoteRevision: 9 });
        assert(resMismatchUser === false, 'B14: Server response with mismatched user_id rejected');
        assert(sm.cloudSyncStatus === 'FAILED', 'B14: Cloud sync status is FAILED on account mismatch');
        assert(sm.lastConfirmedCloudRevision === 0, 'B14: Confirmed revision not advanced for wrong account');
    }

    // B15: Ambiguous commit recovery on CAS 0 rows (server already committed identical revision)
    {
        const { sm, context } = setupSyncEnvironment();
        sm.state.revision = 10;
        sm.lastConfirmedCloudRevision = 9;

        const committedRemoteState = JSON.parse(JSON.stringify(sm.state));

        context.supabaseClient = {
            session: { user: { id: 'user_test_revs' } },
            client: {
                from: () => ({
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: () => Promise.resolve({ data: [], error: null }) // 0 rows updated
                            })
                        })
                    }),
                    select: () => ({
                        eq: () => ({
                            single: () => Promise.resolve({
                                data: { user_id: 'user_test_revs', state: committedRemoteState },
                                error: null
                            })
                        })
                    })
                })
            }
        };

        const resRecovery = await sm.pushToSupabase({ expectedRemoteRevision: 9 });
        assert(resRecovery === true, 'B15: Authoritative server check confirms revision when server already committed it');
        assert(sm.lastConfirmedCloudRevision === 10, 'B15: Confirmed cloud revision updated to 10');
        assert(sm.cloudSyncStatus === 'CONFIRMED', 'B15: Status transitioned to CONFIRMED after ambiguous commit recovery');
    }

    console.log('--- TEST GROUP B COMPLETE: All concurrency and acknowledgment assertions passed ---\n');

    console.log('================================================================================');
    console.log(`FINAL RESULTS: ${passedAssertions}/${totalAssertions} assertions passed (0 failures).`);
    console.log('================================================================================\n');

    process.exit(0);
}

runHotfixTests().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
});
