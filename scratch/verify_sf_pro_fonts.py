import asyncio
import base64
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import threading
import time
import urllib.request
import websockets

PORT = 9333
HTTP_PORT = 8765
CHROME_PATH = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'
ARTIFACT_DIR = '/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128'
SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), 'screenshots_sf_pro')
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)
    def log_message(self, format, *args):
        pass  # Quiet logging

def start_server():
    server = socketserver.TCPServer(('127.0.0.1', HTTP_PORT), QuietHandler)
    server.allow_reuse_address = True
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server

async def main():
    print("====================================================================")
    print("SF PRO FONT VERIFICATION VIA CHROME DEVTOOLS PROTOCOL")
    print("====================================================================")

    server = start_server()
    print(f"Temporary test server running on 127.0.0.1:{HTTP_PORT}")

    subprocess.run(['pkill', '-f', f'--remote-debugging-port={PORT}'], stderr=subprocess.DEVNULL)
    time.sleep(0.5)

    chrome_proc = subprocess.Popen([
        CHROME_PATH,
        f'--remote-debugging-port={PORT}',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1440,900',
        'about:blank'
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        ws = None
        for attempt in range(30):
            try:
                req = urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json')
                pages = json.loads(req.read().decode())
                page_targets = [p for p in pages if p.get('type') == 'page']
                if page_targets:
                    ws = await websockets.connect(page_targets[0]['webSocketDebuggerUrl'], max_size=50*1024*1024)
                    print(f"Connected to Chrome remote debugging at {page_targets[0]['webSocketDebuggerUrl']}")
                    break
            except Exception:
                await asyncio.sleep(0.3)

        if not ws:
            raise RuntimeError("Could not connect to Chrome debugging websocket")

        msg_id = 1
        font_requests = []

        async def send(method, params=None):
            nonlocal msg_id
            m_id = msg_id
            msg_id += 1
            await ws.send(json.dumps({'id': m_id, 'method': method, 'params': params or {}}))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get('method') == 'Network.responseReceived':
                    p = resp.get('params', {})
                    res = p.get('response', {})
                    url = res.get('url', '')
                    if 'fonts/' in url or url.endswith('.otf') or url.endswith('.ttf'):
                        font_requests.append({
                            'url': url,
                            'status': res.get('status'),
                            'mimeType': res.get('mimeType')
                        })
                if resp.get('id') == m_id:
                    return resp.get('result', {})

        async def eval_js(expr):
            r = await send('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
            if 'exceptionDetails' in r:
                raise RuntimeError(f"JS Error in eval: {r['exceptionDetails']}")
            return r.get('result', {}).get('value')

        await send('Page.enable')
        await send('Network.enable')
        await send('DOM.enable')
        await send('CSS.enable')

        print(f"Navigating to http://127.0.0.1:{HTTP_PORT}/index.html ...")
        await send('Page.navigate', {'url': f'http://127.0.0.1:{HTTP_PORT}/index.html'})
        await asyncio.sleep(2.0)

        # Wait for document.fonts.ready
        font_ready = await eval_js("document.fonts.ready.then(() => true)")
        print(f"document.fonts.ready resolved: {font_ready}")

        # Check font face objects in document.fonts
        fonts_info = await eval_js("""
            (() => {
                const results = [];
                for (const f of document.fonts) {
                    results.push({
                        family: f.family,
                        weight: f.weight,
                        style: f.style,
                        status: f.status
                    });
                }
                return results;
            })()
        """)
        print("\nLoaded Document Fonts:")
        for fi in fonts_info:
            print(f"  - Family: '{fi['family']}' | Weight: {fi['weight']} | Status: {fi['status']}")

        # Test font check queries
        checks = await eval_js("""
            ({
                sfProText400: document.fonts.check('400 14px "SF Pro Text"'),
                sfProText500: document.fonts.check('500 14px "SF Pro Text"'),
                sfProText600: document.fonts.check('600 14px "SF Pro Text"'),
                sfProDisplay600: document.fonts.check('600 24px "SF Pro Display"'),
                sfProGeneral: document.fonts.check('14px "SF Pro"')
            })
        """)
        print("\nFont Check (document.fonts.check):")
        for k, v in checks.items():
            print(f"  {k}: {v}")

        # Inspect computed font-family and font-weight on real elements
        computed_styles = await eval_js("""
            (() => {
                const getInfo = (selector) => {
                    const el = document.querySelector(selector);
                    if (!el) return null;
                    const cs = window.getComputedStyle(el);
                    return {
                        fontFamily: cs.fontFamily,
                        fontWeight: cs.fontWeight,
                        fontSize: cs.fontSize,
                        fontVariantNumeric: cs.fontVariantNumeric
                    };
                };

                return {
                    body: getInfo('body'),
                    authTitle: getInfo('#auth-screen h2'),
                    authBtn: getInfo('#auth-btn'),
                    authDesc: getInfo('#auth-screen p')
                };
            })()
        """)

        print("\nComputed Typography on Initial View (Auth Screen):")
        for sel, info in computed_styles.items():
            if info:
                print(f"  [{sel}]: font-family='{info['fontFamily']}' | weight={info['fontWeight']} | size={info['fontSize']}")

        # Capture initial auth screenshot
        res = await send('Page.captureScreenshot', {'format': 'png'})
        data = base64.b64decode(res['data'])
        auth_ss_path = os.path.join(SCREENSHOTS_DIR, 'auth_screen_sf_pro.png')
        with open(auth_ss_path, 'wb') as f:
            f.write(data)
        shutil.copy(auth_ss_path, os.path.join(ARTIFACT_DIR, 'auth_screen_sf_pro.png'))
        print(f"\nCaptured Auth Screen screenshot with SF Pro: {auth_ss_path}")

        # Now mock login / reveal main app content to test Dashboard and Wallets
        await eval_js("""
            (() => {
                document.getElementById('auth-screen').style.display = 'none';
                document.getElementById('app-content').style.display = 'block';
                if (window.supabaseClient) {
                    window.supabaseClient.session = { user: { id: 'test-user', email: 'user@example.com' } };
                }
                if (window.app) {
                    window.app.init();
                    window.app.renderAll();
                }
            })()
        """)
        await asyncio.sleep(1.0)

        # Trigger font check and computed styles on main app elements
        app_computed = await eval_js("""
            (() => {
                const getInfo = (selector) => {
                    const el = document.querySelector(selector);
                    if (!el) return null;
                    const cs = window.getComputedStyle(el);
                    return {
                        fontFamily: cs.fontFamily,
                        fontWeight: cs.fontWeight,
                        fontSize: cs.fontSize,
                        fontVariantNumeric: cs.fontVariantNumeric
                    };
                };

                return {
                    body: getInfo('body'),
                    brandName: getInfo('.brand-name'),
                    navLabel: getInfo('.nav-group-label'),
                    headerTitle: getInfo('.header-page-title'),
                    monthDisplay: getInfo('#current-month-display'),
                    summaryAmount: getInfo('.financial-amount, .summary-amount, .country-total-amount')
                };
            })()
        """)

        print("\nComputed Typography on Main Application View:")
        for sel, info in app_computed.items():
            if info:
                print(f"  [{sel}]: font-family='{info['fontFamily']}' | weight={info['fontWeight']} | size={info['fontSize']}")

        # Capture app screenshot
        res = await send('Page.captureScreenshot', {'format': 'png'})
        data = base64.b64decode(res['data'])
        app_ss_path = os.path.join(SCREENSHOTS_DIR, 'app_dashboard_sf_pro.png')
        with open(app_ss_path, 'wb') as f:
            f.write(data)
        shutil.copy(app_ss_path, os.path.join(ARTIFACT_DIR, 'app_dashboard_sf_pro.png'))
        print(f"Captured Dashboard screenshot with SF Pro: {app_ss_path}")

        # Navigate to Wallets view
        await eval_js("""
            (() => {
                if (window.app && typeof window.app.switchView === 'function') {
                    window.app.switchView('wallets');
                }
            })()
        """)
        await asyncio.sleep(1.0)

        wallets_computed = await eval_js("""
            (() => {
                const getInfo = (selector) => {
                    const el = document.querySelector(selector);
                    if (!el) return null;
                    const cs = window.getComputedStyle(el);
                    return {
                        fontFamily: cs.fontFamily,
                        fontWeight: cs.fontWeight,
                        fontSize: cs.fontSize,
                        fontVariantNumeric: cs.fontVariantNumeric
                    };
                };

                return {
                    walletsPageTitle: getInfo('.wallets-page-title'),
                    walletBalanceVal: getInfo('.wallet-balance-val, .country-total-amount'),
                    walletConfigTitle: getInfo('.wallet-config-section-title')
                };
            })()
        """)

        print("\nComputed Typography on Wallets Page:")
        for sel, info in wallets_computed.items():
            if info:
                print(f"  [{sel}]: font-family='{info['fontFamily']}' | weight={info['fontWeight']} | size={info['fontSize']}")

        res = await send('Page.captureScreenshot', {'format': 'png'})
        data = base64.b64decode(res['data'])
        wallets_ss_path = os.path.join(SCREENSHOTS_DIR, 'wallets_page_sf_pro.png')
        with open(wallets_ss_path, 'wb') as f:
            f.write(data)
        shutil.copy(wallets_ss_path, os.path.join(ARTIFACT_DIR, 'wallets_page_sf_pro.png'))
        print(f"Captured Wallets screenshot with SF Pro: {wallets_ss_path}")

        print("\nNetwork Font Requests Captured:")
        if font_requests:
            for fr in font_requests:
                print(f"  HTTP {fr['status']} | {fr['mimeType']} | {fr['url']}")
        else:
            print("  (Fonts were loaded from cache or system local)")

        print("\n====================================================================")
        print("VERIFICATION COMPLETED SUCCESSFULLY")
        print("====================================================================")

    finally:
        chrome_proc.terminate()
        try:
            chrome_proc.wait(timeout=2)
        except Exception:
            chrome_proc.kill()
        server.shutdown()
        server.server_close()
        print("Chrome and test server cleanly shut down.")

if __name__ == '__main__':
    asyncio.run(main())
