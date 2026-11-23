#!/usr/bin/env python3
"""
Performance & Responsiveness Audit Script
Profiles all views, modals, navigation, and measurements across viewports.
"""

import os
import sys
import time
import json
import subprocess
import urllib.request
import websocket

HTML_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
CHROME_BIN = '/usr/bin/google-chrome-stable'
PORT = 9460
BASE_URL = f"file://{HTML_PATH}"

def audit():
    cmd = [
        CHROME_BIN,
        '--headless=new',
        f'--remote-debugging-port={PORT}',
        '--window-size=390,844',
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=/tmp/chrome_audit_' + str(int(time.time()))
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    
    try:
        res = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json").read()
        tabs = json.loads(res.decode('utf-8'))
        ws_url = tabs[0]['webSocketDebuggerUrl']
        ws = websocket.create_connection(ws_url)
        
        msg_id = 0
        def call(method, params=None):
            nonlocal msg_id
            msg_id += 1
            msg = {"id": msg_id, "method": method}
            if params:
                msg["params"] = params
            ws.send(json.dumps(msg))
            while True:
                resp = json.loads(ws.recv())
                if resp.get("id") == msg_id:
                    return resp.get("result", {})

        def eval_js(expr):
            r = call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
            if "exceptionDetails" in r:
                raise RuntimeError(f"CDP Eval error: {r['exceptionDetails']}")
            return r.get("result", {}).get("value")

        def set_vp(w, h):
            call("Emulation.setDeviceMetricsOverride", {
                "width": w,
                "height": h,
                "deviceScaleFactor": 1,
                "mobile": w <= 768
            })
            time.sleep(0.1)

        call("Page.enable")
        call("DOM.enable")
        call("Runtime.enable")
        call("Page.navigate", {"url": BASE_URL})
        time.sleep(1.5)

        # Login and bypass onboarding into main app
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

        print("=" * 80)
        print("AUDIT: VIEW SWITCHING LATENCY & OVERFLOW ACROSS VIEWPORTS")
        print("=" * 80)

        views = ['home-view', 'transactions-view', 'analytics-view', 'reports-view', 'budgets-view', 'wallets-view', 'settings-view']
        viewports = [320, 360, 375, 390, 412, 430, 768, 1024, 1440]

        for w in viewports:
            print(f"\n--- Testing Viewport Width: {w}px ---")
            set_vp(w, 800)
            
            for v in views:
                t0 = time.time()
                eval_js(f"app.switchView('{v}')")
                duration = (time.time() - t0) * 1000
                
                scroll_w = eval_js("document.documentElement.scrollWidth")
                inner_w = eval_js("window.innerWidth")
                overflow = scroll_w > inner_w
                
                # Check for overflowing children outside intentional scroll containers
                overflow_elements = eval_js("""
                    (() => {
                        const bad = [];
                        document.querySelectorAll('*').forEach(el => {
                            let p = el.parentElement;
                            let insideScroll = false;
                            while (p && p !== document.body) {
                                const s = window.getComputedStyle(p);
                                if (s.overflowX === 'auto' || s.overflowX === 'scroll') {
                                    insideScroll = true;
                                    break;
                                }
                                p = p.parentElement;
                            }
                            if (!insideScroll && el.offsetWidth > window.innerWidth + 1 && el.offsetParent !== null) {
                                bad.push({
                                    tag: el.tagName,
                                    cls: el.className,
                                    id: el.id,
                                    w: el.offsetWidth
                                });
                            }
                        });
                        return bad.slice(0, 5);
                    })()
                """)
                
                status = "OVERFLOW!" if overflow else "OK"
                print(f"  View: {v:18s} | Latency: {duration:5.1f}ms | scrollW: {scroll_w:4d}px vs {inner_w:4d}px [{status}]")
                if overflow_elements:
                    for el in overflow_elements:
                        print(f"      -> Overflow element: <{el['tag']} id='{el['id']}' class='{el['cls']}'> width={el['w']}px")

        print("\n" + "=" * 80)
        print("AUDIT: PERFORMANCE BOTTLENECKS (BACKDROP FILTERS & COMPOSITING ON MOBILE 390PX)")
        print("=" * 80)
        set_vp(390, 844)

        perf_data = eval_js("""
            (() => {
                // Count elements with backdrop-filter computed style
                let backdropCount = 0;
                let backdropElements = [];
                let animCount = 0;
                let animElements = [];
                let willChangeCount = 0;

                document.querySelectorAll('*').forEach(el => {
                    if (el.offsetParent !== null || el.classList.contains('active')) {
                        const cs = window.getComputedStyle(el);
                        const bf = cs.backdropFilter || cs.webkitBackdropFilter;
                        if (bf && bf !== 'none') {
                            backdropCount++;
                            if (backdropElements.length < 10) {
                                backdropElements.push({ tag: el.tagName, cls: el.className, id: el.id, filter: bf });
                            }
                        }
                        const anim = cs.animationName;
                        if (anim && anim !== 'none') {
                            animCount++;
                            animElements.push({ tag: el.tagName, cls: el.className, id: el.id, anim, duration: cs.animationDuration, iter: cs.animationIterationCount });
                        }
                        if (cs.willChange && cs.willChange !== 'auto') {
                            willChangeCount++;
                        }
                    }
                });

                return {
                    totalDomNodes: document.querySelectorAll('*').length,
                    backdropCount,
                    backdropElements,
                    animCount,
                    animElements,
                    willChangeCount
                };
            })()
        """)

        print(f"  Total DOM Nodes: {perf_data['totalDomNodes']}")
        print(f"  Active elements with backdrop-filter: {perf_data['backdropCount']}")
        for b in perf_data['backdropElements'][:8]:
            print(f"    - <{b['tag']} id='{b['id']}' class='{b['cls']}'> : {b['filter']}")
        print(f"  Active CSS animations: {perf_data['animCount']}")
        for a in perf_data['animElements'][:8]:
            print(f"    - <{a['tag']} id='{a['id']}' class='{a['cls']}'> : {a['anim']} ({a['duration']}, {a['iter']})")

        print("\n" + "=" * 80)
        print("AUDIT: MODAL RESPONSIVENESS & TOUCH TARGETS")
        print("=" * 80)

        modals = [
            'transaction-modal',
            'add-wallet-modal',
            'edit-wallet-modal',
            'quick-edit-modal',
            'color-picker-modal',
            'pdf-modal',
            'category-manage-modal',
            'tx-action-selector-modal'
        ]

        set_vp(390, 844)
        for m_id in modals:
            m_info = eval_js(f"""
                (() => {{
                    const m = document.getElementById('{m_id}');
                    if (!m) return {{ exists: false }};
                    // Temporarily open
                    m.classList.add('active');
                    const card = m.querySelector('.bottom-sheet, .modal-card, .wallet-config-modal') || m.firstElementChild;
                    const rect = card ? card.getBoundingClientRect() : null;
                    const buttons = Array.from(m.querySelectorAll('button, .btn, .icon-btn')).map(b => {{
                        const r = b.getBoundingClientRect();
                        return {{ tag: b.tagName, cls: b.className, text: b.textContent.trim().slice(0, 15), w: r.width, h: r.height }};
                    }});
                    m.classList.remove('active');
                    return {{
                        exists: true,
                        rect: rect ? {{ w: rect.width, h: rect.height, top: rect.top, bottom: rect.bottom }} : null,
                        buttons: buttons.slice(0, 6)
                    }};
                }})()
            """)
            if m_info['exists']:
                rect = m_info['rect']
                print(f"  Modal: {m_id:25s} | Width: {rect['w']:5.1f}px | Height: {rect['h']:5.1f}px")
                small_btns = [b for b in m_info['buttons'] if b['h'] < 40 and b['h'] > 0]
                if small_btns:
                    for b in small_btns:
                        print(f"      [Touch Warning] Button '{b['text']}' height={b['h']:.1f}px (< 40px)")

    finally:
        try:
            ws.close()
        except:
            pass
        proc.terminate()
        proc.wait(timeout=2)

if __name__ == '__main__':
    audit()

