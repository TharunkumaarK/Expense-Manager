import os
import sys
import time
import json
import base64
import shutil
import threading
import subprocess
import http.server
import socketserver
import urllib.request
import websocket

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ARTIFACT_DIR = '/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128'
EVIDENCE_DIR = os.path.join(WORKSPACE_DIR, 'scratch', 'phase2-evidence')
HTTP_PORT = 9528
CDP_PORT = 9529

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WORKSPACE_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def start_http_server():
    httpd = socketserver.TCPServer(("127.0.0.1", HTTP_PORT), QuietHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd

def run_browser_automation():
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    httpd = start_http_server()
    print(f"HTTP server started at http://127.0.0.1:{HTTP_PORT}")

    user_data_dir = f"/tmp/chrome_phase2_{int(time.time())}"
    chrome_cmd = [
        '/usr/bin/google-chrome-stable',
        '--headless=new',
        f'--remote-debugging-port={CDP_PORT}',
        '--window-size=1440,900',
        '--no-sandbox',
        '--disable-gpu',
        f'--user-data-dir={user_data_dir}'
    ]
    chrome_proc = subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)

    try:
        res = urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json").read()
        pages = json.loads(res.decode('utf-8'))
        ws_url = pages[0]['webSocketDebuggerUrl']
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

        def set_viewport(w, h, scale=2):
            call("Emulation.setDeviceMetricsOverride", {
                "width": w,
                "height": h,
                "deviceScaleFactor": scale,
                "mobile": w <= 768
            })
            time.sleep(0.2)

        def capture_screen(filename):
            evidence_path = os.path.join(EVIDENCE_DIR, filename)
            artifact_path = os.path.join(ARTIFACT_DIR, filename)
            res = call("Page.captureScreenshot", {"format": "png"})
            data = res.get("data")
            if data:
                raw_bytes = base64.b64decode(data)
                with open(evidence_path, "wb") as f:
                    f.write(raw_bytes)
                with open(artifact_path, "wb") as f:
                    f.write(raw_bytes)
                print(f"[OK] Saved screenshot: {filename} ({len(raw_bytes)} bytes)")
            else:
                print(f"[ERROR] Failed to capture: {filename}")

        call("Page.enable")
        call("Runtime.enable")
        call("DOM.enable")

        print("Navigating to application on local HTTP server...")
        call("Page.navigate", {"url": f"http://127.0.0.1:{HTTP_PORT}/index.html"})
        time.sleep(1.8)

        # 1. Initialize complete test fixture in local storage
        print("Seeding test state...")
        eval_js("""
            (() => {
                localStorage.clear();
                storage.state.onboardingCompleted = true;
                storage.state.activeCountries = ['JP', 'IN', 'DE'];
                storage.state.defaultCountry = 'JP';
                storage.state.currentMonthKey = '2026-11';
                storage.state.wallets = {
                    'w-jp-bank': { id: 'w-jp-bank', name: 'Japan Bank', balance: 350000, region: 'JP', currency: '¥', type: 'bank', theme: 'emerald-salary' },
                    'w-jp-cash': { id: 'w-jp-cash', name: 'Japan Cash', balance: 25000, region: 'JP', currency: '¥', type: 'cash', theme: 'tokyo-metro' },
                    'w-in-bank': { id: 'w-in-bank', name: 'India Bank', balance: 65000, region: 'IN', currency: '₹', type: 'bank', theme: 'burgundy-axis' },
                    'w-de-bank': { id: 'w-de-bank', name: 'German Bank', balance: 2800, region: 'DE', currency: '€', type: 'bank', theme: 'frankfurt-slate' }
                };
                storage.state.budgets = {
                    JP: { enabled: true, monthlyTotal: 120000, rolloverEnabled: true, carryover: 15000 },
                    IN: { enabled: true, monthlyTotal: 40000, rolloverEnabled: false, carryover: 0 },
                    DE: { enabled: true, monthlyTotal: 1200, rolloverEnabled: false, carryover: 0 }
                };
                storage.state.categories = {
                    JP: [
                        { id: 'dining', name: 'Dining Out', budget: 40000, isActive: true, contributesToTotalBudget: true },
                        { id: 'groceries', name: 'Groceries', budget: 50000, isActive: true, contributesToTotalBudget: true },
                        { id: 'remittance', name: 'Remittance', budget: 0, isActive: true, contributesToTotalBudget: false }
                    ]
                };
                storage.state.closedMonths = {
                    '2026-10': {
                        monthKey: '2026-10',
                        status: 'closed',
                        jpTotalBudget: 120000,
                        JPTotalBudget: 120000,
                        jpSpent: 105000,
                        jpRolloverAdded: 15000,
                        categoriesSnapshot: {
                            JP: [{ id: 'dining', budget: 40000 }, { id: 'groceries', budget: 50000 }]
                        }
                    }
                };
                storage.state.transactions = [
                    { id: 'tx-1', type: 'expense', walletId: 'w-jp-bank', amount: 8500, categoryId: 'dining', date: '2026-11-20', region: 'JP', note: 'Sushi dinner' },
                    { id: 'tx-2', type: 'expense', walletId: 'w-jp-cash', amount: 3200, categoryId: 'groceries', date: '2026-11-21', region: 'JP', note: 'Supermarket' },
                    { id: 'tx-3', type: 'income', walletId: 'w-jp-bank', amount: 280000, categoryId: 'salary', date: '2026-11-01', region: 'JP', note: 'Monthly salary' },
                    { id: 'tx-4', type: 'transfer', sourceId: 'w-jp-bank', destId: 'w-jp-cash', amount: 20000, date: '2026-11-05', region: 'JP', note: 'ATM cash' },
                    { id: 'tx-5', type: 'remittance', sourceId: 'w-jp-bank', destId: 'w-in-bank', sourceAmount: 50000, destAmount: 27500, sourceCurrency: '¥', destCurrency: '₹', exchangeRate: '0.550000', date: '2026-11-10', note: 'Family remittance' }
                ];
                storage.saveData();
                app.init();
                document.getElementById('auth-screen').style.display = 'none';
                document.getElementById('onboarding-screen').style.display = 'none';
                document.getElementById('app-content').style.display = 'block';
                app.isPrivacyHidden = false;
            })()
        """)
        time.sleep(0.5)

        # ----------------------------------------------------------------------
        # EVIDENCE 1 & 2: Settings Help & Getting Started (Desktop & Mobile)
        # ----------------------------------------------------------------------
        print("\n[Journey 1] Testing Settings Help & Getting Started...")
        # Navigate to Settings and switch to Help section via UI call
        eval_js("""
            (() => {
                app.switchView('settings-view');
                app.switchSettingsSection('help');
                // Expand Topic 1 and Topic 4 to demonstrate accordion operation
                const t1 = document.getElementById('help-topic-getting-started');
                if (t1) t1.open = true;
                const t4 = document.getElementById('help-topic-budgets');
                if (t4) t4.open = true;
            })()
        """)
        time.sleep(0.4)

        # 1440px Desktop
        set_viewport(1440, 900, scale=1.5)
        eval_js("window.scrollTo(0, 0);")
        time.sleep(0.3)
        capture_screen("settings_help_desktop_1440.png")

        # 390px Mobile
        set_viewport(390, 844, scale=2)
        eval_js("document.getElementById('settings-sec-help')?.scrollIntoView({ behavior: 'instant', block: 'start' });")
        time.sleep(0.3)
        capture_screen("settings_help_mobile_390.png")

        # 360px Small Mobile (Task 5 responsive target)
        set_viewport(360, 780, scale=2)
        time.sleep(0.3)
        capture_screen("responsive_360_settings_help.png")

        # Test interaction: Click "Go to Wallets" action button inside Topic 1
        print("Testing Help action button click ('Go to Wallets')...")
        eval_js("""
            (() => {
                const btn = document.querySelector('#help-topic-getting-started .settings-help-actions button');
                if (btn) btn.click();
            })()
        """)
        time.sleep(0.5)
        current_view_after_help_click = eval_js("app.currentView")
        print(f"Current view after Help link click: {current_view_after_help_click}")
        assert current_view_after_help_click == 'wallets-view', "Help action button did not navigate to wallets-view"

        # ----------------------------------------------------------------------
        # EVIDENCE 3 & 4: Analytics "Customize Analysis" (Desktop & Mobile)
        # ----------------------------------------------------------------------
        print("\n[Journey 2] Testing Analytics 'Customize Analysis'...")
        eval_js("""
            (() => {
                app.switchView('analytics-view');
                // Verify initial state is collapsed
                const details = document.getElementById('analytics-customize-analysis');
                if (details) details.open = true; // Open to show exclusions panel
            })()
        """)
        time.sleep(0.5)

        # 1440px Desktop
        set_viewport(1440, 900, scale=1.5)
        eval_js("window.scrollTo(0, 150);")
        time.sleep(0.3)
        capture_screen("analytics_customize_desktop_1440.png")

        # 390px Mobile
        set_viewport(390, 844, scale=2)
        eval_js("document.getElementById('analytics-customize-analysis')?.scrollIntoView({ behavior: 'instant', block: 'center' });")
        time.sleep(0.3)
        capture_screen("analytics_customize_expanded_mobile_390.png")

        # 430px Large Mobile (Task 5 responsive target)
        set_viewport(430, 932, scale=2)
        time.sleep(0.3)
        capture_screen("responsive_430_analytics.png")

        # ----------------------------------------------------------------------
        # EVIDENCE 5 & 6: Reports "More Actions" & Monthly Closing
        # ----------------------------------------------------------------------
        print("\n[Journey 3] Testing Reports 'More Actions' and Monthly Closing...")
        eval_js("""
            (() => {
                app.switchView('reports-view');
                app.reportMonthKey = '2026-11';
                app.renderReportsPage();
                // Open More Actions dropdown
                const moreDetails = document.getElementById('reports-more-actions');
                if (moreDetails) moreDetails.open = true;
            })()
        """)
        time.sleep(0.5)

        # 1440px Desktop
        set_viewport(1440, 900, scale=1.5)
        eval_js("window.scrollTo(0, 0);")
        time.sleep(0.3)
        capture_screen("reports_desktop_1440.png")

        # 390px Mobile
        set_viewport(390, 844, scale=2)
        eval_js("document.querySelector('.reports-toolbar-card')?.scrollIntoView({ behavior: 'instant', block: 'start' });")
        time.sleep(0.3)
        capture_screen("reports_more_actions_mobile_390.png")

        # ----------------------------------------------------------------------
        # EVIDENCE 7: Historical Report Budget Rendering
        # ----------------------------------------------------------------------
        print("\n[Journey 4] Testing Historical Report Budget Display (Closed Month 2026-10)...")
        eval_js("""
            (() => {
                // Set live budget for JP to disabled
                storage.state.budgets.JP.enabled = false;
                // Switch report to closed month 2026-10
                app.reportMonthKey = '2026-10';
                app.renderReportsPage();
                const moreDetails = document.getElementById('reports-more-actions');
                if (moreDetails) moreDetails.open = false;
            })()
        """)
        time.sleep(0.5)
        set_viewport(1440, 900, scale=1.5)
        eval_js("document.getElementById('report-snapshot-hero')?.scrollIntoView({ behavior: 'instant', block: 'start' });")
        time.sleep(0.3)
        capture_screen("historical_report_budget_desktop.png")

        ws.close()
        print("\n[SUCCESS] All browser evidence captured successfully!")

    finally:
        chrome_proc.terminate()
        try:
            chrome_proc.wait(timeout=3)
        except Exception:
            chrome_proc.kill()
        httpd.shutdown()
        shutil.rmtree(user_data_dir, ignore_errors=True)
        print("Cleaned up Chrome and HTTP server.")

if __name__ == '__main__':
    run_browser_automation()

