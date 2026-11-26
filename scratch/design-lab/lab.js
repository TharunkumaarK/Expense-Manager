'use strict';

const buttons = [
    { id: 'A1', name: 'Stroke to fill', description: 'A quiet fill and a still bronze edge.' },
    { id: 'A2', name: 'Edge catch', description: 'Light briefly catches one part of the rim.' },
    { id: 'A3', name: 'Clockwise lap', description: 'A short highlight follows the rounded rim.' },
];
const surfaces = [
    { id: 'C1', name: 'Satin glass' },
    { id: 'C2', name: 'Frosted glass' },
    { id: 'C3', name: 'Sculpted dark glass' },
];
const atmospheres = [
    { id: 'D1', name: 'Restrained' },
    { id: 'D2', name: 'Balanced' },
    { id: 'D3', name: 'Directional' },
];
const presets = {
    subtle: { fill: 90, travel: 920, length: 20, opacity: 44, edge: .75, intensity: 38 },
    balanced: { fill: 110, travel: 900, length: 29, opacity: 67, edge: 1, intensity: 65 },
    expressive: { fill: 145, travel: 1050, length: 44, opacity: 84, edge: 1.5, intensity: 85 },
};
const labels = { fill: 'ms', travel: 'ms', length: 'px', opacity: '%', edge: 'px', intensity: '%' };
const picks = { button: 'A1', surface: 'C1', atmosphere: 'D2' };
const sections = { button: buttons, surface: surfaces, atmosphere: atmospheres };
let motion = { ...presets.balanced };
let glimmerEnabled = true;
let noticeTimer;

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const icons = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M2 12s3.6-6.2 10-6.2S22 12 22 12s-3.6 6.2-10 6.2S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>',
    filter: '<path d="M4 7h16M7 12h10m-7 5h4"/>',
    menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 3v6m4-6v6"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v3m0 0h2v11H5a2 2 0 0 1-2-2V7m0 1h17m-4 5h1"/>',
    home: '<path d="M3 10 12 3l9 7v10H3Zm6 10v-6h6v6"/>',
    ledger: '<path d="M5 4h14v16H5Zm4 5h6m-6 4h6m-6 4h4"/>',
    budget: '<path d="M3 19h18M6 15v-4m6 4V6m6 9V9"/>',
    up: '<path d="M6 18 18 6M8 6h10v10"/>',
    down: '<path d="M18 6 6 18m0-10v10h10"/>',
    transfer: '<path d="M3 8h17m-4-4 4 4-4 4M21 16H4m4-4-4 4 4 4"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    adjust: '<path d="M4 7h16M4 17h16M9 4v6m6 4v6"/>',
};
// With equal local and CSS dimensions, one SVG unit maps to one CSS pixel.
// The clockwise path begins on the top edge and closes with a tangent join.
const roundRect = 'M84 1.35H159A7.65 7.65 0 0 1 166.65 9V35A7.65 7.65 0 0 1 159 42.65H9A7.65 7.65 0 0 1 1.35 35V9A7.65 7.65 0 0 1 9 1.35Z';
const circle = 'M27 1.35A25.65 25.65 0 1 1 27 52.65A25.65 25.65 0 1 1 27 1.35Z';
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;

function signature({ variant, fab = false, action = 'sample', scope }) {
    const behavior = variant ? `data-variant="${variant}"` : 'data-shared-button';
    const context = scope ? `data-scope="${scope}"` : '';
    return `<button type="button" class="signature${fab ? ' fab' : ''}" ${behavior} data-command="${action}" ${context}
        ${fab ? 'aria-label="Add transaction" ' : ''}${action === 'add' ? 'aria-haspopup="dialog"' : ''}>
        ${icon('plus')}${fab ? '' : '<span>Add transaction</span>'}
        <svg class="edge-light" viewBox="${fab ? '0 0 54 54' : '0 0 168 44'}" aria-hidden="true"><path d="${fab ? circle : roundRect}"/></svg>
    </button>`;
}

