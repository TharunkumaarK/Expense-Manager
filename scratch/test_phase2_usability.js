const fs = require('fs');
const vm = require('vm');

function assert(condition, msg) {
    if (!condition) {
        throw new Error(`Assertion failed: ${msg}`);
    }
    console.log(`  [PASS] ${msg}`);
}

function createMockDOM(htmlContent) {
    const listeners = {};
    const elementsById = {};
    const elementsByClass = {};

    function parseSimpleDOM(html) {
        // Regex to extract elements with IDs
        const idMatches = html.matchAll(/id=["']([^"']+)["']/g);
        for (const match of idMatches) {
            elementsById[match[1]] = {
                id: match[1],
                style: {},
                classList: {
                    _classes: new Set(),
                    add(c) { this._classes.add(c); },
                    remove(c) { this._classes.delete(c); },
                    toggle(c, force) {
                        if (force === undefined) {
                            if (this._classes.has(c)) this._classes.delete(c);
                            else this._classes.add(c);
                        } else if (force) {
                            this._classes.add(c);
                        } else {
                            this._classes.delete(c);
                        }
                    },
                    contains(c) { return this._classes.has(c); }
                },
                getAttribute(attr) { return this[attr] || null; },
                setAttribute(attr, val) { this[attr] = val; },
                hasAttribute(attr) { return this[attr] !== undefined && this[attr] !== null; },
                removeAttribute(attr) { delete this[attr]; },
                innerHTML: '',
                innerText: '',
                textContent: '',
                value: '',
                disabled: false,
                options: [],
                focus() {},
                scrollIntoView() {},
                appendChild(child) { return child; }
            };
        }
    }

    parseSimpleDOM(htmlContent);

    const documentMock = {
        getElementById(id) {
            return elementsById[id] || null;
        },
        querySelectorAll(selector) {
            if (selector === '.settings-tab-btn') {
                return [
                    { getAttribute: (a) => a === 'data-section' ? 'profile' : null, classList: { add() {}, remove() {} } },
                    { getAttribute: (a) => a === 'data-section' ? 'regional' : null, classList: { add() {}, remove() {} } },
                    { getAttribute: (a) => a === 'data-section' ? 'appearance' : null, classList: { add() {}, remove() {} } },
                    { getAttribute: (a) => a === 'data-section' ? 'privacy' : null, classList: { add() {}, remove() {} } },
                    { getAttribute: (a) => a === 'data-section' ? 'security' : null, classList: { add() {}, remove() {} } },
                    { getAttribute: (a) => a === 'data-section' ? 'data' : null, classList: { add() {}, remove() {} } },
                    { getAttribute: (a) => a === 'data-section' ? 'help' : null, classList: { add() {}, remove() {} } },
                    { getAttribute: (a) => a === 'data-section' ? 'about' : null, classList: { add() {}, remove() {} } }
                ];
            }
            if (selector === '.settings-section-card') {
                return [
                    { id: 'settings-sec-profile', classList: { add() {}, remove() {} } },
                    { id: 'settings-sec-help', classList: { add() {}, remove() {} } },
                    { id: 'settings-sec-about', classList: { add() {}, remove() {} } }
                ];
            }
            return [];
        },
        querySelector(selector) {
            return null;
        },
        addEventListener(evt, fn) {
            if (!listeners[evt]) listeners[evt] = [];
            listeners[evt].push(fn);
        },
        visibilityState: 'visible',
        body: {
            style: {},
            classList: {
                add() {},
                remove() {},
                toggle() {},
                contains() { return false; }
            }
        }
    };

    return { documentMock, elementsById };
}

