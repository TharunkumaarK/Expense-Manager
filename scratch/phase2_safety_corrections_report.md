# Expense Manager — Phase 2 Safety Corrections Report

**Application:** Expense Manager  
**Branch:** `test`  
**Phase:** Phase 2 Safety Corrections  
**Date:** 2026-11-17  
**Status:** **ALL 3 ISSUES RESOLVED & VERIFIED (165/165 AUTOMATED CHECKS PASSING)**  
**Working Tree Status:** **CHANGES UNCOMMITTED (Awaiting User Manual Testing & Approval)**  
**Deliverable:** `scratch/phase2_safety_corrections_report.md`  

---

## 1. Executive Summary

Following the findings documented in `scratch/phase2_final_safety_review.md`, the three confirmed safety issues in the Phase 2 user preferences and account configuration layer were corrected on the local `test` branch.

All corrections strictly follow fail-closed, data-preservation principles:
1. **Issue 1 (New-User Classification):** `StorageManager.prototype.isNewUser()` was made strictly deterministic based on `this.accountStatus`. Only a confirmed `NEW_USER` evaluates to `true`. Returning users on new devices during network outages (`SYNC_FAILED`), incomplete onboarding sessions (`ONBOARDING_INCOMPLETE`), or uninitialized sessions (`UNRESOLVED`) evaluate to `false`, preventing false-positive wizard triggers.
2. **Issue 2 (Budget Synchronization & Persistence):** Bi-directional reactive synchronization was established between legacy properties (`jpTotalBudget`, `inTotalBudget`) and sovereign budget structures (`budgets.JP.monthlyTotal`, `budgets.IN.monthlyTotal`) using `Object.defineProperty` dynamic property accessors (`_attachBudgetAccessors`), centralized update method `setTotalBudget()`, and migration envelope reconciliation. Direct assignments in legacy components now immediately mutate the sovereign configuration, and changes survive `saveData()`, `loadData()`, Supabase sync, and continuous ledger migration. German budgeting is completely isolated and decoupled.
3. **Issue 3 (Push-to-Supabase Safety):** `StorageManager.prototype.pushToSupabase()` now enforces fail-closed safety. Un-onboarded accounts (`NEW_USER` or `ONBOARDING_INCOMPLETE`) with zero financial transaction history and zero non-zero wallet balances are prevented from pushing placeholder defaults to Supabase unless the user explicitly completes onboarding (`markOnboardingCompleted(true)`) or explicitly forces persistence. Sync failures (`SYNC_FAILED`) abort immediately with `false`, leaving cloud storage untouched.

All 165 automated checks pass with 100% success across the test suites. No changes have been staged or committed.

---

## 2. Modified Files and Methods

### `js/storage.js`
- **`StorageManager.prototype._attachBudgetAccessors(state)` (NEW):**
  Defines configurable, enumerable getters and setters on `state.jpTotalBudget` and `state.inTotalBudget` that reactively bind to `state.budgets.JP.monthlyTotal` and `state.budgets.IN.monthlyTotal`. Because `enumerable: true` is set, serialization (`JSON.stringify`) outputs both properties for full backward compatibility with older database rows and backup files.
- **`StorageManager.prototype.isNewUser()` (MODIFIED):**
  Simplified and hardened into a strict contract:
  - `accountStatus === 'NEW_USER'` $\rightarrow$ `true`
  - `accountStatus === 'EXISTING_USER'` $\rightarrow$ `false`
  - `accountStatus === 'ONBOARDING_INCOMPLETE'` $\rightarrow$ `false`
  - `accountStatus === 'SYNC_FAILED'` $\rightarrow$ `false`
  - `accountStatus === 'UNRESOLVED'` $\rightarrow$ `false`
  - Fallback check only applies if `accountStatus` is unassigned, checking `!preferences?.onboardingCompleted && !hasEstablishedFinancialData(state)`.
