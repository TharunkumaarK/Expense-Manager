# Expense Manager — Phase 5 Synchronization & Concurrency Architecture

**Date:** 2026-11-19  
**Branch:** `test`  
**Repository:** `Tharunkumaark/Expense-Manager`  
**Scope:** Cross-Tab Coordination, Cross-Device Supabase CAS Concurrency, Offline Queueing & Conflict Resolution

---

## 1. Existing Architecture Audit & Risks

### Current State Representation
Expense Manager currently persists state in two boundaries:
1. **Local Authoritative Cache (`localStorage`):**
   - Main storage key: `SUPABASE_CONFIG.storageKey` (e.g. `em_connected_v2`).
   - Stores monolithic JSON object containing `wallets`, `transactions` (continuous array), `categories`, `budgets`, `preferences`, `closedMonths`, `currentMonthKey`, `recoveryMetadata`.
   - Written synchronously via `StorageManager.saveData()` (`localStorage.setItem`).
2. **Cloud Authoritative Mirror (`public.app_state` table in Supabase):**
   - Schema: `(user_id uuid PRIMARY KEY, state jsonb, updated_at timestamptz)`.
   - Written via `StorageManager.pushToSupabase()` using unconditional `upsert({ user_id, state, updated_at }, { onConflict: 'user_id' })`.
   - Read on login/startup via `StorageManager.syncFromSupabase()`.

### Identified Architectural Vulnerabilities Prior to This Phase

1. **Unconditional Supabase Upsert (Blind Last-Write-Wins):**
   - `pushToSupabase()` uses PostgREST `.upsert({ user_id, state, updated_at })` without checking the current remote revision or timestamp.
   - If Device A is offline and makes 3 changes, while Device B makes 2 changes and pushes to Supabase, Device A coming online blindly overwrites Device B's changes, destroying Device B's transactions and balances.
2. **Cross-Tab Race Conditions in LocalStorage:**
   - Multiple tabs sharing the same origin read and write to the same `localStorage` key.
   - If Tab 1 reads balance ¥100,000 and prepares a ¥20,000 expense, and Tab 2 simultaneously reads balance ¥100,000 and prepares a ¥30,000 expense, whichever tab commits last overwrites the other tab's balance rather than deducting both (yielding ¥70k or ¥80k instead of the correct ¥50k).
3. **Budget Recovery Lease Was Narrowly Scoped:**
   - The previously introduced `acquireRecoveryLock` only guarded `commitBudgetRecovery`. General transaction creation (`addExpense`, `addIncome`, `transfer`, `remittance`, edit, delete) had no mutual exclusion lock.
4. **Lack of Active Tab Broadcast & Stale Previews:**
   - When Tab 1 adds an expense, Tab 2 has no notification channel. Tab 2's UI remains stale until manual refresh. If Tab 2 has an open transfer preview or budget recovery modal, it operates on a stale snapshot.
5. **False "Synced" Acknowledgment:**
   - Local state changes were displayed as active without clearly distinguishing locally persisted data from confirmed cloud persistence.

---

## 2. Cross-Tab Exclusive Locking Strategy

### Core Principles
- All mutating financial operations MUST be serialized through an exclusive lock.
- Within the lock, the executing tab MUST:
  1. Re-read the latest authoritative state from local storage.
  2. Validate state integrity and check revision / fingerprint.
  3. Apply the proposed mutation and validate financial invariants.
  4. Increment the monotonically increasing integer `revision`.
  5. Persist to local storage and stamp `_updatedAt`.
  6. Publish an update event via `BroadcastChannel`.
  7. Queue or trigger asynchronous cloud synchronization.

### Locking Implementation: Web Locks API with Robust Fallback

```text
+--------------------------------------------------------------------+
|                       storage.runExclusive()                       |
+--------------------------------------------------------------------+
                               |
              Is navigator.locks available?
                     /                \
                   YES                 NO
                   /                    \
  +--------------------------+   +---------------------------------+
  | navigator.locks.request  |   | LocalStorage CAS Spin-Lock      |
  | Scope: em_lock_<user_id> |   | Key: <storageKey>_exclusive_lock|
  | Mode: exclusive          |   | Heartbeat TTL: 5000ms           |
  | Auto-releases on return  |   | Exponential backoff & retry     |
  +--------------------------+   +---------------------------------+
```

#### Lock Scope
- Unauthenticated / Offline: `em_lock_${storageKey}`
- Authenticated: `em_lock_${userId}`

