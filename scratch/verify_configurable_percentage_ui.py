import json
import os
import subprocess
import time
import urllib.request
import base64
import tempfile
import shutil

ARTIFACT_DIR = "/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128"

def run():
    user_data_dir = tempfile.mkdtemp(prefix="chrome_loan_pct_")
    port = 9568
    chrome_bin = "/opt/google/chrome/google-chrome" if os.path.exists("/opt/google/chrome/google-chrome") else "/usr/bin/google-chrome-stable"
    chrome_cmd = [
        chrome_bin,
        "--headless=new",
        f"--remote-debugging-port={port}",
        f"--user-data-dir={user_data_dir}",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1600,1800"
    ]
    proc = subprocess.Popen(chrome_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    tabs = None
    for _ in range(12):
        time.sleep(0.5)
        try:
            tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json").read())
            if tabs:
                break
        except Exception:
            pass

    if not tabs:
        print("Failed to connect to Chrome")
        proc.terminate()
        return

    try:
        ws_url = tabs[0]["webSocketDebuggerUrl"]
        import websocket
        ws = websocket.create_connection(ws_url)

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
        send("Page.navigate", {"url": f"file://{file_path}"})
        time.sleep(2)

        # 1. Initialize State with Active Loan in Principal Mode
        init_js = """
        (() => {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';

            storage.state.preferences = storage.state.preferences || {};
            storage.state.preferences.onboardingCompleted = true;
            storage.state.preferences.activeCountries = ['IN'];
            storage.state.primaryOperatingCountry = 'IN';
            storage.state.wallets = {
                'HDFC Salary': { id: 'HDFC Salary', type: 'bank', region: 'IN', currency: '₹', balance: 95000 }
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
                percentMode: 'principal',
                annualInterestRate: 9.5
            };
            storage.state.categories = {
                IN: [{ id: 'in-loan', name: 'Loan EMI', icon: 'landmark' }]
            };
            storage.state.transactions = [];

            if (typeof storage._saveDataDirect === 'function') {
                storage._saveDataDirect();
            }

            if (window.app) {
                app.switchView('home-view');
                app.isPrivacyHidden = false;
                app.renderLoanTracker();
                app.renderTransactions();
                if (window.lucide) lucide.createIcons();
            }
            return true;
        })()
        """
        send("Runtime.evaluate", {"expression": init_js})
        time.sleep(1)

        def capture_element(selector, filename, padding=20):
            box_res = send("Runtime.evaluate", {
                "expression": f"""
                (() => {{
                    const el = document.querySelector('{selector}');
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    return {{ x: Math.max(0, r.left), y: Math.max(0, r.top), width: r.width, height: r.height }};
                }})()
                """,
                "returnByValue": True
            })
            val = box_res.get("result", {}).get("value")
            if not val or val.get("width") == 0:
                print(f"Element {selector} not found or 0 width, taking viewport screenshot")
                shot = send("Page.captureScreenshot", {"format": "png"})
            else:
                shot = send("Page.captureScreenshot", {
                    "format": "png",
                    "clip": {
                        "x": max(0, val["x"] - padding),
                        "y": max(0, val["y"] - padding),
                        "width": val["width"] + (padding * 2),
                        "height": val["height"] + (padding * 2),
                        "scale": 1
                    }
                })
            
            img_data = base64.b64decode(shot["data"])
            scratch_path = os.path.join("scratch", filename)
            with open(scratch_path, "wb") as f:
                f.write(img_data)
            artifact_path = os.path.join(ARTIFACT_DIR, filename)
            shutil.copyfile(scratch_path, artifact_path)
            print(f"Captured: {filename} -> ({val['width']}x{val['height']}) -> {scratch_path} & {artifact_path}")

        # Capture 1: Principal Mode on Dashboard
        capture_element("#loan-tracker-widget", "loan_percentage_principal_mode.png")

        # Capture 2: Settings Page with Percentage Mode Dropdown and Interest Rate
        send("Runtime.evaluate", {
            "expression": """
            (() => {
                app.switchView('settings-view');
                app.switchSettingsSection('regional');
                app.renderSettingsPage();
                if (window.lucide) lucide.createIcons();
            })()
            """
        })
        time.sleep(1)
        capture_element(".settings-loan-card", "loan_settings_percentage_mode.png", padding=15)

        # Capture 3: Total Mode on Dashboard
        send("Runtime.evaluate", {
            "expression": """
            (() => {
                storage.state.loanConfig.percentMode = 'total';
                if (typeof storage._saveDataDirect === 'function') {
                    storage._saveDataDirect();
                }
                app.switchView('home-view');
                app.renderLoanTracker();
                if (window.lucide) lucide.createIcons();
            })()
            """
        })
        time.sleep(1)
        capture_element("#loan-tracker-widget", "loan_percentage_total_mode.png")

        ws.close()
    finally:
        proc.terminate()
        shutil.rmtree(user_data_dir, ignore_errors=True)

if __name__ == "__main__":
    run()
