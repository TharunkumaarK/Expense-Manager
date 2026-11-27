'use strict';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${labIcons[name]}</svg>`;

const variants = {
    B1: 'Edge glimmer only',
    B2: 'Surface shine only',
    B3: 'Combined optical reflection',
};
const defaults = {
    variant: 'B3', direction: 'forward', edgeIntensity: 56, edgeLength: 19,
    shineIntensity: 11, shineWidth: 37, duration: 790, desktopLight: 78,
    mobileLight: 89, summarySheen: true,
};
const regions = {
    jp: { name: 'Japan', code: 'JPY', locale: 'en-US', balance: 532510, income: 342000,
        spent: [28760, 17890, 12340, 14720, 29850, 6400, 9200, 22000, 3750],
        budget: [42000, 20000, 18000, 16000, 24000, 12000, 13000, 35000, 8000] },
    in: { name: 'India', code: 'INR', locale: 'en-IN', balance: 187120, income: 80500,
        spent: [8240, 4360, 3750, 3940, 7830, 2490, 2290, 5600, 1350],
        budget: [10000, 5000, 4500, 5000, 7000, 4000, 3000, 8000, 2000] },
    de: { name: 'Germany', code: 'EUR', locale: 'en-IE', balance: 3240, income: 2860,
        spent: [304, 178, 89, 171, 281, 52, 76, 160, 33],
        budget: [430, 210, 125, 200, 220, 110, 125, 255, 80] },
};
const categoryNames = [
    ['Groceries', 'groceries'], ['Dining', 'dining'], ['Transport', 'transport'],
    ['Utilities', 'utilities'], ['Shopping', 'shopping'], ['Entertainment', 'entertainment'],
    ['Personal care', 'care'], ['Travel', 'travel'], ['Other expenses', 'other'],
];
const wallets = {
    salary: { name: 'Salary account', theme: 'emerald-salary', region: 'jp', balance: 486200, digits: '0412' },
    paypay: { name: 'PayPay', theme: 'crimson-paypay', region: 'jp', balance: 17480, digits: '6025' },
    axis: { name: 'Axis Bank', theme: 'burgundy-axis', region: 'in', balance: 128320, digits: '7128' },
    baroda: { name: 'Bank of Baroda', theme: 'baroda-orange', region: 'in', balance: 58800, digits: '3086' },
};
const activity = {
    jp: [['Dinner in Shibuya', 'Dining', 'PayPay', 26, -5460], ['Monthly salary', 'Income', 'Salary account', 25, 342000],
        ['Weekend groceries', 'Groceries', 'PayPay', 24, -14260], ['Commuter pass', 'Transport', 'Suica', 21, -12340],
        ['Electricity and gas', 'Utilities', 'Salary account', 19, -14720]],
    in: [['Household supplies', 'Shopping', 'Bank of Baroda', 26, -3560], ['Weekend groceries', 'Groceries', 'Axis Bank', 24, -3070],
        ['Fuel', 'Transport', 'Axis Bank', 22, -1250], ['Electricity bill', 'Utilities', 'Axis Bank', 20, -3940],
        ['Consulting income', 'Income', 'Axis Bank', 18, 80500]],
    de: [['Groceries', 'Groceries', 'Giro account', 25, -74], ['Train ticket', 'Transport', 'Giro account', 21, -39],
        ['Cinema', 'Entertainment', 'Giro account', 20, -25], ['Electricity', 'Utilities', 'Giro account', 19, -171],
        ['Monthly salary', 'Income', 'Giro account', 18, 2860]],
};
const nav = [
    ['Dashboard', 'home', 'overview'], ['Transactions', 'ledger', 'transactions'],
    ['Analytics', 'chart', 'analytics'], ['Reports', 'reports', 'report'],
    ['Budgets', 'budget', 'budgets'], ['Wallets', 'wallet', 'wallets'],
    ['Settings', 'settings', 'controls'],
];

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
const preview = new URLSearchParams(location.search).get('preview');
if (['desktop', 'mobile'].includes(preview)) document.body.dataset.preview = preview;

const compactLab = matchMedia('(max-width: 700px)');
function orderPreviews() {
    const desktopSection = $('#desktop');
    const mobileSection = $('#mobile');
    if (compactLab.matches) desktopSection.before(mobileSection);
    else mobileSection.before(desktopSection);
}
if (!document.body.dataset.preview) {
    orderPreviews();
    compactLab.addEventListener('change', orderPreviews);
}

const total = values => values.reduce((a, b) => a + b, 0);
const month = new Date(2026, 10, 1);
const period = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(month);
const currency = Object.fromEntries(Object.entries(regions).map(([id, region]) =>
    [id, new Intl.NumberFormat(region.locale, { style: 'currency', currency: region.code, maximumFractionDigits: 0 })]));
const money = (id, number) => currency[id].format(Math.abs(number));
const amount = (id, number, signed = false) =>
    `<span class="amount" data-amount>${number < 0 ? '−' : signed ? '+' : ''}${money(id, number)}</span>`;
const statusFor = percent => percent > 100 ? 'over' : percent >= 75 ? 'warn' : 'safe';
const utilization = (spent, limit) => Math.round(100 * spent / limit);
const settingsKey = 'expense-manager-optics-4c2v';
const dashboards = new Map();
const sampleWalletThemes = Object.entries(wallets);
let dialogWorkspace;
let noticeTimer;
let summaryObserver;
let loginTimer;

function flag(id) {
    const contents = {
        jp: '<rect width="24" height="24" fill="#eee"/><circle cx="12" cy="12" r="5" fill="#d80027"/>',
        in: '<path fill="#ff9933" d="M0 0h24v8H0z"/><path fill="#fff" d="M0 8h24v8H0z"/><path fill="#138808" d="M0 16h24v8H0z"/><circle cx="12" cy="12" r="2.45" fill="none" stroke="#000080" stroke-width="1"/>',
        de: '<path fill="#171717" d="M0 0h24v8H0z"/><path fill="#dc2626" d="M0 8h24v8H0z"/><path fill="#ffce00" d="M0 16h24v8H0z"/>',
    };
    return `<svg class="flag" viewBox="0 0 24 24" aria-hidden="true">${contents[id]}</svg>`;
}

function action(label, command, glyph, options = {}) {
    const { secondary = false, fab = false, glimmer = true } = options;
    return `<button type="button" class="action${secondary ? ' secondary' : ''}${fab ? ' fab' : ''}" data-command="${command}"
        ${fab ? `aria-label="${label}"` : ''} ${glimmer ? 'data-glimmer' : ''}>
        ${glyph ? icon(glyph) : ''}${fab ? '' : `<span class="action-label">${label}</span>`}
        ${glimmer ? '<svg class="rim" aria-hidden="true" focusable="false"><rect/></svg>' : ''}
    </button>`;
}

function utility(command, label, glyph, attributes = '') {
    return `<button type="button" class="icon-button" data-command="${command}" aria-label="${label}" title="${label}" ${attributes}>${icon(glyph)}</button>`;
}

function country(id, interactive = true) {
    const { name, balance, code } = regions[id];
    const inner = `<span class="country-head"><span class="country-name">${flag(id)}${name}</span>
        <span class="country-meta">${code}${interactive ? icon('arrow') : ''}</span></span>
        ${amount(id, balance)}<span class="label">Total balance</span>`;
    const className = `country country-card-${id}`;
    return interactive
        ? `<button type="button" class="${className}" data-command="portfolio" data-region="${id}" aria-haspopup="dialog">${inner}</button>`
        : `<article class="${className}">${inner}</article>`;
}

function kpi(title, sum, region, glyph, signature = false, tone = '') {
    return `<article class="kpi ${signature ? 'luminous' : 'matte'}">
        <p class="label">${title}${icon(glyph)}</p>
        <p class="${tone}">${amount(region, sum, true)}</p>
    </article>`;
}

function progress(label, percent) {
    return `<div class="track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.min(100, percent)}" aria-valuetext="${percent}% used">
        <span class="fill" style="--usage:${percent}%"></span>
    </div>`;
}

function budgetCard(region, index, instance, variant = '') {
    const [name, glyph] = categoryNames[index];
    const { spent, budget } = regions[region];
    const percent = utilization(spent[index], budget[index]);
    const status = statusFor(percent);
    const id = `budget-${instance}-${index}`;
    return `<article class="budget-card matte" data-budget-card data-utilization="${status}" ${variant ? `data-variant="${variant}"` : ''}>
        <div class="optics" aria-hidden="true"><span class="edge-spot"></span><span class="shine-spot"></span></div>
        <div class="budget-head">${icon(glyph)}<h4 id="${id}">${name}</h4></div>
        <p class="budget-amounts"><strong>${amount(region, spent[index])}</strong> of ${amount(region, budget[index])}</p>
        ${progress(`${name} budget`, percent)}
        <p class="budget-foot"><span class="amount">${percent}% used</span><span class="state">${{ safe: 'On track', warn: 'Near limit', over: 'Over budget' }[status]}</span></p>
        <button type="button" class="budget-hit" data-command="${variant ? 'replay-budget' : 'budget-detail'}"
            data-index="${index}" ${variant ? `aria-label="Replay ${variants[variant]} on ${name}"` : `aria-labelledby="${id}" aria-haspopup="dialog"`}></button>
    </article>`;
}

function summaryCard(region) {
    const used = total(regions[region].spent);
    const limit = total(regions[region].budget);
    const percent = utilization(used, limit);
    const remaining = limit - used;
    return `<article class="summary-card matte" data-summary data-utilization="${statusFor(percent)}">
        <div class="summary-top"><h4>Overall budget</h4><span class="label">${period}</span></div>
        <p class="summary-tally"><strong>${amount(region, used)}</strong> of ${amount(region, limit)}</p>
        ${progress('Overall budget', percent)}
        <div class="summary-foot"><span class="amount">${percent}% used</span><span>${amount(region, remaining)} ${remaining < 0 ? 'over' : 'remaining'}</span></div>
    </article>`;
}

function regionChoices(region) {
    return `<div class="region-choice" role="group" aria-label="Reporting region">
        ${Object.entries(regions).map(([id, value]) => `<button type="button" data-command="region" data-region="${id}"
            aria-label="${value.name}" aria-pressed="${id === region}">${id.toUpperCase()}</button>`).join('')}
    </div>`;
}

function chart(region) {
    const spending = regions[region].spent;
    const sum = total(spending);
    const series = spending.map((value, index) => [categoryNames[index][0], value]).sort((a, b) => b[1] - a[1]);
    const categories = [...series.slice(0, 5), ['Other', total(series.slice(5).map(([, value]) => value))]];
    const colors = ['#6c83bd', '#9a79c5', '#6eb49f', '#ce9455', '#77aab9', '#b27c93'];
    let offset = 0;
    const slices = categories.map(([, value], index) => {
        const length = value / sum * 100;
        const slice = `<circle cx="64" cy="64" r="53" pathLength="100" stroke="${colors[index]}" stroke-dasharray="${length - 1} ${101 - length}" stroke-dashoffset="${-offset}"/>`;
        offset += length;
        return slice;
    }).join('');
    return `<div class="donut-area">
        <div class="donut"><svg viewBox="0 0 128 128" aria-hidden="true"><g fill="none" stroke-width="13" transform="rotate(-90 64 64)">
            <circle cx="64" cy="64" r="53" stroke="#252529"/>${slices}
        </g></svg></div>
        <div class="donut-center"><span class="label">Total spent</span>${amount(region, sum)}</div>
    </div>
    <ul class="chart-legend">${categories.map(([label, value], index) =>
        `<li><span><i class="chart-dot" style="--series:${colors[index]}"></i>${label}</span>${amount(region, value)}</li>`).join('')}</ul>`;
}

function transactionList(region, limit = 5, category = '') {
    const rows = category ? activity[region].filter(row => row[1] === category) : activity[region];
    return `<ul class="transaction-list">${rows.slice(0, limit).map(([title, category, wallet, day, value]) =>
        `<li><span class="tx-icon ${value > 0 ? 'income' : 'expense'}">${icon(value > 0 ? 'down' : 'arrow')}</span>
        <div><p class="tx-title">${title}</p><p class="tx-subtitle">${day} Nov · ${wallet} · ${category}</p></div>
        <span class="${value > 0 ? 'income' : 'expense'}">${amount(region, value, true)}</span></li>`).join('')}</ul>`;
}

function walletCard(id, override) {
    const item = wallets[id];
    return `<article class="wallet-card wallet-theme-${wallets[override || id].theme}">
        <div class="wallet-top"><h4>${item.name}</h4>${icon('wallet')}</div>
        ${amount(item.region, item.balance)}<p class="label">${regions[item.region].code} · •••• ${item.digits}</p>
    </article>`;
}

function walletPanel(state) {
    if (state.region === 'de') return `<article class="dash-panel matte"><h4>Giro account</h4>${amount('de', regions.de.balance)}</article>`;
    const region = state.region;
    const options = sampleWalletThemes.filter(([, item]) => item.region === region);
    const account = options[0][0];
    return `${walletCard(account, state.themes[region] || account)}
        <label class="wallet-choice">Wallet theme
            <select data-wallet-theme>${sampleWalletThemes.map(([id, item]) =>
                `<option value="${id}" ${(state.themes[region] || account) === id ? 'selected' : ''}>${item.name}</option>`).join('')}</select>
        </label>`;
}

function dashboardContent(scope, state) {
    const { region } = state;
    const { spent, income } = regions[region];
    const outflows = total(spent);
    return `<div class="main-column">
        <section class="dash-section" id="${scope}-overview" tabindex="-1">
            <div class="section-line"><h3>Balances</h3>${regionChoices(region)}</div>
            <div class="country-grid">${country('jp')}${country(region === 'de' ? 'de' : 'in')}</div>
            <div class="kpi-grid">
                ${kpi('Monthly income', income, region, 'down', false, 'income')}
                ${kpi('Total outflows', -outflows, region, 'arrow', false, 'expense')}
                ${kpi('Net savings', income - outflows, region, 'chart', true)}
            </div>
        </section>
        <section class="dash-section" id="${scope}-budgets" tabindex="-1">
            <div class="section-line"><h3>${regions[region].name} spending</h3><span class="label">Category budgets</span></div>
            ${summaryCard(region)}
            <div class="budget-grid" data-budget-group>${categoryNames.map((_, index) => budgetCard(region, index, scope)).join('')}</div>
        </section>
    </div>
    <div class="right-column">
        <section class="dash-panel matte" id="${scope}-analytics" tabindex="-1">
            <div class="section-line"><h3>Expense breakdown</h3><span class="label">${regions[region].code}</span></div>
            ${chart(region)}
        </section>
        <section class="dash-panel matte" id="${scope}-transactions" tabindex="-1">
            <div class="section-line"><h3>Recent activity</h3><span class="label">${period}</span></div>
            ${transactionList(region)}
        </section>
        <section class="dash-section" id="${scope}-wallets" tabindex="-1">${walletPanel(state)}</section>
    </div>`;
}

function drawer(scope, mobile) {
    const className = mobile ? 'mobile-drawer' : 'desktop-drawer';
    return `<aside class="${className}" id="${scope}-drawer" ${mobile ? 'inert' : ''} aria-label="${mobile ? 'Mobile' : 'Desktop'} navigation">
        <div class="drawer-inner">
            <div class="drawer-head">
                ${mobile ? utility('close-drawer', 'Close navigation', 'close') :
                    utility('toggle-rail', 'Toggle sidebar', 'menu', `aria-expanded="false" aria-controls="${scope}-nav"`)}
                <span>Expense Manager</span>
            </div>
            <nav class="drawer-nav" id="${scope}-nav" aria-label="Dashboard sections">
                ${nav.map(([label, glyph, target]) => {
                    const href = target === 'controls' ? './#controls' : `#${scope}-${target === 'report' ? 'analytics' : target}`;
                    return `<a class="nav-link" href="${href}" aria-label="${label}" data-destination="${target}" ${target === 'overview' ? 'aria-current="page"' : ''}>
                        ${icon(glyph)}<span>${label}</span></a>`;
                }).join('')}
            </nav>
            <p class="drawer-foot">${icon('check')}<span class="label">Sample ledger</span></p>
        </div>
    </aside>`;
}

function dashboard(scope) {
    const mobile = scope === 'mobile';
    const state = { region: 'jp', concealed: false, themes: {} };
    const host = $(`#${scope}-preview`);
    host.innerHTML = `<div class="workspace ${scope}-workspace" data-workspace="${scope}">
        ${drawer(scope, mobile)}
        ${mobile ? '<button type="button" class="drawer-scrim" data-command="close-drawer" tabindex="-1" aria-label="Close navigation" hidden></button>' : ''}
        <div class="dash-content">
            <header class="dash-toolbar">
                <div class="toolbar-start">
                    ${mobile ? utility('open-drawer', 'Open navigation', 'menu', 'aria-expanded="false" aria-controls="mobile-drawer"') : ''}
                    <h3>Dashboard</h3>
                </div>
                <div class="toolbar-actions">
                    <span class="period">${icon('calendar')}${period}</span>
                    ${utility('privacy', 'Hide monetary values', 'eye', 'aria-pressed="false"')}
                    ${mobile ? '' : `${action('View ledger', 'ledger', 'ledger', { secondary: true })}${action('Add transaction', 'add', 'plus')}`}
                </div>
            </header>
            <div class="dash-body">${dashboardContent(scope, state)}</div>
        </div>
        ${mobile ? `<div class="phone-actions">${action('Add transaction', 'add', 'plus', { fab: true })}</div>` : ''}
    </div>`;
    const workspace = $('.workspace', host);
    dashboards.set(workspace, state);
    return workspace;
}

