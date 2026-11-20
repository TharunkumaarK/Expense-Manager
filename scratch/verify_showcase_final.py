import asyncio
import json
import os
import subprocess
import time
import urllib.request
import websockets
import base64

CHROME_BIN = '/usr/bin/google-chrome-stable'
CDP_PORT = 9448
ARTIFACT_DIR = '/home/tharunkumaark/.gemini/antigravity/brain/313d2d4f-049c-48f8-8f7b-c327227ad128'
SCRATCH_DIR = '/mnt/01DB426183A10370/E_Software/Docs/Antigravity Expense Manager/Expense-Manager/scratch'
INDEX_URL = 'file:///mnt/01DB426183A10370/E_Software/Docs/Antigravity Expense Manager/Expense-Manager/index.html'

msg_counter = 1

async def send_cmd(ws, method, params=None):
    global msg_counter
    curr_id = msg_counter
    msg_counter += 1
    payload = {"id": curr_id, "method": method}
    if params:
        payload["params"] = params
    await ws.send(json.dumps(payload))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get("id") == curr_id:
            return resp

async def eval_js(ws, expr):
    res = await send_cmd(ws, "Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
    if "exceptionDetails" in res.get("result", {}):
        raise RuntimeError(f"JS Exception: {res['result']['exceptionDetails']}")
    return res.get("result", {}).get("result", {}).get("value")

async def set_viewport(ws, width, height, device_scale_factor=1, is_mobile=False):
    await send_cmd(ws, "Emulation.setDeviceMetricsOverride", {
        "width": width,
        "height": height,
        "deviceScaleFactor": device_scale_factor,
        "mobile": is_mobile
    })
    await send_cmd(ws, "Emulation.setVisibleSize", {
        "width": width,
        "height": height
    })

async def capture_screenshot(ws, filename):
    res = await send_cmd(ws, "Page.captureScreenshot", {"format": "png"})
    data = base64.b64decode(res["result"]["data"])
    p1 = os.path.join(ARTIFACT_DIR, filename)
    p2 = os.path.join(SCRATCH_DIR, filename)
    with open(p1, "wb") as f:
        f.write(data)
    with open(p2, "wb") as f:
        f.write(data)
    print(f"    [Screenshot] Saved: {filename}")

async def run_showcase_verification():
    print("=" * 80)
    print("EXPENSE MANAGER — TREASURY WALLET SHOWCASE FINAL REFINEMENT VERIFICATION")
    print("=" * 80)

    cmd = [
        CHROME_BIN,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        f'--remote-debugging-port={CDP_PORT}',
        '--hide-scrollbars',
        'about:blank'
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(1.2)

    try:
        with urllib.request.urlopen(f'http://localhost:{CDP_PORT}/json/list') as r:
            tabs = json.load(r)
            ws_url = tabs[0]['webSocketDebuggerUrl']

        async with websockets.connect(ws_url, max_size=30*1024*1024) as ws:
            await send_cmd(ws, "Page.enable")
            await send_cmd(ws, "Runtime.enable")
            await send_cmd(ws, "Page.navigate", {"url": INDEX_URL})
            await asyncio.sleep(2.0)

            # Initialize Onboarding
            setup_res = await eval_js(ws, """
                (() => {
                    localStorage.clear();
                    if (typeof onboardingController !== 'undefined') {
                        onboardingController.show();
                        onboardingController.currentStep = 1;
                        onboardingController.render();
                        return { ok: true, step: onboardingController.currentStep };
                    }
                    return { ok: false };
                })()
            """)
            print(f"[Init] Onboarding Controller Initialized: {setup_res}")
            assert setup_res and setup_res.get("ok"), "Failed to init onboardingController"

            # -----------------------------------------------------------------
            # TEST 1: Country Combinations & Stacking Order Invariants (Defect A)
            # -----------------------------------------------------------------
            print("\n" + "=" * 60)
            print("TEST 1: ALL 7 COUNTRY COMBINATIONS & STACKING ORDER INVARIANTS")
            print("=" * 60)

            combinations = [
                (["JP"], "Japan only (1 card)", "JP"),
                (["IN"], "India only (1 card)", "IN"),
                (["DE"], "Germany only (1 card)", "DE"),
                (["JP", "IN"], "Japan + India (2 cards)", "IN"),
                (["JP", "DE"], "Japan + Germany (2 cards)", "DE"),
                (["IN", "DE"], "India + Germany (2 cards)", "IN"),
                (["JP", "IN", "DE"], "Japan + India + Germany (3 cards)", "IN")
            ]

            # Test combinations at 1024px, 1200px, and 1440px
            desktop_sample_widths = [1024, 1200, 1440]

            for active_countries, combo_name, expected_front in combinations:
                print(f"\n--- Testing Combo: {combo_name} (Expected foremost: {expected_front}) ---")
                await eval_js(ws, f"""
                    (() => {{
                        onboardingController.draft.activeCountries = {json.dumps(active_countries)};
                        onboardingController.render();
                    }})()
                """)
                await asyncio.sleep(0.15)

                for w in desktop_sample_widths:
                    await set_viewport(ws, w, 800, is_mobile=False)
                    await asyncio.sleep(0.1)

                    data = await eval_js(ws, """
                        (() => {
                            const showcase = document.querySelector('.onboarding-wallet-showcase');
                            const cards = Array.from(document.querySelectorAll('.onboarding-wallet-showcase .auth-card-preview'));
                            
                            const cardDetails = cards.map((c, i) => {
                                const style = window.getComputedStyle(c);
                                const rect = c.getBoundingClientRect();
                                return {
                                    idx: c.getAttribute('data-card-index'),
                                    country: c.getAttribute('data-country'),
                                    zIndex: parseInt(style.zIndex, 10) || 0,
                                    width: rect.width,
                                    height: rect.height,
                                    top: rect.top,
                                    left: rect.left,
                                    right: rect.right,
                                    bottom: rect.bottom
                                };
                            });

                            // Determine highest z-index card
                            let highestZ = -1;
                            let foremostCountry = null;
                            cardDetails.forEach(cd => {
                                if (cd.zIndex > highestZ) {
                                    highestZ = cd.zIndex;
                                    foremostCountry = cd.country;
                                }
                            });

                            return {
                                cardCount: cards.length,
                                showcaseAttr: showcase ? showcase.getAttribute('data-card-count') : null,
                                cardDetails: cardDetails,
                                highestZ: highestZ,
                                foremostCountry: foremostCountry
                            };
                        })()
                    """)

                    print(f"  Width {w}px: {data['cardCount']} cards, Foremost={data['foremostCountry']} (z-index={data['highestZ']})")
                    for cd in data['cardDetails']:
                        print(f"    Card index={cd['idx']}, country={cd['country']}, z-index={cd['zIndex']}, rect=({cd['width']:.1f}x{cd['height']:.1f} at {cd['left']:.1f}, {cd['top']:.1f})")

                    assert data['cardCount'] == len(active_countries), f"Expected {len(active_countries)} cards, got {data['cardCount']}"
                    assert data['foremostCountry'] == expected_front, f"At {w}px for {combo_name}, expected foremost country {expected_front}, but got {data['foremostCountry']}!"

                    # Verify cards have increasing z-index by index
                    for i in range(len(data['cardDetails']) - 1):
                        assert data['cardDetails'][i]['zIndex'] < data['cardDetails'][i+1]['zIndex'], \
                            f"At {w}px, card {i} (z={data['cardDetails'][i]['zIndex']}) should have lower z-index than card {i+1} (z={data['cardDetails'][i+1]['zIndex']})"

                # Capture representative screenshots
                slug = "_".join(active_countries).lower()
                await capture_screenshot(ws, f"onboarding_showcase_{slug}_1024.png")
                await capture_screenshot(ws, f"onboarding_showcase_{slug}_1440.png")

            # -----------------------------------------------------------------
            # TEST 2: Discontinuity Test at 1199px vs 1200px (Defect B)
            # -----------------------------------------------------------------
            print("\n" + "=" * 60)
            print("TEST 2: CONTINUITY CHECK AT 1199px vs 1200px (DEFECT B VERIFICATION)")
            print("=" * 60)

            # Set 3 countries
            await eval_js(ws, """
                (() => {
                    onboardingController.draft.activeCountries = ['JP', 'DE', 'IN'];
                    onboardingController.render();
                })()
            """)
            await asyncio.sleep(0.15)

            # Measure at 1199px
            await set_viewport(ws, 1199, 800, is_mobile=False)
            await asyncio.sleep(0.2)
            m_1199 = await eval_js(ws, """
                (() => {
                    const showcase = document.querySelector('.onboarding-wallet-showcase');
                    const cards = Array.from(document.querySelectorAll('.onboarding-wallet-showcase .auth-card-preview'));
                    const sRect = showcase.getBoundingClientRect();
                    return {
                        showcaseWidth: sRect.width,
                        showcaseHeight: sRect.height,
                        cards: cards.map(c => {
                            const r = c.getBoundingClientRect();
                            const s = window.getComputedStyle(c);
                            return {
                                country: c.getAttribute('data-country'),
                                zIndex: parseInt(s.zIndex, 10),
                                width: r.width,
                                height: r.height,
                                left: r.left,
                                top: r.top
                            };
                        })
                    };
                })()
            """)

            # Measure at 1200px
            await set_viewport(ws, 1200, 800, is_mobile=False)
            await asyncio.sleep(0.2)
            m_1200 = await eval_js(ws, """
                (() => {
                    const showcase = document.querySelector('.onboarding-wallet-showcase');
                    const cards = Array.from(document.querySelectorAll('.onboarding-wallet-showcase .auth-card-preview'));
                    const sRect = showcase.getBoundingClientRect();
                    return {
                        showcaseWidth: sRect.width,
                        showcaseHeight: sRect.height,
                        cards: cards.map(c => {
                            const r = c.getBoundingClientRect();
                            const s = window.getComputedStyle(c);
                            return {
                                country: c.getAttribute('data-country'),
                                zIndex: parseInt(s.zIndex, 10),
                                width: r.width,
                                height: r.height,
                                left: r.left,
                                top: r.top
                            };
                        })
                    };
                })()
            """)

            print(f"  1199px Showcase: {m_1199['showcaseWidth']:.2f} x {m_1199['showcaseHeight']:.2f}px")
            print(f"  1200px Showcase: {m_1200['showcaseWidth']:.2f} x {m_1200['showcaseHeight']:.2f}px")
            delta_w = abs(m_1200['showcaseWidth'] - m_1199['showcaseWidth'])
            delta_h = abs(m_1200['showcaseHeight'] - m_1199['showcaseHeight'])
            print(f"  Delta between 1199px and 1200px: width={delta_w:.3f}px, height={delta_h:.3f}px")

            # Check card width delta
            card_delta_w = abs(m_1200['cards'][0]['width'] - m_1199['cards'][0]['width'])
            card_delta_h = abs(m_1200['cards'][0]['height'] - m_1199['cards'][0]['height'])
            print(f"  Card 0 Delta: width={card_delta_w:.3f}px, height={card_delta_h:.3f}px")

            # Stacking order check across 1199px and 1200px
            z_1199 = [c['zIndex'] for c in m_1199['cards']]
            z_1200 = [c['zIndex'] for c in m_1200['cards']]
            countries_1199 = [c['country'] for c in m_1199['cards']]
            countries_1200 = [c['country'] for c in m_1200['cards']]

            print(f"  1199px Z-Indices: {z_1199} for {countries_1199}")
            print(f"  1200px Z-Indices: {z_1200} for {countries_1200}")

            assert card_delta_w < 2.0, f"Discontinuity detected! Card width jumped {card_delta_w:.2f}px between 1199px and 1200px"
            assert card_delta_h < 2.0, f"Discontinuity detected! Card height jumped {card_delta_h:.2f}px between 1199px and 1200px"
            assert z_1199 == z_1200, f"Stacking order changed between 1199px and 1200px! 1199px={z_1199}, 1200px={z_1200}"
            print("  [PASS] Showcase dimensions and stacking order transition continuously between 1199px and 1200px.")

            await capture_screenshot(ws, "onboarding_continuity_1199.png")
            await capture_screenshot(ws, "onboarding_continuity_1200.png")

            # -----------------------------------------------------------------
            # TEST 3: Desktop Alignment Invariants Across All Viewports (Defect C)
            # -----------------------------------------------------------------
            print("\n" + "=" * 60)
            print("TEST 3: BRAND PANE ALIGNMENT & FORM COLLISION MATRIX (DEFECT C)")
            print("=" * 60)

            desktop_widths = [1024, 1100, 1199, 1200, 1280, 1366, 1440]
            for w in desktop_widths:
                await set_viewport(ws, w, 800, is_mobile=False)
                await asyncio.sleep(0.15)

                metrics = await eval_js(ws, """
                    (() => {
                        const previewPane = document.querySelector('.onboarding-preview-pane');
                        const header = document.querySelector('.onboarding-container .auth-brand-header');
                        const title = document.querySelector('.onboarding-container .auth-brand-title');
                        const pill = document.querySelector('.onboarding-container .onboarding-step-pill');
                        const headline = document.querySelector('.onboarding-container .auth-headline');
                        const showcase = document.querySelector('.onboarding-wallet-showcase');
                        const subhead = document.querySelector('.onboarding-container .auth-subhead');
                        const divider = document.querySelector('.onboarding-container .auth-divider');
                        const formCard = document.querySelector('.onboarding-card');
                        const cards = Array.from(document.querySelectorAll('.onboarding-wallet-showcase .auth-card-preview'));

                        const paneStyle = window.getComputedStyle(previewPane);
                        const titleStyle = window.getComputedStyle(title);
                        const headlineStyle = window.getComputedStyle(headline);
                        const subheadStyle = window.getComputedStyle(subhead);

                        const paneRect = previewPane.getBoundingClientRect();
                        const titleRect = title.getBoundingClientRect();
                        const headlineRect = headline.getBoundingClientRect();
                        const showcaseRect = showcase.getBoundingClientRect();
                        const subheadRect = subhead.getBoundingClientRect();
                        const dividerRect = divider.getBoundingClientRect();
                        const formRect = formCard.getBoundingClientRect();

                        // Card intersection checks
                        let anyCardOverlaps = false;
                        let minGapToForm = 99999;
                        cards.forEach(c => {
                            const cr = c.getBoundingClientRect();
                            const overlaps = !(cr.right <= formRect.left || cr.left >= formRect.right || cr.bottom <= formRect.top || cr.top >= formRect.bottom);
                            if (overlaps) anyCardOverlaps = true;
                            const gap = formRect.left - cr.right;
                            if (gap < minGapToForm) minGapToForm = gap;
                        });

                        const docEl = document.documentElement;

                        return {
                            viewportWidth: window.innerWidth,
                            docScrollWidth: docEl.scrollWidth,
                            hasOverflow: docEl.scrollWidth > window.innerWidth,
                            paneAlignItems: paneStyle.alignItems,
                            paneTextAlign: paneStyle.textAlign,
                            titleTextAlign: titleStyle.textAlign,
                            headlineTextAlign: headlineStyle.textAlign,
                            subheadTextAlign: subheadStyle.textAlign,
                            titleLeft: titleRect.left,
                            headlineLeft: headlineRect.left,
                            showcaseLeft: showcaseRect.left,
                            subheadLeft: subheadRect.left,
                            dividerLeft: dividerRect.left,
                            formLeft: formRect.left,
                            minGapToForm: minGapToForm,
                            anyCardOverlaps: anyCardOverlaps
                        };
                    })()
                """)

                print(f"\n  Viewport {w}px Alignment & Containment:")
                print(f"    TextAlign: pane={metrics['paneTextAlign']}, title={metrics['titleTextAlign']}, headline={metrics['headlineTextAlign']}")
                print(f"    Left coordinates: title={metrics['titleLeft']:.1f}px, headline={metrics['headlineLeft']:.1f}px, showcase={metrics['showcaseLeft']:.1f}px, subhead={metrics['subheadLeft']:.1f}px")
                print(f"    Min Gap to Form Card: {metrics['minGapToForm']:.1f}px, Any Overlap: {metrics['anyCardOverlaps']}")
                print(f"    Horizontal Overflow: {metrics['hasOverflow']} (scrollWidth={metrics['docScrollWidth']}px)")

                assert metrics['titleTextAlign'] in ['left', 'start'], f"Title not left-aligned at {w}px: {metrics['titleTextAlign']}"
                assert metrics['headlineTextAlign'] in ['left', 'start'], f"Headline not left-aligned at {w}px: {metrics['headlineTextAlign']}"
                assert not metrics['hasOverflow'], f"Horizontal overflow at {w}px"
                assert not metrics['anyCardOverlaps'], f"Showcase card overlaps form card at {w}px"
                assert metrics['minGapToForm'] > 30, f"Gap to form card too small ({metrics['minGapToForm']:.1f}px) at {w}px"

                # Check left alignment coherence: title, headline, showcase, and subhead should share the same left boundary (within 2px)
                left_diff_title_headline = abs(metrics['titleLeft'] - metrics['headlineLeft'])
                left_diff_title_showcase = abs(metrics['titleLeft'] - metrics['showcaseLeft'])
                left_diff_title_subhead = abs(metrics['titleLeft'] - metrics['subheadLeft'])
                print(f"    Left alignment variance: headline={left_diff_title_headline:.1f}px, showcase={left_diff_title_showcase:.1f}px, subhead={left_diff_title_subhead:.1f}px")
                assert left_diff_title_headline < 3.0, f"Headline misaligned with title at {w}px: {left_diff_title_headline}px"
                assert left_diff_title_showcase < 3.0, f"Showcase misaligned with title at {w}px: {left_diff_title_showcase}px"
                assert left_diff_title_subhead < 3.0, f"Subhead misaligned with title at {w}px: {left_diff_title_subhead}px"

            # -----------------------------------------------------------------
            # TEST 4: Mobile & Tablet Viewports Regression Check (320, 390, 768px)
            # -----------------------------------------------------------------
            print("\n" + "=" * 60)
            print("TEST 4: MOBILE & TABLET REGRESSION (320px, 390px, 768px)")
            print("=" * 60)

            for mw, mh, is_m in [(320, 568, True), (390, 844, True), (768, 1024, False)]:
                await set_viewport(ws, mw, mh, is_mobile=is_m)
                await asyncio.sleep(0.15)

                mob_res = await eval_js(ws, """
                    (() => {
                        const previewPane = document.querySelector('.onboarding-preview-pane');
                        const divider = document.querySelector('.onboarding-container .auth-divider');
                        const formCard = document.querySelector('.onboarding-card');
                        const docEl = document.documentElement;

                        return {
                            previewDisplay: previewPane ? window.getComputedStyle(previewPane).display : 'none',
                            dividerDisplay: divider ? window.getComputedStyle(divider).display : 'none',
                            cardWidth: formCard ? formCard.getBoundingClientRect().width : 0,
                            hasOverflow: docEl.scrollWidth > window.innerWidth,
                            scrollWidth: docEl.scrollWidth
                        };
                    })()
                """)
                print(f"  Mobile/Tablet {mw}px: previewDisplay={mob_res['previewDisplay']}, cardWidth={mob_res['cardWidth']:.1f}px, overflow={mob_res['hasOverflow']}")
                assert mob_res['previewDisplay'] == 'none', f"Preview pane should be hidden on mobile/tablet at {mw}px"
                assert mob_res['dividerDisplay'] == 'none', f"Divider should be hidden on mobile/tablet at {mw}px"
                assert not mob_res['hasOverflow'], f"Horizontal overflow at {mw}px"

            # -----------------------------------------------------------------
            # TEST 5: Interactive Step Flow Regression
            # -----------------------------------------------------------------
            print("\n" + "=" * 60)
            print("TEST 5: INTERACTIVE ONBOARDING FLOW & DRAFT PERSISTENCE")
            print("=" * 60)

            await eval_js(ws, """
                (() => {
                    onboardingController.currentStep = 1;
                    onboardingController.draft.activeCountries = ['JP', 'IN'];
                    onboardingController._initDraftWallets();
                    onboardingController.render();
                })()
            """)
            await set_viewport(ws, 1200, 800, is_mobile=False)
            await asyncio.sleep(0.1)

            # Advance to step 2
            await eval_js(ws, "onboardingController.handleNext()")
            await asyncio.sleep(0.2)
            step2 = await eval_js(ws, "onboardingController.currentStep")
            assert step2 == 2, f"Expected Step 2, got {step2}"
            print("  Advanced to Step 2 (Budgets)")

            # Advance to step 3
            await eval_js(ws, "onboardingController.handleNext()")
            await asyncio.sleep(0.2)
            step3 = await eval_js(ws, "onboardingController.currentStep")
            assert step3 == 3, f"Expected Step 3 (Wallets), got {step3}"
            print("  Advanced to Step 3 (Wallets)")

            # Check that live balance edits in wallets update showcase balance
            print("  Updating Japan wallet balance in Step 3...")
            await eval_js(ws, """
                (() => {
                    const jpWalletKey = Object.keys(onboardingController.draft.wallets).find(k => onboardingController.draft.wallets[k].region === 'JP');
                    if (jpWalletKey) {
                        onboardingController.setWalletBalance(jpWalletKey, '950000');
                    }
                })()
            """)
            await asyncio.sleep(0.2)

            jp_bal_text = await eval_js(ws, """
                (() => {
                    const jpCard = document.querySelector('.onboarding-wallet-showcase .auth-card-jp .auth-card-balance');
                    return jpCard ? jpCard.textContent : null;
                })()
            """)
            print(f"  Live JPY card balance after edit: '{jp_bal_text}'")
            assert '950,000' in (jp_bal_text or ''), f"Showcase did not reflect live balance update: {jp_bal_text}"
            print("  [PASS] Live balance updates dynamically synchronize with the treasury cards.")

            # Advance to step 4
            await eval_js(ws, "onboardingController.handleNext()")
            await asyncio.sleep(0.2)
            step4 = await eval_js(ws, "onboardingController.currentStep")
            assert step4 == 4, f"Expected Step 4 (Loans & Review), got {step4}"
            print("  Advanced to Step 4 (Review)")

            # Complete onboarding
            completion = await eval_js(ws, """
                (() => {
                    onboardingController.completeAndEnterApp();
                    const screen = document.getElementById('onboarding-screen');
                    return {
                        screenDisplay: screen ? screen.style.display : null
                    };
                })()
            """)
            assert completion['screenDisplay'] == 'none', "Onboarding screen failed to dismiss"
            print("  [PASS] Completed onboarding and launched ledger successfully.")

            print("\n" + "=" * 80)
            print("ALL SHOWCASE REFINEMENT TESTS PASSED PERFECTLY!")
            print("=" * 80)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except Exception:
            proc.kill()

if __name__ == '__main__':
    asyncio.run(run_showcase_verification())
