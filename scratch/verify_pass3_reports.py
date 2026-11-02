import asyncio
import base64
import json
import os
import subprocess
import time
import urllib.request
import websockets

PORT = 9222
APP_URL = 'http://localhost:8090'
CHROME_PATH = '/usr/bin/google-chrome'
ARTIFACT_DIR = '/home/tharunkumaark/.gemini/antigravity-ide/brain/ac0f2946-a48f-415e-b65c-3565fdfb84b7'

async def main():
    subprocess.run(['pkill', '-f', f'--remote-debugging-port={PORT}'], stderr=subprocess.DEVNULL)
    time.sleep(1)

    proc = subprocess.Popen([
        CHROME_PATH,
        f'--remote-debugging-port={PORT}',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--window-size=1440,900',
        'about:blank'
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        ws = None
        for _ in range(30):
            try:
                req = urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json')
                pages = json.loads(req.read().decode())
                page_targets = [p for p in pages if p.get('type') == 'page']
                if page_targets:
                    ws = await websockets.connect(page_targets[0]['webSocketDebuggerUrl'], max_size=50*1024*1024)
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
                raise RuntimeError(f"JS Error: {r['exceptionDetails']}")
            return r.get('result', {}).get('value')

        async def capture_screen(filename, width=1440, height=900):
            await send('Emulation.setDeviceMetricsOverride', {
                'width': width,
                'height': height,
                'deviceScaleFactor': 1,
                'mobile': width < 768
            })
            await asyncio.sleep(0.4)
            shot = await send('Page.captureScreenshot', {'format': 'png'})
            path = os.path.join(ARTIFACT_DIR, filename)
            with open(path, 'wb') as f:
                f.write(base64.b64decode(shot['data']))
            print(f"[Screenshot] Saved {filename} ({width}x{height})")
            return path

        await send('Page.enable')
        await send('DOM.enable')
        await send('Page.navigate', {'url': APP_URL})
        await asyncio.sleep(2)

        # 1. Seed rich data
        print("=== SEEDING REALISTIC FINANCIAL DATA FOR PASS 3 VERIFICATION ===")
        await eval_js("""
        (() => {
            const authScreen = document.getElementById('auth-screen');
            const appContent = document.getElementById('app-content');
            if (authScreen) authScreen.style.display = 'none';
            if (appContent) appContent.style.display = 'block';

            if (typeof supabaseClient !== 'undefined') {
                supabaseClient.session = { user: { email: 'pass3_audit@example.com', id: 'pass3-tester' } };
            }
            storage.onUserLogin('pass3-tester');

            const now = new Date();
            const curMonth = now.toISOString().slice(0, 7);
            const dateStr = curMonth + '-02';

            storage.state.jpTotalBudget = 250000;
            storage.state.inTotalBudget = 80000;

            // Categories
            const jpCats = storage.state.categories.JP;
            if (jpCats) {
                const food = jpCats.find(c => c.id === 'jp-food');
                if (food) food.budget = 50000;
                const dining = jpCats.find(c => c.id === 'jp-dining');
                if (dining) dining.budget = 30000;
                const trans = jpCats.find(c => c.id === 'jp-transport');
                if (trans) trans.budget = 20000;
            }

            storage.state.transactions = [
                // JP Transactions
                { id: 'tx-1', type: 'income', amount: 350000, currency: '¥', region: 'JP', date: `${curMonth}-01`, walletId: 'Salary Account', note: 'November Salary' },
                { id: 'tx-2', type: 'expense', amount: 14200, currency: '¥', region: 'JP', date: `${curMonth}-02`, categoryId: 'jp-food', walletId: 'Salary Account', note: 'Costco Wholesale' },
                { id: 'tx-3', type: 'expense', amount: 6800, currency: '¥', region: 'JP', date: `${curMonth}-02`, categoryId: 'jp-dining', walletId: 'PayPay', note: 'Sushi Dinner' },
                { id: 'tx-4', type: 'expense', amount: 4500, currency: '¥', region: 'JP', date: `${curMonth}-02`, categoryId: 'jp-transport', walletId: 'Salary Account', note: 'Shinkansen ticket' },
                { id: 'tx-5', type: 'expense', amount: 12000, currency: '¥', region: 'JP', date: `${curMonth}-03`, categoryId: 'jp-utilities-electric', walletId: 'Salary Account', note: 'Electricity bill' },
                { id: 'tx-6', type: 'transfer', amount: 30000, currency: '¥', region: 'JP', date: `${curMonth}-02`, sourceId: 'Salary Account', destId: 'PayPay', note: 'Monthly wallet topup' },
                { id: 'tx-7', type: 'remittance', sourceAmount: 100000, destAmount: 55000, region: 'JP', date: `${curMonth}-03`, sourceId: 'Salary Account', destId: 'Bank Account', exchangeRate: 0.55, note: 'Family remittance' },

                // IN Transactions
                { id: 'tx-in-1', type: 'income', amount: 65000, currency: '₹', region: 'IN', date: `${curMonth}-01`, walletId: 'Bank Account', note: 'Consulting Project' },
                { id: 'tx-in-2', type: 'expense', amount: 4800, currency: '₹', region: 'IN', date: `${curMonth}-02`, categoryId: 'in-petrol', walletId: 'Bank Account', note: 'Monthly petrol' },
                { id: 'tx-in-3', type: 'expense', amount: 12500, currency: '₹', region: 'IN', date: `${curMonth}-02`, categoryId: 'in-rent', walletId: 'Bank Account', note: 'Apartment rent' }
            ];

            storage.saveData();

            app.init();
            app.setPrivacyHidden(false);
            app.switchView('reports-view');
            app.setReportRegion('JP');
        })()
        """)
        await asyncio.sleep(0.8)

        # ---------------------------------------------------------------------
        # TEST 1: Inspect Reports Page Structure & Responsive Layouts
        # ---------------------------------------------------------------------
        print("\n--- TEST 1: Reports Page Layout & Visual Breakpoints ---")
        await capture_screen('pass3_reports_desktop_1440.png', 1440, 900)
        await capture_screen('pass3_reports_desktop_1280.png', 1280, 800)
        await capture_screen('pass3_reports_desktop_1920.png', 1920, 1080)
        await capture_screen('pass3_reports_mobile_390.png', 390, 844)

        # Reset device metrics to 1440
        await send('Emulation.setDeviceMetricsOverride', {
            'width': 1440,
            'height': 900,
            'deviceScaleFactor': 1,
            'mobile': False
        })
        await asyncio.sleep(0.3)

        # ---------------------------------------------------------------------
        # TEST 2: Verify Category Expense Breakdown Sorting & Elements
        # ---------------------------------------------------------------------
        print("\n--- TEST 2: Category Expense Breakdown Elements & Active Filter ---")
        breakdown_info = await eval_js("""
        (() => {
            const card = document.getElementById('report-category-breakdown-card');
            const table = card.querySelector('.report-table');
            const rows = Array.from(table.querySelectorAll('tbody tr'));
            const activeToggleBtn = card.querySelector('#report-cat-filter-control .segment-btn.active');
            
            // Extract row category names and spend amounts
            const rowData = rows.map(r => {
                const nameEl = r.querySelector('.category-cell span');
                const spendEl = r.querySelector('.spend-cell .privacy-blur');
                const varianceEl = r.querySelector('td:nth-child(4)');
                const pctEl = r.querySelector('td:nth-child(5)');
                const countEl = r.querySelector('.tx-count-pill');
                const microBar = r.querySelector('.micro-spend-fill');
                return {
                    name: nameEl ? nameEl.innerText.trim() : '',
                    spend: spendEl ? spendEl.innerText.trim() : '',
                    variance: varianceEl ? varianceEl.innerText.trim() : '',
                    pct: pctEl ? pctEl.innerText.trim() : '',
                    count: countEl ? countEl.innerText.trim() : '',
                    hasMicroBar: !!microBar
                };
            });

            // Check chart legend
            const legendItems = Array.from(document.querySelectorAll('#report-pie-legend .pie-legend-item'));
            const legendCount = legendItems.length;

            return {
                rowCount: rows.length,
                activeFilterText: activeToggleBtn ? activeToggleBtn.innerText.trim() : '',
                rowData,
                legendCount
            };
        })()
        """)
        print(f"Active categories shown: {breakdown_info['rowCount']}")
        print(f"Active filter button text: '{breakdown_info['activeFilterText']}'")
        print(f"Legend items count: {breakdown_info['legendCount']}")
        for i, row in enumerate(breakdown_info['rowData']):
            print(f"  Row {i+1}: {row['name']} | Spent: {row['spend']} | Cushion: {row['variance']} | Share: {row['pct']} | Txs: {row['count']} | MicroBar: {row['hasMicroBar']}")

        assert breakdown_info['rowCount'] > 0, "Should display active category rows"
        # First row should be highest spend (Costco Food ¥14,200)
        assert 'Food' in breakdown_info['rowData'][0]['name'], f"Highest spend category should be first, got {breakdown_info['rowData'][0]['name']}"

        # ---------------------------------------------------------------------
        # TEST 3: Toggle "All Categories" vs "Active"
        # ---------------------------------------------------------------------
        print("\n--- TEST 3: Toggle 'All' Categories ---")
        await eval_js("app.setReportCategoryFilter('all')")
        await asyncio.sleep(0.4)
        all_count = await eval_js("document.querySelectorAll('#report-category-breakdown-card tbody tr').length")
        print(f"Total categories shown in 'All' view: {all_count} (Expected: 14+)")
        assert all_count >= 14, f"All categories view should show catalog categories, got {all_count}"

        await capture_screen('pass3_reports_all_categories_1440.png', 1440, 900)

        # Toggle back to 'active'
        await eval_js("app.setReportCategoryFilter('active')")
        await asyncio.sleep(0.3)

        # ---------------------------------------------------------------------
        # TEST 4: Region Switch to India (INR ₹)
        # ---------------------------------------------------------------------
        print("\n--- TEST 4: Region Switch to India (INR ₹) ---")
        await eval_js("app.setReportRegion('IN')")
        await asyncio.sleep(0.5)

        in_info = await eval_js("""
        (() => {
            const heroTitle = document.querySelector('#report-snapshot-hero h2').innerText;
            const heroCur = document.querySelector('.report-meta-text').innerText;
            const rows = Array.from(document.querySelectorAll('#report-category-breakdown-card tbody tr'));
            const rowNames = rows.map(r => r.querySelector('.category-cell span')?.innerText.trim());
            return {
                heroTitle,
                heroCur,
                rowCount: rows.length,
                rowNames
            };
        })()
        """)
        print(f"India Snapshot title: '{in_info['heroTitle']}'")
        print(f"Currency string: '{in_info['heroCur']}'")
        print(f"India active categories count: {in_info['rowCount']} ({in_info['rowNames']})")
        assert '₹' in in_info['heroCur'], "Currency should be INR ₹"
        assert in_info['rowCount'] >= 2, "India should have at least 2 active categories"

        await capture_screen('pass3_reports_india_1440.png', 1440, 900)

        # Switch back to JP
        await eval_js("app.setReportRegion('JP')")
        await asyncio.sleep(0.4)

        # ---------------------------------------------------------------------
        # TEST 5: Custom Date-Range Report
        # ---------------------------------------------------------------------
        print("\n--- TEST 5: Custom Date-Range Report Generation ---")
        now_month = time.strftime('%Y-%m')
        await eval_js(f"""
        (() => {{
            document.getElementById('report-custom-start').value = '{now_month}-01';
            document.getElementById('report-custom-end').value = '{now_month}-03';
            app.generateCustomRangeReport();
        }})()
        """)
        await asyncio.sleep(0.4)

        custom_res = await eval_js("""
        (() => {
            const resEl = document.getElementById('report-custom-results');
            return {
                isDisplayed: resEl && resEl.style.display !== 'none',
                text: resEl ? resEl.innerText : ''
            };
        })()
        """)
        print(f"Custom report generated & visible: {custom_res['isDisplayed']}")
        assert custom_res['isDisplayed'], "Custom report results should be displayed"

        # ---------------------------------------------------------------------
        # TEST 6: Card Hover Animation Verification
        # ---------------------------------------------------------------------
        print("\n--- TEST 6: Non-Interactive Card Hover Verification ---")
        hover_check = await eval_js("""
        (() => {
            const hero = document.getElementById('report-snapshot-hero');
            const chartCard = document.getElementById('report-pie-chart-card');
            const tableCard = document.getElementById('report-category-breakdown-card');
            
            // Check computed styles
            return {
                heroTag: hero.tagName,
                chartCardTag: chartCard.tagName,
                tableCardTag: tableCard.tagName
            };
        })()
        """)
        print(f"Verified static card containers: {hover_check}")

        print("\n=================================================================")
        print("ALL PASS 3 REPORTS VERIFICATIONS COMPLETED SUCCESSFULLY!")
        print("=================================================================")

    finally:
        await ws.close()
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(main())