const desktop = dashboard('desktop');
const mobile = dashboard('mobile');
$('#material-samples').innerHTML = [true, false].map(signature =>
    `<div>${kpi('Net savings', regions.jp.income - total(regions.jp.spent), 'jp', 'chart', signature)}
    <p class="sample-label"><strong>${signature ? 'A' : 'B'}</strong> · ${signature ? 'Signature luminous glass' : 'Dark matte glass'}</p></div>`).join('');
$('#reflection-samples').innerHTML = Object.entries(variants).map(([id, label]) =>
    `<div>${budgetCard('jp', 0, id, id)}
        <label class="sample-select"><input type="radio" name="budget-variant" value="${id}"><span><strong>${id}</strong> · ${label}</span></label>
    </div>`).join('');
$('#action-samples').innerHTML = action('View ledger', 'sample-action', 'ledger', { secondary: true }) + action('Add transaction', 'sample-action', 'plus');
$('#login-preview').innerHTML = `<div class="auth-shell">
    <div class="auth-brand-pane">
        <p class="auth-brand-name">Expense Manager</p>
        <p class="auth-headline">Cross-border finances,<br>unified in one ledger.</p>
        <div class="auth-showcase">${country('jp', false)}${country('in', false)}</div>
    </div>
    <div class="auth-form-pane">
        <h3>Welcome!</h3><p class="label">Sign in to access your sample ledger.</p>
        <div class="auth-form" aria-label="Synthetic sign-in preview">
            <label><span class="label">Email</span><input type="email" value="maya@example.test" autocomplete="off" readonly></label>
            <div>
                <div class="label-row"><label class="label" for="sample-password">Password</label>
                    <button type="button" class="quiet" data-command="forgot">Forgot password?</button></div>
                <div class="auth-wrap"><input id="sample-password" type="password" readonly value="sample-only" autocomplete="off">
                    ${utility('password', 'Show sample password', 'eye', 'aria-pressed="false"')}</div>
            </div>
            ${action('Sign in', 'sign-in')}
        </div>
        <p class="auth-feedback label" id="login-status" role="status"></p>
    </div>
</div>`;
$('#close-dialog').innerHTML = icon('close');

