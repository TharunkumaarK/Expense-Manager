# Expense Manager — Phase 2: User Preferences and Account Configuration Implementation Report

**Application:** Expense Manager  
**Branch:** `test`  
**Phase:** Phase 2 — User Preferences & Account Configuration Layer  
**Date:** 2026-11-17  
**Status:** **COMPLETED & VERIFIED (ALL 67/67 CHECKS PASSED)**  

---

## 1. Executive Summary

Phase 2 builds the persistent, sovereign configuration foundation for Expense Manager without disrupting existing production records or prematurely showing onboarding UI. 

In this phase:
1. **Centralized Country & Currency Registry (`js/country-config.js`):** Established a sovereign configuration model supporting Japan (JPY, `¥`), India (INR, `₹`), and Germany (EUR, `€`) with localized currency formatting, flag graphics, starter wallets, and standard category catalogs.
2. **Extended Schema v3 Configuration Layer (`js/storage.js`):** Extended `defaultState` and continuous ledger migration logic with persistent `preferences: { version, activeCountries, defaultCountry, onboardingCompleted, onboardingStep, tourCompleted, tourDismissed, theme }`, an independent multi-country `budgets` map (`JP`, `IN`, `DE`), German category defaults (`categories.DE`), and normalized `loanConfig` (`country: 'IN'`, `currency: '₹'`).
3. **5-State First-Time Account Detection & Cloud Sync Lifecycle:** Refactored `StorageManager.syncFromSupabase()` to distinguish between:
   - Truly new users (`NEW_USER`): No remote row + no established financial data; defers cloud push until setup completes.
   - Existing legacy users (`EXISTING_USER`): Infers `onboardingCompleted: true` and preserves continuous ledger integrity.
   - Returning users on a new device (`EXISTING_USER`): Authoritative remote state takes precedence; onboarding is bypassed.
   - Interrupted onboarding (`ONBOARDING_INCOMPLETE`): Preserves `onboardingStep` for wizard resumption.
   - Failed synchronizations (`SYNC_FAILED`): Fails closed on network or server errors, preventing destructive default overwrites.
4. **100% Backward & Forward Compatibility:** All 116 transactions, 6 wallets, floating-point balances, transfers, remittances, and month closures from the 2026-11-16 production export remain 100% mathematically invariant.

---

## 2. Files Modified & Added

| File Path | Status | Purpose |
| :--- | :--- | :--- |
| `js/country-config.js` | **Created** | Sovereign country registry (`JP`, `IN`, `DE`) with formatting, flags, starter wallets, and category defaults. |
| `js/storage.js` | **Modified** | `defaultState` extension, `previewContinuousLedgerMigration` normalization, 5-state cloud sync lifecycle, and preferences management API. |
| `js/app.js` | **Modified** | Linked `CountryConfig` and updated `getCountryFlagSvg` to delegate to the centralized country configuration with German flag support. |
| `index.html` | **Modified** | Added `<script src="js/country-config.js"></script>` before `js/storage.js`. |
| `scratch/test_phase2_user_preferences.py` | **Created** | Isolated headless Chromium test runner verifying all 12 test scenarios across 67 assertions. |

---

## 3. Data Structure Implemented

### Application State (Schema v3 Extension)

```javascript
{
    schemaVersion: 3,
    currentMonthKey: "2026-11",
    _updatedAt: "2026-11-17T16:00:00.000Z",

    // --- User Preferences Layer ---
    preferences: {
        version: 1,                                // Configuration schema version
        activeCountries: ['JP', 'IN'],             // Array of sovereign country codes ('JP' | 'IN' | 'DE')
        defaultCountry: 'JP',                      // Primary sovereign context
        onboardingCompleted: false,                // Completed onboarding flag
        onboardingStep: 1,                         // Step 1: Countries, 2: Wallets, 3: Budgets, 4: Loan/Review
        tourCompleted: false,                      // Guided spotlight tour completion
        tourDismissed: false,                      // Explicit tour skip / dismissal
        theme: 'dark'                              // UI theme mode ('dark' | 'obsidian' | 'oled')
    },

    // --- Independent Multi-Country Budgets ---
    budgets: {
        JP: {
            enabled: true,
            monthlyTotal: 50000,
            rolloverEnabled: true
        },
        IN: {
            enabled: false,
            monthlyTotal: 0,
            rolloverEnabled: false
        },
        DE: {
            enabled: false,
            monthlyTotal: 0,
            rolloverEnabled: false
        }
    },

    // --- Normalized Loan Tracking Configuration ---
    loanConfig: {
        enabled: false,
        country: 'IN',
        currency: '₹',
        totalPrincipal: 0,
        principalLeft: 0,
        emi: 0,
        duesPaid: 0,
        totalDues: 0,
        annualInterestRate: 0,
        emiDrawDate: 7
    },

    // --- Sovereign Category Catalogs ---
    categories: {
        JP: [ /* 14 Japanese Categories */ ],
        IN: [ /* 9 Indian Categories */ ],
        DE: [ /* 11 German Categories (Groceries, Transit, Rent, Utilities, Insurance, etc.) */ ]
    },

    // --- Wallets Map & Continuous Transaction Ledger ---
    wallets: { ... },
    transactions: [ ... ],
    closedMonths: { ... },
    history: [ ... ]
}
```

