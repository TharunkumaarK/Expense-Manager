/**
 * EXPENSE MANAGER — PHASE 2 TARGETED HOTFIX REGRESSION TEST SUITE
 *
 * Verifies:
 *   Task 1: German (€), Japanese (¥), and Indian (₹) currency & budget resolution
 *           in printCurrentReport(), renderReportsPage() pie badge, and custom range PDF/HTML
 *   Task 2: Reports country selector IDs (report-tab-jp/in/de), visibility for 1/2/3
 *           enabled countries, active-state highlighting, and persistence across navigation
 *   Task 3: International Remittance Help copy accuracy & alignment with remittance form
 *   Task 4: Phase 2 CSS deduplication (single authoritative block, key rules retained)
 */

const fs = require('fs');
const vm = require('vm');

let passed = 0;
let total = 0;

function assert(condition, msg) {
    total++;
    if (!condition) {
        console.error(`  [FAIL] ${msg}`);
        throw new Error(`Assertion failed: ${msg}`);
    }
    passed++;
    console.log(`  [PASS] ${msg}`);
}

function createInteractiveMockDOM(htmlContent) {
    const elementsById = {};

    function makeEl(id, tag = 'div') {
        const classes = new Set();
        return {
            id,
            tagName: tag.toUpperCase(),
            style: {},
            attributes: {},
            children: [],
            options: [],
            value: '',
            innerHTML: '',
            innerText: '',
            textContent: '',
            disabled: false,
            classList: {
                add(...cls) { cls.forEach(c => classes.add(c)); },
                remove(...cls) { cls.forEach(c => classes.delete(c)); },
                toggle(c, force) {
                    if (force === undefined) {
                        if (classes.has(c)) classes.delete(c);
                        else classes.add(c);
                    } else if (force) {
                        classes.add(c);
                    } else {
                        classes.delete(c);
                    }
                },
                contains(c) { return classes.has(c); }
            },
            getAttribute(attr) { return this.attributes[attr] !== undefined ? this.attributes[attr] : (this[attr] ?? null); },
            setAttribute(attr, val) { this.attributes[attr] = String(val); },
            hasAttribute(attr) { return this.attributes[attr] !== undefined; },
            removeAttribute(attr) { delete this.attributes[attr]; },
            querySelectorAll(sel) {
                if (id === 'report-country-selector' && sel === '.segment-btn') {
                    return ['report-tab-jp', 'report-tab-in', 'report-tab-de']
                        .map(k => elementsById[k])
                        .filter(Boolean);
                }
                return [];
            },
            querySelector() { return null; },
            appendChild(child) { this.children.push(child); return child; },
            replaceChildren() { this.innerHTML = ''; this.children = []; },
            focus() { },
            scrollIntoView() { },
            addEventListener() { },
            removeEventListener() { },
            getContext() { return {}; }
        };
    }

    for (const match of htmlContent.matchAll(/id=["']([^"']+)["']/g)) {
        const id = match[1];
        elementsById[id] = makeEl(id);
    }

    // Attach data-region attributes for report tabs
    if (elementsById['report-tab-jp']) elementsById['report-tab-jp'].setAttribute('data-region', 'JP');
    if (elementsById['report-tab-in']) elementsById['report-tab-in'].setAttribute('data-region', 'IN');
    if (elementsById['report-tab-de']) elementsById['report-tab-de'].setAttribute('data-region', 'DE');

    const documentMock = {
        getElementById(id) { return elementsById[id] || null; },
        querySelectorAll(selector) {
            if (selector === '.view') {
                return ['home-view', 'reports-view', 'analytics-view', 'settings-view']
                    .map(id => elementsById[id])
                    .filter(Boolean);
            }
            return [];
        },
        querySelector() { return null; },
        createElement(tag) { return makeEl('', tag); },
        addEventListener() { },
        visibilityState: 'visible',
        body: makeEl('body', 'body')
    };

    return { documentMock, elementsById };
}

