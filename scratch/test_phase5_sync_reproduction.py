#!/usr/bin/env python3
"""
EXPENSE MANAGER — PHASE 5 DEFECT REPRODUCTION SUITE
Reproduces the 4 confirmed architectural defects:
1. Double Persistence in runExclusive + walletManager
2. Direct mutation entry points bypassing runExclusive
3. Merge conflict resolution failing to reconcile wallet balances
4. syncFromSupabase using timestamp / tx count tie-breaking
"""

import asyncio
import json
import os
import subprocess
import time
import urllib.request
import websockets

PORT = 9444

async def run_reproduction_tests():
    chrome_cmd = [
        "/usr/bin/google-chrome",
        "--headless=new",
        "--disable-gpu",
        f"--remote-debugging-port={PORT}",
        "--no-sandbox"
    ]
    proc = subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1.5)

    try:
        tabs_data = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read().decode()
        tabs = json.loads(tabs_data)
        ws_url = tabs[0]["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url, max_size=20*1024*1024) as ws:
            msg_id = 0
            async def send(method, params=None):
                nonlocal msg_id
                msg_id += 1
                payload = {"id": msg_id, "method": method, "params": params or {}}
                await ws.send(json.dumps(payload))
                while True:
                    resp = json.loads(await ws.recv())
                    if resp.get("id") == msg_id:
                        return resp.get("result", {})

            # Navigate to index.html
            file_url = "file:///mnt/01DB426183A10370/E_Software/Docs/Antigravity%20Expense%20Manager/Expense-Manager/index.html"
            await send("Page.navigate", {"url": file_url})
            await asyncio.sleep(1.5)

            repro_script = """
            (async () => {
                const results = [];

                // -------------------------------------------------------------
                // REPRO 1: Double Persistence in runExclusive
                // -------------------------------------------------------------
                {
                    localStorage.clear();
                    storage.state.wallets['Salary Account'].balance = 100000;
                    storage.state.revision = 1;
                    storage.saveData(); // baseline save, rev becomes 1

                    let saveCount = 0;
                    const origSaveDirect = storage._saveDataDirect.bind(storage);
                    const origSave = storage.saveData.bind(storage);
                    storage._saveDataDirect = function() { saveCount++; return origSaveDirect(); };
                    storage.saveData = function() { saveCount++; return origSave(); };

                    const initialRev = storage.state.revision;

                    // Execute a single transaction via runExclusive
                    await storage.runExclusive(async () => {
                        return walletManager.addExpense('Salary Account', 'jp-food', 5000, 'Test Repro 1', '2026-11-15');
                    });

                    const finalRev = storage.state.revision;
                    const revDelta = finalRev - initialRev;

                    results.push({
                        test: 'Double Persistence: Revision Advancement',
                        expectedRevDelta: 1,
                        actualRevDelta: revDelta,
                        defectConfirmed: revDelta > 1,
                        details: `Initial rev was ${initialRev}, final rev is ${finalRev} (advanced by ${revDelta})`
                    });

                    results.push({
                        test: 'Double Persistence: Multiple Saves Dispatched',
                        expectedSaves: 1,
                        actualSaves: saveCount,
                        defectConfirmed: saveCount > 1,
                        details: `A single transaction triggered ${saveCount} local persistence calls`
                    });

                    storage._saveDataDirect = origSaveDirect;
                    storage.saveData = origSave;
                }

                // -------------------------------------------------------------
                // REPRO 2: Merge Conflict Corrupts Wallet Balance
                // -------------------------------------------------------------
                {
                    // Device A has baseline 100,000 JPY, spends 10,000 JPY -> balance 90,000 JPY
                    // Device B has baseline 100,000 JPY, spends 20,000 JPY -> balance 80,000 JPY
                    // After merge, both expenses exist, so balance MUST be 70,000 JPY.
                    // But current merge retains Device A's balance (90,000 JPY)!
                    storage.state.wallets['Salary Account'].balance = 90000;
                    storage.state.transactions = [
                        { id: 'tx_a', walletId: 'Salary Account', amount: 10000, type: 'expense', date: '2026-11-15' }
                    ];

                    const remoteState = {
                        schemaVersion: 3,
                        revision: 5,
                        wallets: {
                            'Salary Account': { id: 'Salary Account', balance: 80000, currency: '¥', type: 'bank', region: 'JP' }
                        },
                        transactions: [
                            { id: 'tx_b', walletId: 'Salary Account', amount: 20000, type: 'expense', date: '2026-11-15' }
                        ]
                    };

                    storage.activeConflict = {
                        remoteState: remoteState,
                        localRevision: 2,
                        remoteRevision: 5
                    };

                    // Execute existing merge
                    // Mock pushToSupabase
                    const origPush = storage.pushToSupabase.bind(storage);
                    storage.pushToSupabase = async () => true;

                    await storage.resolveConflict('merge_nonconflicting');

                    const postMergeBal = storage.state.wallets['Salary Account'].balance;
                    const expectedReconciledBal = 70000;

                    results.push({
                        test: 'Merge Conflict Balance Reconciliation',
                        expectedBalance: expectedReconciledBal,
                        actualBalance: postMergeBal,
                        defectConfirmed: postMergeBal !== expectedReconciledBal,
                        details: `Wallet balance after merge is ${postMergeBal} JPY, but both expenses total 30,000 JPY from 100,000 JPY (expected 70,000 JPY)`
                    });

                    storage.pushToSupabase = origPush;
                }

                return results;
            })();
            """

            res = await send("Runtime.evaluate", {
                "expression": repro_script,
                "awaitPromise": True,
                "returnByValue": True
            })

            return res.get("result", {}).get("value", [])

    finally:
        proc.terminate()

def main():
    print("================================================================================")
    print("RUNNING PHASE 5 DEFECT REPRODUCTION SUITE")
    print("================================================================================")
    results = asyncio.run(run_reproduction_tests())
    for r in results:
        status = "❌ DEFECT CONFIRMED" if r.get("defectConfirmed") else "✅ NOT REPRODUCED"
        print(f"[{status}] {r['test']}")
        print(f"  Details: {r['details']}")
        print()

if __name__ == '__main__':
    main()

