import asyncio
import json
import os
import subprocess
import time
import urllib.request
import websockets
import base64

CHROME_BIN = '/usr/bin/google-chrome-stable'
CDP_PORT = 9451
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

async def set_viewport(ws, width, height, device_scale_factor=1, is_mobile=True):
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

async def run_comprehensive_tests():
    print("=" * 80)
    print("EXPENSE MANAGER — COMPREHENSIVE MOBILE-FIRST ONBOARDING VERIFICATION")
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
            for _ in range(25):
                await asyncio.sleep(0.2)
                ready = await eval_js(ws, "typeof onboardingController !== 'undefined' && document.readyState === 'complete'")
                if ready:
                    break

            # -------------------------------------------------------------
            # SECTION 1: RESET & INITIALIZE ONBOARDING
            # -------------------------------------------------------------
            print("\n--- SECTION 1: Clean State Initialization ---")
            init_res = await eval_js(ws, """
                (() => {
                    localStorage.clear();
                    if (typeof onboardingController !== 'undefined') {
                        onboardingController.draft = {
                            activeCountries: ['JP'],
                            defaultCountry: 'JP',
                            budgets: {
                                JP: { enabled: true, monthlyTotal: 0, rolloverEnabled: true },
                                IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false },
                                DE: { enabled: false, monthlyTotal: 0, rolloverEnabled: false }
                            },
                            wallets: {},
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
                        onboardingController._initDraftWallets();
                        onboardingController.show();
                        onboardingController.currentStep = 1;
                        onboardingController.render();
                        return { ok: true, step: onboardingController.currentStep };
                    }
                    return { ok: false };
                })()
            """)
            print(f"  Initialized Onboarding at Step {init_res['step']}")
            assert init_res['step'] == 1, "Should start at Step 1"

            # -------------------------------------------------------------
            # SECTION 2: STEP 1 (COUNTRY SELECTION) MOBILE VERIFICATION
            # -------------------------------------------------------------
            print("\n--- SECTION 2: Step 1 (Countries) Mobile Verification ---")
            for w in [320, 390]:
                await set_viewport(ws, w, 700, is_mobile=True)
                await asyncio.sleep(0.1)

                s1_metrics = await eval_js(ws, """
                    (() => {
                        const card = document.querySelector('.onboarding-card');
                        const cardRect = card.getBoundingClientRect();
                        const countryCards = Array.from(document.querySelectorAll('.onboarding-country-card'));
                        const selectWrap = document.querySelector('.onboarding-primary-currency-row');
                        const selectEl = document.querySelector('#onboarding-primary-select');
                        const nextBtn = document.querySelector('#onboarding-next-btn');
                        
                        const cardsValid = countryCards.every(c => {
                            const r = c.getBoundingClientRect();
                            return r.right <= cardRect.right + 0.5 && r.left >= cardRect.left - 0.5 && r.height >= 44;
                        });

                        const selectValid = selectEl ? selectEl.getBoundingClientRect().height >= 44 : false;
                        const nextValid = nextBtn ? nextBtn.getBoundingClientRect().height >= 44 : false;
                        const scrollW = document.documentElement.scrollWidth;

                        return {
                            cardWidth: cardRect.width,
                            cardsCount: countryCards.length,
                            cardsValid,
                            selectValid,
                            nextValid,
                            hasOverflow: scrollW > window.innerWidth
                        };
                    })()
                """)
                print(f"  Width {w}px: CardWidth={s1_metrics['cardWidth']:.1f}px, CardsValid={s1_metrics['cardsValid']}, SelectValid={s1_metrics['selectValid']}, NextBtnValid={s1_metrics['nextValid']}, Overflow={s1_metrics['hasOverflow']}")
                assert s1_metrics['cardsValid'], f"Country cards sizing/containment issue at {w}px"
                assert s1_metrics['selectValid'], f"Select element height too small at {w}px"
                assert s1_metrics['nextValid'], f"Next button height too small at {w}px"
                assert not s1_metrics['hasOverflow'], f"Horizontal overflow at {w}px"

                await capture_screenshot(ws, f"onboarding_mobile_step1_{w}.png")

            # Test actual UI clicking to select India and Germany in Step 1
            print("  Tapping India and Germany cards to select all 3 countries via UI click...")
            await eval_js(ws, """
                (() => {
                    const cards = Array.from(document.querySelectorAll('.onboarding-country-card'));
                    const inCard = cards.find(c => c.textContent.includes('India'));
                    const deCard = cards.find(c => c.textContent.includes('Germany'));
                    if (inCard && !inCard.classList.contains('selected')) inCard.click();
                    if (deCard && !deCard.classList.contains('selected')) deCard.click();
                })()
            """)
            await asyncio.sleep(0.2)
            active_countries = await eval_js(ws, "onboardingController.draft.activeCountries")
            print(f"  Active Countries after clicks: {active_countries}")
            assert set(active_countries) == {'JP', 'IN', 'DE'}, "All 3 countries should be active"

            # Click Continue to Step 2
            print("  Tapping Continue button to advance to Step 2...")
            await eval_js(ws, "document.querySelector('#onboarding-next-btn').click();")
            await asyncio.sleep(0.3)
            current_step = await eval_js(ws, "onboardingController.currentStep")
            assert current_step == 2, f"Expected step 2, got {current_step}"

            # -------------------------------------------------------------
            # SECTION 3: STEP 2 (BUDGETS) MOBILE VERIFICATION
            # -------------------------------------------------------------
            print("\n--- SECTION 3: Step 2 (Budgets) Mobile Verification ---")
            for w in [320, 390]:
                await set_viewport(ws, w, 700, is_mobile=True)
                await asyncio.sleep(0.1)

                s2_metrics = await eval_js(ws, """
                    (() => {
                        const card = document.querySelector('.onboarding-card');
                        const cardRect = card.getBoundingClientRect();
                        const budgetCards = Array.from(document.querySelectorAll('.onboarding-budget-card'));
                        const inputs = Array.from(document.querySelectorAll('.onboarding-budget-card input[type="number"]'));
                        const switches = Array.from(document.querySelectorAll('.onboarding-toggle-switch'));
                        const backBtn = document.querySelector('#onboarding-back-btn');
                        const nextBtn = document.querySelector('#onboarding-next-btn');

                        const cardsContained = budgetCards.every(c => {
                            const r = c.getBoundingClientRect();
                            return r.right <= cardRect.right + 0.5 && r.left >= cardRect.left - 0.5;
                        });

                        const inputsAccessible = inputs.every(inp => {
                            const r = inp.getBoundingClientRect();
                            return r.height >= 44 && r.right <= cardRect.right + 0.5;
                        });

                        const buttonsAccessible = backBtn.getBoundingClientRect().height >= 44 && nextBtn.getBoundingClientRect().height >= 44;
                        const scrollW = document.documentElement.scrollWidth;

                        return {
                            cardWidth: cardRect.width,
                            budgetCardCount: budgetCards.length,
                            cardsContained,
                            inputsAccessible,
                            buttonsAccessible,
                            hasOverflow: scrollW > window.innerWidth
                        };
                    })()
                """)
                print(f"  Width {w}px: CardWidth={s2_metrics['cardWidth']:.1f}px, Contained={s2_metrics['cardsContained']}, InputsAccessible={s2_metrics['inputsAccessible']}, ButtonsAccessible={s2_metrics['buttonsAccessible']}, Overflow={s2_metrics['hasOverflow']}")
                assert s2_metrics['cardsContained'], f"Budget cards not contained at {w}px"
                assert s2_metrics['inputsAccessible'], f"Budget inputs not accessible at {w}px"
                assert s2_metrics['buttonsAccessible'], f"Action buttons not meeting touch standards at {w}px"
                assert not s2_metrics['hasOverflow'], f"Horizontal overflow at {w}px"

                await capture_screenshot(ws, f"onboarding_mobile_step2_{w}.png")

            # Enter budget amounts via UI
            print("  Entering budget amounts for Japan, India, and Germany via UI...")
            await eval_js(ws, """
                (() => {
                    const cards = Array.from(document.querySelectorAll('.onboarding-budget-card'));
                    cards.forEach(c => {
                        const title = c.querySelector('.onboarding-budget-country-title').textContent;
                        const inp = c.querySelector('input[type="number"]');
                        if (title.includes('Japan')) {
                            inp.value = "150000";
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                        } else if (title.includes('India')) {
                            const sw = c.querySelector('.onboarding-toggle-switch input');
                            if (!sw.checked) { sw.checked = true; sw.dispatchEvent(new Event('change', { bubbles: true })); }
                            inp.value = "45000.50";
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                        } else if (title.includes('Germany')) {
                            const sw = c.querySelector('.onboarding-toggle-switch input');
                            if (!sw.checked) { sw.checked = true; sw.dispatchEvent(new Event('change', { bubbles: true })); }
                            inp.value = "1250";
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    });
                })()
            """)
            await asyncio.sleep(0.2)

            # Advance to Step 3
            print("  Tapping Continue to Step 3 (Accounts & Wallets)...")
            await eval_js(ws, "document.querySelector('#onboarding-next-btn').click();")
            await asyncio.sleep(0.3)
            current_step = await eval_js(ws, "onboardingController.currentStep")
            assert current_step == 3, f"Expected step 3, got {current_step}"

            # -------------------------------------------------------------
            # SECTION 4: STEP 3 (ACCOUNTS & WALLETS) COMPREHENSIVE AUDIT
            # -------------------------------------------------------------
            print("\n--- SECTION 4: Step 3 (Accounts & Wallets) Deep Verification ---")
            step3_widths = [320, 360, 375, 390, 412, 430]
            for w in step3_widths:
                await set_viewport(ws, w, 800, is_mobile=True)
                await asyncio.sleep(0.1)

                s3_metrics = await eval_js(ws, """
                    (() => {
                        const card = document.querySelector('.onboarding-card');
                        const cardRect = card.getBoundingClientRect();
                        const sections = Array.from(document.querySelectorAll('.onboarding-country-wallets-section'));
                        
                        const secResults = sections.map(sec => {
                            const secRect = sec.getBoundingClientRect();
                            const title = sec.querySelector('.onboarding-section-title');
                            const addBtn = sec.querySelector('.onboarding-btn-add-wallet');
                            const addBtnRect = addBtn ? addBtn.getBoundingClientRect() : null;
                            const titleRect = title ? title.getBoundingClientRect() : null;
                            const rows = Array.from(sec.querySelectorAll('.onboarding-wallet-row'));

                            const btnContained = addBtnRect ? (addBtnRect.right <= secRect.right + 0.5 && addBtnRect.left >= secRect.left - 0.5) : true;
                            const btnTouchTarget = addBtnRect ? (addBtnRect.height >= 44 && addBtnRect.width >= 44) : true;
                            const rowsContained = rows.every(r => {
                                const rRect = r.getBoundingClientRect();
                                return rRect.right <= secRect.right + 0.5 && rRect.left >= secRect.left - 0.5;
                            });

                            return {
                                secWidth: secRect.width,
                                btnContained,
                                btnTouchTarget,
                                btnHeight: addBtnRect ? addBtnRect.height : null,
                                btnWidth: addBtnRect ? addBtnRect.width : null,
                                btnRight: addBtnRect ? addBtnRect.right : null,
                                secRight: secRect.right,
                                rowsContained,
                                rowCount: rows.length
                            };
                        });

                        const allBtnsContained = secResults.every(s => s.btnContained);
                        const allRowsContained = secResults.every(s => s.rowsContained);
                        const allTouchOk = secResults.every(s => s.btnTouchTarget);
                        const scrollW = document.documentElement.scrollWidth;

                        return {
                            cardWidth: cardRect.width,
                            allBtnsContained,
                            allRowsContained,
                            allTouchOk,
                            hasOverflow: scrollW > window.innerWidth,
                            secResults
                        };
                    })()
                """)

                print(f"  Width {w}px: CardWidth={s3_metrics['cardWidth']:.1f}px, AllAddBtnsContained={s3_metrics['allBtnsContained']}, AllRowsContained={s3_metrics['allRowsContained']}, TouchTargetsOk={s3_metrics['allTouchOk']}, Overflow={s3_metrics['hasOverflow']}")
                assert s3_metrics['allBtnsContained'], f"Add Account button protrudes at {w}px!"
                assert s3_metrics['allRowsContained'], f"Wallet rows protrude at {w}px!"
                assert s3_metrics['allTouchOk'], f"Touch target undersized at {w}px!"
                assert not s3_metrics['hasOverflow'], f"Horizontal overflow at {w}px!"

                if w in [320, 375, 390, 430]:
                    await capture_screenshot(ws, f"onboarding_mobile_step3_{w}.png")

            # -------------------------------------------------------------
            # SECTION 5: APP-STYLED MODAL DIALOG & WALLET CREATION TEST
            # -------------------------------------------------------------
            print("\n--- SECTION 5: App-Styled Modal Dialog & Wallet Creation Verification ---")
            await set_viewport(ws, 390, 844, is_mobile=True)

            # Click the India "Add Account" button to trigger the modal
            print("  Tapping India 'Add Account' button to open app-styled modal...")
            await eval_js(ws, """
                (() => {
                    const sections = Array.from(document.querySelectorAll('.onboarding-country-wallets-section'));
                    const inSec = sections.find(s => s.querySelector('.onboarding-section-title').textContent.includes('India'));
                    const addBtn = inSec.querySelector('.onboarding-btn-add-wallet');
                    addBtn.click();
                })()
            """)
            await asyncio.sleep(0.3)

            # Verify modal state & geometry
            modal_state = await eval_js(ws, """
                (() => {
                    const modal = document.querySelector('#onboarding-add-account-modal');
                    const card = modal.querySelector('.onboarding-modal-card');
                    const title = modal.querySelector('#onboarding-add-modal-title');
                    const input = modal.querySelector('#onboarding-modal-account-name');
                    const submitBtn = modal.querySelector('#onboarding-add-modal-submit');
                    const cancelBtn = modal.querySelector('#onboarding-add-modal-cancel');
                    
                    const mRect = modal.getBoundingClientRect();
                    const cRect = card.getBoundingClientRect();
                    const sRect = submitBtn.getBoundingClientRect();
                    const inRect = input.getBoundingClientRect();

                    return {
                        isDisplayed: window.getComputedStyle(modal).display !== 'none',
                        title: title.textContent,
                        inputValue: input.value,
                        isFocused: document.activeElement === input,
                        cardContained: cRect.left >= 0 && cRect.right <= window.innerWidth + 0.5,
                        submitTouchTarget: sRect.height >= 44,
                        inputTouchTarget: inRect.height >= 44
                    };
                })()
            """)
            print(f"  Modal Opened: {modal_state['isDisplayed']}, Title: '{modal_state['title']}', Default Input: '{modal_state['inputValue']}', CardContained: {modal_state['cardContained']}, TouchTargets: submit={modal_state['submitTouchTarget']}, input={modal_state['inputTouchTarget']}")
            assert modal_state['isDisplayed'], "Modal failed to display on Add Account click!"
            assert modal_state['cardContained'], "Modal card extends outside viewport!"
            assert modal_state['submitTouchTarget'], "Modal submit button height < 44px!"

            await capture_screenshot(ws, "onboarding_mobile_step3_modal_390.png")

            # Type custom wallet name and submit
            print("  Typing 'SBI International Forex' and submitting form...")
            await eval_js(ws, """
                (() => {
                    const input = document.querySelector('#onboarding-modal-account-name');
                    input.value = "SBI International Forex";
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    const form = document.querySelector('#onboarding-add-modal-form');
                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                })()
            """)
            await asyncio.sleep(0.3)

            # Verify modal closed and new wallet exists in DOM
            created_wallet_metrics = await eval_js(ws, """
                (() => {
                    const modal = document.querySelector('#onboarding-add-account-modal');
                    const rows = Array.from(document.querySelectorAll('.onboarding-wallet-row'));
                    const sbiRow = rows.find(r => r.querySelector('.onboarding-wallet-row-name').textContent.includes('SBI International Forex'));
                    
                    return {
                        modalClosed: window.getComputedStyle(modal).display === 'none',
                        walletExists: !!sbiRow,
                        rowCount: rows.length,
                        sbiRowName: sbiRow ? sbiRow.querySelector('.onboarding-wallet-row-name').textContent : null,
                        delBtnVisible: sbiRow ? !!sbiRow.querySelector('.onboarding-wallet-delete-btn') : false
                    };
                })()
            """)
            print(f"  Modal Closed: {created_wallet_metrics['modalClosed']}, Wallet Created: {created_wallet_metrics['walletExists']}, Total Rows: {created_wallet_metrics['rowCount']}, DeleteBtn: {created_wallet_metrics['delBtnVisible']}")
            assert created_wallet_metrics['modalClosed'], "Modal should close after valid submission"
            assert created_wallet_metrics['walletExists'], "New wallet row not rendered in DOM"
            assert created_wallet_metrics['delBtnVisible'], "Delete button should be visible when > 1 wallet exists"

            # Edit opening balance of newly created wallet
            print("  Editing opening balance of 'SBI International Forex' to 85000.75...")
            await eval_js(ws, """
                (() => {
                    const rows = Array.from(document.querySelectorAll('.onboarding-wallet-row'));
                    const sbiRow = rows.find(r => r.querySelector('.onboarding-wallet-row-name').textContent.includes('SBI International Forex'));
                    const inp = sbiRow.querySelector('.onboarding-balance-input');
                    inp.value = "85000.75";
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                })()
            """)
            await asyncio.sleep(0.2)

            # Test long wallet names wrapping
            print("  Injecting extremely long wallet name to verify text wrapping...")
            await eval_js(ws, """
                (() => {
                    const rows = Array.from(document.querySelectorAll('.onboarding-wallet-row'));
                    const firstRow = rows[0];
                    const nameEl = firstRow.querySelector('.onboarding-wallet-row-name');
                    nameEl.textContent = "Sumitomo Mitsui Financial Group Super Deluxe Executive International Treasury Account";
                })()
            """)
            await asyncio.sleep(0.1)

            long_name_metrics = await eval_js(ws, """
                (() => {
                    const card = document.querySelector('.onboarding-card');
                    const cardRect = card.getBoundingClientRect();
                    const rows = Array.from(document.querySelectorAll('.onboarding-wallet-row'));
                    const firstRow = rows[0];
                    const rRect = firstRow.getBoundingClientRect();
                    const nameEl = firstRow.querySelector('.onboarding-wallet-row-name');
                    const nRect = nameEl.getBoundingClientRect();
                    const input = firstRow.querySelector('.onboarding-balance-input');
                    const inRect = input.getBoundingClientRect();

                    return {
                        rowContained: rRect.right <= cardRect.right + 0.5,
                        nameWidth: nRect.width,
                        nameHeight: nRect.height,
                        inputTop: inRect.top,
                        nameBottom: nRect.bottom,
                        noOverlap: inRect.top >= nRect.bottom - 1, // input sits below name in 2-tier layout
                        scrollW: document.documentElement.scrollWidth,
                        hasOverflow: document.documentElement.scrollWidth > window.innerWidth
                    };
                })()
            """)
            print(f"  Long Name Layout: RowContained={long_name_metrics['rowContained']}, Height={long_name_metrics['nameHeight']:.1f}px, NoOverlap={long_name_metrics['noOverlap']}, Overflow={long_name_metrics['hasOverflow']}")
            assert long_name_metrics['rowContained'], "Long wallet row protrudes outside card!"
            assert long_name_metrics['noOverlap'], "Input overlaps wrapped wallet name!"
            assert not long_name_metrics['hasOverflow'], "Long wallet name causes horizontal page overflow!"

            await capture_screenshot(ws, "onboarding_mobile_step3_long_names_390.png")
            await capture_screenshot(ws, "onboarding_mobile_step3_after_add_390.png")

            # -------------------------------------------------------------
            # SECTION 6: NAVIGATION RESILIENCE & DRAFT PRESERVATION
            # -------------------------------------------------------------
            print("\n--- SECTION 6: Navigation Resilience (Back to Step 2, then forward) ---")
            await eval_js(ws, "document.querySelector('#onboarding-back-btn').click();")
            await asyncio.sleep(0.3)
            s_back = await eval_js(ws, "onboardingController.currentStep")
            assert s_back == 2, f"Expected step 2 after Back, got {s_back}"

            await eval_js(ws, "document.querySelector('#onboarding-next-btn').click();")
            await asyncio.sleep(0.3)
            s_fwd = await eval_js(ws, "onboardingController.currentStep")
            assert s_fwd == 3, f"Expected step 3 after Continue, got {s_fwd}"

            # Verify SBI wallet was preserved in draft
            sbi_preserved = await eval_js(ws, "Object.values(onboardingController.draft.wallets).some(w => w.name === 'SBI International Forex' && w.balance === 85000.75)")
            print(f"  Custom SBI wallet preserved with balance: {sbi_preserved}")
            assert sbi_preserved, "Custom wallet or balance was lost across step navigation!"

            # Advance to Step 4
            print("  Advancing to Step 4 (Loans & Review)...")
            await eval_js(ws, "document.querySelector('#onboarding-next-btn').click();")
            await asyncio.sleep(0.3)
            s4 = await eval_js(ws, "onboardingController.currentStep")
            assert s4 == 4, f"Expected step 4, got {s4}"

            # -------------------------------------------------------------
            # SECTION 7: STEP 4 (LOANS & REVIEW) MOBILE VERIFICATION
            # -------------------------------------------------------------
            print("\n--- SECTION 7: Step 4 (Loans & Review) Mobile Verification ---")
            for w in [320, 390]:
                await set_viewport(ws, w, 800, is_mobile=True)
                await asyncio.sleep(0.1)

                s4_metrics = await eval_js(ws, """
                    (() => {
                        const card = document.querySelector('.onboarding-card');
                        const cardRect = card.getBoundingClientRect();
                        const loanCard = document.querySelector('.onboarding-loan-card');
                        const summaryCard = document.querySelector('.onboarding-summary-card');
                        const confirmBtn = document.querySelector('#onboarding-next-btn');

                        const loanContained = loanCard ? (loanCard.getBoundingClientRect().right <= cardRect.right + 0.5) : true;
                        const summaryContained = summaryCard ? (summaryCard.getBoundingClientRect().right <= cardRect.right + 0.5) : true;
                        const confirmContained = confirmBtn ? (confirmBtn.getBoundingClientRect().right <= cardRect.right + 0.5) : true;
                        const confirmTouch = confirmBtn ? (confirmBtn.getBoundingClientRect().height >= 44) : false;
                        const scrollW = document.documentElement.scrollWidth;

                        return {
                            cardWidth: cardRect.width,
                            loanContained,
                            summaryContained,
                            confirmContained,
                            confirmTouch,
                            hasOverflow: scrollW > window.innerWidth
                        };
                    })()
                """)
                print(f"  Width {w}px: CardWidth={s4_metrics['cardWidth']:.1f}px, LoanContained={s4_metrics['loanContained']}, SummaryContained={s4_metrics['summaryContained']}, ConfirmBtnTouch={s4_metrics['confirmTouch']}, Overflow={s4_metrics['hasOverflow']}")
                assert s4_metrics['loanContained'], f"Loan card protrudes at {w}px"
                assert s4_metrics['summaryContained'], f"Summary card protrudes at {w}px"
                assert s4_metrics['confirmContained'], f"Confirm button protrudes at {w}px"
                assert s4_metrics['confirmTouch'], f"Confirm button height < 44px at {w}px"
                assert not s4_metrics['hasOverflow'], f"Horizontal overflow at {w}px"

                await capture_screenshot(ws, f"onboarding_mobile_step4_{w}.png")

            # Enable loan tracking via UI click
            print("  Enabling Loan Tracking via switch click...")
            await eval_js(ws, """
                (() => {
                    const sw = document.querySelector('.onboarding-loan-header .onboarding-toggle-switch input');
                    if (sw && !sw.checked) {
                        sw.checked = true;
                        sw.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                })()
            """)
            await asyncio.sleep(0.2)

            loan_grid_metrics = await eval_js(ws, """
                (() => {
                    const card = document.querySelector('.onboarding-card');
                    const cardRect = card.getBoundingClientRect();
                    const grid = document.querySelector('.onboarding-loan-grid');
                    const inputs = Array.from(grid.querySelectorAll('input'));
                    const gridRect = grid.getBoundingClientRect();

                    const allInputsContained = inputs.every(inp => inp.getBoundingClientRect().right <= cardRect.right + 0.5);
                    const allInputsAccessible = inputs.every(inp => inp.getBoundingClientRect().height >= 44);

                    return {
                        allInputsContained,
                        allInputsAccessible,
                        inputCount: inputs.length,
                        gridWidth: gridRect.width,
                        cardWidth: cardRect.width
                    };
                })()
            """)
            print(f"  Loan Grid: Contained={loan_grid_metrics['allInputsContained']}, Accessible={loan_grid_metrics['allInputsAccessible']}, Inputs={loan_grid_metrics['inputCount']}")
            assert loan_grid_metrics['allInputsContained'], "Loan inputs protrude outside card!"
            assert loan_grid_metrics['allInputsAccessible'], "Loan inputs height < 44px!"

            await capture_screenshot(ws, "onboarding_mobile_step4_loans_390.png")

            # -------------------------------------------------------------
            # SECTION 8: SHORT-HEIGHT VIEWPORTS & SCROLLABILITY
            # -------------------------------------------------------------
            print("\n--- SECTION 8: Short-Height Viewports & Mobile Form Scrolling ---")
            short_viewports = [
                (320, 568),  # iPhone SE 1st gen
                (390, 600),  # short Android / landscape
                (390, 844),  # iPhone 12/13/14
                (430, 932)   # iPhone 14/15 Pro Max
            ]

            for w, h in short_viewports:
                await set_viewport(ws, w, h, is_mobile=True)
                await asyncio.sleep(0.1)

                scroll_metrics = await eval_js(ws, """
                    (() => {
                        const viewport = document.querySelector('#onboarding-screen');
                        const card = document.querySelector('.onboarding-card');
                        const confirmBtn = document.querySelector('#onboarding-next-btn');
                        
                        // Scroll to bottom
                        viewport.scrollTop = viewport.scrollHeight;
                        const btnRect = confirmBtn.getBoundingClientRect();
                        const isReachable = btnRect.bottom <= window.innerHeight + 10 && btnRect.top >= 0;

                        return {
                            scrollHeight: viewport.scrollHeight,
                            clientHeight: viewport.clientHeight,
                            canScroll: viewport.scrollHeight > viewport.clientHeight,
                            btnVisible: isReachable,
                            btnBottom: btnRect.bottom,
                            windowHeight: window.innerHeight
                        };
                    })()
                """)
                print(f"  Viewport {w}x{h}px: CanScroll={scroll_metrics['canScroll']}, ConfirmBtnReachable={scroll_metrics['btnVisible']} (btnBottom={scroll_metrics['btnBottom']:.1f} vs winH={scroll_metrics['windowHeight']})")
                assert scroll_metrics['btnVisible'], f"Action button unreachable at {w}x{h}px"

                if w == 320 and h == 568:
                    await capture_screenshot(ws, "onboarding_mobile_short_320x568.png")

            # -------------------------------------------------------------
            # SECTION 9: DESKTOP REGRESSION (1024px & 1440px)
            # -------------------------------------------------------------
            print("\n--- SECTION 9: Desktop Regression (1024px & 1440px) ---")
            for w in [1024, 1440]:
                await set_viewport(ws, w, 900, is_mobile=False)
                await asyncio.sleep(0.2)

                desktop_metrics = await eval_js(ws, """
                    (() => {
                        const showcase = document.querySelector('.onboarding-wallet-showcase');
                        const card = document.querySelector('.onboarding-card');
                        const title = document.querySelector('.onboarding-container .auth-brand-title');
                        const headline = document.querySelector('.onboarding-container .auth-headline');

                        const showcaseRect = showcase.getBoundingClientRect();
                        const titleRect = title.getBoundingClientRect();
                        const cardRect = card.getBoundingClientRect();

                        const leftDiff = Math.abs(titleRect.left - showcaseRect.left);
                        const gapToForm = cardRect.left - showcaseRect.right;
                        const isShowcaseVisible = window.getComputedStyle(showcase).display !== 'none';

                        return {
                            isShowcaseVisible,
                            leftDiff,
                            gapToForm,
                            noOverlap: gapToForm > 20
                        };
                    })()
                """)
                print(f"  Desktop {w}px: ShowcaseVisible={desktop_metrics['isShowcaseVisible']}, LeftAlignDiff={desktop_metrics['leftDiff']:.2f}px, GapToForm={desktop_metrics['gapToForm']:.1f}px, NoOverlap={desktop_metrics['noOverlap']}")
                assert desktop_metrics['isShowcaseVisible'], f"Showcase hidden at desktop width {w}px"
                assert desktop_metrics['leftDiff'] < 2.0, f"Left alignment variance > 2px at {w}px"
                assert desktop_metrics['noOverlap'], f"Showcase overlaps form at {w}px"

                await capture_screenshot(ws, f"onboarding_desktop_regress_{w}.png")

            # -------------------------------------------------------------
            # SECTION 10: COMPLETE ONBOARDING & LAUNCH APPLICATION
            # -------------------------------------------------------------
            print("\n--- SECTION 10: Complete Onboarding & Confirm App Launch ---")
            # Step A: Test clicking confirm button triggers cloud sync attempt & graceful offline notice
            finish_res = await eval_js(ws, """
                (() => {
                    const confirmBtn = document.querySelector('#onboarding-next-btn');
                    confirmBtn.click();
                    return { clicked: true };
                })()
            """)
            await asyncio.sleep(0.5)

            offline_gate_state = await eval_js(ws, """
                (() => {
                    const nextText = document.getElementById('onboarding-next-text');
                    const banner = document.getElementById('onboarding-error-banner');
                    return {
                        buttonText: nextText ? nextText.textContent : '',
                        bannerVisible: banner ? banner.style.display !== 'none' : false,
                        bannerText: banner ? banner.textContent : ''
                    };
                })()
            """)
            print(f"  Offline Sync Gate Verification: Button='{offline_gate_state['buttonText']}', BannerVisible={offline_gate_state['bannerVisible']}")

            # Step B: Enter app via completeAndEnterApp()
            app_launch_state = await eval_js(ws, """
                (() => {
                    onboardingController.completeAndEnterApp();
                    const onboardingScreen = document.querySelector('#onboarding-screen');
                    const appContent = document.querySelector('#app-content');
                    const hasWallets = Object.keys(storage.state.wallets || {}).length > 0;

                    return {
                        onboardingHidden: window.getComputedStyle(onboardingScreen).display === 'none',
                        appContentVisible: window.getComputedStyle(appContent).display !== 'none',
                        walletCount: Object.keys(storage.state.wallets || {}).length,
                        hasWallets
                    };
                })()
            """)
            print(f"  Launch State: OnboardingHidden={app_launch_state['onboardingHidden']}, AppContentVisible={app_launch_state['appContentVisible']}, TotalWallets={app_launch_state['walletCount']}")
            assert app_launch_state['onboardingHidden'], "Onboarding screen not hidden after completion"
            assert app_launch_state['appContentVisible'], "Main application content not displayed after onboarding"
            assert app_launch_state['hasWallets'], "Wallets not initialized in storage"

            print("\n" + "=" * 80)
            print("ALL MOBILE ONBOARDING TESTS & INTERACTION VERIFICATIONS PASSED!")
            print("=" * 80)

    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    asyncio.run(run_comprehensive_tests())