function createHarness(html) {
    const { documentMock, elementsById } = createInteractiveMockDOM(html);
    const countryConfigCode = fs.readFileSync('js/country-config.js', 'utf8');
    const walletCode = fs.readFileSync('js/wallet.js', 'utf8');
    const appCode = fs.readFileSync('js/app.js', 'utf8');

    let printedSnapshotHtml = '';
    let printCount = 0;

    const mockStorage = {
        state: {
            onboardingCompleted: true,
            activeCountries: ['JP', 'IN', 'DE'],
            defaultCountry: 'JP',
            currentMonthKey: '2026-11',
            jpTotalBudget: 150000,
            inTotalBudget: 50000,
            budgets: {
                JP: { enabled: true, monthlyTotal: 150000, rolloverEnabled: false, carryover: 0 },
                IN: { enabled: true, monthlyTotal: 50000, rolloverEnabled: false, carryover: 0 },
                DE: { enabled: true, monthlyTotal: 1800, rolloverEnabled: false, carryover: 0 }
            },
            wallets: {
                'w-jp': { id: 'w-jp', name: 'Japan Bank', region: 'JP', currency: '¥', balance: 300000, type: 'bank' },
                'w-in': { id: 'w-in', name: 'India Bank', region: 'IN', currency: '₹', balance: 90000, type: 'bank' },
                'w-de': { id: 'w-de', name: 'German Bank', region: 'DE', currency: '€', balance: 4200, type: 'bank' }
            },
            categories: {
                JP: [{ id: 'jp-food', name: 'Food & Groceries', icon: 'shopping-basket', budget: 40000 }],
                IN: [{ id: 'in-ration', name: 'Ration & Groceries', icon: 'shopping-basket', budget: 15000 }],
                DE: [{ id: 'de-groceries', name: 'Groceries & Supermarket', icon: 'shopping-basket', budget: 500 }]
            },
            transactions: [
                { id: 't-jp-inc', type: 'income', region: 'JP', walletId: 'w-jp', amount: 300000, date: '2026-11-01', note: 'Tokyo salary' },
                { id: 't-jp-exp', type: 'expense', region: 'JP', walletId: 'w-jp', categoryId: 'jp-food', amount: 25000, date: '2026-11-05', note: 'Tokyo groceries' },
                { id: 't-in-inc', type: 'income', region: 'IN', walletId: 'w-in', amount: 85000, date: '2026-11-02', note: 'India freelance' },
                { id: 't-in-exp', type: 'expense', region: 'IN', walletId: 'w-in', categoryId: 'in-ration', amount: 12000, date: '2026-11-06', note: 'Chennai ration' },
                { id: 't-de-inc', type: 'income', region: 'DE', walletId: 'w-de', amount: 3400, date: '2026-11-03', note: 'Berlin stipend' },
                { id: 't-de-exp', type: 'expense', region: 'DE', walletId: 'w-de', categoryId: 'de-groceries', amount: 420.5, date: '2026-11-07', note: 'REWE groceries' },
                { id: 't-de-closed', type: 'expense', region: 'DE', walletId: 'w-de', categoryId: 'de-groceries', amount: 310, date: '2026-10-12', note: 'October REWE' }
            ],
            closedMonths: {
                '2026-10': {
                    monthKey: '2026-10',
                    status: 'closed',
                    jpTotalBudget: 140000,
                    inTotalBudget: 45000,
                    deTotalBudget: 1600,
                    categoriesSnapshot: {
                        JP: [{ id: 'jp-food', budget: 40000 }],
                        IN: [{ id: 'in-ration', budget: 15000 }],
                        DE: [{ id: 'de-groceries', budget: 450 }]
                    }
                }
            },
            userProfile: { displayName: 'Test User' },
            regionalPreferences: {}
        },
        saveData: () => true,
        getActiveCountries: () => [...mockStorage.state.activeCountries],
        getPrimaryCountry: () => mockStorage.state.defaultCountry,
        isBudgetEnabled: (r) => Boolean(mockStorage.state.budgets?.[r]?.enabled),
        isBudgetRolloverEnabled: (r) => Boolean(mockStorage.state.budgets?.[r]?.rolloverEnabled),
        getTotalBudget: (r) => Number(mockStorage.state.budgets?.[r]?.monthlyTotal || 0),
        getCarryover: () => 0,
        isLoanTrackingEnabled: () => false,
        getBudgetRecoveryStatus: () => 'HEALTHY',
        runExclusive: async (fn) => fn(mockStorage.state)
    };

    const sandbox = {
        console: { log() { }, warn() { }, error() { }, info() { } },
        window: {
            addEventListener() { },
            removeEventListener() { },
            lucide: { createIcons() { } },
            print() {
                printCount++;
                printedSnapshotHtml = elementsById['print-container'] ? elementsById['print-container'].innerHTML : '';
            },
            location: { reload() { } },
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
        storage: mockStorage,
        charts: {
            renderReportExpensePie() { }
        },
        lucide: { createIcons() { } },
        defaultState: { userProfile: { displayName: 'User' }, regionalPreferences: {} },
        setTimeout(fn) { return fn(); },
        clearTimeout() { },
        requestAnimationFrame(fn) { return fn(); }
    };
    sandbox.window.document = documentMock;
    sandbox.window.localStorage = sandbox.localStorage;
    sandbox.window.storage = mockStorage;
    sandbox.window.defaultState = sandbox.defaultState;

    const ctx = vm.createContext(sandbox);
    vm.runInContext(countryConfigCode, ctx);
    vm.runInContext(walletCode, ctx);
    vm.runInContext(appCode, ctx);

    const app = ctx.window.app;
    app.isPrivacyHidden = false;

    return {
        app,
        storage: mockStorage,
        elementsById,
        getPrintedHtml: () => printedSnapshotHtml,
        getPrintCount: () => printCount
    };
}

function runTests() {
    console.log('================================================================================');
    console.log('EXPENSE MANAGER — PHASE 2 HOTFIX REGRESSION SUITE');
    console.log('================================================================================');

    const html = fs.readFileSync('index.html', 'utf8');
    const css = fs.readFileSync('css/style.css', 'utf8');
    const appJs = fs.readFileSync('js/app.js', 'utf8');

    // -------------------------------------------------------------------------
    // GATE 1: JavaScript Syntax Integrity Check
    // -------------------------------------------------------------------------
    console.log('\n--- GATE 1: JavaScript Syntax Integrity ---');
    ['js/app.js', 'js/wallet.js', 'js/storage.js', 'js/country-config.js', 'js/charts.js', 'js/onboarding.js'].forEach(file => {
        const src = fs.readFileSync(file, 'utf8');
        new vm.Script(src, { filename: file });
        assert(true, `Syntax valid: ${file}`);
    });

    // -------------------------------------------------------------------------
    // TASK 1: Printable Reports & Export Currency Resolution (JP, IN, DE)
    // -------------------------------------------------------------------------
    console.log('\n--- TASK 1: Printable Reports & Export Currency (JP / IN / DE) ---');
    const h = createHarness(html);

    // 1.1 Germany active month printCurrentReport()
    h.app.reportRegion = 'DE';
    h.app.reportMonthKey = '2026-11';
    h.app.printCurrentReport();
    const dePrintHtml = h.getPrintedHtml();
    assert(h.getPrintCount() === 1, '1.1: printCurrentReport invoked window.print() for DE');
    assert(dePrintHtml.includes('Germany Portfolio (EUR €)'), '1.1: DE print subtitle displays "Germany Portfolio (EUR €)"');
    assert((dePrintHtml.match(/class="print-report-subtitle"/g) || []).length === 1, '1.1: DE print report contains exactly one subtitle');
    assert(!dePrintHtml.includes('India Portfolio'), '1.1: DE print report does NOT display India Portfolio');
    assert(!dePrintHtml.includes('₹'), '1.1: DE print report contains zero ₹ symbols');
    assert(dePrintHtml.includes('€'), '1.1: DE print report formats amounts with €');
    assert(dePrintHtml.includes(h.app.formatMoney(1800, '€')), '1.1: DE print report uses DE monthly budget (€1,800) instead of IN budget');

    // 1.2 Germany closed month printCurrentReport()
    h.app.reportRegion = 'DE';
    h.app.reportMonthKey = '2026-10';
    h.app.printCurrentReport();
    const deClosedPrintHtml = h.getPrintedHtml();
    assert(deClosedPrintHtml.includes('Germany Portfolio (EUR €)'), '1.2: DE closed-month print displays Germany Portfolio (EUR €)');
    assert((deClosedPrintHtml.match(/class="print-report-subtitle"/g) || []).length === 1, '1.2: DE closed-month print contains exactly one subtitle');
    assert(deClosedPrintHtml.includes(h.app.formatMoney(1600, '€')), '1.2: DE closed-month print uses deTotalBudget (€1,600) instead of inTotalBudget');
    assert(!deClosedPrintHtml.includes('₹'), '1.2: DE closed-month print contains zero ₹ symbols');

    // 1.3 Japan printCurrentReport()
    h.app.reportRegion = 'JP';
    h.app.reportMonthKey = '2026-11';
    h.app.printCurrentReport();
    const jpPrintHtml = h.getPrintedHtml();
    assert(jpPrintHtml.includes('Japan Portfolio (JPY ¥)'), '1.3: JP print subtitle displays "Japan Portfolio (JPY ¥)"');
    assert((jpPrintHtml.match(/class="print-report-subtitle"/g) || []).length === 1, '1.3: JP print contains exactly one subtitle');
    assert(jpPrintHtml.includes('¥300,000'), '1.3: JP print report displays ¥300,000 income');

    // 1.4 India printCurrentReport()
    h.app.reportRegion = 'IN';
    h.app.reportMonthKey = '2026-11';
    h.app.printCurrentReport();
    const inPrintHtml = h.getPrintedHtml();
    assert(inPrintHtml.includes('India Portfolio (INR ₹)'), '1.4: IN print subtitle displays "India Portfolio (INR ₹)"');
    assert((inPrintHtml.match(/class="print-report-subtitle"/g) || []).length === 1, '1.4: IN print contains exactly one subtitle');
    assert(inPrintHtml.includes('₹85,000'), '1.4: IN print report displays ₹85,000 income');

    // 1.5 renderReportsPage() pie badge currency code for JP, IN, DE
    const pieBadge = h.elementsById['report-pie-period-badge'];
    h.app.reportMonthKey = '2026-11';
    h.app.setReportRegion('JP');
    assert(pieBadge.innerText === '2026-11 • JPY', `1.5: pieBadge displays JPY for JP (actual: ${pieBadge.innerText})`);
    h.app.setReportRegion('IN');
    assert(pieBadge.innerText === '2026-11 • INR', `1.5: pieBadge displays INR for IN (actual: ${pieBadge.innerText})`);
    h.app.setReportRegion('DE');
    assert(pieBadge.innerText === '2026-11 • EUR', `1.5: pieBadge displays EUR for DE (actual: ${pieBadge.innerText})`);

    // 1.6 Custom range report & PDF with DE transactions under ALL
    h.elementsById['report-custom-start'].value = '2026-11-01';
    h.elementsById['report-custom-end'].value = '2026-11-30';
    h.elementsById['report-custom-region'].value = 'ALL';
    h.elementsById['report-custom-wallet'].value = 'ALL';
    h.elementsById['report-custom-category'].value = 'ALL';
    h.app.generateCustomRangeReport();
    assert(h.app.lastCustomReportData.deIncome === 3400 && h.app.lastCustomReportData.deExpense === 420.5,
        '1.6: Custom range report isolates DE totals separately from IN');
    assert(h.app.lastCustomReportData.inIncome === 85000 && h.app.lastCustomReportData.inExpense === 12000,
        '1.6: Custom range report preserves exact IN totals without DE contamination');
    const customResultsHtml = h.elementsById['report-custom-results'].innerHTML;
    assert(!customResultsHtml.includes('< div') && !customResultsHtml.includes('</div >'), '1.6: Custom range HTML has no malformed tags');
    assert((customResultsHtml.match(/Japan \(JPY ¥\)/g) || []).length === 1, '1.6: Custom range HTML renders Japan summary once');
    assert((customResultsHtml.match(/India \(INR ₹\)/g) || []).length === 1, '1.6: Custom range HTML renders India summary once');
    assert((customResultsHtml.match(/Germany \(EUR €\)/g) || []).length === 1, '1.6: Custom range HTML renders Germany summary once');
    h.app.exportCustomReportPdf();
    const customPdfHtml = h.getPrintedHtml();
    assert(!customPdfHtml.includes('< div'), '1.6: Custom PDF HTML has no malformed < div tags');
    assert((customPdfHtml.match(/Japan Portfolio \(JPY ¥\)/g) || []).length === 1, '1.6: Custom PDF renders Japan Portfolio once');
    assert((customPdfHtml.match(/India Portfolio \(INR ₹\)/g) || []).length === 1, '1.6: Custom PDF renders India Portfolio once');
    assert((customPdfHtml.match(/Germany Portfolio \(EUR €\)/g) || []).length === 1, '1.6: Custom PDF renders Germany Portfolio once');
    assert((customPdfHtml.match(/<span>Total Income<\/span>/g) || []).length === 3, '1.6: Custom PDF renders 3 Total Income blocks (1 per region)');
    const pdfTbodyMatches = [...customPdfHtml.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)];
    assert(pdfTbodyMatches.length === 3, '1.6: Custom PDF renders 3 regional transaction tables');
    assert((pdfTbodyMatches[0][1].match(/<tr/g) || []).length === 2, '1.6: JP table has 2 rows (no duplicated rows)');
    assert((pdfTbodyMatches[1][1].match(/<tr/g) || []).length === 2, '1.6: IN table has 2 rows (no duplicated rows)');
    assert((pdfTbodyMatches[2][1].match(/<tr/g) || []).length === 2, '1.6: DE table has 2 rows (no duplicated rows)');

    // -------------------------------------------------------------------------
    // TASK 2: Reports Country Selector IDs & Visibility Combinations
    // -------------------------------------------------------------------------
    console.log('\n--- TASK 2: Reports Country Selector Visibility & State ---');
    const reportSelectorMatch = html.match(/id="report-country-selector">([\s\S]*?)<\/div>/);
    assert(Boolean(reportSelectorMatch), '2.1: Found #report-country-selector container');
    const reportSelectorHtml = reportSelectorMatch[1];
    assert(!/<button[^>]*<button/.test(reportSelectorHtml), '2.1: No malformed doubled <button> opening tags');
    assert((reportSelectorHtml.match(/<button\b/g) || []).length === 3, '2.1: Exactly 3 <button> elements inside #report-country-selector');
    assert(html.includes('id="report-tab-jp"'), '2.1: index.html has id="report-tab-jp"');
    assert(html.includes('id="report-tab-in"'), '2.1: index.html has id="report-tab-in"');
    assert(html.includes('id="report-tab-de"'), '2.1: index.html has id="report-tab-de"');

    const selector = h.elementsById['report-country-selector'];
    const tabJp = h.elementsById['report-tab-jp'];
    const tabIn = h.elementsById['report-tab-in'];
    const tabDe = h.elementsById['report-tab-de'];

    // 1 enabled country: selector hidden
    h.storage.state.activeCountries = ['DE'];
    h.storage.state.defaultCountry = 'DE';
    h.app.reportRegion = null;
    h.app.renderReportsPage();
    assert(selector.style.display === 'none', '2.2: 1 enabled country (DE) hides #report-country-selector');
    assert(h.app.reportRegion === 'DE', '2.2: 1 enabled country resolves reportRegion to DE');

    // 2 enabled countries: JP + DE (IN disabled)
    h.storage.state.activeCountries = ['JP', 'DE'];
    h.storage.state.defaultCountry = 'JP';
    h.app.reportRegion = 'DE';
    h.app.renderReportsPage();
    assert(selector.style.display === 'flex', '2.3: 2 enabled countries (JP, DE) shows #report-country-selector');
    assert(tabJp.style.display === 'inline-flex' && tabDe.style.display === 'inline-flex' && tabIn.style.display === 'none',
        '2.3: JP+DE shows JP and DE tabs and hides IN tab');
    assert(!tabJp.classList.contains('active') && tabDe.classList.contains('active'),
        '2.3: Active highlight is exclusively on DE');

    // 2 enabled countries: IN + DE (JP disabled)
    h.storage.state.activeCountries = ['IN', 'DE'];
    h.storage.state.defaultCountry = 'IN';
    h.app.reportRegion = 'IN';
    h.app.renderReportsPage();
    assert(tabJp.style.display === 'none' && tabIn.style.display === 'inline-flex' && tabDe.style.display === 'inline-flex',
        '2.4: IN+DE hides JP tab and shows IN and DE tabs');
    assert(tabIn.classList.contains('active') && !tabJp.classList.contains('active') && !tabDe.classList.contains('active'),
        '2.4: Active highlight is exclusively on IN');

    // 3 enabled countries + persistence across view switches
    h.storage.state.activeCountries = ['JP', 'IN', 'DE'];
    h.storage.state.defaultCountry = 'JP';
    h.app.setReportRegion('DE');
    assert(tabDe.classList.contains('active') && !tabJp.classList.contains('active') && !tabIn.classList.contains('active'),
        '2.5: 3 enabled countries highlights DE after setReportRegion("DE")');
    h.app.switchView('home-view');
    h.app.switchView('reports-view');
    assert(h.app.reportRegion === 'DE', '2.5: reportRegion remains DE after navigating away and returning');
    assert(tabDe.classList.contains('active') && !tabJp.classList.contains('active') && !tabIn.classList.contains('active'),
        '2.5: Active highlight remains on DE after returning to reports-view');

    // -------------------------------------------------------------------------
    // TASK 3: International Remittance Help Copy Accuracy
    // -------------------------------------------------------------------------
    console.log('\n--- TASK 3: International Remittance Help Text ---');
    const remitSectionMatch = html.match(/id="help-topic-remittances"[\s\S]*?<\/details>/);
    assert(Boolean(remitSectionMatch), '3.1: Found #help-topic-remittances section');
    const remitText = remitSectionMatch[0];
    assert((remitText.match(/<strong>Effective Exchange Rate:<\/strong>/g) || []).length === 1,
        '3.2: Contains exactly one Effective Exchange Rate explanation');
    assert(/effective\s+exchange\s+rate\s+is\s+calculated\s+directly\s+from\s+the\s+two\s+entered\s+amounts/i.test(remitText),
        '3.2: Explains effective exchange rate is calculated from entered amounts');
    assert(!/effective\s+exchange\s+rate\s+and\s+bank\s+transfer\s+fee\s+are\s+calculated/i.test(remitText),
        '3.3: Removed inaccurate claim that bank transfer fee is calculated from entered amounts');
    assert(/cannot\s+be\s+determined\s+reliably\s+unless\s+additional\s+fee\s+information\s+is\s+supplied/i.test(remitText),
        '3.4: Clarifies separate transfer fee cannot be determined reliably without additional fee information');
    assert(appJs.includes('Calculated from entered amounts sent and received (market rates and transfer fees deferred).'),
        '3.5: Help text aligns with remittance form note');

    // -------------------------------------------------------------------------
    // TASK 4: Phase 2 CSS Deduplication
    // -------------------------------------------------------------------------
    console.log('\n--- TASK 4: Phase 2 CSS Consolidation ---');
    const phase2Headers = css.match(/Phase 2: Help & Getting Started, Analytics & Reports Usability Refinements/g) || [];
    assert(phase2Headers.length === 1, `4.1: Phase 2 CSS header appears exactly once (actual: ${phase2Headers.length})`);
    const helpAccMatches = css.match(/\.settings-help-accordion\s*\{/g) || [];
    const analyticsCustMatches = css.match(/\.analytics-customize-details\s*\{/g) || [];
    const reportsMenuMatches = css.match(/\.reports-more-actions-details\s*\{/g) || [];
    assert(helpAccMatches.length === 1, `4.2: .settings-help-accordion defined once (actual: ${helpAccMatches.length})`);
    assert(analyticsCustMatches.length === 1, `4.3: .analytics-customize-details defined once (actual: ${analyticsCustMatches.length})`);
    assert(reportsMenuMatches.length === 1, `4.4: .reports-more-actions-details defined once (actual: ${reportsMenuMatches.length})`);
    assert(css.includes('.settings-help-summary:focus-visible') &&
        css.includes('.analytics-customize-summary:focus-visible') &&
        css.includes('.reports-menu-item:focus-visible'), '4.5: Keyboard :focus-visible rules retained');
    assert(css.includes('.settings-help-item[open] .help-chevron') &&
        css.includes('.analytics-customize-details[open] .customize-chevron'), '4.6: Accordion chevron rotations retained');
    assert(css.includes('@media (max-width: 768px)') &&
        css.includes('position: absolute;') &&
        css.includes('z-index: 50;'), '4.7: Responsive media query and dropdown positioning retained');

    console.log('================================================================================');
    console.log(`RESULTS: All ${passed}/${total} Phase 2 Hotfix assertions passed!`);
    console.log('================================================================================');
}

runTests();