function utility(command, name, glyph, extra = '') {
    return `<button type="button" class="utility icon-only ${extra}" data-command="${command}" aria-label="${name}" title="${name}">${icon(glyph)}</button>`;
}

function standard(type, extra = '') {
    const name = type[0].toUpperCase() + type.slice(1);
    const glyph = { expense: 'up', income: 'down', transfer: 'transfer' }[type];
    return `<button type="button" class="standard ${type}" data-command="${type}" ${extra}>${icon(glyph)}${name}</button>`;
}

function accountSummary(surface, shared = '') {
    return `<article class="glass" data-surface="${surface}" ${shared}>
        <div class="glass-title"><h3>Monthly cash flow</h3>${icon('wallet')}</div>
        <p class="balance">¥61,200</p>
        <div class="split-numbers">
            <p><span class="meta">Income</span><span class="income">+¥320,000</span></p>
            <p><span class="meta">Outflows</span><span class="expense">−¥258,800</span></p>
        </div>
    </article>`;
}

const budgetCases = [
    { status: 'safe', caption: 'On track', spent: '¥12,000', limit: '¥30,000', used: 40 },
    { status: 'warn', caption: 'Near limit', spent: '¥25,500', limit: '¥30,000', used: 85 },
    { status: 'over', caption: 'Over limit', spent: '¥34,200', limit: '¥30,000', used: 114 },
];
function budgetCard({ status, caption, spent, limit, used }, surface, heading = 'Food & groceries') {
    return `<article class="glass budget-card ${status}" data-shared-surface data-surface="${surface}">
        <div class="glass-title"><h3>${heading}</h3><span class="meta utilization">${caption}</span></div>
        <p class="meta"><span class="amount">${spent}</span> of <span class="amount">${limit}</span></p>
        <div class="budget-track" role="progressbar" aria-label="${heading} · ${caption}" aria-valuenow="${Math.min(used, 100)}"
            aria-valuemin="0" aria-valuemax="100" aria-valuetext="${used}% used"><span class="budget-fill" style="--usage: ${used}%"></span></div>
        <p class="meta utilization">${used}% used</p>
    </article>`;
}

function optionCards(key) {
    return sections[key].map(({ id, name }) => {
        const isSurface = key === 'surface';
        return `<div class="sample">
            <div class="sample-room atmosphere" data-atmosphere="${isSurface ? picks.atmosphere : id}" ${isSurface ? 'data-shared-atmosphere' : ''}>
                ${accountSummary(isSurface ? id : picks.surface, isSurface ? '' : 'data-shared-surface')}
            </div>
            <div class="sample-choice">
                <label><input name="${key}-choice" type="radio" value="${id}" data-select="${key}" ${id === picks[key] ? 'checked' : ''}><span class="variant-id">${id}</span> ${name}</label>
            </div>
        </div>`;
    }).join('');
}

function settings(scope) {
    const names = { button: 'Signature action', surface: 'Glass surface', atmosphere: 'Atmosphere' };
    return Object.entries(sections).map(([key, values]) =>
        `<label for="${scope}-${key}">${names[key]}
            <select id="${scope}-${key}" data-select="${key}">
                ${values.map(({ id, name }) => `<option ${id === picks[key] ? 'selected' : ''} value="${id}">${id} · ${name}</option>`).join('')}
            </select>
        </label>`
    ).join('');
}