const controlForm = $('#optical-controls');
$('#variant').innerHTML = Object.entries(variants).map(([id, label]) => `<option value="${id}">${id} · ${label}</option>`).join('');
let settings = { ...defaults };
try {
    const saved = JSON.parse(localStorage.getItem(settingsKey));
    if (saved) {
        for (const [key, fallback] of Object.entries(defaults)) {
            const field = controlForm.elements.namedItem(key);
            const value = saved[key];
            if (typeof fallback === 'number' && typeof value === 'number' &&
                value >= Number(field.min) && value <= Number(field.max)) settings[key] = value;
            if (typeof fallback === 'boolean' && typeof value === 'boolean') settings[key] = value;
            if (field instanceof HTMLSelectElement && [...field.options].some(option => option.value === value)) settings[key] = value;
        }
    }
} catch {
    // A blocked or invalid local storage entry falls back to the sample settings.
}

function observeSummaries() {
    summaryObserver?.disconnect();
    for (const card of $$('[data-summary]')) {
        card.classList.remove('summary-visible');
        if (settings.summarySheen && !reduced.matches && !document.hidden) summaryObserver?.observe(card);
    }
}

if ('IntersectionObserver' in window) {
    summaryObserver = new IntersectionObserver(entries => {
        for (const { target, isIntersecting } of entries) {
            target.classList.toggle('summary-visible', isIntersecting && settings.summarySheen && !reduced.matches && !document.hidden);
        }
    });
}

