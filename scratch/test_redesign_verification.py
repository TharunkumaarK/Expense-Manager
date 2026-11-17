import urllib.request, json, time, subprocess, asyncio, websockets, base64

CHROME_BIN = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'

async def run_tests():
    p = subprocess.Popen([
        CHROME_BIN,
        '--headless=new',
        '--remote-debugging-port=9455',
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=/tmp/test_chrome_profile_verify',
        'about:blank'
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    try:
        with urllib.request.urlopen('http://127.0.0.1:9455/json') as r:
            tabs = json.loads(r.read().decode())
        ws_url = tabs[0]['webSocketDebuggerUrl']

        async with websockets.connect(ws_url) as ws:
            msg_id = 0
            async def send(method, params=None):
                nonlocal msg_id
                msg_id += 1
                payload = {'id': msg_id, 'method': method}
                if params: payload['params'] = params
                await ws.send(json.dumps(payload))
                while True:
                    resp = json.loads(await ws.recv())
                    if resp.get('id') == msg_id:
                        return resp

            async def eval_js(expr):
                r = await send('Runtime.evaluate', {
                    'expression': expr,
                    'awaitPromise': True,
                    'returnByValue': True
                })
                return r.get('result', {}).get('result', {}).get('value')

            async def take_screenshot(filename):
                r = await send('Page.captureScreenshot', {'format': 'png'})
                img_data = r.get('result', {}).get('data')
                if img_data:
                    with open(filename, 'wb') as f:
                        f.write(base64.b64decode(img_data))
                    print(f"Saved screenshot: {filename}")

            await send('Page.enable')
            await send('Runtime.enable')

            mock_script = '''
                window.supabase = {
                    createClient: () => ({
                        auth: {
                            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
                            getSession: async () => ({ data: { session: { user: { id: 'test-user-1' } } } }),
                            getUser: async () => ({ data: { user: { id: 'test-user-1' } } })
                        },
                        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) })
                    })
                };
                window.Chart = class {
                    constructor() { this.data = {}; }
                    destroy() {}
                    update() {}
                };
                window.Chart.register = () => {};
                window.lucide = { createIcons: () => {} };
            '''
            await send('Page.addScriptToEvaluateOnNewDocument', {'source': mock_script})

            await send('Emulation.setDeviceMetricsOverride', {
                'width': 1280,
                'height': 800,
                'deviceScaleFactor': 1,
                'mobile': False
            })

            file_url = 'file:///mnt/01DB426183A10370/E_Software/Docs/Antigravity Expense Manager/Expense-Manager/index.html'
            await send('Page.navigate', {'url': file_url})
            await asyncio.sleep(2)

            # Setup dummy state with Japan & India wallets
            setup_code = '''
                storage.state = {
                    wallets: {
                        'Salary Account': { id: 'Salary Account', type: 'bank', balance: 350000, region: 'JP', currency: '¥', theme: 'emerald' },
                        'PayPay': { id: 'PayPay', type: 'wallet', balance: 18000, region: 'JP', currency: '¥', theme: 'crimson' },
                        'HDFC Bank': { id: 'HDFC Bank', type: 'bank', balance: 150000, region: 'IN', currency: '₹', theme: 'navy' }
                    },
                    transactions: [
                        { id: 'tx-1', type: 'expense', walletId: 'Salary Account', amount: 5000, categoryId: 'food', date: '2026-11-15', note: 'Dinner' },
                        { id: 'tx-2', type: 'income', walletId: 'Salary Account', amount: 300000, categoryId: 'salary', date: '2026-11-01', note: 'Salary' }
                    ],
                    categories: {
                        food: { name: 'Food', icon: 'utensils', region: 'JP' },
                        salary: { name: 'Salary', icon: 'briefcase', region: 'JP' }
                    }
                };
                app.renderAll();
                app.openCountryExpansion('JP');
            '''
            await eval_js(setup_code)
            await asyncio.sleep(0.5)

            # 1. Check Country Expansion Header & Back Button
            back_display = await eval_js("document.getElementById('focus-back-btn').style.display")
            divider_display = await eval_js("document.getElementById('focus-header-divider').style.display")
            badge_text = await eval_js("document.getElementById('focus-type-badge').innerText")
            title_text = await eval_js("document.getElementById('focus-modal-title').innerText")

            print(f"[TEST 1] Country Overview Header:")
            print(f"  backBtn display: '{back_display}' (expected: 'none')")
            print(f"  divider display: '{divider_display}' (expected: 'none')")
            print(f"  badge text: '{badge_text}' (expected: 'Country Portfolio')")
            print(f"  title text: '{title_text}' (expected: 'Japan Overview')")

            # Check wallet item hover transform rule
            hover_transform = await eval_js('''
                (() => {
                    const el = document.querySelector('.focus-associated-wallet-row');
                    return window.getComputedStyle(el).transform;
                })()
            ''')
            print(f"  wallet row transform: '{hover_transform}' (expected: 'none')")

            await take_screenshot('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/country_overview_verified.png')

            # 2. Click "Add Transaction" in Country Overview
            await eval_js('''(() => {
                const b = document.querySelector('.focus-country-actions button');
                if (b) b.click();
            })()''')
            await asyncio.sleep(0.3)

            modal_active = await eval_js("document.getElementById('tx-action-selector-modal').classList.contains('active')")
            sub_text = await eval_js("document.getElementById('tx-selector-sub').innerText")
            card_count = await eval_js("document.querySelectorAll('#tx-action-selector-modal .action-type-card').length")

            print(f"[TEST 2] Add Transaction Modal from Country Overview:")
            print(f"  modal active: {modal_active} (expected: True)")
            print(f"  subtitle: '{sub_text}' (expected: 'Record for Japan (JPY)')")
            print(f"  action cards count: {card_count} (expected: 4)")

            await take_screenshot('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/country_add_tx_selector_verified.png')

            # Click "Log Expense"
            await eval_js("document.getElementById('btn-select-tx-expense').click()")
            await asyncio.sleep(0.3)

            tx_modal_active = await eval_js("document.getElementById('transaction-modal').classList.contains('active')")
            selected_wallet = await eval_js("document.getElementById('tx-wallet').value")
            focus_overlay_active = await eval_js("document.getElementById('focus-overlay').classList.contains('active')")

            print(f"  transaction modal active: {tx_modal_active} (expected: True)")
            print(f"  preselected wallet: '{selected_wallet}' (expected: 'Salary Account')")
            print(f"  focus overlay active: {focus_overlay_active} (expected: False)")

            # Close transaction modal
            await eval_js("app.closeModal('transaction-modal')")
            await asyncio.sleep(0.3)

            # 3. Drill down into Salary Account from Country Overview
            await eval_js("app.openCountryExpansion('JP')")
            await asyncio.sleep(0.3)
            await eval_js('''(() => {
                const item = document.querySelector('.focus-associated-wallet-row');
                if (item) item.click();
            })()''')
            await asyncio.sleep(0.3)

            back_display_wallet = await eval_js("document.getElementById('focus-back-btn').style.display")
            back_label = await eval_js("document.getElementById('focus-back-label').innerText")
            divider_display_wallet = await eval_js("document.getElementById('focus-header-divider').style.display")
            badge_display_wallet = await eval_js("document.getElementById('focus-type-badge').style.display")
            wallet_title = await eval_js("document.getElementById('focus-modal-title').innerText")

            print(f"[TEST 3] Wallet Focus Header (Breadcrumb):")
            print(f"  backBtn display: '{back_display_wallet}' (expected: 'inline-flex')")
            print(f"  backLabel: '{back_label}' (expected: 'Japan Overview')")
            print(f"  divider display: '{divider_display_wallet}' (expected: 'inline')")
            print(f"  badge display: '{badge_display_wallet}' (expected: 'none')")
            print(f"  modal title: '{wallet_title}' (expected: 'Salary Account')")

            await take_screenshot('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/wallet_focus_breadcrumb_verified.png')

            # Click "Add Transaction" in Wallet Focus
            await eval_js('''(() => {
                const wb = document.querySelector('.focus-wallet-actions button');
                if (wb) wb.click();
            })()''')
            await asyncio.sleep(0.3)

            w_modal_active = await eval_js("document.getElementById('tx-action-selector-modal').classList.contains('active')")
            w_sub_text = await eval_js("document.getElementById('tx-selector-sub').innerText")

            print(f"[TEST 4] Add Transaction Modal from Wallet Focus:")
            print(f"  modal active: {w_modal_active} (expected: True)")
            print(f"  subtitle: '{w_sub_text}' (expected: 'Record for Salary Account')")

            # Click transfer
            await eval_js("document.getElementById('btn-select-tx-transfer').click()")
            await asyncio.sleep(0.3)
            src_val = await eval_js("document.getElementById('tx-source').value")
            dest_val = await eval_js("document.getElementById('tx-dest').value")
            print(f"  transfer source preselected: '{src_val}' (expected: 'Salary Account')")
            print(f"  transfer dest preselected: '{dest_val}' (expected: not 'Salary Account')")

            await eval_js("app.closeModal('transaction-modal')")
            await asyncio.sleep(0.3)

            # 4. Test clicking the breadcrumb back button
            await eval_js("app.openCountryExpansion('JP')")
            await asyncio.sleep(0.2)
            await eval_js("document.querySelector('.focus-associated-wallet-row').click()")
            await asyncio.sleep(0.2)
            await eval_js("document.getElementById('focus-back-btn').click()")
            await asyncio.sleep(0.3)

            returned_title = await eval_js("document.getElementById('focus-modal-title').innerText")
            returned_back_display = await eval_js("document.getElementById('focus-back-btn').style.display")
            print(f"[TEST 5] Breadcrumb Back Navigation:")
            print(f"  title after back: '{returned_title}' (expected: 'Japan Overview')")
            print(f"  backBtn display: '{returned_back_display}' (expected: 'none')")

            # 5. Mobile Emulation (390 x 844 iPhone 12)
            await send('Emulation.setDeviceMetricsOverride', {
                'width': 390,
                'height': 844,
                'deviceScaleFactor': 2,
                'mobile': True
            })
            await asyncio.sleep(0.3)

            await eval_js("app.openCountryExpansion('JP')")
            await asyncio.sleep(0.3)
            await take_screenshot('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/mobile_country_overview_verified.png')

            await eval_js("document.querySelector('.focus-associated-wallet-row').click()")
            await asyncio.sleep(0.3)
            await take_screenshot('/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128/mobile_wallet_breadcrumb_verified.png')

            print("All verification steps completed successfully!")

    finally:
        p.terminate()

asyncio.run(run_tests())
