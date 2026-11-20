import asyncio
import json
import os
import subprocess
import time
import urllib.request
import websockets
import base64

CHROME_BIN = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'
CDP_PORT = 9445
ARTIFACT_DIR = '/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128'
SCRATCH_DIR = '/mnt/01DB426183A10370/E_Software/Docs/Antigravity Expense Manager/Expense-Manager/scratch'
INDEX_URL = 'file:///mnt/01DB426183A10370/E_Software/Docs/Antigravity Expense Manager/Expense-Manager/index.html'

msg_counter = 1

async def send_cmd(ws, method, params=None):
    global msg_counter
    curr_id = msg_counter
    msg_counter += 1
    payload = {"id": curr_id, "method": method}
    if params:
        payload["params"] = params
    await ws.send(json.dumps(payload))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get("id") == curr_id:
            return resp

async def eval_js(ws, expr):
    res = await send_cmd(ws, "Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
    if "exceptionDetails" in res.get("result", {}):
        raise RuntimeError(f"JS Exception: {res['result']['exceptionDetails']}")
    return res.get("result", {}).get("result", {}).get("value")

async def set_viewport(ws, width, height, device_scale_factor=1, is_mobile=False):
    await send_cmd(ws, "Emulation.setDeviceMetricsOverride", {
        "width": width,
        "height": height,
        "deviceScaleFactor": device_scale_factor,
        "mobile": is_mobile
    })
    await send_cmd(ws, "Emulation.setVisibleSize", {
        "width": width,
        "height": height
    })

async def capture_screenshot(ws, filename):
    res = await send_cmd(ws, "Page.captureScreenshot", {"format": "png"})
    data = base64.b64decode(res["result"]["data"])
    p1 = os.path.join(ARTIFACT_DIR, filename)
    p2 = os.path.join(SCRATCH_DIR, filename)
    with open(p1, "wb") as f:
        f.write(data)
    with open(p2, "wb") as f:
        f.write(data)
    print(f"  [Screenshot] Saved: {filename}")

async def main():
    cmd = [
        CHROME_BIN,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        f'--remote-debugging-port={CDP_PORT}',
        '--hide-scrollbars',
        'about:blank'
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(1)

    try:
        with urllib.request.urlopen(f'http://localhost:{CDP_PORT}/json/list') as r:
            tabs = json.load(r)
            ws_url = tabs[0]['webSocketDebuggerUrl']

        async with websockets.connect(ws_url, max_size=25*1024*1024) as ws:
            await send_cmd(ws, "Page.enable")
            await send_cmd(ws, "Runtime.enable")
            await send_cmd(ws, "Page.navigate", {"url": INDEX_URL})
            await asyncio.sleep(2)

            # Initialize onboarding screen
            setup_res = await eval_js(ws, """
                (() => {
                    localStorage.clear();
                    if (typeof onboardingController !== 'undefined') {
                        onboardingController.show();
                        return { ok: true, step: onboardingController.currentStep };
                    }
                    return { ok: false };
                })()
            """)
            print("Setup Onboarding:", setup_res)
            await asyncio.sleep(0.5)

            # Viewports to audit
            viewports = [
                ("320", 320, 568, True),
                ("375", 375, 667, True),
                ("390", 390, 844, True),
                ("430", 430, 932, True),
                ("768", 768, 1024, False),
                ("1024", 1024, 768, False),
                ("1440", 1440, 900, False),
            ]

            for vp_name, w, h, is_mob in viewports:
                print(f"\n--- Viewport: {vp_name}px ({w}x{h}) ---")
                await set_viewport(ws, w, h, is_mobile=is_mob)
                await asyncio.sleep(0.3)

                # Check horizontal overflow
                overflow_info = await eval_js(ws, """
                    (() => {
                        const docEl = document.documentElement;
                        const body = document.body;
                        const screen = document.getElementById('onboarding-screen');
                        const card = document.querySelector('.onboarding-card');
                        const container = document.querySelector('.onboarding-container');
                        return {
                            windowWidth: window.innerWidth,
                            docScrollWidth: docEl.scrollWidth,
                            hasOverflow: docEl.scrollWidth > window.innerWidth,
                            containerGridCols: container ? getComputedStyle(container).gridTemplateColumns : null,
                            cardWidth: card ? card.offsetWidth : null,
                            previewPaneDisplay: document.querySelector('.onboarding-preview-pane') ? getComputedStyle(document.querySelector('.onboarding-preview-pane')).display : null
                        };
                    })()
                """)
                print(f"  Overflow Check: scrollWidth={overflow_info['docScrollWidth']}, innerWidth={overflow_info['windowWidth']}, overflow={overflow_info['hasOverflow']}")
                print(f"  Container grid-template-columns: {overflow_info['containerGridCols']}")
                print(f"  Card width: {overflow_info['cardWidth']}px, Preview pane display: {overflow_info['previewPaneDisplay']}")

                # Capture baseline screenshot for Step 1
                await capture_screenshot(ws, f"onboarding_before_step1_{vp_name}.png")

            # Also capture Steps 2, 3, 4 at 390px mobile to see before state
            print("\n--- Auditing Steps 2, 3, 4 at 390px (Mobile) ---")
            await set_viewport(ws, 390, 844, is_mobile=True)
            for step in [2, 3, 4]:
                await eval_js(ws, f"""
                    (() => {{
                        onboardingController.currentStep = {step};
                        onboardingController.render();
                    }})()
                """)
                await asyncio.sleep(0.3)
                overflow = await eval_js(ws, "document.documentElement.scrollWidth > window.innerWidth")
                print(f"  Step {step} at 390px: overflow={overflow}")
                await capture_screenshot(ws, f"onboarding_before_step{step}_390.png")

    finally:
        proc.terminate()
        proc.wait()

asyncio.run(main())

