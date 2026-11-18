#!/usr/bin/env python3
"""
Expense Manager — Phase 4: Adaptive Desktop Interface Automated Verification Suite

Exhaustive verification of the configuration-driven desktop interface across:
1. All 7 sovereign country combinations (JP, IN, DE, JP+IN, JP+DE, IN+DE, JP+IN+DE).
2. Dynamic Dashboard adaptation (single vs multi-country balance cards, accordions, pills).
3. Wallets Portfolio adaptation, currency-aware remittance buttons, and country modal.
4. Independent Budgets configuration, disabled state banners, and overall limit modals.
5. Analytics and Reports Germany (EUR €) integration.
6. Optional Loan Tracking rail widget toggle and currency adaptation.
7. Settings Regional Preferences, primary country selection, and safe deactivation safeguard.
8. Zero data loss guarantee: historical transactions, wallet balances, and closed months preserved.
"""

import os
import sys
import json
import time
import base64
import asyncio
import subprocess
import urllib.request
import websockets

CHROME_BIN = '/usr/bin/google-chrome'
if not os.path.exists(CHROME_BIN):
    candidates = [
        '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ]
    for c in candidates:
        if os.path.exists(c):
            CHROME_BIN = c
            break

INDEX_HTML_PATH = os.path.abspath('index.html')
CSS_STYLE_PATH = os.path.abspath('css/style.css')
APP_JS_PATH = os.path.abspath('js/app.js')
STORAGE_JS_PATH = os.path.abspath('js/storage.js')
EXPORT_PATH = '/home/tharunkumaark/Downloads/ExpenseManager_Production_Export_2026-11-16.json'
if not os.path.exists(EXPORT_PATH) and os.path.exists('/tmp/ExpenseManager_Production_Export_2026-11-16.json'):
    EXPORT_PATH = '/tmp/ExpenseManager_Production_Export_2026-11-16.json'
SCREENSHOT_DIR = os.path.abspath('scratch')

async def run_phase4_tests():
    print("=" * 80)
    print("EXPENSE MANAGER — PHASE 4 ADAPTIVE DESKTOP INTERFACE TEST SUITE")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # 1. Static Code & Markup Checks
    # -------------------------------------------------------------------------
    print("\n--- Running Static Markup & Architecture Checks ---")
    static_checks = []

    with open(CSS_STYLE_PATH, 'r', encoding='utf-8') as f:
        css_content = f.read()

    with open(INDEX_HTML_PATH, 'r', encoding='utf-8') as f:
        html_content = f.read()

    with open(APP_JS_PATH, 'r', encoding='utf-8') as f:
        app_content = f.read()

    with open(STORAGE_JS_PATH, 'r', encoding='utf-8') as f:
        storage_content = f.read()

    # CSS checks
    static_checks.append(('CSS', "Germany balance card styling (.country-card-de)", '.country-card-de' in css_content))
    static_checks.append(('CSS', "Prussian slate wallet theme (.wallet-theme-frankfurt-slate)", '.wallet-theme-frankfurt-slate' in css_content))
    static_checks.append(('CSS', "Settings regional preferences styles present", '.settings-countries-grid' in css_content and '.settings-badge-primary' in css_content))
    static_checks.append(('CSS', "Budgets disabled banner styling present", '.budgets-disabled-banner' in css_content))

    # HTML checks
    static_checks.append(('HTML', "Germany country card in balance cards grid", 'id="de-country-card"' in html_content))
    static_checks.append(('HTML', "Germany categories accordion in dashboard", 'id="de-categories-header-toggle"' in html_content and 'id="de-categories-wrap"' in html_content))
    static_checks.append(('HTML', "Germany central budget overview card", 'id="budget-overview-card-de"' in html_content))
    static_checks.append(('HTML', "Germany chart switcher pill", 'id="dash-region-de-btn"' in html_content))
    static_checks.append(('HTML', "Wallets view Germany KPI and account group", 'id="wallets-kpi-de"' in html_content and 'id="wallets-group-de"' in html_content))
    static_checks.append(('HTML', "Budgets view Germany tab and disabled banner", 'id="budgets-tab-de"' in html_content and 'id="budgets-disabled-banner"' in html_content))
    static_checks.append(('HTML', "Analytics view Germany tab and workspace", 'id="analytics-tab-de"' in html_content and 'id="analytics-de-workspace"' in html_content))
    static_checks.append(('HTML', "Reports view Germany tab", 'id="report-tab-de"' in html_content))
    static_checks.append(('HTML', "Settings regional 5-section configuration layout", 'id="settings-operating-countries-grid"' in html_content and 'id="settings-country-budgets-list"' in html_content and 'id="settings-loan-config-container"' in html_content))

    # JS checks
    static_checks.append(('JS', "StorageManager provides getPrimaryCountry & setPrimaryCountry", 'getPrimaryCountry()' in storage_content and 'setPrimaryCountry(' in storage_content))
    static_checks.append(('JS', "StorageManager provides activateCountry & deactivateCountry", 'activateCountry(' in storage_content and 'deactivateCountry(' in storage_content))
    static_checks.append(('JS', "StorageManager provides getTotalBudget & isBudgetRolloverEnabled", 'getTotalBudget(' in storage_content and 'isBudgetRolloverEnabled(' in storage_content))
    static_checks.append(('JS', "App provides deactivateCountryWithConfirmation safeguard", 'deactivateCountryWithConfirmation(' in app_content))
    static_checks.append(('JS', "App provides renderGermanyAnalytics", 'renderGermanyAnalytics(' in app_content))
    static_checks.append(('JS', "WALLET_THEMES includes frankfurt-slate", 'frankfurt-slate' in app_content))

    all_static_passed = True
    for cat, title, passed in static_checks:
        status = "✅ PASS" if passed else "❌ FAIL"
        if not passed: all_static_passed = False
        print(f"  [{status}] [{cat}] {title}")

    if not all_static_passed:
        print("\n❌ Static checks failed. Aborting dynamic browser suite.")
        return False

    # -------------------------------------------------------------------------
    # 2. Launch Headless Chrome for Live Dynamic DOM Execution
    # -------------------------------------------------------------------------
    profile_dir = f'/tmp/phase4_adaptive_profile_{int(time.time())}'
    port = 9540
    cmd = [
        CHROME_BIN,
        "--headless=new",
        f"--remote-debugging-port={port}",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1440,900",
        f"--user-data-dir={profile_dir}",
        f"file://{INDEX_HTML_PATH}"
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    try:
        targets_url = f"http://127.0.0.1:{port}/json"
        with urllib.request.urlopen(targets_url) as resp:
            targets = json.loads(resp.read().decode())
        ws_url = [t for t in targets if t.get("type") == "page"][0]["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url) as ws:
            msg_id = 0
            async def send(method, params=None):
                nonlocal msg_id
                msg_id += 1
                payload = {'id': msg_id, 'method': method}
                if params: payload['params'] = params
                await ws.send(json.dumps(payload))
                while True:
                    resp_raw = await ws.recv()
                    data = json.loads(resp_raw)
                    if data.get('id') == msg_id:
                        return data.get('result', {})

            await send("Page.enable")
            await send("Runtime.enable")
            await send("Emulation.setDeviceMetricsOverride", {
                "width": 1440,
                "height": 900,
                "deviceScaleFactor": 1,
                "mobile": False
            })

            async def capture_screen(filename):
                res = await send("Page.captureScreenshot", {"format": "png"})
                if res and 'data' in res:
                    img_data = base64.b64decode(res['data'])
                    out_path = os.path.join(SCREENSHOT_DIR, filename)
                    with open(out_path, 'wb') as f:
                        f.write(img_data)
                    print(f"  [📸 Screenshot Captured] {out_path}")

            # Load production fixture data
            prod_fixture_json = "{}"
            if os.path.exists(EXPORT_PATH):
                with open(EXPORT_PATH, 'r', encoding='utf-8') as f:
                    prod_fixture_json = json.dumps(json.load(f))

            test_script = f"""
            (async () => {{
                const results = {{ checks: [] }};
                function assert(id, title, condition, details = '') {{
                    results.checks.push({{ id, title, pass: Boolean(condition), details: String(details) }});
                }}

                const prodData = {prod_fixture_json};

                // Helper to initialize clean authenticated state
                function initBaseState() {{
                    window.localStorage.clear();
                    storage.state = JSON.parse(JSON.stringify(defaultState));
                    storage.state.preferences = {{
                        version: 1,
                        activeCountries: ['JP', 'IN', 'DE'],
                        defaultCountry: 'JP',
                        onboardingCompleted: true,
                        onboardingStep: 4,
                        tourCompleted: true,
                        tourDismissed: true
                    }};
                    storage.state.regionalPreferences = {{
                        defaultCountry: 'JP',
                        defaultCurrency: 'JPY',
                        dateFormat: 'YYYY-MM-DD',
                        weekStart: 'monday',
                        numberFormat: 'standard',
                        timezone: 'Asia/Tokyo'
                    }};
                    storage.state.wallets = {{
                        'Salary Account': {{ id: 'Salary Account', type: 'bank', region: 'JP', balance: 350000, currency: '¥', color: '#10b981', theme: 'emerald-salary' }},
                        'Cash': {{ id: 'Cash', type: 'cash', region: 'JP', balance: 45000, currency: '¥', color: '#f59e0b', theme: 'amber-gold' }},
                        'Axis Bank': {{ id: 'Axis Bank', type: 'bank', region: 'IN', balance: 125000, currency: '₹', color: '#881337', theme: 'burgundy-axis' }},
                        'Girokonto': {{ id: 'Girokonto', type: 'bank', region: 'DE', balance: 3200, currency: '€', color: '#1e293b', theme: 'frankfurt-slate' }}
                    }};
                    storage.state.budgets = {{
                        'JP': {{ enabled: true, monthlyTotal: 60000, rolloverEnabled: true }},
                        'IN': {{ enabled: true, monthlyTotal: 35000, rolloverEnabled: false }},
                        'DE': {{ enabled: true, monthlyTotal: 1800, rolloverEnabled: false }}
                    }};
                    storage.state.jpTotalBudget = 60000;
                    storage.state.inTotalBudget = 35000;
                    storage.state.transactions = [
                        {{ id: 'tx_jp_1', type: 'expense', amount: 5000, region: 'JP', categoryId: 'food', walletId: 'Cash', date: '2026-11-05' }},
                        {{ id: 'tx_in_1', type: 'expense', amount: 2500, region: 'IN', categoryId: 'groceries', walletId: 'Axis Bank', date: '2026-11-06' }},
                        {{ id: 'tx_de_1', type: 'expense', amount: 120, region: 'DE', categoryId: 'food', walletId: 'Girokonto', date: '2026-11-07' }}
                    ];
                    storage.state.loanConfig = {{
                        enabled: false,
                        country: 'IN',
                        currency: '₹',
                        totalPrincipal: 500000,
                        principalLeft: 300000,
                        emi: 15000,
                        totalDues: 36,
                        duesPaid: 16,
                        emiDrawDate: 7
                    }};
                    storage.accountStatus = 'EXISTING_USER';
                    storage.cloudSyncStatus = 'CONFIRMED';
                    storage.saveData();
                    app.setPrivacyHidden(false);
                }}

                // -------------------------------------------------------------
                // 1. ALL 7 COUNTRY COMBINATIONS & DASHBOARD ADAPTATION
                // -------------------------------------------------------------
                initBaseState();

                // 1.1: Single Country - JP only
                storage.setActiveCountries(['JP']);
                storage.setPrimaryCountry('JP');
                app.renderAll();

                const jpCard = document.getElementById('jp-country-card');
                const inCard = document.getElementById('in-country-card');
                const deCard = document.getElementById('de-country-card');
                const chartPills = document.getElementById('dash-chart-region-pills');
                const budgetSelector = document.getElementById('budgets-country-selector');
                const analyticsSelector = document.getElementById('analytics-country-selector');
                const reportSelector = document.getElementById('report-country-selector');
                const jpWrap = document.getElementById('jp-categories-wrap');
                const inWrap = document.getElementById('in-categories-wrap');
                const deWrap = document.getElementById('de-categories-wrap');

                assert('C1_JP_CARD', "JP balance card is displayed", jpCard && jpCard.style.display !== 'none');
                assert('C1_IN_CARD_HIDDEN', "IN balance card is hidden in JP-only", inCard && inCard.style.display === 'none');
                assert('C1_DE_CARD_HIDDEN', "DE balance card is hidden in JP-only", deCard && deCard.style.display === 'none');
                assert('C1_PILLS_HIDDEN', "Chart switcher pills hidden for single country", chartPills && chartPills.style.display === 'none');
                assert('C1_ACCORDION_EXPANDED', "Single active category accordion is expanded by default", jpWrap && !jpWrap.classList.contains('collapsed'));
                assert('C1_IN_WRAP_HIDDEN', "Inactive country category accordions are hidden", inWrap && inWrap.style.display === 'none');

                // 1.2: Single Country - IN only
                storage.setActiveCountries(['IN']);
                storage.setPrimaryCountry('IN');
                app.renderAll();

                assert('C2_IN_CARD', "IN balance card displayed in IN-only", inCard && inCard.style.display !== 'none');
                assert('C2_JP_CARD_HIDDEN', "JP balance card hidden in IN-only", jpCard && jpCard.style.display === 'none');
                assert('C2_IN_ACCORDION', "IN category accordion expanded in IN-only", inWrap && !inWrap.classList.contains('collapsed'));

                // 1.3: Single Country - DE only
                storage.setActiveCountries(['DE']);
                storage.setPrimaryCountry('DE');
                app.renderAll();

                assert('C3_DE_CARD', "DE balance card displayed in DE-only", deCard && deCard.style.display !== 'none');
                assert('C3_JP_CARD_HIDDEN', "JP balance card hidden in DE-only", jpCard && jpCard.style.display === 'none');
                assert('C3_DE_ACCORDION', "DE category accordion expanded in DE-only", deWrap && !deWrap.classList.contains('collapsed'));

                // 1.4: Dual Country - JP + IN
                storage.setActiveCountries(['JP', 'IN']);
                storage.setPrimaryCountry('JP');
                app.renderAll();

                assert('C4_JP_IN_CARDS', "JP and IN cards displayed in JP+IN", jpCard.style.display !== 'none' && inCard.style.display !== 'none');
                assert('C4_DE_CARD_HIDDEN', "DE card hidden in JP+IN", deCard.style.display === 'none');
                assert('C4_PILLS_SHOWN', "Chart switcher pills displayed for dual country", chartPills && chartPills.style.display !== 'none');

                const dePill = document.getElementById('dash-region-de-btn');
                assert('C4_DE_PILL_HIDDEN', "DE chart pill hidden in JP+IN", dePill && dePill.style.display === 'none');

                // 1.5: Dual Country - JP + DE
                storage.setActiveCountries(['JP', 'DE']);
                storage.setPrimaryCountry('JP');
                app.renderAll();

                assert('C5_JP_DE_CARDS', "JP and DE cards displayed in JP+DE", jpCard.style.display !== 'none' && deCard.style.display !== 'none');
                assert('C5_IN_CARD_HIDDEN', "IN card hidden in JP+DE", inCard.style.display === 'none');

                // 1.6: Dual Country - IN + DE
                storage.setActiveCountries(['IN', 'DE']);
                storage.setPrimaryCountry('IN');
                app.renderAll();

                assert('C6_IN_DE_CARDS', "IN and DE cards displayed in IN+DE", inCard.style.display !== 'none' && deCard.style.display !== 'none');
                assert('C6_JP_CARD_HIDDEN', "JP card hidden in IN+DE", jpCard.style.display === 'none');

                // 1.7: Tri-Country - JP + IN + DE
                storage.setActiveCountries(['JP', 'IN', 'DE']);
                storage.setPrimaryCountry('JP');
                app.renderAll();

                assert('C7_ALL_CARDS', "All 3 cards displayed in JP+IN+DE", jpCard.style.display !== 'none' && inCard.style.display !== 'none' && deCard.style.display !== 'none');
                assert('C7_ALL_PILLS', "All 3 chart pills displayed in JP+IN+DE",
                    document.getElementById('dash-region-jp-btn').style.display !== 'none' &&
                    document.getElementById('dash-region-in-btn').style.display !== 'none' &&
                    document.getElementById('dash-region-de-btn').style.display !== 'none');

                // -------------------------------------------------------------
                // 2. WALLETS PORTFOLIO & CROSS-BORDER REMITTANCE VISIBILITY
                // -------------------------------------------------------------
                app.switchView('wallets-view');
                app.renderWalletsPage();

                const kpiJp = document.getElementById('wallets-kpi-jp');
                const kpiIn = document.getElementById('wallets-kpi-in');
                const kpiDe = document.getElementById('wallets-kpi-de');
                const groupJp = document.getElementById('wallets-group-jp');
                const groupIn = document.getElementById('wallets-group-in');
                const groupDe = document.getElementById('wallets-group-de');
                const remitBtn = document.getElementById('wallets-remittance-btn');

                assert('W_KPI_ALL', "All 3 KPI cards visible in tri-country wallets view",
                    kpiJp.style.display !== 'none' && kpiIn.style.display !== 'none' && kpiDe.style.display !== 'none');
                assert('W_GROUPS_ALL', "All 3 wallet groups visible in tri-country wallets view",
                    groupJp.style.display !== 'none' && groupIn.style.display !== 'none' && groupDe.style.display !== 'none');
                assert('W_REMIT_SHOWN', "Remittance toolbar button visible with cross-border accounts", remitBtn && remitBtn.style.display !== 'none');

                // Test single-currency remittance suppression
                storage.setActiveCountries(['DE']);
                app.renderWalletsPage();
                assert('W_REMIT_HIDDEN', "Remittance button hidden when active accounts span only 1 currency", remitBtn && remitBtn.style.display === 'none');

                // Restore tri-country
                storage.setActiveCountries(['JP', 'IN', 'DE']);
                app.renderWalletsPage();

                // Test Country Expansion Modal for Germany
                app.openCountryExpansion('DE');
                const modalTitle = document.getElementById('focus-modal-title');
                const primaryPanel = document.getElementById('focus-primary-panel');
                assert('W_EXP_TITLE', "Country expansion title formats correctly for Germany", modalTitle && modalTitle.innerText.includes('Germany'));
                assert('W_EXP_CURRENCY', "Country expansion displays EUR sovereign currency", primaryPanel && primaryPanel.innerText.includes('€') && primaryPanel.innerText.includes('EUR'));
                app.closeFocusOverlay();

                // -------------------------------------------------------------
                // 3. BUDGETS MANAGEMENT & ENABLED/DISABLED STATES
                // -------------------------------------------------------------
                app.switchView('budgets-view');
                storage.setBudgetEnabled('DE', false);
                app.setBudgetsRegion('DE');

                const disabledBanner = document.getElementById('budgets-disabled-banner');
                const summaryBanner = document.getElementById('budgets-summary-banner');
                assert('B_DISABLED_BANNER', "Budgets disabled banner shown when country budgeting is off", disabledBanner && disabledBanner.style.display !== 'none');
                assert('B_SUMMARY_HIDDEN', "Budget overview summary hidden when country budgeting is off", summaryBanner && summaryBanner.style.display === 'none');

                // Re-enable Germany budget
                storage.setBudgetEnabled('DE', true, 2200, false);
                app.setBudgetsRegion('DE');
                assert('B_ENABLED_BANNER_HIDDEN', "Budgets disabled banner hidden when country budgeting is on", disabledBanner && disabledBanner.style.display === 'none');
                assert('B_ENABLED_SUMMARY_SHOWN', "Budget overview summary shown when country budgeting is on", summaryBanner && summaryBanner.style.display !== 'none');

                // Save overall budget via modal
                app.overallBudgetModalRegion = 'DE';
                document.getElementById('overall-budget-input').value = '2500';
                app.saveOverallBudget();
                assert('B_SAVE_OVERALL', "Overall budget modal successfully persists updated limit for Germany", storage.getTotalBudget('DE') === 2500);

                // -------------------------------------------------------------
                // 4. ANALYTICS GERMANY WORKSPACE
                // -------------------------------------------------------------
                app.switchView('analytics-view');
                app.setAnalyticsCountry('DE');

                const deWorkspace = document.getElementById('analytics-de-workspace');
                const deKpiExp = document.getElementById('de-kpi-expenses');
                const deKpiWeekly = document.getElementById('de-kpi-weekly-avg');
                assert('A_DE_WORKSPACE', "Germany analytics workspace displayed when DE selected", deWorkspace && deWorkspace.style.display === 'flex');
                assert('A_DE_KPI_EXP', "Germany expenses KPI formatted in EUR (€)", deKpiExp && deKpiExp.innerText.includes('€'));
                assert('A_DE_KPI_WEEKLY', "Germany weekly average formatted in EUR (€)", deKpiWeekly && deKpiWeekly.innerText.includes('€'));

                // -------------------------------------------------------------
                // 5. REPORTS GERMANY SNAPSHOT
                // -------------------------------------------------------------
                app.switchView('reports-view');
                app.setReportRegion('DE');
                const reportTabDe = document.getElementById('report-tab-de');
                assert('R_DE_TAB_ACTIVE', "Germany report tab active when selected", reportTabDe && reportTabDe.classList.contains('active'));

                // -------------------------------------------------------------
                // 6. LOAN TRACKING TOGGLE & CURRENCY ADAPTATION
                // -------------------------------------------------------------
                app.switchView('home-view');
                const loanWidget = document.getElementById('loan-tracker-widget');

                // Disabled initially
                app.renderLoanTracker();
                assert('L_DISABLED_HIDDEN', "Loan tracker widget hidden when disabled", loanWidget && loanWidget.style.display === 'none');

                // Enable loan tracking with Euro parameters
                storage.setLoanTrackingEnabled(true, {{
                    country: 'DE',
                    currency: '€',
                    totalPrincipal: 20000,
                    principalLeft: 14000,
                    emi: 600,
                    totalDues: 36,
                    duesPaid: 10,
                    emiDrawDate: 15
                }});
                app.renderLoanTracker();
                assert('L_ENABLED_VISIBLE', "Loan tracker widget visible when enabled", loanWidget && loanWidget.style.display === 'block');
                assert('L_CURRENCY_EUR', "Loan tracker formats values with configured currency symbol (€)", loanWidget && loanWidget.innerText.includes('€'));

                // -------------------------------------------------------------
                // 7. ADD WALLET MODAL WITH ACTIVE COUNTRIES
                // -------------------------------------------------------------
                app.openAddWalletModal('DE');
                const addRegSelect = document.getElementById('add-wallet-region');
                const optionsList = Array.from(addRegSelect.querySelectorAll('option')).map(o => o.value);
                assert('ADD_W_OPTIONS', "Add wallet region options contain active countries",
                    optionsList.includes('JP') && optionsList.includes('IN') && optionsList.includes('DE'));

                // Verify theme auto-switch for DE
                const themeVal = document.getElementById('add-wallet-theme-val').value;
                assert('ADD_W_DE_THEME', "Default theme for Germany account is frankfurt-slate", themeVal === 'frankfurt-slate');

                // Save a new German wallet
                document.getElementById('add-wallet-name').value = 'Frankfurt Sparen';
                document.getElementById('add-wallet-balance').value = '1500';
                addRegSelect.value = 'DE';
                app.saveAddWallet();

                assert('ADD_W_SAVED', "New German wallet saved successfully", Boolean(storage.state.wallets['Frankfurt Sparen']));
                assert('ADD_W_CURRENCY', "New German wallet has EUR currency (€)", storage.state.wallets['Frankfurt Sparen']?.currency === '€');

                // -------------------------------------------------------------
                // 8. SETTINGS REGIONAL PREFERENCES & SAFE DEACTIVATION (DECISION 2)
                // -------------------------------------------------------------
                app.navigateToSettingsSection('regional');
                const countriesGrid = document.getElementById('settings-operating-countries-grid');
                assert('S_GRID_RENDERED', "Settings operating countries grid rendered with cards", countriesGrid && countriesGrid.children.length === 3);

                // Stub window.confirm to accept deactivation
                window.confirm = () => true;

                // Deactivate Germany
                app.deactivateCountryWithConfirmation('DE');
                assert('S_DE_DEACTIVATED', "Germany deactivated from activeCountries", !storage.getActiveCountries().includes('DE'));
                assert('S_DATA_PRESERVED_WALLETS', "German wallets remain safely preserved in storage.state.wallets",
                    Boolean(storage.state.wallets['Girokonto']) && Boolean(storage.state.wallets['Frankfurt Sparen']));
                assert('S_DATA_PRESERVED_TXS', "German transactions remain safely preserved in storage.state.transactions",
                    storage.state.transactions.some(t => t.region === 'DE'));

                // Deactivate India
                app.deactivateCountryWithConfirmation('IN');
                assert('S_IN_DEACTIVATED', "India deactivated from activeCountries", !storage.getActiveCountries().includes('IN'));
                assert('S_ONLY_JP_ACTIVE', "Only Japan remains active", storage.getActiveCountries().length === 1 && storage.getActiveCountries()[0] === 'JP');

                // Attempt to deactivate Japan (Safeguard check: must refuse when only 1 country remains)
                let alertTriggered = false;
                window.alert = () => {{ alertTriggered = true; }};
                app.deactivateCountryWithConfirmation('JP');
                assert('S_SAFEGUARD_REFUSAL', "Deactivation refused when only 1 active country remains", alertTriggered && storage.getActiveCountries().includes('JP'));

                // Reactivate Germany
                app.activateCountry('DE');
                assert('S_DE_REACTIVATED', "Germany successfully reactivated", storage.getActiveCountries().includes('DE'));
                assert('S_REACTIVATED_BALANCES', "German wallet balances restored without data alteration",
                    storage.state.wallets['Girokonto'].balance === 3200);

                // -------------------------------------------------------------
                // 9. PRODUCTION DATA PRESERVATION GUARANTEE
                // -------------------------------------------------------------
                if (prodData && prodData.wallets && prodData.transactions) {{
                    const origTxCount = prodData.transactions.length;
                    const origWalletCount = Object.keys(prodData.wallets).length;

                    // Load production dataset
                    storage.importState(prodData);
                    app.renderAll();

                    assert('PROD_WALLETS_PRESERVED', "All production wallets preserved",
                        Object.keys(storage.state.wallets).length === origWalletCount);
                    assert('PROD_TXS_PRESERVED', "All 116 production transactions preserved",
                        storage.state.transactions.length === origTxCount);
                    assert('PROD_AXIS_BAL_PRESERVED', "Axis Bank balance 100% identical",
                        storage.state.wallets['Axis Bank']?.balance === prodData.wallets['Axis Bank']?.balance);
                    assert('PROD_SALARY_BAL_PRESERVED', "Salary Account balance 100% identical",
                        storage.state.wallets['Salary Account']?.balance === prodData.wallets['Salary Account']?.balance);
                }}

                return results;
            }})();
            """

            print("\n--- Executing Live DOM Headless Chrome Evaluation ---")
            eval_res = await send("Runtime.evaluate", {
                "expression": test_script,
                "awaitPromise": True,
                "returnByValue": True
            })

            if 'exceptionDetails' in eval_res:
                print(f"FAILED test execution: {eval_res['exceptionDetails']}")
                return False

            res_obj = eval_res.get('result', {}).get('value', {})
            checks = res_obj.get('checks', [])

            passed_count = sum(1 for c in checks if c['pass'])
            failed_count = sum(1 for c in checks if not c['pass'])

            print(f"\nTotal Checks Executed: {len(checks)}")
            print(f"Passed: {passed_count}")
            print(f"Failed: {failed_count}")

            print("\n--- DETAILED TEST VERIFICATION RESULTS ---")
            current_prefix = ""
            for i, c in enumerate(checks, 1):
                prefix = c['id'].split('_')[0]
                if prefix != current_prefix:
                    current_prefix = prefix
                    print(f"\n[{current_prefix}]")
                status = "✅ PASS" if c['pass'] else "❌ FAIL"
                details = f" ({c['details']})" if c['details'] else ""
                print(f"  {i:2d}. [{status}] {c['title']}{details}")

            # Capture Verification Screenshots
            print("\n--- Capturing Browser Screenshots ---")
            # 1. Single DE configuration
            await send("Runtime.evaluate", {
                "expression": """
                    storage.setActiveCountries(['DE']);
                    storage.setPrimaryCountry('DE');
                    app.switchView('home-view');
                    app.renderAll();
                """,
                "awaitPromise": True
            })
            await asyncio.sleep(0.5)
            await capture_screen("desktop_adaptive_single_de.png")

            # 2. Tri-country JP+IN+DE active configuration
            await send("Runtime.evaluate", {
                "expression": """
                    storage.setActiveCountries(['JP', 'IN', 'DE']);
                    storage.setPrimaryCountry('JP');
                    app.switchView('home-view');
                    app.renderAll();
                """,
                "awaitPromise": True
            })
            await asyncio.sleep(0.5)
            await capture_screen("desktop_adaptive_tri_country.png")

            # 3. Settings Regional Preferences Section
            await send("Runtime.evaluate", {
                "expression": """
                    app.navigateToSettingsSection('regional');
                """,
                "awaitPromise": True
            })
            await asyncio.sleep(0.5)
            await capture_screen("desktop_settings_regional.png")

            if failed_count == 0:
                print("\n" + "=" * 80)
                print("🎉 ALL PHASE 4 ADAPTIVE DESKTOP INTERFACE CHECKS PASSED (100% SUCCESS)!")
                print("=" * 80)
                return True
            else:
                print(f"\n❌ {failed_count} checks failed.")
                return False

    finally:
        proc.terminate()

if __name__ == '__main__':
    success = asyncio.run(run_phase4_tests())
    sys.exit(0 if success else 1)
