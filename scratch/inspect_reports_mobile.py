import os, sys, time, json, subprocess, urllib.request, websocket, base64

HTML_PATH = os.path.abspath('index.html')
CHROME_BIN = '/opt/google/chrome/google-chrome' if os.path.exists('/opt/google/chrome/google-chrome') else '/usr/bin/google-chrome-stable'

proc = subprocess.Popen([
    CHROME_BIN,
    '--headless=new',
    '--remote-debugging-port=9499',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=390,844'
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(1.5)

try:
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9499/json').read())
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

    # Switch to reports view
    switch_view_js = '''
    (() => {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        if (window.app && window.app.navigateTo) {
            window.app.navigateTo('reports-view');
        }
    })()
    '''
    send('Runtime.evaluate', {'expression': switch_view_js})
    time.sleep(1.5)

    send('Emulation.setDeviceMetricsOverride', {
        'width': 390,
        'height': 844,
        'deviceScaleFactor': 2,
        'mobile': True
    })
    time.sleep(1)

    # Inspect reports budget card
    check_js = '''
    (() => {
        const card = document.querySelector('.reports-budget-perf-card');
        if (!card) return { found: false };

        const r = card.getBoundingClientRect();
        const header = card.querySelector('.budget-central-header');
        const titleGroup = card.querySelector('.budget-central-title-group');
        const hero = card.querySelector('.budget-remaining-hero');
        const statsRow = card.querySelector('.budget-central-stats-row');

        return {
            found: true,
            cardWidth: r.width,
            cardHeight: r.height,
            header: header ? {
                w: header.getBoundingClientRect().width,
                h: header.getBoundingClientRect().height,
                scrollWidth: header.scrollWidth,
                flexWrap: window.getComputedStyle(header).flexWrap
            } : null,
            titleGroup: titleGroup ? {
                w: titleGroup.getBoundingClientRect().width,
                scrollWidth: titleGroup.scrollWidth
            } : null,
            hero: hero ? {
                w: hero.getBoundingClientRect().width,
                display: window.getComputedStyle(hero).display
            } : null,
            statsRow: statsRow ? {
                w: statsRow.getBoundingClientRect().width,
                scrollWidth: statsRow.scrollWidth,
                children: Array.from(statsRow.children).map(c => ({
                    text: c.innerText,
                    w: c.getBoundingClientRect().width
                }))
            } : null,
            docScrollWidth: document.documentElement.scrollWidth,
            docClientWidth: document.documentElement.clientWidth
        };
    })()
    '''
    res = send('Runtime.evaluate', {'expression': check_js, 'returnByValue': True})
    print(json.dumps(res.get('result', {}).get('value', {}), indent=2))

    shot = send('Page.captureScreenshot', {'format': 'png'})
    with open('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/reports_budget_card_broken_390.png', 'wb') as f:
        f.write(base64.b64decode(shot['data']))
    print('Screenshot saved: reports_budget_card_broken_390.png')

    ws.close()
finally:
    proc.terminate()
    proc.wait()
