#!/usr/bin/env python3
"""
EXPENSE MANAGER — PHASE 5 FINAL ARCHITECTURAL INTEGRATION & SYNCHRONIZATION TEST SUITE
File: scratch/test_phase5_sync_integration.py

Comprehensive browser-level verification of:
- Real UI entry points (app.handleFormSubmit, app.closeMonth, app.confirmBudgetRecovery, app.deleteTx)
- Multi-tab exclusive mutual exclusion (Web Locks API)
- Exactly-once local persistence and revision advancement (Eliminating double persistence)
- Serialized per-account cloud sync queue
- Strict revision-lineage Supabase CAS concurrency
- Conflict resolution safety (accept_cloud durable backup, overwrite_cloud server pre-flight, merge disabled)
- Web Locks unavailable safe refusal
- Production continuous ledger invariants (116 txs, 6 wallets, Axis Bank ₹46,794.53)
"""

import asyncio
import json
import os
import shutil
import subprocess
import time
import urllib.request
import websockets

PORT = 9555
PROFILE_DIR = f"/tmp/em_phase5_sync_integration_{int(time.time())}"
PROD_FIXTURE_PATH = "/tmp/ExpenseManager_Production_Export_2026-11-16.json"

class TabClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 0

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=20*1024*1024)

    async def send(self, method, params=None):
        self.msg_id += 1
        payload = {"id": self.msg_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(payload))
        while True:
            resp = json.loads(await self.ws.recv())
            if resp.get("id") == self.msg_id:
                return resp.get("result", {})

    async def eval(self, expr):
        res = await self.send("Runtime.evaluate", {
            "expression": expr,
            "awaitPromise": True,
            "returnByValue": True
        })
        if "exceptionDetails" in res:
            raise RuntimeError(f"CDP Eval Exception: {res['exceptionDetails']}")
        return res.get("result", {}).get("value")

    async def close(self):
        if self.ws:
            await self.ws.close()

