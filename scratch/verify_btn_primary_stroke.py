import json
import os
import subprocess
import time
import urllib.request
import base64

def run():
    import tempfile
    user_data_dir = tempfile.mkdtemp(prefix="chrome_test_")
    port = 9522
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

        # Bypass auth screen to reveal header-action-btn
        bypass_js = """
        (() => {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
            if (window.app && window.app.renderAll) window.app.renderAll();
            
            const btn = document.getElementById('header-action-btn-main') || document.querySelector('.header-action-btn') || document.querySelector('.btn-primary');
            const cs = window.getComputedStyle(btn);
            return {
                id: btn.id,
                className: btn.className,
                borderWidth: cs.borderWidth,
                borderStyle: cs.borderStyle,
                borderColor: cs.borderColor,
                borderRadius: cs.borderRadius,
                backgroundImage: cs.backgroundImage,
                backgroundOrigin: cs.backgroundOrigin,
                backgroundClip: cs.backgroundClip,
                boxShadow: cs.boxShadow,
                color: cs.color,
                fontSize: cs.fontSize,
                fontWeight: cs.fontWeight,
                height: cs.height,
                padding: cs.padding,
                display: cs.display,
                alignItems: cs.alignItems,
                justifyContent: cs.justifyContent
            };
        })()
        """
        res = send("Runtime.evaluate", {"expression": bypass_js, "returnByValue": True})
        computed_normal = res.get("result", {}).get("value", {})
        print("HEADER ACTION BUTTON NORMAL STATE:")
        print(json.dumps(computed_normal, indent=2))

        # Check DOM element position and capture normal screenshot
        get_rect_js = """
        (() => {
            const btn = document.getElementById('header-action-btn-main') || document.querySelector('.header-action-btn') || document.querySelector('.btn-primary');
            const rect = btn.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        })()
        """
        rect_res = send("Runtime.evaluate", {"expression": get_rect_js, "returnByValue": True})
        rect = rect_res.get("result", {}).get("value", {})
        print("BUTTON RECT:", rect)

        # Get DOM Node ID for CSS pseudo class
        doc = send("DOM.getDocument")
        node_res = send("DOM.querySelector", {"nodeId": doc["root"]["nodeId"], "selector": ".header-action-btn"})
        btn_node_id = node_res["nodeId"] if node_res and "nodeId" in node_res else None

        # Capture Normal Screenshot
        clip_params = {
            "x": max(0, rect["x"] - 8),
            "y": max(0, rect["y"] - 8),
            "width": rect["width"] + 16,
            "height": rect["height"] + 16,
            "scale": 2
        }
        scr_normal = send("Page.captureScreenshot", {"clip": clip_params, "format": "png"})
        if "data" in scr_normal:
            with open("scratch/header_btn_primary_stroke_normal.png", "wb") as f:
                f.write(base64.b64decode(scr_normal["data"]))
            with open("/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/header_btn_primary_stroke_normal.png", "wb") as f:
                f.write(base64.b64decode(scr_normal["data"]))
            print("Saved header normal screenshot.")

        # Force Hover pseudo class
        if btn_node_id:
            send("CSS.forcePseudoState", {"nodeId": btn_node_id, "forcedPseudoClasses": ["hover"]})
            time.sleep(0.3)

        # Inspect hover computed styles
        eval_hover_js = """
        (() => {
            const btn = document.getElementById('header-action-btn-main') || document.querySelector('.header-action-btn') || document.querySelector('.btn-primary');
            const cs = window.getComputedStyle(btn);
            const span = btn.querySelector('span');
            const csSpan = span ? window.getComputedStyle(span) : null;
            return {
                backgroundColor: cs.backgroundColor,
                borderColor: cs.borderColor,
                boxShadow: cs.boxShadow,
                color: cs.color,
                spanColor: csSpan ? csSpan.color : null,
                spanWebkitTextFillColor: csSpan ? csSpan.webkitTextFillColor : null
            };
        })()
        """
        hover_res = send("Runtime.evaluate", {"expression": eval_hover_js, "returnByValue": True})
        computed_hover = hover_res.get("result", {}).get("value", {})
        print("HEADER ACTION BUTTON HOVER STATE:")
        print(json.dumps(computed_hover, indent=2))

        # Capture Hover Screenshot
        scr_hover = send("Page.captureScreenshot", {"clip": clip_params, "format": "png"})
        if "data" in scr_hover:
            with open("scratch/header_btn_primary_stroke_hover.png", "wb") as f:
                f.write(base64.b64decode(scr_hover["data"]))
            with open("/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/header_btn_primary_stroke_hover.png", "wb") as f:
                f.write(base64.b64decode(scr_hover["data"]))
            print("Saved header hover screenshot.")

        ws.close()
    finally:
        proc.terminate()
        proc.wait()

if __name__ == "__main__":
    run()
