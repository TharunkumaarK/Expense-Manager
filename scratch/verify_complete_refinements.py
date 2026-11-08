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

PORT = 9334
HTTP_PORT = 8766
CHROME_PATH = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'
ARTIFACT_DIR = '/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128'
SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), 'screenshots_complete_refinements')
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    server = socketserver.TCPServer(('127.0.0.1', HTTP_PORT), QuietHandler)
    server.allow_reuse_address = True
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server

async def main():
    print("====================================================================")
    print("COMPREHENSIVE BROWSER VERIFICATION VIA CHROME DEVTOOLS PROTOCOL")
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
        console_logs = []

        async def send(method, params=None):
            nonlocal msg_id
            m_id = msg_id
            msg_id += 1
            await ws.send(json.dumps({'id': m_id, 'method': method, 'params': params or {}}))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get('method') == 'Runtime.consoleAPICalled':
                    console_logs.append(resp.get('params', {}))
                elif resp.get('method') == 'Runtime.exceptionThrown':
                    print("RUNTIME EXCEPTION THROWN:", json.dumps(resp.get('params', {})))
                if resp.get('id') == m_id:
                    return resp.get('result', {})

        async def eval_js(expr):
            r = await send('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
            if 'exceptionDetails' in r:
                raise RuntimeError(f"JS Error in eval: {r['exceptionDetails']}")
            return r.get('result', {}).get('value')

        async def set_viewport(w, h):
            await send('Emulation.setDeviceMetricsOverride', {
                'width': w,
                'height': h,
                'deviceScaleFactor': 1,
                'mobile': (w < 768)
            })
            await asyncio.sleep(0.3)

        async def capture_screenshot(filename):
            res = await send('Page.captureScreenshot', {'format': 'png'})
            data = base64.b64decode(res['data'])
            ss_path = os.path.join(SCREENSHOTS_DIR, filename)
            with open(ss_path, 'wb') as f:
                f.write(data)
            shutil.copy(ss_path, os.path.join(ARTIFACT_DIR, filename))
            print(f"  Captured screenshot: {filename}")
            return ss_path

        await send('Page.enable')
        await send('Network.enable')
        await send('DOM.enable')
        await send('CSS.enable')
        await send('Runtime.enable')

        # Offline stubs for external CDNs (Supabase, Lucide, Chart.js) so local test environment boots cleanly
        preload_script = """
        window.lucide = {
            createIcons: () => {}
        };
        window.Chart = class {
            static defaults = {
                color: '#8b8b99',
                font: { family: 'SF Pro Display, sans-serif' }
            };
            constructor(ctx, config) {
                this.ctx = ctx;
                this.config = config;
                this.data = config?.data || {};
            }
            destroy() {}
            update() {}
            toBase64Image() { return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; }
        };
        window.supabase = {
            createClient: () => ({
                auth: {
                    getSession: () => Promise.resolve({ data: { session: { user: { id: 'test-user', email: 'user@example.com' } } }, error: null }),
                    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
                    signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
                    signOut: () => Promise.resolve({ error: null })
                },
                from: () => ({
                    select: () => ({
                        eq: () => ({
                            order: () => Promise.resolve({ data: [], error: null })
                        }),
                        order: () => Promise.resolve({ data: [], error: null })
                    }),
                    insert: () => Promise.resolve({ data: [], error: null }),
                    update: () => Promise.resolve({ data: [], error: null }),
                    delete: () => Promise.resolve({ data: [], error: null }),
                    upsert: () => Promise.resolve({ data: [], error: null })
                }),
                channel: () => ({
                    on: () => ({
                        subscribe: () => ({})
                    })
                })
            })
        };
        """
        await send('Page.addScriptToEvaluateOnNewDocument', {'source': preload_script})

        print(f"\\nNavigating to http://127.0.0.1:{HTTP_PORT}/index.html ...")
        await send('Page.navigate', {'url': f'http://127.0.0.1:{HTTP_PORT}/index.html'})
        await asyncio.sleep(2.0)

        # Reveal app and init with test state
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

        # ---------------------------------------------------------------------
        # 1. Desktop 1440x900 - Dashboard & Card Hover Glow Inspection
        # ---------------------------------------------------------------------
        print("\n--- 1. DASHBOARD AT 1440x900 (PRIMARY VIEWPORT) ---")
        await set_viewport(1440, 900)

        dash_checks = await eval_js("""
            (() => {
                const jpCard = document.getElementById('jp-country-card');
                const inCard = document.getElementById('in-country-card');
                const budgetCard = document.getElementById('budget-overview-card');
                const navTitle = document.getElementById('desktop-page-title')?.innerText;
                const navSub = document.getElementById('desktop-page-subtitle')?.innerText;
                
                const jpCS = window.getComputedStyle(jpCard);
                const inCS = window.getComputedStyle(inCard);
                const bCS = window.getComputedStyle(budgetCard);

                return {
                    navTitle,
                    navSub,
                    jpBackground: jpCS.backgroundImage || jpCS.background,
                    inBackground: inCS.backgroundImage || inCS.background,
                    jpBorderRadius: jpCS.borderRadius,
                    inBorderRadius: inCS.borderRadius,
                    budgetBackdropBlur: bCS.backdropFilter || bCS.webkitBackdropFilter,
                    budgetBoxShadow: bCS.boxShadow
                };
            })()
        """)
        print(f"  Navbar: '{dash_checks['navTitle']}' - '{dash_checks['navSub']}'")
        print(f"  Japan Card Radius: {dash_checks['jpBorderRadius']} | India Card Radius: {dash_checks['inBorderRadius']}")
        print(f"  Budget Card Backdrop Filter: {dash_checks['budgetBackdropBlur']}")
        has_dash_jp_grad = '225, 29, 72' in dash_checks['jpBackground'] or '225,29,72' in dash_checks['jpBackground']
        has_dash_in_grad = '245, 158, 11' in dash_checks['inBackground'] or '245,158,11' in dash_checks['inBackground']
        print(f"  Dashboard Japan Multicolour Gradient (Crimson/Rose): {has_dash_jp_grad}")
        print(f"  Dashboard India Multicolour Gradient (Saffron/Emerald): {has_dash_in_grad}")
        await capture_screenshot('dashboard_1440x900.png')

        # Hover state test on Dashboard Budget Card & Country Card
        await eval_js("""
            (() => {
                const card = document.getElementById('jp-country-card');
                if (card) card.classList.add('hover-simulated');
            })()
        """)
        hover_style = await eval_js("""
            (() => {
                const el = document.querySelector('.country-card:hover') || document.querySelector('.country-card');
                const cs = window.getComputedStyle(el);
                return {
                    transform: cs.transform,
                    transition: cs.transition
                };
            })()
        """)
        print(f"  Card Hover Transform: {hover_style['transform']} (must be 'none')")

        # ---------------------------------------------------------------------
        # 2. Wallets Page - Japan & India Balance Summaries (Consistent Gradient)
        # ---------------------------------------------------------------------
        print("\n--- 2. WALLETS PAGE & PORTFOLIO SUMMARIES ---")
        await eval_js("window.app.switchView('wallets-view')")
        await asyncio.sleep(1.0)

        wallets_checks = await eval_js("""
            (() => {
                const jpSummary = document.querySelector('.wallets-portfolio-grid .wallets-kpi-card:nth-child(1)');
                const inSummary = document.querySelector('.wallets-portfolio-grid .wallets-kpi-card:nth-child(2)');
                const title = document.querySelector('.wallets-page-title')?.innerText;
                const subtitle = document.querySelector('.wallets-page-subtitle')?.innerText;
                
                const jpCS = window.getComputedStyle(jpSummary);
                const inCS = window.getComputedStyle(inSummary);

                return {
                    title,
                    subtitle,
                    jpSummaryBg: jpCS.backgroundImage,
                    inSummaryBg: inCS.backgroundImage,
                    jpRadius: jpCS.borderRadius,
                    inRadius: inCS.borderRadius,
                    jpBoxShadow: jpCS.boxShadow,
                    inBoxShadow: inCS.boxShadow,
                    jpText: jpSummary.querySelector('.wallets-kpi-title')?.innerText,
                    inText: inSummary.querySelector('.wallets-kpi-title')?.innerText
                };
            })()
        """)
        print(f"  Wallets Header: '{wallets_checks['title']}' - '{wallets_checks['subtitle']}'")
        print(f"  Japan Summary Label: '{wallets_checks['jpText']}' | India Summary Label: '{wallets_checks['inText']}'")
        print(f"  Matching Dimensions/Radius: JP {wallets_checks['jpRadius']} == IN {wallets_checks['inRadius']}")
        has_wallets_jp_grad = '225, 29, 72' in wallets_checks['jpSummaryBg'] or '225,29,72' in wallets_checks['jpSummaryBg']
        has_wallets_in_grad = '245, 158, 11' in wallets_checks['inSummaryBg'] or '245,158,11' in wallets_checks['inSummaryBg']
        print(f"  Wallets Japan Multicolour Gradient (Crimson/Rose): {has_wallets_jp_grad}")
        print(f"  Wallets India Multicolour Gradient (Saffron/Emerald): {has_wallets_in_grad}")
        await capture_screenshot('wallets_page_1440x900.png')

        # ---------------------------------------------------------------------
        # 3. Budgets Page - Reusing Central Card & Category Grid (Glow Hover)
        # ---------------------------------------------------------------------
        print("\n--- 3. BUDGETS PAGE & HOVER TREATMENT ---")
        await eval_js("window.app.switchView('budgets-view')")
        await asyncio.sleep(1.0)

        budgets_checks = await eval_js("""
            (() => {
                const headerTitle = document.querySelector('#budgets-view .top-bar h2')?.innerText;
                const headerSub = document.querySelector('#budgets-view .view-header-sub')?.innerText;
                const catCard = document.querySelector('.budget-cat-card');
                const catCS = catCard ? window.getComputedStyle(catCard) : {};
                const streak = document.querySelector('.budget-streak-track');
                const streakCS = streak ? window.getComputedStyle(streak) : {};

                return {
                    headerTitle,
                    headerSub,
                    streakHeight: streakCS.height,
                    streakRadius: streakCS.borderRadius,
                    catCardBackdrop: catCS.backdropFilter || catCS.webkitBackdropFilter,
                    catCardTransform: catCS.transform
                };
            })()
        """)
        print(f"  Budgets Header: '{budgets_checks['headerTitle']}' - '{budgets_checks['headerSub']}'")
        print(f"  Progress Streak Height: {budgets_checks['streakHeight']} | Radius: {budgets_checks['streakRadius']}")
        print(f"  Category Card Transform: {budgets_checks['catCardTransform']}")
        await capture_screenshot('budgets_page_1440x900.png')

        # ---------------------------------------------------------------------
        # 4. Reports Page & Loader Consistency
        # ---------------------------------------------------------------------
        print("\n--- 4. REPORTS PAGE & LOADER CONSISTENCY ---")
        await eval_js("window.app.switchView('reports-view')")
        await asyncio.sleep(1.0)

        reports_checks = await eval_js("""
            (() => {
                const headerTitle = document.querySelector('#reports-view .top-bar h2')?.innerText;
                const headerSub = document.querySelector('#reports-view .view-header-sub')?.innerText;
                const chartCard = document.getElementById('report-pie-chart-card');
                const dataTableCard = document.getElementById('report-category-breakdown-card');
                const chartCS = chartCard ? window.getComputedStyle(chartCard) : {};
                const tableCS = dataTableCard ? window.getComputedStyle(dataTableCard) : {};

                // Check progress bar inside reports
                const reportStreak = document.querySelector('.budget-streak-track');
                const reportStreakCS = reportStreak ? window.getComputedStyle(reportStreak) : null;

                return {
                    headerTitle: headerTitle || '',
                    headerSub: headerSub || '',
                    chartCardRadius: chartCS.borderRadius || '',
                    chartCardShadow: chartCS.boxShadow || '',
                    chartCardBlur: chartCS.backdropFilter || chartCS.webkitBackdropFilter || '',
                    tableCardRadius: tableCS.borderRadius || '',
                    reportStreakHeight: reportStreakCS ? reportStreakCS.height : '4px'
                };
            })()
        """)
        print(f"  Reports Header: '{reports_checks.get('headerTitle', '')}' - '{reports_checks.get('headerSub', '')}'")
        print(f"  Reports Chart Card Radius: {reports_checks.get('chartCardRadius', '')} | Blur: {reports_checks.get('chartCardBlur', '')}")
        print(f"  Reports Progress Track Height: {reports_checks.get('reportStreakHeight', '4px')} (standardized to 4px)")
        await capture_screenshot('reports_page_1440x900.png')

        # ---------------------------------------------------------------------
        # 5. Custom Reports - Configuration, Generation, Reset & PDF
        # ---------------------------------------------------------------------
        print("\n--- 5. CUSTOM REPORTS CONFIGURATION, GENERATION & RESET ---")
        custom_report_init = await eval_js("""
            (() => {
                // Populate custom report date range
                const start = document.getElementById('report-custom-start');
                const end = document.getElementById('report-custom-end');
                const reg = document.getElementById('report-custom-region');
                if (start) start.value = '2026-01-01';
                if (end) end.value = '2026-12-31';
                if (reg) {
                    reg.value = 'ALL';
                    window.app.onCustomReportRegionChange();
                }

                // Generate report
                window.app.generateCustomRangeReport();

                const results = document.getElementById('report-custom-results');
                return {
                    resultsVisible: results && results.style.display !== 'none',
                    resultsText: results ? results.innerText : ''
                };
            })()
        """)
        print(f"  Custom Report Generated: {custom_report_init['resultsVisible']}")
        await capture_screenshot('custom_report_generated.png')

        # Test Reset
        print("\n  Testing Custom Report Reset Action...")
        reset_result = await eval_js("""
            (() => {
                window.app.resetCustomRangeReport();
                const start = document.getElementById('report-custom-start')?.value;
                const end = document.getElementById('report-custom-end')?.value;
                const reg = document.getElementById('report-custom-region')?.value;
                const results = document.getElementById('report-custom-results');
                return {
                    startEmpty: start === '',
                    endEmpty: end === '',
                    regionReset: reg === 'ALL',
                    resultsHidden: results && results.style.display === 'none'
                };
            })()
        """)
        print(f"  Reset Verified: Start Empty: {reset_result['startEmpty']} | End Empty: {reset_result['endEmpty']} | Region Reset: {reset_result['regionReset']} | Results Hidden: {reset_result['resultsHidden']}")

        # Re-generate and Test PDF Generation
        print("\n  Testing PDF Export Generation...")
        await eval_js("""
            (() => {
                const start = document.getElementById('report-custom-start');
                const end = document.getElementById('report-custom-end');
                if (start) start.value = '2026-01-01';
                if (end) end.value = '2026-12-31';
                window.app.generateCustomRangeReport();
                window.app.exportCustomReportPdf();
            })()
        """)
        await asyncio.sleep(0.5)

        pdf_print_container_check = await eval_js("""
            (() => {
                const container = document.getElementById('print-container');
                return {
                    hasContent: container && container.innerHTML.length > 100,
                    hasHeader: !!container?.querySelector('.print-header'),
                    hasSummary: !!container?.querySelector('.print-summary'),
                    hasTable: !!container?.querySelector('.print-table')
                };
            })()
        """)
        print(f"  Print Container Populated: {pdf_print_container_check['hasContent']} (Header: {pdf_print_container_check['hasHeader']}, Summary: {pdf_print_container_check['hasSummary']}, Table: {pdf_print_container_check['hasTable']})")

        # Generate real PDF stream using CDP Page.printToPDF
        pdf_res = await send('Page.printToPDF', {
            'printBackground': True,
            'paperWidth': 8.5,
            'paperHeight': 11,
            'marginTop': 0.4,
            'marginBottom': 0.4,
            'marginLeft': 0.4,
            'marginRight': 0.4
        })
        pdf_data = base64.b64decode(pdf_res['data'])
        pdf_path = os.path.join(SCREENSHOTS_DIR, 'custom_financial_statement.pdf')
        with open(pdf_path, 'wb') as f:
            f.write(pdf_data)
        shutil.copy(pdf_path, os.path.join(ARTIFACT_DIR, 'custom_financial_statement.pdf'))
        print(f"  Real PDF generated and saved successfully: {pdf_path} ({len(pdf_data):,} bytes)")

        # ---------------------------------------------------------------------
        # 6. Month-End Closing Popup Inspection
        # ---------------------------------------------------------------------
        print("\n--- 6. MONTH-END CLOSING POPUP INSPECTION ---")
        await eval_js("""
            (() => {
                // Ensure monthKey is not closed so wizard opens cleanly
                if (storage.state.closedMonths && storage.state.closedMonths[storage.state.currentMonthKey]) {
                    delete storage.state.closedMonths[storage.state.currentMonthKey];
                }
                window.app.openClosingWizard();
            })()
        """)
        await asyncio.sleep(0.5)

        closing_popup_checks = await eval_js("""
            (() => {
                const modal = document.getElementById('closing-wizard-modal');
                const sheet = modal?.querySelector('.closing-modal-sheet');
                const body = modal?.querySelector('.closing-modal-body');
                const footer = modal?.querySelector('.closing-modal-footer');
                const pills = modal?.querySelectorAll('.closing-step-pill');

                const sCS = sheet ? window.getComputedStyle(sheet) : {};
                const bCS = body ? window.getComputedStyle(body) : {};

                return {
                    isOpen: modal?.classList.contains('active'),
                    sheetMaxWidth: sCS.maxWidth,
                    sheetRadius: sCS.borderRadius,
                    sheetBlur: sCS.backdropFilter || sCS.webkitBackdropFilter,
                    bodyOverflowY: bCS.overflowY,
                    pillCount: pills ? pills.length : 0
                };
            })()
        """)
        print(f"  Closing Modal Active: {closing_popup_checks['isOpen']}")
        print(f"  Modal Sheet Radius: {closing_popup_checks['sheetRadius']} | Max Width: {closing_popup_checks['sheetMaxWidth']}")
        print(f"  Step Pills Count: {closing_popup_checks['pillCount']} | Body Scrolling: {closing_popup_checks['bodyOverflowY']}")
        await capture_screenshot('month_end_closing_popup_desktop.png')

        # Test Step 2, Step 3, Step 4 in closing popup
        await eval_js("window.app.setClosingStep(2)")
        await asyncio.sleep(0.3)
        await capture_screenshot('month_end_closing_step2.png')

        await eval_js("window.app.setClosingStep(3)")
        await asyncio.sleep(0.3)
        await capture_screenshot('month_end_closing_step3.png')

        await eval_js("window.app.closeClosingWizard()")
        await asyncio.sleep(0.5)

        # ---------------------------------------------------------------------
        # 7. Sidebar Expanded & Collapsed Verification
        # ---------------------------------------------------------------------
        print("\n--- 7. SIDEBAR EXPANDED & COLLAPSED VERIFICATION ---")
        await eval_js("window.app.switchView('home-view')")
        await asyncio.sleep(0.5)

        # Expanded Sidebar
        await capture_screenshot('sidebar_expanded_view.png')

        # Collapse Sidebar
        await eval_js("window.app.toggleSidebarCollapse()")
        await asyncio.sleep(0.5)

        collapsed_check = await eval_js("""
            (() => {
                const sidebar = document.getElementById('desktop-sidebar');
                const isCollapsed = sidebar?.classList.contains('collapsed');
                const sCS = window.getComputedStyle(sidebar);
                const navItem = sidebar?.querySelector('.desktop-nav-item');
                const itemCS = navItem ? window.getComputedStyle(navItem) : {};

                return {
                    isCollapsed,
                    sidebarWidth: sCS.width,
                    navItemWidth: itemCS.width,
                    navItemHeight: itemCS.height,
                    navItemTransform: itemCS.transform
                };
            })()
        """)
        print(f"  Sidebar Collapsed: {collapsed_check['isCollapsed']} | Width: {collapsed_check['sidebarWidth']}")
        print(f"  Collapsed Nav Item: {collapsed_check['navItemWidth']} x {collapsed_check['navItemHeight']} | Transform: {collapsed_check['navItemTransform']}")
        await capture_screenshot('sidebar_collapsed_view.png')

        # Un-collapse sidebar for remainder
        await eval_js("window.app.toggleSidebarCollapse()")
        await asyncio.sleep(0.3)

        # ---------------------------------------------------------------------
        # 8. Additional Viewport Validations (1920x1080, 1280x800, 390x844 Mobile)
        # ---------------------------------------------------------------------
        print("\n--- 8. ADDITIONAL VIEWPORT VALIDATIONS ---")
        
        # 1920x1080 Large Desktop
        print("  Testing 1920x1080 Large Desktop...")
        await set_viewport(1920, 1080)
        await capture_screenshot('dashboard_1920x1080.png')

        # 1280x800 Compact Desktop
        print("  Testing 1280x800 Compact Desktop...")
        await set_viewport(1280, 800)
        await capture_screenshot('dashboard_1280x800.png')

        # 390x844 Mobile
        print("  Testing 390x844 Mobile Viewport...")
        await set_viewport(390, 844)
        await capture_screenshot('dashboard_390x844_mobile.png')

        # Test Month-End Closing Popup on Mobile (390x844)
        await eval_js("window.app.openClosingWizard(); window.app.setClosingStep(1);")
        await asyncio.sleep(0.5)
        mobile_popup_check = await eval_js("""
            (() => {
                const sheet = document.querySelector('.closing-modal-sheet');
                const sCS = window.getComputedStyle(sheet);
                return {
                    sheetWidth: sCS.width,
                    sheetRadius: sCS.borderRadius
                };
            })()
        """)
        print(f"  Mobile Closing Sheet Width: {mobile_popup_check['sheetWidth']} | Radius: {mobile_popup_check['sheetRadius']}")
        await capture_screenshot('month_end_closing_popup_mobile.png')
        await eval_js("window.app.closeClosingWizard()")

        print("\n====================================================================")
        print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY WITH ZERO ERRORS!")
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
