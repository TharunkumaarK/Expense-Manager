import json
import os
import subprocess
import time
import urllib.request
import base64
import tempfile

def run():
    user_data_dir = tempfile.mkdtemp(prefix="chrome_wallet_test_")
    port = 9535
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

        # Bypass auth, navigate to wallets-view, and open edit-wallet-modal
        eval_js = """
        (() => {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
            if (window.app) {
                app.switchView('wallets-view');
                const walletIds = Object.keys(storage.state.wallets || {});
                const firstId = walletIds[0] || 'PayPay';
                app.openEditWalletModal(firstId);
            }
            
            const modal = document.getElementById('edit-wallet-modal');
            const nameInput = document.getElementById('edit-wallet-name');
            const rect = modal.querySelector('.wallet-config-modal').getBoundingClientRect();
            
            return {
                isModalActive: modal.classList.contains('active'),
                nameValue: nameInput.value,
                isReadOnly: nameInput.readOnly,
                isDisabled: nameInput.disabled,
                placeholder: nameInput.placeholder,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            };
        })()
        """
        res = send("Runtime.evaluate", {"expression": eval_js, "returnByValue": True})
        modal_state = res.get("result", {}).get("value", {})
        print("EDIT WALLET MODAL STATE:")
        print(json.dumps(modal_state, indent=2))

        assert modal_state["isModalActive"] is True, "Modal should be active"
        assert modal_state["isReadOnly"] is False, "Wallet name input must NOT be readOnly"
        assert modal_state["isDisabled"] is False, "Wallet name input must NOT be disabled"

        # Capture screenshot of the Edit Wallet modal
        rect = modal_state["rect"]
        clip_params = {
            "x": max(0, rect["x"] - 10),
            "y": max(0, rect["y"] - 10),
            "width": rect["width"] + 20,
            "height": rect["height"] + 20,
            "scale": 1.5
        }
        scr = send("Page.captureScreenshot", {"clip": clip_params, "format": "png"})
        if "data" in scr:
            with open("scratch/edit_wallet_modal_configurable.png", "wb") as f:
                f.write(base64.b64decode(scr["data"]))
            with open("/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/edit_wallet_modal_configurable.png", "wb") as f:
                f.write(base64.b64decode(scr["data"]))
            print("Saved modal screenshot.")

        print("CDP VERIFICATION COMPLETED SUCCESSFULLY!")
        ws.close()
    finally:
        proc.terminate()
        proc.wait()

if __name__ == "__main__":
    run()

