import asyncio
import json
import os
import subprocess
import time
import urllib.request
import websockets

CHROME_BIN = '/usr/bin/google-chrome-stable'
CDP_PORT = 9450
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

async def set_viewport(ws, width, height, device_scale_factor=1, is_mobile=True):
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

async def audit_steps():
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
    time.sleep(1.2)

    try:
        with urllib.request.urlopen(f'http://localhost:{CDP_PORT}/json/list') as r:
            tabs = json.load(r)
            ws_url = tabs[0]['webSocketDebuggerUrl']

        async with websockets.connect(ws_url, max_size=30*1024*1024) as ws:
            await send_cmd(ws, "Page.enable")
            await send_cmd(ws, "Runtime.enable")
            await send_cmd(ws, "Page.navigate", {"url": INDEX_URL})
            await asyncio.sleep(1.0)

            await eval_js(ws, """
                (() => {
                    localStorage.clear();
                    if (!window.onboardingController) {
                        window.onboardingController = new OnboardingController();
                    }
                    onboardingController.draft = {
                        activeCountries: ['JP', 'IN', 'DE'],
                        defaultCountry: 'JP',
                        budgets: {
                            JP: { enabled: true, monthlyTotal: 150000, rolloverEnabled: true },
                            IN: { enabled: true, monthlyTotal: 40000, rolloverEnabled: true },
                            DE: { enabled: true, monthlyTotal: 1200, rolloverEnabled: true }
                        },
                        wallets: {},
                        loanConfig: { enabled: true, country: 'IN', currency: '₹', totalPrincipal: 500000, principalLeft: 420000, emi: 12500, annualInterestRate: 8.5 }
                    };
                    onboardingController._initDraftWallets();
                    onboardingController.show();
                })()
            """)

            for step in [1, 2, 3, 4]:
                await eval_js(ws, f"""
                    onboardingController.currentStep = {step};
                    onboardingController.render();
                """)
                await asyncio.sleep(0.2)

                print(f"=== STEP {step} AUDIT ===")
                for w in [320, 390]:
                    await set_viewport(ws, w, 800, is_mobile=True)
                    await asyncio.sleep(0.1)

                    metrics = await eval_js(ws, """
                        (() => {
                            const card = document.querySelector('.onboarding-card');
                            const cardRect = card.getBoundingClientRect();
                            const stepView = document.querySelector('.onboarding-step-view:not([style*="display: none"])');
                            const inputs = Array.from(card.querySelectorAll('input, select, button, .onboarding-country-card')).filter(el => el.offsetParent !== null);
                            
                            const overflowingElements = inputs.filter(el => {
                                const r = el.getBoundingClientRect();
                                return r.right > cardRect.right + 0.5;
                            }).map(el => ({
                                tag: el.tagName,
                                cls: el.className,
                                right: el.getBoundingClientRect().right,
                                cardRight: cardRect.right,
                                overflow: el.getBoundingClientRect().right - cardRect.right
                            }));

                            const touchTargets = inputs.map(el => {
                                const r = el.getBoundingClientRect();
                                return {
                                    tag: el.tagName,
                                    cls: el.className,
                                    width: r.width,
                                    height: r.height,
                                    touchTooSmall: (r.width < 40 || r.height < 40) && el.type !== 'checkbox' && !el.classList.contains('onboarding-checkbox')
                                };
                            }).filter(t => t.touchTooSmall);

                            return {
                                cardWidth: cardRect.width,
                                cardLeft: cardRect.left,
                                cardRight: cardRect.right,
                                docScrollWidth: document.documentElement.scrollWidth,
                                overflowingElements,
                                touchTargets
                            };
                        })()
                    """)

                    print(f"  Width {w}px: CardWidth={metrics['cardWidth']:.1f}px, DocScroll={metrics['docScrollWidth']}px")
                    if metrics['overflowingElements']:
                        print(f"    [OVERFLOW FOUND in Step {step} at {w}px]:")
                        for of in metrics['overflowingElements']:
                            print(f"      {of['tag']}.{of['cls']}: overflows by {of['overflow']:.1f}px")
                    else:
                        print(f"    [OK] All controls contained inside card at {w}px")

                    if metrics['touchTargets']:
                        print(f"    [TOUCH TARGET WARNINGS in Step {step} at {w}px]:")
                        for tt in metrics['touchTargets']:
                            print(f"      {tt['tag']}.{tt['cls']}: {tt['width']:.1f} x {tt['height']:.1f}px")
                    else:
                        print(f"    [OK] All interactive controls meet touch target standards (>= 40px)")
                print()

    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    asyncio.run(audit_steps())