### StorageManager Preference API

The following safe, persistent methods were added to `StorageManager`:
- `getPreferences()`: Returns deep copy of user preferences.
- `updatePreferences(updates)`: Merges preference updates, validates country codes, and saves atomically.
- `isNewUser()`: Resolves boolean check using `accountStatus` and financial data detection.
- `getAccountStatus()`: Returns current state: `'UNRESOLVED' | 'NEW_USER' | 'EXISTING_USER' | 'ONBOARDING_INCOMPLETE' | 'SYNC_FAILED'`.
- `isCountryActive(countryCode)`: Checks active state of 'JP', 'IN', or 'DE'.
- `getActiveCountries()`: Returns active country code array.
- `setActiveCountries(countries)`: Updates active countries without mutating financial ledger.
- `isBudgetEnabled(countryCode)`: Returns budget activation status for specified country.
- `getBudgetConfig(countryCode)`: Returns `{ enabled, monthlyTotal, rolloverEnabled }`.
- `setBudgetEnabled(countryCode, enabled, monthlyTotal, rolloverEnabled)`: Updates country budget and synchronizes legacy `jpTotalBudget` / `inTotalBudget`.
- `isLoanTrackingEnabled()`: Checks loan configuration status.
- `setLoanTrackingEnabled(enabled, options)`: Toggles loan tracking and updates loan properties.
- `markOnboardingCompleted(completed)`: Sets onboarding completion status and steps.
- `markTourCompleted(completed)`: Updates tour completion.
- `markTourDismissed(dismissed)`: Updates tour dismissal.

---

## 4. First-Time Account Detection Strategy

The existing synchronization lifecycle in `storage.syncFromSupabase()` previously pushed default hardcoded Japanese/Indian wallets to Supabase immediately upon receiving `PGRST116` (row not found). This prematurely polluted new user accounts before the onboarding wizard could prompt for their desired country (e.g., a Germany-only user).

The refactored detection strategy resolves accounts through a strict 5-state lifecycle:

```
                          [User Login / Init]
                                   │
                                   ▼
                       `accountStatus = UNRESOLVED`
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
            Supabase PGRST116               Supabase Record
            (Row Not Found)                     Returned
                    │                             │
          Has Established Data?                   │
          ┌─────────┴─────────┐                   ▼
          ▼                   ▼        Valid & Migrated State
         YES                  NO                  │
          │                   │        Has Transactions /
          ▼                   ▼        `onboardingCompleted`?
    EXISTING_USER          NEW_USER               │
    (Pushes local)      (Onboarding Req)   ┌──────┴──────┐
                        (NO cloud push!)   ▼             ▼
                                          YES            NO
                                           │             │
                                           ▼             ▼
                                     EXISTING_USER  ONBOARDING_INCOMPLETE
                                     (Bypasses UI)  (Resumes Step)
```

### Financial Data Detection Guard (`hasEstablishedFinancialData(state)`)
Guarantees that no user is classified as new if any of the following exist:
1. `getUniqueTransactionCount(state) > 0`: Active or historical ledger transactions exist.
2. `closedMonths` or `history` contains archived periods.
3. Wallets collection contains non-zero balances or custom wallet IDs beyond default names.
4. Custom budget limits are configured (`jpTotalBudget > 0` or any `budgets[country].monthlyTotal > 0`).
5. Active loan configuration exists (`loanConfig.enabled === true` or `totalPrincipal > 0`).

---

## 5. Legacy Compatibility Approach

1. **Zero Financial Mutation:** Existing production exports (116 transactions, 6 wallets) migrating to Schema v3 automatically infer:
   - `preferences.activeCountries = ['JP', 'IN']` (detected from wallet currency/region tags).
   - `preferences.onboardingCompleted = true` (bypasses onboarding wizard entirely).
   - `preferences.tourCompleted = true` (prevents unnecessary interruption).