function applySettings() {
    const root = document.documentElement;
    root.dataset.direction = settings.direction;
    root.style.setProperty('--edge-length', `${settings.edgeLength}%`);
    root.style.setProperty('--shine-width', `${settings.shineWidth}%`);
    root.style.setProperty('--desktop-light', settings.desktopLight / 100);
    root.style.setProperty('--mobile-light', settings.mobileLight / 100);
    for (const [key, value] of Object.entries(settings)) {
        const field = controlForm.elements.namedItem(key);
        if (typeof value === 'boolean') field.checked = value;
        else field.value = value;
        const readout = $(`output[for="${key}"]`, controlForm);
        if (readout) readout.value = `${value}${key === 'duration' ? ' ms' : '%'}`;
    }
    for (const choice of $$('[name="budget-variant"]')) choice.checked = choice.value === settings.variant;
    $('#configuration').textContent = JSON.stringify(settings, null, 2);
}

function updateSettings(key, value) {
    clearOptics();
    settings[key] = value;
    applySettings();
    if (key === 'summarySheen') observeSummaries();
    try { localStorage.setItem(settingsKey, JSON.stringify(settings)); } catch {}
}

controlForm.addEventListener('input', event => {
    const field = event.target;
    const value = field.type === 'checkbox' ? field.checked :
        field.type === 'range' ? field.valueAsNumber : field.value;
    updateSettings(field.name, value);
});
controlForm.addEventListener('reset', event => {
    event.preventDefault();
    clearOptics();
    settings = { ...defaults };
    applySettings();
    observeSummaries();
    try { localStorage.removeItem(settingsKey); } catch {}
    notify('Optical defaults restored.');
});
$('#reflection-samples').addEventListener('change', event => {
    if (event.target.name === 'budget-variant') updateSettings('variant', event.target.value);
});
$('#copy-config').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText($('#configuration').textContent);
        notify('Configuration copied.');
    } catch {
        $('details', controlForm).open = true;
        const range = document.createRange();
        range.selectNodeContents($('#configuration'));
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(range);
        notify('Configuration selected. Copy it to share.');
    }
});