- **`StorageManager.prototype.setTotalBudget(countryOrKey, amount)` (NEW):**
  Centralized budget setter method accepting country codes (`'JP'`, `'IN'`, `'DE'`, `'JPY'`, `'INR'`, `'EUR'`) or legacy keys (`'jpTotalBudget'`, `'inTotalBudget'`), ensuring atomic synchronization and calling `saveData()`.
- **`StorageManager.prototype.pushToSupabase(options = {})` (MODIFIED):**
  - Added immediate fail-closed return (`return false`) when `this.accountStatus === 'SYNC_FAILED'`.
  - Added push guard: defers push and returns `false` if account is un-onboarded (`NEW_USER`, `ONBOARDING_INCOMPLETE`, or `!isSetupCompleted`) AND has no real financial records (`txCount === 0 && all balances === 0`) AND `!allowExplicitPersist`.
  - Returns `true` on successful upsert; returns `false` on database error or caught exception.
- **`StorageManager.prototype.markOnboardingCompleted(completed = true)` (MODIFIED):**
  Transitions `this.accountStatus = 'EXISTING_USER'` when onboarding is marked complete, unlocking cloud persistence.
- **`StorageManager.prototype.saveData()` (MODIFIED):**
  Ensures budget synchronization before serializing to localStorage.
- **`StorageManager.prototype.previewContinuousLedgerMigration()` (MODIFIED):**
  Attaches budget accessors to migrated clone, and reconciles legacy envelopes where `jpTotalBudget` or `inTotalBudget` differs from `budgets[country].monthlyTotal`.
- **`StorageManager.prototype.constructor`, `loadData`, `parseAndMergeData`, `onUserLogout`, `applyContinuousLedgerMigration`:**
  Ensured `_attachBudgetAccessors(state)` is called whenever state is created, reloaded, or migrated.

### `js/app.js`
- **`updateSetting(key, val)`:** Updated to call `storage.setTotalBudget('JP', val)` when updating budget limit.
- **`saveCategorySettings()`:** Updated to call `storage.setTotalBudget(isJp ? 'JP' : 'IN', numVal)`.
- **`closeCurrentMonth()` closing wizard:** Updated line 7293 to call `storage.setTotalBudget('JP', nextJpBudget)`.

---

## 3. Root Cause Analysis

### Issue 1: New-User Detection False Positive on Network Failure
- **Root Cause:** In the previous implementation, `isNewUser()` checked:
  ```javascript
  if (this.accountStatus === 'NEW_USER') return true;
  if (this.accountStatus === 'EXISTING_USER') return false;
  return Boolean(!this.state.preferences?.onboardingCompleted && !this.hasEstablishedFinancialData(this.state));
  ```
  When a user signed in on a new device while Supabase was unreachable (offline, DNS failure, 503 error), `syncFromSupabase()` set `this.accountStatus = 'SYNC_FAILED'`. Because `SYNC_FAILED` fell through to the fallback condition, and local storage on the new device was empty (`onboardingCompleted === false` and `hasEstablishedFinancialData === false`), `isNewUser()` evaluated to `true`.
- **Architectural Risk:** A returning user with hundreds of transactions in the cloud would be incorrectly routed into the onboarding wizard if their first load encountered a transient network dropout.

### Issue 2: Budget Synchronization and Persistence Divergence
- **Root Cause:** Legacy UI controls in `app.js` (category budget modals, month-end closing wizard, settings) assigned values directly to `storage.state.jpTotalBudget = num` and invoked `storage.saveData()`. While initial migration copied `jpTotalBudget` to `budgets.JP.monthlyTotal`, runtime assignments did not update `budgets.JP.monthlyTotal`. Upon page reload or continuous ledger re-migration, the migration engine re-read `budgets.JP.monthlyTotal` (or preferred it over `jpTotalBudget`), silently discarding the user's updated budget limit.
- **Architectural Risk:** Users adjusting monthly budget totals would find their edits reverted after browser refresh or sync.

