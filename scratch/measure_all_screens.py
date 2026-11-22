import os, sys, time, json, subprocess, urllib.request, websocket

HTML_PATH = os.path.abspath('index.html')
CHROME_BIN = '/opt/google/chrome/google-chrome' if os.path.exists('/opt/google/chrome/google-chrome') else '/usr/bin/google-chrome-stable'

proc = subprocess.Popen([
    CHROME_BIN,
    '--headless=new',
    '--remote-debugging-port=9488',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900'
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(1.5)

try:
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9488/json').read())
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

    measure_js = '''
    (() => {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        if (window.app && window.app.renderAll) window.app.renderAll();

        const getInfo = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            return {
                w: r.width,
                left: r.left,
                right: r.right,
                margin: cs.margin,
                padding: cs.padding,
                display: cs.display,
                width: cs.width,
                maxWidth: cs.maxWidth
            };
        };

        return {
            windowWidth: window.innerWidth,
            grid: getInfo('#dashboard-workspace-grid'),
            main: getInfo('#dashboard-main-column'),
            countryGrid: getInfo('.country-balance-grid'),
            countryCardJp: getInfo('.country-card-jp'),
            monthlySummary: getInfo('#monthly-financial-summary'),
            budgetCentralCard: getInfo('.budget-central-card'),
            categoriesWrap: getInfo('#jp-categories-wrap'),
            rail: getInfo('#dashboard-rail')
        };
    })()
    '''

    for width in [1440, 1200, 1024, 768, 390]:
        send('Emulation.setDeviceMetricsOverride', {
            'width': width,
            'height': 900,
            'deviceScaleFactor': 1,
            'mobile': width < 768
        })
        time.sleep(0.5)
        res = send('Runtime.evaluate', {'expression': measure_js, 'returnByValue': True})
        print(f"\n==================== WIDTH: {width}px ====================")
        val = res.get('result', {}).get('value', {})
        for k, v in val.items():
            if k == 'windowWidth': continue
            if v:
                print(f"  {k:<18}: w={v['w']:<7.1f} left={v['left']:<6.1f} margin={v['margin']} padding={v['padding']}")
            else:
                print(f"  {k:<18}: NOT FOUND")

    ws.close()
finally:
    proc.terminate()
    proc.wait()
