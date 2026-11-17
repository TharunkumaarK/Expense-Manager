import asyncio
import base64
import json
import os
import subprocess
import time
import urllib.request
import websockets

CDP_PORT = 9410
CHROME_PATH = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'
HTML_PATH = 'file:///mnt/01DB426183A10370/E_Software/Docs/Antigravity Expense Manager/Expense-Manager/index.html'
ARTIFACT_DIR = '/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128'

msg_counter = 1
async def send_cmd(ws, method, params=None):
    global msg_counter
    curr_id = msg_counter
    msg_counter += 1
    payload = {'id': curr_id, 'method': method}
    if params:
        payload['params'] = params
    await ws.send(json.dumps(payload))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get('id') == curr_id:
            return resp

async def eval_js(ws, expr):
    res = await send_cmd(ws, 'Runtime.evaluate', {
        'expression': expr,
        'returnByValue': True,
        'awaitPromise': True
    })
    result = res.get('result', {}).get('result', {})
    if 'value' in result:
        return result['value']
    return result

async def run():
    subprocess.run(['pkill', '-f', f'--remote-debugging-port={CDP_PORT}'], stderr=subprocess.DEVNULL)
    time.sleep(1)

    proc = subprocess.Popen([
        CHROME_PATH,
        '--headless=new',
        f'--remote-debugging-port={CDP_PORT}',
        '--disable-gpu',
        '--no-sandbox',
        '--window-size=1400,1200'
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)

    try:
        tabs = json.loads(urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json').read().decode('utf-8'))
        ws_url = tabs[0]['webSocketDebuggerUrl']
        async with websockets.connect(ws_url) as ws:
            await send_cmd(ws, 'Page.enable')
            await send_cmd(ws, 'Runtime.enable')

            mock_script = '''
            window.supabase = {
                createClient: () => ({
                    auth: {
                        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
                        onAuthStateChange: (cb) => ({ data: { subscription: { unsubscribe: () => {} } } })
                    },
                    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
                    from: () => ({
                        select: () => Promise.resolve({ data: [], error: null }),
                        upsert: () => Promise.resolve({ data: [], error: null })
                    })
                })
            };

            window.Chart = function(canvas, config) {
                return { destroy: () => {}, update: () => {} };
            };
            window.Chart.defaults = { color: '#8b8b99', font: { family: 'Inter, sans-serif' } };
            window.lucide = {
                createIcons: () => {}
            };
            '''
            await send_cmd(ws, 'Page.addScriptToEvaluateOnNewDocument', {'source': mock_script})
            await send_cmd(ws, 'Page.navigate', {'url': HTML_PATH})
            await asyncio.sleep(2.0)

            # 1. Setup Data and turn Privacy ON
            seed_script = '''(() => {
                storage.state.transactions = [
                    {
                        id: 'tx_jp_inc1',
                        date: '2026-10-15',
                        region: 'JP',
                        type: 'income',
                        amount: 350000,
                        walletId: 'jp-bank',
                        categoryId: 'salary',
                        note: 'Monthly Salary JP'
                    },
                    {
                        id: 'tx_jp_exp1',
                        date: '2026-10-20',
                        region: 'JP',
                        type: 'expense',
                        amount: 78000,
                        walletId: 'jp-bank',
                        categoryId: 'rent',
                        note: 'Apartment Rent Tokyo'
                    },
                    {
                        id: 'tx_jp_exp2',
                        date: '2026-11-05',
                        region: 'JP',
                        type: 'expense',
                        amount: 14500,
                        walletId: 'jp-cash',
                        categoryId: 'groceries',
                        note: 'Supermarket Groceries'
                    },
                    {
                        id: 'tx_in_inc1',
                        date: '2026-10-10',
                        region: 'IN',
                        type: 'income',
                        amount: 95000,
                        walletId: 'in-bank',
                        categoryId: 'salary',
                        note: 'Consulting India'
                    },
                    {
                        id: 'tx_in_exp1',
                        date: '2026-10-25',
                        region: 'IN',
                        type: 'expense',
                        amount: 22000,
                        walletId: 'in-bank',
                        categoryId: 'utilities',
                        note: 'Power & Internet Bangalore'
                    }
                ];

                storage.state.categories = storage.state.categories || {};
                storage.state.categories.JP = [
                    { id: 'salary', name: 'Salary', icon: 'briefcase' },
                    { id: 'rent', name: 'Rent', icon: 'home' },
                    { id: 'groceries', name: 'Groceries', icon: 'shopping-cart' }
                ];
                storage.state.categories.IN = [
                    { id: 'salary', name: 'Salary', icon: 'briefcase' },
                    { id: 'utilities', name: 'Utilities', icon: 'zap' }
                ];

                // Turn Privacy Mode ON (conceal balances)
                app.setPrivacyHidden(true);

                return {
                    privacyState: app.isPrivacyHidden,
                    txCount: storage.state.transactions.length
                };
            })()'''

            setup_res = await eval_js(ws, seed_script)
            print("Setup result:", setup_res)
            assert setup_res.get('privacyState') is True, "Privacy mode must be enabled"

            # 2. Switch to Reports View
            await eval_js(ws, "app.switchView('reports-view')")
            await asyncio.sleep(0.5)

            # 3. Fill Custom Date Range & Generate Report
            custom_gen = '''(() => {
                const s = document.getElementById('report-custom-start');
                const e = document.getElementById('report-custom-end');
                const r = document.getElementById('report-custom-region');
                const w = document.getElementById('report-custom-wallet');
                const c = document.getElementById('report-custom-category');
                if (s) s.value = '2026-10-01';
                if (e) e.value = '2026-11-15';
                if (r) r.value = 'ALL';
                if (w) w.value = 'ALL';
                if (c) c.value = 'ALL';

                app.generateCustomRangeReport();
                return true;
            })()'''
            await eval_js(ws, custom_gen)
            await asyncio.sleep(0.5)

            # 4. Inspect On-Screen Custom Report Results
            check_onscreen = '''(() => {
                const resultsEl = document.getElementById('report-custom-results');
                if (!resultsEl || resultsEl.style.display === 'none') {
                    return { ok: false, error: 'Custom results element not displayed' };
                }

                const text = resultsEl.innerText;
                const hasAsterisks = text.includes('******');
                const hasBullets = text.includes('••••••');
                
                // Numbers that MUST appear
                const hasJpIncome = text.includes('¥350,000') || text.includes('350,000');
                const hasJpExpense = text.includes('¥92,500') || text.includes('92,500'); // 78000 + 14500
                const hasJpNet = text.includes('¥257,500') || text.includes('257,500');
                const hasInIncome = text.includes('₹95,000') || text.includes('95,000');
                const hasInExpense = text.includes('₹22,000') || text.includes('22,000');
                const hasInNet = text.includes('₹73,000') || text.includes('73,000');

                // Category rows
                const hasRent = text.includes('Rent') && (text.includes('¥78,000') || text.includes('78,000'));
                const hasGroceries = text.includes('Groceries') && (text.includes('¥14,500') || text.includes('14,500'));
                const hasUtilities = text.includes('Utilities') && (text.includes('₹22,000') || text.includes('22,000'));

                return {
                    ok: true,
                    privacyHidden: app.isPrivacyHidden,
                    hasAsterisks,
                    hasBullets,
                    hasJpIncome,
                    hasJpExpense,
                    hasJpNet,
                    hasInIncome,
                    hasInExpense,
                    hasInNet,
                    hasRent,
                    hasGroceries,
                    hasUtilities,
                    text: text
                };
            })()'''

            onscreen_res = await eval_js(ws, check_onscreen)
            print("\n=== ON-SCREEN CUSTOM REPORT VERIFICATION ===")
            print(f"Privacy Mode Active: {onscreen_res.get('privacyHidden')}")
            print(f"Contains '******': {onscreen_res.get('hasAsterisks')}")
            print(f"Contains '••••••': {onscreen_res.get('hasBullets')}")
            print(f"Japan Income Visible: {onscreen_res.get('hasJpIncome')}")
            print(f"Japan Expense Visible: {onscreen_res.get('hasJpExpense')}")
            print(f"Japan Net Visible: {onscreen_res.get('hasJpNet')}")
            print(f"India Income Visible: {onscreen_res.get('hasInIncome')}")
            print(f"India Expense Visible: {onscreen_res.get('hasInExpense')}")
            print(f"India Net Visible: {onscreen_res.get('hasInNet')}")
            print(f"Category Rent Visible: {onscreen_res.get('hasRent')}")
            print(f"Category Groceries Visible: {onscreen_res.get('hasGroceries')}")
            print(f"Category Utilities Visible: {onscreen_res.get('hasUtilities')}")

            assert onscreen_res['ok'] is True
            assert onscreen_res['hasAsterisks'] is False, "FAIL: On-screen custom report contained asterisks!"
            assert onscreen_res['hasBullets'] is False, "FAIL: On-screen custom report contained bullets!"
            assert onscreen_res['hasJpIncome'] is True, "FAIL: Japan income missing"
            assert onscreen_res['hasJpExpense'] is True, "FAIL: Japan expense missing"
            assert onscreen_res['hasJpNet'] is True, "FAIL: Japan net surplus missing"
            assert onscreen_res['hasInIncome'] is True, "FAIL: India income missing"
            assert onscreen_res['hasInExpense'] is True, "FAIL: India expense missing"
            assert onscreen_res['hasInNet'] is True, "FAIL: India net surplus missing"
            assert onscreen_res['hasRent'] is True, "FAIL: Category Rent missing"
            assert onscreen_res['hasGroceries'] is True, "FAIL: Category Groceries missing"
            assert onscreen_res['hasUtilities'] is True, "FAIL: Category Utilities missing"

            # 5. Test PDF Export
            # Intercept window.print and check print-container immediately when print is called
            check_pdf_script = '''(() => {
                let capturedHtml = '';
                let capturedText = '';
                window._printCalled = false;
                window.print = () => {
                    window._printCalled = true;
                    const pc = document.getElementById('print-container');
                    capturedHtml = pc ? pc.innerHTML : '';
                    capturedText = pc ? pc.textContent : '';
                };

                app.exportCustomReportPdf();

                return new Promise((resolve) => {
                    setTimeout(() => {
                        const pc = document.getElementById('print-container');
                        const text = capturedText || (pc ? pc.textContent : '');
                        const hasAsterisks = text.includes('******');
                        const hasBullets = text.includes('••••••');

                        const hasJpHeader = text.includes('Japan Portfolio (JPY ¥)');
                        const hasInHeader = text.includes('India Portfolio (INR ₹)');
                        const hasJpIncome = text.includes('350,000');
                        const hasJpExpense = text.includes('92,500');
                        const hasInIncome = text.includes('95,000');
                        const hasInExpense = text.includes('22,000');

                        // Check line items in table
                        const hasRentTx = text.includes('Apartment Rent Tokyo') && text.includes('78,000');
                        const hasSalaryTx = text.includes('Monthly Salary JP') && text.includes('350,000');
                        const hasUtilitiesTx = text.includes('Power & Internet Bangalore') && text.includes('22,000');

                        resolve({
                            ok: true,
                            printCalled: window._printCalled,
                            privacyStateAfterPrint: app.isPrivacyHidden,
                            hasAsterisks,
                            hasBullets,
                            hasJpHeader,
                            hasInHeader,
                            hasJpIncome,
                            hasJpExpense,
                            hasInIncome,
                            hasInExpense,
                            hasRentTx,
                            hasSalaryTx,
                            hasUtilitiesTx,
                            capturedTextLen: text.length,
                            textSnippet: text.slice(0, 500)
                        });
                    }, 500);
                });
            })()'''

            pdf_res = await eval_js(ws, check_pdf_script)
            print("\n=== PDF PRINT CONTAINER VERIFICATION ===")
            print(f"window.print() called: {pdf_res.get('printCalled')}")
            print(f"Privacy State Preserved: {pdf_res.get('privacyStateAfterPrint')}")
            print(f"Contains '******': {pdf_res.get('hasAsterisks')}")
            print(f"Contains '••••••': {pdf_res.get('hasBullets')}")
            print(f"Japan Portfolio Header: {pdf_res.get('hasJpHeader')}")
            print(f"India Portfolio Header: {pdf_res.get('hasInHeader')}")
            print(f"Japan Income 350,000: {pdf_res.get('hasJpIncome')}")
            print(f"Japan Expense 92,500: {pdf_res.get('hasJpExpense')}")
            print(f"India Income 95,000: {pdf_res.get('hasInIncome')}")
            print(f"India Expense 22,000: {pdf_res.get('hasInExpense')}")
            print(f"Rent Tx Line 78,000: {pdf_res.get('hasRentTx')}")
            print(f"Salary Tx Line 350,000: {pdf_res.get('hasSalaryTx')}")
            print(f"Utilities Tx Line 22,000: {pdf_res.get('hasUtilitiesTx')}")

            assert pdf_res['ok'] is True
            assert pdf_res['printCalled'] is True
            assert pdf_res['privacyStateAfterPrint'] is True, "app.isPrivacyHidden should remain true!"
            assert pdf_res['hasAsterisks'] is False, "FAIL: PDF contained asterisks!"
            assert pdf_res['hasBullets'] is False, "FAIL: PDF contained bullets!"
            assert pdf_res['hasJpIncome'] is True
            assert pdf_res['hasJpExpense'] is True
            assert pdf_res['hasInIncome'] is True
            assert pdf_res['hasInExpense'] is True
            assert pdf_res['hasRentTx'] is True
            assert pdf_res['hasSalaryTx'] is True
            assert pdf_res['hasUtilitiesTx'] is True

            # 6. Generate real PDF and rasterize to PNG
            pdf_data = await send_cmd(ws, 'Page.printToPDF', {
                'printBackground': True,
                'preferCSSPageSize': True
            })
            pdf_bytes = base64.b64decode(pdf_data['result']['data'])
            pdf_path = f'{ARTIFACT_DIR}/custom_report_privacy_verified.pdf'
            with open(pdf_path, 'wb') as f:
                f.write(pdf_bytes)
            print(f"\nSaved generated PDF: {pdf_path} ({len(pdf_bytes)} bytes)")

            # Screenshot of the on-screen custom report
            screenshot_data = await send_cmd(ws, 'Page.captureScreenshot', {'format': 'png'})
            screenshot_bytes = base64.b64decode(screenshot_data['result']['data'])
            ss_path = f'{ARTIFACT_DIR}/custom_report_privacy_onscreen.png'
            with open(ss_path, 'wb') as f:
                f.write(screenshot_bytes)
            print(f"Saved on-screen screenshot: {ss_path} ({len(screenshot_bytes)} bytes)")

            print("\n>>> ALL ON-SCREEN & PDF PRIVACY REPORT TESTS PASSED PERFECTLY! <<<")

    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(run())
