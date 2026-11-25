import os
import sys
import time
import json
import base64
import shutil
import threading
import subprocess
import http.server
import socketserver
import urllib.request
import websocket

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
EVIDENCE_DIR = os.path.join(WORKSPACE_DIR, 'scratch', 'phase2-hotfix-evidence')
HTTP_PORT = 9538
CDP_PORT = 9539


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WORKSPACE_DIR, **kwargs)

    def log_message(self, format, *args):
        pass


def start_http_server():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", HTTP_PORT), QuietHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def run_browser_verification():
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    httpd = start_http_server()
    print(f"HTTP server started at http://127.0.0.1:{HTTP_PORT}")

    user_data_dir = f"/tmp/chrome_phase2_hotfix_{int(time.time())}"
    chrome_cmd = [
        '/usr/bin/google-chrome-stable',
        '--headless=new',
        f'--remote-debugging-port={CDP_PORT}',
        '--window-size=1440,900',
        '--no-sandbox',
        '--disable-gpu',
        f'--user-data-dir={user_data_dir}'
    ]
    chrome_proc = subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)

    try:
        res = urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json").read()
        pages = json.loads(res.decode('utf-8'))
        ws_url = pages[0]['webSocketDebuggerUrl']
        ws = websocket.create_connection(ws_url, timeout=15)

        msg_id = 0
        console_errors = []
        js_exceptions = []

        def record_event(msg):
            method = msg.get("method")
            params = msg.get("params", {})
            if method == "Runtime.exceptionThrown":
                details = params.get("exceptionDetails", {})
                text = details.get("text") or ""
                exc = details.get("exception", {}).get("description") or ""
                js_exceptions.append(f"{text} {exc}".strip())
            elif method == "Runtime.consoleAPICalled" and params.get("type") == "error":
                args = " ".join(str(a.get("value") or a.get("description") or "") for a in params.get("args", []))
                console_errors.append(args)

        def call(method, params=None):
            nonlocal msg_id
            msg_id += 1
            ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
            while True:
                resp = json.loads(ws.recv())
                if "method" in resp and "id" not in resp:
                    record_event(resp)
                    continue
                if resp.get("id") == msg_id:
                    if "error" in resp:
                        raise RuntimeError(f"CDP error for {method}: {resp['error']}")
                    return resp.get("result", {})

        def eval_js(expr):
            r = call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
            if r.get("exceptionDetails"):
                raise RuntimeError(f"JS exception: {r['exceptionDetails']}")
            return r.get("result", {}).get("value")

        def set_viewport(w, h, scale=2):
            call("Emulation.setDeviceMetricsOverride", {
                "width": w,
                "height": h,
                "deviceScaleFactor": scale,
                "mobile": w <= 768
            })
            time.sleep(0.25)

        def capture_screen(filename):
            path = os.path.join(EVIDENCE_DIR, filename)
            res = call("Page.captureScreenshot", {"format": "png"})
            data = res.get("data")
            assert data, f"Failed to capture screenshot {filename}"
            raw_bytes = base64.b64decode(data)
            with open(path, "wb") as f:
                f.write(raw_bytes)
            print(f"  [SHOT] {filename} ({len(raw_bytes)} bytes)")

        def press_key(key, code, vk, text=None):
            payload = {
                "type": "rawKeyDown",
                "key": key,
                "code": code,
                "windowsVirtualKeyCode": vk,
                "nativeVirtualKeyCode": vk
            }
            if text is not None:
                payload["text"] = text
                payload["unmodifiedText"] = text
            call("Input.dispatchKeyEvent", payload)
            if text is not None:
                call("Input.dispatchKeyEvent", {
                    "type": "char",
                    "key": key,
                    "code": code,
                    "text": text,
                    "unmodifiedText": text,
                    "windowsVirtualKeyCode": vk,
                    "nativeVirtualKeyCode": vk
                })
            call("Input.dispatchKeyEvent", {
                "type": "keyUp",
                "key": key,
                "code": code,
                "windowsVirtualKeyCode": vk,
                "nativeVirtualKeyCode": vk
            })
            time.sleep(0.15)

        def click_element_center(selector):
            box = eval_js(f"""(() => {{
                const el = document.querySelector({json.dumps(selector)});
                if (!el) return null;
                el.scrollIntoView({{ behavior: 'instant', block: 'center' }});
                const r = el.getBoundingClientRect();
                return {{ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }};
            }})()""")
            assert box and box['w'] > 0 and box['h'] > 0, f"Element not clickable: {selector}"
            call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box['x'], "y": box['y'], "button": "left", "clickCount": 1})
            call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box['x'], "y": box['y'], "button": "left", "clickCount": 1})
            time.sleep(0.2)

        call("Page.enable")
        call("Page.bringToFront")
        call("Runtime.enable")
        call("DOM.enable")

        print("Navigating to application...")
        call("Page.navigate", {"url": f"http://127.0.0.1:{HTTP_PORT}/index.html"})
        time.sleep(1.8)

        # Seed synthetic multi-country financial state
        eval_js("""(() => {
            localStorage.clear();
            storage.state.onboardingCompleted = true;
            storage.setActiveCountries(['JP', 'IN', 'DE']);
            storage.setPrimaryCountry('JP');
            storage.state.currentMonthKey = '2026-11';
            storage.state.jpTotalBudget = 150000;
            storage.state.inTotalBudget = 45000;
            storage.state.wallets = {
                'w-jp-bank': { id: 'w-jp-bank', name: 'Japan Bank', balance: 350000, region: 'JP', currency: '¥', type: 'bank', theme: 'emerald-salary' },
                'w-in-bank': { id: 'w-in-bank', name: 'India Bank', balance: 85000, region: 'IN', currency: '₹', type: 'bank', theme: 'burgundy-axis' },
                'w-de-bank': { id: 'w-de-bank', name: 'German Bank', balance: 3200, region: 'DE', currency: '€', type: 'bank', theme: 'frankfurt-slate' }
            };
            storage.state.budgets = {
                JP: { enabled: true, monthlyTotal: 150000, rolloverEnabled: false, carryover: 0 },
                IN: { enabled: true, monthlyTotal: 45000, rolloverEnabled: false, carryover: 0 },
                DE: { enabled: true, monthlyTotal: 1800, rolloverEnabled: false, carryover: 0 }
            };
            storage.state.categories = {
                JP: [
                    { id: 'jp-food', name: 'Food & Groceries', icon: 'shopping-basket', budget: 45000, isActive: true, contributesToTotalBudget: true },
                    { id: 'jp-misc', name: 'Miscellaneous', icon: 'wrench', budget: 15000, isActive: true, contributesToTotalBudget: true }
                ],
                IN: [
                    { id: 'in-ration', name: 'Ration & Groceries', icon: 'shopping-basket', budget: 15000, isActive: true, contributesToTotalBudget: true }
                ],
                DE: [
                    { id: 'de-groceries', name: 'Groceries & Supermarket', icon: 'shopping-basket', budget: 550, isActive: true, contributesToTotalBudget: true },
                    { id: 'de-dining', name: 'Dining & Cafes', icon: 'utensils', budget: 250, isActive: true, contributesToTotalBudget: true }
                ]
            };
            storage.state.analyticsExclusions = ['jp-misc'];
            storage.state.closedMonths = {
                '2026-10': {
                    monthKey: '2026-10',
                    status: 'closed',
                    jpTotalBudget: 150000,
                    inTotalBudget: 40000,
                    deTotalBudget: 1600,
                    categoriesSnapshot: {
                        JP: [{ id: 'jp-food', budget: 45000 }],
                        IN: [{ id: 'in-ration', budget: 15000 }],
                        DE: [{ id: 'de-groceries', budget: 500 }]
                    }
                }
            };
            storage.state.transactions = [
                { id: 'tx-jp-1', type: 'income', walletId: 'w-jp-bank', amount: 320000, date: '2026-11-01', region: 'JP', note: 'Tokyo salary' },
                { id: 'tx-jp-2', type: 'expense', walletId: 'w-jp-bank', categoryId: 'jp-food', amount: 28000, date: '2026-11-08', region: 'JP', note: 'Tokyo market' },
                { id: 'tx-jp-3', type: 'expense', walletId: 'w-jp-bank', categoryId: 'jp-misc', amount: 9000, date: '2026-11-09', region: 'JP', note: 'Misc item' },
                { id: 'tx-in-1', type: 'income', walletId: 'w-in-bank', amount: 95000, date: '2026-11-02', region: 'IN', note: 'Consulting' },
                { id: 'tx-in-2', type: 'expense', walletId: 'w-in-bank', categoryId: 'in-ration', amount: 11500, date: '2026-11-10', region: 'IN', note: 'Groceries' },
                { id: 'tx-de-1', type: 'income', walletId: 'w-de-bank', amount: 3800, date: '2026-11-03', region: 'DE', note: 'Berlin stipend' },
                { id: 'tx-de-2', type: 'expense', walletId: 'w-de-bank', categoryId: 'de-groceries', amount: 410, date: '2026-11-11', region: 'DE', note: 'REWE Markt' },
                { id: 'tx-de-3', type: 'expense', walletId: 'w-de-bank', categoryId: 'de-dining', amount: 95, date: '2026-11-12', region: 'DE', note: 'Cafe Mitte' },
                { id: 'tx-jp-oct', type: 'expense', walletId: 'w-jp-bank', categoryId: 'jp-food', amount: 42000, date: '2026-10-15', region: 'JP', note: 'Oct groceries' },
                { id: 'tx-de-oct', type: 'expense', walletId: 'w-de-bank', categoryId: 'de-groceries', amount: 390, date: '2026-10-16', region: 'DE', note: 'Oct REWE' }
            ];
            storage.saveData();
            app.init();
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('onboarding-screen').style.display = 'none';
            document.getElementById('app-content').style.display = 'block';
            app.isPrivacyHidden = false;
        })()""")
        time.sleep(0.5)

        # ----------------------------------------------------------------------
        # 1. Reports currencies (JP, IN, DE) + Print/PDF presentation
        # ----------------------------------------------------------------------
        print("\n[Browser 1] Verifying JP, IN, DE Reports & Print/PDF currencies...")
        set_viewport(1440, 900, scale=1.5)
        eval_js("app.switchView('reports-view'); app.reportMonthKey = '2026-11'; app.renderReportsPage();")
        time.sleep(0.3)

        for code, sym, iso, expected_amt in [('JP', '¥', 'JPY', '320,000'), ('IN', '₹', 'INR', '95,000'), ('DE', '€', 'EUR', '3.800')]:
            eval_js(f"app.setReportRegion('{code}')")
            time.sleep(0.25)
            rep_state = eval_js("""(() => {
                const hero = document.getElementById('report-snapshot-hero')?.innerText || '';
                const badge = document.getElementById('report-pie-period-badge')?.innerText || '';
                window._capturedPrintHtml = '';
                window.print = () => {
                    window._capturedPrintHtml = document.getElementById('print-container')?.innerHTML || '';
                };
                app.printCurrentReport();
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve({ hero, badge, printHtml: window._capturedPrintHtml });
                    }, 500);
                });
            })()""")
            assert sym in rep_state['hero'] and expected_amt in rep_state['hero'], f"Reports hero missing {sym}{expected_amt} for {code}: hero={rep_state['hero']!r}, badge={rep_state['badge']!r}"
            assert iso in rep_state['badge'], f"Reports pie badge missing {iso} for {code}: {rep_state['badge']}"
            assert sym in rep_state['printHtml'], f"Print HTML missing {sym} for {code}"
            if code == 'DE':
                assert 'Germany Portfolio (EUR €)' in rep_state['printHtml'], "DE print missing Germany Portfolio (EUR €)"
                assert '₹' not in rep_state['printHtml'], "DE print leaked ₹"
            elif code == 'JP':
                assert 'Japan Portfolio (JPY ¥)' in rep_state['printHtml']
            elif code == 'IN':
                assert 'India Portfolio (INR ₹)' in rep_state['printHtml']
            print(f"  [PASS] Reports & Print verified for {code} ({iso} {sym})")

        eval_js("app.setReportRegion('DE');")
        time.sleep(1.1)
        capture_screen("reports_de_1440.png")

        # 1b. Custom Date-Range Report & Custom PDF Export (JP, IN, DE)
        print("\n[Browser 1b] Verifying Custom Date-Range Report & Custom PDF Export...")
        custom_res = eval_js("""(() => {
            document.getElementById('report-custom-start').value = '2026-11-01';
            document.getElementById('report-custom-end').value = '2026-11-30';
            document.getElementById('report-custom-region').value = 'ALL';
            document.getElementById('report-custom-wallet').value = 'ALL';
            document.getElementById('report-custom-category').value = 'ALL';
            app.generateCustomRangeReport();
            const resultsHtml = document.getElementById('report-custom-results')?.innerHTML || '';
            window._capturedCustomPdf = '';
            window.print = () => {
                window._capturedCustomPdf = document.getElementById('print-container')?.innerHTML || '';
            };
            app.exportCustomReportPdf();
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve({ resultsHtml, pdfHtml: window._capturedCustomPdf });
                }, 500);
            });
        })()""")
        assert custom_res['resultsHtml'].count('Japan (JPY ¥)') == 1, "Custom report Japan summary count != 1"
        assert custom_res['resultsHtml'].count('India (INR ₹)') == 1, "Custom report India summary count != 1"
        assert custom_res['resultsHtml'].count('Germany (EUR €)') == 1, "Custom report Germany summary count != 1"
        assert custom_res['pdfHtml'].count('Japan Portfolio (JPY ¥)') == 1, "Custom PDF Japan header count != 1"
        assert custom_res['pdfHtml'].count('India Portfolio (INR ₹)') == 1, "Custom PDF India header count != 1"
        assert custom_res['pdfHtml'].count('Germany Portfolio (EUR €)') == 1, "Custom PDF Germany header count != 1"
        assert '€3.800' in custom_res['pdfHtml'] and '¥320,000' in custom_res['pdfHtml'] and '₹95,000' in custom_res['pdfHtml'], "Custom PDF missing expected regional totals"
        print("  [PASS] Custom Date-Range Report & Custom PDF verified with independent JP/IN/DE sections")

        # ----------------------------------------------------------------------
        # 2. Reports Country Selector: 1, 2, 3 enabled countries & navigation persistence
        # ----------------------------------------------------------------------
        print("\n[Browser 2] Verifying Reports Country Selector combinations & persistence...")
        # 1 country: ['DE']
        eval_js("""(() => {
            storage.setActiveCountries(['DE']);
            storage.setPrimaryCountry('DE');
            app.reportRegion = null;
            app.renderReportsPage();
        })()""")
        time.sleep(0.2)
        sel_1 = eval_js("getComputedStyle(document.getElementById('report-country-selector')).display")
        assert sel_1 == 'none', f"1-country selector should be hidden, got {sel_1}"

        # 2 countries: ['JP', 'DE']
        eval_js("""(() => {
            storage.setActiveCountries(['JP', 'DE']);
            storage.setPrimaryCountry('JP');
            app.reportRegion = 'DE';
            app.renderReportsPage();
        })()""")
        time.sleep(0.2)
        vis_2a = eval_js("""(() => {
            const s = document.getElementById('report-country-selector');
            const jp = document.getElementById('report-tab-jp');
            const inp = document.getElementById('report-tab-in');
            const de = document.getElementById('report-tab-de');
            return {
                sel: getComputedStyle(s).display,
                jp: getComputedStyle(jp).display,
                inDisplay: getComputedStyle(inp).display,
                de: getComputedStyle(de).display,
                jpActive: jp.classList.contains('active'),
                deActive: de.classList.contains('active')
            };
        })()""")
        assert vis_2a['sel'] == 'flex' and vis_2a['jp'] != 'none' and vis_2a['de'] != 'none' and vis_2a['inDisplay'] == 'none', f"JP+DE visibility mismatch: {vis_2a}"
        assert vis_2a['deActive'] and not vis_2a['jpActive'], f"JP+DE active mismatch: {vis_2a}"

        # 2 countries: ['IN', 'DE']
        eval_js("""(() => {
            storage.setActiveCountries(['IN', 'DE']);
            storage.setPrimaryCountry('IN');
            app.reportRegion = 'IN';
            app.renderReportsPage();
        })()""")
        time.sleep(0.2)
        vis_2b = eval_js("""(() => {
            const jp = document.getElementById('report-tab-jp');
            const inp = document.getElementById('report-tab-in');
            const de = document.getElementById('report-tab-de');
            return {
                jp: getComputedStyle(jp).display,
                inDisplay: getComputedStyle(inp).display,
                de: getComputedStyle(de).display,
                inActive: inp.classList.contains('active'),
                deActive: de.classList.contains('active')
            };
        })()""")
        assert vis_2b['jp'] == 'none' and vis_2b['inDisplay'] != 'none' and vis_2b['de'] != 'none', f"IN+DE visibility mismatch: {vis_2b}"
        assert vis_2b['inActive'] and not vis_2b['deActive'], f"IN+DE active mismatch: {vis_2b}"

        # 3 countries: click DE, navigate away, return
        eval_js("""(() => {
            storage.setActiveCountries(['JP', 'IN', 'DE']);
            storage.setPrimaryCountry('JP');
            app.reportRegion = 'JP';
            app.renderReportsPage();
        })()""")
        time.sleep(0.2)
        click_element_center("#report-tab-de")
        eval_js("app.switchView('home-view');")
        time.sleep(0.2)
        eval_js("app.switchView('reports-view');")
        time.sleep(0.2)
        persist_res = eval_js("""(() => ({
            region: app.reportRegion,
            jpActive: document.getElementById('report-tab-jp').classList.contains('active'),
            inActive: document.getElementById('report-tab-in').classList.contains('active'),
            deActive: document.getElementById('report-tab-de').classList.contains('active')
        }))()""")
        assert persist_res['region'] == 'DE' and persist_res['deActive'] and not persist_res['jpActive'] and not persist_res['inActive'], f"Region persistence failed: {persist_res}"
        print("  [PASS] 1, 2, 3 enabled-country combinations & navigation persistence verified")

        # ----------------------------------------------------------------------
        # 3. Reports More Actions: opening, dismissal (outside click + Escape), keyboard
        # ----------------------------------------------------------------------
        print("\n[Browser 3] Verifying Reports More Actions keyboard & dismissal...")
        eval_js("document.getElementById('btn-reports-more-actions').scrollIntoView({block:'center'}); document.getElementById('btn-reports-more-actions').focus();")
        focused_id = eval_js("document.activeElement ? document.activeElement.id : null")
        assert focused_id == 'btn-reports-more-actions', f"Could not focus btn-reports-more-actions, got {focused_id}"
        press_key("Enter", "Enter", 13, text="\r")
        opened = eval_js("document.getElementById('reports-more-actions').hasAttribute('open')")
        assert opened is True, "Enter key did not open #reports-more-actions"

        menu_styles = eval_js("""(() => {
            const menu = document.querySelector('#reports-more-actions .reports-more-actions-menu');
            const cs = getComputedStyle(menu);
            const r = menu.getBoundingClientRect();
            return { position: cs.position, zIndex: cs.zIndex, display: cs.display, rect: { width: r.width, height: r.height } };
        })()""")
        assert menu_styles['position'] == 'absolute' and menu_styles['zIndex'] == '50' and menu_styles['rect']['height'] > 0, f"Menu CSS unexpected: {menu_styles}"
        capture_screen("reports_more_actions_open_1440.png")

        # Escape dismissal
        press_key("Escape", "Escape", 27)
        after_esc = eval_js("""(() => ({
            open: document.getElementById('reports-more-actions').hasAttribute('open'),
            activeId: document.activeElement ? document.activeElement.id : null
        }))()""")
        assert after_esc['open'] is False and after_esc['activeId'] == 'btn-reports-more-actions', f"Escape dismissal failed: {after_esc}"

        # Re-open and outside-click dismissal
        click_element_center("#btn-reports-more-actions")
        assert eval_js("document.getElementById('reports-more-actions').hasAttribute('open')") is True
        click_element_center(".reports-snapshot-banner")
        assert eval_js("document.getElementById('reports-more-actions').hasAttribute('open')") is False, "Outside click did not close #reports-more-actions"
        print("  [PASS] Reports More Actions keyboard open, Escape close, and outside-click dismiss verified")

        # ----------------------------------------------------------------------
        # 4. Historical closed-month budget rendering when current budgeting disabled
        # ----------------------------------------------------------------------
        print("\n[Browser 4] Verifying historical closed-month budget when live budgeting is disabled...")
        eval_js("""(() => {
            storage.state.budgets.JP.enabled = false;
            storage.state.budgets.DE.enabled = false;
            app.reportRegion = 'JP';
            app.reportMonthKey = '2026-10';
            app.renderReportsPage();
        })()""")
        time.sleep(0.25)
        hist_jp = eval_js("""(() => {
            const hero = document.getElementById('report-snapshot-hero');
            return {
                hasCard: !!hero.querySelector('.reports-budget-perf-card'),
                hasTrack: !!hero.querySelector('.budget-streak-fill'),
                hasDisabledMsg: hero.innerText.includes('Budgeting is turned off for this region')
            };
        })()""")
        assert hist_jp['hasCard'] and hist_jp['hasTrack'] and not hist_jp['hasDisabledMsg'], f"JP historical budget check failed: {hist_jp}"

        eval_js("app.setReportRegion('DE');")
        time.sleep(0.25)
        hist_de = eval_js("""(() => {
            const hero = document.getElementById('report-snapshot-hero');
            return {
                hasCard: !!hero.querySelector('.reports-budget-perf-card'),
                hasTrack: !!hero.querySelector('.budget-streak-fill'),
                hasEuro: hero.innerText.includes('€390') && (hero.innerText.includes('1.210') || hero.innerText.includes('1,210')),
                hasDisabledMsg: hero.innerText.includes('Budgeting is turned off for this region')
            };
        })()""")
        assert hist_de['hasCard'] and hist_de['hasTrack'] and hist_de['hasEuro'] and not hist_de['hasDisabledMsg'], f"DE historical budget check failed: {hist_de}"
        print("  [PASS] Historical closed-month budget rendering verified for JP and DE")

        # ----------------------------------------------------------------------
        # 5. Settings Help navigation, accordion expansion & copy check
        # ----------------------------------------------------------------------
        print("\n[Browser 5] Verifying Settings Help navigation & accordion...")
        eval_js("app.switchView('settings-view');")
        time.sleep(0.2)
        click_element_center('.settings-tab-btn[data-section="help"]')
        time.sleep(0.2)
        help_init = eval_js("""(() => {
            const sec = document.getElementById('settings-sec-help');
            const items = Array.from(document.querySelectorAll('.settings-help-item'));
            return {
                active: sec.classList.contains('active'),
                count: items.length,
                anyOpen: items.some(i => i.open)
            };
        })()""")
        assert help_init['active'] and help_init['count'] == 6 and not help_init['anyOpen'], f"Help initial state failed: {help_init}"

        click_element_center('#help-topic-remittances summary')
        time.sleep(0.25)
        remit_check = eval_js("""(() => {
            const item = document.getElementById('help-topic-remittances');
            const chev = item.querySelector('.help-chevron');
            return {
                open: item.open,
                text: item.innerText,
                chevronTransform: getComputedStyle(chev).transform
            };
        })()""")
        assert remit_check['open'] is True, "Topic 3 did not expand on click"
        assert 'cannot be determined reliably unless additional fee information is supplied' in remit_check['text'], "Topic 3 missing updated fee disclaimer"
        assert 'effective exchange rate and bank transfer fee are calculated' not in remit_check['text'], "Topic 3 still has old misleading text"
        assert remit_check['chevronTransform'] != 'none', "Help chevron did not rotate when open"
        capture_screen("settings_help_1440.png")

        # ----------------------------------------------------------------------
        # 6. Analytics exclusion filters & persistence
        # ----------------------------------------------------------------------
        print("\n[Browser 6] Verifying Analytics exclusion filters & persistence...")
        eval_js("app.switchView('analytics-view'); app.setAnalyticsCountry('JP');")
        time.sleep(0.25)
        cust_init = eval_js("document.getElementById('analytics-customize-analysis').open")
        assert cust_init is False, "Analytics Customize Analysis should start collapsed"
        click_element_center('#analytics-customize-analysis summary')
        time.sleep(0.2)

        before_excl = eval_js("""(() => ({
            exclusions: Array.from(app.jpExclusions || []),
            total: document.getElementById('jp-stat-total-expenses')?.innerText,
            analytical: document.getElementById('jp-stat-analytical-expenses')?.innerText
        }))()""")
        # Toggle first exclusion pill (jp-food)
        click_element_center('#jp-exclusions-chips .exclusion-pill')
        time.sleep(0.25)
        after_excl = eval_js("""(() => ({
            exclusions: Array.from(app.jpExclusions || []),
            stored: [...(storage.state.analyticsExclusions || [])],
            total: document.getElementById('jp-stat-total-expenses')?.innerText,
            analytical: document.getElementById('jp-stat-analytical-expenses')?.innerText
        }))()""")
        assert after_excl['exclusions'] != before_excl['exclusions'], "Exclusion toggle did not change jpExclusions"
        assert after_excl['total'] == before_excl['total'], "Analytical exclusion must NOT alter total expenses"
        assert after_excl['analytical'] != before_excl['analytical'], f"Analytical expenses did not update: {before_excl['analytical']} -> {after_excl['analytical']}"

        # Navigate away and back to confirm persistence
        eval_js("app.switchView('home-view');")
        time.sleep(0.15)
        eval_js("app.switchView('analytics-view');")
        time.sleep(0.2)
        persisted_excl = eval_js("JSON.parse(localStorage.getItem(storage.getActiveStorageKey()) || '{}').analyticsExclusions || []")
        assert set(persisted_excl) == set(after_excl['exclusions']), f"Analytics exclusions did not persist: {persisted_excl} vs {after_excl['exclusions']}"
        capture_screen("analytics_customize_1440.png")
        print("  [PASS] Analytics exclusion toggle & persistence verified")

        # ----------------------------------------------------------------------
        # 7. Responsive checks at 360px, 390px, 430px, 1440px
        # ----------------------------------------------------------------------
        print("\n[Browser 7] Verifying responsive layouts at 360px, 390px, 430px, 1440px...")
        viewports = [(360, 780), (390, 844), (430, 932), (1440, 900)]
        for w, h in viewports:
            set_viewport(w, h, scale=2 if w < 768 else 1.5)
            # Reports view
            eval_js("app.switchView('reports-view'); app.reportMonthKey = '2026-11'; app.setReportRegion('DE');")
            time.sleep(0.2)
            rep_overflow = eval_js("document.documentElement.scrollWidth - window.innerWidth")
            assert rep_overflow <= 1, f"Horizontal overflow on reports-view at {w}px: {rep_overflow}px"
            if w in (360, 390, 430):
                capture_screen(f"responsive_{w}_reports.png")

            # Analytics view (with Customize Analysis expanded)
            eval_js("app.switchView('analytics-view'); document.getElementById('analytics-customize-analysis').open = true;")
            time.sleep(0.2)
            ana_overflow = eval_js("document.documentElement.scrollWidth - window.innerWidth")
            assert ana_overflow <= 1, f"Horizontal overflow on analytics-view at {w}px: {ana_overflow}px"
            if w in (360, 390, 430):
                capture_screen(f"responsive_{w}_analytics.png")

            # Settings Help view
            eval_js("app.switchView('settings-view'); app.switchSettingsSection('help'); document.getElementById('help-topic-remittances').open = true;")
            time.sleep(0.2)
            set_overflow = eval_js("document.documentElement.scrollWidth - window.innerWidth")
            assert set_overflow <= 1, f"Horizontal overflow on settings-view at {w}px: {set_overflow}px"
            if w in (360, 390, 430):
                capture_screen(f"responsive_{w}_settings_help.png")

            print(f"  [PASS] {w}x{h}: zero horizontal overflow across Reports, Analytics, Settings Help")

        assert len(js_exceptions) == 0, f"Uncaught JS exceptions observed: {js_exceptions}"
        assert len(console_errors) == 0, f"Console errors observed: {console_errors}"
        print(f"  [PASS] Zero JS exceptions and zero console errors across entire browser session")

        ws.close()
        print("\n[SUCCESS] All browser verification checks passed!")

    finally:
        chrome_proc.terminate()
        try:
            chrome_proc.wait(timeout=3)
        except Exception:
            chrome_proc.kill()
        httpd.shutdown()
        shutil.rmtree(user_data_dir, ignore_errors=True)
        print("Cleaned up Chrome and HTTP server.")


if __name__ == '__main__':
    run_browser_verification()