function dashboard(scope, mobile) {
    const rail = [
        { id: 'overview', name: 'Overview', glyph: 'home' },
        { id: 'wallets', name: 'Wallets', glyph: 'wallet' },
        { id: 'budgets', name: 'Budgets', glyph: 'budget' },
        { id: 'transactions', name: 'Transactions', glyph: 'ledger' },
    ];
    const kpis = [
        { name: 'Income', amount: '+¥320,000', type: 'income' },
        { name: 'Outflows', amount: '−¥258,800', type: 'expense' },
        { name: 'Net savings', amount: '¥61,200', type: 'net' },
    ];
    return `<div class="${mobile ? 'mobile-preview' : 'desktop-preview'}">
        <div class="dashboard atmosphere" data-dashboard data-shared-atmosphere data-atmosphere="${picks.atmosphere}">
            ${mobile ? '' : `<aside class="dash-rail">
                <button class="utility icon-only" type="button" data-command="rail" aria-label="Toggle sidebar" aria-controls="${scope}-nav" aria-expanded="false">${icon('menu')}</button>
                <nav id="${scope}-nav" aria-label="Dashboard sections">${rail.map(({ id, name, glyph }, index) =>
                    `<a class="utility rail-link" href="#${scope}-${id}" ${index === 0 ? 'aria-current="true"' : ''}>${icon(glyph)}<span>${name}</span></a>`).join('')}</nav>
            </aside>`}
            <div class="dash-content">
                <header class="dash-toolbar">
                    <div><h3>Dashboard</h3><p class="meta">November 2026</p></div>
                    <div class="action-row">
                        ${utility('privacy', 'Hide amounts', 'eye')}
                        ${utility('filter', 'Show expenses only', 'filter')}
                        ${mobile ? '' : signature({ action: 'add', scope })}
                    </div>
                </header>
                <div class="dash-body">
                    <div class="dash-kpis" id="${scope}-overview" tabindex="-1">${kpis.map(({ name, amount, type }) =>
                        `<article class="glass" data-shared-surface data-surface="${picks.surface}"><p class="meta">${name}</p><p class="balance amount ${type}">${amount}</p></article>`).join('')}</div>
                    <div class="dash-duo" id="${scope}-wallets" tabindex="-1">
                        <article class="wallet wallet-em" data-wallet>
                            <div class="glass-title"><h3 data-wallet-name>Emerald Salary</h3>${utility('wallet', 'Switch wallet theme', 'more')}</div>
                            <p class="meta">Current balance</p><p class="balance amount" data-wallet-balance>¥482,600</p>
                        </article>
                        <article class="country country-jp" data-country>
                            <button class="country-control" type="button" data-command="country" aria-label="Show India balances">
                                <span class="flag" aria-hidden="true">🇯🇵</span><span data-country-name>Japan</span>${icon('chevron')}
                            </button>
                            <p class="meta">Total balances</p><p class="balance amount" data-country-balance>¥618,200</p>
                        </article>
                    </div>
                    <div class="dash-lower">
                        <div id="${scope}-budgets" tabindex="-1">${budgetCard(budgetCases[1], picks.surface)}</div>
                        <article class="glass transactions" id="${scope}-transactions" tabindex="-1" data-shared-surface data-surface="${picks.surface}">
                            <div class="glass-title"><h3>Recent transactions</h3></div>
                            <ul>
                                <li class="tx" data-expense><div>Food &amp; groceries<span class="meta">Japan · Nov 25</span></div><span class="amount expense">−¥3,200</span></li>
                                <li class="tx"><div>Monthly salary<span class="meta">Japan · Nov 24</span></div><span class="amount income">+¥320,000</span></li>
                                <li class="tx"><div>Wallet transfer<span class="meta">Japan · Nov 23</span></div><span class="amount transfer">¥15,000</span></li>
                            </ul>
                        </article>
                    </div>
                </div>
            </div>
            ${mobile ? `<div class="phone-actions">${signature({ fab: true, action: 'add', scope })}</div>` : ''}
        </div>
    </div>`;
}

$('#button-samples').innerHTML = buttons.map(({ id, name, description }) =>
    `<div class="variant-row"><div><h3 class="variant-name"><span class="variant-id">${id}</span>${name}</h3><p>${description}</p></div>${signature({ variant: id })}</div>`
).join('');

