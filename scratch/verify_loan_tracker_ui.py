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
    user_data_dir = tempfile.mkdtemp(prefix="chrome_loan_test_")
    port = 9545
    chrome_bin = "/opt/google/chrome/google-chrome" if os.path.exists("/opt/google/chrome/google-chrome") else "/usr/bin/google-chrome-stable"
    chrome_cmd = [
        chrome_bin,
        "--headless=new",
        f"--remote-debugging-port={port}",
        f"--user-data-dir={user_data_dir}",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1440,1200"
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

        # Setup state with active loan & switch to dashboard
        init_js = """
        (() => {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
            
            storage.state.preferences = storage.state.preferences || {};
            storage.state.preferences.onboardingCompleted = true;
            storage.state.preferences.activeCountries = ['JP', 'IN'];
            storage.state.loanConfig = {
                enabled: true,
                country: 'IN',
                currency: '₹',
                totalPrincipal: 500000,
                principalLeft: 400000,
                totalDues: 24,
                duesPaid: 5,
                emi: 25000,
                emiDrawDate: 7
            };
            if (!storage.state.wallets || Object.keys(storage.state.wallets).length === 0) {
                storage.state.wallets = {
                    'HDFC Salary': { id: 'HDFC Salary', type: 'bank', region: 'IN', currency: '₹', balance: 95000 },
                    'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', currency: '¥', balance: 12000 }
                };
            }
            if (!storage.state.categories) {
                storage.state.categories = {
                    IN: { 'in-loan': { id: 'in-loan', name: 'Loan EMI', icon: 'landmark' } }
                };
            }
            if (typeof storage._saveDataDirect === 'function') {
                storage._saveDataDirect();
            }

            if (window.app) {
                app.switchView('home-view');
                app.renderTransactions();
                app.renderLoanTracker();
                if (window.lucide) {
                    lucide.createIcons();
                }
            }

            const loanWidget = document.getElementById('loan-tracker-widget');
            const recentWidget = document.getElementById('dashboard-recent-tx-card');
            const loanRect = loanWidget.getBoundingClientRect();
            const recentRect = recentWidget.getBoundingClientRect();

            return {
                loanDisplayed: window.getComputedStyle(loanWidget).display !== 'none',
                loanTop: loanRect.top,
                loanBottom: loanRect.bottom,
                recentTop: recentRect.top,
                isAbove: loanRect.bottom <= recentRect.top + 20, // loan widget is above recent activity
                hasLogEmiBtn: !!document.getElementById('log-emi-btn')
            };
        })()
        """
        res = send("Runtime.evaluate", {"expression": init_js, "returnByValue": True})
        print("RES RESULT:", json.dumps(res, indent=2))
        dash_state = res.get("result", {}).get("value", {})
        print("DASHBOARD LOAN TRACKER POSITIONING STATE:")
        print(json.dumps(dash_state, indent=2))

        assert dash_state["loanDisplayed"] is True, "Loan tracker widget must be displayed"
        assert dash_state["hasLogEmiBtn"] is True, "Log EMI button must exist in Loan Tracker card"
        assert dash_state["isAbove"] is True, "Loan tracker widget must be positioned above recent transactions"

        # Capture Screenshot 1: Dashboard with Loan Tracker above Recent Activity
        clip_rail_js = """
        (() => {
            const rail = document.querySelector('.dashboard-rail') || document.getElementById('loan-tracker-widget').parentElement;
            const r = rail.getBoundingClientRect();
            return { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 10), width: r.width + 40, height: Math.min(r.height + 40, 900) };
        })()
        """
        r_clip = send("Runtime.evaluate", {"expression": clip_rail_js, "returnByValue": True}).get("result", {}).get("value", {})
        screenshot_data = send("Page.captureScreenshot", {
            "format": "png",
            "clip": {
                "x": r_clip["x"],
                "y": r_clip["y"],
                "width": r_clip["width"],
                "height": r_clip["height"],
                "scale": 1
            }
        })
        img_bytes = base64.b64decode(screenshot_data["data"])
        out_dash = "scratch/loan_tracker_dashboard_rail.png"
        with open(out_dash, "wb") as f:
            f.write(img_bytes)
        art_dash = os.path.join(ARTIFACT_DIR, "loan_tracker_dashboard_rail.png")
        shutil.copyfile(out_dash, art_dash)
        print(f"Captured dashboard rail screenshot -> {out_dash} & {art_dash}")

        # Open Log EMI Modal
        open_modal_js = """
        (() => {
            app.openLogEmiModal();
            const modal = document.getElementById('log-emi-modal');
            const dateInput = document.getElementById('log-emi-date');
            const amountInput = document.getElementById('log-emi-amount');
            const walletSelect = document.getElementById('log-emi-wallet');
            const previewDues = document.getElementById('log-emi-preview-dues');
            const previewPrincipal = document.getElementById('log-emi-preview-principal');
            const card = modal.querySelector('.bottom-sheet');
            const rect = card.getBoundingClientRect();

            if (window.lucide) {
                lucide.createIcons();
            }

            return {
                isActive: modal.classList.contains('active'),
                dateValue: dateInput.value,
                amountValue: amountInput.value,
                walletCount: walletSelect.options.length,
                previewDuesText: previewDues.textContent,
                previewPrincipalText: previewPrincipal.textContent,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            };
        })()
        """
        res_modal = send("Runtime.evaluate", {"expression": open_modal_js, "returnByValue": True})
        print("RES MODAL:", json.dumps(res_modal, indent=2))
        modal_state = res_modal.get("result", {}).get("value", {})
        print("LOG EMI MODAL STATE:")
        print(json.dumps(modal_state, indent=2))

        assert modal_state["isActive"] is True, "Log EMI modal should be active"
        assert modal_state["amountValue"] == "25000", f"Expected amount 25000, got {modal_state['amountValue']}"
        assert modal_state["walletCount"] >= 1, "Should have matching wallets"

        # Capture Screenshot 2: Log EMI Modal
        m_rect = modal_state["rect"]
        modal_clip = {
            "x": max(0, m_rect["x"] - 20),
            "y": max(0, m_rect["y"] - 20),
            "width": m_rect["width"] + 40,
            "height": m_rect["height"] + 40,
            "scale": 1
        }
        modal_shot = send("Page.captureScreenshot", {
            "format": "png",
            "clip": modal_clip
        })
        m_bytes = base64.b64decode(modal_shot["data"])
        out_modal = "scratch/log_emi_payment_modal.png"
        with open(out_modal, "wb") as f:
            f.write(m_bytes)
        art_modal = os.path.join(ARTIFACT_DIR, "log_emi_payment_modal.png")
        shutil.copyfile(out_modal, art_modal)
        print(f"Captured Log EMI modal screenshot -> {out_modal} & {art_modal}")

        ws.close()
        proc.terminate()
        print("UI VERIFICATION COMPLETE: ALL ASSERTIONS PASSED!")

    except Exception as e:
        print("Error during CDP execution:", e)
        proc.terminate()
        raise e

if __name__ == "__main__":
    run()
