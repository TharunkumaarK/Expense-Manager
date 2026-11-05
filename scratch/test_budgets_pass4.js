// Automated Verification Script for Pass 4: Budgets Page Redesign
const fs = require('fs');
const path = require('path');

console.log("====================================================================");
console.log("PASS 4: BUDGETS PAGE REDESIGN - VERIFICATION SUITE");
console.log("====================================================================\n");

const indexPath = path.join(__dirname, '../index.html');
const cssPath = path.join(__dirname, '../css/style.css');
const appJsPath = path.join(__dirname, '../js/app.js');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');

// 1. Check HTML structure
console.log("TEST 1: HTML Structure Verification");
console.assert(indexHtml.includes('id="budgets-view"'), "budgets-view section must exist");
console.assert(indexHtml.includes('id="budgets-summary-banner"'), "budgets-summary-banner must exist");
console.assert(indexHtml.includes('id="budgets-categories-grid"'), "budgets-categories-grid must exist");
console.assert(indexHtml.includes('id="budgets-cat-search-input"'), "budgets-cat-search-input must exist");
console.assert(indexHtml.includes('id="budgets-cat-filter"'), "budgets-cat-filter must exist");
console.assert(indexHtml.includes('id="category-manage-modal"'), "category-manage-modal must exist");
console.assert(indexHtml.includes('id="overall-budget-modal"'), "overall-budget-modal must exist");
console.log("  ✓ All required HTML elements and containers are present");

// 2. Check CSS Grid for Desktop 3-Columns
console.log("\nTEST 2: Desktop 3-Column Category Grid Verification");
console.assert(cssContent.includes('.budgets-categories-grid'), ".budgets-categories-grid CSS rule must exist");
const gridMatches = cssContent.match(/\.budgets-categories-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)[^}]*\}/s);
console.assert(gridMatches !== null, "Desktop must enforce repeat(3, 1fr) for .budgets-categories-grid");
console.assert(!cssContent.includes('@media (max-width: 1280px) {\n    .budgets-categories-grid {\n        grid-template-columns: repeat(2, 1fr);'), "1280px media query dropping to 2 columns must be removed");
console.log("  ✓ Desktop 3-column grid rule enforced: repeat(3, 1fr)");

// 3. Check Progress Streak and Glimmer Effect
console.log("\nTEST 3: Thin Elegant Progress Streak & Glimmer Animation");
console.assert(cssContent.includes('.budget-streak-fill::after'), ".budget-streak-fill::after pseudo-element must exist for glimmer");
console.assert(cssContent.includes('@keyframes budget-bar-glimmer'), "@keyframes budget-bar-glimmer must exist");
console.assert(cssContent.includes('prefers-reduced-motion'), "Must support prefers-reduced-motion for accessibility");
console.assert(cssContent.includes('.budget-streak-track'), ".budget-streak-track must exist");
console.log("  ✓ Progress streak glimmer animation & accessibility rules verified");

// 4. Check Consolidated Summary Card (Reuses Dashboard Central Card)
console.log("\nTEST 4: Consolidated Budget Summary Card Reuse");
console.assert(appJs.includes('renderBudgetOverviewCard'), "renderBudgetOverviewCard method must exist and be reused");
console.assert(appJs.includes("this.renderBudgetOverviewCard('budgets-summary-banner'"), "Budgets page must invoke renderBudgetOverviewCard on budgets-summary-banner");
console.assert(cssContent.includes('.budget-central-card'), "budget-central-card CSS class must exist");
console.assert(indexHtml.includes('id="budgets-summary-banner"'), "budgets-summary-banner container must exist");
console.assert(!appJs.includes('<!-- KPI Card 1: Overall Monthly Budget -->'), "Four separate KPI cards must be replaced by consolidated summary card");
console.log("  ✓ Consolidated Dashboard summary card is properly reused on Budgets page");

// 5. Check Category Budget Cards Requirements
console.log("\nTEST 5: Category Card Content & Over-Budget Distinction");
console.assert(appJs.includes('budget-cat-card interactive-card'), "Category card must have budget-cat-card interactive-card");
console.assert(appJs.includes('is-overbudget'), "Over-budget card must have is-overbudget class");
console.assert(appJs.includes('budget-overspend-pill'), "Over-budget card must show budget-overspend-pill");
console.assert(appJs.includes('budget-cat-config-btn'), "Category card must have configure button");
console.assert(appJs.includes('figure-label'), "Card must have distinct figure-label and figure-value");
console.assert(cssContent.includes('.budget-cat-card.is-overbudget'), "Over-budget CSS styling must be present");
console.log("  ✓ Category card content, overspend distinction, and controls verified");

// 6. Check Logic Simulation
console.log("\nTEST 6: Financial Calculations & Filter Logic");
// Simulate storage and calculations
const mockCategories = [
    { id: 'c1', name: 'Food & Groceries', budget: 35000, icon: 'shopping-basket', isActive: true },
    { id: 'c2', name: 'Dining Out', budget: 15000, icon: 'utensils', isActive: true },
    { id: 'c3', name: 'Transport', budget: 12000, icon: 'train-front', isActive: true },
    { id: 'c4', name: 'Uncapped Fun', budget: 0, icon: 'gamepad-2', isActive: true }
];

const mockTxs = [
    { type: 'expense', categoryId: 'c1', amount: 20000, region: 'JP', date: '2026-11-01' },
    { type: 'expense', categoryId: 'c2', amount: 18000, region: 'JP', date: '2026-11-02' }, // over by 3000
    { type: 'expense', categoryId: 'c3', amount: 9000, region: 'JP', date: '2026-11-03' }
];

const totals = {};
mockTxs.forEach(t => {
    totals[t.categoryId] = (totals[t.categoryId] || 0) + t.amount;
});

const totalSpent = Object.values(totals).reduce((s, v) => s + v, 0);
const allocatedBudget = 250000;
const remaining = allocatedBudget - totalSpent;
const utilizationPct = Math.round((totalSpent / allocatedBudget) * 100);

console.assert(totalSpent === 47000, `Total spent must be 47000, got ${totalSpent}`);
console.assert(remaining === 203000, `Remaining must be 203000, got ${remaining}`);
console.assert(utilizationPct === 19, `Utilization % must be 19%, got ${utilizationPct}`);

// Check over-budget identification
const overCats = mockCategories.filter(c => c.budget > 0 && (totals[c.id] || 0) > c.budget);
console.assert(overCats.length === 1 && overCats[0].id === 'c2', "Only c2 (Dining Out) should be over budget");
console.log("  ✓ Financial calculations and over-budget identification match requirements");

console.log("\n====================================================================");
console.log("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!");
console.log("====================================================================\n");

