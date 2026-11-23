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
PORT = 9465

def capture_all():
    cmd = [
        '/usr/bin/google-chrome',
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        '--window-size=390,844',
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=/tmp/c_cap_' + str(int(time.time()))
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

        # Setup standard state
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
            })()
        """)
        time.sleep(0.5)

        # 1. Dashboard (390px)
        set_vp(390, 844)
        eval_js("app.switchView('home-view')")
        time.sleep(0.3)
        snap("refined_dashboard_mobile_390.png")

        # 2. Transactions (390px)
        eval_js("app.switchView('transactions-view')")
        time.sleep(0.3)
        snap("refined_transactions_mobile_390.png")

        # 3. Analytics (390px)
        eval_js("app.switchView('analytics-view')")
        time.sleep(0.3)
        snap("refined_analytics_mobile_390.png")

        # 4. Budgets (390px)
        eval_js("app.switchView('budgets-view')")
        time.sleep(0.3)
        snap("refined_budgets_mobile_390.png")

        # 5. Wallets (390px)
        eval_js("app.switchView('wallets-view')")
        time.sleep(0.3)
        snap("refined_wallets_mobile_390.png")

        # 6. Settings (390px)
        eval_js("app.switchView('settings-view')")
        time.sleep(0.3)
        snap("refined_settings_mobile_390.png")

        # 7. Color Picker Modal at 320px
        set_vp(320, 568)
        eval_js("app.openColorPicker(null)")
        time.sleep(0.3)
        snap("refined_color_picker_mobile_320.png")
        eval_js("app.closeModal('color-picker-modal')")

        # 8. Dashboard on Tablet (768px)
        set_vp(768, 1024)
        eval_js("app.switchView('home-view')")
        time.sleep(0.3)
        snap("refined_dashboard_tablet_768.png")

    finally:
        try:
            ws.close()
        except:
            pass
        proc.terminate()
        proc.wait(timeout=2)

if __name__ == '__main__':
    capture_all()
