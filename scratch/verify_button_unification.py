import json
import os
import subprocess
import time
import urllib.request

def run():
    chrome_cmd = [
        ("/opt/google/chrome/google-chrome" if os.path.exists("/opt/google/chrome/google-chrome") else "/usr/bin/google-chrome-stable"),
        "--headless=new",
        "--remote-debugging-port=9222",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1280,900"
    ]
    proc = subprocess.Popen(chrome_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    time.sleep(1.5)

    try:
        # Get websocket URL
        tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read())
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

        # Navigate to file
        file_path = os.path.abspath("index.html")
        send("Page.enable")
        send("DOM.enable")
        send("CSS.enable")
        send("Page.navigate", {"url": f"file://{file_path}"})
        time.sleep(2)

        # Inspect computed border-radius of buttons
        eval_js = """
        (() => {
            const results = {};
            
            // Helper to get computed border-radius
            const getBr = (selector, fallbackEl) => {
                let el = document.querySelector(selector);
                if (!el && fallbackEl) {
                    el = fallbackEl;
                }
                if (!el) return 'NOT_FOUND';
                return window.getComputedStyle(el).borderRadius;
            };

            // Test standard buttons
            results['.btn-primary'] = getBr('.btn-primary');
            results['.btn-secondary'] = getBr('.btn-secondary');
            results['.header-action-btn'] = getBr('.header-action-btn');
            results['.desktop-privacy-btn'] = getBr('.desktop-privacy-btn');
            results['.auth-submit-btn'] = getBr('.auth-submit-btn');
            results['.wallets-toolbar-actions .btn'] = getBr('.wallets-toolbar-actions .btn');
            results['.filter-trigger-btn'] = getBr('.filter-trigger-btn');
            results['.onboarding-btn-next'] = getBr('.onboarding-btn-next');
            results['.onboarding-btn-back'] = getBr('.onboarding-btn-back');
            results['.onboarding-btn-add-wallet'] = getBr('.onboarding-btn-add-wallet');
            results['.onboarding-modal-cancel-btn'] = getBr('.onboarding-modal-cancel-btn');
            results['.onboarding-modal-submit-btn'] = getBr('.onboarding-modal-submit-btn');
            
            // Also create temporary dummy elements to check styles in isolation if not rendered
            const testClasses = [
                'btn btn-primary',
                'btn btn-secondary',
                'btn btn-danger',
                'btn btn-danger-ghost',
                'btn btn-sm',
                'btn btn-tx-submit',
                'auth-submit-btn',
                'header-action-btn',
                'desktop-privacy-btn',
                'filter-trigger-btn',
                'onboarding-btn-next',
                'onboarding-btn-back',
                'onboarding-btn-add-wallet',
                'onboarding-modal-cancel-btn',
                'onboarding-modal-submit-btn',
                'onboarding-wallet-delete-btn'
            ];
            
            const isolated = {};
            const testContainer = document.createElement('div');
            testContainer.style.position = 'absolute';
            testContainer.style.left = '-9999px';
            document.body.appendChild(testContainer);
            
            for (const cls of testClasses) {
                const btn = document.createElement('button');
                btn.className = cls;
                testContainer.appendChild(btn);
                isolated[cls] = window.getComputedStyle(btn).borderRadius;
            }
            document.body.removeChild(testContainer);
            
            return { rendered: results, isolated };
        })()
        """
        
        eval_res = send("Runtime.evaluate", {"expression": eval_js, "returnByValue": True})
        value = eval_res.get("result", {}).get("value", {})
        
        print("=== Rendered Button Computed border-radius ===")
        for k, v in value.get("rendered", {}).items():
            print(f"  {k:<32}: {v}")
            
        print("\n=== Isolated Class Computed border-radius ===")
        all_8px = True
        for k, v in value.get("isolated", {}).items():
            print(f"  {k:<32}: {v}")
            if v != "8px":
                all_8px = False
                
        print(f"\nAll action buttons compute to 8px (--radius-button): {all_8px}")
        
        # Now let's open the Add Transaction modal and capture a screenshot of the modal footer
        # showing Cancel and Save side-by-side!
        open_modal_js = """
        (() => {
            const auth = document.getElementById('auth-screen');
            if (auth) auth.style.display = 'none';
            const onboarding = document.getElementById('onboarding-screen');
            if (onboarding) onboarding.style.display = 'none';
            const app = document.getElementById('app-content');
            if (app) app.style.display = 'block';
            
            // Open transaction modal
            if (window.app && window.app.openTxModal) {
                window.app.openTxModal('expense');
            } else {
                const modal = document.getElementById('tx-modal');
                if (modal) modal.classList.add('active');
            }
        })()
        """
        send("Runtime.evaluate", {"expression": open_modal_js})
        time.sleep(1)
        
        # Capture screenshot of transaction modal footer
        screenshot = send("Page.captureScreenshot", {"format": "png"})
        import base64
        with open("/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/button_unification_tx_modal_1280.png", "wb") as f:
            f.write(base64.b64decode(screenshot["data"]))
        print("\nScreenshot saved to button_unification_tx_modal_1280.png")
        
        # Switch to mobile viewport (390px) and capture mobile view
        send("Emulation.setDeviceMetricsOverride", {
            "width": 390,
            "height": 844,
            "deviceScaleFactor": 2,
            "mobile": True
        })
        time.sleep(1)
        
        screenshot_mobile = send("Page.captureScreenshot", {"format": "png"})
        with open("/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/button_unification_mobile_modal_390.png", "wb") as f:
            f.write(base64.b64decode(screenshot_mobile["data"]))
        print("Screenshot saved to button_unification_mobile_modal_390.png")

        ws.close()
    finally:
        proc.terminate()
        proc.wait()

if __name__ == "__main__":
    run()
