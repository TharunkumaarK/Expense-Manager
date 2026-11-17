# Expense Manager — Onboarding & Multi-Country Test Matrix

**Application:** Expense Manager  
**Branch:** `test`  
**Phase:** Test Architecture & Verification Matrix  
**Status:** **SPECIFIED & READY FOR TEST HARNESS**  
**Document:** `scratch/onboarding_test_matrix.md`

---

## 1. Test Architecture Overview

All tests are designed to execute through an automated, isolated headless Chromium test harness (using `--user-data-dir` in `/tmp`, zero network calls, zero Supabase writes, and mocked storage).

### Invariant Gates Tested:
1. **Mathematical Balance Invariance:** Total wallet balance equals opening balance plus credits minus debits without floating-point rounding drift.
2. **Transaction ID Stability:** Every transaction maintains its timestamp ID. Zero collisions or duplicate entries.
3. **Continuous Ledger Integrity:** All active and historical transactions reside in a single chronological array.
4. **Zero Data Loss on Deactivation:** Deactivating a country never removes past transactions or wallet objects.
5. **Envelope Normalization & Validation:** Both plain backups and wrapped production exports validate and migrate identically.

---

## 2. Test Personas & Scenarios

| Scenario ID | Test Name / Scope | Initial State | Expected Post-Condition | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | **New Single-Country User (Germany EUR)** | Empty state / first login | • Selected `DE` only.<br>• Wallets: Checking Account (€), Cash (€).<br>• Country switcher pills hidden.<br>• Cross-Currency Transfer button hidden.<br>• Dashboard shows only € values.<br>• Budgeting optional. | Headless automated onboarding simulation. |
| **TC-02** | **New Dual-Country User (Japan + India)** | Empty state / first login | • Selected `JP` and `IN`.<br>• Wallets configured in JPY and INR.<br>• Country tabs present on Dashboard/Budgets.<br>• Cross-Currency Transfer active.<br>• Independent budgets for JP (rollover) and IN. | Headless automated onboarding simulation. |
| **TC-03** | **Existing Production User Continuity** | 2026-11-16 Production Export (116 txs, 6 wallets) | • Bypasses onboarding setup wizard.<br>• Infers `activeCountries = ['JP', 'IN']`.<br>• All 116 transactions preserved.<br>• All 6 wallet balances match exact floats.<br>• Tour displays with prominent 'Skip' button. | Real export fixture migration test. |
| **TC-04** | **Wallet Opening Balance Accounting** | Wallet created with 50,000 ¥ opening balance | • `wallet.balance === 50000`<br>• `wallet.openingBalance === 50000`<br>• Zero synthetic income transactions in ledger.<br>• Monthly income report shows 0 ¥ income. | Storage & reporting assertion. |
| **TC-05** | **Stable Wallet ID & Renaming** | Rename 'Salary Account' to 'Mizuho Main' | • `wallet.id === 'Salary Account'` (unchanged).<br>• `wallet.name === 'Mizuho Main'`.<br>• 100% of historical transactions still reference `walletId: 'Salary Account'`.<br>• Zero ledger mutations. | Continuous ledger diff audit. |
| **TC-06** | **Internal Transfer Execution & Reversal** | 5,000 ₹ transfer from Axis Bank to Bank of Baroda | • Live balance preview displays before save.<br>• Axis Bank debited 5,000 ₹, BoB credited 5,000 ₹.<br>• Detail sheet shows 'Reverse & Restore Balances'.<br>• Reversal restores exact original balances. | Transaction execution & reversal test. |
| **TC-07** | **Cross-Currency Transfer (EUR → INR)** | 500 € transfer from DE Checking to Axis Bank (Rate: 90.5) | • Prompts for amount sent (€) and received (₹).<br>• Shows live debit/credit preview.<br>• DE Checking debited 500 €, Axis credited 45,250 ₹.<br>• Reversal restores exact EUR and INR amounts. | Cross-currency transaction test. |
| **TC-08** | **Country Deactivation & Zero Loss** | User deactivates 'Germany' after recording 10 EUR txs | • Germany tabs hidden from Dashboard & Navigation.<br>• All 10 EUR transactions remain in continuous ledger.<br>• Global reports and transaction search retain EUR txs.<br>• Re-activating Germany restores tabs and wallets cleanly. | State toggle & ledger scan test. |
| **TC-09** | **Independent Budgeting & Rollover** | JP budgeting enabled (50k ¥, rollover on); DE budgeting enabled (1.2k €, rollover off); IN disabled | • Month close pools unused JP category savings into `jpTotalBudget`.<br>• DE budget does not roll over (fixed 1,200 €).<br>• IN shows no budget bars or warnings.<br>• Snapshots recorded in `closedMonths`. | Month closing execution test. |
| **TC-10** | **Loan Tracking Integration** | Loan tracker enabled with EUR currency (mortgage) | • Home view displays widget with € formatting.<br>• Correctly calculates days until EMI and principal remaining.<br>• Settings toggle hides widget without deleting data.<br>• Existing INR loan preserved for production users. | Loan state calculation test. |
| **TC-11** | **Native Spotlight Tour Flow & Skip** | Guided tour triggered on first load | • Masks background and highlights target elements.<br>• Steps adapt: skips cross-currency step if single-country.<br>• 'Skip Tour' exits immediately and sets `tourCompleted = true`.<br>• 'Replay Guided Tour' in Settings re-launches overlay. | DOM overlay interaction test. |
| **TC-12** | **Category Fallback & Display** | Category ID `jp-relocation-1791809386872` and `in-room-101` | • `jp-relocation-1791809386872` displays as **`Relocation`**.<br>• `in-room-101` displays as **`Room 101`** (numeric suffix preserved).<br>• Zero modifications to stored category IDs or catalogs. | `getCategoryName()` assertion. |
| **TC-13** | **Backup Normalization & Malformed Rejection** | Plain backup vs Wrapped production export vs Malformed wrapper | • Plain backup restores cleanly.<br>• Wrapped export normalizes and restores cleanly.<br>• `state: null` and `state: {}` rejected with descriptive errors.<br>• Zero leakage of wrapper to continuous ledger. | Importer & validator test. |
| **TC-14** | **Fail-Closed Security Invariant** | Unknown projectRef or service_role key provided | • Client initialization throws hard exception.<br>• Zero network requests dispatched.<br>• Application fails closed. | `supabaseClient.js` guard test. |

---

## 3. Verification Automation Script Blueprint

A dedicated headless test runner script, `scratch/verify_onboarding_implementation.py`, will be authored during Phase 2–5 implementation to execute this entire matrix automatically and output a machine-readable pass/fail scorecard.