### Issue 3: Incomplete Onboarding Premature Cloud Push
- **Root Cause:** `pushToSupabase()` previously only checked `this.accountStatus === 'NEW_USER'`. If a user began onboarding, selected a country or draft starter wallet, and closed the browser, the session had `this.accountStatus === 'ONBOARDING_INCOMPLETE'`. If `saveData()` or sync attempted a push, the guard did not catch `ONBOARDING_INCOMPLETE`. Furthermore, `hasEstablishedFinancialData()` considered any wallet outside default JP/IN names or any draft budget > 0 as "established data", which misclassified draft onboarding selections as established financial data.
- **Architectural Risk:** Unfinished onboarding sessions could overwrite Supabase with empty placeholder accounts.

---

## 4. Architectural & Safety Justification of the Fixes

1. **Deterministic Accessor Property Architecture:**
   By binding `jpTotalBudget` and `inTotalBudget` using `Object.defineProperty`:
   - Reading `storage.state.jpTotalBudget` always reads directly from `storage.state.budgets.JP.monthlyTotal`.
   - Writing `storage.state.jpTotalBudget = 85000` automatically executes the setter, which sets `storage.state.budgets.JP.monthlyTotal = 85000`.
   - Because `enumerable: true`, `JSON.stringify(storage.state)` serializes both keys identically. Older versions of the app or legacy queries continue to see valid numbers without changes to database schemas.
   - Germany (`DE`) has no legacy field counterpart and remains completely independent in `budgets.DE`.
2. **Explicit Account Lifecycle Contract:**
   `this.accountStatus` is managed exclusively by authentication and synchronization transitions:
   - `UNRESOLVED`: Pre-sync state. Safe-halts all destructive actions. `isNewUser() === false`.
   - `SYNC_FAILED`: Network or server error. Fails closed. Prevents local overwrite and prevents cloud push. `isNewUser() === false`.
   - `ONBOARDING_INCOMPLETE`: Multi-device resumable onboarding. Preserves step index. `isNewUser() === false`.
   - `EXISTING_USER`: Cloud or local financial data confirmed. Bypasses onboarding. `isNewUser() === false`.
   - `NEW_USER`: Supabase confirmed record not found (`PGRST116`) and local storage empty. `isNewUser() === true`.
3. **Fail-Closed Push Policy:**
   `pushToSupabase()` requires that at least one of the following conditions is satisfied:
   - Onboarding is completed (`isSetupCompleted === true`), OR
   - Explicit persist authorization is provided (`options.force` or `options.allowOnboardingPersist`), OR
   - The user has established real financial records (`txCount > 0` or non-zero wallet balances).
   In all other cases, `pushToSupabase()` logs a deferred message and returns `false`, preventing any accidental cloud overwrite.

---

## 5. Verification Results Across the 10 Required Test Points

All 10 required test points were executed and verified via automated Chromium test suites:

