import asyncio
import base64
import json
import os
import shutil
import subprocess
import time
import urllib.request
import websockets

PORT = 9222
APP_URL = 'http://localhost:8090'
CHROME_PATH = '/usr/bin/google-chrome-stable'
ARTIFACT_DIR = '/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128'
SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), 'screenshots_pass5_refinement')

VIEWPORTS = [
    ('1440x900', 1440, 900),   # Primary desktop validation
    ('1920x1080', 1920, 1080), # Large desktop
    ('1280x800', 1280, 800),   # Compact desktop
    ('390x844', 390, 844)      # Mobile check
]

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

async def main():
    print("====================================================================")
    print("PASS 5 REFINEMENT: VISUAL VERIFICATION & CDP AUTOMATION")
    print("====================================================================")

    # Clean existing chrome on port 9222
    subprocess.run(['pkill', '-f', f'--remote-debugging-port={PORT}'], stderr=subprocess.DEVNULL)
    time.sleep(1)

    # Launch Chrome headless with remote debugging
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
        async def send(method, params=None):
            nonlocal msg_id
            m_id = msg_id
            msg_id += 1
            await ws.send(json.dumps({'id': m_id, 'method': method, 'params': params or {}}))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get('id') == m_id:
                    return resp.get('result', {})

        async def eval_js(expr):
            r = await send('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
            if 'exceptionDetails' in r:
                raise RuntimeError(f"JS Error in eval: {r['exceptionDetails']}")
            return r.get('result', {}).get('value')

        async def set_viewport(width, height, is_mobile=False):
            await send('Emulation.setDeviceMetricsOverride', {
                'width': width,
                'height': height,
                'deviceScaleFactor': 1,
                'mobile': is_mobile
            })
            await asyncio.sleep(0.3)

        async def capture(filename, clip=None):
            params = {'format': 'png'}
            if clip:
                params['clip'] = clip
            res = await send('Page.captureScreenshot', params)
            data = base64.b64decode(res['data'])
            filepath = os.path.join(SCREENSHOTS_DIR, filename)
            with open(filepath, 'wb') as f:
                f.write(data)
            # Copy to artifact directory
            artifact_filepath = os.path.join(ARTIFACT_DIR, filename)
            with open(artifact_filepath, 'wb') as f:
                f.write(data)
            print(f"  ✓ Saved screenshot: {filename} ({len(data)} bytes)")
            return filepath

        await send('Page.enable')
        await send('DOM.enable')

        # Navigate to application
        print(f"Navigating to {APP_URL}/index.html...")
        await send('Page.navigate', {'url': f'{APP_URL}/index.html'})
        await asyncio.sleep(2)

        # Login and seed rich test data
        print("Logging in and seeding test state...")
        await eval_js("""
        (() => {
            const authScreen = document.getElementById('auth-screen');
            const appContent = document.getElementById('app-content');
            if (authScreen) authScreen.style.display = 'none';
            if (appContent) appContent.style.display = 'block';

            if (typeof supabaseClient !== 'undefined') {
                supabaseClient.session = { user: { email: 'pass5_audit@example.com', id: 'pass5-tester' } };
            }
            storage.onUserLogin('pass5-tester');

            const now = new Date();
            const curMonth = now.toISOString().slice(0, 7);
            const dateStr = curMonth + '-02';

            storage.state.currentMonthKey = curMonth;
            storage.state.jpTotalBudget = 260000;
            storage.state.inTotalBudget = 85000;

            // Seed user's 6 primary accounts
            storage.state.wallets = {
                'Salary (Yucho)': { id: 'Salary (Yucho)', type: 'bank', region: 'JP', balance: 345000, currency: '¥', theme: 'emerald-salary', color: '#047857' },
                'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', balance: 28400, currency: '¥', theme: 'crimson-paypay', color: '#e60012' },
                'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 14500, currency: '¥', theme: 'amber-gold', color: '#d97706' },
                'Axis Bank': { id: 'Axis Bank', type: 'bank', region: 'IN', balance: 125000, currency: '₹', theme: 'burgundy-axis', color: '#800020' },
                'Bank of Baroda': { id: 'Bank of Baroda', type: 'bank', region: 'IN', balance: 64000, currency: '₹', theme: 'baroda-orange', color: '#ea580c' },
                'Axis Credit Card': { id: 'Axis Credit Card', type: 'card', region: 'IN', balance: -18500, currency: '₹', theme: 'rose-gold', color: '#ec4899' }
            };

            // Seed categories
            storage.state.categories.JP = [
                { id: 'jp-food', name: 'Food & Groceries', budget: 45000, icon: 'utensils', isActive: true },
                { id: 'jp-travel', name: 'Transit & Commute', budget: 15000, icon: 'train-front', isActive: true },
                { id: 'jp-shopping', name: 'Apparel & Shopping', budget: 25000, icon: 'shopping-bag', isActive: true },
                { id: 'jp-util', name: 'Utilities & Telecom', budget: 22000, icon: 'zap', isActive: true },
                { id: 'jp-dining', name: 'Dining Out & Cafe', budget: 18000, icon: 'coffee', isActive: true }
            ];

            // Seed transactions with diverse amounts, notes, and sources
            storage.state.transactions = [
                { id: 'tx-1', amount: 4800, type: 'expense', categoryId: 'jp-dining', region: 'JP', date: curMonth + '-05', note: 'Shinjuku Ramen & Gyoza', walletId: 'PayPay' },
                { id: 'tx-2', amount: 12400, type: 'expense', categoryId: 'jp-food', region: 'JP', date: curMonth + '-05', note: 'Seiyu Weekly Groceries', walletId: 'Salary (Yucho)' },
                { id: 'tx-3', amount: 350000, type: 'income', categoryId: 'jp-salary', region: 'JP', date: curMonth + '-04', note: 'Monthly Tech Salary Credit', walletId: 'Salary (Yucho)' },
                { id: 'tx-4', amount: 8900, type: 'expense', categoryId: 'jp-shopping', region: 'JP', date: curMonth + '-03', note: 'Uniqlo Winter Fleece', walletId: 'Cash' },
                { id: 'tx-5', amount: 3200, type: 'expense', categoryId: 'jp-travel', region: 'JP', date: curMonth + '-03', note: 'Tokyo Metro Pass', walletId: 'PayPay' },
                { id: 'tx-6', amount: 7600, type: 'expense', categoryId: 'jp-util', region: 'JP', date: curMonth + '-02', note: 'NTT Docomo Fibre Internet', walletId: 'Salary (Yucho)' },
                { id: 'tx-7', amount: 15000, type: 'transfer', categoryId: 'transfer', region: 'JP', date: curMonth + '-02', note: 'ATM Cash Withdrawal', walletId: 'Salary (Yucho)', toWalletId: 'Cash' },
                { id: 'tx-8', amount: 50000, type: 'remittance', categoryId: 'remittance', region: 'JP', date: curMonth + '-01', note: 'Wise Remittance to India', walletId: 'Salary (Yucho)', toWalletId: 'Axis Bank', exchangeRate: 0.55 }
            ];

            storage.saveData();
            app.init();
            app.setPrivacyHidden(false);
            return true;
        })();
        """)
        await asyncio.sleep(1)

        # -------------------------------------------------------------
        # 1. Wallets Page Verification
        # -------------------------------------------------------------
        print("\n--- 1. VERIFYING WALLETS PAGE ---")
        await eval_js("app.switchView('wallets-view'); app.renderWalletsPage();")
        await asyncio.sleep(0.8)

        for name, w, h in VIEWPORTS:
            await set_viewport(w, h, is_mobile=(w < 500))
            await asyncio.sleep(0.4)
            await capture(f"wallets_refinement_{name}.png")

        # -------------------------------------------------------------
        # 2. Reports Page Verification (3 KPI cards, Redesigned Pie Chart)
        # -------------------------------------------------------------
        print("\n--- 2. VERIFYING REPORTS PAGE ---")
        await eval_js("app.switchView('reports-view'); app.renderReportsPage();")
        await asyncio.sleep(0.8)

        for name, w, h in VIEWPORTS:
            await set_viewport(w, h, is_mobile=(w < 500))
            await asyncio.sleep(0.4)
            await capture(f"reports_refinement_{name}.png")

        # Closeup of Reports Pie Chart Card at 1440x900
        await set_viewport(1440, 900)
        await asyncio.sleep(0.3)
        pie_card_box = await eval_js("""
            (() => {
                const el = document.getElementById('report-pie-chart-card');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height, scale: 1 };
            })()
        """)
        if pie_card_box and pie_card_box.get('height') > 0:
            await capture("reports_pie_chart_card_closeup.png", clip=pie_card_box)

        # -------------------------------------------------------------
        # 3. Transactions Page Verification
        # -------------------------------------------------------------
        print("\n--- 3. VERIFYING TRANSACTIONS PAGE ---")
        await eval_js("app.switchView('transactions-view'); app.renderTransactionsPage();")
        await asyncio.sleep(0.8)

        for name, w, h in VIEWPORTS:
            await set_viewport(w, h, is_mobile=(w < 500))
            await asyncio.sleep(0.4)
            await capture(f"transactions_refinement_{name}.png")

        # Closeup of Transactions Ledger Rows at 1440x900
        await set_viewport(1440, 900)
        await asyncio.sleep(0.3)
        tx_list_box = await eval_js("""
            (() => {
                const el = document.querySelector('.ledger-timeline-container');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: Math.min(rect.height, 460), scale: 1 };
            })()
        """)
        if tx_list_box and tx_list_box.get('height') > 0:
            await capture("transactions_ledger_rows_closeup.png", clip=tx_list_box)

        # -------------------------------------------------------------
        # 4. Sidebar Expanded & Collapsed Verification
        # -------------------------------------------------------------
        print("\n--- 4. VERIFYING SIDEBAR (EXPANDED & COLLAPSED) ---")
        await set_viewport(1440, 900)
        await eval_js("app.switchView('home-view'); app.renderAll();")
        await asyncio.sleep(0.6)

        # Expanded state
        await capture("sidebar_expanded_1440x900.png")

        # Collapse sidebar
        await eval_js("app.toggleSidebarCollapse();")
        await asyncio.sleep(0.6)
        await capture("sidebar_collapsed_1440x900.png")

        # Closeup of Collapsed Sidebar
        collapsed_sidebar_box = await eval_js("""
            (() => {
                const el = document.getElementById('desktop-sidebar');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: 500, scale: 1 };
            })()
        """)
        if collapsed_sidebar_box and collapsed_sidebar_box.get('height') > 0:
            await capture("sidebar_collapsed_closeup.png", clip=collapsed_sidebar_box)

        # Expand sidebar back for clean state
        await eval_js("app.toggleSidebarCollapse();")
        await asyncio.sleep(0.4)

        # -------------------------------------------------------------
        # 5. Extract Computed Inspection Metrics
        # -------------------------------------------------------------
        metrics = await eval_js("""
            (() => {
                const res = {};

                // 1. Wallets headings
                const jpTitle = document.querySelector('.wallets-kpi-card:nth-child(1) .wallets-kpi-title');
                const inTitle = document.querySelector('.wallets-kpi-card:nth-child(2) .wallets-kpi-title');
                res.walletsHeadings = {
                    jp: jpTitle ? jpTitle.innerText.trim() : null,
                    in: inTitle ? inTitle.innerText.trim() : null
                };

                // 2. Reports KPI Grid & Savings Rate
                const rKpiCards = document.querySelectorAll('.reports-kpi-card');
                const savingsCard = Array.from(rKpiCards).find(c => c.innerText.includes('Savings Rate'));
                res.reports = {
                    kpiCardCount: rKpiCards.length,
                    hasSavingsRateCard: !!savingsCard,
                    kpiTitles: Array.from(rKpiCards).map(c => c.querySelector('.reports-kpi-label')?.innerText.trim())
                };

                // 3. Reports Pie Legend
                const legendItems = document.querySelectorAll('.pie-legend-item');
                res.reports.legendItemCount = legendItems.length;
                if (legendItems.length > 0) {
                    const li = legendItems[0];
                    res.reports.legendSample = {
                        hasLeftCol: !!li.querySelector('.pie-legend-left'),
                        hasRightCol: !!li.querySelector('.pie-legend-right'),
                        name: li.querySelector('.legend-cat-name')?.innerText.trim(),
                        pct: li.querySelector('.legend-pct')?.innerText.trim(),
                        amt: li.querySelector('.legend-amt')?.innerText.trim()
                    };
                }

                // 4. Transactions Row Typography & Styling
                const txRow = document.querySelector('.ledger-tx-row');
                if (txRow) {
                    const title = txRow.querySelector('.ledger-tx-title');
                    const amt = txRow.querySelector('.ledger-tx-amount');
                    const meta = txRow.querySelector('.ledger-tx-meta');
                    const icon = txRow.querySelector('.tx-type-icon');
                    res.transactions = {
                        rowBg: window.getComputedStyle(txRow).backgroundColor,
                        rowBorder: window.getComputedStyle(txRow).borderColor,
                        titleFontWeight: title ? window.getComputedStyle(title).fontWeight : null,
                        amountFontWeight: amt ? window.getComputedStyle(amt).fontWeight : null,
                        amountColor: amt ? window.getComputedStyle(amt).color : null,
                        iconSize: icon ? `${icon.offsetWidth}x${icon.offsetHeight}` : null
                    };
                }

                // 5. Sidebar Collapsed Metric
                const sidebar = document.getElementById('desktop-sidebar');
                sidebar.classList.add('collapsed');
                const navItem = sidebar.querySelector('.desktop-nav-item');
                const navSvg = navItem ? navItem.querySelector('svg') : null;
                if (navItem && navSvg) {
                    const iRect = navItem.getBoundingClientRect();
                    const sRect = navSvg.getBoundingClientRect();
                    res.sidebarCollapsed = {
                        sidebarWidth: sidebar.offsetWidth,
                        navItemWidth: iRect.width,
                        navItemHeight: iRect.height,
                        svgWidth: sRect.width,
                        svgHeight: sRect.height,
                        svgOffsetLeft: Math.round(sRect.left - iRect.left),
                        svgOffsetRight: Math.round(iRect.right - sRect.right),
                        isHorizontallyCentered: Math.abs((sRect.left - iRect.left) - (iRect.right - sRect.right)) <= 1
                    };
                }
                sidebar.classList.remove('collapsed');

                // 6. Accent color & Button tokens
                const dummyBtn = document.createElement('button');
                dummyBtn.className = 'btn btn-primary';
                dummyBtn.innerText = 'Action';
                document.body.appendChild(dummyBtn);
                const btnStyle = window.getComputedStyle(dummyBtn);
                res.buttonPrimary = {
                    height: btnStyle.height,
                    padding: btnStyle.padding,
                    backgroundColor: btnStyle.backgroundColor,
                    color: btnStyle.color,
                    fontWeight: btnStyle.fontWeight,
                    borderRadius: btnStyle.borderRadius
                };
                dummyBtn.remove();

                const dummySecBtn = document.createElement('button');
                dummySecBtn.className = 'btn btn-secondary';
                dummySecBtn.innerText = 'Secondary';
                document.body.appendChild(dummySecBtn);
                const secStyle = window.getComputedStyle(dummySecBtn);
                res.buttonSecondary = {
                    height: secStyle.height,
                    backgroundColor: secStyle.backgroundColor,
                    borderColor: secStyle.borderColor,
                    color: secStyle.color
                };
                dummySecBtn.remove();

                res.accentToken = window.getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

                return res;
            })()
        """)

        print("\n--- DOM & DESIGN SYSTEM INSPECTION METRICS ---")
        print(json.dumps(metrics, indent=2))

        print("\n====================================================================")
        print("PASS 5 REFINEMENT VERIFICATION COMPLETED SUCCESSFULLY!")
        print("====================================================================")

    finally:
        chrome_proc.terminate()
        try:
            chrome_proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            chrome_proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
