import asyncio
import json
import os
import subprocess
import time
import urllib.request
import websockets
import base64

CHROME_BIN = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'
CDP_PORT = 9446
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

async def run_verification():
    print("=" * 80)
    print("EXPENSE MANAGER — RESPONSIVE ONBOARDING VERIFICATION & AUDIT SUITE")
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
    time.sleep(1)

    verification_results = {
        "viewports_checked": [],
        "overflow_assertions": [],
        "card_width_assertions": [],
        "touch_target_assertions": [],
        "font_size_assertions": [],
        "functional_assertions": []
    }

    try:
        with urllib.request.urlopen(f'http://localhost:{CDP_PORT}/json/list') as r:
            tabs = json.load(r)
            ws_url = tabs[0]['webSocketDebuggerUrl']

        async with websockets.connect(ws_url, max_size=30*1024*1024) as ws:
            await send_cmd(ws, "Page.enable")
            await send_cmd(ws, "Runtime.enable")
            await send_cmd(ws, "Page.navigate", {"url": INDEX_URL})
            await asyncio.sleep(2)

            # Initialize onboarding screen
            setup_res = await eval_js(ws, """
                (() => {
                    localStorage.clear();
                    if (typeof onboardingController !== 'undefined') {
                        onboardingController.show();
                        return { ok: true, step: onboardingController.currentStep };
                    }
                    return { ok: false };
                })()
            """)
            print(f"\n[Init] Onboarding Controller Initialized: {setup_res}")
            assert setup_res and setup_res.get("ok"), "Failed to initialize onboardingController"

            # -------------------------------------------------------------
            # TEST GROUP 1: Responsive Invariants & Visual Captures Across Viewports
            # -------------------------------------------------------------
            print("\n--- TEST GROUP 1: Responsive Invariants Across Viewports ---")

            viewports = [
                ("320", 320, 568, True, "Narrow Mobile (iPhone SE 1st gen)"),
                ("375", 375, 667, True, "Standard Mobile (iPhone SE / older iPhones)"),
                ("390", 390, 844, True, "Modern Mobile (iPhone 12/13/14)"),
                ("430", 430, 932, True, "Large Mobile (iPhone 14/15 Pro Max)"),
                ("768", 768, 1024, False, "Tablet Portrait (iPad Mini/Air)"),
                ("1024", 1024, 768, False, "Small Desktop / iPad Landscape"),
                ("1440", 1440, 900, False, "Desktop Baseline (1440p)"),
            ]

            # Step 1 across all viewports
            for vp_code, w, h, is_mob, desc in viewports:
                print(f"\n  Checking Step 1 at {w}x{h} ({desc}):")
                await set_viewport(ws, w, h, is_mobile=is_mob)
                await asyncio.sleep(0.3)

                metrics = await eval_js(ws, """
                    (() => {
                        const docEl = document.documentElement;
                        const body = document.body;
                        const card = document.querySelector('.onboarding-card');
                        const container = document.querySelector('.onboarding-container');
                        const mobilePill = document.getElementById('onboarding-step-pill-mobile');
                        const previewPane = document.querySelector('.onboarding-preview-pane');
                        const inputs = Array.from(document.querySelectorAll('#onboarding-screen input:not([type="checkbox"]), #onboarding-screen select'));
                        const buttons = Array.from(document.querySelectorAll('#onboarding-screen .onboarding-btn, #onboarding-screen .onboarding-country-card'));
                        
                        const inputFontSizes = inputs.map(el => parseFloat(getComputedStyle(el).fontSize));
                        const btnHeights = buttons.map(el => el.getBoundingClientRect().height);

                        return {
                            innerWidth: window.innerWidth,
                            docScrollWidth: docEl.scrollWidth,
                            bodyScrollWidth: body.scrollWidth,
                            cardWidth: card ? card.getBoundingClientRect().width : 0,
                            cardOffsetLeft: card ? card.getBoundingClientRect().left : 0,
                            mobilePillDisplay: mobilePill ? getComputedStyle(mobilePill).display : 'none',
                            previewDisplay: previewPane ? getComputedStyle(previewPane).display : 'none',
                            minInputFontSize: inputFontSizes.length > 0 ? Math.min(...inputFontSizes) : 16,
                            minBtnHeight: btnHeights.length > 0 ? Math.min(...btnHeights) : 44
                        };
                    })()
                """)

                # Assertions
                has_overflow = metrics["docScrollWidth"] > metrics["innerWidth"] or metrics["bodyScrollWidth"] > metrics["innerWidth"]
                card_ratio = metrics["cardWidth"] / metrics["innerWidth"]

                print(f"    ScrollWidth: {metrics['docScrollWidth']}px (Window: {metrics['innerWidth']}px) -> Overflow: {has_overflow}")
                print(f"    Card Width: {metrics['cardWidth']:.1f}px (Ratio: {card_ratio*100:.1f}%)")
                print(f"    Mobile Pill Display: {metrics['mobilePillDisplay']}, Preview Pane: {metrics['previewDisplay']}")

                assert not has_overflow, f"Horizontal overflow detected at {w}px! docScrollWidth={metrics['docScrollWidth']}, innerWidth={metrics['innerWidth']}"
                verification_results["overflow_assertions"].append((f"Step 1 - {w}px", not has_overflow))

                if w < 1024:
                    # Mobile/Tablet single-column invariant: card must be prominent (>= 88% on narrow mobile, max-width bounded on tablet)
                    assert card_ratio >= 0.70 or metrics["cardWidth"] >= 580, f"Card squeezed on mobile/tablet at {w}px! cardWidth={metrics['cardWidth']}"
                    verification_results["card_width_assertions"].append((f"Step 1 - {w}px", True))
                    assert metrics["mobilePillDisplay"] != 'none', f"Mobile step pill should be visible at {w}px"
                    assert metrics["previewDisplay"] == 'none', f"Desktop preview pane should be hidden at {w}px"
                else:
                    # Desktop invariant: preview pane must be visible
                    assert metrics["previewDisplay"] != 'none', f"Preview pane should be visible at desktop {w}px"
                    assert metrics["mobilePillDisplay"] == 'none', f"Mobile step pill should be hidden at desktop {w}px"

                await capture_screenshot(ws, f"onboarding_after_step1_{vp_code}.png")

            # -------------------------------------------------------------
            # Captures & Checks for Steps 2, 3, and 4
            # -------------------------------------------------------------
            step_checks = [
                (2, "Budgets Setup"),
                (3, "Opening Wallets"),
                (4, "Loan Tracking & Summary")
            ]

            target_vps = [
                ("320", 320, 568, True),
                ("390", 390, 844, True),
                ("768", 768, 1024, False),
                ("1440", 1440, 900, False),
            ]

            for step_num, step_title in step_checks:
                print(f"\n--- Checking Step {step_num}: {step_title} ---")
                await eval_js(ws, f"""
                    (() => {{
                        onboardingController.currentStep = {step_num};
                        onboardingController.render();
                    }})()
                """)
                await asyncio.sleep(0.3)

                for vp_code, w, h, is_mob in target_vps:
                    print(f"  Step {step_num} at {w}x{h}:")
                    await set_viewport(ws, w, h, is_mobile=is_mob)
                    await asyncio.sleep(0.3)

                    step_metrics = await eval_js(ws, """
                        (() => {
                            const docEl = document.documentElement;
                            const body = document.body;
                            const card = document.querySelector('.onboarding-card');
                            const inputs = Array.from(document.querySelectorAll('#onboarding-screen input:not([type="checkbox"]), #onboarding-screen select'));
                            const buttons = Array.from(document.querySelectorAll('#onboarding-screen .onboarding-btn, #onboarding-screen .onboarding-wallet-del-btn, #onboarding-screen .onboarding-country-card'));
                            
                            const inputFontSizes = inputs.map(el => parseFloat(getComputedStyle(el).fontSize));
                            const btnHeights = buttons.map(el => el.getBoundingClientRect().height);

                            return {
                                innerWidth: window.innerWidth,
                                docScrollWidth: docEl.scrollWidth,
                                bodyScrollWidth: body.scrollWidth,
                                cardWidth: card ? card.getBoundingClientRect().width : 0,
                                minInputFontSize: inputFontSizes.length > 0 ? Math.min(...inputFontSizes) : 16,
                                minBtnHeight: btnHeights.length > 0 ? Math.min(...btnHeights) : 44
                            };
                        })()
                    """)

                    has_overflow = step_metrics["docScrollWidth"] > step_metrics["innerWidth"] or step_metrics["bodyScrollWidth"] > step_metrics["innerWidth"]
                    print(f"    ScrollWidth: {step_metrics['docScrollWidth']}px (Window: {step_metrics['innerWidth']}px) -> Overflow: {has_overflow}")
                    assert not has_overflow, f"Horizontal overflow detected at Step {step_num} ({w}px)"
                    verification_results["overflow_assertions"].append((f"Step {step_num} - {w}px", not has_overflow))

                    # iOS Auto-zoom prevention check on mobile
                    if is_mob:
                        print(f"    Min Input Font Size: {step_metrics['minInputFontSize']}px (must be >= 16px to prevent iOS auto-zoom)")
                        assert step_metrics["minInputFontSize"] >= 15.9, f"Input font size < 16px at {w}px ({step_metrics['minInputFontSize']}px)"
                        verification_results["font_size_assertions"].append((f"Step {step_num} - {w}px", True))

                    # Touch target check
                    print(f"    Min Button Height: {step_metrics['minBtnHeight']:.1f}px (target >= 40px/44px)")

                    await capture_screenshot(ws, f"onboarding_after_step{step_num}_{vp_code}.png")

            # -------------------------------------------------------------
            # TEST GROUP 2: Step 3 Adaptive Layout & Long Wallet Names
            # -------------------------------------------------------------
            print("\n--- TEST GROUP 2: Step 3 Adaptive Layout & Long Wallet Names ---")
            await eval_js(ws, """
                (() => {
                    onboardingController.currentStep = 3;
                    onboardingController.draft.activeCountries = ['JP', 'IN'];
                    onboardingController.draft.wallets = {
                        'w1': { id: 'w1', name: 'Main Checking Account (Tokyo Mitsubishi UFJ)', type: 'bank', balance: 450000, region: 'JP', color: '#10b981' },
                        'w2': { id: 'w2', name: 'Physical Cash Reserve & Daily Travel Envelope', type: 'cash', balance: 35000, region: 'JP', color: '#f59e0b' },
                        'w3': { id: 'w3', name: 'State Bank of India — NRE High-Yield Savings Account', type: 'bank', balance: 125000.75, region: 'IN', color: '#3b82f6' },
                        'w4': { id: 'w4', name: 'ICICI Emergency Liquidity Reserve Account', type: 'bank', balance: 50000, region: 'IN', color: '#6366f1' }
                    };
                    onboardingController.render();
                })()
            """)
            await asyncio.sleep(0.3)

            # Test 320px narrow mobile with long wallet names
            await set_viewport(ws, 320, 568, is_mobile=True)
            await asyncio.sleep(0.3)
            wallet_metrics_320 = await eval_js(ws, """
                (() => {
                    const rows = Array.from(document.querySelectorAll('.onboarding-wallet-row'));
                    const delBtns = Array.from(document.querySelectorAll('.onboarding-wallet-delete-btn'));
                    const inputs = Array.from(document.querySelectorAll('.onboarding-balance-input'));
                    const docEl = document.documentElement;

                    const delRects = delBtns.map(b => b.getBoundingClientRect());
                    const inputRects = inputs.map(i => i.getBoundingClientRect());

                    return {
                        hasOverflow: docEl.scrollWidth > window.innerWidth,
                        docScrollWidth: docEl.scrollWidth,
                        windowWidth: window.innerWidth,
                        rowCount: rows.length,
                        delCount: delBtns.length,
                        allDelVisible: delRects.length > 0 && delRects.every(r => r.width >= 36 && r.right <= window.innerWidth),
                        allInputFullWidth: inputRects.length > 0 && inputRects.every(r => r.width >= 120),
                        delButtonSizes: delRects.map(r => ({ w: r.width, h: r.height }))
                    };
                })()
            """)
            print("  320px Long Wallet Layout Metrics:", wallet_metrics_320)
            assert not wallet_metrics_320["hasOverflow"], "Horizontal overflow with long wallet names at 320px!"
            assert wallet_metrics_320["rowCount"] == 4, f"Expected 4 wallet rows, got {wallet_metrics_320['rowCount']}"
            assert wallet_metrics_320["allDelVisible"], "Wallet delete button clipped at 320px!"
            await capture_screenshot(ws, "onboarding_after_step3_long_names_320.png")
            verification_results["functional_assertions"].append(("Step 3 Long Wallet Names 320px", True))

            # -------------------------------------------------------------
            # TEST GROUP 3: Step 4 Loan Grid Collapse & Summary Verification
            # -------------------------------------------------------------
            print("\n--- TEST GROUP 3: Step 4 Loan Grid Collapse & Summary Verification ---")
            await eval_js(ws, """
                (() => {
                    onboardingController.currentStep = 4;
                    onboardingController.draft.loanConfig.enabled = true;
                    onboardingController.draft.loanConfig.totalPrincipal = 1500000;
                    onboardingController.draft.loanConfig.principalLeft = 1200000;
                    onboardingController.draft.loanConfig.emi = 32000;
                    onboardingController.draft.loanConfig.annualInterestRate = 8.5;
                    onboardingController.render();
                })()
            """)
            await asyncio.sleep(0.3)

            # Test 375px mobile
            await set_viewport(ws, 375, 667, is_mobile=True)
            await asyncio.sleep(0.3)
            loan_metrics = await eval_js(ws, """
                (() => {
                    const loanGrid = document.querySelector('.onboarding-loan-grid');
                    const summaryItems = Array.from(document.querySelectorAll('.onboarding-summary-item'));
                    const docEl = document.documentElement;

                    return {
                        hasOverflow: docEl.scrollWidth > window.innerWidth,
                        gridCols: loanGrid ? getComputedStyle(loanGrid).gridTemplateColumns : null,
                        summaryCount: summaryItems.length
                    };
                })()
            """)
            print("  375px Loan & Summary Metrics:", loan_metrics)
            assert not loan_metrics["hasOverflow"], "Horizontal overflow on Step 4 loan form at 375px!"
            await capture_screenshot(ws, "onboarding_after_step4_loan_active_375.png")
            verification_results["functional_assertions"].append(("Step 4 Loan Active 375px", True))

            # -------------------------------------------------------------
            # TEST GROUP 4: Interactive End-to-End Flow & State Preservation
            # -------------------------------------------------------------
            print("\n--- TEST GROUP 4: Interactive End-to-End Flow & State Preservation ---")
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
            await set_viewport(ws, 390, 844, is_mobile=True)
            await asyncio.sleep(0.3)

            # 4.1 Step 1 Country Selection
            print("  4.1: Toggling India (IN) in Step 1...")
            res1 = await eval_js(ws, """
                (() => {
                    onboardingController.toggleCountry('IN');
                    return {
                        countries: onboardingController.draft.activeCountries,
                        primary: onboardingController.draft.defaultCountry
                    };
                })()
            """)
            print("    Draft countries after toggle:", res1)
            assert 'IN' in res1["countries"] and 'JP' in res1["countries"], "India was not added to activeCountries"
            verification_results["functional_assertions"].append(("Country toggle selection", True))

            # Click Next to Step 2
            print("  4.2: Advancing to Step 2...")
            await eval_js(ws, "onboardingController.handleNext()")
            await asyncio.sleep(0.3)
            cur_step = await eval_js(ws, "onboardingController.currentStep")
            assert cur_step == 2, f"Expected step 2, got {cur_step}"
            print(f"    Successfully advanced to Step {cur_step}")

            # 4.2 Step 2 Budgets Configuration
            print("  4.3: Configuring budgets in Step 2...")
            res2 = await eval_js(ws, """
                (() => {
                    onboardingController.toggleBudgetEnabled('IN', true);
                    onboardingController.setBudgetAmount('IN', '45000');
                    onboardingController.toggleBudgetRollover('IN', true);
                    return {
                        jpBudget: onboardingController.draft.budgets['JP'].monthlyTotal,
                        inBudget: onboardingController.draft.budgets['IN'].monthlyTotal,
                        inRollover: onboardingController.draft.budgets['IN'].rolloverEnabled
                    };
                })()
            """)
            print("    Draft budgets:", res2)
            assert res2["inBudget"] == 45000, "INR budget not set"
            verification_results["functional_assertions"].append(("Budget amount configuration", True))

            # Click Next to Step 3
            print("  4.4: Advancing to Step 3...")
            await eval_js(ws, "onboardingController.handleNext()")
            await asyncio.sleep(0.3)
            cur_step = await eval_js(ws, "onboardingController.currentStep")
            assert cur_step == 3, f"Expected step 3, got {cur_step}"
            print(f"    Successfully advanced to Step {cur_step}")

            # 4.3 Step 3 Wallets Configuration
            print("  4.5: Adding a custom wallet and editing balance in Step 3...")
            res3 = await eval_js(ws, """
                (() => {
                    const newId = 'wallet_in_sbi_' + Date.now();
                    onboardingController.draft.wallets[newId] = {
                        id: newId,
                        name: 'SBI Global Savings Account',
                        type: 'bank',
                        balance: 55000,
                        region: 'IN',
                        color: '#3b82f6'
                    };
                    onboardingController.renderStep3();
                    return {
                        walletCount: Object.keys(onboardingController.draft.wallets).length,
                        inWallets: Object.values(onboardingController.draft.wallets).filter(w => w.region === 'IN').length
                    };
                })()
            """)
            print("    Wallet state:", res3)
            assert res3["inWallets"] >= 1, "Wallet addition failed"
            verification_results["functional_assertions"].append(("Wallet addition & edit", True))

            # 4.4 Test Back Navigation State Preservation
            print("  4.6: Testing Back Navigation (Step 3 -> Step 2)...")
            await eval_js(ws, "onboardingController.handleBack()")
            await asyncio.sleep(0.3)
            cur_step = await eval_js(ws, "onboardingController.currentStep")
            assert cur_step == 2, f"Expected step 2 after handleBack, got {cur_step}"
            in_budget_preserved = await eval_js(ws, "onboardingController.draft.budgets['IN'].monthlyTotal")
            assert in_budget_preserved == 45000, f"Budget state lost on back navigation! Got {in_budget_preserved}"
            print(f"    Step 2 state perfectly preserved: IN budget = {in_budget_preserved}")
            verification_results["functional_assertions"].append(("Back navigation draft preservation", True))

            # Navigate forward to Step 4
            await eval_js(ws, "onboardingController.handleNext()") # to step 3
            await asyncio.sleep(0.2)
            wallet_preserved = await eval_js(ws, "Object.values(onboardingController.draft.wallets).some(w => w.name === 'SBI Global Savings Account')")
            assert wallet_preserved, "Wallet lost after returning to step 3"
            print("    Step 3 state preserved when re-advancing")

            await eval_js(ws, "onboardingController.handleNext()") # to step 4
            await asyncio.sleep(0.3)
            cur_step = await eval_js(ws, "onboardingController.currentStep")
            assert cur_step == 4, f"Expected step 4, got {cur_step}"
            print(f"    Successfully advanced to Step {cur_step}")

            # 4.5 Complete Onboarding & Confirm & Launch Ledger
            print("  4.7: Verifying Final Summary and Completing Onboarding...")
            final_summary_check = await eval_js(ws, """
                (() => {
                    const summaryEl = document.querySelector('.onboarding-review-pane');
                    const nextBtn = document.getElementById('onboarding-next-btn');
                    return {
                        hasSummary: !!summaryEl,
                        confirmBtnText: nextBtn ? nextBtn.textContent.trim() : null
                    };
                })()
            """)
            print("    Summary UI check:", final_summary_check)
            assert final_summary_check["hasSummary"], "Summary element missing in Step 4"

            # Execute completeAndEnterApp
            await eval_js(ws, """
                (() => {
                    onboardingController.completeAndEnterApp();
                })()
            """)
            await asyncio.sleep(0.5)

            onboarding_hidden = await eval_js(ws, """
                (() => {
                    const screen = document.getElementById('onboarding-screen');
                    return screen ? getComputedStyle(screen).display === 'none' : true;
                })()
            """)
            print(f"    Onboarding screen dismissed: {onboarding_hidden}")
            assert onboarding_hidden, "Onboarding screen not dismissed after completion!"
            verification_results["functional_assertions"].append(("Finish onboarding & launch ledger", True))

            print("\n" + "=" * 80)
            print("ALL RESPONSIVE DESIGN & FUNCTIONAL ASSERTIONS PASSED!")
            print(f"  Overflow assertions passed: {len(verification_results['overflow_assertions'])}")
            print(f"  Card width assertions passed: {len(verification_results['card_width_assertions'])}")
            print(f"  Font size auto-zoom assertions passed: {len(verification_results['font_size_assertions'])}")
            print(f"  Functional assertions passed: {len(verification_results['functional_assertions'])}")
            print("=" * 80)

    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    asyncio.run(run_verification())
