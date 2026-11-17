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

console.log("--- AUDITING BUDGET COMPATIBILITY & SYNCHRONIZATION ---");

// Step 1: Initialize with budget of 50000
s.state.jpTotalBudget = 50000;
s.state.budgets.JP.monthlyTotal = 50000;
s.saveData();

console.log('Initial jpTotalBudget:', s.state.jpTotalBudget);
console.log('Initial budgets.JP.monthlyTotal:', s.state.budgets.JP.monthlyTotal);

// Scenario A: Existing code updates storage.state.jpTotalBudget directly (e.g. app.js line 7688)
s.state.jpTotalBudget = 75000;
s.saveData();

console.log('\nAfter direct s.state.jpTotalBudget = 75000:');
console.log('s.state.jpTotalBudget:', s.state.jpTotalBudget);
console.log('s.state.budgets.JP.monthlyTotal:', s.state.budgets.JP.monthlyTotal);

// Scenario B: What happens if state is reloaded or migrated from storage?
const reloaded = s.loadData();
console.log('\nAfter s.loadData():');
console.log('reloaded.jpTotalBudget:', reloaded.jpTotalBudget);
console.log('reloaded.budgets.JP.monthlyTotal:', reloaded.budgets.JP.monthlyTotal);

// Scenario C: Calling setBudgetEnabled('JP', false)
s.setBudgetEnabled('JP', false);
console.log('\nAfter setBudgetEnabled("JP", false):');
console.log('s.isBudgetEnabled("JP"):', s.isBudgetEnabled('JP'));
console.log('s.state.budgets.JP.monthlyTotal (amount preserved?):', s.state.budgets.JP.monthlyTotal);
console.log('s.state.jpTotalBudget (amount preserved?):', s.state.jpTotalBudget);