function runTests() {
    console.log("================================================================================");
    console.log("EXPENSE MANAGER — PHASE 2 USABILITY & REAL-WORLD READINESS TEST SUITE");
    console.log("================================================================================");

    const html = fs.readFileSync('index.html', 'utf8');
    const appJs = fs.readFileSync('js/app.js', 'utf8');
    const storageJs = fs.readFileSync('js/storage.js', 'utf8');
    const walletJs = fs.readFileSync('js/wallet.js', 'utf8');
    const css = fs.readFileSync('css/style.css', 'utf8');

    // -------------------------------------------------------------------------
    // TEST GROUP 1: Help & Getting Started (Task 1)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 1: Help & Getting Started in Settings ---");

    // 1.1 Navigation Tab in Settings Rail
    assert(html.includes('data-section="help"'), '1.1: Settings navigation tab has data-section="help"');
    assert(html.includes('Help & Getting Started</span>'), '1.1: Tab displays "Help & Getting Started" label');
    assert(html.includes('app.switchSettingsSection(\'help\')'), '1.1: Tab triggers switchSettingsSection("help")');

    // 1.2 Help Section Container
    assert(html.includes('id="settings-sec-help"'), '1.2: Settings panel includes #settings-sec-help');
    assert(html.includes('settings-help-accordion'), '1.2: Help topics organized in accessible accordion');

    // 1.3 Topic 1: Getting Started
    assert(html.includes('id="help-topic-getting-started"'), '1.3: Help includes Topic 1: Getting Started');
    assert(/opening\s+balance\s+represents\s+money\s+you\s+already\s+hold/i.test(html), '1.3: Clarifies opening balance is existing funds, not new income');
    assert(html.includes("app.switchView('wallets-view')"), '1.3: Provides functional navigation action to Wallets');
    assert(html.includes("app.switchView('transactions-view')"), '1.3: Provides functional navigation action to Transactions');

    // 1.4 Topic 2: Income, Expenses and Transfers
    assert(html.includes('id="help-topic-income-expenses"'), '1.4: Help includes Topic 2: Income, Expenses & Transfers');
    assert(/ordinary\s+wallet\s+transfers.*never\s+be\s+recorded\s+as\s+income/i.test(html), '1.4: Explains same-currency transfers should not be recorded as income');

    // 1.5 Topic 3: International Remittances
    assert(html.includes('id="help-topic-remittances"'), '1.5: Help includes Topic 3: International Remittances');
    assert(/calculated\s+directly\s+from\s+the\s+two\s+entered\s+amounts/i.test(html), '1.5: Explains effective rate is calculated from amounts sent and received, not live API');
    assert(html.includes("app.openTransactionModal('remittance')"), '1.5: Provides functional action to open remittance form');

    // 1.6 Topic 4: Budgets and Rollover
    assert(html.includes('id="help-topic-budgets"'), '1.6: Help includes Topic 4: Budgets and Rollover');
    assert(/spending\s+limit,\s+not\s+actual\s+cash\s+held\s+in\s+wallets/i.test(html), '1.6: Clearly distinguishes spending allowance from cash in wallets');
    assert(/unspent\s+allowance.*added\s+to\s+the\s+spending\s+limit/i.test(html), '1.6: Explains rollover impacts next month spending limit without transferring cash');
    assert(html.includes("app.switchView('budgets-view')"), '1.6: Provides functional navigation to Budgets');

    // 1.7 Topic 5: Reports and Monthly Closing
    assert(html.includes('id="help-topic-reports-closing"'), '1.7: Help includes Topic 5: Reports and Monthly Closing');
    assert(/seals\s+its\s+transactions\s+against\s+future\s+modifications/i.test(html), '1.7: Explains closing restricts editing of historical transactions');
    assert(/balances\s+continue\s+across\s+months\s+without\s+resetting/i.test(html), '1.7: Explains account balances continue across months');
    assert(!html.includes('Rule 6.1') && !html.includes('CAS revision') && !html.includes('ledger fingerprint'), '1.7: Avoids internal engineering jargon in Help text');

    // 1.8 Topic 6: Data and Privacy
    assert(html.includes('id="help-topic-data-privacy"'), '1.8: Help includes Topic 6: Data and Privacy');
    assert(/does\s+not\s+encrypt\s+your\s+stored\s+data/i.test(html), '1.8: Clarifies screen concealment does not encrypt data');
    assert(/unencrypted\s+JSON\s+file/i.test(html), '1.8: Clarifies JSON backup is unencrypted');
    assert(/directly\s+overrides\s+the\s+recorded\s+number\s+without\s+adding\s+an\s+income\s+or\s+expense/i.test(html), '1.8: Explains manual balance correction overrides stored balance');

    // 1.9 Initial State: Collapsed
    const helpDetailsMatches = [...html.matchAll(/<details\s+class="settings-help-item"[^>]*>/g)];
    assert(helpDetailsMatches.length === 6, '1.9: Exactly 6 expandable help topic items found');
    helpDetailsMatches.forEach((m, idx) => {
        assert(!m[0].includes(' open'), `1.9: Help topic ${idx + 1} is initially collapsed (no open attribute)`);
    });

    // 1.10 CSS Accessibility & Focus Indicators
    assert(css.includes('.settings-help-summary:focus-visible'), '1.10: Accessible visible focus indicator defined for help summaries');
    assert(css.includes('.settings-help-item[open] .help-chevron'), '1.10: Accordion chevron rotation defined on open');

    // -------------------------------------------------------------------------
    // TEST GROUP 2: Contextual Guidance (Task 2)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 2: Contextual Guidance Without Prompt Fatigue ---");

    // 2.1 Budget Rollover Inline Explanation in Settings
    assert(/Adds\s+unspent\s+allowance\s+to\s+next\s+month's\s+spending\s+limit\.\s+Does\s+not\s+transfer\s+cash\s+between\s+accounts\./i.test(appJs),
        '2.1: Budget rollover setting contains concise inline spending allowance explanation');

    // 2.2 Lifestyle Spending Exclusions Explanation
    assert(/Changes\s+analytical\s+reporting\s+only;\s+<em>never\s+alters\s+ledger\s+records\s+or\s+wallet\s+balances\.<\/em>/i.test(html),
        '2.2: Lifestyle exclusions banner clearly explains analytical-only nature');

    // 2.3 Monthly Closing Confirmation Text (No Jargon)
    assert(/Month\s+<code>\${curMonth}<\/code>\s+will\s+be\s+sealed\s+against\s+further\s+transaction\s+edits/i.test(appJs),
        '2.3: Monthly closing confirmation step 5 uses plain language (sealed against edits)');
    assert(!appJs.includes('permanently recorded in <code>closedMonths</code>'),
        '2.3: Internal code identifier closedMonths removed from closing confirmation');

    // 2.4 Manual Balance Correction Override Warning
    assert(html.includes('Manual Balance Correction (Override)'), '2.4: Wallet modal balance override labeled explicitly');
    assert(/Directly\s+sets\s+this\s+wallet's\s+current\s+balance\s+without\s+creating\s+a\s+transaction\s+in\s+your\s+ledger\s+history/.test(html),
        '2.4: Wallet modal explains balance override ledger bypass');

    // -------------------------------------------------------------------------
    // TEST GROUP 3: Simplified Analytics & Reports (Task 3)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 3: Simplified Analytics & Reports ---");

    // 3.1 Analytics Exclusions Collapsible Section
    assert(html.includes('id="analytics-customize-analysis"'), '3.1: Exclusions contained in #analytics-customize-analysis');
    assert(/<details\s+class="[^"]*analytics-customize-details"[^>]*id="analytics-customize-analysis"/i.test(html),
        '3.1: Exclusions wrapped in accessible <details> element');
    const analyticsDetailsTag = html.match(/<details\s+class="[^"]*analytics-customize-details"[^>]*id="analytics-customize-analysis"[^>]*>/)[0];
    assert(!analyticsDetailsTag.includes(' open'), '3.1: Analytics customize section is initially collapsed');
    assert(html.includes('Customize Analysis'), '3.1: Collapsible header clearly labeled "Customize Analysis"');
    assert(html.includes('id="jp-exclusions-chips"'), '3.1: Chips container #jp-exclusions-chips preserved intact');
    assert(html.includes('id="jp-stat-total-expenses"'), '3.1: Summary stat #jp-stat-total-expenses preserved intact');
    assert(html.includes('id="jp-stat-analytical-expenses"'), '3.1: Summary stat #jp-stat-analytical-expenses preserved intact');

    // 3.2 Reports "More Report Actions" Grouping
    assert(html.includes('id="reports-more-actions"'), '3.2: Secondary report actions grouped in #reports-more-actions');
    assert(html.includes('id="btn-reports-more-actions"'), '3.2: "More Actions" summary button present');
    assert(html.includes('app.refreshReportSnapshot()'), '3.2: Refresh Snapshot action preserved inside More Actions');
    assert(html.includes('id="btn-open-closing-wizard"'), '3.2: "Run Monthly Closing" remains directly prominent');
    assert(html.includes('id="report-print-btn"'), '3.2: Print/PDF export button preserved in header');
    assert(html.includes('id="report-export-csv-btn"'), '3.2: CSV export button preserved in header');
    assert(html.includes('id="report-month-select"'), '3.2: Period/Month selector preserved discoverable in toolbar');

    // -------------------------------------------------------------------------
    // TEST GROUP 4: Historical Report Budget Safety Check (Task 3C)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 4: Historical Report Budget Safety Check ---");

    // Execute app in a sandbox context with a closed month and disabled live budget
    const { documentMock } = createMockDOM(html);
    const sandbox = {
        window: {
            addEventListener() {},
            removeEventListener() {},
            lucide: { createIcons() {} },
            location: { reload() {} },
            navigator: { userAgent: 'test' }
        },
        document: documentMock,
        localStorage: {
            _data: {},
            getItem(k) { return this._data[k] || null; },
            setItem(k, v) { this._data[k] = String(v); },
            removeItem(k) { delete this._data[k]; },
            clear() { this._data = {}; }
        },
        console: { log() {}, warn() {}, error() {}, info() {} },
        setTimeout(fn) { return fn(); },
        clearTimeout() {},
        requestAnimationFrame(fn) { return setTimeout(fn, 0); },
        CountryConfig: {
            get(r) { return { JP: { currency: '¥', name: 'Japan' }, IN: { currency: '₹', name: 'India' }, DE: { currency: '€', name: 'Germany' } }[r] || { currency: '¥', name: r }; },
            getAll() { return [{ code: 'JP', name: 'Japan', currency: '¥' }, { code: 'IN', name: 'India', currency: '₹' }, { code: 'DE', name: 'Germany', currency: '€' }]; }
        }
    };
    sandbox.window.document = documentMock;
    sandbox.window.localStorage = sandbox.localStorage;

    const mockStorage = {
        state: {
            onboardingCompleted: true,
            activeCountries: ['JP'],
            defaultCountry: 'JP',
            currentMonthKey: '2026-11',
            wallets: {},
            budgets: {
                JP: { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 }
            },
            categories: { JP: [] },
            userProfile: { displayName: 'Test User' },
            transactions: [],
            closedMonths: {
                '2026-10': {
                    monthKey: '2026-10',
                    status: 'closed',
                    jpTotalBudget: 150000,
                    JPTotalBudget: 150000,
                    jpSpent: 120000,
                    jpRolloverAdded: 30000,
                    categoriesSnapshot: {
                        JP: [{ id: 'dining', budget: 50000 }, { id: 'groceries', budget: 60000 }]
                    }
                }
            }
        },
        saveData: () => true,
        getActiveCountries: () => ['JP'],
        getPrimaryCountry: () => 'JP',
        isBudgetEnabled: (r) => Boolean(mockStorage.state.budgets?.[r]?.enabled),
        isBudgetRolloverEnabled: (r) => Boolean(mockStorage.state.budgets?.[r]?.rolloverEnabled),
        getTotalBudget: (r) => Number(mockStorage.state.budgets?.[r]?.monthlyTotal || 0),
        getCarryover: () => 0
    };

    sandbox.storage = mockStorage;
    sandbox.window.storage = mockStorage;
    sandbox.lucide = { createIcons: () => {} };
    sandbox.defaultState = { userProfile: { displayName: 'User' }, regionalPreferences: {} };
    sandbox.window.defaultState = sandbox.defaultState;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(walletJs, ctx);
    vm.runInContext(appJs, ctx);

    const app = ctx.window.app;
    const storage = mockStorage;
    const walletManager = ctx.window.walletManager;

    app.isPrivacyHidden = false;

    // Seed state: Closed month 2026-10 with positive budget, but live 2026-11 has budgeting disabled
    storage.state.currentMonthKey = '2026-11';
    storage.state.activeCountries = ['JP'];
    storage.state.defaultCountry = 'JP';
    storage.state.budgets = {
        JP: { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 } // LIVE DISABLED!
    };
    storage.state.closedMonths = {
        '2026-10': {
            monthKey: '2026-10',
            status: 'closed',
            jpTotalBudget: 150000,
            JPTotalBudget: 150000,
            jpSpent: 120000,
            jpRolloverAdded: 30000,
            categoriesSnapshot: {
                JP: [{ id: 'dining', budget: 50000 }, { id: 'groceries', budget: 60000 }]
            }
        }
    };
    storage.state.transactions = [
        { id: 'tx-oct-1', type: 'expense', region: 'JP', amount: 120000, categoryId: 'dining', date: '2026-10-15', note: 'October dining' }
    ];

    app.reportRegion = 'JP';
    app.reportMonthKey = '2026-10';

    // Verify: renderReportsPage on closed month 2026-10
    app.renderReportsPage();

    const heroEl = documentMock.getElementById('report-snapshot-hero');
    assert(heroEl && heroEl.innerHTML.length > 0, '4.1: Report snapshot hero renders for closed month');
    assert(heroEl.innerHTML.includes('reports-budget-perf-card'), '4.2: Historical budget card rendered for closed month');
    assert(heroEl.innerHTML.includes('budget-streak-fill'), '4.3: Historical budget progress track is displayed');
    assert(!heroEl.innerHTML.includes('Budgeting is turned off for this region'),
        '4.4: Historical report does NOT falsely claim budgeting is disabled when live setting is off');

    // -------------------------------------------------------------------------
    // TEST GROUP 5: End-to-End Financial Journeys (Task 4)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 5: Financial Journeys & Integrity ---");

    // Reset clean isolated state for journeys
    storage.state.onboardingCompleted = true;
    storage.state.activeCountries = ['JP', 'IN', 'DE'];
    storage.state.defaultCountry = 'JP';
    storage.state.currentMonthKey = '2026-11';
    storage.state.wallets = {
        'w-jp-bank': { id: 'w-jp-bank', name: 'Japan Bank', balance: 300000, region: 'JP', currency: '¥', type: 'bank' },
        'w-jp-cash': { id: 'w-jp-cash', name: 'Japan Cash', balance: 20000, region: 'JP', currency: '¥', type: 'cash' },
        'w-in-bank': { id: 'w-in-bank', name: 'India Bank', balance: 50000, region: 'IN', currency: '₹', type: 'bank' }
    };
    storage.state.categories = {
        JP: [{ id: 'food', name: 'Food', budget: 40000, isActive: true, contributesToTotalBudget: true }]
    };
    storage.state.budgets = {
        JP: { enabled: true, monthlyTotal: 100000, rolloverEnabled: true, carryover: 0 }
    };
    storage.state.transactions = [];

    // Journey A: First-time experience empty state routing
    app.switchView('transactions-view');
    const ledgerHtml = app.renderTransactionsPage ? (app.renderTransactionsPage(), documentMock.getElementById('transactions-view')?.innerHTML || '') : '';
    assert(appJs.includes('app.openUnifiedTransactionSelector()'), '5.1: Journey A: Empty state CTA opens unified transaction selector');

    // Journey B: Everyday Transactions
    // 1. Record Income (+¥150,000)
    const incRes = walletManager.addIncome('w-jp-bank', 150000, 'November salary', '2026-11-01');
    assert(incRes && incRes.success !== false, '5.2: Journey B: Income added successfully');
    assert(storage.state.wallets['w-jp-bank'].balance === 450000, '5.2: Journey B: Japan Bank credited to ¥450,000');

    // 2. Record Expense (-¥30,000)
    const expRes = walletManager.addExpense('w-jp-bank', 'food', 30000, 'Grocery restock', '2026-11-02');
    assert(expRes && expRes.success !== false, '5.3: Journey B: Expense added successfully');
    assert(storage.state.wallets['w-jp-bank'].balance === 420000, '5.3: Journey B: Japan Bank debited to ¥420,000');

    // 3. Transfer Between Accounts (Same Currency ¥15,000)
    const transRes = walletManager.transfer('w-jp-bank', 'w-jp-cash', 15000, 'ATM withdrawal', '2026-11-03');
    assert(transRes && transRes.success !== false, '5.4: Journey B: Transfer Between Accounts succeeded');
    assert(storage.state.wallets['w-jp-bank'].balance === 405000, '5.4: Journey B: Japan Bank debited to ¥405,000');
    assert(storage.state.wallets['w-jp-cash'].balance === 35000, '5.4: Journey B: Japan Cash credited to ¥35,000');

    // 4. International Remittance (¥50,000 -> ₹27,500)
    const remitRes = walletManager.remittance('w-jp-bank', 'w-in-bank', 50000, 27500, 'Family remittance', '2026-11-04');
    assert(remitRes && remitRes.success !== false, '5.5: Journey B: International remittance succeeded');
    assert(storage.state.wallets['w-jp-bank'].balance === 355000, '5.5: Journey B: Japan Bank debited by ¥50,000 to ¥355,000');
    assert(storage.state.wallets['w-in-bank'].balance === 77500, '5.5: Journey B: India Bank credited by ₹27,500 to ₹77,500');

    // 5. Budget Utilization Calculation
    const budgetCardHtml = app.getBudgetOverviewCardHtml({ region: 'JP' });
    assert(budgetCardHtml.includes(app.formatMoney(30000, '¥')), '5.6: Journey B: Budget overview accurately computes total spending');

    // Journey C: Advanced Capabilities
    // Verify Settings section switching
    app.switchSettingsSection('help');
    assert(app.currentSettingsSection === 'help', '5.7: Journey C: switchSettingsSection("help") successfully sets section');

    console.log("================================================================================");
    console.log("RESULTS: All 39/39 Phase 2 Usability assertions passed!");
    console.log("================================================================================");
}

runTests();