function notify(message) {
    clearTimeout(noticeTimer);
    $('#notice').textContent = message;
    noticeTimer = setTimeout(() => { $('#notice').textContent = ''; }, 2800);
}

function setPrivacy(workspace) {
    const hidden = dashboards.get(workspace).concealed;
    for (const node of $$('[data-amount]', workspace)) {
        node.dataset.original ??= node.textContent;
        node.textContent = hidden ? '••••' : node.dataset.original;
    }
    const control = $('[data-command="privacy"]', workspace);
    control.innerHTML = icon(hidden ? 'eyeOff' : 'eye');
    const label = hidden ? 'Reveal monetary values' : 'Hide monetary values';
    control.setAttribute('aria-label', label);
    control.setAttribute('aria-pressed', String(hidden));
    control.title = label;
}

function setRegion(workspace, id) {
    const state = dashboards.get(workspace);
    if (state.region === id) return;
    clearOptics();
    const restoreFocus = document.activeElement?.matches('[data-command="region"]');
    state.region = id;
    $('.dash-body', workspace).innerHTML = dashboardContent(workspace.dataset.workspace, state);
    setPrivacy(workspace);
    observeSummaries();
    if (restoreFocus) $(`[data-command="region"][data-region="${id}"]`, workspace).focus();
}

