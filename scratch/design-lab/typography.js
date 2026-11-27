'use strict';

const typeSelector = document.querySelector('#type-treatment');
const typeKey = 'expense-manager-typography-4c2t';
const typeRoot = document.documentElement;
const typeCanvas = document.querySelector('#type-canvas');
const typeSpec = document.querySelector('#type-spec');
const typeFigures = document.querySelector('#type-figures');
const typeRoles = [
    ['Brand display', '.auth-brand-name'],
    ['Page title', '.toolbar-start h3'],
    ['Editorial section', '[data-type-role="editorial-section"]'],
    ['Functional panel heading', '[data-type-role="panel-heading"]'],
    ['Hero financial balance', '.country .amount'],
    ['Primary KPI', '.kpi .amount'],
    ['Overall budget amount', '.summary-tally strong'],
    ['Category budget amount', '.budget-amounts strong'],
    ['Donut total', '.donut-center .amount'],
    ['Wallet balance', '.wallet-card .amount'],
    ['Login welcome', '#auth-title'],
    ['Login introduction', '.auth-headline'],
    ['Illustrative account balance', '.auth-showcase .amount'],
    ['Functional heading', '.budget-head h4'],
    ['Standard UI text', 'html'],
    ['Button', '.dash-toolbar .action'],
    ['Input', '.auth-form input'],
    ['Ledger amount', '.transaction-list li > :last-child'],
    ['Supporting label', '.kpi .label'],
    ['Metadata', '.tx-subtitle'],
    ['Chart text', '.chart-legend li'],
];

typeFigures.innerHTML = '<p class="specimen-head">Editorial figure</p><p class="specimen-head">Aligned interface figure</p>';
for (const value of ['¥0', '¥350,000', '¥12,345,678', '₹85,000', '₹12,34,567.89', '€1,234.56', '€12,450',
    '−¥128,450', '−₹25,000', '+¥150,000', '100%', '125.8%', '******']) {
    const editorial = document.createElement('p');
    editorial.className = 'specimen-figure specimen-editorial';
    editorial.textContent = value;
    const ledger = document.createElement('p');
    ledger.className = 'specimen-figure specimen-ledger';
    ledger.textContent = value;
    typeFigures.append(editorial, ledger);
}

function drawTypeCanvas() {
    const { width, height } = typeCanvas.getBoundingClientRect();
    if (!width || !height) return;
    const pixelRatio = window.devicePixelRatio;
    typeCanvas.width = Math.round(width * pixelRatio);
    typeCanvas.height = Math.round(height * pixelRatio);
    const context = typeCanvas.getContext('2d');
    const style = getComputedStyle(typeCanvas);
    context.scale(pixelRatio, pixelRatio);
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.fontKerning = 'normal';
    context.textBaseline = 'middle';
    context.fillStyle = style.color;
    context.fillText('Groceries', 0, height * .33);
    context.fillText('¥350,000', 0, height * .72);
}

function writeTypeSpec() {
    const desktop = document.querySelector('#desktop-preview');
    const mobile = document.querySelector('#mobile-preview');
    const lines = [typeSelector.selectedOptions[0].textContent, 'Rendered type at current preview widths'];
    for (const [role, selector] of typeRoles) {
        const visibleTarget = desktop.querySelector(selector) ?? document.querySelector(selector);
        const mobileTarget = mobile.querySelector(selector);
        const describe = node => {
            const style = getComputedStyle(node);
            return `${style.fontFamily} | ${style.fontSize} @ ${style.fontWeight} | line ${style.lineHeight} | tracking ${style.letterSpacing}`;
        };
        const desktopSpec = describe(visibleTarget);
        const mobileSpec = mobileTarget ? describe(mobileTarget) : desktopSpec;
        lines.push(`${role}: ${desktopSpec}${mobileSpec !== desktopSpec ? `\n  Mobile: ${mobileSpec}` : ''}`);
    }
    typeSpec.value = lines.join('\n');
}

function setTypeTreatment(choice) {
    typeRoot.dataset.type = ['baseline', 't2', 't3'].includes(choice) ? choice : 't3';
    typeSelector.value = typeRoot.dataset.type;
    // Reading layout here ensures the active face is requested before waiting to draw.
    drawTypeCanvas();
    document.fonts.ready.then(drawTypeCanvas);
    if (document.querySelector('#type-details').open) writeTypeSpec();
}

setTypeTreatment(typeRoot.dataset.type);

typeSelector.addEventListener('change', () => {
    setTypeTreatment(typeSelector.value);
    try { localStorage.setItem(typeKey, typeSelector.value); } catch {}
});
document.querySelector('#type-details').addEventListener('toggle', event => {
    if (event.target.open) writeTypeSpec();
});
document.querySelector('#copy-type').addEventListener('click', async () => {
    writeTypeSpec();
    try {
        await navigator.clipboard.writeText(typeSpec.value);
        notify('Typography specification copied.');
    } catch {
        document.querySelector('#type-details').open = true;
        typeSpec.focus();
        typeSpec.select();
        notify('Typography specification selected. Copy it to share.');
    }
});
if ('ResizeObserver' in window) new ResizeObserver(drawTypeCanvas).observe(typeCanvas);
document.fonts.addEventListener('loadingdone', drawTypeCanvas);