#### Safe Coordination Pipeline
```javascript
async runExclusive(mutationFn, options = {}) {
    const lockName = this.getLockScopeName();
    
    const executePipeline = async () => {
        // 1. Re-read latest authoritative local state
        this.reloadAuthoritativeLocalState();
        
        // 2. Validate revision & invariants
        if (options.expectedRevision && this.state.revision !== options.expectedRevision) {
            throw new Error('CONCURRENCY_CONFLICT: Local state advanced in another tab');
        }
        
        // 3. Execute mutation function
        const result = await mutationFn(this.state);
        if (result === false || (result && result.success === false)) {
            return result;
        }
        
        // 4. Advance revision & timestamp
        this.state.revision = (Number(this.state.revision) || 0) + 1;
        this.state._updatedAt = new Date().toISOString();
        
        // 5. Persist atomically
        const saved = this._saveDataDirect();
        if (!saved) throw new Error('PERSISTENCE_FAILED');
        
        // 6. Broadcast update notification to other tabs
        this.broadcastStateChange({
            revision: this.state.revision,
            fingerprint: this.computeFinancialFingerprint(this.state),
            sourceTabId: this.tabId,
            timestamp: this.state._updatedAt
        });
        
        // 7. Schedule cloud synchronization
        this.scheduleCloudSync();
        
        return result;
    };

    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
        return await navigator.locks.request(lockName, { mode: 'exclusive' }, executePipeline);
    } else {
        return await this.runWithFallbackLock(lockName, executePipeline);
    }
}
```

---

## 3. Cross-Tab State Synchronization (`BroadcastChannel`)

### Notification Channel
- Channel name: `expense_manager_sync_channel`.
- Messages published on commit:
  ```json
  {
      "type": "FINANCIAL_STATE_MUTATED",
      "revision": 42,
      "fingerprint": "a1b2c3d4e5f60718",
      "sourceTabId": "tab_xyz123",
      "timestamp": "2026-11-19T08:30:00.000Z"
  }
  ```

### Receiving Tab Protocol

When Tab B receives a `FINANCIAL_STATE_MUTATED` message:

1. **Self-Message Filtering:**
   If `msg.sourceTabId === this.tabId`, ignore (echo suppression).

2. **Form / Modal Dirty State Detection:**
   Tab B checks if an active modal contains uncommitted user input:
   - Transaction form (user typed amount, note, or selected category).
   - Transfer / Remittance form (user entered send/receive amounts).
   - Budget Recovery modal (user modified recovery allocations).

3. **Branch A — Clean Tab (No Unsaved Edits):**
   - Automatically reload latest state from `localStorage`.
   - Update in-memory revision and fingerprint.
   - Re-render active desktop views, balances, cards, and charts.
   - Show a subtle ephemeral indicator: "Synced from another tab".

4. **Branch B — Dirty Tab (Active In-Flight User Edits):**
   - **Do NOT discard user input.**
   - Display a non-destructive amber in-modal warning banner:
     *"Financial state was updated in another window (Revision #N). Your input is preserved. Click 'Re-validate & Save' to verify against current balances."*
   - When the user clicks Save, `runExclusive` acquires the lock, re-checks wallet balances, validates that the transaction remains financially valid (e.g. sufficient funds), and applies it safely.

---

## 4. Cross-Device Supabase Concurrency & CAS Model

### Database Optimistic Concurrency Control (OCC / CAS)

In Supabase, multiple devices write to the row `app_state` for `user_id`.
To guarantee zero lost updates, writes must obey strict Compare-And-Swap (CAS):

$$\text{Commit}(N \to N+1) \iff \text{Remote Revision} = N$$

### Dual-Layer CAS Implementation

#### Layer 1: Client-Side PostgREST Conditional Update
Because production migrations are frozen, the client executes an atomic conditional update matching `state->>revision`:

```javascript
const { data, error } = await supabaseClient.client
    .from('app_state')
    .update({
        state: nextPayload,
        updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('state->>revision', String(lastConfirmedCloudRevision))
    .select('state, updated_at');

if (!error && (!data || data.length === 0)) {
    // 0 rows updated means remote revision !== lastConfirmedCloudRevision!
    // Stale write was blocked by the database engine!
    throw new ConcurrencyConflictError('CLOUD_REVISION_CONFLICT');
}
```

