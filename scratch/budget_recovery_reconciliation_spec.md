# Expense Manager — Budget Recovery & Reconciliation Specification

**Date:** November 18, 2026  
**Status:** Approved Architecture & Specification (Phase 5 Final Financial Integrity Hardening)  
**Authors:** Google DeepMind Team & Expense Manager Engineering  

---

## 1. Executive Summary

When an Expense Manager account is accessed after one or more calendar month boundaries have passed without explicit closure, the application enters an unfinalized accounting state. Rather than silently guessing historical budgets, generating artificial zero budgets, or compounding carryovers, the application provides **Budget Recovery & Reconciliation**.

This workflow:
1. Detects unfinalized accounting months deterministically.
2. Places the application in an explicit, read-only workflow state: `BUDGET_RECOVERY_REQUIRED`.
3. Gates new transaction entry with a prominent desktop modal and persistent dashboard banner.
4. Offers the user three explicit recovery options:
   - **Option A — Review each missed month (Recommended default):** Inspect and adjust recurring base budgets and rollover flags per month and country.
   - **Option B — Continue previous budget settings:** Apply the last known recurring budgets and rollover preferences across all missing months chronologically.
   - **Option C — Start fresh this month:** Seal missing months with zero budget and zero carryover, starting the active month fresh with recurring base budgets.
5. Calculates a complete, read-only preview of every missed month and resulting active-month carryover before confirmation.
6. Commits the recovery sequentially in an atomic, all-or-nothing transaction with immutable audit metadata.

---

## 2. Gap Detection & State Machine

### 2.1. Detection Algorithm
Let $M_{\text{actual}}$ be the current calendar month formatted as `YYYY-MM`.  
Let $M_{\text{tracked}}$ be `storage.state.currentMonthKey` (defaulting to $M_{\text{actual}}$ if uninitialized).  
Let $\mathcal{C}$ be the dictionary of closed months in `storage.state.closedMonths`.

1. If the user is in onboarding (`storage.state.preferences.onboardingCompleted === false`) or `storage.isNewUser()` is true, no reconciliation is performed. Return empty list $\emptyset$.
2. If $M_{\text{tracked}} < M_{\text{actual}}$:
   - Generate the chronological sequence of calendar months $\mathcal{S} = [M_{\text{tracked}}, M_{\text{tracked}+1}, \dots, M_{\text{actual}-1}]$.
   - Filter out any month $m \in \mathcal{S}$ where $\mathcal{C}[m] \neq \text{undefined}$ and $\mathcal{C}[m].\text{status} = \text{'closed'}$.
   - The remaining unclosed months form the candidate gap sequence $\mathcal{G} = [m_1, m_2, \dots, m_k]$.
3. If $|\mathcal{G}| > 0$:
   - Transition state to `BUDGET_RECOVERY_REQUIRED`.
   - Store $\mathcal{G}$ in memory and in state as `storage.unfinalizedMonths`.
   - Inhibit automatic month closure.
4. If $|\mathcal{G}| = 0$:
   - If $M_{\text{tracked}} \neq M_{\text{actual}}$, advance $M_{\text{tracked}} \leftarrow M_{\text{actual}}$ and persist.
   - Transition state to `RESOLVED`.

### 2.2. State Transitions
```
                ┌───────────────────────────────────────────────┐
                │             Application Initialized           │
                └──────────────────────┬────────────────────────┘
                                       │
                         detectUnfinalizedMonths()
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
        [No unfinalized months]               [Unfinalized months >= 1]
                    │                                     │
                    ▼                                     ▼
             State: RESOLVED                  State: BUDGET_RECOVERY_REQUIRED
                    │                                     │
          Dashboard Interactive             Dashboard Read-Only (Tx Paused)
                                            Recovery Modal Automatically Opens
                                                          │
                                         ┌────────────────┴────────────────┐
                                         ▼                                 ▼
                                  [User Dismisses]                [User Selects & Confirms]
                                         │                                 │
                            Persistent Banner Shown;               Validate & Commit Snapshots
                            New Transactions Blocked                       │
                                                                           ▼
                                                                    State: RESOLVED
                                                                 Dashboard Fully Unlocked
```

---

## 3. Recovery Options & Calculation Model

### 3.1. Options Overview

| Option | Identifier | Base Budget Assumption | Carryover Behavior | User Editable |
| :--- | :--- | :--- | :--- | :--- |
| **Review Each Missed Month** | `review` | Suggested from last known snapshot or active config | Computed sequentially per month | Yes (per month & country) |
| **Continue Previous Settings** | `continue` | Exact recurring budget from last finalized month | Rollover computed sequentially | No |
| **Start Fresh This Month** | `fresh` | 0 for all gap months | 0 carryover into current month | No |

### 3.2. Country-Specific Accounting Formula
For each month $m_i \in \mathcal{G}$ and each configured country $c \in \{\text{JP}, \text{IN}, \text{DE}\}$:

