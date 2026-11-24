import os
import sys
import time
import json
import base64
import subprocess
import urllib.request
import websocket

HTML_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
ARTIFACT_DIR = '/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128'
PORT = 9489

def capture():
    cmd = [
        '/usr/bin/google-chrome',
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        '--window-size=390,844',
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=/tmp/c_cap_p1_final_' + str(int(time.time()))
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    
    try:
        res = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read()
        ws_url = json.loads(res.decode('utf-8'))[0]['webSocketDebuggerUrl']
        ws = websocket.create_connection(ws_url)
        
        msg_id = 0
        def call(method, params=None):
            nonlocal msg_id
            msg_id += 1
            ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
            while True:
                resp = json.loads(ws.recv())
                if resp.get("id") == msg_id:
                    return resp.get("result", {})

        def eval_js(expr):
            r = call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
            return r.get("result", {}).get("value")

        def set_vp(w, h):
            call("Emulation.setDeviceMetricsOverride", {
                "width": w,
                "height": h,
                "deviceScaleFactor": 2,
                "mobile": w <= 768
            })
            time.sleep(0.15)

        def snap(filename):
            out_path = os.path.join(ARTIFACT_DIR, filename)
            res = call("Page.captureScreenshot", {"format": "png"})
            data = res.get("data")
            if data:
                with open(out_path, "wb") as f:
                    f.write(base64.b64decode(data))
                print(f"Captured: {out_path}")

        call("Page.enable")
        call("Runtime.enable")
        call("Page.navigate", {"url": f"file://{HTML_PATH}"})
        time.sleep(1.5)

        # 1. State with multi-currency remittances and unconfigured budget
        eval_js("""
            (() => {
                localStorage.clear();
                storage.state.onboardingCompleted = true;
                storage.state.activeCountries = ['JP', 'IN', 'DE'];
                storage.state.defaultCountry = 'JP';
                storage.state.wallets = {
                    'jp-bank': { id: 'jp-bank', name: 'Japan Bank', balance: 250000, region: 'JP', currency: '¥', type: 'bank', theme: 'emerald-salary' },
                    'in-bank': { id: 'in-bank', name: 'India Bank', balance: 50000, region: 'IN', currency: '₹', type: 'bank', theme: 'burgundy-axis' },
                    'de-bank': { id: 'de-bank', name: 'German Bank', balance: 2500, region: 'DE', currency: '€', type: 'bank', theme: 'frankfurt-slate' }
                };
                storage.state.budgets = {
                    JP: { enabled: true, monthlyTotal: 0, rolloverEnabled: false },
                    IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false },
                    DE: { enabled: true, monthlyTotal: 1000, rolloverEnabled: false }
                };
                storage.state.transactions = [
                    { id: 'tx-remit-1', type: 'remittance', sourceId: 'jp-bank', destId: 'in-bank', sourceAmount: 50000, destAmount: 27500, sourceCurrency: '¥', destCurrency: '₹', exchangeRate: '0.550000', date: '2026-11-24', note: 'Monthly family support' },
                    { id: 'tx-remit-2', type: 'remittance', sourceId: 'de-bank', destId: 'in-bank', sourceAmount: 500, destAmount: 45000, sourceCurrency: '€', destCurrency: '₹', exchangeRate: '90.000000', date: '2026-11-24', note: 'Savings transfer' },
                    { id: 'tx-remit-3', type: 'remittance', sourceId: 'jp-bank', destId: 'de-bank', sourceAmount: 100000, destAmount: 620, sourceCurrency: '¥', destCurrency: '€', exchangeRate: '0.006200', date: '2026-11-23', note: 'Tuition deposit' }
                ];
                storage.saveData();
                app.init();
                document.getElementById('auth-screen').style.display = 'none';
                document.getElementById('onboarding-screen').style.display = 'none';
                document.getElementById('app-content').style.display = 'block';
                app.isPrivacyHidden = false;
                app.switchView('transactions-view');
            })()
        """)
        time.sleep(0.5)
        set_vp(390, 844)
        snap("ux_phase1_remittance_multi_currency_ledger.png")

        # 2. Action selector modal open (Verify "Transfer Between Accounts")
        eval_js("app.openUnifiedTransactionSelector();")
        time.sleep(0.5)
        snap("ux_phase1_action_selector_transfer_terminology.png")

        # 3. Unconfigured budget overview card on Dashboard
        eval_js("""
            (() => {
                app.closeUnifiedTransactionSelector();
                app.switchView('dashboard-view');
                document.getElementById('dashboard-central-budget-card-jp')?.scrollIntoView({ behavior: 'instant', block: 'center' });
            })()
        """)
        time.sleep(0.5)
        snap("ux_phase1_budget_distinct_states.png")

        ws.close()
    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    capture()