function setDesktopDrawer(mode, instant = false) {
    const drawer = $('.desktop-drawer', desktop);
    const toggle = $('[data-command="toggle-rail"]', drawer);
    drawer.toggleAttribute('data-instant', instant);
    if (mode) drawer.dataset.open = mode;
    else delete drawer.dataset.open;
    toggle.setAttribute('aria-expanded', String(Boolean(mode)));
}

const desktopDrawer = $('.desktop-drawer .drawer-inner', desktop);
desktopDrawer.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' && finePointer.matches && !desktopDrawer.parentElement.dataset.open) setDesktopDrawer('hover');
});
desktopDrawer.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse' && desktopDrawer.parentElement.dataset.open === 'hover') setDesktopDrawer(null);
});
finePointer.addEventListener('change', ({ matches }) => {
    if (!matches && desktopDrawer.parentElement.dataset.open === 'hover') setDesktopDrawer(null, true);
});

function setMobileDrawer(open, focusTarget = true) {
    const drawer = $('.mobile-drawer', mobile);
    const toggle = $('[data-command="open-drawer"]', mobile);
    drawer.toggleAttribute('data-open', open);
    drawer.inert = !open;
    $('.drawer-scrim', mobile).hidden = !open;
    $('.dash-content', mobile).inert = open;
    $('.phone-actions', mobile).inert = open;
    toggle.setAttribute('aria-expanded', String(open));
    if (focusTarget) (open ? $('[data-command="close-drawer"]', drawer) : toggle).focus({ preventScroll: true });
}