1. **Expenses Spent:**
   $$\text{Spent}(m_i, c) = \sum \{ \text{tx.amount} \mid \text{tx} \in \text{transactions}, \text{tx.type} = \text{'expense'}, \text{tx.region} = c, \text{tx.date.startsWith}(m_i) \}$$
2. **Prior Carryover:**
   $$\text{CarryoverPrior}(m_i, c) = \begin{cases} 
   \mathcal{C}[m_0][c + \text{'RolloverAdded'}] & \text{if } i = 1 \text{ and prior closed month } m_0 \text{ exists} \\
   \text{state.budgets}[c].\text{carryover} & \text{if } i = 1 \text{ and no prior closed month} \\
   \text{RolloverAdded}(m_{i-1}, c) & \text{if } i > 1
   \end{cases}$$
3. **Total Available:**
   $$\text{Available}(m_i, c) = \text{BaseBudget}(m_i, c) + \text{CarryoverPrior}(m_i, c)$$
4. **Outgoing Rollover Added:**
   $$\text{RolloverAdded}(m_i, c) = \begin{cases} 
   \text{roundCurrency}(\text{Available}(m_i, c) - \text{Spent}(m_i, c), c) & \text{if rollover enabled and Available} > \text{Spent} \\
   0 & \text{otherwise}
   \end{cases}$$
   *(Note: No negative carryover is ever produced).*

---

## 4. Desktop Recovery User Experience

### 4.1. Visual Identity Alignment
- **Surfaces:** Dark fintech aesthetic (`#0a0a0f` base, `#12121a` cards, `#1a1a24` modal sheet).
- **Typography:** SF Pro / Inter display hierarchy with restrained weights.
- **Accents:** Subtle border layering (`rgba(255, 255, 255, 0.08)`), clean muted subtitles, and restrained neutral-primary buttons.
- **Badges:** Country flag SVGs, currency symbols, and clear pill statuses.

### 4.2. Modal Layout
```
+---------------------------------------------------------------------------------+
| Welcome Back                                                            [ X ]   |
| We found unfinalized months in your budget history. Review before continuing.  |
+---------------------------------------------------------------------------------+
| Unfinalized Period: Aug 2026 – Oct 2026 (3 months)    Countries: JP (¥), IN (₹) |
+---------------------------------------------------------------------------------+
| (•) Review Each Missed Month   ( ) Continue Previous Settings   ( ) Start Fresh |
+---------------------------------------------------------------------------------+
| [ Month 1: 2026-08 ]                                                            |
|   Japan (JPY): Base Budget: [ ¥ 100,000 ] | Spent: ¥ 68,000 | Rollover: [x]     |
|   Available: ¥ 100,000  -->  Rollover Out: ¥ 32,000                             |
+---------------------------------------------------------------------------------+
| [ Month 2: 2026-09 ]                                                            |
|   Japan (JPY): Base Budget: [ ¥ 100,000 ] | Spent: ¥ 75,000 | Rollover: [x]     |
|   Prior: ¥ 32,000 | Available: ¥ 132,000  -->  Rollover Out: ¥ 57,000           |
+---------------------------------------------------------------------------------+
| RESULT FOR CURRENT ACTIVE MONTH (2026-11):                                      |
|   Japan: Total Available = ¥ 157,000 (Base ¥ 100,000 + Reconciled Carryover ¥ 57k)|
+---------------------------------------------------------------------------------+
| [ Remind Me Later (Read-Only) ]                     [ Confirm & Apply Recovery ]|
+---------------------------------------------------------------------------------+
```

### 4.3. Read-Only Fallback Banner
When dismissed without confirmation, the top of the workspace presents:
```
[ ⚠️ Budget Recovery Required: Unfinalized months (2026-08 – 2026-10). New transactions are paused. ] [ Review & Reconcile ]
```

---

## 5. Atomicity, Concurrency & Idempotency Safeguards

1. **Two-Phase Commit:** The entire sequence of monthly snapshots is computed in memory into a candidate transaction plan. If any calculation fails, zero mutations are written to state.
2. **Stale Plan Detection:** If transactions or wallet balances change while the recovery dialog is open, the candidate plan is invalidated, requiring the user to recompute before committing.
3. **Audit Metadata:** On commit, an immutable record is stamped in `state.recoveryMetadata`:
   ```json
   {
     "id": "recovery_1731917400000",
     "reconciledAt": "2026-11-18T16:15:00.000Z",
     "periodStart": "2026-08",
     "periodEnd": "2026-10",
     "activeMonth": "2026-11",
     "option": "review",
     "countries": ["JP", "IN"],
     "reconciledMonths": ["2026-08", "2026-09", "2026-10"]
   }
   ```
4. **Idempotency Guarantee:** Once committed, all gap months are recorded in `state.closedMonths` with `status: 'closed'`. Subsequent page refreshes, synchronizations, or manual close invocations return the sealed records immediately with zero duplicated carryover.

