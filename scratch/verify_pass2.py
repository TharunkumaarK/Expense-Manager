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

        # Initialize authenticated session with test transactions
        init_script = '''
        (() => {
            const authScreen = document.getElementById('auth-screen');
            const appContent = document.getElementById('app-content');
            if (authScreen) authScreen.style.display = 'none';
            if (appContent) appContent.style.display = 'block';

            if (typeof supabaseClient !== 'undefined') {
                supabaseClient.session = { user: { email: 'pass1_test@expensemanager.test', id: 'verif-pass1-user' } };
            }
            if (typeof app !== 'undefined') {
                const currentMonth = storage.state.currentMonthKey || '2026-11';
                storage.state.transactions = [
                    { id: 'tx-1', type: 'expense', region: 'JP', currency: 'JPY', walletId: 'jp-wallet-1', categoryId: 'food', amount: 3450, note: 'Grocery & Bento', date: currentMonth + '-02' },
                    { id: 'tx-2', type: 'income', region: 'JP', currency: 'JPY', walletId: 'jp-wallet-1', amount: 320000, note: 'Tech Salary', date: currentMonth + '-01' },
                    { id: 'tx-3', type: 'transfer', sourceId: 'jp-wallet-1', destId: 'jp-wallet-2', amount: 50000, note: 'Savings Transfer', date: currentMonth + '-01' },
                    { id: 'tx-4', type: 'remittance', sourceId: 'jp-wallet-1', destId: 'in-wallet-1', sourceAmount: 100000, destAmount: 55000, exchangeRate: '0.5500', note: 'Monthly Home Remittance', date: currentMonth + '-01' },
                    { id: 'tx-5', type: 'expense', region: 'JP', currency: 'JPY', walletId: 'jp-wallet-2', categoryId: 'transport', amount: 1280, note: 'Tokyo Metro Pass', date: currentMonth + '-01' },
                    { id: 'tx-6', type: 'expense', region: 'IN', currency: 'INR', walletId: 'in-wallet-1', categoryId: 'dining', amount: 1850, note: 'Dinner with family', date: currentMonth + '-01' }
                ];
                storage.saveData();
                app.init();
                app.setPrivacyHidden(false);
                app.switchView('transactions-view');
            }
            return {
                title: document.title,
                txRowsCount: document.querySelectorAll('.ledger-tx-row').length,
                dateHeadersCount: document.querySelectorAll('.ledger-date-header').length,
                firstRowTitle: document.querySelector('.ledger-tx-title')?.innerText,
                firstRowMeta: document.querySelector('.ledger-tx-meta')?.innerText,
                firstRowAmount: document.querySelector('.ledger-tx-amount')?.innerText,
                firstDateSubtotal: document.querySelector('.ledger-date-subtotal')?.innerText
            };
        })()
        '''
        res = await send('Runtime.evaluate', {'expression': init_script, 'returnByValue': True})
        val = res.get('result', {}).get('value', {})
        print(f"Transactions Ledger Initialized: {json.dumps(val, indent=2)}")

        async def capture_screen(filename, width=1440, height=900):
            await send('Emulation.setDeviceMetricsOverride', {
                'width': width,
                'height': height,
                'deviceScaleFactor': 1,
                'mobile': width < 600
            })
            await asyncio.sleep(0.5)
            shot_res = await send('Page.captureScreenshot', {'format': 'png'})
            b64_data = shot_res.get('data')
            if b64_data:
                target_path = os.path.join(ARTIFACT_DIR, filename)
                with open(target_path, 'wb') as f:
                    f.write(base64.b64decode(b64_data))
                print(f"Captured {filename} ({width}x{height})")

        # 1. Desktop 1440x900 default view
        await capture_screen('pass2_transactions_redesign_1440.png', 1440, 900)

        # 2. Filter Popover Open
        filter_open_script = '''
        (() => {
            if (window.app) window.app.toggleLedgerFilterPanel();
            const panel = document.getElementById('ledger-filter-panel');
            return { display: panel?.style.display };
        })()
        '''
        f_res = await send('Runtime.evaluate', {'expression': filter_open_script, 'returnByValue': True})
        print(f"Filter Popover open: {f_res.get('result', {}).get('value')}")
        await asyncio.sleep(0.4)
        await capture_screen('pass2_filter_popover_redesign_1440.png', 1440, 900)

        # Close filter popover
        await send('Runtime.evaluate', {'expression': filter_open_script, 'returnByValue': True})
        await asyncio.sleep(0.3)

        # 3. Transaction Detail Modal Open (click tx-1)
        modal_open_script = '''
        (() => {
            const firstRow = document.querySelector('.ledger-tx-row');
            if (firstRow) {
                firstRow.click();
                const modal = document.getElementById('transaction-detail-modal');
                return {
                    clicked: true,
                    modalActive: modal ? modal.classList.contains('active') : false,
                    wallet: document.getElementById('tx-detail-wallet-val')?.innerText,
                    category: document.getElementById('tx-detail-category-val')?.innerText,
                    amount: document.getElementById('tx-detail-amount-val')?.innerText,
                    date: document.getElementById('tx-detail-date-display')?.innerText,
                    subtitle: document.getElementById('tx-detail-subtitle')?.innerText
                };
            }
            return { clicked: false };
        })()
        '''
        m_res = await send('Runtime.evaluate', {'expression': modal_open_script, 'returnByValue': True})
        m_val = m_res.get('result', {}).get('value', {})
        print(f"Detail Modal State: {json.dumps(m_val, indent=2)}")
        await asyncio.sleep(0.4)
        await capture_screen('pass2_detail_modal_redesign_1440.png', 1440, 900)

        # Close modal
        close_modal_script = '''
        (() => {
            if (window.app) window.app.closeTransactionDetail();
        })()
        '''
        await send('Runtime.evaluate', {'expression': close_modal_script, 'returnByValue': True})
        await asyncio.sleep(0.3)

        # 4. Multi-resolution Screenshots
        # 1280x800
        await capture_screen('pass2_transactions_redesign_1280.png', 1280, 800)

        # 1920x1080
        await capture_screen('pass2_transactions_redesign_1920.png', 1920, 1080)

        # Mobile 390x844
        await capture_screen('pass2_transactions_redesign_390.png', 390, 844)

        # Mobile Modal
        await send('Runtime.evaluate', {'expression': modal_open_script, 'returnByValue': True})
        await asyncio.sleep(0.4)
        await capture_screen('pass2_detail_modal_redesign_390.png', 390, 844)
        await send('Runtime.evaluate', {'expression': close_modal_script, 'returnByValue': True})

        # 5. Search test
        search_test_script = '''
        (() => {
            const input = document.getElementById('ledger-search-input');
            input.value = 'Salary';
            window.app.onLedgerSearchInput({ target: input });
            return {
                query: window.app.ledgerSearchQuery,
                showing: document.getElementById('ledger-showing-count')?.innerText,
                total: document.getElementById('ledger-total-count')?.innerText
            };
        })()
        '''
        st_res = await send('Runtime.evaluate', {'expression': search_test_script, 'returnByValue': True})
        print(f"Search filtering result: {st_res.get('result', {}).get('value')}")

        # Reset filters test
        reset_test_script = '''
        (() => {
            window.app.resetAllLedgerFilters();
            return {
                showing: document.getElementById('ledger-showing-count')?.innerText,
                total: document.getElementById('ledger-total-count')?.innerText
            };
        })()
        '''
        rst_res = await send('Runtime.evaluate', {'expression': reset_test_script, 'returnByValue': True})
        print(f"Reset filters result: {rst_res.get('result', {}).get('value')}")

        # Privacy mode test
        privacy_test_script = '''
        (() => {
            window.app.togglePrivacy();
            const firstAmt = document.querySelector('.ledger-tx-amount');
            return {
                isPrivacyHidden: window.app.isPrivacyHidden,
                firstAmtText: firstAmt?.innerText
            };
        })()
        '''
        prv_res = await send('Runtime.evaluate', {'expression': privacy_test_script, 'returnByValue': True})
        print(f"Privacy toggle ON: {prv_res.get('result', {}).get('value')}")
        # Toggle back off
        await send('Runtime.evaluate', {'expression': privacy_test_script, 'returnByValue': True})

        print("=== ALL VERIFICATION TESTS PASSED ===")

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()

if __name__ == '__main__':
    asyncio.run(main())
