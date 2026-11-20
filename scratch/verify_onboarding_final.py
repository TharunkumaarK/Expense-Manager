import asyncio
import json
import os
import subprocess
import time
import urllib.request
import websockets
import base64

CHROME_BIN = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'
CDP_PORT = 9447
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

async def run_final_verification():
    print("=" * 80)
    print("EXPENSE MANAGER — COMPREHENSIVE ONBOARDING RESPONSIVE & POLISH VERIFICATION")
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

    results = {
        "viewports": [],
        "short_height_viewports": [],
        "overlap_matrix": [],
        "touch_targets": [],
        "wrapping_checks": [],
        "zoom_check": None,
        "e2e_steps": []
    }

    try:
        with urllib.request.urlopen(f'http://localhost:{CDP_PORT}/json/list') as r:
            tabs = json.load(r)
            ws_url = tabs[0]['webSocketDebuggerUrl']

        async with websockets.connect(ws_url, max_size=30*1024*1024) as ws:
            await send_cmd(ws, "Page.enable")
            await send_cmd(ws, "Runtime.enable")
            await send_cmd(ws, "Page.navigate", {"url": INDEX_URL})
            await asyncio.sleep(2.0)

            # -----------------------------------------------------------------
            # 1. Accessibility Zoom Verification
            # -----------------------------------------------------------------
            print("\n--- CHECK 1: Viewport Meta Tag & Accessibility Zoom ---")
            meta_viewport = await eval_js(ws, """
                (() => {
                    const meta = document.querySelector('meta[name="viewport"]');
                    return meta ? meta.getAttribute('content') : null;
                })()
            """)
            print(f"  Viewport content: {meta_viewport}")
            assert meta_viewport, "Missing viewport meta tag"
            assert "maximum-scale" not in meta_viewport, "maximum-scale present! Prevents user zoom"
            assert "user-scalable=no" not in meta_viewport, "user-scalable=no present! Violates WCAG accessibility zoom"
            print("  [PASS] Viewport allows accessibility zoom (no user-scalable=no or maximum-scale).")
            results["zoom_check"] = {"content": meta_viewport, "passed": True}

            # Initialize Onboarding with 3 countries for rich multi-card showcase
            setup_res = await eval_js(ws, """
                (() => {
                    localStorage.clear();
                    if (typeof onboardingController !== 'undefined') {
                        onboardingController.show();
                        onboardingController.draft.activeCountries = ['JP', 'IN', 'DE'];
                        onboardingController.currentStep = 1;
                        onboardingController.render();
                        return { ok: true, step: onboardingController.currentStep };
                    }
                    return { ok: false };
                })()
            """)
            print(f"  [Init] Onboarding Initialized: {setup_res}")
            assert setup_res and setup_res.get("ok"), "Failed to init onboardingController"

            # -----------------------------------------------------------------
            # 2. Viewport Matrix & Element Overlap Verification Across 11 Widths
            # -----------------------------------------------------------------
            print("\n--- CHECK 2: Viewport Matrix & Element Overlap Check Across 11 Widths ---")
            # All 11 mandated widths:
            target_widths = [
                (320, 568, True, "Narrow Mobile (iPhone SE 1)"),
                (375, 667, True, "Standard Mobile (iPhone 8)"),
                (390, 844, True, "Modern Mobile (iPhone 12/13/14)"),
                (430, 932, True, "Large Mobile (iPhone 15 Pro Max)"),
                (768, 1024, False, "Tablet Portrait (iPad Mini/Air)"),
                (1024, 768, False, "Compact Desktop / iPad Landscape"),
                (1100, 800, False, "Intermediate Desktop (1100px)"),
                (1200, 800, False, "Standard Desktop (1200px)"),
                (1280, 800, False, "HD Desktop (1280px)"),
                (1366, 768, False, "Common Laptop (1366px)"),
                (1440, 900, False, "Desktop Baseline (1440px)")
            ]

            for w, h, is_mob, label in target_widths:
                await set_viewport(ws, w, h, is_mobile=is_mob)
                await asyncio.sleep(0.25)

                metrics = await eval_js(ws, """
                    (() => {
                        const docEl = document.documentElement;
                        const body = document.body;
                        const card = document.querySelector('.onboarding-card');
                        const divider = document.querySelector('.onboarding-container .auth-divider');
                        const showcase = document.querySelector('.onboarding-wallet-showcase');
                        const previewPane = document.querySelector('.onboarding-preview-pane');
                        const previewCards = Array.from(document.querySelectorAll('.auth-card-preview'));

                        const cardRect = card ? card.getBoundingClientRect() : null;
                        const dividerRect = divider ? divider.getBoundingClientRect() : null;
                        const showcaseRect = showcase ? showcase.getBoundingClientRect() : null;
                        const previewDisplay = previewPane ? getComputedStyle(previewPane).display : 'none';
                        const dividerDisplay = divider ? getComputedStyle(divider).display : 'none';

                        // Check bounding box overlaps between form card and each preview card
                        const cardIntersections = [];
                        let anyCardOverlaps = false;
                        let minGapToFormCard = 999999;

                        if (cardRect && previewDisplay !== 'none') {
                            previewCards.forEach((c, idx) => {
                                const cr = c.getBoundingClientRect();
                                const isOverlapping = !(cr.right <= cardRect.left || 
                                                        cr.left >= cardRect.right || 
                                                        cr.bottom <= cardRect.top || 
                                                        cr.top >= cardRect.bottom);
                                if (isOverlapping) anyCardOverlaps = true;
                                const horizontalGap = cardRect.left - cr.right;
                                if (horizontalGap < minGapToFormCard) minGapToFormCard = horizontalGap;
                                cardIntersections.push({
                                    idx,
                                    cardRight: cr.right,
                                    cardLeft: cr.left,
                                    cardWidth: cr.width,
                                    cardHeight: cr.height,
                                    horizontalGap: horizontalGap,
                                    isOverlapping: isOverlapping
                                });
                            });
                        }

                        return {
                            viewportWidth: window.innerWidth,
                            viewportHeight: window.innerHeight,
                            docScrollWidth: docEl.scrollWidth,
                            bodyScrollWidth: body.scrollWidth,
                            hasHorizontalOverflow: docEl.scrollWidth > window.innerWidth || body.scrollWidth > window.innerWidth,
                            cardWidth: cardRect ? cardRect.width : 0,
                            cardLeft: cardRect ? cardRect.left : 0,
                            previewDisplay: previewDisplay,
                            dividerDisplay: dividerDisplay,
                            anyCardOverlaps: anyCardOverlaps,
                            minGapToFormCard: minGapToFormCard === 999999 ? null : minGapToFormCard,
                            cardIntersections: cardIntersections
                        };
                    })()
                """)

                print(f"\n  Viewport {w}x{h} ({label}):")
                print(f"    ScrollWidth: {metrics['docScrollWidth']}px vs Window: {metrics['viewportWidth']}px -> Overflow: {metrics['hasHorizontalOverflow']}")
                print(f"    Form Card: width={metrics['cardWidth']:.1f}px, left={metrics['cardLeft']:.1f}px")
                print(f"    Preview Display: {metrics['previewDisplay']}, Divider Display: {metrics['dividerDisplay']}")
                print(f"    Any Card Overlaps Form Card: {metrics['anyCardOverlaps']}, Min Gap: {metrics['minGapToFormCard']}")

                assert not metrics["hasHorizontalOverflow"], f"Horizontal overflow at {w}px!"
                assert not metrics["anyCardOverlaps"], f"CRITICAL: Showcase card physically overlaps onboarding card at {w}px!"
                if w >= 1024:
                    assert metrics["previewDisplay"] != 'none', f"Preview pane must be visible at {w}px"
                    assert metrics["dividerDisplay"] != 'none', f"Divider must be visible at {w}px"
                    assert metrics["minGapToFormCard"] > 20, f"Gap between cards and form too small ({metrics['minGapToFormCard']}px) at {w}px"

                results["overlap_matrix"].append({
                    "width": w,
                    "height": h,
                    "label": label,
                    "hasOverflow": metrics["hasHorizontalOverflow"],
                    "anyOverlap": metrics["anyCardOverlaps"],
                    "minGap": metrics["minGapToFormCard"],
                    "cardWidth": metrics["cardWidth"]
                })

                # Capture screenshots at critical breakpoints
                if w in [320, 390, 768, 1024, 1100, 1200, 1440]:
                    await capture_screenshot(ws, f"onboarding_final_step1_{w}.png")

            # -----------------------------------------------------------------
            # 3. Short-Height Viewports & Action Reachability
            # -----------------------------------------------------------------
            print("\n--- CHECK 3: Short-Height Viewports (1024x500, 390x600, 1440x600) ---")
            short_heights = [
                (1024, 500, False, "Short Desktop / Netbook (1024x500)"),
                (390, 600, True, "Landscape / Short Mobile (390x600)"),
                (1440, 600, False, "Ultrawide Short Window (1440x600)")
            ]

            for w, h, is_mob, label in short_heights:
                await set_viewport(ws, w, h, is_mobile=is_mob)
                await asyncio.sleep(0.25)

                metrics_short = await eval_js(ws, """
                    (() => {
                        const viewportEl = document.querySelector('#onboarding-screen.auth-viewport');
                        const card = document.querySelector('.onboarding-card');
                        const actions = document.querySelector('.onboarding-actions');
                        const nextBtn = document.querySelector('.onboarding-btn-next');

                        // Scroll to bottom
                        viewportEl.scrollTop = viewportEl.scrollHeight;

                        const nextRect = nextBtn ? nextBtn.getBoundingClientRect() : null;
                        const actionsRect = actions ? actions.getBoundingClientRect() : null;

                        const isNextBtnVisible = nextRect && 
                                                 nextRect.top >= 0 && 
                                                 nextRect.bottom <= window.innerHeight + 5 && // within visible viewport
                                                 nextRect.width > 0 && 
                                                 nextRect.height > 0;

                        return {
                            viewportScrollHeight: viewportEl.scrollHeight,
                            viewportClientHeight: viewportEl.clientHeight,
                            isScrollable: viewportEl.scrollHeight > viewportEl.clientHeight,
                            isNextBtnVisible: isNextBtnVisible,
                            nextBtnRect: nextRect,
                            actionsRect: actionsRect
                        };
                    })()
                """)

                print(f"\n  Short Viewport {w}x{h} ({label}):")
                print(f"    ScrollHeight: {metrics_short['viewportScrollHeight']}px vs ClientHeight: {metrics_short['viewportClientHeight']}px (Scrollable: {metrics_short['isScrollable']})")
                print(f"    Next Button Reachable in Viewport: {metrics_short['isNextBtnVisible']}, Rect: {metrics_short['nextBtnRect']}")

                assert metrics_short["isNextBtnVisible"], f"Action button unreachable at short height {w}x{h}!"
                results["short_height_viewports"].append({
                    "width": w,
                    "height": h,
                    "label": label,
                    "isScrollable": metrics_short["isScrollable"],
                    "isNextBtnVisible": metrics_short["isNextBtnVisible"]
                })
                await capture_screenshot(ws, f"onboarding_short_{w}x{h}.png")

            # -----------------------------------------------------------------
            # 4. Step 3: Add Account Touch Target & Wallet Name Multi-Line Wrapping
            # -----------------------------------------------------------------
            print("\n--- CHECK 4: Step 3 Add Account Touch Targets & Wallet Wrapping ---")
            await eval_js(ws, """
                (() => {
                    onboardingController.currentStep = 3;
                    onboardingController.draft.activeCountries = ['JP', 'IN'];
                    onboardingController.draft.wallets = {
                        'w_jp1': { id: 'w_jp1', name: 'Tokyo Mitsubishi UFJ Main Business Checking Account', type: 'bank', balance: 450000, region: 'JP', color: '#10b981' },
                        'w_jp2': { id: 'w_jp2', name: 'Physical Cash Reserve & Daily Transportation Float', type: 'cash', balance: 35000, region: 'JP', color: '#f59e0b' },
                        'w_in1': { id: 'w_in1', name: 'State Bank of India — NRE High-Yield Savings Account', type: 'bank', balance: 125000.75, region: 'IN', color: '#3b82f6' },
                        'w_in2': { id: 'w_in2', name: 'ICICI Emergency Liquidity Reserve & Contingency Vault', type: 'bank', balance: 50000, region: 'IN', color: '#6366f1' }
                    };
                    onboardingController.render();
                })()
            """)
            await asyncio.sleep(0.3)

            # Test on desktop (1440px): Add Account height >= 40px
            await set_viewport(ws, 1440, 900, is_mobile=False)
            await asyncio.sleep(0.2)
            desktop_btn_metrics = await eval_js(ws, """
                (() => {
                    const addBtns = Array.from(document.querySelectorAll('.onboarding-btn-add-wallet'));
                    const delBtns = Array.from(document.querySelectorAll('.onboarding-wallet-delete-btn'));
                    const names = Array.from(document.querySelectorAll('.onboarding-wallet-row-name'));

                    return {
                        addBtnHeights: addBtns.map(b => b.getBoundingClientRect().height),
                        delBtnHeights: delBtns.map(b => b.getBoundingClientRect().height),
                        namesWrapping: names.map(n => ({
                            name: n.textContent,
                            title: n.getAttribute('title'),
                            height: n.getBoundingClientRect().height,
                            lineClamp: getComputedStyle(n).webkitLineClamp,
                            wordBreak: getComputedStyle(n).wordBreak
                        }))
                    };
                })()
            """)
            print("\n  Desktop (1440px) Step 3 Touch Targets & Typography:")
            for h in desktop_btn_metrics["addBtnHeights"]:
                print(f"    Add Account Button Height: {h:.1f}px (Target >= 40px)")
                assert h >= 39.9, f"Add Account button undersized on desktop: {h}px"
            results["touch_targets"].append({"context": "Desktop 1440px Add Button", "heights": desktop_btn_metrics["addBtnHeights"], "passed": True})

            for h in desktop_btn_metrics["delBtnHeights"]:
                print(f"    Delete Button Height: {h:.1f}px (Target >= 38px)")
                assert h >= 37.9, f"Delete button undersized on desktop: {h}px"

            await capture_screenshot(ws, "onboarding_final_step3_1440.png")

            # Test on Mobile (320px & 390px): Add Account height >= 44px, Delete button 44x44px, Wallet Name multi-line wrapping
            for test_w, test_h in [(390, 844), (320, 568)]:
                await set_viewport(ws, test_w, test_h, is_mobile=True)
                await asyncio.sleep(0.2)

                mob_wallet_metrics = await eval_js(ws, """
                    (() => {
                        const addBtns = Array.from(document.querySelectorAll('.onboarding-btn-add-wallet'));
                        const delBtns = Array.from(document.querySelectorAll('.onboarding-wallet-delete-btn'));
                        const names = Array.from(document.querySelectorAll('.onboarding-wallet-row-name'));
                        const docEl = document.documentElement;

                        return {
                            hasOverflow: docEl.scrollWidth > window.innerWidth,
                            addBtnHeights: addBtns.map(b => b.getBoundingClientRect().height),
                            delBtnSizes: delBtns.map(b => ({
                                w: b.getBoundingClientRect().width,
                                h: b.getBoundingClientRect().height,
                                right: b.getBoundingClientRect().right,
                                windowWidth: window.innerWidth
                            })),
                            namesInfo: names.map(n => ({
                                name: n.textContent,
                                height: n.getBoundingClientRect().height,
                                whiteSpace: getComputedStyle(n).whiteSpace,
                                wordBreak: getComputedStyle(n).wordBreak,
                                isMultiLine: n.getBoundingClientRect().height > 20
                            }))
                        };
                    })()
                """)

                print(f"\n  Mobile ({test_w}px) Step 3 Touch Targets & Multi-line Wrapping:")
                print(f"    Horizontal Overflow: {mob_wallet_metrics['hasOverflow']}")
                assert not mob_wallet_metrics["hasOverflow"], f"Horizontal overflow with long wallet names at {test_w}px!"

                for h in mob_wallet_metrics["addBtnHeights"]:
                    print(f"    Add Account Button Height: {h:.1f}px (Mandatory Mobile Touch Target >= 44px)")
                    assert h >= 43.9, f"Add Account button undersized on mobile {test_w}px: {h}px"

                for d in mob_wallet_metrics["delBtnSizes"]:
                    print(f"    Delete Button Size: {d['w']:.1f}x{d['h']:.1f}px (Target >= 44x44px), Fully On-screen: {d['right'] <= d['windowWidth']}")
                    assert d['w'] >= 43.9 and d['h'] >= 43.9, f"Delete button touch target < 44px on mobile: {d}"
                    assert d['right'] <= d['windowWidth'], f"Delete button clipped on mobile: {d}"

                for n in mob_wallet_metrics["namesInfo"]:
                    print(f"    Wallet Name: '{n['name']}' -> height={n['height']:.1f}px, multiLine={n['isMultiLine']}, whiteSpace={n['whiteSpace']}, wordBreak={n['wordBreak']}")
                    assert n['whiteSpace'] == 'normal', f"Wallet name white-space must be normal for wrapping, got {n['whiteSpace']}"
                    assert n['wordBreak'] == 'break-word', f"Wallet name word-break must be break-word, got {n['wordBreak']}"

                results["wrapping_checks"].append({
                    "width": test_w,
                    "overflow": mob_wallet_metrics["hasOverflow"],
                    "addBtnHeights": mob_wallet_metrics["addBtnHeights"],
                    "allDelPassed": True,
                    "namesWrapped": all(n['whiteSpace'] == 'normal' for n in mob_wallet_metrics["namesInfo"])
                })
                await capture_screenshot(ws, f"onboarding_final_step3_wrapping_{test_w}.png")

            # -----------------------------------------------------------------
            # 5. Interactive End-to-End Walkthrough All 4 Steps
            # -----------------------------------------------------------------
            print("\n--- CHECK 5: Interactive End-to-End Walkthrough All 4 Steps ---")
            await eval_js(ws, """
                (() => {
                    localStorage.clear();
                    onboardingController.currentStep = 1;
                    onboardingController.draft = {
                        activeCountries: ['JP'],
                        defaultCountry: 'JP',
                        budgets: {
                            JP: { enabled: true, monthlyTotal: 120000, rolloverEnabled: true },
                            IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false },
                            DE: { enabled: false, monthlyTotal: 0, rolloverEnabled: false }
                        },
                        wallets: {
                            'default_cash_jp': { id: 'default_cash_jp', name: 'Cash', type: 'cash', balance: 10000, region: 'JP', color: '#10b981' },
                            'default_bank_jp': { id: 'default_bank_jp', name: 'Bank', type: 'bank', balance: 200000, region: 'JP', color: '#3b82f6' }
                        },
                        loanConfig: {
                            enabled: false,
                            country: 'IN',
                            currency: '₹',
                            totalPrincipal: 0,
                            principalLeft: 0,
                            emi: 0,
                            annualInterestRate: 0,
                            emiDrawDate: 7
                        }
                    };
                    onboardingController.render();
                })()
            """)
            await set_viewport(ws, 1024, 768, is_mobile=False)
            await asyncio.sleep(0.2)

            # Step 1: Toggle IN and DE
            print("  Step 1: Selecting India (IN) and Germany (DE)...")
            await eval_js(ws, """
                (() => {
                    onboardingController.toggleCountry('IN');
                    onboardingController.toggleCountry('DE');
                })()
            """)
            c_step1 = await eval_js(ws, "onboardingController.draft.activeCountries")
            print("    Active countries:", c_step1)
            assert 'IN' in c_step1 and 'DE' in c_step1 and 'JP' in c_step1

            # Advance to Step 2
            await eval_js(ws, "onboardingController.handleNext()")
            await asyncio.sleep(0.2)
            cur_s = await eval_js(ws, "onboardingController.currentStep")
            assert cur_s == 2, f"Expected step 2, got {cur_s}"
            print(f"    Advanced to Step {cur_s}")
            await capture_screenshot(ws, "onboarding_final_step2_1024.png")

            # Step 2: Configure budgets
            print("  Step 2: Configuring multi-currency budgets...")
            await eval_js(ws, """
                (() => {
                    onboardingController.toggleBudgetEnabled('IN', true);
                    onboardingController.setBudgetAmount('IN', '55000');
                    onboardingController.toggleBudgetRollover('IN', true);
                    onboardingController.toggleBudgetEnabled('DE', true);
                    onboardingController.setBudgetAmount('DE', '1200');
                })()
            """)
            b_state = await eval_js(ws, "onboardingController.draft.budgets")
            print("    Budgets configured:", b_state)

            # Advance to Step 3
            await eval_js(ws, "onboardingController.handleNext()")
            await asyncio.sleep(0.2)
            cur_s = await eval_js(ws, "onboardingController.currentStep")
            assert cur_s == 3, f"Expected step 3, got {cur_s}"
            print(f"    Advanced to Step {cur_s}")
            await capture_screenshot(ws, "onboarding_final_step3_1024.png")

            # Step 3: Add new wallet
            print("  Step 3: Adding Euro checking account...")
            await eval_js(ws, """
                (() => {
                    const newId = 'de_n26_' + Date.now();
                    onboardingController.draft.wallets[newId] = {
                        id: newId,
                        name: 'N26 Premium Euro Checking Account',
                        type: 'bank',
                        balance: 3200,
                        region: 'DE',
                        color: '#2563eb'
                    };
                    onboardingController.renderStep3();
                })()
            """)

            # Advance to Step 4
            await eval_js(ws, "onboardingController.handleNext()")
            await asyncio.sleep(0.2)
            cur_s = await eval_js(ws, "onboardingController.currentStep")
            assert cur_s == 4, f"Expected step 4, got {cur_s}"
            print(f"    Advanced to Step {cur_s}")
            await capture_screenshot(ws, "onboarding_final_step4_1024.png")

            # Step 4: Toggle Loan and review summary
            print("  Step 4: Enabling loan tracking and reviewing summary...")
            await eval_js(ws, """
                (() => {
                    onboardingController.draft.loanConfig.enabled = true;
                    onboardingController.draft.loanConfig.totalPrincipal = 2500000;
                    onboardingController.draft.loanConfig.principalLeft = 2100000;
                    onboardingController.draft.loanConfig.emi = 45000;
                    onboardingController.draft.loanConfig.annualInterestRate = 8.65;
                    onboardingController.render();
                })()
            """)
            await asyncio.sleep(0.2)
            await capture_screenshot(ws, "onboarding_final_step4_review_1024.png")

            # Final Step: Complete Onboarding and enter app
            print("  Final: Executing completeAndEnterApp()...")
            completion_res = await eval_js(ws, """
                (() => {
                    onboardingController.completeAndEnterApp();
                    const screen = document.getElementById('onboarding-screen');
                    return {
                        screenDisplay: screen ? screen.style.display : null,
                        configured: localStorage.getItem('em_user_configured')
                    };
                })()
            """)
            print("    Completion Result:", completion_res)
            assert completion_res["screenDisplay"] == 'none', "Onboarding screen not hidden on completion"
            print("    [PASS] Onboarding successfully completed and main application entered.")

            print("\n" + "=" * 80)
            print("ALL RESPONSIVE, TOUCH-TARGET, OVERLAP & POLISH CHECKS PASSED PERFECTLY!")
            print("=" * 80)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except Exception:
            proc.kill()

if __name__ == '__main__':
    asyncio.run(run_final_verification())

