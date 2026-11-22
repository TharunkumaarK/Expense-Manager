#!/usr/bin/env python3
"""
App-Wide Screenshot Capture Script
Captures visual evidence for all stabilized views, modals, and edge-case viewports.
"""

import os
import sys
import time
import json
import base64
import subprocess
import urllib.request
import websocket

HTML_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
CHROME_BIN = '/opt/google/chrome/google-chrome' if os.path.exists('/opt/google/chrome/google-chrome') else '/usr/bin/google-chrome-stable'
PORT = 9499
BASE_URL = f"file://{HTML_PATH}"
ARTIFACT_DIR = "/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128"
SCRATCH_DIR = os.path.abspath(os.path.dirname(__file__))

def capture():
    cmd = [
        CHROME_BIN,
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        '--window-size=390,844',
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=/tmp/chrome_ss_' + str(int(time.time()))
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)

    try:
        res = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read()
        tabs = json.loads(res.decode('utf-8'))
        ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'])

        msg_id = 0
        def call(method, params=None):
            nonlocal msg_id
            msg_id += 1
            msg = {"id": msg_id, "method": method, "params": params or {}}
            ws.send(json.dumps(msg))
            while True:
                resp = json.loads(ws.recv())
                if resp.get("id") == msg_id:
                    return resp.get("result", {})

        def eval_js(expr):
            r = call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
            if "exceptionDetails" in r:
                raise RuntimeError(r["exceptionDetails"])
            return r.get("result", {}).get("value")

        def set_vp(w, h):
            call("Emulation.setDeviceMetricsOverride", {
                "width": w,
                "height": h,
                "deviceScaleFactor": 2,
                "mobile": w <= 768
            })
            time.sleep(0.15)

        def take_screenshot(name):
            data = call("Page.captureScreenshot", {"format": "png"})
            img_bytes = base64.b64decode(data["data"])
            p1 = os.path.join(ARTIFACT_DIR, f"{name}.png")
            p2 = os.path.join(SCRATCH_DIR, f"{name}.png")
            with open(p1, "wb") as f:
                f.write(img_bytes)
            with open(p2, "wb") as f:
                f.write(img_bytes)
            print(f"Captured: {name}.png ({len(img_bytes)} bytes)")

        call("Page.enable")
        call("Page.navigate", {"url": BASE_URL})
        time.sleep(1.5)

        # Login and bypass onboarding into main app
        eval_js("""
            (() => {
                localStorage.clear();
                storage.resetState && storage.resetState();
                storage.state.onboardingCompleted = true;
                storage.saveData();
                app.init();
                document.getElementById('auth-screen').style.display = 'none';
                document.getElementById('onboarding-screen').style.display = 'none';
                document.getElementById('app-content').style.display = 'block';
                app.switchView('home-view');
            })()
        """)
        time.sleep(0.5)

        views = [
            ('home-view', 'app_dashboard_390'),
            ('transactions-view', 'app_transactions_390'),
            ('analytics-view', 'app_analytics_390'),
            ('reports-view', 'app_reports_390'),
            ('budgets-view', 'app_budgets_390'),
            ('wallets-view', 'app_wallets_390'),
            ('settings-view', 'app_settings_390')
        ]

        set_vp(390, 844)
        for v_id, name in views:
            eval_js(f"app.switchView('{v_id}')")
            time.sleep(0.2)
            take_screenshot(name)

        # Modals
        eval_js("""
            (() => {
                const w = storage.state.wallets[0];
                if (w && app.openEditWalletModal) {
                    app.openEditWalletModal(w.id);
                } else {
                    document.getElementById('edit-wallet-modal').classList.add('active');
                }
            })()
        """)
        time.sleep(0.2)
        take_screenshot("app_modal_edit_wallet_390")
        eval_js("document.getElementById('edit-wallet-modal').classList.remove('active')")
        time.sleep(0.1)

        eval_js("""
            (() => {
                if (app.openAddWalletModal) {
                    app.openAddWalletModal();
                } else {
                    document.getElementById('add-wallet-modal').classList.add('active');
                }
            })()
        """)
        time.sleep(0.2)
        take_screenshot("app_modal_add_wallet_390")
        eval_js("document.getElementById('add-wallet-modal').classList.remove('active')")
        time.sleep(0.1)

        eval_js("""
            (() => {
                if (app.openUnifiedTransactionSelector) {
                    app.openUnifiedTransactionSelector();
                } else {
                    document.getElementById('tx-action-selector-modal').classList.add('active');
                }
            })()
        """)
        time.sleep(0.2)
        take_screenshot("app_modal_tx_selector_390")
        eval_js("document.getElementById('tx-action-selector-modal').classList.remove('active')")
        time.sleep(0.1)

        # Edge-case viewports
        # 1024px desktop transactions toolbar
        set_vp(1024, 768)
        eval_js("app.switchView('transactions-view')")
        time.sleep(0.2)
        take_screenshot("app_transactions_1024")

        # 320px ultra-compact mobile analytics & reports
        set_vp(320, 600)
        eval_js("app.switchView('analytics-view')")
        time.sleep(0.2)
        take_screenshot("app_analytics_320")

        eval_js("app.switchView('reports-view')")
        time.sleep(0.2)
        take_screenshot("app_reports_320")

    finally:
        try:
            ws.close()
        except:
            pass
        proc.terminate()
        proc.wait(timeout=2)

if __name__ == '__main__':
    capture()