$('#toolbar-demo').innerHTML = `
    <div class="level"><h3>Level 1 · Signature</h3><div class="action-row">${signature({ action: 'add' })}</div></div>
    <div class="level"><h3>Level 2 · Standard</h3><div class="action-row">${['expense', 'income', 'transfer'].map(type => standard(type)).join('')}</div></div>
    <div class="level"><h3>Level 3 · Utility</h3><div class="action-row">
        ${utility('privacy', 'Hide amounts', 'eye')}
        ${utility('filter', 'Show expenses only', 'filter')}
        ${utility('wallet', 'Switch wallet theme', 'more')}
        ${utility('sheen', 'Toggle budget sheen', 'adjust')}
        ${utility('delete', 'Remove sample transaction', 'trash', 'danger')}
    </div></div>`;

$('#press-demo').innerHTML = `<div class="press-samples">${buttons.map(({ id }) =>
    `<div><span class="variant-id">${id}</span>${signature({ variant: id })}</div>`).join('')}</div>
    <div>${signature({ fab: true, action: 'add', scope: 'press' })}</div>`;

$('#glass-samples').innerHTML = optionCards('surface');
$('#background-samples').innerHTML = optionCards('atmosphere');
$('#budget-samples').innerHTML = budgetCases.map(item => budgetCard(item, picks.surface)).join('');
$('#desktop-settings').innerHTML = settings('desktop');
$('#mobile-settings').innerHTML = settings('mobile');
$('#desktop-preview').innerHTML = dashboard('wide', false);
$('#mobile-preview').innerHTML = dashboard('phone', true);
$('#dialog-actions').innerHTML = ['expense', 'income', 'transfer'].map(type => standard(type, 'data-dialog-choice')).join('');

function updatePicks() {
    for (const [key, value] of Object.entries(picks)) {
        for (const input of $$('[data-select]')) {
            if (input.dataset.select !== key) continue;
            if (input.type === 'radio') input.checked = input.value === value;
            else input.value = value;
        }
        for (const element of $$(`[data-shared-${key}]`)) element.dataset[key === 'button' ? 'variant' : key] = value;
    }
    $('.budget-stage').dataset.atmosphere = picks.atmosphere;
    $('#press-demo').dataset.atmosphere = picks.atmosphere;
    $('#glass-context').textContent = `Atmosphere ${picks.atmosphere} · ${atmospheres.find(item => item.id === picks.atmosphere).name}`;
    $('#background-context').textContent = `Surface ${picks.surface} · ${surfaces.find(item => item.id === picks.surface).name}`;
}
updatePicks();

function updateMotion(presetName) {
    document.documentElement.style.setProperty('--fill-time', `${motion.fill}ms`);
    document.documentElement.style.setProperty('--stroke', `${motion.edge}px`);
    document.documentElement.style.setProperty('--glimmer-strength', `${motion.intensity}%`);
    for (const [key, unit] of Object.entries(labels)) {
        $(`#${key}`).value = motion[key];
        $(`#${key}-value`).value = `${motion[key]}${unit}`;
    }
    for (const button of $$('[data-preset]')) button.setAttribute('aria-pressed', String(button.dataset.preset === presetName));
    $('#glimmer').checked = glimmerEnabled;
}
updateMotion('balanced');

const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const feedback = new WeakMap();
function stopLight(button) {
    feedback.get(button).effect?.cancel();
}
function stopLights() {
    for (const button of $$('.signature')) stopLight(button);
}

$('#motion-controls').addEventListener('input', event => {
    const { id, value, checked } = event.target;
    if (id === 'glimmer') glimmerEnabled = checked;
    else if (id in labels) motion[id] = Number(value);
    updateMotion();
    stopLights();
});
function setPreset(name) {
    motion = { ...presets[name] };
    glimmerEnabled = true;
    updateMotion(name);
    stopLights();
}
$('#motion-controls').addEventListener('click', event => {
    const preset = event.target.closest('[data-preset]');
    if (preset) setPreset(preset.dataset.preset);
});
$('#motion-controls').addEventListener('reset', event => {
    event.preventDefault();
    setPreset('balanced');
});

