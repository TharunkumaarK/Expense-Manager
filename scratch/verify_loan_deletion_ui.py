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
    user_data_dir = tempfile.mkdtemp(prefix="chrome_loan_del_")
    port = 9565
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

        # 1. Initialize State with Active Loan
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
                emiDrawDate: 7
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

            const widget = document.getElementById('loan-tracker-widget');
            const tenureSummary = widget ? widget.querySelector('.loan-tenure-summary') : null;
            const rect = widget ? widget.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };

            return {
                widgetDisplayed: !!widget && window.getComputedStyle(widget).display !== 'none',
                tenureText: tenureSummary ? tenureSummary.innerText.replace(/\\s+/g, ' ') : null,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            };
        })()
        """
        res_init = send("Runtime.evaluate", {"expression": init_js, "returnByValue": True})
        state_init = res_init.get("result", {}).get("value", {})
        print("INITIAL LOAN TRACKER STATE:")
        print(json.dumps(state_init, indent=2))

        assert state_init["widgetDisplayed"] is True, "Loan widget must be displayed"
        assert "5 out of 24 months paid" in state_init["tenureText"], f"Expected '5 out of 24 months paid', got {state_init['tenureText']}"
        assert "19 months left" in state_init["tenureText"], f"Expected '19 months left', got {state_init['tenureText']}"

        # Capture Screenshot 1: Loan Tracker with Tenure Summary
        rect1 = state_init["rect"]
        clip1 = {
            "x": max(0, rect1["x"] - 10),
            "y": max(0, rect1["y"] - 10),
            "width": rect1["width"] + 20,
            "height": rect1["height"] + 20,
            "scale": 1
        }
        shot1 = send("Page.captureScreenshot", {"format": "png", "clip": clip1})
        bytes1 = base64.b64decode(shot1["data"])
        out1 = "scratch/loan_tracker_tenure_display.png"
        with open(out1, "wb") as f:
            f.write(bytes1)
        art1 = os.path.join(ARTIFACT_DIR, "loan_tracker_tenure_display.png")
        shutil.copyfile(out1, art1)
        print(f"Captured initial tenure display screenshot -> {out1} & {art1}")

        # 2. Log Payment #6
        log_js = """
        (async () => {
            app.openLogEmiModal();
            document.getElementById('log-emi-amount').value = '25000';
            document.getElementById('log-emi-wallet').value = 'HDFC Salary';
            
            // Bypass window.alert during automated test
            window.alert = () => {};
            await app.saveLogEmiPayment();

            const widget = document.getElementById('loan-tracker-widget');
            const tenureSummary = widget ? widget.querySelector('.loan-tenure-summary') : null;
            const rect = widget ? widget.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };

            return {
                duesPaid: storage.state.loanConfig.duesPaid,
                principalLeft: storage.state.loanConfig.principalLeft,
                walletBalance: storage.state.wallets['HDFC Salary'].balance,
                tenureText: tenureSummary ? tenureSummary.innerText.replace(/\\s+/g, ' ') : null,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            };
        })()
        """
        res_log = send("Runtime.evaluate", {"expression": log_js, "awaitPromise": True, "returnByValue": True})
        state_log = res_log.get("result", {}).get("value", {})
        print("AFTER LOG EMI STATE:")
        print(json.dumps(state_log, indent=2))

        assert state_log["duesPaid"] == 6, f"Expected duesPaid 6, got {state_log['duesPaid']}"
        assert state_log["principalLeft"] == 375000, f"Expected principalLeft 375k, got {state_log['principalLeft']}"
        assert state_log["walletBalance"] == 70000, f"Expected balance 70k, got {state_log['walletBalance']}"
        assert "6 out of 24 months paid" in state_log["tenureText"], f"Expected '6 out of 24 months paid', got {state_log['tenureText']}"
        assert "18 months left" in state_log["tenureText"], f"Expected '18 months left', got {state_log['tenureText']}"

        # Capture Screenshot 2: Loan Tracker after Payment #6
        rect2 = state_log["rect"]
        clip2 = {
            "x": max(0, rect2["x"] - 10),
            "y": max(0, rect2["y"] - 10),
            "width": rect2["width"] + 20,
            "height": rect2["height"] + 20,
            "scale": 1
        }
        shot2 = send("Page.captureScreenshot", {"format": "png", "clip": clip2})
        bytes2 = base64.b64decode(shot2["data"])
        out2 = "scratch/loan_tracker_after_log_emi.png"
        with open(out2, "wb") as f:
            f.write(bytes2)
        art2 = os.path.join(ARTIFACT_DIR, "loan_tracker_after_log_emi.png")
        shutil.copyfile(out2, art2)
        print(f"Captured logged EMI card screenshot -> {out2} & {art2}")

        # 3. Delete Payment #6 and verify full rollback
        del_js = """
        (async () => {
            window.confirm = () => true;
            window.alert = () => {};
            const txId = storage.state.transactions[0].id;
            await app.deleteTx(txId);

            const widget = document.getElementById('loan-tracker-widget');
            const tenureSummary = widget ? widget.querySelector('.loan-tenure-summary') : null;

            return {
                duesPaid: storage.state.loanConfig.duesPaid,
                principalLeft: storage.state.loanConfig.principalLeft,
                walletBalance: storage.state.wallets['HDFC Salary'].balance,
                txCount: storage.state.transactions.length,
                tenureText: tenureSummary ? tenureSummary.innerText.replace(/\\s+/g, ' ') : null
            };
        })()
        """
        res_del = send("Runtime.evaluate", {"expression": del_js, "awaitPromise": True, "returnByValue": True})
        state_del = res_del.get("result", {}).get("value", {})
        print("AFTER DELETE EMI STATE:")
        print(json.dumps(state_del, indent=2))

        assert state_del["duesPaid"] == 5, f"Expected duesPaid 5, got {state_del['duesPaid']}"
        assert state_del["principalLeft"] == 400000, f"Expected principalLeft 400k, got {state_del['principalLeft']}"
        assert state_del["walletBalance"] == 95000, f"Expected balance restored to 95k, got {state_del['walletBalance']}"
        assert state_del["txCount"] == 0, f"Expected 0 transactions, got {state_del['txCount']}"
        assert "5 out of 24 months paid" in state_del["tenureText"], f"Expected '5 out of 24 months paid', got {state_del['tenureText']}"
        assert "19 months left" in state_del["tenureText"], f"Expected '19 months left', got {state_del['tenureText']}"

        ws.close()
        proc.terminate()
        print("UI VERIFICATION COMPLETE: ALL ASSERTIONS PASSED!")

    except Exception as e:
        print("Error during CDP execution:", e)
        proc.terminate()
        raise e

if __name__ == "__main__":
    run()

