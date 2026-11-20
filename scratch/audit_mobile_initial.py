import asyncio
import json
import os
import subprocess
import time
import urllib.request
import websockets

CHROME_BIN = '/usr/bin/google-chrome-stable'
CDP_PORT = 9449
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

async def run_audit():
    print("=" * 80)
    print("AUDITING CURRENT MOBILE ONBOARDING IMPLEMENTATION")
    print("=" * 80)

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

            # Initialize onboarding to Step 3
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
                        loanConfig: { enabled: false, country: 'IN', currency: '₹', totalPrincipal: 0, principalLeft: 0, emi: 0, annualInterestRate: 0 }
                    };
                    onboardingController._initDraftWallets();
                    onboardingController.show();
                    onboardingController.currentStep = 3;
                    onboardingController.render();
                })()
            """)
            await asyncio.sleep(0.5)

            widths = [320, 360, 375, 390, 412, 430, 480, 600, 768]
            for w in widths:
                await set_viewport(ws, w, 800, is_mobile=True)
                await asyncio.sleep(0.1)

                metrics = await eval_js(ws, """
                    (() => {
                        const sections = Array.from(document.querySelectorAll('.onboarding-country-wallets-section'));
                        return sections.map(sec => {
                            const secRect = sec.getBoundingClientRect();
                            const title = sec.querySelector('.onboarding-section-title');
                            const addBtn = sec.querySelector('.onboarding-btn-add-wallet');
                            const headerRow = sec.querySelector('.onboarding-section-header-row');
                            const titleRect = title ? title.getBoundingClientRect() : null;
                            const addBtnRect = addBtn ? addBtn.getBoundingClientRect() : null;
                            const headerRect = headerRow ? headerRow.getBoundingClientRect() : null;
                            const rows = Array.from(sec.querySelectorAll('.onboarding-wallet-row')).map(r => {
                                const rRect = r.getBoundingClientRect();
                                const delBtn = r.querySelector('.onboarding-wallet-delete-btn');
                                const delRect = delBtn ? delBtn.getBoundingClientRect() : null;
                                const input = r.querySelector('.onboarding-balance-input');
                                const inRect = input ? input.getBoundingClientRect() : null;
                                return {
                                    rowRight: rRect.right,
                                    delRight: delRect ? delRect.right : null,
                                    inRight: inRect ? inRect.right : null,
                                    secRight: secRect.right,
                                    overflowsSec: rRect.right > secRect.right + 0.5
                                };
                            });

                            return {
                                secWidth: secRect.width,
                                secRight: secRect.right,
                                headerRight: headerRect ? headerRect.right : null,
                                headerWidth: headerRect ? headerRect.width : null,
                                titleRight: titleRect ? titleRect.right : null,
                                addBtnLeft: addBtnRect ? addBtnRect.left : null,
                                addBtnRight: addBtnRect ? addBtnRect.right : null,
                                addBtnWidth: addBtnRect ? addBtnRect.width : null,
                                addBtnOverflow: addBtnRect ? (addBtnRect.right - secRect.right) : 0,
                                addBtnProtrudes: addBtnRect ? (addBtnRect.right > secRect.right + 0.5) : false,
                                rows
                            };
                        });
                    })()
                """)

                card_metrics = await eval_js(ws, """
                    (() => {
                        const card = document.querySelector('.onboarding-card');
                        const cardRect = card.getBoundingClientRect();
                        return {
                            cardLeft: cardRect.left,
                            cardRight: cardRect.right,
                            cardWidth: cardRect.width,
                            docScrollWidth: document.documentElement.scrollWidth,
                            bodyScrollWidth: document.body.scrollWidth
                        };
                    })()
                """)

                sec0 = metrics[0] if metrics else {}
                print(f"Viewport {w}px:")
                print(f"  Card width: {card_metrics['cardWidth']:.1f}px (left={card_metrics['cardLeft']:.1f}, right={card_metrics['cardRight']:.1f})")
                print(f"  Section width: {sec0.get('secWidth', 0):.1f}px (right={sec0.get('secRight', 0):.1f})")
                print(f"  AddBtn: width={sec0.get('addBtnWidth', 0):.1f}px, left={sec0.get('addBtnLeft', 0):.1f}, right={sec0.get('addBtnRight', 0):.1f}")
                print(f"  AddBtn Protrudes past section: {sec0.get('addBtnProtrudes')} (by {sec0.get('addBtnOverflow', 0):.1f}px)")
                if sec0.get('addBtnProtrudes'):
                    print(f"  [CONFIRMED DEFECT] Add Account button overflows parent section at {w}px by {sec0.get('addBtnOverflow', 0):.1f}px!")
                for i, r in enumerate(sec0.get('rows', [])):
                    print(f"  Row {i}: overflows={r['overflowsSec']}, rowRight={r['rowRight']:.1f}, secRight={r['secRight']:.1f}, inRight={r['inRight']}, delRight={r['delRight']}")
                print()

    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    asyncio.run(run_audit())