2. **Synchronized Budget Properties:** Legacy top-level properties `state.jpTotalBudget` and `state.inTotalBudget` remain strictly synchronized with `state.budgets.JP.monthlyTotal` and `state.budgets.IN.monthlyTotal`.
3. **Backup Envelope Normalization:** Both plain backups and wrapped exports (`{ source, exportedAt, databaseUpdatedAt, state }`) validate and restore cleanly through `validateBackupData()` and `previewContinuousLedgerMigration()`.
4. **Idempotent Migrations:** Repeated migration passes produce strictly identical state hashes with `alreadyMigrated: true`.

---

## 6. Test Results

### Test Suite Execution Summary

All test suites were executed in isolated headless Chromium instances:

```
===========================================================================
1. Phase 2 Verification Suite (scratch/test_phase2_user_preferences.py)
   Total Checks: 67 | Passed: 67 | Failed: 0
===========================================================================
   [TC-01] New Account Without Financial State               -> 6/6 PASSED
   [TC-02] Existing JP/IN Production Account Migration       -> 7/7 PASSED
   [TC-03] Legacy Account Missing Preferences Initialization  -> 7/7 PASSED
   [TC-04] Returning User On Another Device                  -> 5/5 PASSED
   [TC-05] Interrupted Onboarding Configuration Resumption   -> 4/4 PASSED
   [TC-06] Country Preference Updates & Zero Data Loss       -> 7/7 PASSED
   [TC-07] Loan Tracking Enabled/Disabled Management         -> 6/6 PASSED
   [TC-08] Budgeting Enabled For One Country Only (JP Only)   -> 6/6 PASSED
   [TC-09] Failed Supabase Synchronization (Fail-Closed)     -> 4/4 PASSED
   [TC-10] Backup Export/Import Of User Preferences          -> 6/6 PASSED
   [TC-11] Migration Idempotency & Invariant Stability       -> 6/6 PASSED
   [TC-12] Financial State Invariant Check Against Fixture   -> 3/3 PASSED

===========================================================================
2. Compatibility Improvements Suite (scratch/test_compatibility_improvements.py)
   Total Checks: 39 | Passed: 39 | Failed: 0
===========================================================================
   - 116 Transaction IDs preserved with exact uniqueness:    PASSED
   - All 6 Wallet Balances match exact floats:                PASSED
   - Boundary Txs (July 31, Oct 31) queries:                 PASSED
   - Category display fallbacks ("Relocation", "Room 101"):   PASSED
   - Envelope normalization & malformed wrapper rejection:   PASSED

===========================================================================
3. Design Identity Refinements Suite (scratch/test_design_identity_refinements.py)
   Total Checks: 30 | Passed: 30 | Failed: 0
===========================================================================
   - Natural width primary action buttons:                   PASSED
   - Restrained action tints (rose, emerald, sky, lilac):    PASSED
   - Context-aware modal back navigation:                    PASSED
   - Semantic ghost delete controls:                         PASSED
```

**Overall Test Health:** **136 / 136 checks passing (100%)**.

---

## 7. Risks & Limitations

1. **Uncommitted Working Tree:** Changes are preserved in the local working tree without committing, adhering strictly to the user instruction ("do not automatically commit until i tested it manually").
2. **Onboarding UI Deferred:** In accordance with Phase 2 boundaries, no new UI wizard was injected into DOM views. Account configuration APIs are fully testable in JavaScript and headless harnesses, ready for Phase 3 UI development.
3. **Multi-Currency Reporting Calculations:** While `CountryConfig` now formats EUR and JPY/INR properly, cross-currency balance conversion rates for single-portfolio aggregation remain a Phase 3/4 task.

---

## 8. Changes Needed in the Next Phase (Phase 3)

1. **Onboarding Wizard Component (`js/onboarding.js`):**
   - Implement the 4-step wizard modal in `index.html`:
     - Step 1: Sovereign country selection (`JP`, `IN`, `DE` cards with SVG flags).
     - Step 2: Starter wallet configuration with opening balances (creates wallets without synthetic income transactions).
     - Step 3: Sovereign budgeting toggles and initial limits per selected country.
     - Step 4: Optional loan tracker setup (EMI, principal, draw date).
   - Hook into `app.init()`: if `storage.getAccountStatus() === 'NEW_USER'` or `'ONBOARDING_INCOMPLETE'`, launch wizard.
2. **Dynamic Country Navigation & View Filtering:**
   - Replace hardcoded `['JP', 'IN']` country switcher tabs in Dashboard, Budgets, Analytics, and Reports with `storage.getActiveCountries()`.
   - If `activeCountries.length === 1`, hide country switcher pills and cross-currency transfer buttons to deliver a seamless single-country experience.
3. **Spotlight Guided Tour Component (`js/tour.js`):**
   - Contextual visual tour highlighting core actions (FAB, Wallets, Budgets, Month Closing), with a prominent "Skip Tour" button persisting `tourCompleted: true`.

