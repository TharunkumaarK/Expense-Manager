const fs = require('fs');

global.window = global;
global.CountryConfig = require('../js/country-config.js').CountryConfig;
global.SUPABASE_CONFIG = { storageKey: 'em_connected_v2_test' };
const store = {};
global.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; }
};

const storageCode = fs.readFileSync('js/storage.js', 'utf8');
const vm = require('vm');
vm.runInThisContext(storageCode);

const s = new StorageManager();

console.log("--- RUNNING DETAILED EDGE CASE AUDIT ---");

// Test 1: Zero transactions + non-zero wallet balances
const s1 = {
    schemaVersion: 3,
    wallets: {
        'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 50000, currency: '¥' },
        'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 0, currency: '¥' },
        'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', balance: 0, currency: '¥' },
        'Bank Account': { id: 'Bank Account', type: 'bank', region: 'IN', balance: 0, currency: '₹' }
    },
    transactions: [],
    jpTotalBudget: 0,
    inTotalBudget: 0
};
console.log('1. Zero txs + non-zero balance hasEstablished:', s.hasEstablishedFinancialData(s1));
const p1 = s.previewContinuousLedgerMigration(s1);
console.log('   Migration onboardingCompleted:', p1.migratedState.preferences.onboardingCompleted);

// Test 2: Zero transactions + customized budgets
const s2 = {
    schemaVersion: 3,
    wallets: {
        'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 0, currency: '¥' },
        'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 0, currency: '¥' },
        'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', balance: 0, currency: '¥' },
        'Bank Account': { id: 'Bank Account', type: 'bank', region: 'IN', balance: 0, currency: '₹' }
    },
    transactions: [],
    jpTotalBudget: 60000,
    inTotalBudget: 0
};
console.log('2. Zero txs + custom budget hasEstablished:', s.hasEstablishedFinancialData(s2));
const p2 = s.previewContinuousLedgerMigration(s2);
console.log('   Migration onboardingCompleted:', p2.migratedState.preferences.onboardingCompleted);

// Test 3: Zero transactions + loan configuration
const s3 = {
    schemaVersion: 3,
    wallets: {
        'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 0, currency: '¥' },
        'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 0, currency: '¥' },
        'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', balance: 0, currency: '¥' },
        'Bank Account': { id: 'Bank Account', type: 'bank', region: 'IN', balance: 0, currency: '₹' }
    },
    transactions: [],
    jpTotalBudget: 0,
    inTotalBudget: 0,
    loanConfig: { enabled: true, totalPrincipal: 100000 }
};
console.log('3. Zero txs + loan config hasEstablished:', s.hasEstablishedFinancialData(s3));
const p3 = s.previewContinuousLedgerMigration(s3);
console.log('   Migration onboardingCompleted:', p3.migratedState.preferences.onboardingCompleted);

// Test 4: Default wallet names + 1 yen modified balance
const s4 = {
    schemaVersion: 3,
    wallets: {
        'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 1, currency: '¥' },
        'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 0, currency: '¥' },
        'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', balance: 0, currency: '¥' },
        'Bank Account': { id: 'Bank Account', type: 'bank', region: 'IN', balance: 0, currency: '₹' }
    },
    transactions: [],
    jpTotalBudget: 0,
    inTotalBudget: 0
};
console.log('4. Default wallet names + 1 yen balance hasEstablished:', s.hasEstablishedFinancialData(s4));
const p4 = s.previewContinuousLedgerMigration(s4);
console.log('   Migration onboardingCompleted:', p4.migratedState.preferences.onboardingCompleted);

// Test 5: Genuinely new account
const s5 = JSON.parse(JSON.stringify(defaultState));
console.log('5. Genuinely new account hasEstablished:', s.hasEstablishedFinancialData(s5));
const p5 = s.previewContinuousLedgerMigration(s5);
console.log('   Migration onboardingCompleted on fresh default:', p5.migratedState.preferences.onboardingCompleted);

// Test 6: Cloud sync failure behavior on empty local state
s.accountStatus = 'SYNC_FAILED';
console.log('6. isNewUser when SYNC_FAILED on empty local state:', s.isNewUser());
console.log('   getAccountStatus():', s.getAccountStatus());

