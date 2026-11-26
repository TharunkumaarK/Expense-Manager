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
 * - Safe HTML escaping and event delegation for user-supplied account names.
 * - Asynchronous confirmation gate with blocking retry on cloud failure.
 * - Seamless integration with StorageManager and SupabaseClient.
 */

(function (global) {
    'use strict';

    const ONBOARDING_WALLET_THEMES = [
        { id: 'emerald-salary', name: 'Emerald Salary', cls: 'wallet-theme-emerald-salary', color: '#047857', region: 'JP', match: ['salary', 'bank'] },
        { id: 'crimson-paypay', name: 'PayPay Crimson', cls: 'wallet-theme-crimson-paypay', color: '#e60012', region: 'JP', match: ['paypay', 'digital'] },
        { id: 'amber-gold', name: 'Amber Gold (Cash)', cls: 'wallet-theme-amber-gold', color: '#d97706', region: 'JP', match: ['cash', 'gold'] },
        { id: 'burgundy-axis', name: 'Burgundy Axis', cls: 'wallet-theme-burgundy-axis', color: '#800020', region: 'IN', match: ['axis', 'bank'] },
        { id: 'baroda-orange', name: 'Baroda Orange', cls: 'wallet-theme-baroda-orange', color: '#ea580c', region: 'IN', match: ['baroda', 'bob'] },
        { id: 'sapphire-sbi', name: 'Sapphire SBI', cls: 'wallet-theme-sapphire-sbi', color: '#1d4ed8', region: 'IN', match: ['sbi', 'state bank'] },
        { id: 'hfc-navy', name: 'HDFC Navy', cls: 'wallet-theme-hfc-navy', color: '#1e3a8a', region: 'IN', match: ['hdfc', 'navy'] },
        { id: 'icici-ruby', name: 'ICICI Ruby', cls: 'wallet-theme-icici-ruby', color: '#be123c', region: 'IN', match: ['icici', 'ruby'] },
        { id: 'violet-suica', name: 'Violet Suica/Pasmo', cls: 'wallet-theme-violet-suica', color: '#7c3aed', region: 'JP', match: ['suica', 'pasmo', 'transit', 'metro'] },
        { id: 'cyan-line', name: 'LINE Cyan', cls: 'wallet-theme-cyan-line', color: '#0891b2', region: 'JP', match: ['line', 'rakuten'] },
        { id: 'slate-reserve', name: 'Slate Reserve', cls: 'wallet-theme-slate-reserve', color: '#334155', region: 'ALL', match: ['reserve', 'emergency', 'safe'] },
        { id: 'rose-gold', name: 'Rose Gold Card', cls: 'wallet-theme-rose-gold', color: '#e11d48', region: 'ALL', match: ['card', 'credit'] },
        { id: 'amethyst-crypto', name: 'Amethyst Vault', cls: 'wallet-theme-amethyst-crypto', color: '#9333ea', region: 'ALL', match: ['vault', 'crypto'] },
        { id: 'aurora-nordic', name: 'Aurora Teal', cls: 'wallet-theme-aurora-nordic', color: '#0f766e', region: 'ALL', match: ['teal', 'savings'] },
        { id: 'frankfurt-slate', name: 'Frankfurt Slate', cls: 'wallet-theme-frankfurt-slate', color: '#1e293b', region: 'DE', match: ['checking', 'sparkasse', 'n26', 'deutsche', 'commerzbank'] }
    ];

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
         * Escape user input to prevent XSS and broken HTML attributes.
         * @param {string|any} str
         * @returns {string}
         */
        escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        /**
         * Initialize the controller and resume from draft state if available.
         */
        init() {
            if (typeof storage === 'undefined') return;

            const prefs = (typeof storage.getPreferences === 'function')
                ? storage.getPreferences()
                : (storage.state?.preferences || null);

            // An account is in resumable draft if onboardingCompleted is false AND
            // (isDraftOnboardingConfiguration is true, or draftSaved flag is true, or onboardingStep > 1).
            const isDraft = (typeof storage.isDraftOnboardingConfiguration === 'function')
                ? storage.isDraftOnboardingConfiguration(storage.state)
                : false;

            const isResumingDraft = Boolean(
                prefs &&
                prefs.onboardingCompleted === false &&
                (isDraft || prefs.draftSaved || (typeof prefs.onboardingStep === 'number' && prefs.onboardingStep > 1))
            );

            if (isResumingDraft) {
                // Restore active countries
                if (prefs && Array.isArray(prefs.activeCountries) && prefs.activeCountries.length > 0) {
                    this.draft.activeCountries = [...prefs.activeCountries];
                    this.draft.defaultCountry = prefs.defaultCountry || prefs.activeCountries[0] || 'JP';
                } else {
                    this.draft.activeCountries = ['JP'];
                    this.draft.defaultCountry = 'JP';
                }

                // Restore destination step
                this.currentStep = (prefs && typeof prefs.onboardingStep === 'number' && prefs.onboardingStep >= 1 && prefs.onboardingStep <= 4)
                    ? prefs.onboardingStep
                    : 1;

                // Restore draft budgets
                if (storage.state && storage.state.budgets) {
                    for (const c of ['JP', 'IN', 'DE']) {
                        if (storage.state.budgets[c]) {
                            this.draft.budgets[c] = { ...storage.state.budgets[c] };
                        }
                    }
                }

                // Restore draft wallets safely
                this.draft.wallets = {};
                if (storage.state && storage.state.wallets && Object.keys(storage.state.wallets).length > 0) {
                    for (const [id, w] of Object.entries(storage.state.wallets)) {
                        if (w && this.draft.activeCountries.includes(w.region)) {
                            this.draft.wallets[id] = { ...w };
                        }
                    }
                }
                // Populate starter templates for countries with 0 wallets without duplicating existing ones
                this._initDraftWallets();

                // Restore draft loan config
                if (storage.state && storage.state.loanConfig) {
                    this.draft.loanConfig = { ...storage.state.loanConfig };
                }
            } else {
                // Fresh default setup: Japan alone by default
                this.draft.activeCountries = ['JP'];
                this.draft.defaultCountry = 'JP';
                this.currentStep = 1;

                this.draft.budgets = {
                    JP: { enabled: true, monthlyTotal: 0, rolloverEnabled: true },
                    IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false },
                    DE: { enabled: false, monthlyTotal: 0, rolloverEnabled: false }
                };

                this.draft.wallets = {};
                this._initDraftWallets();

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

            // Sync loan currency with active countries if loan country is not active
            if (!this.draft.activeCountries.includes(this.draft.loanConfig.country)) {
                const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };
                const fallbackCountry = this.draft.activeCountries.includes('IN')
                    ? 'IN'
                    : (this.draft.defaultCountry || this.draft.activeCountries[0] || 'JP');
                this.draft.loanConfig.country = fallbackCountry;
                this.draft.loanConfig.currency = currencySymbols[fallbackCountry] || '¥';
            }

            this.bindEvents();
        }

        /**
         * Initialize starter wallets for active countries using English-alone naming.
         */
        _initDraftWallets() {
            const starterTemplates = {
                JP: [
                    { id: 'Salary Account', name: 'Salary Account', type: 'bank', region: 'JP', currency: '¥', color: '#047857', theme: 'emerald-salary', balance: 0 },
                    { id: 'Cash', name: 'Cash', type: 'cash', region: 'JP', currency: '¥', color: '#d97706', theme: 'amber-gold', balance: 0 },
                    { id: 'PayPay', name: 'PayPay', type: 'digital', region: 'JP', currency: '¥', color: '#e60012', theme: 'crimson-paypay', balance: 0 }
                ],
                IN: [
                    { id: 'Bank Account', name: 'Bank Account', type: 'bank', region: 'IN', currency: '₹', color: '#800020', theme: 'burgundy-axis', balance: 0 },
                    { id: 'Cash (IN)', name: 'Cash', type: 'cash', region: 'IN', currency: '₹', color: '#d4af37', theme: 'amber-gold', balance: 0 }
                ],
                DE: [
                    { id: 'Checking Account', name: 'Checking Account', type: 'bank', region: 'DE', currency: '€', color: '#1e293b', theme: 'frankfurt-slate', balance: 0 },
                    { id: 'Cash (DE)', name: 'Cash', type: 'cash', region: 'DE', currency: '€', color: '#d4af37', theme: 'amber-gold', balance: 0 }
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

            // Ensure all draft wallets have a valid theme assigned
            for (const w of Object.values(this.draft.wallets)) {
                if (w && !w.theme) {
                    w.theme = this.getThemeForWallet(w).id;
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

            // Event delegation for Step 3 wallets (safe input rendering: no inline onclick/oninput with dynamic strings)
            const step3Container = document.getElementById('onboarding-step-3');
            if (step3Container && !step3Container._delegationBound) {
                step3Container._delegationBound = true;

                step3Container.addEventListener('input', (e) => {
                    if (e.target && e.target.classList.contains('onboarding-balance-input')) {
                        const walletId = e.target.getAttribute('data-wallet-id');
                        if (walletId) {
                            this.setWalletBalance(walletId, e.target.value);
                        }
                    }
                });

                step3Container.addEventListener('click', (e) => {
                    // 1. Delete button
                    const deleteBtn = e.target.closest('.onboarding-wallet-delete-btn');
                    if (deleteBtn) {
                        const walletId = deleteBtn.getAttribute('data-wallet-id');
                        if (walletId) {
                            this.deleteWallet(walletId);
                        }
                        return;
                    }

                    // 2. Edit button (pencil)
                    const editBtn = e.target.closest('.onboarding-wallet-edit-btn');
                    if (editBtn) {
                        const walletId = editBtn.getAttribute('data-wallet-id');
                        if (walletId) {
                            this.openWalletModal({ mode: 'edit', walletId });
                        }
                        return;
                    }

                    // 3. Click on wallet row left info (name/icon) to customize
                    const rowLeft = e.target.closest('.onboarding-wallet-row-left');
                    if (rowLeft) {
                        const walletId = rowLeft.getAttribute('data-wallet-id');
                        if (walletId) {
                            this.openWalletModal({ mode: 'edit', walletId });
                        }
                        return;
                    }

                    // 4. Add account button
                    const addBtn = e.target.closest('.onboarding-btn-add-wallet');
                    if (addBtn) {
                        const region = addBtn.getAttribute('data-region');
                        if (region) {
                            this.promptAddWallet(region);
                        }
                        return;
                    }
                });
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
            const stepPillMobile = document.getElementById('onboarding-step-indicator-mobile');
            const progressFill = document.getElementById('onboarding-progress-fill');
            const titleEl = document.getElementById('onboarding-step-title');
            const descEl = document.getElementById('onboarding-step-desc');
            const backBtn = document.getElementById('onboarding-back-btn');
            const nextBtn = document.getElementById('onboarding-next-btn');
            const nextText = document.getElementById('onboarding-next-text');
            const nextIcon = document.getElementById('onboarding-next-icon');

            if (stepPill) stepPill.textContent = `Step ${this.currentStep} of ${this.totalSteps}`;
            if (stepPillMobile) stepPillMobile.textContent = `Step ${this.currentStep} of ${this.totalSteps}`;
            if (progressFill) progressFill.style.width = `${(this.currentStep / this.totalSteps) * 100}%`;

            if (backBtn) {
                backBtn.style.display = this.currentStep > 1 ? 'inline-flex' : 'none';
            }

            if (nextText && nextIcon) {
                if (this.currentStep === this.totalSteps) {
                    nextText.textContent = 'Complete Setup & Launch';
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
                    desc: 'Set your monthly spending target and optional buffer for each country.'
                },
                3: {
                    title: 'Accounts & Wallets',
                    desc: 'Configure starting balances for your bank accounts and cash.'
                },
                4: {
                    title: 'Review & Launch',
                    desc: 'Review your accounts and budgets before starting.'
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
                         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();onboardingController.toggleCountry('${c.code}')}"
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

            // Sync loan config country if activeCountries changed
            if (!this.draft.activeCountries.includes(this.draft.loanConfig.country)) {
                const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };
                const fallbackCountry = this.draft.activeCountries.includes('IN')
                    ? 'IN'
                    : (this.draft.defaultCountry || this.draft.activeCountries[0] || 'JP');
                this.draft.loanConfig.country = fallbackCountry;
                this.draft.loanConfig.currency = currencySymbols[fallbackCountry] || '¥';
            }

            this._initDraftWallets();
            this.clearError();
            this.persistDraftLocally();
            this.renderStep1();
            this.updateLiveShowcase();
        }

        /**
         * Set primary sovereign country in Step 1.
         */
        setPrimaryCountry(code) {
            if (this.draft.activeCountries.includes(code)) {
                this.draft.defaultCountry = code;
                this.persistDraftLocally();
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
                                           value="${bConfig.monthlyTotal > 0 ? Number(bConfig.monthlyTotal) : ''}"
                                           oninput="onboardingController.setBudgetAmount('${code}', this.value)">
                                </div>
                            </div>

                            <label class="onboarding-checkbox-row">
                                <input type="checkbox" ${bConfig.rolloverEnabled ? 'checked' : ''}
                                       onchange="onboardingController.toggleBudgetRollover('${code}', this.checked)">
                                <span>Roll over unspent funds to next month (adds saved amount to next month's spending limit)</span>
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
            this.persistDraftLocally();
            this.renderStep2();
            this.updateLiveShowcase();
        }

        setBudgetAmount(country, amount) {
            if (!this.draft.budgets[country]) {
                this.draft.budgets[country] = { enabled: true, monthlyTotal: 0, rolloverEnabled: false };
            }
            this.draft.budgets[country].monthlyTotal = Math.max(0, Number(amount) || 0);
            this.persistDraftLocally();
            this.updateLiveShowcase();
        }

        toggleBudgetRollover(country, enabled) {
            if (this.draft.budgets[country]) {
                this.draft.budgets[country].rolloverEnabled = Boolean(enabled);
                this.persistDraftLocally();
            }
        }

        /**
         * STEP 3: Mandatory Wallets & Opening Balances.
         * Renders user values safely via escapeHtml and uses event delegation to prevent script injection
         * and attribute syntax errors on arbitrary wallet names (e.g. quotes, apostrophes).
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
                            <h3 class="onboarding-section-title">${this.escapeHtml(name)} Accounts</h3>
                            <button type="button" class="btn btn-secondary onboarding-btn-add-wallet"
                                    data-region="${this.escapeHtml(code)}">
                                <i data-lucide="plus"></i>
                                <span>Add Account</span>
                            </button>
                        </div>

                        <div class="onboarding-wallet-rows-list">
                `;

                walletsForCountry.forEach(w => {
                    const typeIcon = w.type === 'cash' ? 'wallet' : (w.type === 'digital' ? 'smartphone' : (w.type === 'card' ? 'credit-card' : 'landmark'));
                    const escapedId = this.escapeHtml(w.id);
                    const escapedName = this.escapeHtml(w.name || w.id);
                    const escapedType = this.escapeHtml((w.type || 'bank').toUpperCase());
                    const themeObj = this.getThemeForWallet(w);
                    const color = typeof w.color === 'string' && /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(w.color)
                        ? w.color : themeObj.color;

                    html += `
                        <div class="onboarding-wallet-row" data-wallet-id="${escapedId}">
                            <div class="onboarding-wallet-row-left" data-wallet-id="${escapedId}" title="Click to customize account">
                                <div class="onboarding-wallet-icon-box" style="border-color: ${color}">
                                    <i data-lucide="${typeIcon}"></i>
                                </div>
                                <div class="onboarding-wallet-row-info">
                                    <span class="onboarding-wallet-row-name" title="${escapedName}">${escapedName}</span>
                                    <span class="onboarding-wallet-row-type">${escapedType}</span>
                                </div>
                            </div>

                            <div class="onboarding-wallet-row-right">
                                <div class="auth-input-wrapper onboarding-balance-input-wrap">
                                    <span class="auth-input-icon" style="font-weight: 700;">${symbol}</span>
                                    <input type="number" min="0" step="any" class="auth-input onboarding-balance-input"
                                           placeholder="0"
                                           data-wallet-id="${escapedId}"
                                           value="${Number(w.balance) || ''}">
                                </div>
                                <button type="button" class="onboarding-wallet-edit-btn" title="Customize account"
                                        data-wallet-id="${escapedId}">
                                    <i data-lucide="pencil"></i>
                                </button>
                                ${walletsForCountry.length > 1 ? `
                                    <button type="button" class="onboarding-wallet-delete-btn" title="Remove account"
                                            data-wallet-id="${escapedId}">
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
                this.persistDraftLocally();
                this.updateLiveShowcase();
            }
        }

        /**
         * Resolve the appropriate theme for a given wallet object.
         */
        getThemeForWallet(w) {
            const allThemes = typeof WALLET_THEMES !== 'undefined' ? WALLET_THEMES : ONBOARDING_WALLET_THEMES;
            if (!w) return allThemes[0];
            if (w.theme) {
                const found = allThemes.find(t => t.id === w.theme);
                if (found) return found;
            }
            if (w.color) {
                const foundByColor = allThemes.find(t => t.color.toLowerCase() === w.color.toLowerCase());
                if (foundByColor) return foundByColor;
            }
            const nameLower = (w.name || w.id || '').toLowerCase();
            const typeLower = (w.type || '').toLowerCase();

            for (const t of allThemes) {
                if (t.match && t.match.some(k => nameLower.includes(k))) {
                    return t;
                }
            }
            if (typeLower === 'cash') return allThemes.find(t => t.id === 'amber-gold') || allThemes[2];
            if (typeLower === 'card') return allThemes.find(t => t.id === 'rose-gold') || allThemes[11];
            if (w.region === 'IN') return allThemes.find(t => t.id === 'burgundy-axis') || allThemes[3];
            if (w.region === 'DE') return allThemes.find(t => t.id === 'frankfurt-slate') || allThemes[14];
            return allThemes[0];
        }

        /**
         * Populate the theme picker gallery within the onboarding modal.
         * Prioritizes themes relevant to the active country.
         */
        populateThemePicker(containerId, activeThemeId, region = 'JP') {
            const container = document.getElementById(containerId);
            if (!container) return;

            const allThemes = typeof WALLET_THEMES !== 'undefined' ? WALLET_THEMES : ONBOARDING_WALLET_THEMES;

            // Prioritize themes by country context
            const countryThemes = {
                JP: ['emerald-salary', 'crimson-paypay', 'amber-gold', 'violet-suica', 'cyan-line'],
                IN: ['burgundy-axis', 'baroda-orange', 'sapphire-sbi', 'hfc-navy', 'icici-ruby', 'amber-gold'],
                DE: ['frankfurt-slate', 'amber-gold', 'aurora-nordic', 'rose-gold']
            };

            const primaryIds = countryThemes[region] || ['emerald-salary', 'amber-gold', 'crimson-paypay'];
            const sortedThemes = [
                ...primaryIds.map(id => allThemes.find(t => t.id === id)).filter(Boolean),
                ...allThemes.filter(t => !primaryIds.includes(t.id))
            ];

            let html = '';
            sortedThemes.forEach(t => {
                const isSelected = t.id === activeThemeId;
                const isPrimary = primaryIds.includes(t.id);
                const activeCls = isSelected ? ' active selected' : '';
                const featuredTag = isPrimary ? '<span class="theme-tag-frequent theme-tile-frequent">Featured</span>' : '';

                html += `
                    <div class="theme-picker-tile theme-tile${activeCls}" data-theme-id="${t.id}" role="radio" aria-checked="${isSelected}" title="${t.name}">
                        <div class="theme-tile-preview ${t.cls}">
                            <div class="theme-mini-chip"></div>
                            <div class="theme-tile-sheen"></div>
                            <div class="theme-tile-check">
                                <i data-lucide="check" style="width: 11px; height: 11px;"></i>
                            </div>
                            ${featuredTag}
                        </div>
                        <div class="theme-tile-name">${t.name}</div>
                    </div>
                `;
            });

            container.innerHTML = html;

            // Click listener for theme tiles
            container.querySelectorAll('.theme-picker-tile').forEach(tile => {
                tile.addEventListener('click', () => {
                    const themeId = tile.getAttribute('data-theme-id');
                    container.querySelectorAll('.theme-picker-tile').forEach(el => {
                        el.classList.remove('active', 'selected');
                        el.setAttribute('aria-checked', 'false');
                    });
                    tile.classList.add('active', 'selected');
                    tile.setAttribute('aria-checked', 'true');
                    const hiddenVal = document.getElementById('onboarding-modal-theme-val');
                    if (hiddenVal) hiddenVal.value = themeId;
                });
            });

            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }

            // Scroll active theme into view smoothly
            setTimeout(() => {
                const activeTile = container.querySelector(`[data-theme-id="${activeThemeId}"]`);
                if (activeTile && typeof activeTile.scrollIntoView === 'function') {
                    activeTile.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            }, 50);
        }

        /**
         * Open the wallet customization modal in either 'add' or 'edit' mode.
         */
        openWalletModal({ mode = 'add', region = 'JP', walletId = null }) {
            const modal = document.getElementById('onboarding-add-account-modal');
            const titleEl = document.getElementById('onboarding-add-modal-title');
            const subtitleEl = document.getElementById('onboarding-add-modal-subtitle');
            const nameInput = document.getElementById('onboarding-modal-account-name');
            const typeSelect = document.getElementById('onboarding-modal-account-type');
            const themeVal = document.getElementById('onboarding-modal-theme-val');
            const modeInput = document.getElementById('onboarding-modal-mode');
            const walletIdInput = document.getElementById('onboarding-modal-wallet-id');
            const regionInput = document.getElementById('onboarding-modal-region');
            const submitBtn = document.getElementById('onboarding-add-modal-submit');
            const errorEl = document.getElementById('onboarding-modal-account-error');
            const form = document.getElementById('onboarding-add-modal-form');
            const closeBtn = document.getElementById('onboarding-add-modal-close');
            const cancelBtn = document.getElementById('onboarding-add-modal-cancel');

            if (!modal || !nameInput || !form) {
                // Fallback for headless environments without modal markup
                if (mode === 'add') {
                    const fallbackName = prompt(`Enter account name for ${region}:`, 'Savings Account');
                    if (fallbackName && fallbackName.trim()) {
                        this._createWallet(region, fallbackName.trim());
                    }
                }
                return;
            }

            const countryNames = { JP: 'Japan', IN: 'India', DE: 'Germany' };
            const defaultNames = { JP: 'Savings Account', IN: 'Emergency Fund', DE: 'Savings Account' };
            const allThemes = typeof WALLET_THEMES !== 'undefined' ? WALLET_THEMES : ONBOARDING_WALLET_THEMES;

            let initialThemeId = 'emerald-salary';
            if (mode === 'edit' && walletId && this.draft.wallets[walletId]) {
                const w = this.draft.wallets[walletId];
                region = w.region || region;
                if (titleEl) titleEl.textContent = 'Edit Account';
                if (subtitleEl) subtitleEl.textContent = `Customize account details and card theme`;
                if (submitBtn) submitBtn.textContent = 'Save Changes';
                nameInput.value = w.name || w.id;
                if (typeSelect) typeSelect.value = w.type || 'bank';
                const currentTheme = this.getThemeForWallet(w);
                initialThemeId = currentTheme.id;
                if (walletIdInput) walletIdInput.value = walletId;
                if (modeInput) modeInput.value = 'edit';
                if (regionInput) regionInput.value = region;
            } else {
                // Add mode
                const cName = countryNames[region] || region;
                if (titleEl) titleEl.textContent = `Add ${cName} Account`;
                if (subtitleEl) subtitleEl.textContent = `Configure details and appearance for ${cName}`;
                if (submitBtn) submitBtn.textContent = 'Add Account';
                nameInput.value = defaultNames[region] || 'Savings Account';
                if (typeSelect) typeSelect.value = 'bank';
                const defaultThemeByRegion = { JP: 'emerald-salary', IN: 'burgundy-axis', DE: 'frankfurt-slate' };
                initialThemeId = defaultThemeByRegion[region] || 'emerald-salary';
                if (walletIdInput) walletIdInput.value = '';
                if (modeInput) modeInput.value = 'add';
                if (regionInput) regionInput.value = region;
            }

            if (themeVal) themeVal.value = initialThemeId;
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.style.display = 'none';
            }

            this.populateThemePicker('onboarding-wallet-theme-picker', initialThemeId, region);

            modal.style.display = 'flex';
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }

            setTimeout(() => {
                nameInput.focus();
                nameInput.select();
            }, 60);

            const closeModal = () => {
                modal.style.display = 'none';
                form.onsubmit = null;
                if (closeBtn) closeBtn.onclick = null;
                if (cancelBtn) cancelBtn.onclick = null;
                modal.onclick = null;
                window.removeEventListener('keydown', handleKey);
            };

            const handleKey = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeModal();
                }
            };

            const submitHandler = (e) => {
                if (e) e.preventDefault();
                const newName = (nameInput.value || '').trim();
                if (!newName) {
                    if (errorEl) {
                        errorEl.textContent = 'Account name cannot be empty.';
                        errorEl.style.display = 'block';
                    }
                    nameInput.focus();
                    return;
                }

                const currentMode = modeInput ? modeInput.value : 'add';
                const currentWalletId = walletIdInput ? walletIdInput.value : '';
                const currentRegion = regionInput ? regionInput.value : region;
                const currentType = typeSelect ? typeSelect.value : 'bank';
                const selectedThemeId = themeVal ? themeVal.value : initialThemeId;
                const selectedTheme = allThemes.find(t => t.id === selectedThemeId) || allThemes[0];

                if (currentMode === 'add') {
                    if (this.draft.wallets[newName]) {
                        if (errorEl) {
                            errorEl.textContent = `An account named "${newName}" already exists.`;
                            errorEl.style.display = 'block';
                        }
                        nameInput.focus();
                        return;
                    }
                    const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };
                    this.draft.wallets[newName] = {
                        id: newName,
                        name: newName,
                        type: currentType,
                        region: currentRegion,
                        currency: currencySymbols[currentRegion] || '¥',
                        color: selectedTheme.color,
                        theme: selectedTheme.id,
                        balance: 0
                    };
                } else if (currentMode === 'edit') {
                    const existing = this.draft.wallets[currentWalletId];
                    if (!existing) {
                        closeModal();
                        return;
                    }

                    // If renaming, check for collision with another wallet
                    if (newName !== currentWalletId && this.draft.wallets[newName]) {
                        if (errorEl) {
                            errorEl.textContent = `An account named "${newName}" already exists.`;
                            errorEl.style.display = 'block';
                        }
                        nameInput.focus();
                        return;
                    }

                    const preservedBalance = existing.balance || 0;
                    const preservedRegion = existing.region || currentRegion;
                    const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };

                    if (newName !== currentWalletId) {
                        delete this.draft.wallets[currentWalletId];
                    }

                    this.draft.wallets[newName] = {
                        ...existing,
                        id: newName,
                        name: newName,
                        type: currentType,
                        region: preservedRegion,
                        currency: existing.currency || currencySymbols[preservedRegion] || '¥',
                        color: selectedTheme.color,
                        theme: selectedTheme.id,
                        balance: preservedBalance
                    };
                }

                closeModal();
                this.persistDraftLocally();
                this.renderStep3();
                this.updateLiveShowcase();
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            };

            form.onsubmit = submitHandler;
            if (closeBtn) closeBtn.onclick = closeModal;
            if (cancelBtn) cancelBtn.onclick = closeModal;
            modal.onclick = (e) => {
                if (e.target === modal) closeModal();
            };
            window.addEventListener('keydown', handleKey);
        }

        promptAddWallet(countryCode, directName = null) {
            // Programmatic or automated test bypass: if directName is provided, create immediately
            if (typeof directName === 'string' && directName.trim()) {
                this._createWallet(countryCode, directName.trim());
                return;
            }
            this.openWalletModal({ mode: 'add', region: countryCode });
        }

        _createWallet(countryCode, trimmedName, chosenType = 'bank', chosenThemeId = null) {
            const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };
            const allThemes = typeof WALLET_THEMES !== 'undefined' ? WALLET_THEMES : ONBOARDING_WALLET_THEMES;

            let uniqueId = trimmedName;
            let counter = 1;
            while (this.draft.wallets[uniqueId]) {
                uniqueId = `${trimmedName} ${++counter}`;
            }

            const defaultThemeByRegion = { JP: 'emerald-salary', IN: 'burgundy-axis', DE: 'frankfurt-slate' };
            const themeId = chosenThemeId || defaultThemeByRegion[countryCode] || 'emerald-salary';
            const themeObj = allThemes.find(t => t.id === themeId) || allThemes[0];

            this.draft.wallets[uniqueId] = {
                id: uniqueId,
                name: uniqueId,
                type: chosenType,
                region: countryCode,
                currency: currencySymbols[countryCode] || '¥',
                color: themeObj.color,
                theme: themeObj.id,
                balance: 0
            };

            this.persistDraftLocally();
            this.renderStep3();
            this.updateLiveShowcase();
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }

        deleteWallet(walletId) {
            const w = this.draft.wallets[walletId];
            if (!w) return;

            // Ensure at least 1 wallet remains for this region
            const regionWallets = Object.values(this.draft.wallets).filter(item => item && item.region === w.region);
            if (regionWallets.length <= 1) {
                this.showError(`Each active country must have at least one account.`);
                return;
            }

            delete this.draft.wallets[walletId];
            this.persistDraftLocally();
            this.renderStep3();
            this.updateLiveShowcase();
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }

        /**
         * STEP 4: Optional Loan Tracking & Configuration Review.
         * Restrained, accurate fintech styling with dynamic currency support.
         */
        renderStep4() {
            const container = document.getElementById('onboarding-step-4');
            if (!container) return;

            const lConfig = this.draft.loanConfig;
            const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };
            const countryNames = { JP: 'Japan', IN: 'India', DE: 'Germany' };

            // Determine active loan currency
            if (!lConfig.country || !this.draft.activeCountries.includes(lConfig.country)) {
                lConfig.country = this.draft.activeCountries.includes('IN')
                    ? 'IN'
                    : (this.draft.defaultCountry || this.draft.activeCountries[0] || 'JP');
            }
            lConfig.currency = currencySymbols[lConfig.country] || '¥';
            const loanSymbol = lConfig.currency;

            let html = `
                <div class="onboarding-review-pane">
                    <!-- Optional Loan Tracking Card -->
                    <div class="onboarding-loan-card mb-4">
                        <div class="onboarding-loan-header">
                            <div>
                                <h3 class="onboarding-review-section-title">Track Existing Loan (Optional)</h3>
                                <p class="auth-desc">Monitor your loan principal balance and monthly payment benchmark.</p>
                            </div>
                            <label class="onboarding-toggle-switch">
                                <input type="checkbox" ${lConfig.enabled ? 'checked' : ''}
                                       onchange="onboardingController.toggleLoanTracking(this.checked)">
                                <span class="onboarding-toggle-slider"></span>
                            </label>
                        </div>

                        <div class="onboarding-loan-body mt-3" style="${lConfig.enabled ? '' : 'display: none;'}">
            `;

            // If user has multiple countries active, show country/currency dropdown
            if (this.draft.activeCountries.length > 1) {
                html += `
                    <div class="auth-field-group mb-3">
                        <label class="auth-label" for="onboarding-loan-country-select">Loan Country & Currency</label>
                        <div class="auth-input-wrapper">
                            <select id="onboarding-loan-country-select" class="auth-input onboarding-select" 
                                    onchange="onboardingController.setLoanCountry(this.value)">
                `;
                this.draft.activeCountries.forEach(code => {
                    const cName = countryNames[code] || code;
                    const cSym = currencySymbols[code] || '';
                    const isSelected = lConfig.country === code;
                    html += `<option value="${code}" ${isSelected ? 'selected' : ''}>${cName} (${cSym} ${code})</option>`;
                });
                html += `
                            </select>
                        </div>
                    </div>
                `;
            }

            html += `
                            <div class="onboarding-loan-grid">
                                <div class="auth-field-group">
                                    <label class="auth-label">Original Principal</label>
                                    <div class="auth-input-wrapper">
                                        <span class="auth-input-icon" style="font-weight: 700;">${loanSymbol}</span>
                                        <input type="number" min="0" class="auth-input" placeholder="e.g. 500000"
                                               value="${lConfig.totalPrincipal > 0 ? Number(lConfig.totalPrincipal) : ''}"
                                               oninput="onboardingController.setLoanField('totalPrincipal', this.value)">
                                    </div>
                                </div>
                                <div class="auth-field-group">
                                    <label class="auth-label">Remaining Principal</label>
                                    <div class="auth-input-wrapper">
                                        <span class="auth-input-icon" style="font-weight: 700;">${loanSymbol}</span>
                                        <input type="number" min="0" class="auth-input" placeholder="e.g. 420000"
                                               value="${lConfig.principalLeft > 0 ? Number(lConfig.principalLeft) : ''}"
                                               oninput="onboardingController.setLoanField('principalLeft', this.value)">
                                    </div>
                                </div>
                                <div class="auth-field-group">
                                    <label class="auth-label">Monthly Payment Benchmark</label>
                                    <div class="auth-input-wrapper">
                                        <span class="auth-input-icon" style="font-weight: 700;">${loanSymbol}</span>
                                        <input type="number" min="0" class="auth-input" placeholder="e.g. 12500"
                                               value="${lConfig.emi > 0 ? Number(lConfig.emi) : ''}"
                                               oninput="onboardingController.setLoanField('emi', this.value)">
                                    </div>
                                </div>
                                <div class="auth-field-group">
                                    <label class="auth-label">Annual Interest Rate (%)</label>
                                    <div class="auth-input-wrapper">
                                        <span class="auth-input-icon" style="font-weight: 700;">%</span>
                                        <input type="number" min="0" step="0.01" class="auth-input" placeholder="e.g. 8.5"
                                               value="${lConfig.annualInterestRate > 0 ? Number(lConfig.annualInterestRate) : ''}"
                                               oninput="onboardingController.setLoanField('annualInterestRate', this.value)">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Structured Ledger Review Summary -->
                    <div class="onboarding-summary-card">
                        <h3 class="onboarding-review-section-title mb-3">Setup Summary</h3>
                        
                        <div class="onboarding-summary-grid">
                            <div class="onboarding-summary-item">
                                <span class="onboarding-summary-label">Selected Countries</span>
                                <span class="onboarding-summary-val">${this.escapeHtml(this.draft.activeCountries.join(', '))} (Primary: ${this.escapeHtml(this.draft.defaultCountry)})</span>
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
                    .filter(w => w && w.region === c)
                    .reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
                const sym = currencySymbols[c] || '';
                return `${c}: ${sym}${total.toLocaleString()}`;
            }).join(' • ')}
                                </span>
                            </div>

                            <div class="onboarding-summary-item">
                                <span class="onboarding-summary-label">Loan Tracking</span>
                                <span class="onboarding-summary-val">
                                    ${lConfig.enabled ? `Enabled (${loanSymbol}${Number(lConfig.principalLeft || 0).toLocaleString()} remaining)` : 'Disabled'}
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
            this.persistDraftLocally();
            this.renderStep4();
        }

        setLoanCountry(code) {
            const currencySymbols = { JP: '¥', IN: '₹', DE: '€' };
            if (this.draft.activeCountries.includes(code)) {
                this.draft.loanConfig.country = code;
                this.draft.loanConfig.currency = currencySymbols[code] || '¥';
                this.persistDraftLocally();
                this.renderStep4();
            }
        }

        setLoanField(field, value) {
            this.draft.loanConfig[field] = Math.max(0, Number(value) || 0);
            this.persistDraftLocally();
        }

        /**
         * Update the live left-pane showcase.
         * Code-renders responsive JPY, INR, and EUR cards matching the login page craft in a 3-tier cascade.
         * Synchronized with draft wallet balances in real time.
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
            showcase.setAttribute('data-card-count', String(count));

            // Calculate live balances per country from draft wallets
            const getBal = (code) => {
                return Object.values(this.draft.wallets)
                    .filter(w => w && w.region === code)
                    .reduce((acc, w) => acc + (Number(w.balance) || 0), 0);
            };

            orderedCountries.forEach((code, idx) => {
                if (code === 'JP') {
                    const bal = getBal('JP');
                    html += `
                        <div class="auth-card-preview auth-card-jp" data-country="JP" data-card-index="${idx}" data-card-count="${count}">
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
                        <div class="auth-card-preview auth-card-in" data-country="IN" data-card-index="${idx}" data-card-count="${count}">
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
                        <div class="auth-card-preview auth-card-de" data-country="DE" data-card-index="${idx}" data-card-count="${count}">
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
         * Advances destination step and immediately persists the new destination step to draft.
         */
        handleNext() {
            if (this.isSubmitting) return;

            // Validate current step
            if (!this.validateStep(this.currentStep)) return;

            if (this.currentStep < this.totalSteps) {
                this.currentStep++;
                // Destination step is saved AFTER incrementing
                this.persistDraftLocally();
                this.render();
            } else {
                this.persistDraftLocally();
                this.confirmAndLaunch();
            }
        }

        /**
         * Navigation: Back Step.
         * Decrements destination step and immediately persists the new destination step to draft.
         */
        handleBack() {
            if (this.isSubmitting) return;
            if (this.currentStep > 1) {
                this.currentStep--;
                // Destination step is saved AFTER decrementing
                this.persistDraftLocally();
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

            if (!storage.state.preferences) {
                storage.state.preferences = (typeof storage.getDefaultPreferences === 'function')
                    ? storage.getDefaultPreferences()
                    : {};
            }

            // Update preferences draft
            storage.state.preferences.draftSaved = true;
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
                    console.warn('[Onboarding] Cloud synchronization could not be confirmed:');
                    this.showError(`Configuration saved locally, but cloud synchronization failed (${result.error || 'Network offline'}). Please check your connection and retry.`);
                    if (nextText) nextText.textContent = 'Retry Cloud Sync';
                    if (nextBtn) {
                        nextBtn.disabled = false;
                        nextBtn.onclick = () => this.retryCloudSync();
                    }
                }
            } catch (e) {
                console.error('[Onboarding] Exception during confirmation:');
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

    if (typeof EXPENSE_DEPLOYMENT === 'undefined') global.OnboardingController = OnboardingController;
    global.onboardingController = new OnboardingController();

})(typeof window !== 'undefined' ? window : this);