#### Layer 2: Server-Side Stored Procedure (RPC Specification)
Documented in `scratch/supabase_concurrency_cas_migration.sql` for future deployment:
```sql
CREATE OR REPLACE FUNCTION commit_app_state_cas(
    p_expected_revision BIGINT,
    p_new_state JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_rev BIGINT;
    v_row app_state%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM app_state WHERE user_id = v_user_id FOR UPDATE;
    
    IF v_row.user_id IS NULL THEN
        -- First initialization
        INSERT INTO app_state(user_id, state, updated_at)
        VALUES (v_user_id, p_new_state, now())
        RETURNING * INTO v_row;
        RETURN jsonb_build_object('success', true, 'revision', (p_new_state->>'revision')::bigint);
    END IF;

    v_current_rev := COALESCE((v_row.state->>'revision')::bigint, 0);

    IF v_current_rev <> p_expected_revision THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CLOUD_REVISION_CONFLICT',
            'server_revision', v_current_rev,
            'expected_revision', p_expected_revision
        );
    END IF;

    UPDATE app_state
    SET state = p_new_state, updated_at = now()
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object('success', true, 'revision', (p_new_state->>'revision')::bigint);
END;
$$;
```

---

## 5. Offline Queueing, Timeout & Reconnection Policy

### Sync State Machine
```text
[IDLE] ---> [LOCAL_SAVED] ---> [SYNC_PENDING] ---> [SYNCED (CONFIRMED)]
   ^               |                  |
   |               |                  v
   |               +----------> [SYNC_FAILED] (Offline / Timeout)
   |                                  |
   |                                  v
   +--------------------------- [CONFLICT_DETECTED] (Cloud advanced)
```

### Transition Rules
1. **Local Save:** Immediate, synchronous to `localStorage`. Revision increments ($R \to R+1$). Status: `LOCAL_SAVED` / `SYNC_PENDING`.
2. **Online Cloud Push:**
   - Client sends conditional CAS update.
   - If server confirms: `cloudSyncStatus = 'CONFIRMED'`, `lastConfirmedCloudRevision = state.revision`. Status: `SYNCED`.
3. **Network Failure / Offline:**
   - Request fails or navigator is offline.
   - Status transitions to `SYNC_FAILED` / `Offline (Saved locally)`.
   - Local state remains completely intact. An automatic retry is scheduled on `window.online` or interval with exponential backoff (2s, 5s, 10s, max 30s).
4. **Reconnection with Cloud Divergence (CAS Mismatch):**
   - Server returns 0 updated rows or `CLOUD_REVISION_CONFLICT`.
   - Client detects that Cloud Revision > Last Confirmed Revision.
   - **Never Blind Last-Write-Wins:**
     - Copy local state into isolated conflict backup key: `${storageKey}_conflict_stash_${Date.now()}`.
     - Fetch authoritative cloud state into memory.
     - Status transitions to `CONFLICT_DETECTED`.
     - Surface Header Conflict Pill and open Conflict Resolution Modal.

### Conflict Resolution Modal Options
The user is presented with transparent, non-destructive options:
- **Option 1: Overwrite Cloud with Local Edits:**
  Forces commit of local edits, incrementing the server revision.
- **Option 2: Accept Cloud & Archive Local Draft:**
  Adopts cloud state, simultaneously triggering an automatic download/backup of local unpushed transactions (`ExpenseManager_LocalConflict_Backup.json`) so zero data is lost.
- **Option 3: Safe Append (Non-Conflicting Transactions):**
  If local edits consist exclusively of new transactions with unique IDs and cloud transactions are unaffected, append local transactions and re-calculate balances deterministically.

---

## 6. User-Facing Sync States & UI Design

### Header Sync Status Pill
Positioned in `.header-right` adjacent to the Privacy toggle:

| Status | Visual Pill Style | Tooltip / Description |
| :--- | :--- | :--- |
| **`SYNCED`** | Quiet subtle green dot + `Synced` | Changes saved locally and confirmed in cloud |
| **`LOCAL_SAVED`** | Muted slate icon + `Saved locally` | Changes saved locally; cloud push queued |
| **`SYNC_PENDING`** | Spinning sync icon + `Syncing...` | Communication with Supabase in progress |
| **`SYNC_FAILED`** | Muted orange cloud-off + `Offline` | Network disconnected; local data safe |
| **`CONFLICT_DETECTED`**| Amber warning badge + `Sync Conflict` | Click to review and resolve divergent state |

---

## 7. Verification & Safety Constraints

- **Local Branch Only:** All implementation on branch `test`.
- **Target Branch `main`:** Untouched.
- **Production Supabase:** Zero schema or data changes executed.
- **Continuous Ledger Invariant:** All 116 transactions, 6 wallets, and floating balances preserved.
- **Full Test Matrix:** Verification across all 9 existing test suites plus the new comprehensive concurrency test suite (`scratch/test_phase5_sync_concurrency.py`).

