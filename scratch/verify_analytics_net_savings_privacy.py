import json
import os
import subprocess
import time
import urllib.request
import base64
import tempfile

def run():
    user_data_dir = tempfile.mkdtemp(prefix="chrome_privacy_test_")
    port = 9528
    chrome_bin = "/opt/google/chrome/google-chrome" if os.path.exists("/opt/google/chrome/google-chrome") else "/usr/bin/google-chrome-stable"
    chrome_cmd = [
        chrome_bin,
        "--headless=new",
        f"--remote-debugging-port={port}",
        f"--user-data-dir={user_data_dir}",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1280,900"
    ]
    proc = subprocess.Popen(chrome_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    tabs = None
    for _ in range(10):
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

        # Bypass auth, navigate to analytics-view, and inspect initial state
        init_js = """
        (() => {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
            if (window.app) {
                // Ensure default concealed state
                app.setPrivacyHidden(true);
                app.switchView('analytics-view');
            }
            
            const kpiSavings = document.getElementById('jp-kpi-savings');
            const card = kpiSavings ? kpiSavings.closest('.analytics-kpi-card') : null;
            const rect = card ? card.getBoundingClientRect() : (kpiSavings ? kpiSavings.getBoundingClientRect() : null);
            
            return {
                innerText: kpiSavings ? kpiSavings.innerText : null,
                className: kpiSavings ? kpiSavings.className : null,
                isPrivacyHidden: app ? app.isPrivacyHidden : null,
                rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
            };
        })()
        """
        res = send("Runtime.evaluate", {"expression": init_js, "returnByValue": True})
        initial_state = res.get("result", {}).get("value", {})
        print("INITIAL CONCEALED STATE:")
        print(json.dumps(initial_state, indent=2))

        rect = initial_state.get("rect")
        clip_params = {
            "x": max(0, rect["x"] - 8),
            "y": max(0, rect["y"] - 8),
            "width": rect["width"] + 16,
            "height": rect["height"] + 16,
            "scale": 2
        } if rect else None

        # Capture concealed screenshot
        if clip_params:
            scr_concealed = send("Page.captureScreenshot", {"clip": clip_params, "format": "png"})
            if "data" in scr_concealed:
                with open("scratch/analytics_net_savings_concealed.png", "wb") as f:
                    f.write(base64.b64decode(scr_concealed["data"]))
                with open("/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/analytics_net_savings_concealed.png", "wb") as f:
                    f.write(base64.b64decode(scr_concealed["data"]))
                print("Saved concealed screenshot.")

        # Toggle privacy mode (Reveal)
        reveal_js = """
        (() => {
            if (window.app) {
                app.togglePrivacy();
            }
            const kpiSavings = document.getElementById('jp-kpi-savings');
            return {
                innerText: kpiSavings ? kpiSavings.innerText : null,
                className: kpiSavings ? kpiSavings.className : null,
                isPrivacyHidden: app ? app.isPrivacyHidden : null
            };
        })()
        """
        res_reveal = send("Runtime.evaluate", {"expression": reveal_js, "returnByValue": True})
        revealed_state = res_reveal.get("result", {}).get("value", {})
        print("REVEALED STATE:")
        print(json.dumps(revealed_state, indent=2))

        # Capture revealed screenshot
        if clip_params:
            scr_revealed = send("Page.captureScreenshot", {"clip": clip_params, "format": "png"})
            if "data" in scr_revealed:
                with open("scratch/analytics_net_savings_revealed.png", "wb") as f:
                    f.write(base64.b64decode(scr_revealed["data"]))
                with open("/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/analytics_net_savings_revealed.png", "wb") as f:
                    f.write(base64.b64decode(scr_revealed["data"]))
                print("Saved revealed screenshot.")

        # Toggle privacy mode back (Re-conceal)
        reconceal_js = """
        (() => {
            if (window.app) {
                app.togglePrivacy();
            }
            const kpiSavings = document.getElementById('jp-kpi-savings');
            return {
                innerText: kpiSavings ? kpiSavings.innerText : null,
                className: kpiSavings ? kpiSavings.className : null,
                isPrivacyHidden: app ? app.isPrivacyHidden : null
            };
        })()
        """
        res_reconceal = send("Runtime.evaluate", {"expression": reconceal_js, "returnByValue": True})
        reconcealed_state = res_reconceal.get("result", {}).get("value", {})
        print("RE-CONCEALED STATE:")
        print(json.dumps(reconcealed_state, indent=2))

        # Assertions
        assert initial_state["innerText"] == "******", f"Expected '******', got {initial_state['innerText']}"
        assert "text-emerald" not in initial_state["className"], "text-emerald should not be present when concealed"
        assert "text-rose" not in initial_state["className"], "text-rose should not be present when concealed"
        assert initial_state["innerText"].startswith("+") is False, "Plus sign should be hidden when concealed"
        assert initial_state["innerText"].startswith("-") is False, "Minus sign should be hidden when concealed"

        assert revealed_state["innerText"] != "******", "Revealed state should display formatted amount"
        assert revealed_state["innerText"].startswith("+") or revealed_state["innerText"].startswith("-"), "Revealed state should display sign prefix"
        assert ("text-emerald" in revealed_state["className"]) or ("text-rose" in revealed_state["className"]), "Revealed state should have emerald or rose styling"

        assert reconcealed_state["innerText"] == "******", f"Expected '******', got {reconcealed_state['innerText']}"
        assert "text-emerald" not in reconcealed_state["className"], "text-emerald should not be present when re-concealed"
        assert "text-rose" not in reconcealed_state["className"], "text-rose should not be present when re-concealed"

        print("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!")

        ws.close()
    finally:
        proc.terminate()
        proc.wait()

if __name__ == "__main__":
    run()

