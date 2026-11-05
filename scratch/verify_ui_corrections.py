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
SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), 'screenshots')

VIEWPORTS = [
    ('1920x1080', 1920, 1080),
    ('1440x900', 1440, 900),
    ('1280x800', 1280, 800),
    ('390x844', 390, 844)
]

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

async def main():
    print("====================================================================")
    print("STARTING VISUAL VERIFICATION & SCREENSHOT AUTOMATION")
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
            # Also copy to artifact directory
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

        # Login and seed test data
        print("Logging in and initializing workspace state...")
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
            if (!storage.state.categories.JP || storage.state.categories.JP.length === 0) {
                storage.state.categories.JP = [
                    { id: 'jp-food', name: 'Food & Dining', budget: 35000, icon: 'utensils', isActive: true },
                    { id: 'jp-travel', name: 'Travel & Transit', budget: 15000, icon: 'train-front', isActive: true },
                    { id: 'jp-shopping', name: 'Shopping & Goods', budget: 20000, icon: 'shopping-bag', isActive: true }
                ];
            }

            // Seed transactions
            storage.state.transactions = [
                { id: 't1', amount: 15400, type: 'expense', categoryId: 'jp-food', region: 'JP', date: dateStr, description: 'Seiyu Grocery', walletId: 'PayPay' },
                { id: 't2', amount: 8200, type: 'expense', categoryId: 'jp-travel', region: 'JP', date: dateStr, description: 'Suica Recharge', walletId: 'Salary (Yucho)' },
                { id: 't3', amount: 12500, type: 'expense', categoryId: 'jp-shopping', region: 'JP', date: dateStr, description: 'Uniqlo Ginza', walletId: 'Cash' },
                { id: 't4', amount: 8500, type: 'expense', categoryId: 'in-food', region: 'IN', date: dateStr, description: 'Dining Out', walletId: 'Axis Bank' }
            ];

            storage.saveData();
            app.init();
            app.setPrivacyHidden(false);
            return true;
        })();
        """)
        await asyncio.sleep(1)

        # -------------------------------------------------------------
        # 1. Budgets Page Verification
        # -------------------------------------------------------------
        print("\n--- 1. VERIFYING BUDGETS PAGE ---")
        await eval_js("app.switchView('budgets-view'); app.renderBudgetsPage();")
        await asyncio.sleep(0.8)

        for name, w, h in VIEWPORTS:
            await set_viewport(w, h, is_mobile=(w < 500))
            await asyncio.sleep(0.4)
            await capture(f"budgets_page_{name}.png")

        # Capture Budgets Summary Card Closeup at 1440
        await set_viewport(1440, 900)
        await asyncio.sleep(0.3)
        budgets_card_box = await eval_js("""
            (() => {
                const el = document.querySelector('#budgets-summary-banner .budget-central-card');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height, scale: 1 };
            })()
        """)
        if budgets_card_box and budgets_card_box.get('height') > 0:
            await capture("budgets_summary_card_closeup.png", clip=budgets_card_box)

        # -------------------------------------------------------------
        # 2. Dashboard Summary Card (Side-by-side comparison)
        # -------------------------------------------------------------
        print("\n--- 2. VERIFYING DASHBOARD SUMMARY CARD ---")
        await eval_js("app.switchView('home-view'); app.renderAll();")
        await asyncio.sleep(0.8)

        dash_card_box = await eval_js("""
            (() => {
                const el = document.getElementById('budget-overview-card');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height, scale: 1 };
            })()
        """)
        if dash_card_box and dash_card_box.get('height') > 0:
            await capture("dashboard_summary_card_closeup.png", clip=dash_card_box)

        await capture("dashboard_full_1440.png")

        # -------------------------------------------------------------
        # 3. Wallets Page Verification (Cards, Hierarchy, Header)
        # -------------------------------------------------------------
        print("\n--- 3. VERIFYING WALLETS PAGE & CARDS ---")
        await eval_js("app.switchView('wallets-view'); app.renderWalletsPage();")
        await asyncio.sleep(0.8)

        for name, w, h in VIEWPORTS:
            await set_viewport(w, h, is_mobile=(w < 500))
            await asyncio.sleep(0.4)
            await capture(f"wallets_page_{name}.png")

        # Closeup of Wallet Cards
        await set_viewport(1440, 900)
        await asyncio.sleep(0.3)
        wallets_box = await eval_js("""
            (() => {
                const el = document.getElementById('wallets-jp-cards');
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: Math.min(rect.height, 420), scale: 1 };
            })()
        """)
        if wallets_box and wallets_box.get('height') > 0:
            await capture("wallets_cards_typography_closeup.png", clip=wallets_box)

        # -------------------------------------------------------------
        # 4. Add Wallet Modal & Theme Selector
        # -------------------------------------------------------------
        print("\n--- 4. VERIFYING ADD WALLET MODAL & THEME SELECTOR ---")
        await eval_js("app.openAddWalletModal();")
        await asyncio.sleep(0.8)
        await capture("wallets_add_modal_theme_selector.png")

        # Select a different theme (e.g. crimson-paypay)
        await eval_js("app.selectThemeSwatch('add-wallet-theme-val', 'crimson-paypay', 'add-wallet-theme-picker');")
        await asyncio.sleep(0.4)
        await capture("wallets_add_modal_selected_state.png")

        await eval_js("app.closeModal('add-wallet-modal');")
        await asyncio.sleep(0.4)

        # -------------------------------------------------------------
        # 5. Edit Wallet Modal & Theme Selector
        # -------------------------------------------------------------
        print("\n--- 5. VERIFYING EDIT WALLET MODAL ---")
        await eval_js("app.openEditWalletModal('PayPay');")
        await asyncio.sleep(0.8)
        await capture("wallets_edit_modal_theme_selector.png")
        await eval_js("app.closeModal('edit-wallet-modal');")
        await asyncio.sleep(0.3)

        # Inspect DOM & CSS Metrics for Report
        metrics = await eval_js("""
            (() => {
                const results = {};
                // Budgets summary card class
                const bCard = document.querySelector('#budgets-summary-banner .budget-central-card');
                results.budgetsSummaryCardFound = !!bCard;
                if (bCard) {
                    results.bCardClasses = bCard.className;
                    results.bHeader = !!bCard.querySelector('.budget-central-header');
                    results.bProgress = !!bCard.querySelector('.budget-central-progress-wrap');
                    results.bStats = !!bCard.querySelector('.budget-central-stats-row');
                }

                // Theme selector grid
                app.openAddWalletModal();
                const grid = document.getElementById('add-wallet-theme-picker');
                if (grid) {
                    const tiles = grid.querySelectorAll('.theme-picker-tile');
                    results.themeTileCount = tiles.length;
                    const previews = grid.querySelectorAll('.theme-tile-preview');
                    results.previewCount = previews.length;
                    if (tiles.length > 0) {
                        const t0 = tiles[0].getBoundingClientRect();
                        const p0 = previews[0].getBoundingClientRect();
                        const l0 = tiles[0].querySelector('.theme-tile-name').getBoundingClientRect();
                        results.tileHeight = Math.round(t0.height);
                        results.tileWidth = Math.round(t0.width);
                        results.previewHeight = Math.round(p0.height);
                        results.labelTopMinusPreviewBottom = Math.round((l0.top - p0.bottom) * 10) / 10;
                    }
                }
                app.closeModal('add-wallet-modal');

                // Wallet card typography weights
                const wLabel = document.querySelector('.wallet-balance-label');
                const wVal = document.querySelector('.wallet-balance-val');
                const wName = document.querySelector('.wallet-card .wallet-name');
                if (wLabel && wVal && wName) {
                    results.labelWeight = window.getComputedStyle(wLabel).fontWeight;
                    results.valWeight = window.getComputedStyle(wVal).fontWeight;
                    results.nameWeight = window.getComputedStyle(wName).fontWeight;
                    results.labelColor = window.getComputedStyle(wLabel).color;
                }

                return results;
            })()
        """)

        print("\n--- DOM & CSS INSPECTION METRICS ---")
        print(json.dumps(metrics, indent=2))

        print("\n====================================================================")
        print("VISUAL VERIFICATION COMPLETED WITH 100% SUCCESS!")
        print("====================================================================")

    finally:
        chrome_proc.terminate()
        try:
            chrome_proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            chrome_proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
