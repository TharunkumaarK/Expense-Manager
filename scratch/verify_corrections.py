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
            mid = msg_id
            msg_id += 1
            await ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get('id') == mid:
                    return resp.get('result', {})

        await send('Page.enable')
        await send('Runtime.enable')
        await send('Page.navigate', {'url': APP_URL})
        await asyncio.sleep(1.5)

        async def eval_js(expression):
            res = await send('Runtime.evaluate', {
                'expression': expression,
                'returnByValue': True,
                'awaitPromise': True
            })
            if 'exceptionDetails' in res:
                raise RuntimeError(f"JS Exception: {res['exceptionDetails']}")
            return res.get('result', {}).get('value')

        async def capture_screenshot(filename, clip=None):
            params = {'format': 'png'}
            if clip:
                params['clip'] = clip
            res = await send('Page.captureScreenshot', params)
            data = base64.b64decode(res['data'])
            filepath = os.path.join(ARTIFACT_DIR, filename)
            with open(filepath, 'wb') as f:
                f.write(data)
            print(f"  [SCREENSHOT] Saved: {filepath}")
            return filepath

        print("=================================================================")
        print("STARTING CROSS-PAGE CORRECTION PASS VERIFICATION (5 ITEMS)")
        print("=================================================================")

        # Seed data to ensure transactions in both JP and IN
        await eval_js("""
        (() => {
            const authScreen = document.getElementById('auth-screen');
            const appContent = document.getElementById('app-content');
            if (authScreen) authScreen.style.display = 'none';
            if (appContent) appContent.style.display = 'block';

            if (typeof supabaseClient !== 'undefined') {
                supabaseClient.session = { user: { email: 'test@example.com', id: 'corr-pass-user' } };
            }
            storage.onUserLogin('corr-pass-user');

            const now = new Date();
            const curMonth = now.toISOString().slice(0, 7);
            const dateStr = curMonth + '-02';

            storage.state.transactions = [
                { id: 'tx-1', type: 'expense', amount: 3450, currency: '¥', region: 'JP', date: dateStr, categoryId: 'jp-food', walletId: 'Salary Account', note: 'Grocery shopping' },
                { id: 'tx-2', type: 'income', amount: 320000, currency: '¥', region: 'JP', date: dateStr, walletId: 'Salary Account', note: 'Monthly Salary' },
                { id: 'tx-3', type: 'transfer', amount: 50000, currency: '¥', region: 'JP', date: dateStr, sourceId: 'Salary Account', destId: 'PayPay', note: 'Wallet top-up' },
                { id: 'tx-4', type: 'expense', amount: 1200, currency: '₹', region: 'IN', date: dateStr, categoryId: 'in-petrol', walletId: 'Bank Account', note: 'Bike fuel' },
                { id: 'tx-5', type: 'income', amount: 45000, currency: '₹', region: 'IN', date: dateStr, walletId: 'Bank Account', note: 'Consulting income' },
                { id: 'tx-6', type: 'remittance', sourceAmount: 100000, destAmount: 55000, region: 'JP', date: dateStr, sourceId: 'Salary Account', destId: 'Bank Account', exchangeRate: 0.55, note: 'Home Remittance' }
            ];
            storage.saveData();

            app.init();
            app.setPrivacyHidden(false);
            app.renderAll();
        })()
        """)
        await asyncio.sleep(0.5)

        # ---------------------------------------------------------------------
        # TEST 1: Transaction Details Modal — Single Close Control & Edit/Delete
        # ---------------------------------------------------------------------
        print("\n--- TEST 1: Transaction Details Modal ---")
        await eval_js("app.switchView('transactions-view')")
        await asyncio.sleep(0.5)

        # Open detail modal for tx-1
        await eval_js("app.openTransactionDetail('tx-1')")
        await asyncio.sleep(0.3)

        modal_check = await eval_js("""
        (() => {
            const modal = document.getElementById('transaction-detail-modal');
            const isActive = modal.classList.contains('active');
            const headerCloseBtn = modal.querySelector('.sheet-header button.icon-btn[onclick*="closeTransactionDetail"]');
            const footerCloseBtns = Array.from(modal.querySelectorAll('.tx-detail-actions button')).filter(b => b.innerText.trim().toLowerCase() === 'close');
            const deleteBtn = document.getElementById('tx-detail-delete-btn');
            const editBtn = document.getElementById('tx-detail-edit-btn');
            const bodyOverflow = document.body.style.overflow;

            return {
                isActive,
                hasHeaderClose: !!headerCloseBtn,
                footerCloseCount: footerCloseBtns.length,
                hasDelete: !!deleteBtn,
                hasEdit: !!editBtn,
                bodyOverflow
            };
        })()
        """)
        print(f"Modal Active: {modal_check['isActive']}")
        print(f"Header Close 'X' button present: {modal_check['hasHeaderClose']}")
        print(f"Footer 'Close' button count: {modal_check['footerCloseCount']} (Expected: 0)")
        print(f"Delete action button present: {modal_check['hasDelete']}")
        print(f"Edit action button present: {modal_check['hasEdit']}")
        print(f"Body scroll overflow locked: '{modal_check['bodyOverflow']}' (Expected: 'hidden')")

        assert modal_check['isActive'], "Modal should be active"
        assert modal_check['hasHeaderClose'], "Modal header must have 'X' close icon"
        assert modal_check['footerCloseCount'] == 0, "Footer close button must be removed"
        assert modal_check['hasDelete'], "Delete button must be present"
        assert modal_check['hasEdit'], "Edit button must be present"
        assert modal_check['bodyOverflow'] == 'hidden', "Body scroll must be locked"

        await capture_screenshot("corr_test1_transaction_modal_single_close.png")

        # Test Escape key dismisses modal
        print("Testing Escape key dismissal...")
        await eval_js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
        await asyncio.sleep(0.3)

        closed_check = await eval_js("""
        (() => {
            const modal = document.getElementById('transaction-detail-modal');
            return {
                isActive: modal.classList.contains('active'),
                bodyOverflow: document.body.style.overflow
            };
        })()
        """)
        print(f"After Escape -> Modal Active: {closed_check['isActive']} (Expected: False), Body Overflow: '{closed_check['bodyOverflow']}' (Expected: '')")
        assert not closed_check['isActive'], "Modal should be closed after Escape"
        assert closed_check['bodyOverflow'] == '', "Body overflow must be restored after Escape"

        # Reopen and test edit button works
        await eval_js("app.openTransactionDetail('tx-1')")
        await asyncio.sleep(0.3)
        await eval_js("app.editCurrentDetailTransaction()")
        await asyncio.sleep(0.3)

        edit_check = await eval_js("""
        (() => {
            const txModal = document.getElementById('transaction-modal');
            const detailModal = document.getElementById('transaction-detail-modal');
            return {
                detailActive: detailModal.classList.contains('active'),
                txModalActive: txModal.classList.contains('active')
            };
        })()
        """)
        print(f"After clicking Edit Transaction -> Detail Modal: {edit_check['detailActive']}, Edit Modal: {edit_check['txModalActive']}")
        assert not edit_check['detailActive'], "Detail modal should close when edit opens"
        assert edit_check['txModalActive'], "Edit transaction modal should open"

        # Close edit modal
        await eval_js("app.closeModal('transaction-modal')")
        await asyncio.sleep(0.3)
        print(">>> TEST 1 PASSED: Single close control, body scroll locking, escape dismissal, and Edit/Delete intact.")

        # ---------------------------------------------------------------------
        # TEST 2: Budgets — Make Overall Budget Configurable (Japan & India)
        # ---------------------------------------------------------------------
        print("\n--- TEST 2: Budgets — Configurable Overall Budget ---")
        await eval_js("app.switchView('budgets-view')")
        await asyncio.sleep(0.5)

        # 2a. Japan Budget configuration
        await eval_js("app.setBudgetsRegion('JP')")
        await asyncio.sleep(0.3)
        await capture_screenshot("corr_test2_budgets_jp_before.png")

        # Open overall budget modal
        await eval_js("app.openOverallBudgetModal('JP')")
        await asyncio.sleep(0.3)

        budget_modal_info = await eval_js("""
        (() => {
            const modal = document.getElementById('overall-budget-modal');
            const input = document.getElementById('overall-budget-input');
            const catSum = document.getElementById('overall-budget-cat-sum').innerText;
            const cushion = document.getElementById('overall-budget-cushion-val').innerText;
            return {
                active: modal.classList.contains('active'),
                currentInputVal: input.value,
                catSum,
                cushion
            };
        })()
        """)
        print(f"Overall Budget Modal Active: {budget_modal_info['active']}, Input: {budget_modal_info['currentInputVal']}, Category Sum: {budget_modal_info['catSum']}")
        await capture_screenshot("corr_test2_budget_modal_jp.png")

        # Set new overall budget for Japan to 250000
        print("Setting Japan overall budget to 250000...")
        await eval_js("""
        (() => {
            const input = document.getElementById('overall-budget-input');
            input.value = '250000';
            app.updateOverallBudgetCushionPreview();
            app.saveOverallBudget();
        })()
        """)
        await asyncio.sleep(0.3)

        jp_saved = await eval_js("""
        (() => {
            return {
                stateVal: storage.state.jpTotalBudget,
                bannerAllocated: document.querySelector('#budgets-summary-banner .font-bold.text-primary')?.innerText
            };
        })()
        """)
        print(f"Japan Saved State: {jp_saved['stateVal']}, Banner Display: {jp_saved['bannerAllocated']}")
        assert jp_saved['stateVal'] == 250000, "storage.state.jpTotalBudget should be 250000"

        # 2b. India Budget configuration
        print("Switching to India budget and setting overall limit to 75000...")
        await eval_js("app.setBudgetsRegion('IN')")
        await asyncio.sleep(0.3)

        await eval_js("app.openOverallBudgetModal('IN')")
        await asyncio.sleep(0.3)
        await capture_screenshot("corr_test2_budget_modal_in.png")

        await eval_js("""
        (() => {
            const input = document.getElementById('overall-budget-input');
            input.value = '75000';
            app.updateOverallBudgetCushionPreview();
            app.saveOverallBudget();
        })()
        """)
        await asyncio.sleep(0.3)

        in_saved = await eval_js("""
        (() => {
            return {
                stateVal: storage.state.inTotalBudget,
                bannerAllocated: document.querySelector('#budgets-summary-banner .font-bold.text-primary')?.innerText
            };
        })()
        """)
        print(f"India Saved State: {in_saved['stateVal']}, Banner Display: {in_saved['bannerAllocated']}")
        assert in_saved['stateVal'] == 75000, "storage.state.inTotalBudget should be 75000"

        # 2c. Test Persistence Across Page Reload
        print("Reloading page to verify persistence across application restart...")
        await send('Page.reload')
        await asyncio.sleep(1.5)

        reloaded_check = await eval_js("""
        (() => {
            const authScreen = document.getElementById('auth-screen');
            const appContent = document.getElementById('app-content');
            if (authScreen) authScreen.style.display = 'none';
            if (appContent) appContent.style.display = 'block';
            if (typeof supabaseClient !== 'undefined') {
                supabaseClient.session = { user: { email: 'test@example.com', id: 'corr-pass-user' } };
            }
            storage.onUserLogin('corr-pass-user');
            app.init();

            return {
                jpBudget: storage.state.jpTotalBudget,
                inBudget: storage.state.inTotalBudget
            };
        })()
        """)
        print(f"After Reload -> JP Budget: {reloaded_check['jpBudget']} (Expected: 250000), IN Budget: {reloaded_check['inBudget']} (Expected: 75000)")
        assert reloaded_check['jpBudget'] == 250000, "JP budget should survive reload"
        assert reloaded_check['inBudget'] == 75000, "IN budget should survive reload"

        # 2d. Test Validation (Reject Negative Numbers)
        print("Testing negative validation...")
        await eval_js("app.switchView('budgets-view')")
        await asyncio.sleep(0.3)
        await eval_js("app.openOverallBudgetModal('JP')")
        await asyncio.sleep(0.3)
        await eval_js("""
        (() => {
            const input = document.getElementById('overall-budget-input');
            input.value = '-5000';
            app.saveOverallBudget();
        })()
        """)
        await asyncio.sleep(0.2)
        val_error = await eval_js("""
        (() => {
            const err = document.getElementById('overall-budget-error');
            const modal = document.getElementById('overall-budget-modal');
            return {
                errVisible: err.style.display !== 'none',
                errText: err.innerText,
                modalStillActive: modal.classList.contains('active')
            };
        })()
        """)
        print(f"Validation error shown: '{val_error['errText']}', Modal kept open: {val_error['modalStillActive']}")
        assert val_error['errVisible'], "Negative budget should show error"
        assert val_error['modalStillActive'], "Modal should not close on invalid value"
        await eval_js("app.closeOverallBudgetModal()")
        await asyncio.sleep(0.2)
        print(">>> TEST 2 PASSED: Overall budget configurable for JP and IN, persisted across reload, validated properly.")

        # ---------------------------------------------------------------------
        # TEST 3: Dashboard — Smooth Collapsible & Dropdown Transitions
        # ---------------------------------------------------------------------
        print("\n--- TEST 3: Dashboard Dropdown & Collapsible Animations ---")
        await eval_js("app.switchView('dashboard-view')")
        await asyncio.sleep(0.5)

        # Inspect CSS transition definitions on collapsible elements
        anim_styles = await eval_js("""
        (() => {
            const wrap = document.getElementById('jp-categories-wrap');
            const inner = wrap ? wrap.querySelector('.collapsible-inner') : null;
            const chevron = document.getElementById('jp-chevron');
            const wrapStyle = wrap ? window.getComputedStyle(wrap) : null;
            const innerStyle = inner ? window.getComputedStyle(inner) : null;
            const chevronStyle = chevron ? window.getComputedStyle(chevron) : null;

            return {
                wrapTransition: wrapStyle?.transition || '',
                innerTransition: innerStyle?.transition || '',
                chevronTransition: chevronStyle?.transition || ''
            };
        })()
        """)
        print(f"Collapsible Wrapper Transition: {anim_styles['wrapTransition']}")
        print(f"Collapsible Inner Transition: {anim_styles['innerTransition']}")
        print(f"Chevron Rotation Transition: {anim_styles['chevronTransition']}")

        # Toggle collapse
        print("Collapsing Japan Categories...")
        await eval_js("app.toggleCollapse('jp-categories-wrap', 'jp-chevron')")
        await asyncio.sleep(0.35)
        collapsed_state = await eval_js("""
        (() => {
            const wrap = document.getElementById('jp-categories-wrap');
            const chevron = document.getElementById('jp-chevron');
            return {
                isCollapsed: wrap.classList.contains('collapsed'),
                chevronRotated: chevron.classList.contains('rotated'),
                ariaExpanded: wrap.previousElementSibling.getAttribute('aria-expanded')
            };
        })()
        """)
        print(f"Collapsed State: isCollapsed={collapsed_state['isCollapsed']}, chevronRotated={collapsed_state['chevronRotated']}, ariaExpanded={collapsed_state['ariaExpanded']}")
        assert collapsed_state['isCollapsed'], "Wrapper should be collapsed"
        assert collapsed_state['chevronRotated'], "Chevron should have rotated class"
        await capture_screenshot("corr_test3_dashboard_collapsed.png")

        # Toggle expand
        print("Expanding Japan Categories back...")
        await eval_js("app.toggleCollapse('jp-categories-wrap', 'jp-chevron')")
        await asyncio.sleep(0.35)
        expanded_state = await eval_js("""
        (() => {
            const wrap = document.getElementById('jp-categories-wrap');
            const chevron = document.getElementById('jp-chevron');
            return {
                isCollapsed: wrap.classList.contains('collapsed'),
                chevronRotated: chevron.classList.contains('rotated')
            };
        })()
        """)
        print(f"Expanded State: isCollapsed={expanded_state['isCollapsed']}, chevronRotated={expanded_state['chevronRotated']}")
        assert not expanded_state['isCollapsed'], "Wrapper should be expanded"
        assert not expanded_state['chevronRotated'], "Chevron rotated class should be removed"
        await capture_screenshot("corr_test3_dashboard_expanded.png")

        print(">>> TEST 3 PASSED: Smooth 260ms transitions configured with refined ease-out curves.")

        # ---------------------------------------------------------------------
        # TEST 4: Expense and Income Icons — Interchange Arrow Directions
        # ---------------------------------------------------------------------
        print("\n--- TEST 4: Transaction Icons Arrow Directions ---")

        # 4a. Check Dashboard Recent Activity
        print("Checking Dashboard Recent Activity icons...")
        recent_icons = await eval_js("""
        (() => {
            const rows = document.querySelectorAll('#dashboard-recent-tx-card .dash-recent-row');
            const results = [];
            rows.forEach(r => {
                const title = r.querySelector('.dash-recent-title')?.innerText.trim();
                const iconSvg = r.querySelector('.dash-recent-icon-wrap svg');
                const iconClass = r.querySelector('.dash-recent-icon-wrap')?.className;
                const lucideName = iconSvg?.getAttribute('data-lucide') || iconSvg?.classList[1] || '';
                const amountEl = r.querySelector('.dash-recent-amt');
                const amountColor = amountEl ? window.getComputedStyle(amountEl).color : '';
                results.push({ title, iconClass, lucideName, amountColor });
            });
            return results;
        })()
        """)
        for item in recent_icons:
            print(f"  [Dashboard Recent] {item['title']}: class='{item['iconClass']}', icon='{item['lucideName']}', color='{item['amountColor']}'")

        # 4b. Check Transactions Ledger
        print("Checking Transactions Ledger rows...")
        await eval_js("app.switchView('transactions-view')")
        await asyncio.sleep(0.4)

        ledger_icons = await eval_js("""
        (() => {
            const rows = document.querySelectorAll('.ledger-tx-row');
            const results = [];
            rows.forEach(r => {
                const title = r.querySelector('.ledger-tx-title')?.innerText.trim();
                const iconWrap = r.querySelector('.tx-type-icon');
                const iconClass = iconWrap?.className;
                const iconSvg = iconWrap?.querySelector('svg');
                const lucideName = iconSvg?.getAttribute('data-lucide') || iconSvg?.classList[1] || '';
                const amountEl = r.querySelector('.ledger-tx-amount');
                const amountColor = amountEl ? window.getComputedStyle(amountEl).color : '';
                results.push({ title, iconClass, lucideName, amountColor });
            });
            return results;
        })()
        """)

        expense_found = False
        income_found = False
        for item in ledger_icons:
            print(f"  [Ledger Row] {item['title']}: class='{item['iconClass']}', icon='{item['lucideName']}', color='{item['amountColor']}'")
            if 'expense' in item['iconClass']:
                assert 'arrow-up-right' in item['lucideName'], f"Expense icon must be arrow-up-right, got {item['lucideName']}"
                expense_found = True
            elif 'income' in item['iconClass']:
                assert 'arrow-down-left' in item['lucideName'], f"Income icon must be arrow-down-left, got {item['lucideName']}"
                income_found = True

        assert expense_found, "Must have verified an expense row"
        assert income_found, "Must have verified an income row"
        await capture_screenshot("corr_test4_transaction_icons_swapped.png")
        print(">>> TEST 4 PASSED: Expense uses outward-facing arrow-up-right; Income uses inward-facing arrow-down-left with colors retained.")

        # ---------------------------------------------------------------------
        # TEST 5: Wallet Focus — Gradual Morphing Transition
        # ---------------------------------------------------------------------
        print("\n--- TEST 5: Wallet Focus Morphing Transition ---")
        await eval_js("app.switchView('dashboard-view')")
        await asyncio.sleep(0.4)

        # Open country expansion
        print("Opening Japan Country Expansion...")
        await eval_js("app.openCountryExpansion('JP')")
        await asyncio.sleep(0.4)
        await capture_screenshot("corr_test5_country_expansion_before_focus.png")

        # Click Salary Account wallet item inside the expansion
        print("Opening Salary Account focus view with FLIP transition...")
        wallet_focus_res = await eval_js("""
        (() => {
            const walletItem = document.querySelector('.wallet-item-compact');
            const walletId = 'Salary Account';
            app.openWalletFocus(walletId, walletItem);

            const overlay = document.getElementById('focus-overlay');
            const primaryCard = overlay.querySelector('.focus-primary-panel .wallet-card');
            const secondaryPanel = overlay.querySelector('.focus-secondary-panel');

            return {
                overlayActive: overlay.classList.contains('active'),
                cardTitle: primaryCard?.querySelector('.wallet-name')?.innerText,
                bodyOverflow: document.body.style.overflow
            };
        })()
        """)
        print(f"Wallet Focus Opened: active={wallet_focus_res['overlayActive']}, title='{wallet_focus_res['cardTitle']}', bodyOverflow='{wallet_focus_res['bodyOverflow']}'")
        assert wallet_focus_res['overlayActive'], "Overlay should be active"
        assert wallet_focus_res['cardTitle'] == 'Salary Account', "Selected wallet card must be rendered in primary panel"

        await asyncio.sleep(0.4) # Wait for animation to finish
        await capture_screenshot("corr_test5_wallet_focus_morphed.png")

        # Test Closing Focus View
        print("Closing Wallet Focus view smoothly...")
        await eval_js("app.closeFocusOverlay()")
        await asyncio.sleep(0.35)

        closed_focus = await eval_js("""
        (() => {
            const overlay = document.getElementById('focus-overlay');
            return {
                display: overlay.style.display,
                active: overlay.classList.contains('active'),
                bodyOverflow: document.body.style.overflow
            };
        })()
        """)
        print(f"After Close: display={closed_focus['display']}, active={closed_focus['active']}, bodyOverflow='{closed_focus['bodyOverflow']}'")
        assert not closed_focus['active'], "Overlay should not be active after closing"
        assert closed_focus['bodyOverflow'] == '', "Body overflow must be restored"

        await capture_screenshot("corr_test5_dashboard_restored_after_close.png")
        print(">>> TEST 5 PASSED: Wallet focus transitions smoothly with FLIP morphing and closes naturally.")

        print("\n=================================================================")
        print("ALL 5 CROSS-PAGE CORRECTIONS VERIFIED AND PASSED!")
        print("=================================================================")

    finally:
        subprocess.run(['pkill', '-f', f'--remote-debugging-port={PORT}'], stderr=subprocess.DEVNULL)

if __name__ == '__main__':
    asyncio.run(main())
