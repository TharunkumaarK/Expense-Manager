/**
 * Expense Manager — Desktop Onboarding Controller (Phase 3)
 * Modern, stylish, minimal fintech onboarding inspired by the Expense Manager login page.
 * 
 * Features:
 * - Desktop split-pane treasury canvas with live dynamic code-rendered JPY, INR, and EUR cards.
 * - 4-Step Focused Progression:
 *   1. Sovereign Countries (JP, IN, DE) & Primary Currency.
 *   2. Independent Country Budgets (Monthly limits & rollover cushions).
 *   3. Mandatory Wallets & Opening Balances (English-alone naming).
 *   4. Optional Loan Tracking & Comprehensive Configuration Review.
 * - Local-only draft progress persistence via storage.saveData() (defers cloud push).
 * - Asynchronous confirmation gate with blocking retry on cloud failure.
 * - Seamless integration with StorageManager and SupabaseClient.
 */

(function (global) {
    'use strict';

    class OnboardingController {
        constructor() {
            this.currentStep = 1;
            this.totalSteps = 4;
            this.draft = {
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
            this.isSubmitting = false;
        }

        /**
         * Initialize the controller and resume from draft state if available.
         */
        init() {
            if (typeof storage === 'undefined') return;

            const isFresh = (typeof storage.isNewUser === 'function') ? storage.isNewUser() : true;
            const prefs = (typeof storage.getPreferences === 'function') ? storage.getPreferences() : null;

            if (!isFresh && prefs && prefs.onboardingStep > 1 && Array.isArray(prefs.activeCountries) && prefs.activeCountries.length > 0) {
                this.draft.activeCountries = [...prefs.activeCountries];
                this.draft.defaultCountry = prefs.defaultCountry || prefs.activeCountries[0] || 'JP';
                this.currentStep = (typeof prefs.onboardingStep === 'number' && prefs.onboardingStep >= 1 && prefs.onboardingStep <= 4)
                    ? prefs.onboardingStep
                    : 1;
            } else {
                this.draft.activeCountries = ['JP'];
                this.draft.defaultCountry = 'JP';
                this.currentStep = 1;
            }

            // Initialize draft budgets
            if (!isFresh && storage.state && storage.state.budgets) {
                for (const c of ['JP', 'IN', 'DE']) {
                    if (storage.state.budgets[c]) {
                        this.draft.budgets[c] = { ...storage.state.budgets[c] };
                    }
                }
            } else {
                this.draft.budgets = {
                    JP: { enabled: true, monthlyTotal: 0, rolloverEnabled: true },
                    IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false },
                    DE: { enabled: false, monthlyTotal: 0, rolloverEnabled: false }
                };
            }

            // Reset/init draft wallets
            this.draft.wallets = {};
            if (!isFresh && storage.state && storage.state.wallets && Object.keys(storage.state.wallets).length > 0) {
                for (const [id, w] of Object.entries(storage.state.wallets)) {
                    if (w && this.draft.activeCountries.includes(w.region)) {
                        this.draft.wallets[id] = { ...w };
                    }
                }
            }
            this._initDraftWallets();

            // Initialize draft loan config
            if (!isFresh && storage.state && storage.state.loanConfig) {
                this.draft.loanConfig = { ...storage.state.loanConfig };
            } else {
                this.draft.loanConfig = {
                    enabled: false,
                    country: 'IN',
                    currency: '₹',
                    totalPrincipal: 0,
                    principalLeft: 0,
                    emi: 0,
                    annualInterestRate: 0,
                    emiDrawDate: 7
                };
            }

            this.bindEvents();
        }

        /**
         * Initialize starter wallets for active countries using English-alone naming.
         */
        _initDraftWallets() {
            const starterTemplates = {
                JP: [
                    { id: 'Salary Account', name: 'Salary Account', type: 'bank', region: 'JP', currency: '¥', color: '#009944', balance: 0 },
                    { id: 'Cash', name: 'Cash', type: 'cash', region: 'JP', currency: '¥', color: '#d4af37', balance: 0 },
                    { id: 'PayPay', name: 'PayPay', type: 'digital', region: 'JP', currency: '¥', color: '#ff0033', balance: 0 }
                ],
                IN: [
                    { id: 'Bank Account', name: 'Bank Account', type: 'bank', region: 'IN', currency: '₹', color: '#97144d', balance: 0 },
                    { id: 'Cash (IN)', name: 'Cash', type: 'cash', region: 'IN', currency: '₹', color: '#d4af37', balance: 0 }
                ],
                DE: [
                    { id: 'Checking Account', name: 'Checking Account', type: 'bank', region: 'DE', currency: '€', color: '#1e3a8a', balance: 0 },
                    { id: 'Cash (DE)', name: 'Cash', type: 'cash', region: 'DE', currency: '€', color: '#d4af37', balance: 0 }
                ]
            };

            // Remove wallets belonging to countries no longer active
            for (const id of Object.keys(this.draft.wallets)) {
                const w = this.draft.wallets[id];
                if (w && !this.draft.activeCountries.includes(w.region)) {
                    delete this.draft.wallets[id];
                }
            }

            // Populate starter wallets for each active country if no wallets exist yet for that country
            for (const country of this.draft.activeCountries) {
                const count = Object.values(this.draft.wallets).filter(w => w && w.region === country).length;
                if (count === 0 && starterTemplates[country]) {
                    starterTemplates[country].forEach(tpl => {
                        this.draft.wallets[tpl.id] = { ...tpl };
                    });
                }
            }
        }

        /**
         * Bind UI interactions and navigation.
         */
        bindEvents() {
            const nextBtn = document.getElementById('onboarding-next-btn');
            const backBtn = document.getElementById('onboarding-back-btn');

            if (nextBtn) {
                nextBtn.onclick = () => this.handleNext();
            }
            if (backBtn) {
                backBtn.onclick = () => this.handleBack();
            }
        }

        /**
         * Show the onboarding screen and hide dashboard elements.
         */
        show() {
            this.init();
            const screen = document.getElementById('onboarding-screen');
            const authScreen = document.getElementById('auth-screen');
            const appContent = document.getElementById('app-content');
            const bottomNav = document.getElementById('bottom-nav');
            const mainFab = document.getElementById('main-fab');

            if (authScreen) authScreen.style.display = 'none';
            if (appContent) appContent.style.display = 'none';
            if (bottomNav) bottomNav.style.display = 'none';
            if (mainFab) mainFab.style.display = 'none';

            if (screen) {
                screen.style.display = 'flex';
                this.render();
            }
        }

        /**
         * Hide the onboarding screen.
         */
        hide() {
            const screen = document.getElementById('onboarding-screen');
            if (screen) {
                screen.style.display = 'none';
            }
        }

        /**
         * Main render coordinator.
         */
        render() {
            this.clearError();
            this.renderStepNavigation();
            this.renderStepContent();
            this.updateLiveShowcase();
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }

        /**
         * Render step progress track, title, and back/continue buttons.
         */
        renderStepNavigation() {
            const stepPill = document.getElementById('onboarding-step-indicator');
            const progressFill = document.getElementById('onboarding-progress-fill');
            const titleEl = document.getElementById('onboarding-step-title');
            const descEl = document.getElementById('onboarding-step-desc');
            const backBtn = document.getElementById('onboarding-back-btn');
            const nextBtn = document.getElementById('onboarding-next-btn');
            const nextText = document.getElementById('onboarding-next-text');
            const nextIcon = document.getElementById('onboarding-next-icon');

            if (stepPill) stepPill.textContent = `Step ${this.currentStep} of ${this.totalSteps}`;
            if (progressFill) progressFill.style.width = `${(this.currentStep / this.totalSteps) * 100}%`;

            if (backBtn) {
                backBtn.style.display = this.currentStep > 1 ? 'inline-flex' : 'none';
            }

            if (nextText && nextIcon) {
                if (this.currentStep === this.totalSteps) {
                    nextText.textContent = 'Confirm & Launch Ledger';
                    nextIcon.setAttribute('data-lucide', 'check');
                } else {
                    nextText.textContent = 'Continue';
                    nextIcon.setAttribute('data-lucide', 'arrow-right');
                }
            }

            const stepMeta = {
                1: {
                    title: 'Select Countries',
                    desc: 'Choose the countries you manage finances in.'
                },
                2: {
                    title: 'Monthly Budgets',
                    desc: 'Set independent monthly limits and rollover cushion per country.'
                },
                3: {
                    title: 'Accounts & Wallets',
                    desc: 'Configure starting balances for your bank accounts and cash.'
                },
                4: {
                    title: 'Review & Launch',
                    desc: 'Verify your financial setup before initializing your ledger.'
                }
            };

            const currentMeta = stepMeta[this.currentStep] || stepMeta[1];
            if (titleEl) titleEl.textContent = currentMeta.title;
            if (descEl) descEl.textContent = currentMeta.desc;
        }

        /**
         * Render active step content container.
         */
        renderStepContent() {
            for (let i = 1; i <= this.totalSteps; i++) {
                const el = document.getElementById(`onboarding-step-${i}`);
                if (el) el.style.display = i === this.currentStep ? 'block' : 'none';
            }

            switch (this.currentStep) {
                case 1:
                    this.renderStep1();
                    break;
                case 2:
                    this.renderStep2();
                    break;
                case 3:
                    this.renderStep3();
                    break;
                case 4:
                    this.renderStep4();
                    break;
            }
        }

        /**
         * STEP 1: Country Selection & Primary Currency.
         */
        renderStep1() {
            const container = document.getElementById('onboarding-step-1');
            if (!container) return;

            const countries = [
                {
                    code: 'JP',
                    name: 'Japan',
                    currency: 'JPY (¥)',
                    flagSvg: `<svg class="onboarding-flag-svg" viewBox="0 0 640 480" width="22" height="16.5" aria-hidden="true"><rect width="640" height="480" fill="#ffffff"/><circle cx="320" cy="240" r="120" fill="#bc002d"/></svg>`,
                    desc: 'Zero-decimal yen accounting with rollover budgets and PayPay integration.'
                },
                {
                    code: 'IN',
                    name: 'India',
                    currency: 'INR (₹)',
                    flagSvg: `<svg class="onboarding-flag-svg" viewBox="0 0 640 480" width="22" height="16.5" aria-hidden="true"><path fill="#f4f5f8" d="M0 160h640v160H0z"/><path fill="#ff9933" d="M0 0h640v160H0z"/><path fill="#138808" d="M0 320h640v160H0z"/><circle cx="320" cy="240" r="40" fill="#000080"/><circle cx="320" cy="240" r="32" fill="#ffffff"/><circle cx="320" cy="240" r="8" fill="#000080"/></svg>`,
                    desc: 'Rupee decimal accounting, lakh formatting, and optional loan tracking.'
                },
                {
                    code: 'DE',
                    name: 'Germany',
                    currency: 'EUR (€)',
                    flagSvg: `<svg class="onboarding-flag-svg" viewBox="0 0 640 480" width="22" height="16.5" aria-hidden="true"><rect width="640" height="160" y="0" fill="#000000"/><rect width="640" height="160" y="160" fill="#dd0000"/><rect width="640" height="160" y="320" fill="#ffce00"/></svg>`,
                    desc: 'Euro standard formatting with independent euro-denominated budgeting.'
                }
            ];

            let html = `
                <div class="onboarding-country-list">
            `;

            countries.forEach(c => {
                const isSelected = this.draft.activeCountries.includes(c.code);
                html += `
                    <div class="onboarding-country-card ${isSelected ? 'selected' : ''}" 
                         onclick="onboardingController.toggleCountry('${c.code}')"
                         role="checkbox" aria-checked="${isSelected}" tabindex="0">
                        <div class="onboarding-country-card-header">
                            <div class="onboarding-country-card-title">
                                ${c.flagSvg}
                                <span class="onboarding-country-name">${c.name}</span>
                                <span class="onboarding-currency-badge">${c.currency}</span>
                            </div>
                            <div class="onboarding-checkbox ${isSelected ? 'checked' : ''}">
                                ${isSelected ? '<i data-lucide="check"></i>' : ''}
                            </div>
                        </div>
                        <p class="onboarding-country-desc">${c.desc}</p>
                    </div>
                `;
            });

            html += `</div>`;

            // Primary Currency Selector
            html += `
                <div class="onboarding-primary-currency-row">
                    <label class="auth-label" for="onboarding-primary-select">Primary Operating Country</label>
                    <div class="auth-input-wrapper">
                        <select id="onboarding-primary-select" class="auth-input onboarding-select" 
                                onchange="onboardingController.setPrimaryCountry(this.value)">
            `;

            this.draft.activeCountries.forEach(code => {
                const cMeta = countries.find(c => c.code === code) || { name: code };
                const isPrimary = this.draft.defaultCountry === code;
                html += `<option value="${code}" ${isPrimary ? 'selected' : ''}>${cMeta.name} (${code})</option>`;
            });

            html += `
                        </select>
                    </div>
                </div>
            `;

            container.innerHTML = html;
        }

        /**
         * Toggle active country selection in Step 1.
         */
        toggleCountry(code) {
            const index = this.draft.activeCountries.indexOf(code);
            if (index >= 0) {
                // Prevent unselecting all countries
                if (this.draft.activeCountries.length <= 1) {
                    this.showError('At least one country must remain active.');
                    return;
                }
                this.draft.activeCountries.splice(index, 1);
                // If default country was removed, assign first available
                if (this.draft.defaultCountry === code) {
                    this.draft.defaultCountry = this.draft.activeCountries[0];
                }
            } else {
                this.draft.activeCountries.push(code);
            }

            this._initDraftWallets();
            this.clearError();
            this.renderStep1();
            this.updateLiveShowcase();
        }

        /**
         * Set primary sovereign country in Step 1.
         */
        setPrimaryCountry(code) {
            if (this.draft.activeCountries.includes(code)) {
                this.draft.defaultCountry = code;
                this.updateLiveShowcase();
            }
        }

        /**
         * STEP 2: Monthly Budgets (Independent).
         */
        renderStep2() {
            const container = document.getElementById('onboarding-step-2');
            if (!container) return;

            const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };
            const countryNames = { JP: 'Japan', IN: 'India', DE: 'Germany' };

            let html = `<div class="onboarding-budget-list">`;

            this.draft.activeCountries.forEach(code => {
                const symbol = currencySymbols[code] || '¥';
                const name = countryNames[code] || code;
                const bConfig = this.draft.budgets[code] || { enabled: code === 'JP', monthlyTotal: 0, rolloverEnabled: code === 'JP' };

                html += `
                    <div class="onboarding-budget-card">
                        <div class="onboarding-budget-card-header">
                            <div class="onboarding-budget-title-block">
                                <span class="onboarding-country-code-pill">${code}</span>
                                <h3 class="onboarding-budget-country-title">${name} Monthly Budget</h3>
                            </div>
                            <label class="onboarding-toggle-switch">
                                <input type="checkbox" ${bConfig.enabled ? 'checked' : ''} 
                                       onchange="onboardingController.toggleBudgetEnabled('${code}', this.checked)">
                                <span class="onboarding-toggle-slider"></span>
                            </label>
                        </div>

                        <div class="onboarding-budget-body" style="${bConfig.enabled ? '' : 'opacity: 0.45; pointer-events: none;'}">
                            <div class="auth-field-group mb-3">
                                <label class="auth-label">Monthly Target Limit</label>
                                <div class="auth-input-wrapper">
                                    <span class="auth-input-icon" style="font-weight: 700; font-size: 1.05rem;">${symbol}</span>
                                    <input type="number" min="0" step="any" class="auth-input" 
                                           placeholder="e.g. 50000"
                                           value="${bConfig.monthlyTotal > 0 ? bConfig.monthlyTotal : ''}"
                                           oninput="onboardingController.setBudgetAmount('${code}', this.value)">
                                </div>
                            </div>

                            <label class="onboarding-checkbox-row">
                                <input type="checkbox" ${bConfig.rolloverEnabled ? 'checked' : ''}
                                       onchange="onboardingController.toggleBudgetRollover('${code}', this.checked)">
                                <span>Enable rollover cushion (unspent savings carry forward to next month)</span>
                            </label>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
            container.innerHTML = html;
        }

        toggleBudgetEnabled(country, enabled) {
            if (!this.draft.budgets[country]) {
                this.draft.budgets[country] = { enabled: false, monthlyTotal: 0, rolloverEnabled: false };
            }
            this.draft.budgets[country].enabled = Boolean(enabled);
            this.renderStep2();
            this.updateLiveShowcase();
        }

        setBudgetAmount(country, amount) {
            if (!this.draft.budgets[country]) {
                this.draft.budgets[country] = { enabled: true, monthlyTotal: 0, rolloverEnabled: false };
            }
            this.draft.budgets[country].monthlyTotal = Math.max(0, Number(amount) || 0);
            this.updateLiveShowcase();
        }

        toggleBudgetRollover(country, enabled) {
            if (this.draft.budgets[country]) {
                this.draft.budgets[country].rolloverEnabled = Boolean(enabled);
            }
        }

        /**
         * STEP 3: Mandatory Wallets & Opening Balances.
         */
        renderStep3() {
            const container = document.getElementById('onboarding-step-3');
            if (!container) return;

            const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };
            const countryNames = { JP: 'Japan', IN: 'India', DE: 'Germany' };

            let html = `<div class="onboarding-wallets-container">`;

            this.draft.activeCountries.forEach(code => {
                const symbol = currencySymbols[code] || '¥';
                const name = countryNames[code] || code;
                const walletsForCountry = Object.values(this.draft.wallets).filter(w => w && w.region === code);

                html += `
                    <div class="onboarding-country-wallets-section">
                        <div class="onboarding-section-header-row">
                            <h3 class="onboarding-section-title">${name} Accounts</h3>
                            <button type="button" class="btn btn-secondary onboarding-btn-add-wallet"
                                    onclick="onboardingController.promptAddWallet('${code}')">
                                <i data-lucide="plus"></i>
                                <span>Add Account</span>
                            </button>
                        </div>

                        <div class="onboarding-wallet-rows-list">
                `;

                walletsForCountry.forEach(w => {
                    const typeIcon = w.type === 'cash' ? 'wallet' : (w.type === 'digital' ? 'smartphone' : 'landmark');
                    html += `
                        <div class="onboarding-wallet-row">
                            <div class="onboarding-wallet-row-left">
                                <div class="onboarding-wallet-icon-box" style="border-color: ${w.color || '#333'}">
                                    <i data-lucide="${typeIcon}"></i>
                                </div>
                                <div class="onboarding-wallet-row-info">
                                    <span class="onboarding-wallet-row-name">${w.name}</span>
                                    <span class="onboarding-wallet-row-type">${w.type.toUpperCase()}</span>
                                </div>
                            </div>

                            <div class="onboarding-wallet-row-right">
                                <div class="auth-input-wrapper onboarding-balance-input-wrap">
                                    <span class="auth-input-icon" style="font-weight: 700;">${symbol}</span>
                                    <input type="number" min="0" step="any" class="auth-input onboarding-balance-input"
                                           placeholder="0"
                                           value="${w.balance !== 0 ? w.balance : ''}"
                                           oninput="onboardingController.setWalletBalance('${w.id}', this.value)">
                                </div>
                                ${walletsForCountry.length > 1 ? `
                                    <button type="button" class="onboarding-wallet-delete-btn" title="Remove account"
                                            onclick="onboardingController.deleteWallet('${w.id}')">
                                        <i data-lucide="trash-2"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
            container.innerHTML = html;
        }

        setWalletBalance(walletId, value) {
            if (this.draft.wallets[walletId]) {
                this.draft.wallets[walletId].balance = Math.max(0, Number(value) || 0);
                this.updateLiveShowcase();
            }
        }

        promptAddWallet(countryCode) {
            const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };
            const defaultNames = {
                JP: 'Savings Account',
                IN: 'Emergency Fund',
                DE: 'Savings Account'
            };

            const name = prompt(`Enter account name for ${countryCode}:`, defaultNames[countryCode] || 'Savings');
            if (!name || !name.trim()) return;

            const trimmed = name.trim();
            // Prevent duplicate IDs
            let uniqueId = trimmed;
            let counter = 1;
            while (this.draft.wallets[uniqueId]) {
                uniqueId = `${trimmed} ${++counter}`;
            }

            this.draft.wallets[uniqueId] = {
                id: uniqueId,
                name: uniqueId,
                type: 'bank',
                region: countryCode,
                currency: currencySymbols[countryCode] || '¥',
                color: '#3b82f6',
                balance: 0
            };

            this.renderStep3();
            this.updateLiveShowcase();
        }

        deleteWallet(walletId) {
            const w = this.draft.wallets[walletId];
            if (!w) return;

            // Ensure at least 1 wallet remains for this region
            const regionWallets = Object.values(this.draft.wallets).filter(item => item.region === w.region);
            if (regionWallets.length <= 1) {
                this.showError(`Each active country must have at least one account.`);
                return;
            }

            delete this.draft.wallets[walletId];
            this.renderStep3();
            this.updateLiveShowcase();
        }

        /**
         * STEP 4: Optional Loan Tracking & Configuration Review.
         */
        renderStep4() {
            const container = document.getElementById('onboarding-step-4');
            if (!container) return;

            const lConfig = this.draft.loanConfig;
            const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };

            let html = `
                <div class="onboarding-review-pane">
                    <!-- Optional Loan Tracking Card -->
                    <div class="onboarding-loan-card mb-4">
                        <div class="onboarding-loan-header">
                            <div>
                                <h3 class="onboarding-review-section-title">Track Existing Loan (Optional)</h3>
                                <p class="auth-desc">Manage outstanding principal, amortization, and monthly EMI deductions.</p>
                            </div>
                            <label class="onboarding-toggle-switch">
                                <input type="checkbox" ${lConfig.enabled ? 'checked' : ''}
                                       onchange="onboardingController.toggleLoanTracking(this.checked)">
                                <span class="onboarding-toggle-slider"></span>
                            </label>
                        </div>

                        <div class="onboarding-loan-body mt-3" style="${lConfig.enabled ? '' : 'display: none;'}">
                            <div class="onboarding-loan-grid">
                                <div class="auth-field-group">
                                    <label class="auth-label">Original Principal</label>
                                    <input type="number" min="0" class="auth-input" placeholder="e.g. 500000"
                                           value="${lConfig.totalPrincipal > 0 ? lConfig.totalPrincipal : ''}"
                                           oninput="onboardingController.setLoanField('totalPrincipal', this.value)">
                                </div>
                                <div class="auth-field-group">
                                    <label class="auth-label">Remaining Principal</label>
                                    <input type="number" min="0" class="auth-input" placeholder="e.g. 420000"
                                           value="${lConfig.principalLeft > 0 ? lConfig.principalLeft : ''}"
                                           oninput="onboardingController.setLoanField('principalLeft', this.value)">
                                </div>
                                <div class="auth-field-group">
                                    <label class="auth-label">Monthly EMI Amount</label>
                                    <input type="number" min="0" class="auth-input" placeholder="e.g. 12500"
                                           value="${lConfig.emi > 0 ? lConfig.emi : ''}"
                                           oninput="onboardingController.setLoanField('emi', this.value)">
                                </div>
                                <div class="auth-field-group">
                                    <label class="auth-label">Annual Interest Rate (%)</label>
                                    <input type="number" min="0" step="0.01" class="auth-input" placeholder="e.g. 8.5"
                                           value="${lConfig.annualInterestRate > 0 ? lConfig.annualInterestRate : ''}"
                                           oninput="onboardingController.setLoanField('annualInterestRate', this.value)">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Structured Ledger Review Summary -->
                    <div class="onboarding-summary-card">
                        <h3 class="onboarding-review-section-title mb-3">Ledger Configuration Summary</h3>
                        
                        <div class="onboarding-summary-grid">
                            <div class="onboarding-summary-item">
                                <span class="onboarding-summary-label">Selected Countries</span>
                                <span class="onboarding-summary-val">${this.draft.activeCountries.join(', ')} (Primary: ${this.draft.defaultCountry})</span>
                            </div>

                            <div class="onboarding-summary-item">
                                <span class="onboarding-summary-label">Configured Accounts</span>
                                <span class="onboarding-summary-val">${Object.keys(this.draft.wallets).length} Accounts across ${this.draft.activeCountries.length} countries</span>
                            </div>

                            <div class="onboarding-summary-item">
                                <span class="onboarding-summary-label">Active Budgets</span>
                                <span class="onboarding-summary-val">
                                    ${this.draft.activeCountries.map(c => {
                const b = this.draft.budgets[c];
                const sym = currencySymbols[c] || '';
                return b && b.enabled ? `${c}: ${sym}${Number(b.monthlyTotal).toLocaleString()}` : `${c}: None`;
            }).join(' • ')}
                                </span>
                            </div>

                            <div class="onboarding-summary-item">
                                <span class="onboarding-summary-label">Opening Balances</span>
                                <span class="onboarding-summary-val">
                                    ${this.draft.activeCountries.map(c => {
                const total = Object.values(this.draft.wallets)
                    .filter(w => w.region === c)
                    .reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
                const sym = currencySymbols[c] || '';
                return `${c}: ${sym}${total.toLocaleString()}`;
            }).join(' • ')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            container.innerHTML = html;
        }

        toggleLoanTracking(enabled) {
            this.draft.loanConfig.enabled = Boolean(enabled);
            this.renderStep4();
        }

        setLoanField(field, value) {
            this.draft.loanConfig[field] = Number(value) || 0;
        }

        /**
         * Update the live left-pane treasury showcase.
         * Code-renders responsive JPY, INR, and EUR cards matching the login page craft in a 3-tier cascade.
         */
        updateLiveShowcase() {
            const showcase = document.getElementById('onboarding-live-showcase');
            if (!showcase) return;

            let html = '';

            const active = this.draft.activeCountries || [];
            // Keep Indian card in the forefront (top z-index / front of carousel) whenever active
            const baseOrder = ['JP', 'DE'].filter(c => active.includes(c));
            if (active.includes('IN')) {
                baseOrder.push('IN');
            }
            const orderedCountries = baseOrder;
            const count = orderedCountries.length;

            // Calculate live balances per country from draft wallets
            const getBal = (code) => {
                return Object.values(this.draft.wallets)
                    .filter(w => w && w.region === code)
                    .reduce((acc, w) => acc + (Number(w.balance) || 0), 0);
            };

            orderedCountries.forEach((code, idx) => {
                let topOffset = 0;
                let leftOffset = 0;
                let zIndex = idx + 1;

                if (count === 2) {
                    topOffset = idx * 36;
                    leftOffset = idx * 54;
                } else if (count >= 3) {
                    topOffset = idx * 36;
                    leftOffset = idx * 48;
                }

                const posStyle = `position: absolute; top: ${topOffset}px; left: ${leftOffset}px; z-index: ${zIndex}; bottom: auto; right: auto;`;

                if (code === 'JP') {
                    const bal = getBal('JP');
                    html += `
                        <div class="auth-card-preview auth-card-jp" style="${posStyle}" data-country="JP">
                            <div class="auth-card-top">
                                <div class="auth-card-chip">
                                    <div class="chip-line"></div>
                                    <div class="chip-line"></div>
                                </div>
                                <div class="auth-card-badge">
                                    <svg class="auth-flag-svg" width="18" height="18" viewBox="0 0 36 36"><circle fill="#EEEEEE" cx="18" cy="18" r="18"/><circle fill="#D80027" cx="18" cy="18" r="7"/></svg>
                                    <span>JPY • Japan</span>
                                </div>
                            </div>
                            <div class="auth-card-body">
                                <div class="auth-card-label">Total Balance</div>
                                <div class="auth-card-balance">¥ ${bal.toLocaleString()}</div>
                            </div>
                            <div class="auth-card-footer">
                                <span class="auth-card-network">TOKYO SLATE</span>
                                <span class="auth-card-tag">${this.draft.budgets.JP?.enabled ? `Budget: ¥${(this.draft.budgets.JP.monthlyTotal || 0).toLocaleString()}` : 'Budget: Off'}</span>
                            </div>
                        </div>
                    `;
                } else if (code === 'IN') {
                    const bal = getBal('IN');
                    html += `
                        <div class="auth-card-preview auth-card-in" style="${posStyle}" data-country="IN">
                            <div class="auth-card-top">
                                <div class="auth-card-chip">
                                    <div class="chip-line"></div>
                                    <div class="chip-line"></div>
                                </div>
                                <div class="auth-card-badge">
                                    <svg class="auth-flag-svg" width="18" height="18" viewBox="0 0 36 36"><clipPath id="circleFlagINCard"><circle cx="18" cy="18" r="18"/></clipPath><g clip-path="url(#circleFlagINCard)"><rect x="0" y="0" width="36" height="12" fill="#FF9933"/><rect x="0" y="12" width="36" height="12" fill="#FFFFFF"/><rect x="0" y="24" width="36" height="12" fill="#138808"/><circle cx="18" cy="18" r="3.5" fill="none" stroke="#000080" stroke-width="1.5"/><circle cx="18" cy="18" r="0.8" fill="#000080"/></g></svg>
                                    <span>INR • India</span>
                                </div>
                            </div>
                            <div class="auth-card-body">
                                <div class="auth-card-label">Total Balance</div>
                                <div class="auth-card-balance">₹ ${bal.toLocaleString()}</div>
                            </div>
                            <div class="auth-card-footer">
                                <span class="auth-card-network">BENGALURU</span>
                                <span class="auth-card-tag">${this.draft.budgets.IN?.enabled ? `Budget: ₹${(this.draft.budgets.IN.monthlyTotal || 0).toLocaleString()}` : 'Budget: Off'}</span>
                            </div>
                        </div>
                    `;
                } else if (code === 'DE') {
                    const bal = getBal('DE');
                    html += `
                        <div class="auth-card-preview auth-card-de" style="${posStyle}" data-country="DE">
                            <div class="auth-card-top">
                                <div class="auth-card-chip">
                                    <div class="chip-line"></div>
                                    <div class="chip-line"></div>
                                </div>
                                <div class="auth-card-badge">
                                    <svg class="auth-flag-svg" width="18" height="18" viewBox="0 0 36 36"><clipPath id="circleFlagDECard"><circle cx="18" cy="18" r="18"/></clipPath><g clip-path="url(#circleFlagDECard)"><rect x="0" y="0" width="36" height="12" fill="#000000"/><rect x="0" y="12" width="36" height="12" fill="#DD0000"/><rect x="0" y="24" width="36" height="12" fill="#FFCE00"/></g></svg>
                                    <span>EUR • Germany</span>
                                </div>
                            </div>
                            <div class="auth-card-body">
                                <div class="auth-card-label">Total Balance</div>
                                <div class="auth-card-balance">€ ${bal.toLocaleString()}</div>
                            </div>
                            <div class="auth-card-footer">
                                <span class="auth-card-network">FRANKFURT</span>
                                <span class="auth-card-tag">${this.draft.budgets.DE?.enabled ? `Budget: €${(this.draft.budgets.DE.monthlyTotal || 0).toLocaleString()}` : 'Budget: Off'}</span>
                            </div>
                        </div>
                    `;
                }
            });

            showcase.innerHTML = html;
        }

        /**
         * Navigation: Next Step.
         */
        handleNext() {
            if (this.isSubmitting) return;

            // Validate current step
            if (!this.validateStep(this.currentStep)) return;

            // Save draft progress locally before advancing
            this.persistDraftLocally();

            if (this.currentStep < this.totalSteps) {
                this.currentStep++;
                this.render();
            } else {
                this.confirmAndLaunch();
            }
        }

        /**
         * Navigation: Back Step.
         */
        handleBack() {
            if (this.isSubmitting) return;
            if (this.currentStep > 1) {
                this.persistDraftLocally();
                this.currentStep--;
                this.render();
            }
        }

        /**
         * Step validation logic.
         */
        validateStep(step) {
            this.clearError();
            if (step === 1) {
                if (!Array.isArray(this.draft.activeCountries) || this.draft.activeCountries.length === 0) {
                    this.showError('Please select at least one operating country.');
                    return false;
                }
            } else if (step === 3) {
                // Ensure every active country has at least one wallet
                for (const code of this.draft.activeCountries) {
                    const count = Object.values(this.draft.wallets).filter(w => w && w.region === code).length;
                    if (count === 0) {
                        this.showError(`Please configure at least one account for ${code}.`);
                        return false;
                    }
                }
            }
            return true;
        }

        /**
         * Persist in-progress draft state strictly to localStorage without pushing to cloud.
         */
        persistDraftLocally() {
            if (typeof storage === 'undefined') return;

            // Update preferences draft
            storage.state.preferences.activeCountries = [...this.draft.activeCountries];
            storage.state.preferences.defaultCountry = this.draft.defaultCountry;
            storage.state.preferences.onboardingStep = this.currentStep;
            storage.state.preferences.onboardingCompleted = false;

            // Update budgets draft
            if (!storage.state.budgets) storage.state.budgets = {};
            for (const c of ['JP', 'IN', 'DE']) {
                if (this.draft.budgets[c]) {
                    storage.state.budgets[c] = { ...this.draft.budgets[c] };
                }
            }
            // Sync legacy accessors
            if (this.draft.budgets.JP) storage.state.jpTotalBudget = this.draft.budgets.JP.monthlyTotal;
            if (this.draft.budgets.IN) storage.state.inTotalBudget = this.draft.budgets.IN.monthlyTotal;

            // Update wallets draft
            storage.state.wallets = { ...this.draft.wallets };

            // Update loan config draft
            storage.state.loanConfig = { ...this.draft.loanConfig };

            // Write safely to localStorage (pushToSupabase will defer because onboardingCompleted is false!)
            storage.saveData();
        }

        /**
         * STEP 4: Final Confirmation and Cloud Synchronization Gate.
         * Enforces Blocking Cloud Requirement: remains on Step 4 with retry if cloud write fails.
         */
        async confirmAndLaunch() {
            if (this.isSubmitting) return;
            this.isSubmitting = true;

            const nextBtn = document.getElementById('onboarding-next-btn');
            const nextText = document.getElementById('onboarding-next-text');
            if (nextText) nextText.textContent = 'Setting up ledger...';
            if (nextBtn) nextBtn.disabled = true;

            try {
                // First persist final draft state to storage.state
                this.persistDraftLocally();

                // Call async completion gate
                const result = await storage.markOnboardingCompleted(true);

                if (result.cloudSynced && storage.isCloudSyncConfirmed()) {
                    // Success! Cloud confirmation received.
                    console.log('[Onboarding] Cloud synchronization confirmed. Launching application...');
                    this.completeAndEnterApp();
                } else {
                    // Cloud push failed (offline, 503, network drop).
                    // Enforce Blocking Cloud Requirement: remain on Step 4 and show retry action.
                    console.warn('[Onboarding] Cloud synchronization could not be confirmed:', result.error);
                    this.showError(`Configuration saved locally, but cloud synchronization failed (${result.error || 'Network offline'}). Please check your connection and retry.`);
                    if (nextText) nextText.textContent = 'Retry Cloud Sync';
                    if (nextBtn) {
                        nextBtn.disabled = false;
                        nextBtn.onclick = () => this.retryCloudSync();
                    }
                }
            } catch (e) {
                console.error('[Onboarding] Exception during confirmation:', e);
                this.showError(`An error occurred: ${e.message || String(e)}. Please retry.`);
                if (nextText) nextText.textContent = 'Retry Cloud Sync';
                if (nextBtn) {
                    nextBtn.disabled = false;
                    nextBtn.onclick = () => this.retryCloudSync();
                }
            } finally {
                this.isSubmitting = false;
            }
        }

        /**
         * Explicit cloud synchronization retry.
         */
        async retryCloudSync() {
            if (this.isSubmitting) return;
            this.isSubmitting = true;

            const nextBtn = document.getElementById('onboarding-next-btn');
            const nextText = document.getElementById('onboarding-next-text');
            if (nextText) nextText.textContent = 'Retrying synchronization...';
            if (nextBtn) nextBtn.disabled = true;

            try {
                const retryResult = await storage.retryCloudSync();
                if (retryResult.success && storage.isCloudSyncConfirmed()) {
                    console.log('[Onboarding] Retry successful! Cloud synchronization confirmed.');
                    this.completeAndEnterApp();
                } else {
                    this.showError(`Retry failed (${retryResult.error || 'Server unreachable'}). Please verify your internet connection.`);
                    if (nextText) nextText.textContent = 'Retry Cloud Sync';
                    if (nextBtn) nextBtn.disabled = false;
                }
            } catch (e) {
                this.showError(`Retry error: ${e.message || String(e)}`);
                if (nextText) nextText.textContent = 'Retry Cloud Sync';
                if (nextBtn) nextBtn.disabled = false;
            } finally {
                this.isSubmitting = false;
            }
        }

        /**
         * Transition into the main desktop application dashboard.
         */
        completeAndEnterApp() {
            this.hide();

            const appContent = document.getElementById('app-content');
            const bottomNav = document.getElementById('bottom-nav');
            const mainFab = document.getElementById('main-fab');

            if (appContent) appContent.style.display = 'block';
            if (bottomNav) bottomNav.style.display = 'flex';
            if (mainFab) mainFab.style.display = 'flex';

            // Fully re-initialize application state and views
            if (typeof app !== 'undefined') {
                if (typeof app.init === 'function') {
                    app._hasInit = true;
                    app.init();
                }
                if (typeof app.renderAll === 'function') {
                    app.renderAll();
                }
            }
        }

        showError(msg) {
            const banner = document.getElementById('onboarding-error-banner');
            if (banner) {
                banner.textContent = msg;
                banner.style.display = 'block';
            }
        }

        clearError() {
            const banner = document.getElementById('onboarding-error-banner');
            if (banner) {
                banner.style.display = 'none';
                banner.textContent = '';
            }
        }
    }

    global.OnboardingController = OnboardingController;
    global.onboardingController = new OnboardingController();

})(typeof window !== 'undefined' ? window : this);
