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

        async def capture_screen(filename, width=1440, height=900, mobile=False):
            await send('Emulation.setDeviceMetricsOverride', {
                'width': width,
                'height': height,
                'deviceScaleFactor': 1,
                'mobile': mobile
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

        print("\n====================================================================")
        print("SEEDING FINANCIAL DATA FOR PASS 4: BUDGETS & CATEGORIES VERIFICATION")
        print("====================================================================\n")

        init_res = await eval_js("""
        (() => {
            const authScreen = document.getElementById('auth-screen');
            const appContent = document.getElementById('app-content');
            if (authScreen) authScreen.style.display = 'none';
            if (appContent) appContent.style.display = 'block';

            if (typeof supabaseClient !== 'undefined') {
                supabaseClient.session = { user: { email: 'pass4_audit@example.com', id: 'pass4-tester' } };
            }
            storage.onUserLogin('pass4-tester');

            const now = new Date();
            const curMonth = now.toISOString().slice(0, 7);
            const dateStr = curMonth + '-02';

            // Japan Config
            storage.state.jpTotalBudget = 250000;
            // India Config
            storage.state.inTotalBudget = 75000;

            // Configure category limits
            const cats = storage.state.categories.JP;
            const food = cats.find(c => c.id === 'jp-food');
            if (food) food.budget = 35000;
            const dining = cats.find(c => c.id === 'jp-dining');
            if (dining) dining.budget = 15000;
            const transport = cats.find(c => c.id === 'jp-transport');
            if (transport) transport.budget = 12000;
            const shopping = cats.find(c => c.id === 'jp-shopping');
            if (shopping) shopping.budget = 20000;
            const utilElec = cats.find(c => c.id === 'jp-utility-electric');
            if (utilElec) utilElec.budget = 8000;

            // Seed realistic transactions
            storage.state.transactions = [
                // JP expenses
                { id: 'tx-p4-1', amount: 14200, type: 'expense', categoryId: 'jp-food', region: 'JP', date: dateStr, description: 'Seiyu Grocery Supermarket' },
                { id: 'tx-p4-2', amount: 8400, type: 'expense', categoryId: 'jp-food', region: 'JP', date: dateStr, description: 'Life Market Produce' },
                { id: 'tx-p4-3', amount: 16500, type: 'expense', categoryId: 'jp-dining', region: 'JP', date: dateStr, description: 'Sushi Dining Omakase' }, // Over 15k limit!
                { id: 'tx-p4-4', amount: 9800, type: 'expense', categoryId: 'jp-transport', region: 'JP', date: dateStr, description: 'Tokyo Metro Pass' },
                { id: 'tx-p4-5', amount: 12000, type: 'expense', categoryId: 'jp-shopping', region: 'JP', date: dateStr, description: 'Uniqlo Ginza Autumn' },
                { id: 'tx-p4-6', amount: 7200, type: 'expense', categoryId: 'jp-utility-electric', region: 'JP', date: dateStr, description: 'TEPCO Electricity' },
                // IN expenses
                { id: 'tx-p4-7', amount: 18500, type: 'expense', categoryId: 'in-ration', region: 'IN', date: dateStr, description: 'Supermarket Provisions' },
                { id: 'tx-p4-8', amount: 5400, type: 'expense', categoryId: 'in-petrol', region: 'IN', date: dateStr, description: 'HP Petrol Fuel' }
            ];

            // Set India category budgets
            const inCats = storage.state.categories.IN;
            const inRation = inCats.find(c => c.id === 'in-ration');
            if (inRation) inRation.budget = 25000;
            const inPetrol = inCats.find(c => c.id === 'in-petrol');
            if (inPetrol) inPetrol.budget = 6000;
            const inRent = inCats.find(c => c.id === 'in-rent');
            if (inRent) inRent.budget = 20000;

            storage.saveData();
            app.init();
            app.setPrivacyHidden(false);
            app.switchView('budgets-view');
            app.setBudgetsRegion('JP');
            return true;
        })();
        """)
        await asyncio.sleep(0.5)

        print("TEST 1: VERIFYING BUDGEST WORKSPACE LAYOUT & KPI STRUCTURE (NO OVERSIZED WRAPPER)")
        kpi_check = await eval_js("""
        (() => {
            const banner = document.getElementById('budgets-summary-banner');
            const kpiCards = banner ? banner.querySelectorAll('.budgets-kpi-card') : [];
            const isGrid = banner ? getComputedStyle(banner).display === 'grid' : false;
            const cardValues = Array.from(kpiCards).map(c => ({
                label: c.querySelector('.budgets-kpi-label')?.innerText,
                val: c.querySelector('.budgets-kpi-value')?.innerText,
                footer: c.querySelector('.budgets-kpi-footer')?.innerText
            }));

            // Check that banner itself is NOT wrapped in another card
            const parent = banner ? banner.parentElement : null;
            const hasOuterNestedCard = banner && banner.classList.contains('card') && banner.querySelector('.budgets-summary-grid');

            return {
                isGrid,
                kpiCount: kpiCards.length,
                hasOuterNestedCard: Boolean(hasOuterNestedCard),
                cardValues
            };
        })();
        """)
        print(f"  KPI Cards Count: {kpi_check['kpiCount']} (Expected 4)")
        print(f"  Display is Grid: {kpi_check['isGrid']}")
        print(f"  Has Outer Nested Card: {kpi_check['hasOuterNestedCard']} (Expected False)")
        print(f"  Card Values: {kpi_check['cardValues']}")
        assert kpi_check['kpiCount'] == 4, "Must have exactly 4 first-class KPI cards"
        assert not kpi_check['hasOuterNestedCard'], "Oversized nested card wrapper must be removed"
        assert '250,000' in kpi_check['cardValues'][0]['val'], "Overall budget must display ¥250,000"

        print("\nTEST 2: VERIFYING PROGRESS INDICATORS AND REMOVAL OF SAFE/UNCAPPED LABELS")
        labels_check = await eval_js("""
        (() => {
            const textContent = document.getElementById('budgets-view')?.innerText || '';
            const hasSafe = textContent.includes('Safe');
            const hasUncapped = textContent.includes('Uncapped');
            
            // Check progress streak elements
            const streaks = document.querySelectorAll('.budget-cat-card .budget-streak-track');
            const overbudgetCard = document.querySelector('.budget-cat-card.is-overbudget');
            const overspendPill = overbudgetCard ? overbudgetCard.querySelector('.budget-overspend-pill')?.innerText : null;

            return {
                hasSafe,
                hasUncapped,
                streakCount: streaks.length,
                hasOverbudgetCard: Boolean(overbudgetCard),
                overspendPill
            };
        })();
        """)
        print(f"  Contains 'Safe' label: {labels_check['hasSafe']} (Expected False)")
        print(f"  Contains 'Uncapped' label: {labels_check['hasUncapped']} (Expected False)")
        print(f"  Category Progress Streaks: {labels_check['streakCount']}")
        print(f"  Over-Budget Card Found: {labels_check['hasOverbudgetCard']}")
        print(f"  Overspend Pill Text: {labels_check['overspendPill']}")
        assert not labels_check['hasSafe'], "Must remove redundant 'Safe' label"
        assert not labels_check['hasUncapped'], "Must remove redundant 'Uncapped' label"
        assert labels_check['hasOverbudgetCard'], "Dining Out (16,500 vs 15,000 limit) must be marked overbudget"
        assert 'over' in (labels_check['overspendPill'] or '').lower(), "Must show explicit overspend pill"

        print("\nTEST 3: VERIFYING CATEGORY FILTER SEGMENTED CONTROL (ALL / ACTIVE / OVER)")
        filter_check = await eval_js("""
        (() => {
            const initialCount = document.querySelectorAll('.budget-cat-card').length;
            app.setBudgetsCategoryFilter('over');
            const overCount = document.querySelectorAll('.budget-cat-card').length;
            app.setBudgetsCategoryFilter('all');
            const restoredCount = document.querySelectorAll('.budget-cat-card').length;

            return {
                initialCount,
                overCount,
                restoredCount
            };
        })();
        """)
        print(f"  Total Categories: {filter_check['initialCount']}, Over-Budget Filter: {filter_check['overCount']}, Restored: {filter_check['restoredCount']}")
        assert filter_check['overCount'] == 1, "Should filter to exactly 1 over-budget category (Dining Out)"
        assert filter_check['restoredCount'] == filter_check['initialCount'], "Must restore all categories on 'all'"

        print("\nTEST 4: CAPTURING RESPONSIVE VIEWPORTS (1920, 1440, 1280, 390)")
        await capture_screen("pass4_budgets_desktop_1920.png", width=1920, height=1080)
        await capture_screen("pass4_budgets_desktop_1440.png", width=1440, height=900)
        await capture_screen("pass4_budgets_desktop_1280.png", width=1280, height=800)
        await capture_screen("pass4_budgets_mobile_390.png", width=390, height=844, mobile=True)

        # Reset to 1440
        await send('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
        await asyncio.sleep(0.3)

        print("\nTEST 5: VERIFYING INDIA (INR ₹) REGIONAL SWITCH & ISOLATION")
        await eval_js("app.setBudgetsRegion('IN');")
        await asyncio.sleep(0.4)
        in_check = await eval_js("""
        (() => {
            const bannerVal = document.querySelector('#budgets-summary-banner .budgets-kpi-value')?.innerText;
            const firstCatLimit = document.querySelector('.budget-cat-card .figure-value:last-child')?.innerText;
            const regionActive = document.querySelector('#budgets-country-selector .segment-btn.active')?.getAttribute('data-region');
            return { bannerVal, firstCatLimit, regionActive };
        })();
        """)
        print(f"  India Region Active: {in_check['regionActive']}")
        print(f"  India Overall Budget: {in_check['bannerVal']}")
        print(f"  India Category Limit: {in_check['firstCatLimit']}")
        assert in_check['regionActive'] == 'IN', "Region must be IN"
        assert '₹' in in_check['bannerVal'], "Must display Indian Rupee ₹ symbol"
        assert '75,000' in in_check['bannerVal'], "Must display ₹75,000 limit"
        await capture_screen("pass4_budgets_india_1440.png", width=1440, height=900)

        # Return to JP
        await eval_js("app.setBudgetsRegion('JP');")
        await asyncio.sleep(0.3)

        print("\nTEST 6: VERIFYING LOGICAL CATEGORY GROUPS IN MODAL & ICON SELECTION")
        await eval_js("app.openCategoryManageModal('jp-transport', 'JP');")
        await asyncio.sleep(0.4)
        modal_groups_check = await eval_js("""
        (() => {
            const modal = document.getElementById('category-manage-modal');
            const isOpen = modal && modal.classList.contains('active');
            const pills = Array.from(document.querySelectorAll('#icon-group-pills .icon-group-pill')).map(p => p.innerText.trim());
            const previewIcon = document.getElementById('cat-selected-icon-preview')?.getAttribute('data-lucide');
            const previewName = document.getElementById('cat-selected-icon-name')?.innerText;

            // Test clicking 'Travel & Commute' group
            const travelPill = Array.from(document.querySelectorAll('.icon-group-pill')).find(p => p.innerText.includes('Travel'));
            if (travelPill) travelPill.click();

            return {
                isOpen,
                pillsCount: pills.length,
                pills: pills.slice(0, 5),
                previewIcon,
                previewName
            };
        })();
        """)
        print(f"  Modal Opened: {modal_groups_check['isOpen']}")
        print(f"  Icon Group Pills Count: {modal_groups_check['pillsCount']} -> {modal_groups_check['pills']}")
        print(f"  Selected Preview: {modal_groups_check['previewIcon']} ({modal_groups_check['previewName']})")
        assert modal_groups_check['isOpen'], "Category Manage modal must open"
        assert modal_groups_check['pillsCount'] >= 8, "Must have logical icon group pills"
        assert modal_groups_check['previewName'] == 'train-front', "Transport icon must be train-front"
        await capture_screen("pass4_category_modal_icon_groups_1440.png", width=1440, height=900)

        # Test selecting a new icon (e.g. 'bus')
        await eval_js("app.selectCategoryIcon('bus');")
        new_icon = await eval_js("document.getElementById('cat-selected-icon-name')?.innerText")
        print(f"  Selected New Icon: {new_icon}")
        assert new_icon == 'bus', "Selected icon must be bus"

        # Close modal
        await eval_js("app.closeCategoryManageModal();")
        await asyncio.sleep(0.3)

        print("\nTEST 7: VERIFYING OVERALL MONTHLY BUDGET EDITING & PERSISTENCE")
        await eval_js("app.openOverallBudgetModal('JP');")
        await asyncio.sleep(0.4)
        await capture_screen("pass4_overall_budget_modal_1440.png", width=1440, height=900)

        # Edit to 260,000 JPY
        await eval_js("""
        (() => {
            const input = document.getElementById('overall-budget-input');
            input.value = '260000';
            app.updateOverallBudgetCushionPreview();
            app.saveOverallBudget();
        })();
        """)
        await asyncio.sleep(0.4)

        persisted_budget = await eval_js("storage.state.jpTotalBudget")
        banner_val = await eval_js("document.querySelector('#budgets-summary-banner .budgets-kpi-value')?.innerText")
        print(f"  Persisted jpTotalBudget in storage: {persisted_budget}")
        print(f"  Updated Banner Display: {banner_val}")
        assert persisted_budget == 260000, "storage.state.jpTotalBudget must be updated to 260000"
        assert '260,000' in banner_val, "Banner must reflect 260,000"

        # Test application reinitialization & storage persistence
        await eval_js("app.init(); app.setPrivacyHidden(false); app.switchView('budgets-view'); app.setBudgetsRegion('JP');")
        await asyncio.sleep(0.4)
        reinit_budget = await eval_js("storage.state.jpTotalBudget")
        reinit_banner = await eval_js("document.querySelector('#budgets-summary-banner .budgets-kpi-value')?.innerText")
        print(f"  After app.init(): jpTotalBudget = {reinit_budget}, Banner = {reinit_banner}")
        assert reinit_budget == 260000, "Must persist across app.init() reinitialization"

        print("\nTEST 8: VERIFYING CATEGORY CREATION & NON-DUPLICATION ON EDIT")
        cat_create_res = await eval_js("""
        (() => {
            const initialCount = storage.state.categories.JP.length;
            // Create a new category
            app.openCategoryManageModal(null, 'JP');
            document.getElementById('cat-edit-name').value = 'Fitness & Gym';
            document.getElementById('cat-edit-budget').value = '9000';
            app.selectCategoryIcon('dumbbell');
            app.saveCategoryConfig();
            const afterCreateCount = storage.state.categories.JP.length;
            const newCat = storage.state.categories.JP.find(c => c.name === 'Fitness & Gym');

            // Now edit this category without duplicating
            app.openCategoryManageModal(newCat.id, 'JP');
            document.getElementById('cat-edit-budget').value = '10500';
            app.saveCategoryConfig();
            const afterEditCount = storage.state.categories.JP.length;
            const updatedCat = storage.state.categories.JP.find(c => c.id === newCat.id);

            return {
                initialCount,
                afterCreateCount,
                afterEditCount,
                newCatBudget: updatedCat ? updatedCat.budget : 0,
                newCatIcon: updatedCat ? updatedCat.icon : ''
            };
        })();
        """)
        print(f"  Category Create/Edit Result: {cat_create_res}")
        assert cat_create_res['afterCreateCount'] == cat_create_res['initialCount'] + 1, "Must add exactly 1 category"
        assert cat_create_res['afterEditCount'] == cat_create_res['afterCreateCount'], "Editing must NOT create duplicate category"
        assert cat_create_res['newCatBudget'] == 10500, "Category budget must be updated to 10500"
        assert cat_create_res['newCatIcon'] == 'dumbbell', "Category icon must be dumbbell"

        print("\nTEST 9: PRIVACY CONCEALMENT AUDIT ON BUDGETS PAGE")
        privacy_res = await eval_js("""
        (() => {
            const blurCountBefore = document.querySelectorAll('.privacy-blur').length;
            app.setPrivacyHidden(true);
            const bannerConcealed = document.querySelector('#budgets-summary-banner .budgets-kpi-value')?.innerText;
            const isHidden = app.isPrivacyHidden;
            app.setPrivacyHidden(false); // reset
            const bannerRevealed = document.querySelector('#budgets-summary-banner .budgets-kpi-value')?.innerText;
            return { blurCountBefore, isHidden, bannerConcealed, bannerRevealed };
        })();
        """)
        print(f"  Elements with .privacy-blur: {privacy_res['blurCountBefore']}")
        print(f"  Privacy Active: {privacy_res['isHidden']} -> Banner: {privacy_res['bannerConcealed']}")
        print(f"  Privacy Reset: Banner: {privacy_res['bannerRevealed']}")
        assert privacy_res['blurCountBefore'] >= 8, "Must protect all monetary values with .privacy-blur"
        assert privacy_res['isHidden'], "app.isPrivacyHidden must be true when concealed"
        assert privacy_res['bannerConcealed'] == '******', "Monetary values must be concealed as '******'"
        assert '260,000' in privacy_res['bannerRevealed'], "Monetary values must be revealed after toggle"

        print("\n====================================================================")
        print("ALL 9 PASS 4 VERIFICATION TESTS PASSED SUCCESSFULLY!")
        print("====================================================================\n")

    finally:
        if ws:
            await ws.close()
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    asyncio.run(main())
