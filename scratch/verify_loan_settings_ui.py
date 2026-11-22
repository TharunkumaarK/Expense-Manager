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
    user_data_dir = tempfile.mkdtemp(prefix="chrome_loan_settings_")
    port = 9555
    chrome_bin = "/opt/google/chrome/google-chrome" if os.path.exists("/opt/google/chrome/google-chrome") else "/usr/bin/google-chrome-stable"
    chrome_cmd = [
        chrome_bin,
        "--headless=new",
        f"--remote-debugging-port={port}",
        f"--user-data-dir={user_data_dir}",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1440,1100"
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

        # Initialize state with active loan & wallets in IN and JP
        init_js = """
        (() => {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';

            storage.state.preferences = storage.state.preferences || {};
            storage.state.preferences.onboardingCompleted = true;
            storage.state.preferences.activeCountries = ['JP', 'IN', 'DE'];
            storage.state.primaryOperatingCountry = 'JP';
            storage.state.wallets = {
                'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', currency: '¥', balance: 15000 },
                'HDFC Salary': { id: 'HDFC Salary', type: 'bank', region: 'IN', currency: '₹', balance: 95000 },
                'SBI Savings': { id: 'SBI Savings', type: 'bank', region: 'IN', currency: '₹', balance: 45000 }
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
                emiDrawDate: 7
            };
            if (typeof storage._saveDataDirect === 'function') {
                storage._saveDataDirect();
            }

            if (window.app) {
                app.switchView('settings-view');
                app.switchSettingsSection('regional');
                app.renderSettingsPage();
                if (window.lucide) lucide.createIcons();
            }

            const card = document.querySelector('.settings-loan-card');
            if (card && typeof card.scrollIntoView === 'function') {
                card.scrollIntoView({ block: 'center' });
            }
            const countrySelect = document.getElementById('setting-loan-country');
            const currencySelect = document.getElementById('setting-loan-currency');
            const walletSelect = document.getElementById('setting-loan-repayment-wallet');
            const rect = card.getBoundingClientRect();

            return {
                cardExists: !!card,
                countryValue: countrySelect ? countrySelect.value : null,
                currencyValue: currencySelect ? currencySelect.value : null,
                walletValue: walletSelect ? walletSelect.value : null,
                walletOptionsCount: walletSelect ? walletSelect.options.length : 0,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            };
        })()
        """
        res = send("Runtime.evaluate", {"expression": init_js, "returnByValue": True})
        state_in = res.get("result", {}).get("value", {})
        print("SETTINGS LOAN SETUP STATE (INDIA):")
        print(json.dumps(state_in, indent=2))

        assert state_in["cardExists"] is True, "Loan card must exist in Settings"
        assert state_in["countryValue"] == "IN", f"Expected country IN, got {state_in['countryValue']}"
        assert state_in["currencyValue"] == "₹", f"Expected currency ₹, got {state_in['currencyValue']}"
        assert state_in["walletValue"] == "HDFC Salary", f"Expected wallet HDFC Salary, got {state_in['walletValue']}"

        # Capture Screenshot 1: Settings Loan Card (India configuration)
        rect1 = state_in["rect"]
        clip1 = {
            "x": max(0, rect1["x"] - 15),
            "y": max(0, rect1["y"] - 15),
            "width": rect1["width"] + 30,
            "height": rect1["height"] + 30,
            "scale": 1
        }
        shot1 = send("Page.captureScreenshot", {"format": "png", "clip": clip1})
        bytes1 = base64.b64decode(shot1["data"])
        out1 = "scratch/loan_settings_configured.png"
        with open(out1, "wb") as f:
            f.write(bytes1)
        art1 = os.path.join(ARTIFACT_DIR, "loan_settings_configured.png")
        shutil.copyfile(out1, art1)
        print(f"Captured loan settings configured screenshot -> {out1} & {art1}")

        # Switch Country to Germany (DE) in Settings
        switch_js = """
        (async () => {
            await app.updateLoanPref('country', 'DE');
            app.switchSettingsSection('regional');
            app.renderSettingsPage();
            if (window.lucide) lucide.createIcons();

            const card = document.querySelector('.settings-loan-card');
            if (card && typeof card.scrollIntoView === 'function') {
                card.scrollIntoView({ block: 'center' });
            }
            const countrySelect = document.getElementById('setting-loan-country');
            const currencySelect = document.getElementById('setting-loan-currency');
            const walletSelect = document.getElementById('setting-loan-repayment-wallet');
            const rect = card.getBoundingClientRect();

            return {
                countryValue: countrySelect ? countrySelect.value : null,
                currencyValue: currencySelect ? currencySelect.value : null,
                walletSelectText: walletSelect ? walletSelect.selectedOptions[0]?.text : null,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            };
        })()
        """
        res_switch = send("Runtime.evaluate", {"expression": switch_js, "awaitPromise": True, "returnByValue": True})
        state_de = res_switch.get("result", {}).get("value", {})
        print("SETTINGS LOAN SETUP STATE (GERMANY SWITCH):")
        print(json.dumps(state_de, indent=2))

        assert state_de["countryValue"] == "DE", f"Expected country DE, got {state_de['countryValue']}"
        assert state_de["currencyValue"] == "€", f"Expected currency €, got {state_de['currencyValue']}"
        assert "No wallets configured in Germany" in state_de["walletSelectText"], "Must show 0 wallets message"

        # Capture Screenshot 2: Settings Loan Card after switching to Germany
        rect2 = state_de["rect"]
        clip2 = {
            "x": max(0, rect2["x"] - 15),
            "y": max(0, rect2["y"] - 15),
            "width": rect2["width"] + 30,
            "height": rect2["height"] + 30,
            "scale": 1
        }
        shot2 = send("Page.captureScreenshot", {"format": "png", "clip": clip2})
        bytes2 = base64.b64decode(shot2["data"])
        out2 = "scratch/loan_settings_region_switch.png"
        with open(out2, "wb") as f:
            f.write(bytes2)
        art2 = os.path.join(ARTIFACT_DIR, "loan_settings_region_switch.png")
        shutil.copyfile(out2, art2)
        print(f"Captured loan settings switch screenshot -> {out2} & {art2}")

        ws.close()
        proc.terminate()
        print("UI VERIFICATION COMPLETE: ALL ASSERTIONS PASSED!")

    except Exception as e:
        print("Error during CDP execution:", e)
        proc.terminate()
        raise e

if __name__ == "__main__":
    run()
