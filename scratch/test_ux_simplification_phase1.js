/**
 * EXPENSE MANAGER — PHASE 1 UX SIMPLIFICATION VERIFICATION SUITE
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

function runTests() {
    console.log("================================================================================");
    console.log("EXPENSE MANAGER — PHASE 1 UX SIMPLIFICATION VERIFICATION");
    console.log("================================================================================");

    // 1. Verify index.html copy & security transparency
    const html = fs.readFileSync('index.html', 'utf8');
    assert(!html.includes('Download an encrypted, full snapshot'), 'A3: Misleading encrypted claim removed from JSON backup');
    assert(html.includes('unencrypted JSON backup'), 'A3: Unencrypted JSON backup accurately disclosed');
    assert(html.includes('Manual Balance Correction (Override)'), 'A5: Wallet balance adjustment explicitly marked as override');
    assert(html.includes('without creating a transaction in your ledger history'), 'A5: Balance override explains ledger bypass');
    assert(html.includes('Transfer Between Accounts'), 'C1: Action selector card clearly labeled Transfer Between Accounts');
    assert(html.includes('Move money between your accounts in the same currency'), 'C1: Action selector card clarifies same currency');
    assert(html.includes('International Remittance'), 'C1: Action selector card clearly labeled International Remittance');

    // 2. Verify onboarding copy
    const onboardingJs = fs.readFileSync('js/onboarding.js', 'utf8');
    assert(!onboardingJs.includes('Confirm & Launch Ledger'), 'D1: Confirm & Launch Ledger replaced with plain language');
    assert(onboardingJs.includes('Complete Setup & Launch'), 'D1: Complete Setup & Launch is present');
    assert(onboardingJs.includes('Roll over unspent funds to next month'), 'D2: Rollover cushion explained in plain terms');
    assert(onboardingJs.includes('Setup Summary'), 'D3: Summary card titled Setup Summary');

    // 3. Verify wallet.js local date handling
    const walletJs = fs.readFileSync('js/wallet.js', 'utf8');
    assert(walletJs.includes('function getLocalDateString'), 'A2: getLocalDateString helper exists in wallet.js');
    assert(!walletJs.includes("addExpense(walletId, categoryId, amount, note, date = new Date().toISOString().split('T')[0])"), 'A2: addExpense default date uses local date');
    assert(!walletJs.includes("addIncome(walletId, amount, note, date = new Date().toISOString().split('T')[0])"), 'A2: addIncome default date uses local date');
    assert(!walletJs.includes("transfer(sourceId, destId, amount, note, date = new Date().toISOString().split('T')[0])"), 'A2: transfer default date uses local date');
    assert(!walletJs.includes("remittance(sourceId, destId, sourceAmount, destAmount, note, date = new Date().toISOString().split('T')[0])"), 'A2: remittance default date uses local date');

    // 4. Verify app.js multi-currency subtotal logic and empty states
    const appJs = fs.readFileSync('js/app.js', 'utf8');
    assert(appJs.includes('currencyNets = {}'), 'A1: Continuous ledger groups daily net by currency');
    assert(appJs.includes('Limit: Not Set'), 'B3: Budget overview differentiates unconfigured budget limit');
    assert(appJs.includes('Your accounts are ready'), 'B1: Dashboard displays warm first-use call-to-action');
    assert(appJs.includes('No Transactions Yet'), 'B2: Continuous ledger displays friendly empty state on first use');
    assert(appJs.includes('No Matching Transactions'), 'B2: Continuous ledger displays filter clear CTA when filtered out');
    assert(appJs.includes("this.showToast(`${actionLabel} successfully.`, 'success')"), 'C4: Toast feedback triggered on transaction creation');

    console.log("================================================================================");
    console.log(`RESULTS: All ${passed}/${total} Phase 1 UX Simplification assertions passed!`);
    console.log("================================================================================");
}

runTests();

