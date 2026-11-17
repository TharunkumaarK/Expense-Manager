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
        '--window-size=1200,900'
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

            # 1. Switch to Analytics View
            await eval_js(ws, "app.switchView('analytics-view')")
            await asyncio.sleep(0.5)

            # Test Analytics Country Selector Structure
            test_analytics_structure = '''(() => {
                const selector = document.getElementById('analytics-country-selector');
                const btnJp = document.getElementById('analytics-tab-jp');
                const btnIn = document.getElementById('analytics-tab-in');

                if (!selector || !btnJp || !btnIn) {
                    return { ok: false, error: 'Elements missing in analytics-country-selector' };
                }

                const isSegmented = selector.classList.contains('segmented-control');
                const jpIsSegmentBtn = btnJp.classList.contains('segment-btn');
                const inIsSegmentBtn = btnIn.classList.contains('segment-btn');

                const jpText = btnJp.innerText.trim();
                const inText = btnIn.innerText.trim();

                const jpHouseFlag = !!btnJp.querySelector('svg.flag-jp');
                const inHouseFlag = !!btnIn.querySelector('svg.flag-in');

                return {
                    ok: true,
                    isSegmented,
                    jpIsSegmentBtn,
                    inIsSegmentBtn,
                    jpText,
                    inText,
                    jpHouseFlag,
                    inHouseFlag,
                    jpActive: btnJp.classList.contains('active'),
                    inActive: btnIn.classList.contains('active')
                };
            })()'''

            res1 = await eval_js(ws, test_analytics_structure)
            print("\n=== ANALYTICS COUNTRY SELECTOR STRUCTURE ===")
            print(json.dumps(res1, indent=2))
            assert res1['ok'] is True
            assert res1['isSegmented'] is True, "Must have class .segmented-control"
            assert res1['jpIsSegmentBtn'] is True, "JP tab must have class .segment-btn"
            assert res1['inIsSegmentBtn'] is True, "IN tab must have class .segment-btn"
            assert 'Japan' in res1['jpText'] and '¥' in res1['jpText'], "Must display Japan (¥)"
            assert 'India' in res1['inText'] and '₹' in res1['inText'], "Must display India (₹)"
            assert res1['jpHouseFlag'] is True, "Must have Japan flag SVG"
            assert res1['inHouseFlag'] is True, "Must have India flag SVG"
            assert res1['jpActive'] is True, "JP should initially be active"

            # 2. Test Clicking India in Analytics
            await eval_js(ws, "document.getElementById('analytics-tab-in').click()")
            await asyncio.sleep(0.3)

            test_india_active = '''(() => {
                const btnJp = document.getElementById('analytics-tab-jp');
                const btnIn = document.getElementById('analytics-tab-in');
                const jpWs = document.getElementById('analytics-jp-workspace');
                const inWs = document.getElementById('analytics-in-workspace');

                return {
                    appCountry: app.analyticsCountry,
                    jpActive: btnJp.classList.contains('active'),
                    inActive: btnIn.classList.contains('active'),
                    jpWsDisplay: jpWs.style.display,
                    inWsDisplay: inWs.style.display
                };
            })()'''

            res2 = await eval_js(ws, test_india_active)
            print("\n=== AFTER SWITCHING TO INDIA IN ANALYTICS ===")
            print(json.dumps(res2, indent=2))
            assert res2['appCountry'] == 'IN'
            assert res2['inActive'] is True
            assert res2['jpActive'] is False
            assert res2['inWsDisplay'] == 'flex'
            assert res2['jpWsDisplay'] == 'none'

            # 3. Test Clicking back to Japan in Analytics
            await eval_js(ws, "document.getElementById('analytics-tab-jp').click()")
            await asyncio.sleep(0.3)
            res3 = await eval_js(ws, test_india_active)
            assert res3['appCountry'] == 'JP'
            assert res3['jpActive'] is True
            assert res3['inActive'] is False
            assert res3['jpWsDisplay'] == 'flex'
            assert res3['inWsDisplay'] == 'none'

            # 4. Compare with Reports Page Selector
            await eval_js(ws, "app.switchView('reports-view')")
            await asyncio.sleep(0.5)

            test_reports_structure = '''(() => {
                const selector = document.getElementById('report-country-selector');
                const btns = selector.querySelectorAll('.segment-btn');

                return {
                    ok: !!selector,
                    isSegmented: selector.classList.contains('segmented-control'),
                    btnCount: btns.length,
                    btn1Text: btns[0] ? btns[0].innerText.trim() : '',
                    btn2Text: btns[1] ? btns[1].innerText.trim() : ''
                };
            })()'''
            res_rep = await eval_js(ws, test_reports_structure)
            print("\n=== REPORTS COUNTRY SELECTOR STRUCTURE ===")
            print(json.dumps(res_rep, indent=2))
            assert res_rep['isSegmented'] is True
            assert 'Japan' in res_rep['btn1Text']
            assert 'India' in res_rep['btn2Text']

            # 5. Capture Screenshot of Analytics and Reports View Top Bars
            # Analytics Screenshot
            await eval_js(ws, "app.switchView('analytics-view')")
            await asyncio.sleep(0.4)
            ss_analytics = await send_cmd(ws, 'Page.captureScreenshot', {'format': 'png'})
            ss_bytes = base64.b64decode(ss_analytics['result']['data'])
            ss_path_analytics = f'{ARTIFACT_DIR}/standardized_analytics_top.png'
            with open(ss_path_analytics, 'wb') as f:
                f.write(ss_bytes)
            print(f"\nSaved Analytics Screenshot: {ss_path_analytics}")

            # Reports Screenshot
            await eval_js(ws, "app.switchView('reports-view')")
            await asyncio.sleep(0.4)
            ss_reports = await send_cmd(ws, 'Page.captureScreenshot', {'format': 'png'})
            ss_rep_bytes = base64.b64decode(ss_reports['result']['data'])
            ss_path_reports = f'{ARTIFACT_DIR}/standardized_reports_top.png'
            with open(ss_path_reports, 'wb') as f:
                f.write(ss_rep_bytes)
            print(f"Saved Reports Screenshot: {ss_path_reports}")

            # Mobile view test
            await send_cmd(ws, 'Emulation.setDeviceMetricsOverride', {
                'width': 390,
                'height': 844,
                'deviceScaleFactor': 2,
                'mobile': True
            })
            await eval_js(ws, "app.switchView('analytics-view')")
            await asyncio.sleep(0.4)
            ss_mobile = await send_cmd(ws, 'Page.captureScreenshot', {'format': 'png'})
            ss_mob_bytes = base64.b64decode(ss_mobile['result']['data'])
            ss_path_mob = f'{ARTIFACT_DIR}/standardized_analytics_mobile.png'
            with open(ss_path_mob, 'wb') as f:
                f.write(ss_mob_bytes)
            print(f"Saved Mobile Analytics Screenshot: {ss_path_mob}")

            print("\n>>> ALL STANDARDIZATION TESTS PASSED! <<<")

    finally:
        proc.terminate()

if __name__ == '__main__':
    asyncio.run(run())

