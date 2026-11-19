# Expense Manager — Phase 5 Authoritative Financial Mutation Boundary Specification

**Document Version:** 1.0.0  
**Repository:** `TharunkumaarK/Expense-Manager`  
**Branch:** `test`  
**Base Commit:** `f10b89ea0663f7f3a0643e7f44c8b8be312f14a2`  
**Status:** Implemented & Verified  

---

## 1. Architectural Model & Scope

The persistence architecture in Expense Manager is anchored by a single authoritative coordinator:
```
UI / Event Layer  --->  storage.runExclusive()  --->  Domain Logic (In-Memory)  --->  Single Local Commit & Broadcast  --->  Serialized Cloud Queue
```

### 1.1 Separation of Responsibilities
1. **Domain Layer (`js/wallet.js` & `StorageManager` calculation methods):**
   - Validates proposed transactions, transfer bounds, and currency precisions.
   - Modifies `this.state` strictly in-memory.
   - Detects when operating within an active coordinator boundary (`isInsideExclusiveTransaction() === true`) and suppresses nested local saves and cloud sync dispatches.
   - Returns a structured domain result (e.g. `true` or `{ success: true, ... }`).
2. **Authoritative Mutation Coordinator (`storage.runExclusive`):**
   - Acquires the browser's native Web Lock (`navigator.locks.request(lockScope, { mode: 'exclusive' })`).
   - If Web Locks are unavailable in a multi-tab browser context, safely refuses concurrent mutations with error code `LOCK_UNAVAILABLE`.
   - Reloads the freshest authoritative persisted local state (`reloadAuthoritativeLocalState`).
   - Verifies revision expectations and structural integrity.
   - Takes a deep pre-mutation snapshot for atomic rollback in the event of an unhandled exception or failed domain validation.
   - Sets `this._inExclusiveTransaction = true`.
   - Executes the domain mutation in-memory.
   - Advances `this.state.revision` monotonically by exactly 1.
   - Performs exactly one atomic commit to `localStorage` via `_saveDataDirect()`.
   - Dispatches a structured broadcast event via `BroadcastChannel('expense_manager_sync')`.
   - Enqueues the committed state into the serialized cloud synchronization queue.
3. **Serialized Cloud Synchronization Layer (`enqueueCloudSync` & `_drainSyncQueue`):**
   - Maintains a single-flight per-account worker.
   - Uses PostgREST Compare-And-Swap (CAS) matching `state->>revision`.
   - Guarantees zero out-of-order writes or concurrent overlapping HTTP pushes.

---

## 2. Mutation Coverage Matrix

Every financial mutation entry point in Expense Manager has been audited and integrated into the authoritative coordinator boundary:

| Entry Point | Location | Coordinator Protection Mechanism | Persistence Ownership | Bypasses Revision? | Double Persistence? |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **Add Expense** | `app.handleFormSubmit` / `walletManager.addExpense` | Wrapped in `storage.runExclusive` | In-memory during mutation; committed once by coordinator | **NO** | **NO (0 duplicate saves)** |
| **Add Income** | `app.handleFormSubmit` / `walletManager.addIncome` | Wrapped in `storage.runExclusive` | In-memory during mutation; committed once by coordinator | **NO** | **NO (0 duplicate saves)** |
| **Domestic Transfer** | `app.handleFormSubmit` / `walletManager.transfer` | Wrapped in `storage.runExclusive` | In-memory during mutation; committed once by coordinator | **NO** | **NO (0 duplicate saves)** |
| **International Remittance** | `app.handleFormSubmit` / `walletManager.remittance` | Wrapped in `storage.runExclusive` | In-memory during mutation; committed once by coordinator | **NO** | **NO (0 duplicate saves)** |
| **Edit Transaction** | `app.handleFormSubmit` / `walletManager.updateTransaction` | Wrapped in `storage.runExclusive` | In-memory during mutation; committed once by coordinator | **NO** | **NO (0 duplicate saves)** |
| **Delete Transaction** | `app.deleteTx` / `walletManager.deleteTransaction` | Wrapped in `storage.runExclusive` | In-memory during mutation; committed once by coordinator | **NO** | **NO (0 duplicate saves)** |
| **Month Closure** | `app.closeMonth` / `storage.closeCurrentMonth` | Wrapped in `storage.runExclusive` | In-memory during mutation; committed once by coordinator | **NO** | **NO (0 duplicate saves)** |
| **Budget Recovery Commit** | `app.confirmBudgetRecovery` / `storage.commitBudgetRecovery` | Wrapped in `storage.runExclusive` | In-memory during mutation; committed once by coordinator | **NO** | **NO (0 duplicate saves)** |
| **Add Wallet** | `app.addWallet` / `storage.addWallet` | Context-aware `saveData` | Coordinator or standalone single save | **NO** | **NO (0 duplicate saves)** |
| **Update Wallet / Color** | `app.updateWalletColor` / `storage.updateWallet` | Context-aware `saveData` | Coordinator or standalone single save | **NO** | **NO (0 duplicate saves)** |
| **Delete Wallet** | `app.removeWallet` / `storage.deleteWallet` | Context-aware `saveData` | Coordinator or standalone single save | **NO** | **NO (0 duplicate saves)** |
| **Set Opening Balance** | `storage.setWalletOpeningBalance` | Context-aware `saveData` | Coordinator or standalone single save | **NO** | **NO (0 duplicate saves)** |
| **Set Country Budget** | `app.saveMonthlyBudget` / `storage.setTotalBudget` | Context-aware `saveData` | Coordinator or standalone single save | **NO** | **NO (0 duplicate saves)** |
| **Country Budget Config** | `storage.setCountryBudgetConfig` | Context-aware `saveData` | Coordinator or standalone single save | **NO** | **NO (0 duplicate saves)** |
| **Activate Country** | `storage.activateCountry` | Context-aware `saveData` | Coordinator or standalone single save | **NO** | **NO (0 duplicate saves)** |
| **Deactivate Country** | `storage.deactivateCountry` | Context-aware `saveData` | Coordinator or standalone single save | **NO** | **NO (0 duplicate saves)** |
| **Loan Config Update** | `storage.setLoanTracking` | Context-aware `saveData` | Coordinator or standalone single save | **NO** | **NO (0 duplicate saves)** |
| **Import / Backup Restore** | `app.importData` / `storage.importJSON` | Context-aware migration preview & apply | Full validation & single authoritative commit | **NO** | **NO (0 duplicate saves)** |

---

## 3. Failure Behavior & Atomic Rollback Guarantees

If any error or validation failure occurs within the mutation coordinator:
1. **In-Memory Rollback:** The state is completely reverted to `preMutationSnapshot`.
2. **Zero Incomplete Writes:** No `localStorage.setItem` call is issued.
3. **No Revision Leakage:** `this.state.revision` is not incremented.
4. **No Phantom Broadcasts:** No `BroadcastChannel` or `storage` events are transmitted.
5. **No Phantom Sync:** No cloud sync task is queued or sent to Supabase.
6. **Form Draft Preservation:** The user's form inputs remain in the DOM so they can correct mistakes or re-try without retyping.

