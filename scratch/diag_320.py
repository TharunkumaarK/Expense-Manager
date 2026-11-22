#!/usr/bin/env python3
import os
import sys
import time
import json
import subprocess
import urllib.request
import websocket

HTML_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
CHROME_BIN = '/usr/bin/google-chrome-stable'
PORT = 9488
BASE_URL = f"file://{HTML_PATH}"

cmd = [
    CHROME_BIN,
    '--headless=new',
    f'--remote-debugging-port={PORT}',
    '--window-size=320,800',
    '--no-sandbox',
    '--disable-gpu',
    '--user-data-dir=/tmp/chrome_diag_' + str(int(time.time()))
]
proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)

try:
    res = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read()
    tabs = json.loads(res.decode('utf-8'))
    ws = websocket.create_connection(tabs[0]['webSocketDebuggerUrl'])

    msg_id = 0
    def call(method, params=None):
        global msg_id
        msg_id += 1
        ws.send(json.dumps({'id': msg_id, 'method': method, 'params': params or {}}))
        while True:
            resp = json.loads(ws.recv())
            if resp.get('id') == msg_id:
                return resp.get('result', {})

    def eval_js(expr):
        r = call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in r:
            raise RuntimeError(r['exceptionDetails'])
        return r.get('result', {}).get('value')

    call('Page.enable')
    call('Page.navigate', {'url': BASE_URL})
    time.sleep(1.5)

    eval_js("""
        (() => {
            localStorage.clear();
            storage.resetState && storage.resetState();
            storage.state.onboardingCompleted = true;
            storage.saveData();
            app.init();
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('onboarding-screen').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
            app.switchView('home-view');
        })()
    """)
    time.sleep(0.5)

    call('Emulation.setDeviceMetricsOverride', {'width': 320, 'height': 800, 'deviceScaleFactor': 1, 'mobile': True})
    time.sleep(0.2)

    for v in ['reports-view', 'analytics-view']:
        eval_js(f"app.switchView('{v}')")
        time.sleep(0.2)
        sw = eval_js("document.documentElement.scrollWidth")
        data = eval_js('''
            (() => {
                const els = document.querySelectorAll('*');
                const out = [];
                els.forEach(el => {
                    const r = el.getBoundingClientRect();
                    if (r.right > 321 && el.offsetParent !== null) {
                        out.push({
                            tag: el.tagName,
                            id: el.id,
                            cls: (el.className || '').toString().slice(0, 30),
                            w: Math.round(r.width),
                            right: Math.round(r.right),
                            parentTag: el.parentElement ? el.parentElement.tagName : null,
                            parentId: el.parentElement ? el.parentElement.id : null,
                            parentCls: el.parentElement ? (el.parentElement.className || '').toString().slice(0, 30) : null
                        });
                    }
                });
                return out;
            })()
        ''')
        print(f"\n=== OVERFLOW NODES IN {v} (scrollWidth: {sw}px) ===")
        for d in data[:10]:
            print(f"  <{d['tag']} id='{d['id']}' class='{d['cls']}'> w={d['w']} right={d['right']} | in <{d['parentTag']} id='{d['parentId']}' class='{d['parentCls']}'>")

finally:
    try:
        ws.close()
    except:
        pass
    proc.terminate()
    proc.wait(timeout=2)
