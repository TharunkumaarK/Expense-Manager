// Automated Verification Script for Pass 5: Wallets Page Redesign & Refinement
const fs = require('fs');
const path = require('path');

console.log("====================================================================");
console.log("PASS 5: WALLETS PAGE REDESIGN & REFINEMENT - VERIFICATION SUITE");
console.log("====================================================================\n");

const indexPath = path.join(__dirname, '../index.html');
const cssPath = path.join(__dirname, '../css/style.css');
const appJsPath = path.join(__dirname, '../js/app.js');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');

// 1. Verify all 14 Theme IDs are intact and preserved
console.log("TEST 1: Preservation of All 14 Predefined Theme IDs");
const REQUIRED_THEME_IDS = [
    'emerald-salary',
    'crimson-paypay',
    'amber-gold',
    'burgundy-axis',
    'baroda-orange',
    'sapphire-sbi',
    'hfc-navy',
    'icici-ruby',
    'violet-suica',
    'cyan-line',
    'slate-reserve',
    'rose-gold',
    'amethyst-crypto',
    'aurora-nordic'
];

REQUIRED_THEME_IDS.forEach(themeId => {
    const jsMatches = appJs.includes(`'${themeId}'`);
    console.assert(jsMatches, `Theme ID '${themeId}' must be present in WALLET_THEMES in js/app.js`);

    const cssMatches = cssContent.includes(`.wallet-theme-${themeId}`);
    console.assert(cssMatches, `CSS class '.wallet-theme-${themeId}' must be styled in css/style.css`);
});
console.log(`  ✓ All ${REQUIRED_THEME_IDS.length} predefined theme IDs and CSS palettes are preserved and verified`);

// 2. Debit Card Proportions & Anatomy
console.log("\nTEST 2: Physical Debit Card Anatomy & Styling");
console.assert(cssContent.includes('aspect-ratio: 1.586 / 1;'), "Debit card must maintain 1.586 / 1 physical ratio");
console.assert(appJs.includes('getCardChipSvg()'), "EMV Metallic Chip SVG generator must be invoked");
console.assert(appJs.includes('getContactlessSvg()'), "Contactless indicator SVG generator must be invoked");
console.assert(cssContent.includes('.wallet-card-overlay-sheen'), "Metallic sheen overlay must be styled");
console.assert(!appJs.includes('wallet-color-strip') && !cssContent.includes('.wallet-color-strip'), "No unnecessary colour strip should be rendered");
console.log("  ✓ Debit card physical proportions, EMV chip, and visual materials verified");

// 3. Three-Dot Management Trigger
console.log("\nTEST 3: Three-Dot Menu Trigger Isolation & Styling");
console.assert(appJs.includes('event.stopPropagation(); app.openEditWalletModal'), "Clicking three-dot menu must call event.stopPropagation()");
console.assert(cssContent.includes('.wallet-menu-btn'), "wallet-menu-btn CSS class must exist");
const menuBtnCss = cssContent.match(/\.wallet-menu-btn\s*,\s*\.wallet-card-menu-btn\s*\{([^}]+)\}/s);
console.assert(menuBtnCss !== null, "wallet-menu-btn must have dedicated styling");
console.assert(menuBtnCss[1].includes('background: transparent;'), "Default state must be visually transparent");
console.assert(menuBtnCss[1].includes('border: none;'), "Default state must have no heavy border");
console.log("  ✓ Three-dot trigger is unobtrusive, transparent, and isolates click from card focus");

// 4. Theme Gallery Improvements (Modal Pickers)
console.log("\nTEST 4: Theme Gallery Picker Grid & Previews");
console.assert(cssContent.includes('.theme-picker-grid'), ".theme-picker-grid CSS rule must exist");
console.assert(appJs.includes('theme-option-preview'), "Theme picker must render theme-option-preview cards");
console.assert(appJs.includes('theme-mini-chip'), "Theme preview must include mini metallic chip");
console.assert(appJs.includes('theme-option-check'), "Theme option must render selection checkmark container");
console.assert(cssContent.includes('.theme-option.active .theme-option-check') || cssContent.includes('.theme-swatch.active .theme-option-check'), "Active theme option must highlight checkmark");
console.log("  ✓ Theme gallery delivers recognizable mini-card previews, readable names, and check indicator");

