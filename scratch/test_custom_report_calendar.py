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
        '--window-size=1200,1000'
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
            '''
            await send_cmd(ws, 'Page.addScriptToEvaluateOnNewDocument', {'source': mock_script})
            await send_cmd(ws, 'Page.navigate', {'url': HTML_PATH})
            await asyncio.sleep(2.0)

            # Switch to Reports view
            await eval_js(ws, "app.switchView('reports-view')")
            await asyncio.sleep(0.5)

            # 1. Verify Presets DOM & Icons
            test_dom = '''(() => {
                const presetsRow = document.querySelector('.custom-report-presets-row');
                const pills = document.querySelectorAll('.preset-pill-btn');
                const startWrap = document.querySelector('.date-picker-input-wrap');
                const startInput = document.getElementById('report-custom-start');
                const endInput = document.getElementById('report-custom-end');
                const iconBtns = document.querySelectorAll('.date-picker-icon-btn');

                return {
                    hasPresetsRow: !!presetsRow,
                    pillCount: pills.length,
                    pillNames: Array.from(pills).map(p => p.innerText.trim()),
                    hasStartWrap: !!startWrap,
                    hasStartInput: !!startInput,
                    hasEndInput: !!endInput,
                    iconBtnCount: iconBtns.length
                };
            })()'''

            res_dom = await eval_js(ws, test_dom)
            print("\n=== CUSTOM REPORT CALENDAR TOOLS DOM ===")
            print(json.dumps(res_dom, indent=2))
            assert res_dom['hasPresetsRow'] is True
            assert res_dom['pillCount'] == 4
            assert 'This Month' in res_dom['pillNames']
            assert 'Last Month' in res_dom['pillNames']
            assert 'Last 90 Days' in res_dom['pillNames']
            assert 'This Year' in res_dom['pillNames']
            assert 'Last 30 Days' not in res_dom['pillNames']
            assert res_dom['iconBtnCount'] == 2

            # 2. Test Presets Functionality
            presets_to_test = ['this-month', 'last-month', 'last-90-days', 'this-year']
            for p in presets_to_test:
                test_preset_script = f'''(() => {{
                    app.setCustomReportPreset('{p}');
                    const s = document.getElementById('report-custom-start').value;
                    const e = document.getElementById('report-custom-end').value;
                    const activeBtn = document.querySelector('.preset-pill-btn.active');
                    return {{
                        preset: '{p}',
                        start: s,
                        end: e,
                        activePreset: activeBtn ? activeBtn.getAttribute('data-preset') : null,
                        validStart: /^\\d{{4}}-\\d{{2}}-\\d{{2}}$/.test(s),
                        validEnd: /^\\d{{4}}-\\d{{2}}-\\d{{2}}$/.test(e)
                    }};
                }})()'''
                res_preset = await eval_js(ws, test_preset_script)
                print(f"Preset [{p}] result:", res_preset)
                assert res_preset['validStart'] is True, f"Invalid start date format for {p}: {res_preset['start']}"
                assert res_preset['validEnd'] is True, f"Invalid end date format for {p}: {res_preset['end']}"
                assert res_preset['start'] <= res_preset['end'], f"Start date must not exceed end date for {p}"
                assert res_preset['activePreset'] == p, f"Preset button {p} must be active"

            # 3. Test openDatePicker Call
            test_picker_script = '''(() => {
                let called = false;
                const startInput = document.getElementById('report-custom-start');
                startInput.showPicker = () => { called = true; };
                app.openDatePicker('report-custom-start');
                return { called };
            })()'''
            res_picker = await eval_js(ws, test_picker_script)
            print("\nDatePicker showPicker invocation:", res_picker)
            assert res_picker['called'] is True

            # 4. Test Report Generation with 'this-month' preset
            seed_and_generate = '''(() => {
                app.setCustomReportPreset('this-month');
                const s = document.getElementById('report-custom-start').value;
                const e = document.getElementById('report-custom-end').value;

                storage.state.transactions = [
                    { id: 'tx-cal-1', date: s, amount: 120000, type: 'income', region: 'JP', walletId: 'jp-bank', categoryId: 'salary', note: 'Calendar Test Income' },
                    { id: 'tx-cal-2', date: e, amount: 45000, type: 'expense', region: 'JP', walletId: 'jp-bank', categoryId: 'rent', note: 'Calendar Test Expense' }
                ];
                storage.state.categories = storage.state.categories || {};
                storage.state.categories.JP = [
                    { id: 'salary', name: 'Salary', icon: 'briefcase' },
                    { id: 'rent', name: 'Rent', icon: 'home' }
                ];

                app.generateCustomRangeReport();
                const resultsEl = document.getElementById('report-custom-results');
                return {
                    resultsVisible: resultsEl && resultsEl.style.display !== 'none',
                    resultsText: resultsEl ? resultsEl.innerText : ''
                };
            })()'''
            res_gen = await eval_js(ws, seed_and_generate)
            print("\nReport Generation with Preset:", res_gen)
            assert res_gen['resultsVisible'] is True
            assert '120,000' in res_gen['resultsText']
            assert '45,000' in res_gen['resultsText']

            # 5. Test Reset
            reset_script = '''(() => {
                app.resetCustomRangeReport();
                const s = document.getElementById('report-custom-start').value;
                const e = document.getElementById('report-custom-end').value;
                const activeBtn = document.querySelector('.preset-pill-btn.active');
                const resultsEl = document.getElementById('report-custom-results');
                return {
                    startEmpty: s === '',
                    endEmpty: e === '',
                    noActivePreset: activeBtn === null,
                    resultsHidden: !resultsEl || resultsEl.style.display === 'none'
                };
            })()'''
            res_reset = await eval_js(ws, reset_script)
            print("\nReset Result:", res_reset)
            assert res_reset['startEmpty'] is True
            assert res_reset['endEmpty'] is True
            assert res_reset['noActivePreset'] is True
            assert res_reset['resultsHidden'] is True

            # 6. Set a preset and capture screenshot of the UI
            await eval_js(ws, "app.setCustomReportPreset('this-month')")
            await asyncio.sleep(0.3)

            # Scroll to custom report panel
            await eval_js(ws, "document.querySelector('.custom-report-panel').scrollIntoView()")
            await asyncio.sleep(0.3)

            ss = await send_cmd(ws, 'Page.captureScreenshot', {'format': 'png'})
            ss_bytes = base64.b64decode(ss['result']['data'])
            ss_path = f'{ARTIFACT_DIR}/custom_report_calendar_presets.png'
            with open(ss_path, 'wb') as f:
                f.write(ss_bytes)
            print(f"\nSaved Screenshot: {ss_path}")

            print("\n>>> ALL CALENDAR SELECTION & PRESET TESTS PASSED! <<<")

    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(run())