| # | Test Point | Target Behavior | Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Genuinely new account with no remote record** | Supabase returns `PGRST116`. Resolves to `accountStatus = 'NEW_USER'`. `isNewUser() === true`. `pushToSupabase()` returns `false` and defers push. 0 transactions. | Verified via TC-01 (Checks 1–7). | **PASS** |
| **2** | **Returning user on new device with cloud data** | Authoritative remote state loaded. Resolves to `accountStatus = 'EXISTING_USER'`. `isNewUser() === false`. `onboardingCompleted: true`. All 116 transactions loaded onto new device. | Verified via TC-04 (Checks 22–26). | **PASS** |
| **3** | **User with partially completed onboarding** | Remote has `onboardingCompleted: false, onboardingStep: 2`. Resolves to `ONBOARDING_INCOMPLETE`. `isNewUser() === false`. `pushToSupabase()` aborted. Resumes step 2. Completing onboarding (`markOnboardingCompleted(true)`) unlocks push. | Verified via TC-05 (Checks 27–34). | **PASS** |
| **4** | **Network failure / Supabase unavailable on new device** | Network drops (HTTP 503, connection refused). Resolves to `SYNC_FAILED`. `isNewUser() === false`. Local state preserved. `pushToSupabase()` fails closed. | Verified via TC-09 (Checks 69–74) & TC-13 (Checks 95–96). | **PASS** |
| **5** | **Legacy direct budget assignment** | Direct assignment `state.jpTotalBudget = 75000` immediately updates `budgets.JP.monthlyTotal`. Assigning `budgets.JP.monthlyTotal = 82000` immediately reflects on `state.jpTotalBudget`. | Verified via TC-08 (Checks 54–55). | **PASS** |
| **6** | **Centralized budget setter** | `setTotalBudget('JP', 90000)` updates both `budgets.JP.monthlyTotal` and `jpTotalBudget`. `setTotalBudget('inTotalBudget', 35000)` updates both `budgets.IN.monthlyTotal` and `inTotalBudget`. | Verified via TC-08 (Checks 56–59). | **PASS** |
| **7** | **Sovereign budget independence** | Setting `budgets.DE.monthlyTotal = 2100` leaves `jpTotalBudget` (90000) and `inTotalBudget` (35000) completely unchanged. | Verified via TC-08 (Checks 60–62). | **PASS** |
| **8** | **Persistence across lifecycles** | Budget values survive `saveData()`, `loadData()`, preview continuous ledger migration, and cloud sync. Accessors re-bind on reload. | Verified via TC-08 (Checks 63–68). | **PASS** |
| **9** | **Backup roundtrip** | Preferences (`activeCountries`, `defaultCountry`, `theme`) and budget settings roundtrip through export $\rightarrow$ validation $\rightarrow$ import without loss. | Verified via TC-10 (Checks 75–80). | **PASS** |
| **10** | **Invariant financial integrity** | All 116 production transactions, 6 wallet balances, transfers, and remittances remain 100% bit-for-bit invariant against original production export fixture. | Verified via TC-12 (Checks 87–89) & regression suite (Checks 23–39). | **PASS** |

---

## 6. Full Automated Test Suite Summary

- **`scratch/test_phase2_user_preferences.py`:**
  - **96 checks across 13 scenarios**: 96 PASS, 0 FAIL (100% success).
- **`scratch/test_compatibility_improvements.py`:**
  - **39 checks against real 2026-11-16 production export**: 39 PASS, 0 FAIL (100% success).
- **`scratch/test_design_identity_refinements.py`:**
  - **30 design identity checks**: 30 PASS, 0 FAIL (100% success).
- **Total Combined Verification:**
  - **165 passing checks**, 0 failures, 0 regressions.

---

## 7. Financial Data Invariance Confirmation

- **Total Production Transactions:** Exactly 116 transactions preserved.
- **Wallet Balances:**
  - `Cash`: `12,698 ¥` (Exact match)
  - `Salary Account`: `31,907 ¥` (Exact match)
  - `PayPay`: `0 ¥` (Exact match)
  - `Axis Bank`: `46,794.53 ₹` (Exact float match)
  - `Credit Card`: `0 ₹` (Exact match)
  - `Bank of Baroda`: `0 ₹` (Exact match)
- **Boundary Transactions:**
  - July 31 transaction (ID `1785519182944`) preserved in continuous ledger and correctly queries under July 2026 totals.
  - October 31 transactions (IDs `1793462624420` and `1793462605069`) preserved and correctly excluded from November active queries.
- **Production Supabase Database:** Zero network requests, zero queries, and zero writes dispatched. Production data remains completely untouched.

---

## 8. Working Tree State & Next Steps

All changes are contained strictly in the working tree on local branch `test`:
- `modified: index.html`
- `modified: js/app.js`
- `modified: js/storage.js`
- `untracked: js/country-config.js`
- `untracked: scratch/*`

**Safety Constraint Honored:** No automatic git commit or branch modifications have been performed. All changes remain uncommitted awaiting your manual review and testing.