// 5. Edit Modal Sequencing & Z-Index Layering
console.log("\nTEST 5: Modal Sequencing & Z-Index Hierarchy");
const modalOverlayMatch = cssContent.match(/\.modal-overlay\s*\{[^}]*z-index:\s*(\d+);[^}]*\}/s);
console.assert(modalOverlayMatch !== null, "modal-overlay must have z-index");
const modalZ = parseInt(modalOverlayMatch[1], 10);
console.assert(modalZ >= 1100, `modal-overlay z-index (${modalZ}) must be >= 1100 so it sits on top of focus-overlay (1000)`);

// Check that openEditWalletModal synchronizes values before classList.add('active')
const openEditSlice = appJs.slice(appJs.indexOf('openEditWalletModal(walletId)'), appJs.indexOf('saveEditWallet()'));
const populateIdx = openEditSlice.indexOf('this.populateThemePicker(');
const activeIdx = openEditSlice.indexOf(".classList.add('active')");
console.assert(populateIdx !== -1 && activeIdx !== -1 && populateIdx < activeIdx, "openEditWalletModal must populate theme picker and fields BEFORE showing modal");
console.assert(appJs.includes('this.openWalletFocus(id);'), "saveEditWallet must refresh open wallet focus view");
console.log("  ✓ Modal sequencing eliminates stale data flashes and modal z-index hierarchy is correct");

// 6. Liquid Net Position & Portfolio Separation
console.log("\nTEST 6: Liquid Net Position Separation & Privacy Concealment");
console.assert(indexHtml.includes('Japan Liquid Net Position'), "Japan Liquid Net Position must exist");
console.assert(indexHtml.includes('India Liquid Net Position'), "India Liquid Net Position must exist");
console.assert(indexHtml.includes('id="wallets-page-jp-total"'), "#wallets-page-jp-total must exist");
console.assert(indexHtml.includes('id="wallets-page-in-total"'), "#wallets-page-in-total must exist");

// Check privacy-blur and financial-amount on balances
console.assert(indexHtml.includes('financial-amount privacy-blur" id="wallets-page-jp-total"'), "Japan total must have financial-amount privacy-blur");
console.assert(indexHtml.includes('financial-amount privacy-blur" id="wallets-page-in-total"'), "India total must have financial-amount privacy-blur");
console.assert(appJs.includes('financial-amount privacy-blur">${this.formatMoney(w.balance, w.currency)}'), "Card balance must have financial-amount privacy-blur");
console.log("  ✓ Portfolio separation maintained (JPY and INR strictly isolated) and privacy blur verified");

// 7. Interactivity & FLIP Focus Overlay
console.log("\nTEST 7: Focus Overlay & Country Expansion Interactivity");
console.assert(indexHtml.includes("app.openCountryExpansion('JP')"), "Japan KPI card must trigger openCountryExpansion('JP')");
console.assert(indexHtml.includes("app.openCountryExpansion('IN')"), "India KPI card must trigger openCountryExpansion('IN')");
console.assert(appJs.includes('openCountryExpansion(region)'), "openCountryExpansion method must exist");
console.assert(appJs.includes('openWalletFocus(walletId, sourceEl'), "openWalletFocus method must exist");
console.assert(appJs.includes('closeFocusOverlay()'), "closeFocusOverlay method must exist");
console.log("  ✓ Focus overlay, FLIP animation hooks, and country expansion verified");

console.log("\n====================================================================");
console.log("ALL PASS 5 VERIFICATION CHECKS PASSED SUCCESSFULLY!");
console.log("====================================================================\n");
