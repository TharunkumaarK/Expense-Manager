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
PORT = 9478

def capture():
    cmd = [
        '/usr/bin/google-chrome',
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        '--window-size=390,844',
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=/tmp/c_cap_ux2_' + str(int(time.time()))
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

        # 1. Clean first-use state (0 transactions)
        eval_js("""
            (() => {
                localStorage.clear();
                storage.state.onboardingCompleted = true;
                storage.state.activeCountries = ['JP', 'IN'];
                storage.state.defaultCountry = 'JP';
                storage.state.wallets = {
                    'Salary Account': { id: 'Salary Account', name: 'Salary Account', balance: 250000, region: 'JP', currency: '¥', type: 'bank', theme: 'emerald-salary' },
                    'PayPay': { id: 'PayPay', name: 'PayPay', balance: 15400, region: 'JP', currency: '¥', type: 'digital', theme: 'crimson-paypay' }
                };
                storage.state.budgets = {
                    JP: { enabled: true, monthlyTotal: 0, rolloverEnabled: false },
                    IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false }
                };
                storage.state.transactions = [];
                storage.saveData();
                app.init();
                document.getElementById('auth-screen').style.display = 'none';
                document.getElementById('onboarding-screen').style.display = 'none';
                document.getElementById('app-content').style.display = 'block';
                app.switchView('dashboard-view');
                document.getElementById('dashboard-recent-tx-card')?.scrollIntoView({ behavior: 'instant', block: 'center' });
            })()
        """)
        time.sleep(0.5)
        set_vp(390, 844)
        snap("ux_simplification_first_use_dashboard_mobile.png")

        # 2. Action selector modal open
        eval_js("""
            (() => {
                window.scrollTo(0, 0);
                app.openUnifiedTransactionSelector();
            })()
        """)
        time.sleep(0.5)
        snap("ux_simplification_action_selector_mobile.png")

        # 3. Continuous Ledger Empty State
        eval_js("""
            (() => {
                app.closeUnifiedTransactionSelector();
                app.switchView('transactions-view');
            })()
        """)
        time.sleep(0.5)
        snap("ux_simplification_first_use_ledger_mobile.png")

        # 4. Settings Data Management (Desktop 1440px)
        eval_js("""
            (() => {
                app.switchView('settings-view');
                app.switchSettingsSection('data');
            })()
        """)
        set_vp(1440, 900)
        time.sleep(0.5)
        snap("ux_simplification_settings_backup_desktop.png")

        ws.close()
    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    capture()