async def run_integration_tests():
    os.makedirs(PROFILE_DIR, exist_ok=True)
    chrome_cmd = [
        "/usr/bin/google-chrome",
        "--headless=new",
        "--disable-gpu",
        f"--remote-debugging-port={PORT}",
        f"--user-data-dir={PROFILE_DIR}",
        "--no-sandbox"
    ]
    proc = subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(2.0)

    try:
        tabs_data = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read().decode()
        tabs = json.loads(tabs_data)
        tab1_ws = tabs[0]["webSocketDebuggerUrl"]

        client1 = TabClient(tab1_ws)
        await client1.connect()

        # Open Tab 2 in the same shared profile
        create_res = await client1.send("Target.createTarget", {"url": "about:blank"})
        target_id2 = create_res["targetId"]
        await asyncio.sleep(0.5)

        tabs_data2 = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read().decode()
        tabs2 = json.loads(tabs_data2)
        tab2_obj = next(t for t in tabs2 if t.get("id") == target_id2)
        client2 = TabClient(tab2_obj["webSocketDebuggerUrl"])
        await client2.connect()

        file_url = "file:///mnt/01DB426183A10370/E_Software/Docs/Antigravity%20Expense%20Manager/Expense-Manager/index.html"
        await client1.send("Page.navigate", {"url": file_url})
        await client2.send("Page.navigate", {"url": file_url})
        await asyncio.sleep(2.0)

        # Wait for scripts on both tabs
        wait_script = """
        (async () => {
            while (typeof storage === 'undefined' || typeof app === 'undefined' || typeof walletManager === 'undefined') {
                await new Promise(r => setTimeout(r, 50));
            }
            return true;
        })()
        """
        await client1.eval(wait_script)
        await client2.eval(wait_script)

        results = []

        # ---------------------------------------------------------------------
        # TEST 1: Exactly-Once Local Persistence & Single Revision Advancement
        # ---------------------------------------------------------------------
        t1_res = await client1.eval("""
        (async () => {
            localStorage.clear();
            storage.state.wallets['Salary Account'].balance = 100000;
            storage.state.revision = 1;
            storage.saveData();

            let saveDirectCalls = 0;
            let setItemCalls = 0;
            const origSaveDirect = storage._saveDataDirect.bind(storage);
            storage._saveDataDirect = function() { saveDirectCalls++; return origSaveDirect(); };

            const origSetItem = localStorage.setItem.bind(localStorage);
            localStorage.setItem = function(k, v) {
                if (k === storage.getActiveStorageKey()) setItemCalls++;
                return origSetItem(k, v);
            };

            const initialRev = storage.state.revision;

            // Open transaction modal to populate form inputs
            app.openTransactionModal('expense');
            document.getElementById('tx-wallet').value = 'Salary Account';
            document.getElementById('tx-category').value = 'jp-food';
            document.getElementById('tx-amount').value = '12000';
            document.getElementById('tx-date').value = '2026-11-15';
            document.getElementById('tx-note').value = 'Grocery run';

            const form = document.getElementById('tx-form');
            const submitEvent = new Event('submit', { cancelable: true });
            await app.handleFormSubmit(submitEvent, null, 'expense');

            const finalRev = storage.state.revision;
            const bal = storage.state.wallets['Salary Account'].balance;

            storage._saveDataDirect = origSaveDirect;
            localStorage.setItem = origSetItem;

            return {
                saveDirectCalls,
                setItemCalls,
                revDelta: finalRev - initialRev,
                balance: bal,
                success: (saveDirectCalls === 1 && setItemCalls === 1 && (finalRev - initialRev) === 1 && bal === 88000)
            };
        })()
        """)
        results.append({
            "name": "TEST 1 — Single Local Persistence & Exactly-Once Revision Advancement",
            "passed": t1_res["success"],
            "details": f"saveDirect={t1_res['saveDirectCalls']}, setItemCalls={t1_res['setItemCalls']}, revDelta={t1_res['revDelta']}, balance={t1_res['balance']}"
        })

        # ---------------------------------------------------------------------
        # TEST 2: Concurrent Multi-Tab UI Mutations (Two Tabs Add Expenses Concurrently)
        # ---------------------------------------------------------------------
        # Tab 1 starts with 88,000 JPY. Tab 1 adds 15,000 JPY; Tab 2 adds 18,000 JPY concurrently.
        # Expected final balance: 88,000 - 15,000 - 18,000 = 55,000 JPY.
        p1 = client1.eval("""
        (async () => {
            app.openTransactionModal('expense');
            document.getElementById('tx-wallet').value = 'Salary Account';
            document.getElementById('tx-category').value = 'jp-dining';
            document.getElementById('tx-amount').value = '15000';
            document.getElementById('tx-date').value = '2026-11-16';
            document.getElementById('tx-note').value = 'Tab 1 Expense';
            await app.handleFormSubmit(new Event('submit', { cancelable: true }), null, 'expense');
            return storage.state.wallets['Salary Account'].balance;
        })()
        """)
        p2 = client2.eval("""
        (async () => {
            app.openTransactionModal('expense');
            document.getElementById('tx-wallet').value = 'Salary Account';
            document.getElementById('tx-category').value = 'jp-transport';
            document.getElementById('tx-amount').value = '18000';
            document.getElementById('tx-date').value = '2026-11-16';
            document.getElementById('tx-note').value = 'Tab 2 Expense';
            await app.handleFormSubmit(new Event('submit', { cancelable: true }), null, 'expense');
            return storage.state.wallets['Salary Account'].balance;
        })()
        """)

        r1, r2 = await asyncio.gather(p1, p2)
        await asyncio.sleep(0.5)

        # Reload authoritative check
        t2_check = await client1.eval("""
        (() => {
            storage.reloadAuthoritativeLocalState();
            const b = storage.state.wallets['Salary Account'].balance;
            const txs = storage.state.transactions.filter(t => t.note && t.note.includes('Tab '));
            return { balance: b, tabTxCount: txs.length, rev: storage.state.revision };
        })()
        """)

        results.append({
            "name": "TEST 2 — Concurrent Multi-Tab UI Transaction Serialization",
            "passed": (t2_check["balance"] == 55000 and t2_check["tabTxCount"] == 2),
            "details": f"Final balance={t2_check['balance']} JPY (expected 55,000 JPY), Tab txs={t2_check['tabTxCount']}, rev={t2_check['rev']}"
        })

        # ---------------------------------------------------------------------
        # TEST 3: Actual UI Month Close Coordination Under Concurrency
        # ---------------------------------------------------------------------
        # Two tabs attempt to close the same month simultaneously through app.closeMonth()
        close_p1 = client1.eval("""
        (async () => {
            window.confirm = () => true;
            window.alert = () => {};
            return await app.closeMonth();
        })()
        """)
        close_p2 = client2.eval("""
        (async () => {
            window.confirm = () => true;
            window.alert = () => {};
            return await app.closeMonth();
        })()
        """)
        await asyncio.gather(close_p1, close_p2)
        await asyncio.sleep(0.5)

        t3_check = await client1.eval("""
        (() => {
            storage.reloadAuthoritativeLocalState();
            const curMonth = storage.getCurrentMonthKey();
            const closedKeys = Object.keys(storage.state.closedMonths || {});
            const snap = storage.state.closedMonths[curMonth];
            return {
                closedMonthCount: closedKeys.length,
                snapshotExists: Boolean(snap),
                revision: storage.state.revision
            };
        })()
        """)

        results.append({
            "name": "TEST 3 — Concurrent UI Month Closure Idempotency",
            "passed": (t3_check["closedMonthCount"] == 1 and t3_check["snapshotExists"] is True),
            "details": f"Closed months count={t3_check['closedMonthCount']}, Snapshot exists={t3_check['snapshotExists']}"
        })

        # ---------------------------------------------------------------------
        # TEST 4: Budget Recovery Confirmation Under Exclusive Coordinator
        # ---------------------------------------------------------------------
        t4_res = await client1.eval("""
        (async () => {
            // Setup a gap month scenario
            storage.state.currentMonthKey = '2026-08';
            storage.state.closedMonths = {
                '2026-07': { monthKey: '2026-07', JPRolloverAdded: 5000, closedAt: '2026-07-31T23:59:59Z' }
            };
            storage.state.budgets.JP = { enabled: true, monthlyTotal: 60000, rolloverEnabled: true, carryover: 5000 };
            storage.saveData();

            // Open recovery UI and confirm recovery
            app.budgetRecoveryState.option = 'continue';
            app.budgetRecoveryState.customAdjustments = {};
            app.budgetRecoveryState.preview = storage.getBudgetRecoveryPreview('continue', {});

            let lockUsed = false;
            const origRunExclusive = storage.runExclusive.bind(storage);
            storage.runExclusive = async function(fn, opts) {
                lockUsed = true;
                return await origRunExclusive(fn, opts);
            };

            await app.confirmBudgetRecovery();
            storage.runExclusive = origRunExclusive;

            return {
                lockUsed,
                recoveryState: storage.getBudgetRecoveryStatus(),
                closedMonths: Object.keys(storage.state.closedMonths || {})
            };
        })()
        """)

        results.append({
            "name": "TEST 4 — Budget Recovery Coordinates via Unified Exclusive Mutex",
            "passed": (t4_res["lockUsed"] is True and t4_res["recoveryState"] == "RESOLVED"),
            "details": f"Coordinator lockUsed={t4_res['lockUsed']}, final recoveryState={t4_res['recoveryState']}"
        })

        # ---------------------------------------------------------------------
        # TEST 5: Dirty Modal Non-Destructive Banner Protection
        # ---------------------------------------------------------------------
        t5_res = await client2.eval("""
        (async () => {
            // Open transaction modal with user draft
            app.openTransactionModal('expense');
            const noteInput = document.getElementById('tx-note');
            noteInput.value = 'Unsaved draft in Tab 2';
            noteInput.dispatchEvent(new Event('input'));
            return app.isAnyModalDirty();
        })()
        """)

        # Tab 1 commits an expense while Tab 2 modal is open
        await client1.eval("""
        (async () => {
            await storage.runExclusive(async () => {
                return walletManager.addExpense('Salary Account', 'jp-food', 2500, 'Tab 1 Background Spend', '2026-11-15');
            });
        })()
        """)
        await asyncio.sleep(0.5)

        t5_verify = await client2.eval("""
        (() => {
            const banner = document.getElementById('tx-modal-conflict-banner') || document.querySelector('.modal-conflict-banner');
            const noteInput = document.getElementById('tx-note');
            const isBannerVisible = banner && banner.style.display !== 'none';
            const draftPreserved = noteInput && noteInput.value === 'Unsaved draft in Tab 2';
            app.closeModal('transaction-modal');
            return { isBannerVisible, draftPreserved };
        })()
        """)

        results.append({
            "name": "TEST 5 — Dirty Modal Conflict Banner & Input Preservation",
            "passed": (t5_verify["isBannerVisible"] is True and t5_verify["draftPreserved"] is True),
            "details": f"Banner visible={t5_verify['isBannerVisible']}, Draft preserved={t5_verify['draftPreserved']}"
        })

        # ---------------------------------------------------------------------
        # TEST 6: Supabase PostgREST CAS Optimistic Concurrency Rejection
        # ---------------------------------------------------------------------
        t6_res = await client1.eval("""
        (async () => {
            supabaseClient.session = { user: { id: 'cas_test_user' } };
            supabaseClient.client = {
                from: (table) => ({
                    update: (payload) => ({
                        eq: (k1, v1) => ({
                            eq: (k2, v2) => ({
                                // Stale write rejection: 0 rows updated
                                select: async () => ({ data: [], error: null })
                            })
                        })
                    }),
                    select: () => ({
                        eq: () => ({
                            single: async () => ({
                                data: {
                                    state: {
                                        revision: 8,
                                        wallets: { 'Salary Account': { id: 'Salary Account', balance: 40000, currency: '¥', type: 'bank', region: 'JP' } },
                                        transactions: [{ id: 'cloud_tx_1', amount: 10000, date: '2026-11-15', walletId: 'Salary Account' }]
                                    },
                                    updated_at: '2026-11-19T20:00:00Z'
                                },
                                error: null
                            })
                        })
                    })
                })
            };

            storage.initialSyncDone = true;
            storage.state.preferences.onboardingCompleted = true;
            storage.lastConfirmedCloudRevision = 2; // Stale client expecting rev 2
            storage.state.revision = 3;

            const pushResult = await storage.pushToSupabase();
            return {
                pushResult,
                syncStatus: storage.cloudSyncStatus,
                hasConflict: Boolean(storage.activeConflict),
                stashedRemoteRev: storage.activeConflict?.remoteRevision
            };
        })()
        """)

        results.append({
            "name": "TEST 6 — Supabase CAS Stale Write Rejection & Conflict Stashing",
            "passed": (t6_res["pushResult"] is False and t6_res["syncStatus"] == "CONFLICT" and t6_res["stashedRemoteRev"] == 8),
            "details": f"Push result={t6_res['pushResult']}, status={t6_res['syncStatus']}, remoteRev={t6_res['stashedRemoteRev']}"
        })

        # ---------------------------------------------------------------------
        # TEST 7: Conflict Resolution Strategy 'accept_cloud' Verifies Durable Backup
        # ---------------------------------------------------------------------
        t7_res = await client1.eval("""
        (async () => {
            const localRevBefore = storage.state.revision;
            const res = await storage.resolveConflict('accept_cloud');

            // Verify that a durable backup key was written to localStorage
            const backupKeys = Object.keys(localStorage).filter(k => k.includes('_local_backup_'));
            return {
                success: res.success,
                durableBackupWritten: backupKeys.length > 0,
                currentRev: storage.state.revision,
                conflictCleared: storage.activeConflict === null
            };
        })()
        """)

        results.append({
            "name": "TEST 7 — Conflict Resolution 'accept_cloud' with Durable Local Backup",
            "passed": (t7_res["success"] is True and t7_res["durableBackupWritten"] is True and t7_res["conflictCleared"] is True),
            "details": f"Success={t7_res['success']}, durableBackup={t7_res['durableBackupWritten']}, conflictCleared={t7_res['conflictCleared']}"
        })

        # ---------------------------------------------------------------------
        # TEST 8: Conflict Resolution Strategy 'overwrite_cloud' Re-checks Server
        # ---------------------------------------------------------------------
        t8_res = await client1.eval("""
        (async () => {
            // Setup active conflict
            storage.activeConflict = {
                remoteRevision: 10,
                localRevision: 5,
                remoteState: { revision: 10, wallets: {}, transactions: [] }
            };

            // Server re-check returns rev 10 (matching), and push succeeds
            supabaseClient.session = { user: { id: 'cas_test_user' } };
            supabaseClient.client = {
                from: (table) => ({
                    select: () => ({
                        eq: () => ({
                            single: async () => ({
                                data: { state: { revision: 10 }, updated_at: '2026-11-19T20:10:00Z' },
                                error: null
                            })
                        })
                    }),
                    upsert: async () => ({ error: null }),
                    update: () => ({
                        eq: () => ({
                            eq: () => ({
                                select: async () => ({ data: [{ updated_at: '2026-11-19T20:11:00Z' }], error: null })
                            })
                        })
                    })
                })
            };

            const res = await storage.resolveConflict('overwrite_cloud');
            const remoteBackupKeys = Object.keys(localStorage).filter(k => k.includes('_remote_backup_'));
            return {
                success: res.success,
                newRevision: storage.state.revision,
                remoteBackupWritten: remoteBackupKeys.length > 0
            };
        })()
        """)

        results.append({
            "name": "TEST 8 — Conflict Resolution 'overwrite_cloud' with Pre-Flight Server Check",
            "passed": (t8_res["success"] is True and t8_res["newRevision"] > 10 and t8_res["remoteBackupWritten"] is True),
            "details": f"Success={t8_res['success']}, newRev={t8_res['newRevision']}, remoteBackupWritten={t8_res['remoteBackupWritten']}"
        })

        # ---------------------------------------------------------------------
        # TEST 9: Conflict Resolution Strategy 'merge_nonconflicting' Disabled for Safety
        # ---------------------------------------------------------------------
        t9_res = await client1.eval("""
        (async () => {
            storage.activeConflict = {
                remoteRevision: 12,
                localRevision: 11,
                remoteState: { revision: 12 }
            };
            const res = await storage.resolveConflict('merge_nonconflicting');
            return res;
        })()
        """)

        results.append({
            "name": "TEST 9 — Automatic Merge Refusal for Financial Safety (MERGE_DISABLED)",
            "passed": (t9_res.get("success") is False and t9_res.get("code") == "MERGE_DISABLED"),
            "details": f"Success={t9_res.get('success')}, code={t9_res.get('code')}, error={t9_res.get('error')}"
        })

        # ---------------------------------------------------------------------
        # TEST 10: Web Locks Unavailable Safe Refusal in Multi-Tab Browser Context
        # ---------------------------------------------------------------------
        t10_res = await client1.eval("""
        (async () => {
            // Temporarily hide navigator.locks to simulate an unsupported browser
            const origLocks = navigator.locks;
            Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });

            const res = await storage.runExclusive(async () => {
                return walletManager.addExpense('Salary Account', 'jp-food', 1000, 'Should Be Refused', '2026-11-15');
            });

            Object.defineProperty(navigator, 'locks', { value: origLocks, configurable: true });
            return res;
        })()
        """)

        results.append({
            "name": "TEST 10 — Safe Refusal of Concurrent Writes When Web Locks Unavailable",
            "passed": (isinstance(t10_res, dict) and t10_res.get("success") is False and t10_res.get("code") == "LOCK_UNAVAILABLE"),
            "details": f"Result={t10_res}"
        })

        # ---------------------------------------------------------------------
        # TEST 11: Production Continuous Ledger Invariant Validation
        # ---------------------------------------------------------------------
        prod_data = None
        if os.path.exists(PROD_FIXTURE_PATH):
            with open(PROD_FIXTURE_PATH, "r") as fp:
                prod_data = json.load(fp)

        if prod_data:
            t11_res = await client1.eval("""
            (() => {
                const raw = """ + json.dumps(prod_data) + """;
                const preview = storage.previewContinuousLedgerMigration(raw);
                if (!preview.success) return { success: false, error: preview.error };

                const m = preview.migratedState;
                const axis = m.wallets['Axis Bank'];
                const salary = m.wallets['Salary Account'];
                const cash = m.wallets['Cash'];

                return {
                    success: true,
                    txCount: m.transactions.length,
                    walletCount: Object.keys(m.wallets).length,
                    axisBalance: axis ? axis.balance : null,
                    salaryBalance: salary ? salary.balance : null,
                    cashBalance: cash ? cash.balance : null
                };
            })()
            """)

            invariants_met = (
                t11_res.get("success") is True and
                t11_res.get("txCount") == 116 and
                t11_res.get("walletCount") == 6 and
                t11_res.get("axisBalance") == 46794.53 and
                t11_res.get("salaryBalance") == 31907 and
                t11_res.get("cashBalance") == 12698
            )

            results.append({
                "name": "TEST 11 — Production Continuous Ledger Invariants (116 txs, Axis Bank ₹46,794.53)",
                "passed": invariants_met,
                "details": f"txCount={t11_res.get('txCount')} (exp 116), wallets={t11_res.get('walletCount')} (exp 6), Axis={t11_res.get('axisBalance')} (exp 46794.53)"
            })
        else:
            results.append({
                "name": "TEST 11 — Production Continuous Ledger Invariants",
                "passed": False,
                "details": f"Fixture not found at {PROD_FIXTURE_PATH}"
            })

        await client1.close()
        await client2.close()
        return results

    finally:
        proc.terminate()
        shutil.rmtree(PROFILE_DIR, ignore_errors=True)

def main():
    print("================================================================================")
    print("EXPENSE MANAGER — PHASE 5 FINAL SYNCHRONIZATION INTEGRATION TEST SUITE")
    print("================================================================================")
    results = asyncio.run(run_integration_tests())

    all_passed = True
    print("\n--- DETAILED TEST EXECUTION RESULTS ---")
    for r in results:
        status = "✅ PASS" if r["passed"] else "❌ FAIL"
        if not r["passed"]:
            all_passed = False
        print(f"[{status}] {r['name']}")
        print(f"       Details: {r['details']}")

    print("================================================================================")
    if all_passed:
        print("🎉 ALL PHASE 5 INTEGRATION & CONCURRENCY TESTS PASSED PERFECTLY (100%)!")
    else:
        print("❌ SOME INTEGRATION TESTS FAILED.")
    print("================================================================================")
    return all_passed

if __name__ == '__main__':
    exit(0 if main() else 1)
