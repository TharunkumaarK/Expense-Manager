import json
import os
import subprocess
import time
import urllib.request
import tempfile
import shutil

def measure_viewport(width, height):
    user_data_dir = tempfile.mkdtemp(prefix=f"chrome_perf_opt_{width}_")
    port = 9590 + (width % 100)
    chrome_bin = "/opt/google/chrome/google-chrome" if os.path.exists("/opt/google/chrome/google-chrome") else "/usr/bin/google-chrome-stable"
    chrome_cmd = [
        chrome_bin,
        "--headless=new",
        f"--remote-debugging-port={port}",
        f"--user-data-dir={user_data_dir}",
        "--disable-gpu",
        "--no-sandbox",
        f"--window-size={width},{height}"
    ]
    proc = subprocess.Popen(chrome_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    tabs = None
    for _ in range(15):
        time.sleep(0.4)
        try:
            tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json").read())
            if tabs:
                break
        except Exception:
            pass

    if not tabs:
        print(f"Failed to connect to Chrome for {width}x{height}")
        proc.terminate()
        return None

    try:
        import websocket
        ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"])

        def send(method, params=None):
            msg = {"id": 1, "method": method, "params": params or {}}
            ws.send(json.dumps(msg))
            while True:
                res = json.loads(ws.recv())
                if res.get("id") == 1:
                    return res.get("result", {})

        file_path = os.path.abspath("index.html")
        send("Page.enable")
        send("DOM.enable")
        send("CSS.enable")
        send("Performance.enable")

        t0 = time.time()
        send("Page.navigate", {"url": f"file://{file_path}"})
        time.sleep(1.5)
        load_duration_ms = (time.time() - t0) * 1000

        # Inject sample transactions and state to simulate real user load
        init_js = """
        (() => {
            const t0 = performance.now();
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';

            storage.state.preferences = storage.state.preferences || {};
            storage.state.preferences.onboardingCompleted = true;
            storage.state.preferences.activeCountries = ['IN', 'JP'];
            storage.state.primaryOperatingCountry = 'IN';
            storage.state.wallets = {
                'HDFC Salary': { id: 'HDFC Salary', type: 'bank', region: 'IN', currency: '₹', balance: 95000 },
                'ICICI Savings': { id: 'ICICI Savings', type: 'bank', region: 'IN', currency: '₹', balance: 45000 },
                'SMBC Main': { id: 'SMBC Main', type: 'bank', region: 'JP', currency: '¥', balance: 350000 }
            };
            storage.state.loanConfig = {
                enabled: true,
                country: 'IN',
                currency: '₹',
                repaymentWallet: 'HDFC Salary',
                totalPrincipal: 500000,
                principalLeft: 400000,
                totalDues: 24,
                duesPaid: 5,
                emi: 25000,
                emiDrawDate: 7,
                percentMode: 'principal'
            };
            storage.state.categories = {
                IN: [
                    { id: 'in-groceries', name: 'Groceries', icon: 'shopping-cart', budget: 20000 },
                    { id: 'in-rent', name: 'Rent', icon: 'home', budget: 35000 },
                    { id: 'in-loan', name: 'Loan EMI', icon: 'landmark', budget: 25000 },
                    { id: 'in-dining', name: 'Dining', icon: 'utensils', budget: 15000 }
                ],
                JP: [
                    { id: 'jp-food', name: 'Food', icon: 'utensils', budget: 50000 },
                    { id: 'jp-utilities', name: 'Utilities', icon: 'zap', budget: 20000 }
                ]
            };
            
            // Generate 150 transactions for realistic ledger benchmarking
            const txs = [];
            const types = ['expense', 'expense', 'income', 'expense'];
            for (let i = 0; i < 150; i++) {
                txs.push({
                    id: 'tx-bench-' + i,
                    type: types[i % 4],
                    walletId: (i % 2 === 0) ? 'HDFC Salary' : 'ICICI Savings',
                    categoryId: (i % 2 === 0) ? 'in-groceries' : 'in-dining',
                    amount: 500 + (i * 35),
                    note: 'Benchmark ledger entry #' + i,
                    date: '2026-11-' + String((i % 28) + 1).padStart(2, '0'),
                    region: 'IN',
                    currency: '₹',
                    createdAt: new Date().toISOString()
                });
            }
            storage.state.transactions = txs;
            if (typeof storage._saveDataDirect === 'function') storage._saveDataDirect();

            // Benchmark renderAll()
            const renderStart = performance.now();
            app.switchView('home-view');
            app.renderAll();
            const renderEnd = performance.now();

            // Benchmark view switch to transactions
            const switchTxStart = performance.now();
            app.switchView('transactions-view');
            const switchTxEnd = performance.now();

            // Benchmark view switch back to home
            const switchHomeStart = performance.now();
            app.switchView('home-view');
            const switchHomeEnd = performance.now();

            // Measure DOM nodes and Lucide SVGs
            const totalDomNodes = document.getElementsByTagName('*').length;
            const lucideSvgCount = document.querySelectorAll('svg.lucide').length;
            const lucidePendingCount = document.querySelectorAll('[data-lucide]').length;

            return {
                renderAllMs: renderEnd - renderStart,
                switchTransactionsMs: switchTxEnd - switchTxStart,
                switchHomeMs: switchHomeEnd - switchHomeStart,
                totalDomNodes: totalDomNodes,
                lucideSvgCount: lucideSvgCount,
                lucidePendingCount: lucidePendingCount
            };
        })()
        """
        eval_res = send("Runtime.evaluate", {"expression": init_js, "returnByValue": True})
        metrics = eval_res.get("result", {}).get("value", {})

        perf_res = send("Performance.getMetrics")
        raw_metrics = {m["name"]: m["value"] for m in perf_res.get("metrics", [])}

        ws.close()
        return {
            "viewport": f"{width}x{height}",
            "metrics": metrics,
            "raw": {
                "JSHeapUsedSize": raw_metrics.get("JSHeapUsedSize", 0) / (1024 * 1024),
                "LayoutCount": raw_metrics.get("LayoutCount", 0),
                "RecalcStyleCount": raw_metrics.get("RecalcStyleCount", 0),
                "LayoutDuration": raw_metrics.get("LayoutDuration", 0) * 1000,
                "RecalcStyleDuration": raw_metrics.get("RecalcStyleDuration", 0) * 1000,
                "ScriptDuration": raw_metrics.get("ScriptDuration", 0) * 1000,
                "TaskDuration": raw_metrics.get("TaskDuration", 0) * 1000
            }
        }
    finally:
        proc.terminate()
        shutil.rmtree(user_data_dir, ignore_errors=True)

if __name__ == "__main__":
    results = {}
    for w, h in [(360, 780), (390, 844), (430, 932), (1440, 1024)]:
        print(f"Measuring optimized viewport {w}x{h}...")
        res = measure_viewport(w, h)
        if res:
            results[f"{w}x{h}"] = res
            print(json.dumps(res, indent=2))

    with open("scratch/optimized_performance.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Optimized measurement saved to scratch/optimized_performance.json")

    # Compare with baseline
    if os.path.exists("scratch/baseline_performance.json"):
        with open("scratch/baseline_performance.json") as f:
            baseline = json.load(f)
        
        print("\n" + "="*80)
        print("PERFORMANCE BENCHMARK COMPARISON: BASELINE vs OPTIMIZED")
        print("="*80)
        print(f"{'Viewport':<12} | {'renderAll() Baseline':<20} | {'renderAll() Optimized':<22} | {'TaskDuration Baseline':<22} | {'TaskDuration Optimized':<24}")
        print("-" * 106)
        for vp in ["360x780", "390x844", "430x932", "1440x1024"]:
            b_m = baseline.get(vp, {}).get("metrics", {})
            o_m = results.get(vp, {}).get("metrics", {})
            b_r = baseline.get(vp, {}).get("raw", {})
            o_r = results.get(vp, {}).get("raw", {})
            print(f"{vp:<12} | {b_m.get('renderAllMs', 0):>17.2f} ms | {o_m.get('renderAllMs', 0):>19.2f} ms | {b_r.get('TaskDuration', 0):>19.2f} ms | {o_r.get('TaskDuration', 0):>21.2f} ms")

