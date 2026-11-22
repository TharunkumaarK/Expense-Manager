import os, sys, time, json, subprocess, urllib.request, websocket, base64

HTML_PATH = os.path.abspath('index.html')
CHROME_BIN = '/opt/google/chrome/google-chrome' if os.path.exists('/opt/google/chrome/google-chrome') else '/usr/bin/google-chrome-stable'

proc = subprocess.Popen([
    CHROME_BIN,
    '--headless=new',
    '--remote-debugging-port=9496',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,900'
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(1.5)

try:
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9496/json').read())
    ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'])

    def send(method, params=None):
        msg = {'id': 1, 'method': method, 'params': params or {}}
        ws.send(json.dumps(msg))
        while True:
            res = json.loads(ws.recv())
            if res.get('id') == 1:
                return res.get('result', {})

    send('Page.enable')
    send('DOM.enable')
    send('CSS.enable')
    send('Page.navigate', {'url': f'file://{HTML_PATH}'})
    time.sleep(2)

    init_js = '''
    (() => {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        if (window.app && window.app.renderAll) window.app.renderAll();

        const targets = [
            '.country-card-jp',
            '.monthly-stat-card',
            '.budget-central-card',
            '.rail-card'
        ];

        const out = {};
        for (const sel of targets) {
            const el = document.querySelector(sel);
            if (!el) {
                out[sel] = 'NOT_FOUND';
                continue;
            }
            const cs = window.getComputedStyle(el);
            out[sel] = {
                bg: cs.backgroundColor,
                backdrop: cs.backdropFilter,
                border: cs.border
            };
        }
        return out;
    })()
    '''

    # Desktop 1280
    res_desktop = send('Runtime.evaluate', {'expression': init_js, 'returnByValue': True})
    print('=== Desktop (1280px) Computed Styles ===')
    print(json.dumps(res_desktop.get('result', {}).get('value', {}), indent=2))

    # Mobile 390
    send('Emulation.setDeviceMetricsOverride', {
        'width': 390,
        'height': 844,
        'deviceScaleFactor': 2,
        'mobile': True
    })
    time.sleep(1)
    res_mobile = send('Runtime.evaluate', {'expression': init_js, 'returnByValue': True})
    print('\n=== Mobile (390px) Computed Styles ===')
    print(json.dumps(res_mobile.get('result', {}).get('value', {}), indent=2))

    # Screenshot mobile
    shot_mobile = send('Page.captureScreenshot', {'format': 'png'})
    with open('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/universal_glass_mobile_390.png', 'wb') as f:
        f.write(base64.b64decode(shot_mobile['data']))
    print('\nScreenshot saved: universal_glass_mobile_390.png')

    # Screenshot desktop
    send('Emulation.clearDeviceMetricsOverride')
    time.sleep(1)
    shot_desktop = send('Page.captureScreenshot', {'format': 'png'})
    with open('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/universal_glass_desktop_1280.png', 'wb') as f:
        f.write(base64.b64decode(shot_desktop['data']))
    print('Screenshot saved: universal_glass_desktop_1280.png')

    ws.close()
finally:
    proc.terminate()
    proc.wait()