function playLight(button) {
    const { variant } = button.dataset;
    if (!glimmerEnabled || reduced.matches || variant === 'A1' || button.disabled) return;
    const state = feedback.get(button);
    const { path, perimeter } = state;
    stopLight(button);
    const opacity = motion.opacity / 100;
    const length = Math.min(motion.length * (variant === 'A2' ? .76 : 1), perimeter * .24);
    path.style.strokeDasharray = `${length} ${perimeter - length}`;
    if (variant === 'A2') {
        path.style.strokeDashoffset = `-${perimeter * .87}`;
        state.effect = path.animate([{ opacity: 0 }, { opacity: opacity * .72, offset: .24 }, { opacity: 0 }],
            { duration: Math.min(360, motion.travel * .36), easing: 'linear' });
        return;
    }
    // This property follows the rendered SVG arc length. The opacity envelope is independent.
    state.effect = path.animate([
        { strokeDashoffset: 0, opacity: 0 },
        { strokeDashoffset: -perimeter * .08, opacity, offset: .08 },
        { strokeDashoffset: -perimeter * .92, opacity, offset: .92 },
        { strokeDashoffset: -perimeter, opacity: 0 },
    ], { duration: motion.travel, easing: 'linear' });
}

function clearPress(button, cancelLight = false) {
    const state = feedback.get(button);
    clearTimeout(state.timer);
    state.pointer = undefined;
    button.classList.remove('is-pressed');
    if (cancelLight) stopLight(button);
}
function releaseSoon(button) {
    const state = feedback.get(button);
    state.pointer = undefined;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => clearPress(button), 170);
}

for (const button of $$('.signature')) {
    const path = $('.edge-light path', button);
    feedback.set(button, { path, perimeter: path.getTotalLength() });
    button.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'mouse' || !finePointer.matches || button.disabled) return;
        button.classList.add('is-hovered');
        playLight(button);
    });
    button.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse') button.classList.remove('is-hovered');
    });
    button.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.pointerType === 'mouse' || button.disabled) return;
        clearPress(button);
        button.classList.remove('is-hovered');
        button.classList.add('is-pressed');
        feedback.get(button).pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        playLight(button);
    }, { passive: true });
    button.addEventListener('pointermove', event => {
        const pointer = feedback.get(button).pointer;
        if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12) {
            clearPress(button, true);
        }
    }, { passive: true });
    button.addEventListener('pointerup', event => {
        if (feedback.get(button).pointer?.id === event.pointerId) releaseSoon(button);
    }, { passive: true });
    button.addEventListener('pointercancel', () => clearPress(button, true), { passive: true });
    button.addEventListener('lostpointercapture', event => {
        if (feedback.get(button).pointer?.id === event.pointerId) clearPress(button, true);
    }, { passive: true });
    button.addEventListener('click', event => {
        if (event.detail !== 0) return;
        button.classList.add('is-pressed');
        releaseSoon(button);
    });
}
finePointer.addEventListener('change', () => {
    if (!finePointer.matches) for (const button of $$('.is-hovered')) button.classList.remove('is-hovered');
});
reduced.addEventListener('change', stopLights);

$('main').addEventListener('change', event => {
    const key = event.target.dataset.select;
    if (!key) return;
    picks[key] = event.target.value;
    updatePicks();
    if (key === 'button') stopLights();
});

function notify(message) {
    const notice = $('#notice');
    clearTimeout(noticeTimer);
    notice.textContent = message;
    noticeTimer = setTimeout(() => { notice.textContent = ''; }, 2200);
}
let enabledSheen = false;
function updateSheen(checked) {
    enabledSheen = checked;
    $('#sheen').checked = checked;
    $('[data-command="sheen"]').setAttribute('aria-pressed', String(checked));
    document.body.classList.toggle('sheen-on', checked);
}
updateSheen(false);
$('#sheen').addEventListener('change', event => updateSheen(event.target.checked));

const dialog = $('#action-dialog');
dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
});

