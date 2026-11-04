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

let failedTests = 0;
function testAssert(condition, message) {
    if (!condition) {
        console.error(`  ✗ FAIL: ${message}`);
        failedTests++;
    } else {
        console.log(`  ✓ ${message}`);
    }
}

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
    testAssert(jsMatches, `Theme ID '${themeId}' must be present in WALLET_THEMES in js/app.js`);

    const cssMatches = cssContent.includes(`.wallet-theme-${themeId}`);
    testAssert(cssMatches, `CSS class '.wallet-theme-${themeId}' must be styled in css/style.css`);
});

// 2. Horizontal Header Toolbar Redesign
console.log("\nTEST 2: Horizontal Header Toolbar Redesign");
testAssert(indexHtml.includes('class="wallets-toolbar-header"'), "index.html has wallets-toolbar-header");
testAssert(indexHtml.includes('class="wallets-toolbar-actions"'), "index.html has wallets-toolbar-actions");
testAssert(indexHtml.includes('onclick="app.openAddWalletModal()"'), "Add Wallet button present in toolbar actions");
testAssert(indexHtml.includes("app.openTransactionModal('transfer')"), "Transfer button present in toolbar actions");
testAssert(indexHtml.includes("app.openTransactionModal('remittance')"), "Remittance button present in toolbar actions");
testAssert(cssContent.includes('.wallets-toolbar-actions'), ".wallets-toolbar-actions CSS exists");
testAssert(cssContent.includes('.wallets-toolbar-actions .btn'), ".wallets-toolbar-actions .btn has width: auto !important rule");

// 3. Simplified Wallet Cards (No redundant badges/flags)
console.log("\nTEST 3: Simplified Wallet Cards Layout & Anatomy");
testAssert(cssContent.includes('aspect-ratio: 1.586 / 1;'), "Debit card maintains 1.586 / 1 physical ratio");
testAssert(appJs.includes('getCardChipSvg()'), "EMV Metallic Chip SVG generator invoked");
testAssert(appJs.includes('getContactlessSvg()'), "Contactless wave SVG generator invoked");
testAssert(cssContent.includes('.wallet-card-overlay-sheen'), "Metallic sheen overlay styled");
testAssert(!appJs.includes('wallet-color-strip') && !cssContent.includes('.wallet-color-strip'), "No redundant color strip rendered");
testAssert(!appJs.includes('wallet-card-flag') && !appJs.includes('wallet-type-badge') && !appJs.includes('wallet-theme-tag'), "Wallet card excludes redundant flag, type badge, and theme tag");
testAssert(appJs.includes('Current Balance'), "Understated Current Balance label present");
testAssert(appJs.includes('class="wallet-name"'), "Wallet name element present");
testAssert(appJs.includes('wallet-card-secondary'), "Secondary wallet class applied to credit cards");

// 4. Three-Dot Management Trigger
console.log("\nTEST 4: Three-Dot Menu Trigger Isolation & Styling");
testAssert(appJs.includes('event.stopPropagation(); app.openEditWalletModal'), "Clicking three-dot menu calls event.stopPropagation()");
testAssert(cssContent.includes('.wallet-menu-btn'), "wallet-menu-btn CSS class exists");
const menuBtnCss = cssContent.match(/\.wallet-menu-btn\s*,\s*\.wallet-card-menu-btn\s*\{([^}]+)\}/s);
testAssert(menuBtnCss !== null, "wallet-menu-btn has dedicated styling");
testAssert(menuBtnCss[1].includes('background: transparent;'), "Default state is visually transparent");
testAssert(menuBtnCss[1].includes('border: none;'), "Default state has no heavy border");

// 5. Redesigned Add/Edit Wallet Configuration & 3-Column Theme Selector
console.log("\nTEST 5: Modal Configuration Sections & 3-Column Theme Grid");
testAssert(indexHtml.includes('Section A: Wallet Details'), "Section A Wallet Details present");
testAssert(indexHtml.includes('Section B: Card Appearance'), "Section B Card Appearance present");
testAssert(indexHtml.includes('class="wallet-config-actions'), "Section C wallet-config-actions present with distinct styling");
testAssert(cssContent.includes('.theme-picker-grid') && cssContent.includes('repeat(3, 1fr)'), "3-column responsive theme grid class exists with repeat(3, 1fr)");
testAssert(appJs.includes('theme-tile-preview'), "Theme tile preview rendered");
testAssert(appJs.includes('theme-mini-chip'), "Theme preview includes mini chip");
testAssert(appJs.includes('theme-tile-check'), "Theme tile includes check indicator");
testAssert(appJs.includes('theme-tag-frequent'), "Frequent theme badges rendered for user's primary methods");
testAssert(cssContent.includes('.theme-tile.selected'), "Selected theme has visual focus / ring styling");

// 6. User Payment Methods Sorting & Prioritization
console.log("\nTEST 6: Payment Methods Prioritization");
testAssert(appJs.includes('getWalletSortRank'), "Wallet sorting logic getWalletSortRank exists");
testAssert(appJs.includes('isSecondaryWallet'), "isSecondaryWallet check exists");

// 7. Modal Sequencing & Z-Index Layering
console.log("\nTEST 7: Modal Sequencing & Z-Index Hierarchy");
const modalOverlayMatch = cssContent.match(/\.modal-overlay\s*\{[^}]*z-index:\s*(\d+);[^}]*\}/s);
testAssert(modalOverlayMatch !== null, "modal-overlay has z-index");
const modalZ = parseInt(modalOverlayMatch[1], 10);
testAssert(modalZ >= 1100, `modal-overlay z-index (${modalZ}) is >= 1100`);

// 8. Liquid Net Position & Portfolio Separation
console.log("\nTEST 8: Liquid Net Position Separation & Privacy Concealment");
testAssert(indexHtml.includes('Japan Liquid Net Position'), "Japan Liquid Net Position exists");
testAssert(indexHtml.includes('India Liquid Net Position'), "India Liquid Net Position exists");
testAssert(indexHtml.includes('financial-amount privacy-blur" id="wallets-page-jp-total"'), "Japan total has financial-amount privacy-blur");
testAssert(indexHtml.includes('financial-amount privacy-blur" id="wallets-page-in-total"'), "India total has financial-amount privacy-blur");
testAssert(appJs.includes('financial-amount privacy-blur">${this.formatMoney(w.balance, w.currency)}'), "Card balance has financial-amount privacy-blur");

// 9. Interactivity & FLIP Focus Overlay
console.log("\nTEST 9: Focus Overlay & Country Expansion Interactivity");
testAssert(indexHtml.includes("app.openCountryExpansion('JP')"), "Japan KPI card triggers openCountryExpansion('JP')");
testAssert(indexHtml.includes("app.openCountryExpansion('IN')"), "India KPI card triggers openCountryExpansion('IN')");
testAssert(appJs.includes('openCountryExpansion(region)'), "openCountryExpansion method exists");
testAssert(appJs.includes('openWalletFocus(walletId, sourceEl'), "openWalletFocus method exists");
testAssert(appJs.includes('closeFocusOverlay()'), "closeFocusOverlay method exists");

console.log("\n====================================================================");
if (failedTests === 0) {
    console.log("ALL PASS 5 VERIFICATION CHECKS PASSED SUCCESSFULLY! (0 failures)");
} else {
    console.error(`VERIFICATION FAILED WITH ${failedTests} FAILURE(S)`);
    process.exit(1);
}
console.log("====================================================================\n");
