import os, sys, time, json, subprocess, urllib.request, websocket, base64

HTML_PATH = os.path.abspath('index.html')
CHROME_BIN = '/opt/google/chrome/google-chrome' if os.path.exists('/opt/google/chrome/google-chrome') else '/usr/bin/google-chrome-stable'

proc = subprocess.Popen([
    CHROME_BIN,
    '--headless=new',
    '--remote-debugging-port=9494',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=390,844'
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(1.5)

try:
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9494/json').read())
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

    inject_js = """
    (() => {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        if (window.app && window.app.renderAll) window.app.renderAll();

        const style = document.createElement('style');
        style.id = 'test-universal-glass';
        style.textContent = `
            @media (max-width: 768px) {
                .card:not(.country-card-jp):not(.country-card-in):not(.country-card-de),
                .rail-card,
                .analytics-kpi-card,
                .ledger-toolbar-card,
                .analytics-toolbar-card,
                .reports-toolbar-card,
                .budgets-toolbar-card,
                .reports-snapshot-banner,
                .reports-kpi-card,
                .reports-budget-perf-card,
                .reports-chart-card,
                .reports-data-table-card,
                .custom-report-panel,
                .budget-central-card,
                .monthly-stat-card,
                .settings-section-card {
                    backdrop-filter: var(--glass-blur) !important;
                    -webkit-backdrop-filter: var(--glass-blur) !important;
                    background: var(--glass-bg-card) !important;
                }
            }
        `;
        document.head.appendChild(style);

        const budgetCard = document.querySelector('.budget-central-card');
        const statCard = document.querySelector('.monthly-stat-card');
        const railCard = document.querySelector('.rail-card');

        return {
            budgetCard: {
                bg: window.getComputedStyle(budgetCard).backgroundColor,
                backdrop: window.getComputedStyle(budgetCard).backdropFilter
            },
            statCard: {
                bg: window.getComputedStyle(statCard).backgroundColor,
                backdrop: window.getComputedStyle(statCard).backdropFilter
            },
            railCard: {
                bg: window.getComputedStyle(railCard).backgroundColor,
                backdrop: window.getComputedStyle(railCard).backdropFilter
            }
        };
    })()
    """
    res = send('Runtime.evaluate', {'expression': inject_js, 'returnByValue': True})
    print('Computed values with universal glass on mobile:')
    print(json.dumps(res.get('result', {}).get('value', {}), indent=2))

    send('Emulation.setDeviceMetricsOverride', {
        'width': 390,
        'height': 844,
        'deviceScaleFactor': 2,
        'mobile': True
    })
    time.sleep(1)

    shot = send('Page.captureScreenshot', {'format': 'png'})
    with open('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/test_universal_glass_390.png', 'wb') as f:
        f.write(base64.b64decode(shot['data']))
    print('Screenshot saved: test_universal_glass_390.png')

    ws.close()
finally:
    proc.terminate()
    proc.wait()