function refreshRows(dash) {
    for (const row of $$('.tx', dash)) row.hidden = row.dataset.removed === 'true' || (dash.classList.contains('expenses-only') && !row.hasAttribute('data-expense'));
}
function toggleUtility(button, state, on, off) {
    button.setAttribute('aria-pressed', String(state));
    const label = state ? on : off;
    button.setAttribute('aria-label', label);
    button.title = label;
}

document.body.addEventListener('click', event => {
    const button = event.target.closest('[data-command]');
    if (!button) return;
    const { command, variant } = button.dataset;
    const dash = button.closest('[data-dashboard]') || $('#desktop-preview [data-dashboard]');
    switch (command) {
        case 'sample':
            notify(`${variant} · Add transaction pressed`);
            break;
        case 'add':
            dialog.showModal();
            break;
        case 'income':
        case 'expense':
        case 'transfer':
            if (button.hasAttribute('data-dialog-choice')) dialog.close();
            notify(`Selected ${command}`);
            break;
        case 'privacy': {
            const hidden = dash.classList.toggle('is-private');
            for (const item of $$('.amount', dash)) item.setAttribute('aria-hidden', String(hidden));
            for (const control of $$('[data-command="privacy"]')) {
                if ((control.closest('[data-dashboard]') || $('#desktop-preview [data-dashboard]')) === dash) {
                    toggleUtility(control, hidden, 'Show amounts', 'Hide amounts');
                }
            }
            notify(hidden ? 'Sample amounts hidden' : 'Sample amounts shown');
            break;
        }
        case 'filter': {
            const filtered = dash.classList.toggle('expenses-only');
            refreshRows(dash);
            for (const control of $$('[data-command="filter"]')) {
                if ((control.closest('[data-dashboard]') || $('#desktop-preview [data-dashboard]')) === dash) {
                    toggleUtility(control, filtered, 'Show all transactions', 'Show expenses only');
                }
            }
            notify(filtered ? 'Showing expenses only' : 'Showing all sample transactions');
            break;
        }
        case 'wallet': {
            const wallet = $('[data-wallet]', dash);
            const india = wallet.classList.toggle('wallet-axis');
            wallet.classList.toggle('wallet-em', !india);
            $('[data-wallet-name]', wallet).textContent = india ? 'Burgundy Axis' : 'Emerald Salary';
            $('[data-wallet-balance]', wallet).textContent = india ? '₹72,540' : '¥482,600';
            notify(india ? 'Burgundy Axis wallet theme' : 'Emerald Salary wallet theme');
            break;
        }
        case 'country': {
            const country = button.closest('[data-country]');
            const india = country.classList.toggle('country-in');
            country.classList.toggle('country-jp', !india);
            $('[data-country-name]', country).textContent = india ? 'India' : 'Japan';
            $('[data-country-balance]', country).textContent = india ? '₹98,420' : '¥618,200';
            $('.flag', country).textContent = india ? '🇮🇳' : '🇯🇵';
            button.setAttribute('aria-label', india ? 'Show Japan balances' : 'Show India balances');
            break;
        }
        case 'sheen':
            updateSheen(!enabledSheen);
            notify(enabledSheen ? 'Budget sheen enabled' : 'Static budget illumination');
            break;
        case 'delete': {
            const row = $('.tx:last-child', dash);
            const removed = row.dataset.removed !== 'true';
            row.dataset.removed = String(removed);
            refreshRows(dash);
            toggleUtility(button, removed, 'Restore sample transaction', 'Remove sample transaction');
            notify(removed ? 'Sample transfer removed' : 'Sample transfer restored');
            break;
        }
        case 'rail': {
            const open = button.closest('.dash-rail').classList.toggle('rail-open');
            button.setAttribute('aria-expanded', String(open));
            break;
        }
    }
});

$('.dash-rail nav').addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    for (const item of $$('.rail-link')) item.removeAttribute('aria-current');
    link.setAttribute('aria-current', 'true');
});
