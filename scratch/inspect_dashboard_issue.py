import os, sys, time, json, base64, subprocess, urllib.request, websocket

HTML_PATH = os.path.abspath('index.html')
CHROME_BIN = '/opt/google/chrome/google-chrome' if os.path.exists('/opt/google/chrome/google-chrome') else '/usr/bin/google-chrome-stable'

proc = subprocess.Popen([
    CHROME_BIN,
    '--headless=new',
    '--remote-debugging-port=9486',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900'
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(1.5)

try:
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9486/json').read())
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
        const auth = document.getElementById('auth-screen');
        if (auth) auth.style.display = 'none';
        const onboarding = document.getElementById('onboarding-screen');
        if (onboarding) onboarding.style.display = 'none';
        const appEl = document.getElementById('app-content');
        if (appEl) appEl.style.display = 'block';

        if (window.app && window.app.renderAll) {
            window.app.renderAll();
        }

        const elements = [
            '#app-content',
            '.desktop-layout',
            '.desktop-main-wrapper',
            '.desktop-content-area',
            '#dashboard-workspace-grid',
            '#dashboard-main-column',
            '.country-balance-grid',
            '.country-card-jp',
            '#jp-categories-wrap',
            '.collapsible-inner',
            '#budget-overview-card-jp',
            '#dashboard-rail'
        ];

        return elements.map(sel => {
            const el = document.querySelector(sel);
            if (!el) return { sel, found: false };
            const rect = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            return {
                sel,
                found: true,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                display: cs.display,
                flex: cs.flex,
                gridTemplateColumns: cs.gridTemplateColumns,
                maxWidth: cs.maxWidth,
                margin: cs.margin,
                padding: cs.padding,
                widthStyle: cs.width
            };
        });
    })()
    '''
    res = send('Runtime.evaluate', {'expression': init_js, 'returnByValue': True})
    elements = res.get('result', {}).get('value', [])
    print('=== Desktop 1440px Element Measurements ===')
    for el in elements:
        print(json.dumps(el, indent=2))

    screenshot = send('Page.captureScreenshot', {'format': 'png'})
    with open('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/dashboard_cards_fucked_1440.png', 'wb') as f:
        f.write(base64.b64decode(screenshot['data']))
    print('Screenshot saved: dashboard_cards_fucked_1440.png')

    # Mobile 390
    send('Emulation.setDeviceMetricsOverride', {
        'width': 390,
        'height': 844,
        'deviceScaleFactor': 2,
        'mobile': True
    })
    time.sleep(1)
    res_mob = send('Runtime.evaluate', {'expression': init_js, 'returnByValue': True})
    elements_mob = res_mob.get('result', {}).get('value', [])
    print('\n=== Mobile 390px Element Measurements ===')
    for el in elements_mob:
        print(json.dumps(el, indent=2))

    screenshot_mob = send('Page.captureScreenshot', {'format': 'png'})
    with open('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/dashboard_cards_fucked_390.png', 'wb') as f:
        f.write(base64.b64decode(screenshot_mob['data']))
    print('Screenshot saved: dashboard_cards_fucked_390.png')

    ws.close()
finally:
    proc.terminate()
    proc.wait()