function navigatePreview(event, link) {
    const workspace = link.closest('[data-workspace]');
    const destination = link.dataset.destination;
    if (workspace === mobile) setMobileDrawer(false, false);
    if (destination === 'controls') return;
    event.preventDefault();
    if (destination === 'report') {
        const { region, concealed } = dashboards.get(workspace);
        showDialog('November spending report', chart(region), workspace, concealed);
        return;
    }
    for (const item of $$('.nav-link[aria-current]', workspace)) item.removeAttribute('aria-current');
    link.setAttribute('aria-current', 'page');
    const target = $(`#${workspace.dataset.workspace}-${destination}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
}

const dialog = $('#preview-dialog');
function showDialog(title, content, workspace, conceal = false) {
    dialogWorkspace = workspace;
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = content;
    if (conceal) for (const node of $$('[data-amount]', dialog)) node.textContent = '••••';
    if (!dialog.open) dialog.showModal();
}

function showPortfolio(region, workspace) {
    const cards = sampleWalletThemes.filter(([, item]) => item.region === region).map(([id]) => walletCard(id));
    showDialog(`${regions[region].name} portfolio`, `<div class="region-choice dialog-region" role="group" aria-label="Portfolio region">
        ${Object.entries(regions).map(([id, item]) => `<button type="button" data-command="dialog-region" data-region="${id}"
            aria-pressed="${id === region}">${flag(id)} ${item.name}</button>`).join('')}
        </div><div class="dialog-wallets">${cards.length ? cards.join('') : `<div class="matte dash-panel">Giro account ${amount(region, regions[region].balance)}</div>`}</div>`,
    workspace, dashboards.get(workspace).concealed);
}

function showBudget(workspace, index) {
    const { region, concealed } = dashboards.get(workspace);
    const [category] = categoryNames[index];
    const { spent, budget } = regions[region];
    const percentage = utilization(spent[index], budget[index]);
    showDialog(`${category} budget`, `<div class="summary-card matte" data-utilization="${statusFor(percentage)}">
        <p class="summary-tally"><strong>${amount(region, spent[index])}</strong> of ${amount(region, budget[index])}</p>
        ${progress(`${category} budget`, percentage)}</div>
        <div class="dash-panel">${activity[region].some(row => row[1] === category)
            ? transactionList(region, 5, category) : '<p class="label">No recent sample transactions in this category.</p>'}</div>`, workspace, concealed);
}

function applyActionState() {
    const state = $('#action-state').value;
    for (const button of $$('.dash-toolbar .action, #action-samples .action, #login-preview .action')) {
        const label = $('.action-label', button);
        label.dataset.label ??= label.textContent;
        const login = button.dataset.command === 'sign-in';
        const busy = state === 'busy' || (login && loginTimer);
        button.disabled = state === 'disabled' || Boolean(busy);
        button.setAttribute('aria-busy', String(Boolean(busy)));
        label.textContent = busy ? (login ? 'Signing in…' : 'Working…') : label.dataset.label;
        if (button.disabled) {
            button.classList.remove('is-hovered', 'is-pressed');
            stopRim(button);
        }
    }
}

$('#action-state').addEventListener('change', applyActionState);

const budgetDwell = 105;
const pendingOptics = new Map();
const runningOptics = new Map();
let budgetTouch;
let actionTouch;

function opticsGroup(card) {
    return card.closest('[data-budget-group]') || $('#reflection-samples');
}

function cancelOptics(card) {
    clearTimeout(pendingOptics.get(card));
    pendingOptics.delete(card);
    const group = opticsGroup(card);
    const playing = runningOptics.get(group);
    if (playing?.card === card) {
        playing.effects.forEach(effect => effect.cancel());
        runningOptics.delete(group);
    }
}

function clearOptics() {
    for (const timer of pendingOptics.values()) clearTimeout(timer);
    pendingOptics.clear();
    for (const { effects } of runningOptics.values()) effects.forEach(effect => effect.cancel());
    runningOptics.clear();
}

function reflect(card) {
    if (reduced.matches) return;
    const group = opticsGroup(card);
    const playing = runningOptics.get(group);
    if (playing) cancelOptics(playing.card);
    const variant = card.dataset.variant || settings.variant;
    const reverse = settings.direction === 'reverse';
    const sign = reverse ? -1 : 1;
    const timing = { duration: settings.duration, easing: 'linear' };
    const effects = [];
    if (variant !== 'B2') {
        effects.push($('.edge-spot', card).animate([
            { transform: `translateX(${-36 * sign}%)`, opacity: 0 },
            { offset: .19, opacity: settings.edgeIntensity / 100 },
            { offset: .68, opacity: settings.edgeIntensity / 100 },
            { transform: `translateX(${36 * sign}%)`, opacity: 0 },
        ], timing));
    }
    if (variant !== 'B1') {
        const tilt = reverse ? 22 : -22;
        const start = -110;
        const end = 10000 / settings.shineWidth + 33;
        effects.push($('.shine-spot', card).animate([
            { transform: `translateX(${reverse ? end : start}%) rotate(${tilt}deg)`, opacity: 0 },
            { offset: .29, opacity: settings.shineIntensity / 100 },
            { offset: .62, opacity: settings.shineIntensity / 100 },
            { transform: `translateX(${reverse ? start : end}%) rotate(${tilt}deg)`, opacity: 0 },
        ], timing));
    }
    const current = { card, effects };
    runningOptics.set(group, current);
    effects[0].onfinish = () => {
        if (runningOptics.get(group) === current) runningOptics.delete(group);
    };
}

function scheduleOptics(card, delay = budgetDwell) {
    if (reduced.matches || pendingOptics.has(card)) return;
    pendingOptics.set(card, setTimeout(() => {
        pendingOptics.delete(card);
        reflect(card);
    }, delay));
}

function stopRim(button) {
    $('.rim rect', button)?.getAnimations().forEach(effect => effect.cancel());
}

function playRim(button) {
    const rect = $('.rim rect', button);
    if (!rect || reduced.matches || button.disabled) return;
    stopRim(button);
    const perimeter = rect.getTotalLength();
    if (!perimeter) return;
    const style = getComputedStyle(button);
    const length = parseFloat(style.getPropertyValue('--rim-length'));
    const opacity = Number(style.getPropertyValue('--rim-opacity'));
    rect.style.strokeDasharray = `${length} ${perimeter - length}`;
    rect.animate([
        { strokeDashoffset: 0, opacity: 0 },
        { strokeDashoffset: -perimeter * .08, opacity, offset: .08 },
        { strokeDashoffset: -perimeter * .92, opacity, offset: .92 },
        { strokeDashoffset: -perimeter, opacity: 0 },
    ], { duration: parseFloat(style.getPropertyValue('--rim-time')), easing: 'linear' });
}

function clearActionTouch(cancelRim = false) {
    if (!actionTouch) return;
    clearTimeout(actionTouch.timer);
    actionTouch.button.classList.remove('is-pressed');
    if (cancelRim) stopRim(actionTouch.button);
    actionTouch = undefined;
}

document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches) return;
    const card = event.target.closest('[data-budget-card]');
    if (card && !card.contains(event.relatedTarget)) scheduleOptics(card);
    const button = event.target.closest('.action:not(:disabled)');
    if (button && !button.contains(event.relatedTarget)) {
        button.classList.add('is-hovered');
        playRim(button);
    }
}, { passive: true });

document.addEventListener('pointerout', event => {
    if (event.pointerType !== 'mouse') return;
    const card = event.target.closest('[data-budget-card]');
    if (card && !card.contains(event.relatedTarget)) {
        clearTimeout(pendingOptics.get(card));
        pendingOptics.delete(card);
    }
    const button = event.target.closest('.action.is-hovered');
    if (button && !button.contains(event.relatedTarget)) button.classList.remove('is-hovered');
}, { passive: true });

document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.pointerType === 'mouse') return;
    const { pointerId: id, clientX: x, clientY: y } = event;
    const card = event.target.closest('[data-budget-card]');
    if (card) {
        budgetTouch = { card, id, x, y };
        scheduleOptics(card, 80);
    }
    clearActionTouch(true);
    const button = event.target.closest('.action:not(:disabled)');
    if (button) {
        button.classList.remove('is-hovered');
        button.classList.add('is-pressed');
        actionTouch = { button, id, x, y };
        playRim(button);
    }
}, { passive: true });

document.addEventListener('pointermove', event => {
    const moved = touch => touch?.id === event.pointerId && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 11;
    if (moved(budgetTouch)) {
        cancelOptics(budgetTouch.card);
        budgetTouch = undefined;
    }
    if (moved(actionTouch)) clearActionTouch(true);
}, { passive: true });

document.addEventListener('pointerup', event => {
    if (budgetTouch?.id === event.pointerId) budgetTouch = undefined;
    if (actionTouch?.id === event.pointerId) {
        actionTouch.id = null;
        actionTouch.timer = setTimeout(clearActionTouch, 170);
    }
}, { passive: true });

for (const type of ['pointercancel', 'lostpointercapture']) {
    document.addEventListener(type, event => {
        if (budgetTouch?.id === event.pointerId) {
            cancelOptics(budgetTouch.card);
            budgetTouch = undefined;
        }
        if (actionTouch?.id === event.pointerId) clearActionTouch(true);
    }, { passive: true });
}

function resetDecorations() {
    clearOptics();
    clearActionTouch(true);
    for (const button of $$('.action')) {
        button.classList.remove('is-hovered');
        stopRim(button);
    }
}
reduced.addEventListener('change', () => {
    resetDecorations();
    observeSummaries();
});
finePointer.addEventListener('change', resetDecorations);
window.addEventListener('blur', resetDecorations);
document.addEventListener('visibilitychange', observeSummaries);

document.addEventListener('click', event => {
    if (desktopDrawer.parentElement.dataset.open === 'manual' && !desktopDrawer.contains(event.target)) {
        setDesktopDrawer(null);
    }
    const link = event.target.closest('.nav-link');
    if (link) {
        navigatePreview(event, link);
        return;
    }
    const control = event.target.closest('[data-command]');
    if (!control || control.disabled) return;
    const workspace = control.closest('[data-workspace]');
    const state = dashboards.get(workspace);
    const { command, region, index } = control.dataset;
    switch (command) {
        case 'toggle-rail':
            setDesktopDrawer(desktopDrawer.parentElement.dataset.open ? null : 'manual', event.detail === 0);
            break;
        case 'open-drawer':
            setMobileDrawer(true);
            break;
        case 'close-drawer':
            setMobileDrawer(false);
            break;
        case 'privacy':
            state.concealed = !state.concealed;
            setPrivacy(workspace);
            break;
        case 'region':
            setRegion(workspace, region);
            break;
        case 'portfolio':
            showPortfolio(region, workspace);
            break;
        case 'dialog-region':
            showPortfolio(region, dialogWorkspace);
            $(`[data-command="dialog-region"][data-region="${region}"]`, dialog).focus();
            break;
        case 'ledger':
            showDialog('Ledger preview', transactionList(state.region), workspace, state.concealed);
            break;
        case 'add':
            showDialog('Add transaction', `<div class="type-options">${['Expense', 'Income', 'Transfer'].map((type, index) =>
                `<button class="quiet" type="button" data-command="sample-transaction" data-type="${type}">${icon(['arrow', 'down', 'transfer'][index])}${type}</button>`).join('')}</div>`, workspace);
            break;
        case 'sample-transaction':
            dialog.close();
            notify(`${control.dataset.type} selected in the sample ledger.`);
            break;
        case 'budget-detail':
            showBudget(workspace, Number(index));
            break;
        case 'replay-budget': {
            const card = control.closest('[data-budget-card]');
            if (event.detail === 0 || runningOptics.get(opticsGroup(card))?.card !== card) {
                cancelOptics(card);
                reflect(card);
            }
            break;
        }
        case 'sample-action':
            notify('Sample action activated.');
            break;
        case 'sign-in':
            $('#login-status').textContent = 'Opening the sample ledger…';
            loginTimer = setTimeout(() => {
                loginTimer = undefined;
                applyActionState();
                $('#login-status').textContent = 'Sample sign-in complete.';
            }, 850);
            applyActionState();
            break;
        case 'password': {
            const field = $('#sample-password');
            const show = field.type === 'password';
            field.type = show ? 'text' : 'password';
            control.innerHTML = icon(show ? 'eyeOff' : 'eye');
            control.setAttribute('aria-pressed', String(show));
            control.setAttribute('aria-label', show ? 'Hide sample password' : 'Show sample password');
            break;
        }
        case 'forgot':
            $('#login-status').textContent = 'Password recovery is simulated in this preview.';
            break;
    }
});

document.addEventListener('change', event => {
    const field = event.target.closest('[data-wallet-theme]');
    if (!field || !Object.hasOwn(wallets, field.value)) return;
    const workspace = field.closest('[data-workspace]');
    const state = dashboards.get(workspace);
    state.themes[state.region] = field.value;
    const card = $('.wallet-card', workspace);
    const previous = [...card.classList].find(name => name.startsWith('wallet-theme-'));
    card.classList.replace(previous, `wallet-theme-${wallets[field.value].theme}`);
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || dialog.open) return;
    if ($('.mobile-drawer', mobile).hasAttribute('data-open')) {
        setMobileDrawer(false);
        return;
    }
    if (desktopDrawer.parentElement.dataset.open) {
        if (desktopDrawer.contains(document.activeElement)) $('[data-command="toggle-rail"]', desktop).focus();
        setDesktopDrawer(null, true);
    }
});

applySettings();
observeSummaries();
applyActionState();
