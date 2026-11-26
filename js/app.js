const WALLET_COLORS = [
    '#10b981', '#ef4444', '#d4af37', '#bf5af2', '#f97316',
    '#3b82f6', '#06b6d4', '#ec4899', '#94a3b8', '#8b5cf6',
    '#14b8a6', '#f59e0b'
];

const WALLET_THEMES = [
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

if (typeof EXPENSE_DEPLOYMENT === 'undefined' && typeof window !== 'undefined') {
    window.WALLET_THEMES = WALLET_THEMES;
    window.WALLET_COLORS = WALLET_COLORS;
}
if (typeof EXPENSE_DEPLOYMENT === 'undefined' && typeof global !== 'undefined') {
    global.WALLET_THEMES = WALLET_THEMES;
    global.WALLET_COLORS = WALLET_COLORS;
}

class App {
    constructor() {
        this.currentView = 'home-view';
        this.viewingMonthKey = null; // null means current month
        this.renderedHistoryCharts = new Set(); // track which history indices have had charts drawn
        this.isPrivacyHidden = true; // Central privacy state: default concealed
        this.inactivityTimer = null;
        this.lastActivityTime = Date.now();
        this.inactivityTimeoutMs = 3 * 60 * 1000; // 3 minutes
        this.inactivityEventsRegistered = false;
        this.navigationEventsRegistered = false;
        this.activityThrottleTimer = null;
        this._isSubmitting = false;
        this.dashboardChartRegion = 'JP'; // Pass 1: Dashboard Category Chart Active Region (JP or IN)

        // Phase 3: Transactions Continuous Ledger state
        this.ledgerSearchQuery = '';
        this.ledgerSearchDebounceTimer = null;
        this._pendingSearchQuery = null;
        this.ledgerFilters = {
            type: 'all',
            categoryId: 'all',
            walletId: 'all',
            region: 'all',
            datePreset: 'all',
            startDate: '',
            endDate: '',
            minAmount: null,
            maxAmount: null
        };
        this.ledgerPageSize = 30;
        this.ledgerVisibleCount = 30;
        this.currentDetailTxId = null;

        // Phase 3: Analytics state
        this.analyticsCountry = 'JP';
        this.analyticsPeriod = 'this-month';
        this.jpTrendGranularity = 'daily';
        this.jpAnalyticsUserId = storage.currentUserId;
        this.jpExclusions = new Set(this.getJapanExclusions(storage.state));
        this.selectedDrilldownCategoryId = null;

        // Phase 4: Reports, Budgets & Closing Wizard state
        this.reportRegion = 'JP';
        this.reportMonthKey = (storage.state && storage.state.currentMonthKey) || new Date().toISOString().slice(0, 7);
        this.reportSnapshotsCache = (storage.state && storage.state.reportSnapshots) || {};
        this.budgetsRegion = 'JP';
        this.budgetsMonthKey = (storage.state && storage.state.currentMonthKey) || new Date().toISOString().slice(0, 7);
        this.selectedCatIcon = 'tag';
        this.editingCatId = null;
        this.closingWizardState = {
            step: 1,
            monthKey: (storage.state && storage.state.currentMonthKey) || new Date().toISOString().slice(0, 7),
            nextMonthKey: '',
            budgetOption: 'copy',
            adjustmentPercent: 0,
            customJpBudget: 0,
            customCatBudgets: {}
        };
        this.budgetRecoveryState = {
            option: 'review',
            customAdjustments: {},
            preview: null
        };
    }

    init() {
        this._cancelLedgerSearchTimer();
        this.ledgerSearchQuery = '';
        this.syncJapanAnalyticsPreferences();
        storage.checkRollover();
        this.initSidebarState();
        this.setupNavigation();
        this.setupInactivityMonitoring();
        this.updatePrivacyUI();
        this.updateDesktopAccountInfo();
        this.renderAll();
        if (['analytics-view', 'budgets-view', 'reports-view', 'transactions-view', 'history-view'].includes(this.currentView)) {
            this.switchView(this.currentView);
        }

        // Gated Budget Recovery & Reconciliation Check
        if (typeof storage !== 'undefined' && storage.getBudgetRecoveryStatus() === 'BUDGET_RECOVERY_REQUIRED') {
            this.updateBudgetRecoveryBanner();
            this.openBudgetRecoveryModal();
        } else {
            this.updateBudgetRecoveryBanner();
        }
    }

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    safeWalletColor(color) {
        return typeof color === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : '#3351d6';
    }

    categoryIcon(icon) {
        return typeof icon === 'string' && /^[a-z0-9-]+$/.test(icon) ? icon : 'tag';
    }

    getCountryFlagSvg(region, width = 18, height = 13.5) {
        if (typeof CountryConfig !== 'undefined' && typeof CountryConfig.getFlagSvg === 'function') {
            const svg = CountryConfig.getFlagSvg(region, width, height);
            if (svg) return svg;
        }
        if (region === 'JP' || region === 'JPY') {
            return `<svg class="country-flag-svg flag-jp" viewBox="0 0 640 480" width="${width}" height="${height}" style="border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,0.14);vertical-align:middle;display:inline-block;flex-shrink:0;" aria-label="Japan"><rect width="640" height="480" fill="#ffffff"/><circle cx="320" cy="240" r="120" fill="#bc002d"/></svg>`;
        } else if (region === 'IN' || region === 'INR') {
            return `<svg class="country-flag-svg flag-in" viewBox="0 0 640 480" width="${width}" height="${height}" style="border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,0.14);vertical-align:middle;display:inline-block;flex-shrink:0;" aria-label="India"><path fill="#f4f5f8" d="M0 160h640v160H0z"/><path fill="#ff9933" d="M0 0h640v160H0z"/><path fill="#138808" d="M0 320h640v160H0z"/><circle cx="320" cy="240" r="40" fill="#000080"/><circle cx="320" cy="240" r="32" fill="#ffffff"/><circle cx="320" cy="240" r="8" fill="#000080"/></svg>`;
        } else if (region === 'DE' || region === 'EUR') {
            return `<svg class="country-flag-svg flag-de" viewBox="0 0 640 480" width="${width}" height="${height}" style="border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,0.14);vertical-align:middle;display:inline-block;flex-shrink:0;" aria-label="Germany"><rect width="640" height="160" y="0" fill="#000000"/><rect width="640" height="160" y="160" fill="#dd0000"/><rect width="640" height="160" y="320" fill="#ffce00"/></svg>`;
        }
        return '';
    }

    getCardChipSvg() {
        return `<svg class="card-chip-svg" width="34" height="26" viewBox="0 0 34 26" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="0.5" y="0.5" width="33" height="25" rx="4.5" fill="#e5c158" stroke="#a67c1e" stroke-width="1"/>
            <rect x="1.5" y="1.5" width="31" height="23" rx="3.5" fill="#d9b247" stroke="#fff0a6" stroke-width="0.6" stroke-opacity="0.55"/>
            <rect x="11" y="7" width="12" height="12" rx="2.5" fill="#caa038" stroke="#8c6414" stroke-width="0.75"/>
            <rect x="12.5" y="8.5" width="9" height="9" rx="1.5" fill="#dfb750"/>
            <path d="M1 10h10M23 10h10M1 16h10M23 16h10M17 1v6M17 19v6M7.5 10v6M26.5 10v6" stroke="#805b10" stroke-width="0.85" stroke-linecap="round"/>
        </svg>`;
    }

    getContactlessSvg() {
        return `<svg class="card-contactless-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.65;" aria-hidden="true">
            <path d="M8.5 16.5a5 5 0 0 1 0-9"/>
            <path d="M12 19a9 9 0 0 0 0-14"/>
            <path d="M15.5 21.5a13 13 0 0 0 0-19"/>
        </svg>`;
    }

    toggleWalletsSection(regionKey) {
        if (!this.collapsedWalletSections) this.collapsedWalletSections = new Set();
        const rKey = regionKey.toLowerCase();
        const isCollapsed = this.collapsedWalletSections.has(rKey);
        const container = document.getElementById(`wallets-container-${rKey}`);
        const chevron = document.getElementById(`wallets-chevron-${rKey}`);

        if (isCollapsed) {
            this.collapsedWalletSections.delete(rKey);
            if (container) container.classList.remove('collapsed');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        } else {
            this.collapsedWalletSections.add(rKey);
            if (container) container.classList.add('collapsed');
            if (chevron) chevron.style.transform = 'rotate(-90deg)';
        }
    }

    formatMoney(amount, currency = '', options = {}) {
        if (this.isPrivacyHidden && !options.ignorePrivacy && !options.forceVisible) {
            return '******';
        }
        let sym = typeof currency === 'string' && /^(?:[A-Z]{3}|\p{Sc})$/u.test(currency) ? currency : '';
        if (sym === 'JPY') sym = '¥';
        else if (sym === 'INR') sym = '₹';
        else if (sym === 'EUR') sym = '€';
        const num = Number(amount) || 0;
        const prefix = options.prefix || '';
        const locale = options.locale || (sym === '₹' ? 'en-IN' : (sym === '€' ? 'de-DE' : undefined));
        const formatted = num.toLocaleString(locale, options.formatOptions);
        return `${prefix}${sym}${formatted}`;
    }

    setupInactivityMonitoring() {
        if (this.inactivityEventsRegistered) return;
        this.inactivityEventsRegistered = true;

        const onUserActivity = () => {
            if (this.activityThrottleTimer) return;
            this.activityThrottleTimer = setTimeout(() => {
                this.activityThrottleTimer = null;
            }, 3000); // Throttle activity resets to at most once per 3 seconds

            this.resetInactivityTimer();
        };

        const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'click'];
        events.forEach(evt => {
            window.addEventListener(evt, onUserActivity, { passive: true });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (!this.isPrivacyHidden) {
                    const elapsed = Date.now() - this.lastActivityTime;
                    if (elapsed >= this.inactivityTimeoutMs) {
                        this.setPrivacyHidden(true);
                    } else {
                        this.startInactivityTimer(this.inactivityTimeoutMs - elapsed);
                    }
                }
            }
        });

        // Close Reports "More Actions" dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const moreActions = document.getElementById('reports-more-actions');
            if (moreActions && moreActions.hasAttribute('open') && !moreActions.contains(e.target)) {
                moreActions.removeAttribute('open');
            }
        });
    }

    resetInactivityTimer() {
        this.lastActivityTime = Date.now();
        if (!this.isPrivacyHidden) {
            this.startInactivityTimer(this.inactivityTimeoutMs);
        }
    }

    startInactivityTimer(delayMs) {
        this.clearInactivityTimer();
        this.inactivityTimer = setTimeout(() => {
            this.setPrivacyHidden(true);
        }, Math.max(0, delayMs));
    }

    clearInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }

    togglePrivacy() {
        this.setPrivacyHidden(!this.isPrivacyHidden);
    }

    setPrivacyHidden(hidden) {
        this.isPrivacyHidden = Boolean(hidden);

        if (this.isPrivacyHidden) {
            this.clearInactivityTimer();
        } else {
            this.resetInactivityTimer();
        }

        this.updatePrivacyUI();

        // Re-render the active view to reflect privacy state
        if (this.currentView === 'home-view') {
            this.renderAll();
        } else if (this.currentView === 'wallets-view') {
            this.renderWalletsPage();
        } else if (this.currentView === 'transactions-view') {
            this.renderTransactionsPage();
        } else if (this.currentView === 'analytics-view') {
            this.renderAnalyticsPage();
        } else if (this.currentView === 'history-view') {
            this.renderHistory();
        } else if (this.currentView === 'budgets-view') {
            this.renderBudgetsPage();
        } else if (this.currentView === 'reports-view') {
            this.renderReportsPage();
        } else if (this.currentView === 'settings-view') {
            this.renderSettings();
        }

        // If focus overlay is visible, refresh its privacy-blurred items
        const overlay = document.getElementById('focus-overlay');
        if (overlay && overlay.style.display !== 'none') {
            const typeBadge = document.getElementById('focus-type-badge');
            const titleEl = document.getElementById('focus-modal-title');
            if (typeBadge && typeBadge.innerText === 'Country View') {
                const reg = titleEl && titleEl.innerText.includes('India') ? 'IN' : (titleEl && titleEl.innerText.includes('Germany') ? 'DE' : 'JP');
                this.openCountryExpansion(reg);
            } else if (titleEl) {
                this.openWalletFocus(titleEl.innerText);
            }
        }

    }

    updatePrivacyUI() {
        const btns = document.querySelectorAll('.global-privacy-btn');
        btns.forEach(btn => {
            if (this.isPrivacyHidden) {
                btn.innerHTML = `<i data-lucide="eye-off"></i>`;
                btn.setAttribute('aria-label', 'Reveal monetary values');
                btn.setAttribute('title', 'Reveal monetary values');
                btn.classList.remove('revealed');
            } else {
                btn.innerHTML = `<i data-lucide="eye"></i>`;
                btn.setAttribute('aria-label', 'Conceal monetary values');
                btn.setAttribute('title', 'Conceal monetary values');
                btn.classList.add('revealed');
            }
        });
        this.refreshIcons();
    }

    refreshIcons(rootEl) {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            if (rootEl && (rootEl.nodeType === 1 || rootEl.nodeType === 9)) {
                try {
                    window.lucide.createIcons({ root: rootEl });
                    return;
                } catch (e) {
                    // Fall back to unscoped scan if scoped call fails
                }
            }
            window.lucide.createIcons();
        }
    }



    get activeMonthKey() {
        return this.viewingMonthKey || storage.state.currentMonthKey;
    }

    isViewingPast() {
        return this.viewingMonthKey && this.viewingMonthKey !== storage.state.currentMonthKey;
    }

    getActiveTransactions() {
        const mKey = this.viewingMonthKey || (storage.state ? storage.state.currentMonthKey : null);
        if (mKey && typeof walletManager !== 'undefined' && typeof walletManager.getTransactions === 'function') {
            return walletManager.getTransactions({ monthKey: mKey });
        }
        if (this.isViewingPast()) {
            const h = storage.state.history.find(x => x.monthKey === this.viewingMonthKey);
            return h ? (h.transactions || []) : [];
        }
        return storage.state.transactions || [];
    }

    changeMonth(delta) {
        // Collect all available months (current + history)
        const allMonths = [storage.state.currentMonthKey, ...storage.state.history.map(h => h.monthKey)];
        // Ensure unique
        const uniqueMonths = [...new Set(allMonths)].sort().reverse();

        const currentIndex = uniqueMonths.indexOf(this.activeMonthKey);
        let newIndex = currentIndex - delta; // -1 means go older (higher index), +1 means go newer (lower index)

        if (newIndex < 0) newIndex = 0;
        if (newIndex >= uniqueMonths.length) newIndex = uniqueMonths.length - 1;

        const newMonth = uniqueMonths[newIndex];

        if (newMonth === storage.state.currentMonthKey) {
            this.viewingMonthKey = null;
        } else {
            this.viewingMonthKey = newMonth;
        }

        this.renderAll();
    }

    setupNavigation() {
        // These controls live in the static shell across account changes and resyncs.
        if (this.navigationEventsRegistered) return;
        this.navigationEventsRegistered = true;

        // Desktop & Mobile drawer navigation items
        document.querySelectorAll('.desktop-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.currentTarget.getAttribute('data-target');
                this.switchView(target);
            });
        });

        // Keyboard shortcuts (Escape key dismisses mobile drawer, fab menu, focus overlay and modals)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const sidebar = document.getElementById('desktop-sidebar');
                if (sidebar && sidebar.classList.contains('mobile-open')) {
                    this.closeMobileSidebar();
                    return;
                }
                const fabMenu = document.getElementById('fab-menu');
                if (fabMenu && fabMenu.classList.contains('active')) {
                    this.toggleFabMenu();
                    return;
                }
                const detailModal = document.getElementById('transaction-detail-modal');
                if (detailModal && detailModal.classList.contains('active')) {
                    this.closeTransactionDetail();
                    return;
                }
                const overallBudgetModal = document.getElementById('overall-budget-modal');
                if (overallBudgetModal && overallBudgetModal.classList.contains('active')) {
                    this.closeOverallBudgetModal();
                    return;
                }
                const menu = document.getElementById('sidebar-account-menu');
                if (menu && menu.classList.contains('active')) {
                    menu.classList.remove('active');
                    return;
                }
                const moreActions = document.getElementById('reports-more-actions');
                if (moreActions && moreActions.hasAttribute('open')) {
                    moreActions.removeAttribute('open');
                    document.getElementById('btn-reports-more-actions')?.focus();
                    return;
                }
                const actionSelector = document.getElementById('tx-action-selector-modal');
                if (actionSelector && actionSelector.classList.contains('active')) {
                    this.closeUnifiedTransactionSelector();
                    return;
                }
                const overlay = document.getElementById('focus-overlay');
                if (overlay && overlay.style.display !== 'none') {
                    this.closeFocusOverlay();
                    return;
                }
                ['add-wallet-modal', 'edit-wallet-modal', 'transaction-modal', 'tx-action-selector-modal', 'quick-edit-modal', 'color-picker-modal', 'pdf-modal', 'category-manage-modal'].forEach(mId => {
                    const el = document.getElementById(mId);
                    if (el && el.classList.contains('active')) {
                        this.closeModal(mId);
                    }
                });
            }
        });

        // Close sidebar account popover on outside click
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('sidebar-account-menu');
            const card = document.getElementById('sidebar-account-card');
            if (menu && menu.classList.contains('active')) {
                if (!menu.contains(e.target) && !card?.contains(e.target)) {
                    menu.classList.remove('active');
                }
            }
        });

        // Setup mouse-wheel & drag-to-scroll for horizontal pill strips on PC
        const settingsTabList = document.querySelector('.settings-tab-list');
        if (settingsTabList) {
            settingsTabList.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0 && settingsTabList.scrollWidth > settingsTabList.clientWidth) {
                    e.preventDefault();
                    settingsTabList.scrollLeft += e.deltaY;
                }
            }, { passive: false });

            let isDown = false;
            let startX = 0;
            let scrollLeft = 0;
            settingsTabList.addEventListener('mousedown', (e) => {
                isDown = true;
                settingsTabList.classList.add('dragging');
                startX = e.pageX - settingsTabList.offsetLeft;
                scrollLeft = settingsTabList.scrollLeft;
            });
            window.addEventListener('mouseup', () => {
                if (isDown) {
                    isDown = false;
                    settingsTabList.classList.remove('dragging');
                }
            });
            settingsTabList.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - settingsTabList.offsetLeft;
                const walk = (x - startX) * 1.5;
                settingsTabList.scrollLeft = scrollLeft - walk;
            });
        }
    }

    switchView(viewId) {
        if (!viewId) return;
        this._flushLedgerSearchTimer();

        // Approved view titles and contextual subtitles
        const viewTitles = {
            'home-view': 'Dashboard',
            'dashboard-view': 'Dashboard',
            'transactions-view': 'Transactions',
            'analytics-view': 'Analytics',
            'reports-view': 'Reports',
            'budgets-view': 'Budgets',
            'wallets-view': 'Wallets',
            'settings-view': 'Settings',
            'history-view': 'History'
        };

        const viewSubtitles = {
            'home-view': 'Overview & Balances',
            'dashboard-view': 'Overview & Balances',
            'transactions-view': 'Activity & Ledger',
            'analytics-view': 'Spending Patterns & Insights',
            'reports-view': 'Statements & Snapshots',
            'budgets-view': 'Limits & Targets',
            'wallets-view': 'Accounts & Cards',
            'settings-view': 'Preferences & Backup',
            'history-view': 'Historical Archives'
        };

        const resolvedId = (viewId === 'dashboard-view') ? 'home-view' : viewId;

        // Hide all views, activate selected view
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const targetView = document.getElementById(resolvedId);
        if (targetView) {
            targetView.classList.add('active');
        }

        // Synchronize active item on sidebar
        document.querySelectorAll('.desktop-nav-item').forEach(n => {
            const t = n.getAttribute('data-target');
            if (t === resolvedId || (resolvedId === 'home-view' && t === 'home-view')) {
                n.classList.add('active');
            } else {
                n.classList.remove('active');
            }
        });

        // Ensure mobile drawer is closed upon view transition
        this.closeMobileSidebar();

        // Update Desktop Header title and subtitle
        const pageTitleEl = document.getElementById('desktop-page-title');
        if (pageTitleEl) {
            pageTitleEl.innerText = viewTitles[resolvedId] || 'Dashboard';
        }
        const pageSubtitleEl = document.getElementById('desktop-page-subtitle');
        if (pageSubtitleEl) {
            pageSubtitleEl.innerText = viewSubtitles[resolvedId] || 'Overview & Accounts';
        }

        // Toggle Month Selector visibility in Desktop Header (Dashboard & Reports only)
        const monthSelectorEl = document.getElementById('desktop-month-selector');
        const desktopHeaderEl = document.getElementById('desktop-header');
        const showMonth = (resolvedId === 'home-view' || resolvedId === 'reports-view');
        if (monthSelectorEl) {
            monthSelectorEl.style.display = showMonth ? 'inline-flex' : 'none';
        }
        if (desktopHeaderEl) {
            desktopHeaderEl.classList.toggle('has-month-selector', showMonth);
        }

        this.currentView = resolvedId;

        // View-specific render execution
        if (resolvedId === 'transactions-view') {
            this.renderTransactionsPage();
        } else if (resolvedId === 'analytics-view') {
            this.renderAnalyticsPage();
        } else if (resolvedId === 'reports-view') {
            this.renderReportsPage();
        } else if (resolvedId === 'budgets-view') {
            this.renderBudgetsPage();
        } else if (resolvedId === 'history-view') {
            this.renderHistory();
        } else if (resolvedId === 'home-view') {
            this.renderAll();
        } else if (resolvedId === 'wallets-view') {
            this.renderWalletsPage();
        } else if (resolvedId === 'settings-view') {
            this.renderSettings();
        }

        this.refreshIcons(targetView);
    }

    toggleSidebarCollapse() {
        const sidebar = document.getElementById('desktop-sidebar');
        if (!sidebar) return;
        const isCollapsed = sidebar.classList.toggle('collapsed');
        try {
            localStorage.setItem('em_sidebar_collapsed', isCollapsed ? 'true' : 'false');
        } catch (e) {
            console.warn('[UI] Failed to save sidebar collapse state:');
        }
    }

    initSidebarState() {
        try {
            if (localStorage.getItem('em_sidebar_collapsed') === 'true') {
                const sidebar = document.getElementById('desktop-sidebar');
                if (sidebar) sidebar.classList.add('collapsed');
            }
        } catch (e) {
            console.warn('[UI] Failed to read sidebar collapse state:');
        }
    }

    openMobileSidebar() {
        const sidebar = document.getElementById('desktop-sidebar');
        const backdrop = document.getElementById('mobile-sidebar-backdrop');
        if (sidebar) sidebar.classList.add('mobile-open');
        if (backdrop) backdrop.classList.add('active');
        document.body.classList.add('drawer-open');
    }

    closeMobileSidebar() {
        const sidebar = document.getElementById('desktop-sidebar');
        const backdrop = document.getElementById('mobile-sidebar-backdrop');
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (backdrop) backdrop.classList.remove('active');
        document.body.classList.remove('drawer-open');
    }

    toggleMobileSidebar() {
        const sidebar = document.getElementById('desktop-sidebar');
        if (sidebar && sidebar.classList.contains('mobile-open')) {
            this.closeMobileSidebar();
        } else {
            this.openMobileSidebar();
        }
    }

    updateDesktopAccountInfo() {
        const user = (typeof supabaseClient !== 'undefined' && supabaseClient.session) ? supabaseClient.session.user : null;
        const nameEl = document.getElementById('desktop-account-name');
        const emailEl = document.getElementById('desktop-account-email');
        const initialsEl = document.getElementById('account-avatar-initials');
        const popoverNameEl = document.getElementById('popover-account-name');
        const popoverEmailEl = document.getElementById('popover-account-email');

        const customName = storage.state?.userProfile?.displayName;

        if (user) {
            const email = user.email || '';
            const displayName = customName || user.user_metadata?.full_name || email.split('@')[0] || 'User';
            if (nameEl) nameEl.innerText = displayName;
            if (emailEl) emailEl.innerText = email;
            if (popoverNameEl) popoverNameEl.innerText = displayName;
            if (popoverEmailEl) popoverEmailEl.innerText = email;
            if (initialsEl) {
                const parts = displayName.trim().split(/\s+/);
                const initials = parts.length > 1
                    ? (parts[0][0] + parts[1][0]).toUpperCase()
                    : displayName.substring(0, 2).toUpperCase();
                initialsEl.innerText = initials || 'TK';
            }
        } else {
            const displayName = customName || 'Personal';
            if (nameEl) nameEl.innerText = displayName;
            if (emailEl) emailEl.innerText = 'Connected';
            if (popoverNameEl) popoverNameEl.innerText = displayName;
            if (popoverEmailEl) popoverEmailEl.innerText = 'Connected';
            if (initialsEl) initialsEl.innerText = 'TK';
        }

        const aboutEnvEl = document.getElementById('about-env-label');
        if (aboutEnvEl) {
            const envName = (window.SUPABASE_CONFIG?.environment === 'production') ? 'Production' : 'Development';
            const projectRef = window.SUPABASE_CONFIG?.projectRef || 'unconfigured';
            aboutEnvEl.innerText = `${envName} (${projectRef})`;
        }
    }

    setSyncStatus(status = 'synced') {
        const dot = document.getElementById('sync-status-dot');
        const text = document.getElementById('sync-status-text');
        if (!dot || !text) return;

        dot.classList.remove('syncing', 'offline');
        if (status === 'syncing') {
            dot.classList.add('syncing');
            text.innerText = 'Syncing...';
        } else if (status === 'offline') {
            dot.classList.add('offline');
            text.innerText = 'Offline';
        } else {
            text.innerText = 'Cloud Synced';
        }
    }

    toggleFabMenu() {
        const fab = document.getElementById('main-fab');
        const menu = document.getElementById('fab-menu');
        fab.classList.toggle('open');
        menu.classList.toggle('active');
    }

    toggleCollapse(wrapId, iconId) {
        const wrap = document.getElementById(wrapId);
        if (wrap) {
            wrap.classList.toggle('collapsed');
            const isCollapsed = wrap.classList.contains('collapsed');
            const toggleBtn = wrap.previousElementSibling;
            if (toggleBtn && toggleBtn.classList.contains('section-header-toggle')) {
                toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
            }
        }
        if (iconId) {
            const icon = document.getElementById(iconId);
            if (icon) icon.classList.toggle('rotated');
        }
    }

    getWalletOptionsHtml(selectedWalletId = null, regionFilter = null, options = {}) {
        if (!storage.state || !storage.state.wallets) return '';

        const activeCountries = storage.getActiveCountries();
        const groups = {};
        const excludeWalletId = options.excludeWalletId || null;
        const requiredCurrency = options.currency || null;
        const excludedCurrency = options.excludeCurrency || null;

        Object.values(storage.state.wallets).forEach(w => {
            if (excludeWalletId && w.id === excludeWalletId) return;
            if (regionFilter && w.region !== regionFilter) return;
            if (!regionFilter && !activeCountries.includes(w.region)) return;
            if (requiredCurrency && w.currency !== requiredCurrency) return;
            if (excludedCurrency && w.currency === excludedCurrency) return;

            const reg = w.region || 'JP';
            if (!groups[reg]) groups[reg] = [];
            const sel = (w.id === selectedWalletId) ? ' selected' : '';
            const escId = this.escapeHtml(w.id);
            groups[reg].push(`<option value="${escId}"${sel}>${escId} (${this.escapeHtml(w.currency)})</option>`);
        });

        if (regionFilter) {
            return (groups[regionFilter] || []).join('');
        }

        let html = '';
        const order = ['JP', 'IN', 'DE'];
        order.forEach(code => {
            if (groups[code] && groups[code].length > 0) {
                const cfg = (typeof CountryConfig !== 'undefined' && CountryConfig.get(code)) || { name: code };
                html += `<optgroup label="${this.escapeHtml(cfg.name)}">${groups[code].join('')}</optgroup>`;
            }
        });
        Object.keys(groups).forEach(code => {
            if (!order.includes(code) && groups[code].length > 0) {
                html += `<optgroup label="${this.escapeHtml(code)}">${groups[code].join('')}</optgroup>`;
            }
        });
        return html;
    }

    setupDatePickerHelper() {
        const dateInput = document.getElementById('tx-date');
        if (dateInput) {
            dateInput.addEventListener('click', () => {
                if (typeof dateInput.showPicker === 'function') {
                    try {
                        dateInput.showPicker();
                    } catch (e) {
                        // Browser security or unsupported fallback
                    }
                }
            });
        }
    }

    openUnifiedTransactionSelector(context = null) {
        if (typeof storage !== 'undefined' && storage.getBudgetRecoveryStatus() === 'BUDGET_RECOVERY_REQUIRED') {
            console.warn('[App] New transaction creation paused pending budget recovery.');
            this.openBudgetRecoveryModal();
            return;
        }
        this.currentTxContext = context;
        const modal = document.getElementById('tx-action-selector-modal');
        if (!modal) return;
        const sub = document.getElementById('tx-selector-sub');
        if (sub) {
            if (context && context.walletId) {
                sub.innerText = `Record for ${context.walletId}`;
            } else if (context && context.region) {
                const countryName = context.region === 'JP' ? 'Japan (JPY)' : (context.region === 'DE' ? 'Germany (EUR)' : 'India (INR)');
                sub.innerText = `Record for ${countryName}`;
            } else {
                sub.innerText = 'Select transaction type to record';
            }
        }
        modal.classList.add('active');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    closeUnifiedTransactionSelector() {
        this.currentTxContext = null;
        const modal = document.getElementById('tx-action-selector-modal');
        if (modal) modal.classList.remove('active');
        const sub = document.getElementById('tx-selector-sub');
        if (sub) sub.innerText = 'Select transaction type to record';
    }

    selectTransactionType(type) {
        const ctx = this.currentTxContext;
        this._txModalSource = 'selector';
        this.closeUnifiedTransactionSelector();
        this.closeFocusOverlay();
        this.openTransactionModal(type, ctx);
    }

    handleTransactionModalBack() {
        const source = this._txModalSource;
        const ctx = this.currentTxContext;
        const detailId = this._lastDetailTxId;
        this._txModalSource = null;
        this.closeModal('transaction-modal');
        if (source === 'detail' && detailId) {
            this.openTransactionDetail(detailId);
        } else if (source === 'selector') {
            this.openUnifiedTransactionSelector(ctx);
        }
    }

    openTransactionModal(type, context = null) {
        if (typeof storage !== 'undefined' && storage.getBudgetRecoveryStatus() === 'BUDGET_RECOVERY_REQUIRED') {
            console.warn('[App] New transaction creation paused pending budget recovery.');
            this.openBudgetRecoveryModal();
            return;
        }
        if (!this._txModalSource) {
            this._txModalSource = 'selector';
        }
        if (context) {
            this.currentTxContext = context;
        }
        document.getElementById('main-fab').classList.remove('open');
        document.getElementById('fab-menu').classList.remove('active');

        const modal = document.getElementById('transaction-modal');
        const title = document.getElementById('modal-title');
        const content = document.getElementById('modal-content');

        const currentDate = typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0];
        let formInnerHtml = '';

        const allWalletOpts = this.getWalletOptionsHtml();
        const jpWalletOpts = this.getWalletOptionsHtml(null, 'JP');
        const inWalletOpts = this.getWalletOptionsHtml(null, 'IN');

        if (type === 'expense') {
            title.innerText = 'Log Expense';
            formInnerHtml = `
                <div class="form-group">
                    <label for="tx-date">Date</label>
                    <input type="date" id="tx-date" value="${currentDate}">
                </div>
                <div class="form-group">
                    <label for="tx-wallet">Wallet</label>
                    <select id="tx-wallet" onchange="app.updateExpenseCategories()">
                        ${allWalletOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label for="tx-category">Category</label>
                    <select id="tx-category" onchange="app.handleCategoryChange()"></select>
                </div>
                <div class="form-group hidden" id="tx-subcategory-group">
                    <label for="tx-subcategory">Specific Utility</label>
                    <select id="tx-subcategory"></select>
                </div>
                <div class="form-group">
                    <label for="tx-amount">Amount</label>
                    <input type="number" id="tx-amount" step="any" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Note (Optional)</label>
                    <input type="text" id="tx-note" placeholder="What was this for?">
                </div>
                <button type="submit" class="btn btn-tx-submit btn-tx-expense" id="tx-submit-btn">
                    <i data-lucide="arrow-up-right"></i>
                    <span>Save Expense</span>
                </button>
            `;
        } else if (type === 'transfer') {
            title.innerText = 'Transfer Between Wallets';
            const allWalletsList = Object.values(storage.state?.wallets || {});
            let firstSrc = allWalletsList[0]?.id;
            if (context?.walletId && storage.state.wallets[context.walletId]) {
                firstSrc = context.walletId;
            }
            const srcWallet = storage.state.wallets[firstSrc];
            const destOpts = this.getWalletOptionsHtml(null, null, {
                excludeWalletId: firstSrc,
                currency: srcWallet?.currency
            });

            formInnerHtml = `
                <div class="form-group">
                    <label for="tx-date">Date</label>
                    <input type="date" id="tx-date" value="${currentDate}">
                </div>
                <div class="form-group">
                    <label>From (Source)</label>
                    <select id="tx-source" onchange="app.onTransferSourceChange()">
                        ${this.getWalletOptionsHtml(firstSrc)}
                    </select>
                </div>
                <div class="form-group">
                    <label>To (Destination)</label>
                    <select id="tx-dest" onchange="app.updateTransferPreview('transfer')">
                        ${destOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label for="tx-amount">Amount</label>
                    <input type="number" id="tx-amount" step="any" placeholder="0" oninput="app.updateTransferPreview('transfer')">
                </div>
                <div class="form-group">
                    <label>Note (Optional)</label>
                    <input type="text" id="tx-note" placeholder="ATM withdrawal, top-up, etc.">
                </div>
                <div id="transfer-live-preview" class="transfer-preview-card" style="display:none;"></div>
                <button type="submit" class="btn btn-tx-submit btn-tx-transfer" id="tx-submit-btn">
                    <i data-lucide="arrow-left-right"></i>
                    <span>Complete Transfer</span>
                </button>
            `;
        } else if (type === 'remittance') {
            const allWalletsList = Object.values(storage.state?.wallets || {});
            const uniqueCurrencies = new Set(allWalletsList.map(w => w.currency));
            if (uniqueCurrencies.size < 2) {
                alert('International money transfers require at least two accounts with different currencies. Please create an account in another currency first.');
                return;
            }

            title.innerText = 'International Money Transfer';
            let firstSrc = allWalletsList[0]?.id;
            if (context?.walletId && storage.state.wallets[context.walletId]) {
                firstSrc = context.walletId;
            }
            const srcWallet = storage.state.wallets[firstSrc];
            const destOpts = this.getWalletOptionsHtml(null, null, {
                excludeWalletId: firstSrc,
                excludeCurrency: srcWallet?.currency
            });
            const firstDestWallet = allWalletsList.find(w => w.id !== firstSrc && w.currency !== srcWallet?.currency);

            formInnerHtml = `
                <div class="form-group">
                    <label for="tx-date">Date</label>
                    <input type="date" id="tx-date" value="${currentDate}">
                </div>
                <div class="form-group">
                    <label>From (Source Account)</label>
                    <select id="tx-source" onchange="app.onRemittanceSourceChange()">
                        ${this.getWalletOptionsHtml(firstSrc)}
                    </select>
                </div>
                <div class="form-group">
                    <label id="tx-sent-label">Amount Sent (${srcWallet ? srcWallet.currency : ''})</label>
                    <input type="number" id="tx-amount-jpy" step="any" placeholder="e.g. 50000" oninput="app.updateTransferPreview('remittance')">
                </div>
                <div class="form-group">
                    <label>To (Destination Account)</label>
                    <select id="tx-dest" onchange="app.onRemittanceDestChange()">
                        ${destOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label id="tx-received-label">Amount Received (${firstDestWallet ? firstDestWallet.currency : ''})</label>
                    <input type="number" id="tx-amount-inr" step="any" placeholder="e.g. 27500" oninput="app.updateTransferPreview('remittance')">
                </div>
                <div class="form-group" id="tx-rate-group" style="display:none;">
                    <div class="exchange-rate-chip" id="tx-effective-rate-pill">
                        <i data-lucide="trending-up" style="width:13px;height:13px;margin-right:6px;"></i>
                        <span id="tx-effective-rate-text">Effective Rate: --</span>
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Calculated from entered amounts sent and received (market rates and transfer fees deferred).</div>
                </div>
                <div class="form-group">
                    <label>Note (Optional)</label>
                    <input type="text" id="tx-note" value="International Money Transfer">
                </div>
                <div id="transfer-live-preview" class="transfer-preview-card" style="display:none;"></div>
                <button type="submit" class="btn btn-tx-submit btn-tx-remittance" id="tx-submit-btn">
                    <i data-lucide="send"></i>
                    <span>Send International Transfer</span>
                </button>
            `;
        } else if (type === 'income') {
            title.innerText = 'Add Income / Credit';
            formInnerHtml = `
                <div class="form-group">
                    <label for="tx-date">Date</label>
                    <input type="date" id="tx-date" value="${currentDate}">
                </div>
                <div class="form-group">
                    <label>Credit To</label>
                    <select id="tx-wallet">
                        ${allWalletOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label for="tx-amount">Amount</label>
                    <input type="number" id="tx-amount" step="any" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Note / Source</label>
                    <input type="text" id="tx-note" placeholder="Salary, refund, etc.">
                </div>
                <button type="submit" class="btn btn-tx-submit btn-tx-income" id="tx-submit-btn">
                    <i data-lucide="arrow-down-left"></i>
                    <span>Record Income</span>
                </button>
            `;
        }

        content.innerHTML = `
            <form id="tx-form" onsubmit="app.handleFormSubmit(event, null, '${type}')">
                ${formInnerHtml}
            </form>
        `;
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
        modal.classList.add('active');

        this.setupDatePickerHelper();

        // Handle context preselection
        if (context) {
            if (type === 'expense') {
                const sel = document.getElementById('tx-wallet');
                if (context.walletId && sel) {
                    sel.value = context.walletId;
                } else if (context.region && sel) {
                    const w = Object.values(storage.state?.wallets || {}).find(item => item.region === context.region);
                    if (w) sel.value = w.id;
                }
                this.updateExpenseCategories();
            } else if (type === 'income') {
                const sel = document.getElementById('tx-wallet');
                if (context.walletId && sel) {
                    sel.value = context.walletId;
                } else if (context.region && sel) {
                    const w = Object.values(storage.state?.wallets || {}).find(item => item.region === context.region);
                    if (w) sel.value = w.id;
                }
            } else if (type === 'transfer') {
                const srcSel = document.getElementById('tx-source');
                const destSel = document.getElementById('tx-dest');
                let targetSrc = null;
                if (context.walletId) {
                    targetSrc = context.walletId;
                } else if (context.region) {
                    const w = Object.values(storage.state?.wallets || {}).find(item => item.region === context.region);
                    if (w) targetSrc = w.id;
                }
                if (targetSrc && srcSel) {
                    srcSel.value = targetSrc;
                    if (destSel && destSel.value === targetSrc) {
                        for (let i = 0; i < destSel.options.length; i++) {
                            if (destSel.options[i].value && destSel.options[i].value !== targetSrc) {
                                destSel.selectedIndex = i;
                                break;
                            }
                        }
                    }
                }
            } else if (type === 'remittance') {
                const srcSel = document.getElementById('tx-source');
                const destSel = document.getElementById('tx-dest');
                if (context.walletId && srcSel) {
                    srcSel.value = context.walletId;
                    this.onRemittanceSourceChange();
                } else if (context.region && srcSel) {
                    const w = Object.values(storage.state?.wallets || {}).find(item => item.region === context.region);
                    if (w) {
                        srcSel.value = w.id;
                        this.onRemittanceSourceChange();
                    }
                }
            }
        }

        if (type === 'expense') {
            this.updateExpenseCategories();
        } else if (type === 'transfer' || type === 'remittance') {
            this.updateTransferPreview(type);
        }
    }

    editTransaction(id) {
        const found = walletManager.findTransaction(id);
        if (!found) return;

        const tx = found.tx;
        const txMonth = (tx.date || '').slice(0, 7);
        if (walletManager.isMonthClosed(txMonth)) {
            alert(`Cannot edit transaction in closed month ${txMonth}. This historical period is permanently sealed.`);
            return;
        }

        if (!this._txModalSource) {
            this._txModalSource = 'ledger';
        }

        this.openTransactionModal(tx.type);
        document.getElementById('modal-title').innerText = 'Edit Transaction';
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }

        const form = document.getElementById('tx-form');
        if (form) {
            form.onsubmit = (e) => this.handleFormSubmit(e, id, tx.type);
        }

        const content = document.getElementById('modal-content');
        let delBtn = document.getElementById('tx-delete-btn');
        if (!delBtn) {
            delBtn = document.createElement('button');
            delBtn.id = 'tx-delete-btn';
            delBtn.type = 'button';
            delBtn.className = 'btn btn-danger-ghost mt-2';
            delBtn.innerText = 'Delete Transaction';
            delBtn.onclick = () => this.deleteTx(id);
            if (form) form.appendChild(delBtn);
            else content.appendChild(delBtn);
        } else {
            delBtn.className = 'btn btn-danger-ghost mt-2';
            delBtn.onclick = () => this.deleteTx(id);
        }

        // Pre-fill fields
        const dateInput = document.getElementById('tx-date');
        if (dateInput) dateInput.value = tx.date;

        if (tx.type === 'expense') {
            const walletSelect = document.getElementById('tx-wallet');
            if (walletSelect) walletSelect.value = tx.walletId;
            this.updateExpenseCategories();

            if (tx.categoryId && tx.categoryId.startsWith('jp-utility-')) {
                const catSelect = document.getElementById('tx-category');
                if (catSelect) catSelect.value = 'utility-group';
                this.handleCategoryChange();
                const subSelect = document.getElementById('tx-subcategory');
                if (subSelect) subSelect.value = tx.categoryId;
            } else {
                const catSelect = document.getElementById('tx-category');
                if (catSelect) catSelect.value = tx.categoryId;
                this.handleCategoryChange();
            }

            const amtInput = document.getElementById('tx-amount');
            if (amtInput) amtInput.value = tx.amount;
            const noteInput = document.getElementById('tx-note');
            if (noteInput) noteInput.value = tx.note || '';
        } else if (tx.type === 'income') {
            const walletSelect = document.getElementById('tx-wallet');
            if (walletSelect) walletSelect.value = tx.walletId;
            const amtInput = document.getElementById('tx-amount');
            if (amtInput) amtInput.value = tx.amount;
            const noteInput = document.getElementById('tx-note');
            if (noteInput) noteInput.value = tx.note || '';
        } else if (tx.type === 'transfer') {
            const srcSelect = document.getElementById('tx-source');
            if (srcSelect) {
                srcSelect.value = tx.sourceId;
                this.onTransferSourceChange();
            }
            const destSelect = document.getElementById('tx-dest');
            if (destSelect) destSelect.value = tx.destId;
            const amtInput = document.getElementById('tx-amount');
            if (amtInput) amtInput.value = tx.amount;
            const noteInput = document.getElementById('tx-note');
            if (noteInput) noteInput.value = tx.note || '';
            this.updateTransferPreview('transfer');
        } else if (tx.type === 'remittance') {
            const srcSelect = document.getElementById('tx-source');
            if (srcSelect) {
                srcSelect.value = tx.sourceId;
                this.onRemittanceSourceChange();
            }
            const destSelect = document.getElementById('tx-dest');
            if (destSelect) {
                destSelect.value = tx.destId;
                this.onRemittanceDestChange();
            }
            const jpyInput = document.getElementById('tx-amount-jpy');
            if (jpyInput) jpyInput.value = tx.sourceAmount;
            const inrInput = document.getElementById('tx-amount-inr');
            if (inrInput) inrInput.value = tx.destAmount;
            const noteInput = document.getElementById('tx-note');
            if (noteInput) noteInput.value = tx.note || '';
            this.updateTransferPreview('remittance');
        }

        // Unify submit button label update for editing
        const submitSpan = content.querySelector('#tx-submit-btn span') || content.querySelector('.btn-primary span');
        if (submitSpan) {
            submitSpan.innerText = 'Save Changes';
        } else {
            const submitBtn = document.getElementById('tx-submit-btn') || content.querySelector('.btn-primary');
            if (submitBtn) submitBtn.innerText = 'Save Changes';
        }
    }

    onTransferSourceChange() {
        const srcEl = document.getElementById('tx-source');
        const destEl = document.getElementById('tx-dest');
        if (!srcEl || !destEl) return;
        const srcWallet = storage.state.wallets[srcEl.value];
        if (!srcWallet) return;
        destEl.innerHTML = this.getWalletOptionsHtml(null, null, {
            excludeWalletId: srcWallet.id,
            currency: srcWallet.currency
        });
        this.updateTransferPreview('transfer');
    }

    onRemittanceSourceChange() {
        const srcEl = document.getElementById('tx-source');
        const destEl = document.getElementById('tx-dest');
        const sentLabel = document.getElementById('tx-sent-label');
        if (!srcEl || !destEl) return;
        const srcWallet = storage.state.wallets[srcEl.value];
        if (!srcWallet) return;
        if (sentLabel) {
            sentLabel.innerText = `Amount Sent (${srcWallet.currency} ${srcWallet.region || ''})`;
        }
        destEl.innerHTML = this.getWalletOptionsHtml(null, null, {
            excludeWalletId: srcWallet.id,
            excludeCurrency: srcWallet.currency
        });
        this.onRemittanceDestChange();
    }

    onRemittanceDestChange() {
        const destEl = document.getElementById('tx-dest');
        const recvLabel = document.getElementById('tx-received-label');
        if (destEl && recvLabel) {
            const destWallet = storage.state.wallets[destEl.value];
            if (destWallet) {
                recvLabel.innerText = `Amount Received (${destWallet.currency} ${destWallet.region || ''})`;
            }
        }
        this.updateTransferPreview('remittance');
    }

    updateTransferPreview(type) {
        const previewEl = document.getElementById('transfer-live-preview');
        if (!previewEl) return;

        const srcEl = document.getElementById('tx-source');
        const destEl = document.getElementById('tx-dest');
        const srcId = srcEl ? srcEl.value : null;
        const destId = destEl ? destEl.value : null;

        let amt1 = 0;
        let amt2 = 0;
        let effectiveType = type;

        if (!effectiveType) {
            const isRemit = document.getElementById('tx-amount-jpy') !== null;
            effectiveType = isRemit ? 'remittance' : 'transfer';
        }

        if (effectiveType === 'transfer') {
            const amtEl = document.getElementById('tx-amount');
            amt1 = amtEl ? amtEl.value : 0;
        } else {
            const jpyEl = document.getElementById('tx-amount-jpy');
            const inrEl = document.getElementById('tx-amount-inr');
            amt1 = jpyEl ? jpyEl.value : 0;
            amt2 = inrEl ? inrEl.value : 0;
        }

        const preview = walletManager.getTransferPreview(effectiveType, srcId, destId, amt1, amt2);

        // Update effective rate pill if in remittance mode
        const rateGroup = document.getElementById('tx-rate-group');
        const rateText = document.getElementById('tx-effective-rate-text');
        if (effectiveType === 'remittance' && rateGroup && rateText) {
            if (preview.effectiveRate && !isNaN(preview.effectiveRate)) {
                rateGroup.style.display = 'block';
                rateText.innerText = `Effective Rate: ${preview.rateFormatted}`;
            } else {
                rateGroup.style.display = 'none';
            }
        }

        if (!preview.valid) {
            if (Number(amt1) > 0 || (effectiveType === 'remittance' && Number(amt2) > 0)) {
                previewEl.style.display = 'block';
                previewEl.className = 'transfer-preview-card preview-invalid';
                previewEl.innerHTML = `
                    <div class="preview-error-row">
                        <i data-lucide="alert-circle" style="width:14px;height:14px;margin-right:6px;color:#f43f5e;"></i>
                        <span>${this.escapeHtml(preview.error)}</span>
                    </div>
                `;
            } else {
                previewEl.style.display = 'none';
            }
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                lucide.createIcons();
            }
            return;
        }

        previewEl.style.display = 'block';
        previewEl.className = 'transfer-preview-card preview-valid';

        const srcCur = preview.source.currency;
        const destCur = preview.dest.currency;
        const srcOld = this.formatMoney(preview.source.currentBalance, srcCur);
        const srcNew = this.formatMoney(preview.source.newBalance, srcCur);
        const destOld = this.formatMoney(preview.dest.currentBalance, destCur);
        const destNew = this.formatMoney(preview.dest.newBalance, destCur);

        let rateHtml = '';
        if (effectiveType === 'remittance' && preview.rateFormatted) {
            rateHtml = `
                <div class="preview-rate-line">
                    <span class="preview-label">Exchange Rate</span>
                    <span class="preview-val">${this.escapeHtml(preview.rateFormatted)}</span>
                </div>
            `;
        }

        previewEl.innerHTML = `
            <div class="preview-header">
                <span class="preview-title">Transfer Preview</span>
                <span class="preview-status-badge">Live Calculation</span>
            </div>
            <div class="preview-grid">
                <div class="preview-wallet-col">
                    <span class="preview-label">Source Account</span>
                    <span class="preview-name">${this.escapeHtml(preview.source.name)}</span>
                    <div class="preview-balance-flow">
                        <span class="old-balance">${srcOld}</span>
                        <span class="flow-arrow">→</span>
                        <span class="new-balance ${preview.source.newBalance < 0 ? 'text-danger' : ''}">${srcNew}</span>
                    </div>
                    <span class="preview-deduction">-${this.formatMoney(preview.debitedAmount, srcCur)}</span>
                </div>
                <div class="preview-wallet-col">
                    <span class="preview-label">Destination Account</span>
                    <span class="preview-name">${this.escapeHtml(preview.dest.name)}</span>
                    <div class="preview-balance-flow">
                        <span class="old-balance">${destOld}</span>
                        <span class="flow-arrow">→</span>
                        <span class="new-balance">${destNew}</span>
                    </div>
                    <span class="preview-credit">+${this.formatMoney(preview.creditedAmount, destCur)}</span>
                </div>
            </div>
            ${rateHtml}
        `;

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    async handleFormSubmit(event, editId = null, type) {
        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }

        if (this._isSubmitting) return false;

        this._isSubmitting = true;
        const submitButton = document.getElementById('tx-submit-btn');
        submitButton?.setAttribute('aria-busy', 'true');
        try {
            const dateEl = document.getElementById('tx-date');
            const date = (dateEl && dateEl.value) ? dateEl.value : (typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0]);

            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                alert('Please select a valid date.');
                return false;
            }

            if (editId) {
                const found = walletManager.findTransaction(editId);
                if (!found) {
                    alert('Transaction not found or already deleted.');
                    return false;
                }
                if (walletManager.isMonthClosed((found.tx.date || '').slice(0, 7))) {
                    alert(`Cannot edit transaction in closed month ${(found.tx.date || '').slice(0, 7)}. This historical period is permanently sealed.`);
                    return false;
                }
                if (!type && found.tx?.type) {
                    type = found.tx.type;
                }
            }

            if (!type || !['expense', 'income', 'transfer', 'remittance'].includes(type)) {
                alert('Please select a valid transaction type.');
                return false;
            }

            const txMonth = (date || '').slice(0, 7);
            if (walletManager.isMonthClosed(txMonth)) {
                alert(`Cannot record transactions in closed month ${txMonth}. This historical period is permanently sealed.`);
                return false;
            }

            let updatedData = { date };
            let res;

            if (type === 'expense') {
                const walletEl = document.getElementById('tx-wallet');
                const walletId = walletEl ? walletEl.value : '';
                let cat = document.getElementById('tx-category')?.value;
                if (cat === 'utility-group') {
                    cat = document.getElementById('tx-subcategory')?.value;
                }
                const amtStr = document.getElementById('tx-amount')?.value;
                const amt = Number(amtStr);
                const note = document.getElementById('tx-note')?.value || '';

                if (!amtStr || isNaN(amt) || amt <= 0) {
                    alert('Please enter a valid amount greater than 0.');
                    return false;
                }
                if (!walletId || !storage.state.wallets[walletId]) {
                    alert('Please select a valid wallet.');
                    return false;
                }
                if (!cat) {
                    alert('Please select a category.');
                    return false;
                }

                if (editId) {
                    updatedData = { ...updatedData, walletId, categoryId: cat, amount: amt, note };
                } else {
                    res = await storage.runExclusive(async () => {
                        return walletManager.addExpense(walletId, cat, amt, note, date);
                    });
                    if (res === false || (res && res.success === false)) {
                        const errMsg = (res && (res.error || res.message)) || 'Could not record expense. Please verify details and retry.';
                        alert(errMsg);
                        return false;
                    }
                }
            } else if (type === 'income') {
                const walletEl = document.getElementById('tx-wallet');
                const walletId = walletEl ? walletEl.value : '';
                const amtStr = document.getElementById('tx-amount')?.value;
                const amt = Number(amtStr);
                const note = document.getElementById('tx-note')?.value || '';

                if (!amtStr || isNaN(amt) || amt <= 0) {
                    alert('Please enter a valid amount greater than 0.');
                    return false;
                }
                if (!walletId || !storage.state.wallets[walletId]) {
                    alert('Please select a valid wallet.');
                    return false;
                }

                if (editId) {
                    updatedData = { ...updatedData, walletId, amount: amt, note };
                } else {
                    res = await storage.runExclusive(async () => {
                        return walletManager.addIncome(walletId, amt, note, date);
                    });
                    if (res === false || (res && res.success === false)) {
                        const errMsg = (res && (res.error || res.message)) || 'Could not record income. Please verify details and retry.';
                        alert(errMsg);
                        return false;
                    }
                }
            } else if (type === 'transfer') {
                const src = document.getElementById('tx-source')?.value;
                const dest = document.getElementById('tx-dest')?.value;
                const amtStr = document.getElementById('tx-amount')?.value;
                const amt = Number(amtStr);
                const note = document.getElementById('tx-note')?.value || '';

                const preview = walletManager.getTransferPreview('transfer', src, dest, amt);
                if (!preview.valid) {
                    alert(preview.error || 'Please enter a valid transfer amount and accounts.');
                    return false;
                }

                if (editId) {
                    updatedData = { ...updatedData, sourceId: src, destId: dest, amount: amt, note };
                } else {
                    res = await storage.runExclusive(async () => {
                        return walletManager.transfer(src, dest, amt, note, date);
                    });
                    if (res === false || (res && res.success === false)) {
                        const errMsg = (res && (res.error || res.message)) || 'Could not complete transfer. Please verify details and retry.';
                        alert(errMsg);
                        return false;
                    }
                }
            } else if (type === 'remittance') {
                const src = document.getElementById('tx-source')?.value;
                const dest = document.getElementById('tx-dest')?.value;
                const amtJpyStr = document.getElementById('tx-amount-jpy')?.value;
                const amtInrStr = document.getElementById('tx-amount-inr')?.value;
                const amtJpy = Number(amtJpyStr);
                const amtInr = Number(amtInrStr);
                const note = document.getElementById('tx-note')?.value || '';

                const preview = walletManager.getTransferPreview('remittance', src, dest, amtJpy, amtInr);
                if (!preview.valid) {
                    alert(preview.error || 'Please enter valid accounts and amounts for international money transfer.');
                    return false;
                }

                if (editId) {
                    updatedData = { ...updatedData, sourceId: src, destId: dest, sourceAmount: amtJpy, destAmount: amtInr, note };
                } else {
                    res = await storage.runExclusive(async () => {
                        return walletManager.remittance(src, dest, amtJpy, amtInr, note, date);
                    });
                    if (res === false || (res && res.success === false)) {
                        const errMsg = (res && (res.error || res.message)) || 'Could not complete international transfer. Please verify details and retry.';
                        alert(errMsg);
                        return false;
                    }
                }
            }

            if (editId) {
                res = await storage.runExclusive(async () => {
                    return walletManager.updateTransaction(editId, updatedData);
                });
                if (res === false || (res && res.success === false)) {
                    const errMsg = (res && (res.error || res.message)) || 'Could not update transaction. Please verify details and retry.';
                    alert(errMsg);
                    return false;
                }
            }

            // Exactly on verified success: close modal, re-render, and return true
            this.closeModal('transaction-modal');
            this.renderAll();
            if (this.currentView === 'transactions-view') {
                this.renderTransactionsPage();
            } else if (this.currentView === 'analytics-view') {
                this.renderAnalyticsPage();
            } else if (this.currentView === 'history-view') {
                this.renderHistory();
            }

            const actionLabel = editId ? 'Transaction updated' : (type === 'income' ? 'Income added' : type === 'transfer' ? 'Transfer recorded' : type === 'remittance' ? 'International transfer recorded' : 'Expense recorded');
            if (typeof this.showToast === 'function') {
                this.showToast(`${actionLabel} successfully.`, 'success');
            }
            return true;
        } catch (err) {
            console.error('[handleFormSubmit] Transaction submission error:');
            alert(err?.message || 'An error occurred while saving the transaction. Please try again.');
            return false;
        } finally {
            submitButton?.removeAttribute('aria-busy');
            this._isSubmitting = false;
        }
    }

    submitEdit(id, type) {
        return this.handleFormSubmit(null, id, type);
    }

    async deleteTx(id) {
        if (this._isSubmitting) return false;

        const found = walletManager.findTransaction(id);
        if (!found) {
            alert('Transaction not found or already deleted.');
            return false;
        }

        const txMonth = (found.tx.date || '').slice(0, 7);
        if (walletManager.isMonthClosed(txMonth)) {
            alert(`Cannot delete transaction in closed month ${txMonth}. This historical period is permanently sealed.`);
            return false;
        }

        if (!confirm("Are you sure you want to delete this transaction?")) {
            return false;
        }

        this._isSubmitting = true;
        try {
            const res = await storage.runExclusive(async () => {
                return walletManager.deleteTransaction(id);
            });
            if (res === false || (res && res.success === false)) {
                const errMsg = (res && (res.error || res.message)) || 'Could not delete transaction.';
                alert(errMsg);
                return false;
            }
            this.closeModal('transaction-modal');
            this.closeTransactionDetail();
            this.renderAll();
            if (this.currentView === 'transactions-view') {
                this.renderTransactionsPage();
            } else if (this.currentView === 'analytics-view') {
                this.renderAnalyticsPage();
            } else if (this.currentView === 'history-view') {
                this.renderHistory();
            }
            return true;
        } catch (err) {
            console.error('[deleteTx] Deletion error:');
            alert(err?.message || 'An error occurred while deleting the transaction.');
            return false;
        } finally {
            this._isSubmitting = false;
        }
    }

    /**
     * Check if any transaction or configuration modal currently holds uncommitted user input.
     * Prevents cross-tab silent overwrite while user is actively composing or editing.
     * @returns {boolean}
     */
    isAnyModalDirty() {
        const isModalOpen = (el) => {
            if (!el) return false;
            return el.classList.contains('active') || (el.style.display && el.style.display !== 'none');
        };

        // 1. Transaction creation / edit modal
        const txModal = document.getElementById('transaction-modal');
        if (isModalOpen(txModal)) {
            const amt = document.getElementById('tx-amount')?.value;
            const amtJpy = document.getElementById('tx-amount-jpy')?.value;
            const amtInr = document.getElementById('tx-amount-inr')?.value;
            const note = document.getElementById('tx-note')?.value;
            if ((amt && amt.trim() !== '') || (amtJpy && amtJpy.trim() !== '') || (amtInr && amtInr.trim() !== '') || (note && note.trim() !== '')) {
                return true;
            }
        }

        // 2. Budget recovery modal
        const recModal = document.getElementById('budget-recovery-modal');
        if (isModalOpen(recModal)) {
            return true;
        }

        // 3. Overall budget modal
        const ovModal = document.getElementById('overall-budget-modal');
        if (isModalOpen(ovModal)) {
            return true;
        }

        // 4. Wallet configuration modals
        const editWalletModal = document.getElementById('edit-wallet-modal');
        if (isModalOpen(editWalletModal)) {
            return true;
        }
        const addWalletModal = document.getElementById('add-wallet-modal');
        if (isModalOpen(addWalletModal)) {
            const name = document.getElementById('add-wallet-name')?.value;
            if (name && name.trim() !== '') return true;
        }

        // 5. Category manage and Quick edit modals
        const catModal = document.getElementById('category-manage-modal');
        if (isModalOpen(catModal)) {
            return true;
        }
        const qeModal = document.getElementById('quick-edit-modal');
        if (isModalOpen(qeModal)) {
            return true;
        }

        return false;
    }

    /**
     * Display a non-destructive conflict warning banner within an open, dirty modal.
     * Informs the user of concurrent updates while preserving their entered inputs.
     * @param {number} newRevision
     */
    showInModalConflictWarning(newRevision) {
        const isModalOpen = (el) => el && (el.classList.contains('active') || (el.style.display && el.style.display !== 'none'));
        const bannerHtml = `
            <i data-lucide="alert-triangle"></i>
            <div class="modal-conflict-text">
                <strong>Financial Update in Another Window (Rev #${this.escapeHtml(newRevision)})</strong>
                <span>Ledger balances were updated elsewhere. Your inputs are preserved. Click Save to re-validate and apply against current balances.</span>
            </div>
        `;

        const txModal = document.getElementById('transaction-modal');
        if (isModalOpen(txModal)) {
            let banner = document.getElementById('tx-modal-conflict-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'tx-modal-conflict-banner';
                banner.className = 'modal-conflict-banner';
                const content = document.getElementById('modal-content');
                if (content) content.insertBefore(banner, content.firstChild);
            }
            banner.innerHTML = bannerHtml;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        const editWalletModal = document.getElementById('edit-wallet-modal');
        if (isModalOpen(editWalletModal)) {
            let banner = document.getElementById('edit-wallet-conflict-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'edit-wallet-conflict-banner';
                banner.className = 'modal-conflict-banner';
                banner.style.margin = '10px 16px';
                const content = editWalletModal.querySelector('.sheet-content');
                if (content) content.insertBefore(banner, content.firstChild);
            }
            banner.innerHTML = bannerHtml;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        const ovModal = document.getElementById('overall-budget-modal');
        if (isModalOpen(ovModal)) {
            let banner = document.getElementById('overall-budget-conflict-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'overall-budget-conflict-banner';
                banner.className = 'modal-conflict-banner';
                banner.style.margin = '10px 16px';
                const body = ovModal.querySelector('.modal-body') || ovModal.firstElementChild;
                if (body) body.insertBefore(banner, body.firstChild);
            }
            banner.innerHTML = bannerHtml;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }
    }

    /**
     * Update the desktop header synchronization status indicator.
     * Renders minimal, unobtrusive states: Synced, Saved locally, Syncing..., Offline, Sync Conflict.
     * @param {string} [status]
     * @param {string} [customLabel]
     */
    updateSyncStatusPill(status = storage.cloudSyncStatus, customLabel = null) {
        const pill = document.getElementById('desktop-sync-status-pill');
        if (!pill) return;

        pill.className = 'sync-status-pill';
        let iconHtml = '<span class="sync-pill-dot"></span>';
        let label = customLabel || 'Synced';

        switch (status) {
            case 'SYNCED':
            case 'CONFIRMED':
                pill.classList.add('sync-pill-synced');
                pill.title = 'All changes saved locally and confirmed in cloud';
                label = customLabel || 'Synced';
                pill.onclick = null;
                break;
            case 'LOCAL_SAVED':
                pill.classList.add('sync-pill-local');
                pill.title = 'Saved locally on this device; cloud synchronization queued';
                label = customLabel || 'Saved locally';
                pill.onclick = null;
                break;
            case 'SYNC_PENDING':
            case 'SYNCING':
                pill.classList.add('sync-pill-pending');
                pill.title = 'Synchronizing with cloud...';
                iconHtml = '<i data-lucide="refresh-cw" class="spin-icon" style="width:12px;height:12px;"></i>';
                label = customLabel || 'Syncing...';
                pill.onclick = null;
                break;
            case 'CONFLICT':
            case 'CONFLICT_DETECTED':
                pill.classList.add('sync-pill-conflict');
                pill.title = 'Cloud state modified elsewhere. Click to review and resolve conflict.';
                iconHtml = '<i data-lucide="alert-triangle" style="width:12px;height:12px;"></i>';
                label = customLabel || 'Sync Conflict';
                pill.onclick = () => this.openConflictResolutionModal();
                break;
            case 'SYNC_FAILED':
            case 'FAILED':
            default:
                pill.classList.add('sync-pill-failed');
                pill.title = 'Offline or cloud sync error. Data is safely stored locally. Click to retry.';
                iconHtml = '<i data-lucide="cloud-off" style="width:12px;height:12px;"></i>';
                label = customLabel || 'Offline';
                pill.onclick = () => storage.pushToSupabase();
                break;
        }

        pill.innerHTML = `${iconHtml}<span class="sync-pill-text">${this.escapeHtml(label)}</span>`;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    /**
     * Open the Conflict Resolution Modal displaying local vs cloud comparison.
     */
    openConflictResolutionModal() {
        const modal = document.getElementById('conflict-resolution-modal');
        if (!modal) return;

        const comparisonEl = document.getElementById('conflict-summary-comparison');
        if (comparisonEl && storage.activeConflict) {
            const loc = storage.activeConflict.localState || {};
            const rem = storage.activeConflict.remoteState || {};
            const locTx = Array.isArray(loc.transactions) ? loc.transactions.length : 0;
            const remTx = Array.isArray(rem.transactions) ? rem.transactions.length : 0;
            comparisonEl.innerHTML = `
                <div class="conflict-comparison-row">
                    <div class="conflict-col">
                        <span class="conflict-badge-label">This Device (Local)</span>
                        <strong>Revision #${this.escapeHtml(storage.activeConflict.localRevision || 1)}</strong>
                        <span>${locTx} transactions</span>
                    </div>
                    <div class="conflict-col-vs">vs</div>
                    <div class="conflict-col">
                        <span class="conflict-badge-label">Cloud (Other Device)</span>
                        <strong>Revision #${this.escapeHtml(storage.activeConflict.remoteRevision || 1)}</strong>
                        <span>${remTx} transactions</span>
                    </div>
                </div>
            `;
        }

        modal.style.display = 'flex';
        modal.classList.add('active');
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    /**
     * Resolve cloud conflict through user selection with explicit confirmation.
     * @param {'overwrite_cloud' | 'accept_cloud'} strategy
     */
    async resolveSyncConflict(strategy) {
        if (strategy === 'overwrite_cloud') {
            const confirmed = confirm(
                'Are you sure you want to overwrite cloud records with local edits?\n\n' +
                'This will replace cloud transactions and balances with the version from this device.\n' +
                'A complete backup of the replaced cloud state will be safely saved in local storage before overwriting.'
            );
            if (!confirmed) return;
        } else if (strategy === 'accept_cloud') {
            const confirmed = confirm(
                'Are you sure you want to adopt the cloud version?\n\n' +
                'This will replace your local edits with the cloud records.\n' +
                'A complete archival backup of your local edits will be saved before adopting cloud data.'
            );
            if (!confirmed) return;
        }

        const res = await storage.resolveConflict(strategy);
        if (res && res.success) {
            this.closeModal('conflict-resolution-modal');
            this.updateSyncStatusPill('SYNCED');
            this.renderAll();
            if (typeof this.showToast === 'function') {
                this.showToast('Conflict resolved successfully.', 'success');
            } else {
                alert('Conflict resolved successfully.');
            }
        } else {
            alert((res && res.error) || 'Failed to resolve conflict.');
        }
    }

    closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
        if (id === 'transaction-modal') {
            this._txModalSource = null;
        }
    }

    openQuickEditModal(type, id, region = null) {
        // Only allow edits in current month
        if (this.isViewingPast()) {
            alert("Cannot edit budgets or wallets while viewing past months. Return to Current Month first.");
            return;
        }

        document.getElementById('quick-edit-type').value = type;
        document.getElementById('quick-edit-id').value = id;
        document.getElementById('quick-edit-region').value = region || '';

        const title = document.getElementById('quick-edit-title');
        const input = document.getElementById('quick-edit-amount');

        if (type === 'wallet') {
            const wallet = storage.state.wallets[id];
            title.innerText = `Edit ${id} Balance`;
            input.value = wallet.balance;
        } else if (type === 'category') {
            const cat = storage.state.categories[region].find(c => c.id === id);
            title.innerText = `Edit ${cat.name} Budget`;
            input.value = cat.budget || 0;
        }


        document.getElementById('quick-edit-modal').classList.add('active');
    }

    async saveQuickEdit() {
        const type = document.getElementById('quick-edit-type').value;
        const id = document.getElementById('quick-edit-id').value;
        const region = document.getElementById('quick-edit-region').value;
        const amt = Number(document.getElementById('quick-edit-amount').value);

        if (isNaN(amt)) return;

        if (type === 'wallet') {
            await this.updateWalletBalance(id, amt);
        } else if (type === 'category') {
            await this.updateCategoryBudget(id, amt);
            this.renderAll();
        }

        this.closeModal('quick-edit-modal');
    }

    handleCategoryChange() {
        const catSelect = document.getElementById('tx-category');
        const subGroup = document.getElementById('tx-subcategory-group');
        if (!catSelect || !subGroup) return;

        if (catSelect.value === 'utility-group') {
            subGroup.classList.remove('hidden');
        } else {
            subGroup.classList.add('hidden');
        }
    }

    updateExpenseCategories() {
        const walletSelect = document.getElementById('tx-wallet');
        if (!walletSelect) return;

        const wallet = storage.state.wallets[walletSelect.value];
        const region = wallet ? wallet.region : 'JP';
        const catSelect = document.getElementById('tx-category');
        const subSelect = document.getElementById('tx-subcategory');

        let html = '';
        if (region === 'JP') {
            const activeJP = (storage.state.categories.JP || []).filter(c => c.isActive !== false);
            const utils = activeJP.filter(c => c.id.startsWith('jp-utility-'));
            const others = activeJP.filter(c => !c.id.startsWith('jp-utility-'));

            html = others.map(c => `<option value="${this.escapeHtml(c.id)}">${this.escapeHtml(c.name)}</option>`).join('');
            if (utils.length > 0) {
                html += `<option value="utility-group">Utilities</option>`;
                if (subSelect) {
                    subSelect.innerHTML = utils.map(c => `<option value="${this.escapeHtml(c.id)}">${this.escapeHtml(c.name)}</option>`).join('');
                }
            }
        } else {
            const activeIN = (storage.state.categories[region] || []).filter(c => c.isActive !== false);
            html = activeIN.map(c => `<option value="${this.escapeHtml(c.id)}">${this.escapeHtml(c.name)}</option>`).join('');
        }

        catSelect.innerHTML = html;
        this.handleCategoryChange();
    }

    submitExpense() {
        return this.handleFormSubmit(null, null, 'expense');
    }

    submitTransfer() {
        return this.handleFormSubmit(null, null, 'transfer');
    }

    submitRemittance() {
        return this.handleFormSubmit(null, null, 'remittance');
    }

    submitIncome() {
        return this.handleFormSubmit(null, null, 'income');
    }

    renderAll() {
        this.renderWallets();
        this.renderLoanTracker();
        this.renderCategories();
        this.renderTransactions();

        this.renderSettings();

        // Modern Web Guidance: Scope icon replacement to active view container to avoid document-wide scan
        const activeContainer = document.getElementById(this.currentView) || document.getElementById('home-view');
        this.refreshIcons(activeContainer);
    }

    clearViewsOnLogout() {
        this._cancelLedgerSearchTimer();
        this.ledgerSearchQuery = '';
        this.cancelCurrentReportPrint();
        this.closeTransactionDetail();
        this.closeModal('transaction-modal');
        this.closeUnifiedTransactionSelector();
        this._lastDetailTxId = null;
        this._txModalSource = null;
        for (const id of ['edit-wallet-modal', 'quick-edit-modal', 'log-emi-modal', 'category-manage-modal',
            'overall-budget-modal', 'closing-wizard-modal', 'budget-recovery-modal',
            'add-wallet-modal', 'pdf-modal', 'conflict-resolution-modal']) {
            this.closeModal(id);
        }
        this.editingCatId = null;
        this.editingCatRegion = null;
        this.overallBudgetModalRegion = null;
        this.closingWizardState = { step: 1, monthKey: null, nextMonthKey: null };
        this.budgetRecoveryState = { option: 'review', customAdjustments: {}, preview: null };

        const focusOverlay = document.getElementById('focus-overlay');
        if (focusOverlay) {
            focusOverlay.classList.remove('active');
            focusOverlay.style.display = 'none';
        }
        this.focusHistory = [];
        this.focusCurrentRegion = null;
        for (const id of ['edit-wallet-id', 'edit-wallet-name', 'edit-wallet-balance',
            'quick-edit-id', 'quick-edit-region', 'quick-edit-type', 'quick-edit-amount',
            'cat-edit-id', 'cat-edit-name', 'cat-edit-budget', 'overall-budget-input',
            'log-emi-date', 'log-emi-amount', 'log-emi-note', 'add-wallet-name', 'add-wallet-balance',
            'setting-profile-name', 'budgets-cat-search-input']) {
            const field = document.getElementById(id);
            if (field) field.value = '';
        }
        for (const id of ['tx-detail-type-badge', 'tx-detail-date-display', 'tx-detail-amount-val',
            'tx-detail-subtitle', 'tx-detail-wallet-val', 'tx-detail-category-val', 'tx-detail-dest-val',
            'tx-detail-rate-val', 'tx-detail-note-val', 'tx-detail-id-val', 'modal-title',
            'edit-wallet-title', 'quick-edit-title', 'focus-modal-title', 'focus-back-label',
            'cat-modal-title', 'overall-budget-cat-sum', 'overall-budget-cushion-val',
            'log-emi-preview-principal', 'log-emi-preview-dues']) {
            const field = document.getElementById(id);
            if (field) field.textContent = '';
        }
        for (const id of ['modal-content', 'focus-primary-panel', 'focus-secondary-panel',
            'closing-step-content', 'budget-recovery-content', 'log-emi-wallet']) {
            document.getElementById(id)?.replaceChildren();
        }
        const emiAmountLabel = document.getElementById('log-emi-amount-label');
        if (emiAmountLabel) emiAmountLabel.textContent = 'EMI Amount';
        this.jpAnalyticsUserId = null;
        this.jpExclusions = new Set();
        this.closeCategoryDrilldown();
        this.setPrivacyHidden(true);
        this.clearInactivityTimer();
        this.viewingMonthKey = null;
        this.reportSnapshotsCache = {};
        this.budgetsCatSearch = '';
        this.resetCustomRangeReport();
        this.cancelRestore();
        this.updateDesktopAccountInfo();
        if (this.renderedHistoryCharts && typeof this.renderedHistoryCharts.clear === 'function') {
            this.renderedHistoryCharts.clear();
        }
        this._hasInit = false;
        if (typeof this.resetAllLedgerFilters === 'function') {
            this.resetAllLedgerFilters(true);
        }
        const catFilterSelect = document.getElementById('filter-category-select');
        if (catFilterSelect) {
            catFilterSelect.innerHTML = '<option value="all">All Categories</option>';
            if (catFilterSelect.dataset) {
                delete catFilterSelect.dataset.optionsSig;
            }
            if (typeof catFilterSelect.removeAttribute === 'function') {
                catFilterSelect.removeAttribute('data-options-sig');
            }
        }
        const walletFilterSelect = document.getElementById('filter-wallet-select');
        if (walletFilterSelect) {
            walletFilterSelect.innerHTML = '<option value="all">All Wallets</option>';
            if (walletFilterSelect.dataset) {
                delete walletFilterSelect.dataset.optionsSig;
            }
            if (typeof walletFilterSelect.removeAttribute === 'function') {
                walletFilterSelect.removeAttribute('data-options-sig');
            }
        }

        const elIds = [
            'jp-wallets-list', 'in-wallets-list',
            'jp-categories-grid', 'in-categories-grid', 'de-categories-grid',
            'jp-categories-list', 'in-categories-list', 'monthly-financial-summary',
            'recent-transactions-list', 'settings-wallets-list',
            'settings-categories-list', 'settings-in-categories-list',
            'jp-exclusions-chips', 'jp-category-ranking-list', 'jp-insights-list', 'jp-budget-perf-body',
            'in-recent-tx-list', 'de-recent-tx-list', 'ledger-timeline-container', 'ledger-active-chips',
            'wallets-page-jp-grid', 'wallets-page-in-grid', 'wallets-page-de-grid', 'dash-donut-legend',
            'history-list', 'report-snapshot-hero', 'report-pie-legend', 'report-category-breakdown-card',
            'report-closed-months-list', 'report-month-select', 'pdf-from-month', 'pdf-to-month',
            'budgets-summary-banner', 'budgets-categories-grid', 'settings-country-budgets-list',
            'settings-loan-config-container', 'restore-preview-details', 'conflict-summary-comparison',
            'print-container', 'account-email-display'
        ];
        elIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.replaceChildren();
        });

        document.querySelectorAll('#app-content .privacy-blur, #app-content .financial-amount').forEach(el => {
            el.textContent = '******';
        });

        const loanWidget = document.getElementById('loan-tracker-widget');
        if (loanWidget) {
            loanWidget.replaceChildren();
            loanWidget.style.display = 'none';
        }

        if (typeof charts !== 'undefined' && typeof charts.destroyCharts === 'function') {
            charts.destroyCharts();
        }
    }

    renderSettings() {
        if (this.currentView === 'settings-view') {
            this.renderSettingsPage();

            // Legacy mobile settings compatibility checks if elements are present
            const jpBudEl = document.getElementById('setting-jp-budget');
            if (jpBudEl) {
                jpBudEl.value = storage.state.jpTotalBudget;
            }

            if (storage.state.loanConfig) {
                const loanTotalEl = document.getElementById('setting-loan-total-principal');
                if (loanTotalEl) loanTotalEl.value = storage.state.loanConfig.totalPrincipal;
                const loanPrinEl = document.getElementById('setting-loan-principal');
                if (loanPrinEl) loanPrinEl.value = storage.state.loanConfig.principalLeft;
                const duesEl = document.getElementById('setting-loan-total-dues');
                if (duesEl) duesEl.value = storage.state.loanConfig.totalDues;
                const duesPaidEl = document.getElementById('setting-loan-dues');
                if (duesPaidEl) duesPaidEl.value = storage.state.loanConfig.duesPaid;
                const dateEl = document.getElementById('setting-loan-date');
                if (dateEl) dateEl.value = storage.state.loanConfig.emiDrawDate || 7;
            }

            const sWallets = document.getElementById('settings-wallets-list');
            if (sWallets) {
                let walletHtml = '';
                Object.values(storage.state.wallets).forEach(w => {
                    const icon = w.type === 'bank' ? 'landmark' : w.type === 'card' ? 'credit-card' : w.type === 'cash' ? 'banknote' : 'smartphone';
                    walletHtml += `
                        <div class="draggable-item" data-id="${this.escapeHtml(w.id)}" data-type="wallet" draggable="true" style="padding:12px 0; border-bottom:1px solid var(--border);">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="display:flex; align-items:center; gap:8px; font-size:0.9rem;">
                                    <span style="width:10px;height:10px;border-radius:50%;background:${this.safeWalletColor(w.color)};flex-shrink:0;"></span>
                                    <i data-lucide="${icon}"></i> ${this.escapeHtml(w.id)} <small class="text-muted">(${this.escapeHtml(w.currency)})</small>
                                </span>
                                <input type="number" value="${this.escapeHtml(w.balance)}" data-wallet-id="${this.escapeHtml(w.id)}" onblur="app.updateWalletBalance(this.dataset.walletId, this.value)" style="width:100px;">
                            </div>
                        </div>
                    `;
                });
                sWallets.innerHTML = walletHtml;
            }
        }
    }

    renderSettingsPage() {
        if (!storage.state.userProfile) {
            storage.state.userProfile = { ...defaultState.userProfile };
        }
        if (!storage.state.regionalPreferences) {
            storage.state.regionalPreferences = { ...defaultState.regionalPreferences };
        }
        if (!storage.state.privacyPreferences) {
            storage.state.privacyPreferences = { ...defaultState.privacyPreferences };
        }

        const user = (typeof supabaseClient !== 'undefined' && supabaseClient.session) ? supabaseClient.session.user : null;
        const profileNameInput = document.getElementById('setting-profile-name');
        const profileEmailInput = document.getElementById('setting-profile-email');

        if (profileNameInput) {
            profileNameInput.value = storage.state.userProfile.displayName || (user ? (user.user_metadata?.full_name || '') : '');
        }
        if (profileEmailInput) {
            profileEmailInput.value = user ? user.email : 'user@example.com (Connected)';
        }

        // Active Operating Countries Grid
        const countriesGrid = document.getElementById('settings-operating-countries-grid');
        const activeCountries = storage.getActiveCountries();
        const primaryCountry = storage.getPrimaryCountry();

        if (countriesGrid) {
            const supported = [
                { code: 'JP', name: 'Japan', curr: 'JPY (¥)', flag: this.getCountryFlagSvg('JP', 22, 16.5) },
                { code: 'IN', name: 'India', curr: 'INR (₹)', flag: this.getCountryFlagSvg('IN', 22, 16.5) },
                { code: 'DE', name: 'Germany', curr: 'EUR (€)', flag: this.getCountryFlagSvg('DE', 22, 16.5) }
            ];

            countriesGrid.innerHTML = supported.map(c => {
                const isActive = activeCountries.includes(c.code);
                const isPrimary = primaryCountry === c.code;
                const canDeactivate = activeCountries.length > 1;

                let actionBtn = '';
                if (isActive) {
                    if (!canDeactivate) {
                        actionBtn = `<button class="btn btn-sm btn-ghost text-muted" disabled title="At least one operating country must remain active" style="opacity:0.4; cursor:not-allowed;">Active</button>`;
                    } else {
                        actionBtn = `<button class="btn btn-sm btn-ghost text-rose" onclick="app.deactivateCountryWithConfirmation('${c.code}')" title="Deactivate country">Deactivate</button>`;
                    }
                } else {
                    actionBtn = `<button class="btn btn-sm btn-secondary" onclick="app.activateCountry('${c.code}')" title="Enable country">Activate</button>`;
                }

                return `
                    <div class="settings-country-card ${isActive ? 'active' : 'inactive'}">
                        <div class="settings-country-card-header">
                            <div class="settings-country-card-title">
                                ${c.flag}
                                <span class="settings-country-card-name">${this.escapeHtml(c.name)}</span>
                                <span class="currency-code-pill">${c.curr}</span>
                                ${isPrimary ? '<span class="settings-badge-primary">Primary</span>' : ''}
                            </div>
                            <div class="settings-country-card-actions">
                                ${actionBtn}
                            </div>
                        </div>
                        <div class="settings-country-card-status">
                            <span class="status-indicator ${isActive ? 'active' : 'inactive'}"></span>
                            <span class="status-label">${isActive ? 'Active jurisdiction' : 'Inactive'}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Primary Operating Country Select
        const countryEl = document.getElementById('setting-default-country');
        if (countryEl) {
            countryEl.innerHTML = activeCountries.map(c => {
                const cfg = (typeof CountryConfig !== 'undefined' && CountryConfig.get(c)) || { name: c, currency: c === 'JP' ? '¥' : c === 'DE' ? '€' : '₹' };
                return `<option value="${c}" ${c === primaryCountry ? 'selected' : ''}>${cfg.name} (${cfg.currency})</option>`;
            }).join('');
            countryEl.value = primaryCountry;
        }

        // Country Budgeting Preferences
        const budgetsList = document.getElementById('settings-country-budgets-list');
        if (budgetsList) {
            budgetsList.innerHTML = activeCountries.map(c => {
                const cfg = (typeof CountryConfig !== 'undefined' && CountryConfig.get(c)) || { name: c, currency: c === 'JP' ? '¥' : c === 'DE' ? '€' : '₹' };
                const isEnabled = storage.isBudgetEnabled(c);
                const limit = storage.getTotalBudget(c);
                const rollover = storage.isBudgetRolloverEnabled(c);

                return `
                    <div class="settings-budget-item-card" style="padding: 16px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                ${this.getCountryFlagSvg(c, 20, 15)}
                                <span style="font-weight:600; font-size:0.95rem;">${cfg.name} Monthly Budget</span>
                                <span class="currency-code-pill">${cfg.currency}</span>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="app.updateCountryBudgetPref('${c}', this.checked, undefined, undefined)">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        ${isEnabled ? `
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06);">
                                <div>
                                    <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Monthly Spending Limit (${cfg.currency})</label>
                                    <input type="number" class="settings-input" value="${limit}" onblur="app.updateCountryBudgetPref('${c}', undefined, this.value, undefined)" style="width: 100%;">
                                </div>
                                <div>
                                    <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Unused Budget Rollover</label>
                                    <label class="toggle-switch" style="margin-top: 4px;">
                                        <input type="checkbox" ${rollover ? 'checked' : ''} onchange="app.updateCountryBudgetPref('${c}', undefined, undefined, this.checked)">
                                        <span class="toggle-slider"></span>
                                    </label>
                                    <span class="text-xs text-muted" style="display:block; margin-top: 4px; font-size: 0.72rem; line-height: 1.35;">Adds unspent allowance to next month's spending limit. Does not transfer cash between accounts.</span>
                                </div>
                            </div>
                        ` : '<p class="text-muted text-xs" style="margin:8px 0 0 0;">Budget tracking is currently disabled for this jurisdiction.</p>'}
                    </div>
                `;
            }).join('');
        }

        // Loan Tracking Setup
        const loanContainer = document.getElementById('settings-loan-config-container');
        if (loanContainer) {
            const loanCfg = storage.state.loanConfig || { enabled: false };
            const isLoanEnabled = Boolean(loanCfg.enabled);
            const loanCountry = loanCfg.country || 'IN';
            const loanCurrency = loanCfg.currency || (typeof CountryConfig !== 'undefined' && CountryConfig.get(loanCountry)?.currency) || '₹';
            const allCountries = (typeof CountryConfig !== 'undefined' && typeof CountryConfig.getAll === 'function')
                ? CountryConfig.getAll()
                : [
                    { code: 'JP', name: 'Japan', currency: '¥', currencyCode: 'JPY' },
                    { code: 'IN', name: 'India', currency: '₹', currencyCode: 'INR' },
                    { code: 'DE', name: 'Germany', currency: '€', currencyCode: 'EUR' }
                ];
            const loanCountryObj = (typeof CountryConfig !== 'undefined' && CountryConfig.get(loanCountry)) || { name: loanCountry };
            const loanCountryName = loanCountryObj.name || loanCountry;

            const allWallets = Object.values(storage.state.wallets || {});
            const regionalWallets = allWallets.filter(w => w.region === loanCountry || w.currency === loanCurrency);
            let walletOptionsHtml = '';
            if (regionalWallets.length === 0) {
                walletOptionsHtml = `<option value="" disabled selected>No wallets configured in ${this.escapeHtml(loanCountryName)}</option>`;
            } else {
                walletOptionsHtml = `
                    <option value="" ${!loanCfg.repaymentWallet ? 'selected' : ''}>-- Unselected --</option>
                    ${regionalWallets.map(w => {
                    const isSel = loanCfg.repaymentWallet === w.id ? 'selected' : '';
                    const balFormatted = (w.currency || '') + (w.balance !== undefined ? Number(w.balance).toLocaleString() : '0');
                    return `<option value="${this.escapeHtml(w.id)}" ${isSel}>${this.escapeHtml(w.id)} (${this.escapeHtml(balFormatted)})</option>`;
                }).join('')}
                `;
            }

            const percentMode = loanCfg.percentMode || 'principal';
            const annualInterestRate = loanCfg.annualInterestRate || 0;
            const totalPrincipal = Number(loanCfg.totalPrincipal) || 0;
            const emi = Number(loanCfg.emi) || 0;
            const totalDues = Number(loanCfg.totalDues) || 0;
            const totalExpected = (emi > 0 && totalDues > 0) ? (emi * totalDues) : totalPrincipal;
            const totalInterest = Math.max(0, totalExpected - totalPrincipal);

            loanContainer.innerHTML = `
                <div class="settings-loan-card" style="padding: 16px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="font-weight:600; font-size:0.95rem;">Track Liability Amortization</span>
                            <p class="text-muted text-xs" style="margin: 2px 0 0 0;">Display monthly EMI and payoff progress in the dashboard sidebar rail.</p>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-loan-toggle" ${isLoanEnabled ? 'checked' : ''} onchange="app.updateLoanPref('enabled', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    ${isLoanEnabled ? `
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06);">
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Loan Country / Region</label>
                                <select class="settings-select" id="setting-loan-country" onchange="app.updateLoanPref('country', this.value)" style="width: 100%;">
                                    ${allCountries.map(c => `
                                        <option value="${c.code}" ${loanCountry === c.code ? 'selected' : ''}>
                                            ${c.name} (${c.code} - ${c.currency})
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Loan Currency</label>
                                <select class="settings-select" id="setting-loan-currency" onchange="app.updateLoanPref('currency', this.value)" style="width: 100%;">
                                    <option value="₹" ${loanCurrency === '₹' ? 'selected' : ''}>INR (₹)</option>
                                    <option value="¥" ${loanCurrency === '¥' ? 'selected' : ''}>JPY (¥)</option>
                                    <option value="€" ${loanCurrency === '€' ? 'selected' : ''}>EUR (€)</option>
                                </select>
                            </div>
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Default Repayment Wallet</label>
                                <select class="settings-select" id="setting-loan-repayment-wallet" onchange="app.updateLoanPref('repaymentWallet', this.value)" style="width: 100%;">
                                    ${walletOptionsHtml}
                                </select>
                            </div>
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Progress Percentage Basis</label>
                                <select class="settings-select" id="setting-loan-percent-mode" onchange="app.updateLoanPref('percentMode', this.value)" style="width: 100%;">
                                    <option value="principal" ${percentMode === 'principal' ? 'selected' : ''}>Principal Repaid % (Default)</option>
                                    <option value="total" ${percentMode === 'total' ? 'selected' : ''}>Total Repaid % (Principal + Interest)</option>
                                    <option value="tenure" ${percentMode === 'tenure' ? 'selected' : ''}>Tenure Completed % (Months Paid)</option>
                                </select>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06);">
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Total Principal (${this.escapeHtml(loanCurrency)})</label>
                                <input type="number" class="settings-input" id="setting-loan-total-principal" value="${this.escapeHtml(loanCfg.totalPrincipal || 0)}" onblur="app.updateLoanPref('totalPrincipal', this.value)" style="width: 100%;">
                            </div>
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Principal Left (${this.escapeHtml(loanCurrency)})</label>
                                <input type="number" class="settings-input" id="setting-loan-principal" value="${this.escapeHtml(loanCfg.principalLeft || 0)}" onblur="app.updateLoanPref('principalLeft', this.value)" style="width: 100%;">
                            </div>
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Annual Interest Rate (%)</label>
                                <input type="number" step="0.01" min="0" class="settings-input" id="setting-loan-interest-rate" value="${this.escapeHtml(annualInterestRate || 0)}" onblur="app.updateLoanPref('annualInterestRate', this.value)" style="width: 100%;" placeholder="e.g. 8.5">
                            </div>
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Total Dues (Months)</label>
                                <input type="number" class="settings-input" id="setting-loan-total-dues" value="${this.escapeHtml(loanCfg.totalDues || 0)}" onblur="app.updateLoanPref('totalDues', this.value)" style="width: 100%;">
                            </div>
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Dues Paid (Months)</label>
                                <input type="number" class="settings-input" id="setting-loan-dues" value="${this.escapeHtml(loanCfg.duesPaid || 0)}" onblur="app.updateLoanPref('duesPaid', this.value)" style="width: 100%;">
                            </div>
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Monthly EMI Amount (${this.escapeHtml(loanCurrency)})</label>
                                <input type="number" class="settings-input" id="setting-loan-emi" value="${this.escapeHtml(loanCfg.emi || 0)}" onblur="app.updateLoanPref('emi', this.value)" style="width: 100%;">
                            </div>
                            <div>
                                <label class="text-xs text-muted" style="display:block; margin-bottom: 4px;">Monthly Draw Date (1-31)</label>
                                <input type="number" class="settings-input" id="setting-loan-date" value="${this.escapeHtml(loanCfg.emiDrawDate || 7)}" onblur="app.updateLoanPref('emiDrawDate', this.value)" style="width: 100%;">
                            </div>
                        </div>

                        ${totalExpected > 0 ? `
                            <div style="margin-top: 14px; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; font-size: 0.8rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                                <span>Total Obligation: <strong style="color: var(--text-primary); font-weight: 600;">${this.escapeHtml(loanCurrency)}${totalExpected.toLocaleString()}</strong></span>
                                <span>Estimated Total Interest: <strong style="color: #f59e0b; font-weight: 600;">${this.escapeHtml(loanCurrency)}${totalInterest.toLocaleString()}</strong></span>
                            </div>
                        ` : ''}
                    ` : ''}
                </div>
            `;
        }

        // Regional preferences
        const reg = storage.state.regionalPreferences;
        const currEl = document.getElementById('setting-default-currency');
        if (currEl) currEl.value = reg.defaultCurrency || 'JPY';

        const dateEl = document.getElementById('setting-date-format');
        if (dateEl) dateEl.value = reg.dateFormat || 'YYYY-MM-DD';

        const weekEl = document.getElementById('setting-week-start');
        if (weekEl) weekEl.value = reg.weekStart || 'monday';

        const numEl = document.getElementById('setting-number-format');
        if (numEl) numEl.value = reg.numberFormat || 'standard';

        const tzEl = document.getElementById('setting-timezone');
        if (tzEl) tzEl.value = reg.timezone || 'Asia/Tokyo';

        // Privacy preferences
        const priv = storage.state.privacyPreferences;
        const privDefEl = document.getElementById('setting-privacy-default');
        if (privDefEl) privDefEl.checked = priv.defaultConcealed !== false;

        const privTimeoutEl = document.getElementById('setting-privacy-timeout');
        if (privTimeoutEl) privTimeoutEl.value = String(priv.timeoutMinutes ?? 3);

        // About section
        const syncStatusEl = document.getElementById('about-sync-status');
        if (syncStatusEl) {
            syncStatusEl.innerText = (typeof supabaseClient !== 'undefined' && supabaseClient.session) ? 'Connected & Synced' : 'Connected';
        }
        const aboutEnvEl = document.getElementById('about-env-label');
        if (aboutEnvEl) {
            const envName = (window.SUPABASE_CONFIG?.environment === 'production') ? 'Production' : 'Development';
            const projectRef = window.SUPABASE_CONFIG?.projectRef || 'unconfigured';
            aboutEnvEl.innerText = `${envName} (${projectRef})`;
        }
        const lastSyncedEl = document.getElementById('about-last-synced');
        if (lastSyncedEl) {
            lastSyncedEl.innerText = this.lastSyncTime ? new Date(this.lastSyncTime).toLocaleTimeString() : 'Just now';
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    activateCountry(code) {
        storage.activateCountry(code);
        this.renderAll();
        this.renderSettingsPage();
    }

    deactivateCountryWithConfirmation(code) {
        const active = storage.getActiveCountries();
        if (active.length <= 1) {
            alert("At least one operating country must remain active.");
            return;
        }
        const countryName = (typeof CountryConfig !== 'undefined' && CountryConfig.get(code)?.name) || code;
        const msg = `Are you sure you want to deactivate ${countryName}?\n\nDeactivating hides ${countryName} from active navigation, dashboards, and transaction selectors.\n\nAll historical ledger transactions, wallet balances, and closed-month snapshots are safely and permanently preserved.`;
        if (confirm(msg)) {
            storage.deactivateCountry(code);

            const newPrimary = storage.getPrimaryCountry();
            if (this.monthlySummaryRegion === code) this.monthlySummaryRegion = newPrimary;
            if (this.dashboardChartRegion === code) this.dashboardChartRegion = newPrimary;
            if (this.budgetsRegion === code) this.budgetsRegion = newPrimary;
            if (this.analyticsCountry === code) this.analyticsCountry = newPrimary;
            if (this.reportRegion === code) this.reportRegion = newPrimary;
            if (this.ledgerFilters) {
                if (this.ledgerFilters.region === code) this.ledgerFilters.region = 'all';
                if (this.ledgerFilters.categoryId && this.ledgerFilters.categoryId !== 'all') {
                    const catBelongsToDeactivated = (storage.state?.categories?.[code] || []).some(c => c && c.id === this.ledgerFilters.categoryId);
                    if (catBelongsToDeactivated) this.ledgerFilters.categoryId = 'all';
                }
                if (this.ledgerFilters.walletId && this.ledgerFilters.walletId !== 'all') {
                    const w = storage.state?.wallets?.[this.ledgerFilters.walletId];
                    if (w && (w.region || 'JP').toUpperCase() === code) this.ledgerFilters.walletId = 'all';
                }
            }

            this.renderAll();
            this.renderSettingsPage();
        }
    }

    setPrimaryOperatingCountry(code) {
        storage.setPrimaryCountry(code);
        this.renderAll();
        this.renderSettingsPage();
    }

    updateCountryBudgetPref(code, enabled, monthlyTotal, rolloverEnabled) {
        const cur = storage.getBudgetPreference(code);
        const newEnabled = enabled !== undefined ? enabled : cur.enabled;
        const newTotal = monthlyTotal !== undefined ? Number(monthlyTotal) : cur.monthlyTotal;
        const newRollover = rolloverEnabled !== undefined ? rolloverEnabled : cur.rolloverEnabled;

        storage.setBudgetEnabled(code, newEnabled, newTotal, newRollover);
        this.renderAll();
        this.renderSettingsPage();
    }

    async updateLoanPref(field, value) {
        await storage.runExclusive(async (state) => {
            if (!state.loanConfig) state.loanConfig = { enabled: false };
            if (field === 'enabled') {
                state.loanConfig.enabled = Boolean(value);
                if (state.preferences?.loanTracking) {
                    state.preferences.loanTracking.enabled = Boolean(value);
                }
            } else if (field === 'country') {
                state.loanConfig.country = value;
                const countryCfg = typeof CountryConfig !== 'undefined' ? CountryConfig.get(value) : null;
                if (countryCfg && countryCfg.currency) {
                    state.loanConfig.currency = countryCfg.currency;
                }
                // Validate if existing repayment wallet is still in the new region
                if (state.loanConfig.repaymentWallet) {
                    const currentWallet = state.wallets?.[state.loanConfig.repaymentWallet];
                    if (currentWallet && currentWallet.region !== value && currentWallet.currency !== state.loanConfig.currency) {
                        state.loanConfig.repaymentWallet = '';
                    }
                }
            } else if (field === 'currency') {
                state.loanConfig.currency = value;
            } else if (field === 'repaymentWallet') {
                state.loanConfig.repaymentWallet = value || '';
            } else if (field === 'percentMode') {
                state.loanConfig.percentMode = value || 'principal';
            } else if (field === 'annualInterestRate') {
                state.loanConfig.annualInterestRate = Math.max(0, parseFloat(value) || 0);
            } else {
                const num = parseFloat(value);
                if (!isNaN(num)) {
                    state.loanConfig[field] = num;
                }
            }
            return true;
        });
        this.renderLoanTracker();
        this.renderSettingsPage();
    }

    switchSettingsSection(sectionId) {
        this.currentSettingsSection = sectionId;
        const tabs = document.querySelectorAll('.settings-tab-btn');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-section') === sectionId) {
                tab.classList.add('active');
                if (typeof tab.scrollIntoView === 'function') {
                    tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            } else {
                tab.classList.remove('active');
            }
        });

        const cards = document.querySelectorAll('.settings-section-card');
        cards.forEach(card => {
            if (card.id === `settings-sec-${sectionId}`) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        this.renderSettingsPage();
        this.refreshIcons(document.getElementById('settings-view'));
    }

    navigateToSettingsSection(sectionId) {
        this.closeAccountMenu();
        this.switchView('settings-view');
        this.switchSettingsSection(sectionId);
    }

    toggleAccountMenu(event) {
        if (event) event.stopPropagation();
        const menu = document.getElementById('sidebar-account-menu');
        if (!menu) return;
        menu.classList.toggle('active');
    }

    closeAccountMenu() {
        const menu = document.getElementById('sidebar-account-menu');
        if (menu) menu.classList.remove('active');
    }

    async updateUserProfile(field, value) {
        await storage.runExclusive(async (state) => {
            if (!state.userProfile) state.userProfile = {};
            state.userProfile[field] = (value || '').trim();
            return true;
        });
        this.updateDesktopAccountInfo();
    }

    async updateRegionalPreference(field, value) {
        await storage.runExclusive(async (state) => {
            if (!state.regionalPreferences) {
                state.regionalPreferences = { ...defaultState.regionalPreferences };
            }
            state.regionalPreferences[field] = value;
            return true;
        });
        // Changing regional presentation does NOT rewrite historical ledger amounts or wallet currencies
        this.renderAll();
    }

    async updatePrivacyPreference(field, value) {
        await storage.runExclusive(async (state) => {
            if (!state.privacyPreferences) {
                state.privacyPreferences = { ...defaultState.privacyPreferences };
            }
            state.privacyPreferences[field] = value;
            return true;
        });

        if (field === 'timeoutMinutes') {
            const mins = Number(value);
            this.inactivityTimeoutMs = mins > 0 ? mins * 60 * 1000 : 0;
            if (this.inactivityTimeoutMs === 0) {
                this.clearInactivityTimer();
            } else {
                this.resetInactivityTimer();
            }
        }
    }

    async handleUpdateEmail() {
        const input = document.getElementById('setting-new-email');
        const statusEl = document.getElementById('email-change-status');
        if (!input || !statusEl) return;
        const newEmail = input.value.trim();
        if (!newEmail || !newEmail.includes('@')) {
            statusEl.style.display = 'block';
            statusEl.style.color = 'var(--red)';
            statusEl.innerText = 'Please enter a valid email address.';
            return;
        }
        statusEl.style.display = 'block';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.innerText = 'Requesting email update via Supabase Auth...';
        try {
            if (typeof supabaseClient !== 'undefined' && supabaseClient.client?.auth) {
                const { error } = await supabaseClient.client.auth.updateUser({ email: newEmail });
                if (error) {
                    statusEl.style.color = 'var(--red)';
                    statusEl.innerText = 'Error: ' + error.message;
                } else {
                    statusEl.style.color = '#22c55e';
                    statusEl.innerText = 'Verification email sent to ' + newEmail + '. Please confirm via your inbox.';
                    input.value = '';
                }
            } else {
                statusEl.style.color = 'var(--red)';
                statusEl.innerText = 'Supabase Auth client not initialized.';
            }
        } catch (err) {
            statusEl.style.color = 'var(--red)';
            statusEl.innerText = 'Request failed: ' + err.message;
        }
    }

    async handleUpdatePassword() {
        const passInput = document.getElementById('setting-new-password');
        const confirmInput = document.getElementById('setting-confirm-password');
        const statusEl = document.getElementById('password-change-status');
        if (!passInput || !confirmInput || !statusEl) return;
        const newPass = passInput.value;
        const confirmPass = confirmInput.value;
        if (!newPass || newPass.length < 6) {
            statusEl.style.display = 'block';
            statusEl.style.color = 'var(--red)';
            statusEl.innerText = 'Password must be at least 6 characters.';
            return;
        }
        if (newPass !== confirmPass) {
            statusEl.style.display = 'block';
            statusEl.style.color = 'var(--red)';
            statusEl.innerText = 'Passwords do not match.';
            return;
        }
        statusEl.style.display = 'block';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.innerText = 'Updating password via Supabase Auth...';
        try {
            if (typeof supabaseClient !== 'undefined' && supabaseClient.client?.auth) {
                const { error } = await supabaseClient.client.auth.updateUser({ password: newPass });
                if (error) {
                    statusEl.style.color = 'var(--red)';
                    statusEl.innerText = 'Error: ' + error.message;
                } else {
                    statusEl.style.color = '#22c55e';
                    statusEl.innerText = 'Password updated successfully!';
                    passInput.value = '';
                    confirmInput.value = '';
                }
            } else {
                statusEl.style.color = 'var(--red)';
                statusEl.innerText = 'Supabase Auth client not initialized.';
            }
        } catch (err) {
            statusEl.style.color = 'var(--red)';
            statusEl.innerText = 'Update failed: ' + err.message;
        }
    }

    handleRestoreFileSelect(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const previewContainer = document.getElementById('restore-preview-container');
        const previewTitle = document.getElementById('restore-preview-title');
        const previewDetails = document.getElementById('restore-preview-details');
        if (!previewContainer) return;

        const reader = new FileReader();
        const accountId = storage.currentUserId;
        reader.onload = (e) => {
            if (storage.currentUserId !== accountId || event.target.files?.[0] !== file) return;
            try {
                const parsed = JSON.parse(e.target.result);
                const validation = storage.validateBackupData(parsed);
                if (!validation.valid) {
                    previewContainer.style.display = 'flex';
                    previewTitle.innerText = 'Invalid Backup File';
                    previewTitle.style.color = 'var(--red)';
                    previewDetails.innerText = validation.error;
                    this._pendingRestoreData = null;
                } else {
                    previewContainer.style.display = 'flex';
                    previewTitle.innerText = 'Backup File Validated';
                    previewTitle.style.color = '#22c55e';
                    previewDetails.innerHTML = `
                        Wallets: <strong>${validation.walletsCount}</strong> &bull;
                        Transactions: <strong>${validation.txCount}</strong> &bull;
                        Closed Months: <strong>${validation.closedMonthsCount}</strong><br>
                        <span style="color:var(--text-secondary);font-size:0.72rem;">Click confirm below to restore state safely.</span>
                    `;
                    this._pendingRestoreData = validation.normalizedData || parsed;
                }
            } catch (err) {
                previewContainer.style.display = 'flex';
                previewTitle.innerText = 'Malformed Backup File';
                previewTitle.style.color = 'var(--red)';
                previewDetails.innerText = 'File is not valid JSON: ' + err.message;
                this._pendingRestoreData = null;
            }
        };
        reader.readAsText(file);
    }

    cancelRestore() {
        this._pendingRestoreData = null;
        const fileInput = document.getElementById('setting-restore-file');
        if (fileInput) fileInput.value = '';
        const previewContainer = document.getElementById('restore-preview-container');
        if (previewContainer) previewContainer.style.display = 'none';
    }

    async confirmRestore() {
        if (!this._pendingRestoreData) {
            alert('No valid backup data selected.');
            return;
        }
        const confirmed = confirm('WARNING: Restoring will overwrite all current wallets, transactions, and report snapshots with this backup. This cannot be undone. Are you sure you want to proceed?');
        if (!confirmed) return;

        try {
            const backupToRestore = this._pendingRestoreData;
            const res = await storage.runExclusive(async (state) => {
                const preview = storage.previewContinuousLedgerMigration(backupToRestore);
                if (!preview.success) {
                    return { success: false, error: preview.error || 'Backup validation failed.' };
                }
                const migrated = preview.migratedState;
                storage._attachHistoryGetters(migrated);
                storage._attachBudgetAccessors(migrated);
                storage.state = migrated;
                return true;
            }, { skipCloudSync: true });

            if (res && res.success !== false) {
                this._pendingRestoreData = null;
                this.cancelRestore();
                // Reset confirmed cloud metadata so restored data never automatically overwrites cloud
                storage.lastConfirmedCloudRevision = 0;
                storage.lastConfirmedCloudFingerprint = null;
                storage._persistConfirmedCloudRevision(0, null);
                storage.cloudSyncStatus = 'LOCAL_SAVED';
                this.updateSyncStatusPill('LOCAL_SAVED', 'Restored Locally');
                alert('Backup successfully restored! Refreshing workspace...');
                this.init();
                this.renderAll();
            } else {
                alert('Restoration error: ' + (res?.error || 'Failed to restore backup.'));
            }
        } catch (err) {
            alert('Restoration error: ' + err.message);
        }
    }

    async updateWalletBalance(id, val) {
        if (val === '' || isNaN(val)) return;
        let numVal = Number(val);
        if (!isFinite(numVal) || Math.abs(numVal) > 1e12) return;
        const res = await storage.runExclusive(async (state) => {
            if (state.wallets && state.wallets[id]) {
                const w = state.wallets[id];
                const cur = (w.currency || '').toUpperCase();
                if (cur === '¥' || cur === 'JPY') numVal = Math.round(numVal);
                else numVal = Math.round(numVal * 100) / 100;
                w.balance = numVal;
                return true;
            }
            return false;
        });
        if (res && res.success !== false) {
            this.renderAll();
        }
    }

    async removeCategory(region, id) {
        if (!confirm('Remove this category?')) return;
        const res = await storage.runExclusive(async (state) => {
            if (state.categories && state.categories[region]) {
                state.categories[region] = state.categories[region].filter(c => c.id !== id);
                return true;
            }
            return false;
        });
        if (res && res.success !== false) {
            if (this.ledgerFilters && this.ledgerFilters.categoryId === id) {
                this.ledgerFilters.categoryId = 'all';
            }
            this.renderSettings();
            if (window.lucide && lucide.createIcons) lucide.createIcons();
        }
    }

    async addCategory(region) {
        const nameEl = document.getElementById(`new-cat-name-${region}`);
        const name = nameEl ? nameEl.value.trim() : '';
        if (!name) return alert('Please enter a category name.');

        const id = region.toLowerCase() + '-' + name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
        const newCat = { id, name, icon: 'tag' };

        if (region === 'JP') {
            const budgetEl = document.getElementById(`new-cat-budget-${region}`);
            newCat.budget = budgetEl ? Number(budgetEl.value) || 0 : 0;
        }

        const res = await storage.runExclusive(async (state) => {
            if (!state.categories) state.categories = {};
            if (!state.categories[region]) state.categories[region] = [];
            state.categories[region].push(newCat);
            return true;
        });

        if (res && res.success !== false) {
            this.renderSettings();
            if (window.lucide && lucide.createIcons) lucide.createIcons();
        }
    }

    async updateCategoryBudget(id, val) {
        if (val === '' || isNaN(val)) return;
        const numVal = Number(val);
        if (!isFinite(numVal) || numVal < 0 || numVal > 1e12) return;
        await storage.runExclusive(async (state) => {
            let found = null;
            for (const r of ['JP', 'IN', 'DE']) {
                const cat = (state.categories?.[r] || []).find(c => c.id === id);
                if (cat) {
                    cat.budget = (r === 'JP') ? Math.round(numVal) : Math.round(numVal * 100) / 100;
                    found = cat;
                    break;
                }
            }
            return Boolean(found);
        });
    }

    // Converts a hex color into inline gradient styles for wallet cards
    getWalletStyle(hexColor) {
        const color = this.safeWalletColor(hexColor).slice(1);
        const hex = color.length === 3 ? Array.from(color, digit => digit + digit).join('') : color;
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        // Lighter pastel text — blend towards white
        const lr = Math.round(r * 0.6 + 255 * 0.4);
        const lg = Math.round(g * 0.6 + 255 * 0.4);
        const lb = Math.round(b * 0.6 + 255 * 0.4);
        return {
            card: `background:linear-gradient(135deg,rgba(${r},${g},${b},0.22),rgba(${r},${g},${b},0.06));border:1px solid rgba(${r},${g},${b},0.45);`,
            text: `rgb(${lr},${lg},${lb})`
        };
    }

    async addWallet() {
        const name = (document.getElementById('new-wallet-name').value || '').trim();
        if (!name) return alert('Please enter a wallet name.');
        if (storage.state.wallets[name]) return alert('A wallet with this name already exists.');

        const type = document.getElementById('new-wallet-type').value;
        const region = document.getElementById('new-wallet-region').value;
        const color = document.getElementById('new-wallet-color').value || WALLET_COLORS[0];
        const currency = region === 'JP' ? '¥' : (region === 'DE' ? '€' : '₹');

        const res = await storage.runExclusive(async (state) => {
            if (state.wallets[name]) {
                return { success: false, error: 'A wallet with this name already exists.' };
            }
            state.wallets[name] = { id: name, type, region, balance: 0, currency, color };
            return true;
        });

        if (res && res.success !== false) {
            this.renderAll();
            this.renderSettings();
            if (window.lucide && lucide.createIcons) lucide.createIcons();
        } else {
            alert(res?.error || 'Failed to add wallet.');
        }
    }

    /**
     * Check if a wallet is referenced anywhere in continuous transactions or historical archives.
     * Prevents destructive deletion of wallets referenced in past records.
     */
    isWalletReferenced(state, walletId) {
        if (!state || !walletId) return false;
        if (Array.isArray(state.transactions)) {
            if (state.transactions.some(tx => tx.walletId === walletId || tx.sourceId === walletId || tx.destId === walletId)) {
                return true;
            }
        }
        if (state.closedMonths) {
            for (const m of Object.values(state.closedMonths)) {
                if (Array.isArray(m?.transactions) && m.transactions.some(tx => tx.walletId === walletId || tx.sourceId === walletId || tx.destId === walletId)) {
                    return true;
                }
            }
        }
        if (Array.isArray(state.history)) {
            for (const h of state.history) {
                if (Array.isArray(h?.transactions) && h.transactions.some(tx => tx.walletId === walletId || tx.sourceId === walletId || tx.destId === walletId)) {
                    return true;
                }
            }
        }
        return false;
    }

    async removeWallet(id) {
        if (this.isWalletReferenced(storage.state, id)) {
            alert(`Cannot delete wallet "${id}" because it is referenced by historical transactions, transfers, or remittances. Deleting it would leave orphaned references and break financial accounting. You may set its balance to 0 instead.`);
            return;
        }

        if (!confirm(`Remove wallet "${id}"?`)) return;

        const res = await storage.runExclusive(async (state) => {
            if (this.isWalletReferenced(state, id)) {
                return { success: false, error: `Cannot delete wallet "${id}" because it is referenced by historical records.` };
            }
            delete state.wallets[id];
            return true;
        });

        if (res && res.success !== false) {
            if (this.ledgerFilters && this.ledgerFilters.walletId === id) {
                this.ledgerFilters.walletId = 'all';
            }
            this.renderAll();
            this.renderSettings();
            if (window.lucide && lucide.createIcons) lucide.createIcons();
        } else {
            alert(res?.error || 'Failed to remove wallet.');
        }
    }

    async updateWalletColor(id, color) {
        const res = await storage.runExclusive(async (state) => {
            if (state.wallets && state.wallets[id]) {
                state.wallets[id].color = color;
                return true;
            }
            return false;
        });
        if (res && res.success !== false) {
            this.renderWallets();
            this.renderSettings();
            if (window.lucide && lucide.createIcons) lucide.createIcons();
        }
    }

    selectNewWalletColor(color, el) {
        document.querySelectorAll('#new-wallet-color-picker .color-swatch').forEach(s => s.classList.remove('selected'));
        el.classList.add('selected');
        const input = document.getElementById('new-wallet-color');
        if (input) input.value = color;
    }

    // ─── Drag and Drop Reordering ──────────────────────────────────────────────

    handleDragStart(e) {
        const item = e.target.closest('.draggable-item');
        if (!item) return;

        e.dataTransfer.setData('text/plain', item.dataset.id);
        item.style.opacity = '0.4';
        this.draggedElement = item;
    }

    handleDragOver(e) {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e) {
        e.preventDefault();
        const target = e.target.closest('.draggable-item');
        if (target && target !== this.draggedElement && target.dataset.type === this.draggedElement.dataset.type) {
            target.style.borderTop = '2px solid var(--accent)';
        }
    }

    handleDragLeave(e) {
        const target = e.target.closest('.draggable-item');
        if (target && target !== this.draggedElement) {
            target.style.borderTop = '';
        }
    }

    handleDrop(e, type, region = null) {
        e.preventDefault();
        const target = e.target.closest('.draggable-item');
        if (target) {
            target.style.borderTop = '';
        }

        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || !target || target.dataset.id === draggedId || target.dataset.type !== type) return;

        const targetId = target.dataset.id;

        if (type === 'wallet') {
            this.reorderWallets(draggedId, targetId);
        } else if (type === 'category') {
            this.reorderCategories(region, draggedId, targetId);
        }
    }

    handleDragEnd(e) {
        const item = e.target.closest('.draggable-item');
        if (item) item.style.opacity = '1';
        this.draggedElement = null;
        document.querySelectorAll('.draggable-item').forEach(el => {
            el.style.borderTop = '';
        });
    }

    async reorderWallets(draggedId, targetId) {
        await storage.runExclusive(async (state) => {
            const keys = Object.keys(state.wallets || {});
            const draggedIndex = keys.indexOf(draggedId);
            const targetIndex = keys.indexOf(targetId);

            if (draggedIndex === -1 || targetIndex === -1) return false;

            keys.splice(draggedIndex, 1);
            keys.splice(targetIndex, 0, draggedId);

            const newWallets = {};
            keys.forEach(k => newWallets[k] = state.wallets[k]);
            state.wallets = newWallets;
            return true;
        });

        this.renderAll();
        this.renderSettings();
        if (window.lucide && lucide.createIcons) lucide.createIcons();
    }

    async reorderCategories(region, draggedId, targetId) {
        await storage.runExclusive(async (state) => {
            const cats = state.categories?.[region];
            if (!cats) return false;
            const draggedIndex = cats.findIndex(c => c.id === draggedId);
            const targetIndex = cats.findIndex(c => c.id === targetId);

            if (draggedIndex === -1 || targetIndex === -1) return false;

            const [draggedItem] = cats.splice(draggedIndex, 1);
            cats.splice(targetIndex, 0, draggedItem);
            return true;
        });

        this.renderSettings();
        if (window.lucide && lucide.createIcons) lucide.createIcons();
    }


    // ─── HSV Canvas Color Picker ──────────────────────────────────────────────

    openColorPicker(walletId) {
        this._cpWalletId = walletId; // null = new wallet mode
        const color = walletId
            ? (storage.state.wallets[walletId]?.color || WALLET_COLORS[0])
            : (document.getElementById('new-wallet-color')?.value || WALLET_COLORS[0]);
        const hsv = this._cpHexToHsv(color);
        this._cpH = hsv.h; this._cpS = hsv.s; this._cpV = hsv.v;
        document.getElementById('color-picker-modal').classList.add('active');
        requestAnimationFrame(() => this._cpInit());
    }

    applyWalletColor() {
        const hex = this._cpHsvToHex(this._cpH, this._cpS, this._cpV);
        if (this._cpWalletId) {
            this.updateWalletColor(this._cpWalletId, hex);
        } else {
            const input = document.getElementById('new-wallet-color');
            if (input) input.value = hex;
            const preview = document.getElementById('new-wallet-color-preview');
            if (preview) {
                const ws = this.getWalletStyle(hex);
                preview.style.cssText = `width:38px;height:38px;border-radius:8px;flex-shrink:0;${ws.card}`;
            }
        }
        this.closeModal('color-picker-modal');
    }

    cpHexInput(val) {
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            const hsv = this._cpHexToHsv(val);
            this._cpH = hsv.h; this._cpS = hsv.s; this._cpV = hsv.v;
            this._cpDrawAll();
        }
    }

    _cpInit() {
        if (!this._cpEventsSet) {
            this._cpEventsSet = true;
            this._cpSvDrag = false;
            this._cpHueDrag = false;

            const getSv = (e) => {
                const sv = document.getElementById('cp-sv-canvas');
                const rect = sv.getBoundingClientRect();
                const cx = e.touches ? e.touches[0].clientX : e.clientX;
                const cy = e.touches ? e.touches[0].clientY : e.clientY;
                this._cpS = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
                this._cpV = Math.max(0, Math.min(1, 1 - (cy - rect.top) / rect.height));
            };
            const getHue = (e) => {
                const hue = document.getElementById('cp-hue-canvas');
                const rect = hue.getBoundingClientRect();
                const cy = e.touches ? e.touches[0].clientY : e.clientY;
                this._cpH = Math.max(0, Math.min(359.99, ((cy - rect.top) / rect.height) * 360));
            };

            const sv = document.getElementById('cp-sv-canvas');
            const hue = document.getElementById('cp-hue-canvas');

            sv.addEventListener('mousedown', e => { this._cpSvDrag = true; getSv(e); this._cpDrawAll(); });
            sv.addEventListener('touchstart', e => { this._cpSvDrag = true; getSv(e); this._cpDrawAll(); e.preventDefault(); }, { passive: false });
            hue.addEventListener('mousedown', e => { this._cpHueDrag = true; getHue(e); this._cpDrawAll(); });
            hue.addEventListener('touchstart', e => { this._cpHueDrag = true; getHue(e); this._cpDrawAll(); e.preventDefault(); }, { passive: false });

            document.addEventListener('mousemove', e => {
                if (this._cpSvDrag) { getSv(e); this._cpDrawAll(); }
                if (this._cpHueDrag) { getHue(e); this._cpDrawAll(); }
            });
            document.addEventListener('touchmove', e => {
                if (this._cpSvDrag) { getSv(e); this._cpDrawAll(); e.preventDefault(); }
                if (this._cpHueDrag) { getHue(e); this._cpDrawAll(); e.preventDefault(); }
            }, { passive: false });
            document.addEventListener('mouseup', () => { this._cpSvDrag = false; this._cpHueDrag = false; });
            document.addEventListener('touchend', () => { this._cpSvDrag = false; this._cpHueDrag = false; });

            window.addEventListener('resize', () => {
                if (document.getElementById('color-picker-modal')?.classList.contains('active')) {
                    this._cpDrawAll();
                }
            });
        }
        this._cpDrawAll();
    }

    _cpDrawAll() {
        this._cpDrawSV();
        this._cpDrawHue();
        this._cpUpdateHeader();
    }

    _cpDrawSV() {
        const canvas = document.getElementById('cp-sv-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const W = Math.floor(rect.width || canvas.clientWidth);
        const H = Math.floor(rect.height || canvas.clientHeight);
        if (!W || !H) return;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Base hue fill
        ctx.fillStyle = `hsl(${this._cpH},100%,50%)`;
        ctx.fillRect(0, 0, W, H);
        // White gradient left→right
        const gw = ctx.createLinearGradient(0, 0, W, 0);
        gw.addColorStop(0, 'rgba(255,255,255,1)');
        gw.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gw;
        ctx.fillRect(0, 0, W, H);
        // Black gradient top→bottom
        const gb = ctx.createLinearGradient(0, 0, 0, H);
        gb.addColorStop(0, 'rgba(0,0,0,0)');
        gb.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = gb;
        ctx.fillRect(0, 0, W, H);

        // Cursor
        const cx = this._cpS * W, cy = (1 - this._cpV) * H;
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    }

    _cpDrawHue() {
        const canvas = document.getElementById('cp-hue-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const W = Math.floor(rect.width || canvas.clientWidth);
        const H = Math.floor(rect.height || canvas.clientHeight);
        if (!W || !H) return;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 0, H);
        [0, 60, 120, 180, 240, 300, 360].forEach(h => grad.addColorStop(h / 360, `hsl(${h},100%,50%)`));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Indicator
        const y = (this._cpH / 360) * H;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(0, y - 2, W, 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(0, y - 2, W, 4);
    }

    _cpUpdateHeader() {
        const hex = this._cpHsvToHex(this._cpH, this._cpS, this._cpV);
        const inp = document.getElementById('cp-hex-input');
        if (inp) inp.value = hex;
        const header = document.getElementById('cp-header');
        if (header) {
            const { r, g, b } = this._cpHexToRgb(hex);
            header.style.background = `rgba(${r},${g},${b},0.18)`;
        }
    }

    // ─── Color Math Utilities ─────────────────────────────────────────────────
    _cpHsvToHex(h, s, v) {
        const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
        const r = Math.round(f(5) * 255), g = Math.round(f(3) * 255), b = Math.round(f(1) * 255);
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    _cpHexToHsv(hex) {
        const { r, g, b } = this._cpHexToRgb(hex);
        const rr = r / 255, gg = g / 255, bb = b / 255;
        const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
        let h = 0;
        if (d) {
            if (max === rr) h = ((gg - bb) / d + 6) % 6;
            else if (max === gg) h = (bb - rr) / d + 2;
            else h = (rr - gg) / d + 4;
            h *= 60;
        }
        return { h, s: max ? d / max : 0, v: max };
    }

    _cpHexToRgb(hex) {
        const h = hex.replace('#', '');
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }

    renderWallets() {
        const activeCountries = storage.getActiveCountries();
        const countryTotals = { JP: 0, IN: 0, DE: 0 };
        const countryCounts = { JP: 0, IN: 0, DE: 0 };

        Object.values(storage.state.wallets || {}).forEach(w => {
            const reg = (w.region === 'DE' ? 'DE' : w.region === 'IN' ? 'IN' : 'JP');
            countryTotals[reg] += w.balance || 0;
            countryCounts[reg]++;
        });

        const jpCard = document.getElementById('jp-country-card');
        const inCard = document.getElementById('in-country-card');
        const deCard = document.getElementById('de-country-card');

        if (jpCard) jpCard.style.display = activeCountries.includes('JP') ? '' : 'none';
        if (inCard) inCard.style.display = activeCountries.includes('IN') ? '' : 'none';
        if (deCard) deCard.style.display = activeCountries.includes('DE') ? '' : 'none';

        const jpTotalEl = document.getElementById('jp-total-balance');
        if (jpTotalEl) jpTotalEl.innerText = this.formatMoney(countryTotals.JP, '¥');
        const inTotalEl = document.getElementById('in-total-balance');
        if (inTotalEl) inTotalEl.innerText = this.formatMoney(countryTotals.IN, '₹');
        const deTotalEl = document.getElementById('de-total-balance');
        if (deTotalEl) deTotalEl.innerText = this.formatMoney(countryTotals.DE, '€');

        const jpCountBadge = document.getElementById('jp-wallet-count-badge');
        if (jpCountBadge) jpCountBadge.innerText = `${countryCounts.JP} ${countryCounts.JP === 1 ? 'account' : 'accounts'}`;
        const inCountBadge = document.getElementById('in-wallet-count-badge');
        if (inCountBadge) inCountBadge.innerText = `${countryCounts.IN} ${countryCounts.IN === 1 ? 'account' : 'accounts'}`;
        const deCountBadge = document.getElementById('de-wallet-count-badge');
        if (deCountBadge) deCountBadge.innerText = `${countryCounts.DE} ${countryCounts.DE === 1 ? 'account' : 'accounts'}`;

        // Refresh Monthly Summary & Dashboard Category Breakdown Chart
        this.renderMonthlySummary();
        this.renderDashboardExpenseChart();

        // Update Month Header
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        let headerStr = "";
        const mKey = this.activeMonthKey;
        if (mKey) {
            const [y, m] = mKey.split('-');
            headerStr = `${monthNames[parseInt(m) - 1]} ${this.escapeHtml(y)}`;
            if (this.isViewingPast()) {
                headerStr = `<span style="color:var(--orange)">${headerStr} (Past)</span>`;
            }
        }
        const disp = document.getElementById('current-month-display');
        if (disp) disp.innerHTML = headerStr;
        const desktopDisp = document.getElementById('desktop-current-month-display');
        if (desktopDisp) desktopDisp.innerHTML = headerStr;

        // Clear inline overrides so CSS responsive 3-column desktop layout applies
        ['jp-categories-grid', 'in-categories-grid', 'de-categories-grid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = '';
                el.style.gridTemplateColumns = '';
                el.style.gap = '';
            }
        });

        // Modern Web Guidance: Only render wallets view when it is the active screen
        if (this.currentView === 'wallets-view') {
            this.renderWalletsPage();
        }
    }

    getBudgetOverviewCardHtml(options = {}) {
        const region = options.region || 'JP';
        const currency = options.currency
            || (typeof CountryConfig !== 'undefined' && CountryConfig.get(region)?.currency)
            || (region === 'JP' ? '¥' : region === 'DE' ? '€' : '₹');
        const monthKey = options.monthKey || this.activeMonthKey || (storage.state && storage.state.currentMonthKey) || new Date().toISOString().slice(0, 7);

        // Sum category limits for cushion calculation
        let sumCatBudgets;
        if (options.sumCatBudgets !== undefined && options.sumCatBudgets !== null) {
            sumCatBudgets = Number(options.sumCatBudgets) || 0;
        } else {
            const cats = (storage.state.categories && storage.state.categories[region]) || [];
            sumCatBudgets = cats
                .filter(c => c.contributesToTotalBudget !== false && c.isActive !== false)
                .reduce((s, c) => s + (c.budget || 0), 0);
        }

        // Overall allocated budget for region
        let baseBudget;
        if (options.allocatedBudget !== undefined && options.allocatedBudget !== null) {
            baseBudget = Number(options.allocatedBudget) || 0;
        } else {
            baseBudget = storage.getTotalBudget(region);
        }

        const carryover = options.carryover !== undefined ? Number(options.carryover) : storage.getCarryover(region);
        const totalAvailable = baseBudget + carryover;

        // Total spent in region for active month
        let totalSpent;
        if (options.totalSpent !== undefined && options.totalSpent !== null) {
            totalSpent = Number(options.totalSpent) || 0;
        } else {
            totalSpent = walletManager.getTotalSpent(region, this.getActiveTransactions());
        }

        const remaining = totalAvailable - totalSpent;
        const isOver = remaining < 0;
        const pct = totalAvailable > 0 ? Math.min((totalSpent / totalAvailable) * 100, 100) : 0;
        const utilizationPct = totalAvailable > 0 ? Math.round((totalSpent / totalAvailable) * 100) : 0;
        const cushion = (sumCatBudgets > 0) ? Math.max(0, totalAvailable - sumCatBudgets) : 0;

        let barClass = 'neon-safe';
        if (pct > 90 || utilizationPct > 100) barClass = 'neon-danger';
        else if (pct > 75 || utilizationPct >= 75) barClass = 'neon-warn';

        const editButtonHtml = options.showEditButton ? `
            <button class="budgets-kpi-edit-btn" onclick="event.stopPropagation(); app.openOverallBudgetModal('${region}')" title="Configure Overall Monthly Limit" style="cursor: pointer;">
                <i data-lucide="sliders" style="width: 13px; height: 13px;"></i>
            </button>
        ` : '';

        const cushionTooltip = carryover > 0 ? `title="Includes +${this.formatMoney(carryover, currency)} rollover from previous month"` : '';
        const cushionBadgeHtml = cushion > 0 ? `
            <span class="budget-cushion-pill privacy-blur" ${cushionTooltip}>+${this.formatMoney(cushion, currency)} Cushion</span>
        ` : '';

        const badgesRowHtml = cushionBadgeHtml ? `
            <div class="budget-central-badges-row">
                ${cushionBadgeHtml}
            </div>
        ` : '';

        const titleText = this.escapeHtml(options.title || 'Monthly Budget');
        const cardClass = options.cardClass ? ` ${options.cardClass}` : '';
        const interactiveAttr = options.isInteractive ? `onclick="app.openOverallBudgetModal('${region}')" style="cursor: pointer;" title="Configure Overall Monthly Limit"` : '';
        const interactiveCls = options.isInteractive ? ' interactive' : '';

        const isBudgetEnabled = options.enabled !== undefined ? Boolean(options.enabled) : storage.isBudgetEnabled(region);
        if (!isBudgetEnabled) {
            return `
                <div class="card budget-central-card${cardClass}${interactiveCls}" ${interactiveAttr}>
                    <div class="budget-central-header">
                        <div class="budget-central-header-top">
                            <div class="budget-central-title-group">
                                ${this.getCountryFlagSvg(region, 20, 15)}
                                <h3 class="budget-central-title">${titleText}</h3>
                                <span class="text-xs text-muted font-numeric budget-central-month">(${this.escapeHtml(monthKey)})</span>
                            </div>
                            ${editButtonHtml}
                        </div>
                    </div>
                    <div style="padding: 10px 0;">
                        <span class="text-xs text-muted">Budgeting is turned off for this region.</span>
                        <div style="margin-top: 8px;">
                            <button type="button" class="btn btn-secondary btn-xs" onclick="event.stopPropagation(); app.openOverallBudgetModal('${region}')" style="gap: 5px; font-size: 0.75rem;">
                                <i data-lucide="sliders" style="width: 12px; height: 12px;"></i>
                                <span>Enable & Configure Budget</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        const isBudgetConfigured = totalAvailable > 0;
        if (!isBudgetConfigured) {
            return `
                <div class="card budget-central-card${cardClass}${interactiveCls}" ${interactiveAttr}>
                    <div class="budget-central-header">
                        <div class="budget-central-header-top">
                            <div class="budget-central-title-group">
                                ${this.getCountryFlagSvg(region, 20, 15)}
                                <h3 class="budget-central-title">${titleText}</h3>
                                <span class="text-xs text-muted font-numeric budget-central-month">(${this.escapeHtml(monthKey)})</span>
                            </div>
                            <button type="button" class="btn btn-secondary btn-xs" onclick="event.stopPropagation(); app.openOverallBudgetModal('${region}')" style="gap: 5px; font-size: 0.75rem;" title="Configure Monthly Budget">
                                <i data-lucide="sliders" style="width: 12px; height: 12px;"></i>
                                <span>Set Monthly Budget</span>
                            </button>
                        </div>
                        ${badgesRowHtml}
                    </div>
                    <div class="budget-central-stats-row" style="margin-top: 8px;">
                        <span class="budget-stat-item-left privacy-blur">Spent: <strong>${this.formatMoney(totalSpent, currency)}</strong></span>
                        <span class="budget-stat-item-right" style="color: var(--text-muted); font-size: 0.8rem;">Limit: Not Set</span>
                    </div>
                    <p class="text-xs text-muted" style="margin: 6px 0 0 0; line-height: 1.4;">Expense tracking continues without a spending limit. Tap to configure a monthly budget.</p>
                </div>
            `;
        }

        return `
            <div class="card budget-central-card${cardClass}${interactiveCls}" ${interactiveAttr}>
                <div class="budget-central-header">
                    <div class="budget-central-header-top">
                        <div class="budget-central-title-group">
                            ${this.getCountryFlagSvg(region, 20, 15)}
                            <h3 class="budget-central-title">${titleText}</h3>
                            <span class="text-xs text-muted font-numeric budget-central-month">(${this.escapeHtml(monthKey)})</span>
                        </div>
                        ${editButtonHtml}
                    </div>
                    ${badgesRowHtml}
                </div>
                <div class="budget-central-progress-wrap">
                    <div class="budget-streak-track">
                        <div class="budget-streak-fill ${barClass}" style="width: ${pct}%;"></div>
                    </div>
                </div>
                <div class="budget-central-stats-row">
                    <span class="budget-stat-item-left privacy-blur">Spent: <strong>${this.formatMoney(totalSpent, currency)}</strong></span>
                    ${isOver
                ? `<span class="budget-stat-item-right privacy-blur">Over limit: <strong class="text-danger">${this.formatMoney(Math.abs(remaining), currency)}</strong></span>`
                : `<span class="budget-stat-item-right privacy-blur">Remaining: <strong>${this.formatMoney(remaining, currency)}</strong></span>`
            }
                </div>
            </div>
        `;
    }

    renderBudgetOverviewCard(target, options = {}) {
        const el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el) return;

        const html = this.getBudgetOverviewCardHtml(options);
        if (el.classList.contains('budget-central-card')) {
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const innerCard = tmp.firstElementChild;
            el.innerHTML = innerCard ? innerCard.innerHTML : '';
            const region = options.region || 'JP';
            if (options.isInteractive) {
                el.style.cursor = 'pointer';
                el.setAttribute('title', 'Configure Overall Monthly Limit');
                el.onclick = () => app.openOverallBudgetModal(region);
                el.classList.add('interactive');
            } else {
                el.style.cursor = 'default';
                el.removeAttribute('title');
                el.onclick = null;
                el.classList.remove('interactive');
            }
        } else {
            el.innerHTML = html;
        }

        this.refreshIcons(el);
    }

    renderCategories() {
        const activeCountries = storage.getActiveCountries();
        const wallets = storage.state?.wallets || {};

        const config = [
            { region: 'JP', headerId: 'jp-categories-header-toggle', wrapId: 'jp-categories-wrap', gridId: 'jp-categories-grid', cardId: 'budget-overview-card', chevronId: 'jp-chevron' },
            { region: 'IN', headerId: 'in-categories-header-toggle', wrapId: 'in-categories-wrap', gridId: 'in-categories-grid', cardId: 'budget-overview-card-in', chevronId: 'in-chevron' },
            { region: 'DE', headerId: 'de-categories-header-toggle', wrapId: 'de-categories-wrap', gridId: 'de-categories-grid', cardId: 'budget-overview-card-de', chevronId: 'de-chevron' }
        ];

        // Only show a country's spending categories section if it is an active jurisdiction,
        // has configured accounts/wallets, and has budgeting enabled.
        const visibleBudgetRegions = config.filter(cfg => {
            const isActive = activeCountries.includes(cfg.region);
            const hasWallets = Object.values(wallets).some(w => w && w.region === cfg.region);
            const isBudgetEnabled = storage.isBudgetEnabled(cfg.region);
            return isActive && hasWallets && isBudgetEnabled;
        }).map(cfg => cfg.region);

        const singleCountry = visibleBudgetRegions.length === 1;

        config.forEach(cfg => {
            const shouldShow = visibleBudgetRegions.includes(cfg.region);
            const headerEl = document.getElementById(cfg.headerId);
            const wrapEl = document.getElementById(cfg.wrapId);
            const cardEl = document.getElementById(cfg.cardId);

            if (!shouldShow) {
                if (headerEl) headerEl.style.display = 'none';
                if (wrapEl) wrapEl.style.display = 'none';
                return;
            }

            if (headerEl) headerEl.style.display = 'flex';
            if (wrapEl) {
                wrapEl.style.display = 'block';
                if (singleCountry) {
                    wrapEl.classList.remove('collapsed');
                    if (headerEl) headerEl.setAttribute('aria-expanded', 'true');
                    const chevron = document.getElementById(cfg.chevronId);
                    if (chevron) {
                        chevron.classList.remove('rotate-180');
                        chevron.classList.remove('rotated');
                    }
                }
            }

            // Central Budget Overview Card Visibility
            const isBudgetEnabled = storage.isBudgetEnabled(cfg.region);
            if (cardEl) {
                if (isBudgetEnabled) {
                    cardEl.style.display = 'block';
                    const spent = walletManager.getTotalSpent(cfg.region, this.getActiveTransactions());
                    this.renderBudgetOverviewCard(cfg.cardId, {
                        region: cfg.region,
                        monthKey: this.activeMonthKey,
                        totalSpent: spent,
                        allocatedBudget: storage.getTotalBudget(cfg.region),
                        isInteractive: true,
                        showEditButton: true
                    });
                } else {
                    cardEl.style.display = 'none';
                }
            }

            // Render category grid for this active region
            this.renderCategoryGrid(cfg.region, cfg.gridId);
        });
    }

    renderCategoryGrid(region, elementId) {
        const activeTxs = this.getActiveTransactions();
        const totals = {};
        activeTxs.forEach(tx => {
            if (tx.type === 'expense' && tx.region === region) {
                totals[tx.categoryId] = (totals[tx.categoryId] || 0) + tx.amount;
            }
        });

        let html = '';
        const currency = (typeof CountryConfig !== 'undefined' && CountryConfig.get(region)?.currency)
            || (region === 'JP' ? '¥' : region === 'DE' ? '€' : '₹');
        const isBudgetEnabled = storage.isBudgetEnabled(region);

        // Filter out archived categories and those configured hidden from overview
        const cats = (storage.state.categories?.[region] || []).filter(c => c.isActive !== false && !c.hiddenFromBudgetOverview);

        cats.forEach(c => {
            const spent = totals[c.id] || 0;
            let progressHtml = '';

            const activeBudget = c.budget || 0;
            const isOver = isBudgetEnabled && activeBudget > 0 && spent > activeBudget;

            if (isBudgetEnabled && activeBudget > 0) {
                const pct = Math.min((spent / activeBudget) * 100, 100);
                let barClass = 'neon-safe';
                if (pct > 90) barClass = 'neon-danger';
                else if (pct > 75) barClass = 'neon-warn';

                progressHtml = `
                    <div class="neon-bar-bg">
                        <div class="neon-bar-fill ${barClass}" style="width: ${pct}%"></div>
                    </div>
                    <div class="neon-amount-sub" style="margin-top: 4px; display:flex; justify-content:space-between;">
                        <span class="privacy-blur">${this.formatMoney(spent, currency)}</span>
                        <span class="privacy-blur">${this.formatMoney(activeBudget, currency)}</span>
                    </div>
                `;
            } else {
                progressHtml = `<div class="neon-amount-sub" style="margin-top: 4px;">Spent: <span class="privacy-blur">${this.formatMoney(spent, currency)}</span></div>`;
            }

            html += `
                <div class="neon-row ${isOver ? 'is-overbudget' : ''}" style="padding: 14px; cursor: pointer;" data-category-id="${this.escapeHtml(c.id)}" data-region="${this.escapeHtml(region)}" onclick="app.openCategoryManageModal(this.dataset.categoryId, this.dataset.region)" title="Click to manage ${this.escapeHtml(c.name)}">
                    <div class="neon-header" style="margin-bottom: 8px;">
                        <span class="neon-title"><i data-lucide="${this.categoryIcon(c.icon)}"></i> ${this.escapeHtml(c.name)}</span>
                    </div>
                    ${progressHtml}
                </div>
            `;
        });
        const el = document.getElementById(elementId);
        if (el) el.innerHTML = html || `<p class="text-muted text-sm" style="grid-column: 1/-1; padding: 24px 0; text-align: center;">No categories configured.</p>`;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: el });
        }
    }

    renderTransactions() {
        const activeTxs = this.getActiveTransactions();
        const txs = activeTxs.slice(0, 5); // 5 items: compact, prevents unnecessarily tall rail card
        const container = document.getElementById('recent-transactions-list');
        const countBadge = document.getElementById('dash-recent-count-badge');

        if (countBadge) {
            countBadge.innerText = activeTxs.length > 0 ? `${activeTxs.length} Recorded` : 'This Month';
        }

        if (!container) return;

        if (txs.length === 0) {
            const allTotalTxs = (storage.state?.transactions || []).length;
            if (allTotalTxs === 0) {
                container.innerHTML = `
                    <div class="dash-recent-empty">
                        <i data-lucide="sparkles" class="dash-recent-empty-icon" style="color: var(--accent);"></i>
                        <p class="dash-recent-empty-text font-medium" style="color: var(--text-primary); margin-bottom: 2px;">Your accounts are ready</p>
                        <p class="dash-recent-empty-text text-xs" style="color: var(--text-muted); margin-bottom: 10px;">Record your first expense or income to track your activity.</p>
                        <button class="btn btn-primary btn-xs" onclick="app.openUnifiedTransactionSelector()" style="gap: 5px;">
                            <i data-lucide="plus" style="width: 13px; height: 13px;"></i>
                            <span>Add Transaction</span>
                        </button>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="dash-recent-empty">
                        <i data-lucide="receipt" class="dash-recent-empty-icon"></i>
                        <p class="dash-recent-empty-text">No activity recorded for this period.</p>
                    </div>
                `;
            }
            this.refreshIcons(container);
            return;
        }

        let html = '';
        txs.forEach(tx => {
            const effectiveType = tx.type || (tx.isIncome ? 'income' : (tx.sourceId && tx.destId ? 'transfer' : 'expense'));
            let icon = 'arrow-up-right';
            let typeCls = 'expense';
            let amountCls = 'tx-amt-expense';
            let sign = '-';
            let title = '';
            let meta = '';

            const date = new Date(tx.date || Date.now());
            const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

            if (effectiveType === 'income') {
                icon = 'arrow-down-left';
                typeCls = 'income';
                amountCls = 'tx-amt-income';
                sign = '+';
                const catName = this.getTransactionCategory(tx);
                const walletName = this.getWalletName(tx.walletId);
                title = tx.note || catName;
                const metaParts = [dateStr, walletName, catName].filter(Boolean);
                meta = metaParts.join(' • ');
            } else if (effectiveType === 'transfer') {
                icon = 'arrow-left-right';
                typeCls = 'transfer';
                amountCls = 'tx-amt-neutral';
                sign = '';
                const srcName = this.getWalletName(tx.sourceId);
                const dstName = this.getWalletName(tx.destId);
                title = tx.note || 'Transfer';
                meta = `${dateStr} • ${srcName} → ${dstName}`;
            } else if (effectiveType === 'remittance') {
                icon = 'send';
                typeCls = 'remittance';
                amountCls = 'tx-amt-neutral';
                sign = '';
                const { srcName, dstName } = this.getRemittanceCountryNames(tx);
                const srcWalletName = this.getWalletName(tx.sourceId);
                const dstWalletName = this.getWalletName(tx.destId);
                title = tx.note || 'Remittance';
                meta = `${dateStr} • ${srcWalletName} → ${dstWalletName} (${srcName} → ${dstName})`;
            } else {
                // Expense
                icon = 'arrow-up-right';
                typeCls = 'expense';
                amountCls = 'tx-amt-expense';
                sign = '-';

                const categoryName = this.getTransactionCategory(tx);
                const walletName = this.getWalletName(tx.walletId);

                title = tx.note || categoryName;
                if (tx.note && categoryName && tx.note !== categoryName) {
                    const metaParts = [dateStr, walletName, categoryName].filter(Boolean);
                    meta = metaParts.join(' • ');
                } else {
                    const metaParts = [dateStr, walletName || categoryName].filter(Boolean);
                    meta = metaParts.join(' • ');
                }
            }

            const amt = (effectiveType === 'remittance')
                ? this.formatRemittanceAmount(tx)
                : this.formatMoney(tx.amount, tx.currency, { prefix: sign });

            html += `
                <div class="dash-recent-row" data-transaction-id="${this.escapeHtml(tx.id)}" onclick="app.editTransaction(this.dataset.transactionId)" role="button" tabindex="0" title="Click to view/edit">
                    <div class="dash-recent-left">
                        <div class="dash-recent-icon-wrap ${typeCls}">
                            <i data-lucide="${icon}"></i>
                        </div>
                        <div class="dash-recent-info">
                            <span class="dash-recent-title">${this.escapeHtml(title)}</span>
                            <span class="dash-recent-meta">${this.escapeHtml(meta)}</span>
                        </div>
                    </div>
                    <div class="dash-recent-right">
                        <span class="dash-recent-amount ${amountCls} privacy-blur financial-amount">${this.escapeHtml(amt)}</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        this.refreshIcons(container);
    }

    setMonthlySummaryRegion(region) {
        if (!storage.getActiveCountries().includes(region)) return;
        this.monthlySummaryRegion = region;
        this.renderMonthlySummary();
    }

    renderMonthlySummary() {
        const summaryEl = document.getElementById('monthly-financial-summary');
        if (!summaryEl) return;

        const activeCountries = storage.getActiveCountries();
        const primaryCountry = storage.getPrimaryCountry();

        // Default or sanitize monthlySummaryRegion
        if (!this.monthlySummaryRegion || !activeCountries.includes(this.monthlySummaryRegion)) {
            this.monthlySummaryRegion = activeCountries.includes(primaryCountry) ? primaryCountry : activeCountries[0] || 'JP';
        }

        const region = this.monthlySummaryRegion;
        const countryObj = (typeof CountryConfig !== 'undefined' && CountryConfig.get(region)) || { name: region, currency: region === 'JP' ? '¥' : region === 'DE' ? '€' : '₹' };
        const currency = countryObj.currency;
        const countryName = countryObj.name;

        const activeTxs = this.getActiveTransactions();
        let income = 0;
        let expenses = 0;

        activeTxs.forEach(tx => {
            const amt = Number(tx.amount) || 0;
            if (tx.region === region) {
                if (tx.type === 'income') income += amt;
                else if (tx.type === 'expense') expenses += amt;
            }
        });

        const net = income - expenses;
        const netSavingsClass = net >= 0 ? 'stat-positive' : 'stat-negative';
        const netSavingsSign = net > 0 ? '+' : '';

        // If multiple countries are active, show mini country switcher pills
        let selectorHtml = '';
        if (activeCountries.length > 1) {
            selectorHtml = `
                <div class="monthly-summary-pills" style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                    <span class="text-xs text-muted" style="font-weight: 500;">Monthly Cash Flow</span>
                    <div class="segmented-control" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 2px; border-radius: 6px;">
                        ${activeCountries.map(c => `
                            <button class="segment-btn ${c === region ? 'active' : ''}" onclick="app.setMonthlySummaryRegion('${c}')" style="padding: 3px 10px; font-size: 0.75rem; border-radius: 4px;">
                                ${c === 'JP' ? 'Japan (¥)' : c === 'DE' ? 'Germany (€)' : 'India (₹)'}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        summaryEl.innerHTML = `
            ${selectorHtml}
            <div class="monthly-stat-card">
                <div class="monthly-stat-header">
                    <span class="monthly-stat-label">Monthly Income</span>
                    <span class="monthly-stat-icon">
                        <i data-lucide="trending-up"></i>
                    </span>
                </div>
                <div class="monthly-stat-value privacy-blur financial-amount" style="color: var(--emerald);">
                    ${this.formatMoney(income, currency, { prefix: '+' })}
                </div>
                <div class="monthly-stat-sub">Earned this month</div>
            </div>

            <div class="monthly-stat-card">
                <div class="monthly-stat-header">
                    <span class="monthly-stat-label">Total Outflows</span>
                    <span class="monthly-stat-icon">
                        <i data-lucide="trending-down"></i>
                    </span>
                </div>
                <div class="monthly-stat-value privacy-blur financial-amount" style="color: var(--rose);">
                    ${this.formatMoney(expenses, currency, { prefix: '-' })}
                </div>
                <div class="monthly-stat-sub">Spent this month</div>
            </div>

            <div class="monthly-stat-card">
                <div class="monthly-stat-header">
                    <span class="monthly-stat-label">Net Savings</span>
                    <span class="monthly-stat-icon">
                        <i data-lucide="${net >= 0 ? 'sparkles' : 'alert-circle'}"></i>
                    </span>
                </div>
                <div class="monthly-stat-value privacy-blur financial-amount ${netSavingsClass}">
                    ${this.formatMoney(net, currency, { prefix: netSavingsSign })}
                </div>
                <div class="monthly-stat-sub">Inflows minus outflows</div>
            </div>
        `;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons({ root: summaryEl });
        }
    }

    setDashboardChartRegion(region) {
        if (!storage.getActiveCountries().includes(region)) return;
        this.dashboardChartRegion = region;
        const jpBtn = document.getElementById('dash-region-jp-btn');
        const inBtn = document.getElementById('dash-region-in-btn');
        const deBtn = document.getElementById('dash-region-de-btn');
        if (jpBtn) {
            jpBtn.classList.toggle('active', region === 'JP');
            jpBtn.setAttribute('aria-selected', region === 'JP' ? 'true' : 'false');
        }
        if (inBtn) {
            inBtn.classList.toggle('active', region === 'IN');
            inBtn.setAttribute('aria-selected', region === 'IN' ? 'true' : 'false');
        }
        if (deBtn) {
            deBtn.classList.toggle('active', region === 'DE');
            deBtn.setAttribute('aria-selected', region === 'DE' ? 'true' : 'false');
        }
        this.renderDashboardExpenseChart();
    }

    renderDashboardExpenseChart() {
        if (this.currentView !== 'home-view') return;
        const canvas = document.getElementById('dashboard-category-donut');
        if (!canvas) return;

        const activeCountries = storage.getActiveCountries();
        const primaryCountry = storage.getPrimaryCountry();

        // Ensure dashboardChartRegion is an active country
        if (!this.dashboardChartRegion || !activeCountries.includes(this.dashboardChartRegion)) {
            this.dashboardChartRegion = activeCountries.includes(primaryCountry) ? primaryCountry : activeCountries[0] || 'JP';
        }

        const region = this.dashboardChartRegion;
        const currency = (typeof CountryConfig !== 'undefined' && CountryConfig.get(region)?.currency)
            || (region === 'JP' ? '¥' : region === 'DE' ? '€' : '₹');

        // Manage region switcher pills visibility
        const pillsWrap = document.getElementById('dash-chart-region-pills');
        const jpBtn = document.getElementById('dash-region-jp-btn');
        const inBtn = document.getElementById('dash-region-in-btn');
        const deBtn = document.getElementById('dash-region-de-btn');

        if (pillsWrap) {
            if (activeCountries.length <= 1) {
                pillsWrap.style.display = 'none';
            } else {
                pillsWrap.style.display = 'flex';
                if (jpBtn) {
                    jpBtn.style.display = activeCountries.includes('JP') ? 'inline-flex' : 'none';
                    jpBtn.classList.toggle('active', region === 'JP');
                    jpBtn.setAttribute('aria-selected', region === 'JP' ? 'true' : 'false');
                }
                if (inBtn) {
                    inBtn.style.display = activeCountries.includes('IN') ? 'inline-flex' : 'none';
                    inBtn.classList.toggle('active', region === 'IN');
                    inBtn.setAttribute('aria-selected', region === 'IN' ? 'true' : 'false');
                }
                if (deBtn) {
                    deBtn.style.display = activeCountries.includes('DE') ? 'inline-flex' : 'none';
                    deBtn.classList.toggle('active', region === 'DE');
                    deBtn.setAttribute('aria-selected', region === 'DE' ? 'true' : 'false');
                }
            }
        }

        const activeTxs = this.getActiveTransactions();
        const totals = {};

        activeTxs.forEach(tx => {
            if (tx.type === 'expense' && tx.region === region) {
                const amt = Number(tx.amount) || 0;
                totals[tx.categoryId] = (totals[tx.categoryId] || 0) + amt;
            }
        });

        const categories = (storage.state?.categories?.[region] || []).filter(c => c.isActive !== false);

        const periodBadge = document.getElementById('dash-chart-period-badge');
        if (periodBadge) {
            const mKey = this.activeMonthKey;
            if (mKey) {
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const [y, m] = mKey.split('-');
                periodBadge.innerText = `${monthNames[parseInt(m) - 1]} ${y}`;
            } else {
                periodBadge.innerText = 'This Month';
            }
        }

        if (typeof charts !== 'undefined' && charts.renderDashboardExpenseDonut) {
            charts.renderDashboardExpenseDonut(categories, totals, currency, region);
        }
    }

    isSecondaryWallet(w) {
        if (!w) return false;
        const name = (w.id || '').toLowerCase();
        return w.type === 'card' || name.includes('credit');
    }

    getWalletSortRank(w) {
        if (!w) return 99;
        const name = (w.id || '').toLowerCase();
        // Credit cards / secondary payment methods appear after primary accounts
        if (this.isSecondaryWallet(w)) return 50;

        // Frequently used primary payment methods
        // Japan
        if (name === 'cash' || name.includes('cash')) return 1;
        if (name === 'paypay' || name.includes('paypay')) return 2;
        if (name.includes('salary') || name.includes('yucho')) return 3;

        // India
        if (name.includes('axis bank') || name === 'axis bank' || name === 'bank account') return 10;
        if (name.includes('baroda') || name.includes('bob')) return 11;

        return 20;
    }

    renderWalletsPage() {
        const activeCountries = storage.getActiveCountries();
        const allWallets = Object.values(storage.state.wallets || {});

        const chipSvg = this.getCardChipSvg();
        const contactlessSvg = this.getContactlessSvg();

        const renderCard = (w) => {
            const theme = this.getThemeForWallet(w);
            const isSecondary = this.isSecondaryWallet(w);
            const secondaryCls = isSecondary ? ' wallet-card-secondary' : '';
            const secondaryBadge = isSecondary ? '<span class="wallet-badge-secondary">Secondary</span>' : '';

            const escId = this.escapeHtml(w.id);
            return `
                <div class="wallet-card ${theme.cls}${secondaryCls}" data-wallet-id="${escId}" title="Click to inspect ${escId}" role="button" tabindex="0">
                    <div class="wallet-card-overlay-sheen"></div>
                    <div class="wallet-card-header">
                        <div class="wallet-card-chip-group">
                            ${chipSvg}
                            ${contactlessSvg}
                        </div>
                        <div class="wallet-card-top-right">
                            ${secondaryBadge}
                            <button class="wallet-menu-btn" data-edit-wallet-id="${escId}" onclick="event.stopPropagation(); app.openEditWalletModal(this.dataset.editWalletId)" title="Edit wallet settings" aria-label="Edit wallet settings">
                                <i data-lucide="more-vertical" style="width: 15px; height: 15px;"></i>
                            </button>
                        </div>
                    </div>
                    <div class="wallet-balance-wrap">
                        <span class="wallet-balance-label">Current Balance</span>
                        <div class="wallet-balance-val financial-amount privacy-blur">${this.formatMoney(w.balance, w.currency)}</div>
                    </div>
                    <div class="wallet-card-footer">
                        <div class="wallet-name">${escId}</div>
                    </div>
                </div>
            `;
        };

        const regions = [
            { code: 'JP', name: 'Japan', curr: '¥', kpiId: 'wallets-kpi-jp', groupId: 'wallets-group-jp', gridId: 'wallets-page-jp-grid', countElId: 'wallets-page-jp-count', totalElId: 'wallets-page-jp-total', secCountId: 'wallets-section-jp-count', secTotalId: 'wallets-section-jp-total' },
            { code: 'IN', name: 'India', curr: '₹', kpiId: 'wallets-kpi-in', groupId: 'wallets-group-in', gridId: 'wallets-page-in-grid', countElId: 'wallets-page-in-count', totalElId: 'wallets-page-in-total', secCountId: 'wallets-section-in-count', secTotalId: 'wallets-section-in-total' },
            { code: 'DE', name: 'Germany', curr: '€', kpiId: 'wallets-kpi-de', groupId: 'wallets-group-de', gridId: 'wallets-page-de-grid', countElId: 'wallets-page-de-count', totalElId: 'wallets-page-de-total', secCountId: 'wallets-section-de-count', secTotalId: 'wallets-section-de-total' }
        ];

        regions.forEach(r => {
            const isActive = activeCountries.includes(r.code);
            const kpiEl = document.getElementById(r.kpiId);
            const groupEl = document.getElementById(r.groupId);
            const gridEl = document.getElementById(r.gridId);

            if (!isActive) {
                if (kpiEl) kpiEl.style.display = 'none';
                if (groupEl) groupEl.style.display = 'none';
                return;
            }

            if (kpiEl) kpiEl.style.display = 'flex';
            if (groupEl) groupEl.style.display = 'block';

            const regionWallets = allWallets
                .filter(w => w.region === r.code)
                .sort((a, b) => this.getWalletSortRank(a) - this.getWalletSortRank(b));

            let total = 0;
            let cardsHtml = '';
            regionWallets.forEach(w => {
                cardsHtml += renderCard(w);
                total += (w.balance || 0);
            });

            if (gridEl) {
                gridEl.innerHTML = cardsHtml || `
                    <div class="wallets-empty-state" style="grid-column: 1/-1; padding: 36px 16px; text-align: center;">
                        <p class="text-muted text-sm mb-2">No ${r.name} accounts created yet.</p>
                        <button class="btn btn-secondary btn-sm" onclick="app.openAddWalletModal('${r.code}')">
                            <i data-lucide="plus" style="width:14px;height:14px;margin-right:4px;"></i>Add ${r.name} Account
                        </button>
                    </div>
                `;

                if (!gridEl._hasDelegatedWalletClick) {
                    gridEl._hasDelegatedWalletClick = true;
                    gridEl.addEventListener('click', (e) => {
                        const editBtn = e.target.closest('[data-edit-wallet-id]');
                        if (editBtn) {
                            e.stopPropagation();
                            const id = editBtn.getAttribute('data-edit-wallet-id');
                            if (id) this.openEditWalletModal(id);
                            return;
                        }
                        const card = e.target.closest('[data-wallet-id]');
                        if (card) {
                            const id = card.getAttribute('data-wallet-id');
                            if (id) this.openWalletFocus(id);
                        }
                    });
                }
            }

            const countStr = `${regionWallets.length} ${regionWallets.length === 1 ? 'account' : 'accounts'}`;
            const totalStr = this.formatMoney(total, r.curr);

            const countEl = document.getElementById(r.countElId);
            if (countEl) countEl.innerText = countStr;

            const totalEl = document.getElementById(r.totalElId);
            if (totalEl) totalEl.innerText = totalStr;

            const secCountEl = document.getElementById(r.secCountId);
            if (secCountEl) secCountEl.innerText = countStr;

            const secTotalEl = document.getElementById(r.secTotalId);
            if (secTotalEl) secTotalEl.innerText = totalStr;
        });

        // Remittance visibility: only displayed if active accounts span > 1 distinct currency
        const activeCurrencies = new Set();
        allWallets.forEach(w => {
            if (activeCountries.includes(w.region)) {
                const c = w.currency || (typeof CountryConfig !== 'undefined' && CountryConfig.get(w.region)?.currency);
                if (c) activeCurrencies.add(c);
            }
        });
        const hasCrossBorderCurrencies = activeCurrencies.size > 1;

        const remitBtn = document.getElementById('wallets-remittance-btn');
        if (remitBtn) remitBtn.style.display = hasCrossBorderCurrencies ? '' : 'none';

        const fabRemit = document.getElementById('fab-action-remittance');
        if (fabRemit) fabRemit.style.display = hasCrossBorderCurrencies ? '' : 'none';

        const modalRemit = document.getElementById('btn-select-tx-remittance');
        if (modalRemit) modalRemit.style.display = hasCrossBorderCurrencies ? '' : 'none';

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    getThemeForWallet(w) {
        if (!w) return WALLET_THEMES[0];
        if (w.theme) {
            const found = WALLET_THEMES.find(t => t.id === w.theme);
            if (found) return found;
        }
        const nameLower = (w.id || '').toLowerCase();
        const typeLower = (w.type || '').toLowerCase();

        for (const t of WALLET_THEMES) {
            if (t.match && t.match.some(k => nameLower.includes(k))) {
                return t;
            }
        }
        if (typeLower === 'cash') return WALLET_THEMES.find(t => t.id === 'amber-gold') || WALLET_THEMES[2];
        if (typeLower === 'card') return WALLET_THEMES.find(t => t.id === 'rose-gold') || WALLET_THEMES[11];
        if (w.region === 'IN') return WALLET_THEMES.find(t => t.id === 'burgundy-axis') || WALLET_THEMES[3];
        return WALLET_THEMES[0];
    }

    populateThemePicker(containerId, activeThemeId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const isEdit = containerId.startsWith('edit');
        const inputId = isEdit ? 'edit-wallet-theme-val' : 'add-wallet-theme-val';

        // 6 Curated Themes matching user's primary payment methods:
        // Axis Bank, Bank of Baroda, Cash, PayPay, Yucho / Salary, Axis Credit Card
        const primaryThemeIds = [
            'burgundy-axis',     // Axis Bank
            'baroda-orange',     // Bank of Baroda
            'amber-gold',        // Cash
            'crimson-paypay',    // PayPay
            'emerald-salary',    // Yucho / Salary
            'rose-gold'          // Axis Credit Card
        ];

        // All 14 themes preserved, ordered with frequently used accounts first
        const sortedThemes = [
            ...WALLET_THEMES.filter(t => primaryThemeIds.includes(t.id)),
            ...WALLET_THEMES.filter(t => !primaryThemeIds.includes(t.id))
        ];

        let html = '';
        sortedThemes.forEach(t => {
            const isSelected = t.id === activeThemeId;
            const isPrimary = primaryThemeIds.includes(t.id);
            const activeCls = isSelected ? ' active selected' : '';
            const frequentTag = isPrimary ? '<span class="theme-tag-frequent theme-tile-frequent">Frequent</span>' : '';

            html += `
                <div class="theme-picker-tile theme-tile${activeCls}" data-theme-id="${t.id}" onclick="app.selectThemeSwatch('${inputId}', '${t.id}', '${containerId}')" title="${t.name}" role="radio" aria-checked="${isSelected}">
                    <div class="theme-tile-preview ${t.cls}">
                        <div class="theme-mini-chip"></div>
                        <div class="theme-tile-sheen"></div>
                        <div class="theme-tile-check">
                            <i data-lucide="check" style="width: 11px; height: 11px;"></i>
                        </div>
                        ${frequentTag}
                    </div>
                    <div class="theme-tile-name">${t.name}</div>
                </div>
            `;
        });
        container.innerHTML = html;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
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

    selectThemeSwatch(inputId, themeId, containerId) {
        const input = document.getElementById(inputId);
        if (input) input.value = themeId;
        const container = document.getElementById(containerId);
        if (container) {
            container.querySelectorAll('.theme-picker-tile, .theme-tile').forEach(s => {
                const matches = s.getAttribute('data-theme-id') === themeId;
                if (matches) {
                    s.classList.add('active', 'selected');
                    s.setAttribute('aria-checked', 'true');
                } else {
                    s.classList.remove('active', 'selected');
                    s.setAttribute('aria-checked', 'false');
                }
            });
        }
    }

    openCountryExpansion(region) {
        const countryObj = (typeof CountryConfig !== 'undefined' && CountryConfig.get(region))
            || { name: region, currency: region === 'JP' ? '¥' : region === 'DE' ? '€' : '₹', currencyCode: region === 'JP' ? 'JPY' : region === 'DE' ? 'EUR' : 'INR' };
        const currency = countryObj.currency;
        const countryName = countryObj.name;
        const cardThemeCls = region === 'JP' ? 'country-card-jp' : region === 'DE' ? 'country-card-de' : 'country-card-in';
        const currencyCode = countryObj.currencyCode;
        const flagSvg = this.getCountryFlagSvg(region, 22, 16.5);

        this.focusCurrentRegion = region;
        this.focusHistory = [];

        let total = 0;
        const regionWallets = [];
        Object.values(storage.state?.wallets || {}).forEach(w => {
            if (w.region === region) {
                regionWallets.push(w);
                total += (w.balance || 0);
            }
        });

        const overlay = document.getElementById('focus-overlay');
        const backBtn = document.getElementById('focus-back-btn');
        const divider = document.getElementById('focus-header-divider');
        const typeBadge = document.getElementById('focus-type-badge');
        const modalTitle = document.getElementById('focus-modal-title');
        const primaryPanel = document.getElementById('focus-primary-panel');
        const secondaryPanel = document.getElementById('focus-secondary-panel');

        if (!overlay || !primaryPanel || !secondaryPanel) return;

        if (backBtn) backBtn.style.display = 'none';
        if (divider) divider.style.display = 'none';
        if (typeBadge) {
            typeBadge.style.display = 'inline-flex';
            typeBadge.innerText = 'Country Portfolio';
        }
        if (modalTitle) modalTitle.innerText = `${countryName} Overview`;

        primaryPanel.innerHTML = `
            <div class="country-card ${cardThemeCls} expanded focus-country-card">
                <div class="wallet-card-overlay-sheen"></div>
                <div class="country-card-header">
                    <div class="country-badge">
                        ${flagSvg}
                        <span class="country-name">${countryName}</span>
                        <span class="currency-code">${currencyCode}</span>
                    </div>
                    <span class="wallet-count-pill">${regionWallets.length} ${regionWallets.length === 1 ? 'Account' : 'Accounts'}</span>
                </div>
                <div class="country-balance-body">
                    <span class="balance-label">Total Portfolio Balance</span>
                    <div class="country-total-amount financial-amount privacy-blur">
                        ${this.formatMoney(total, currency)}
                    </div>
                </div>
            </div>
            <div class="focus-country-actions">
                <button class="btn btn-primary w-100" onclick="app.openUnifiedTransactionSelector({ region: '${region}' })">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                    <span>Add Transaction</span>
                </button>
            </div>
        `;

        let walletsListHtml = `
            <div class="focus-activity-header">
                <h4 class="focus-activity-title">Associated Accounts (${regionWallets.length})</h4>
                <span class="text-muted text-xs">Click any wallet to focus</span>
            </div>
            <div class="focus-country-wallets-list">
        `;

        if (regionWallets.length === 0) {
            walletsListHtml += `<p class="text-muted text-sm" style="text-align: center; padding: 32px 0;">No accounts found for ${this.escapeHtml(countryName)}.</p>`;
        } else {
            regionWallets.forEach(w => {
                const theme = this.getThemeForWallet(w);
                const icon = w.type === 'bank' ? 'landmark' : w.type === 'card' ? 'credit-card' : w.type === 'cash' ? 'banknote' : 'smartphone';
                const escId = this.escapeHtml(w.id);
                walletsListHtml += `
                    <div class="wallet-item-compact ${theme.cls} focus-associated-wallet-row" data-focus-wallet-id="${escId}">
                        <div class="focus-associated-wallet-left">
                            <div class="focus-associated-wallet-icon">
                                <i data-lucide="${icon}"></i>
                            </div>
                            <div class="focus-associated-wallet-info">
                                <div class="focus-associated-wallet-name" title="${escId}">${escId}</div>
                                <div class="focus-associated-wallet-meta">${this.escapeHtml(w.type || 'Account')} • ${this.escapeHtml(w.currency)}</div>
                            </div>
                        </div>
                        <div class="focus-associated-wallet-right">
                            <div class="financial-amount privacy-blur focus-associated-wallet-amount">
                                ${this.formatMoney(w.balance, w.currency)}
                            </div>
                            <span class="focus-associated-wallet-arrow">View details →</span>
                        </div>
                    </div>
                `;
            });
        }
        walletsListHtml += `</div>`;
        secondaryPanel.innerHTML = walletsListHtml;
        secondaryPanel.onclick = (e) => {
            const row = e.target.closest('[data-focus-wallet-id]');
            if (row) {
                const wId = row.getAttribute('data-focus-wallet-id');
                if (wId) this.openWalletFocus(wId, row, true);
            }
        };

        overlay.style.display = 'flex';
        void overlay.offsetWidth;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    openWalletFocus(walletId, sourceEl = null, fromCountry = false) {
        const w = storage.state?.wallets ? storage.state.wallets[walletId] : null;
        if (!w) return;

        if (fromCountry) {
            this.focusHistory = [{ type: 'country', region: this.focusCurrentRegion || w.region }];
        }

        const theme = this.getThemeForWallet(w);
        const chipSvg = this.getCardChipSvg();
        const contactlessSvg = this.getContactlessSvg();
        const isSecondary = this.isSecondaryWallet(w);
        const secondaryCls = isSecondary ? ' wallet-card-secondary' : '';
        const secondaryBadge = isSecondary ? '<span class="wallet-badge-secondary">Secondary</span>' : '';

        const overlay = document.getElementById('focus-overlay');
        const backBtn = document.getElementById('focus-back-btn');
        const backLabel = document.getElementById('focus-back-label');
        const divider = document.getElementById('focus-header-divider');
        const typeBadge = document.getElementById('focus-type-badge');
        const modalTitle = document.getElementById('focus-modal-title');
        const primaryPanel = document.getElementById('focus-primary-panel');
        const secondaryPanel = document.getElementById('focus-secondary-panel');

        if (!overlay || !primaryPanel || !secondaryPanel) return;

        if (this.focusHistory && this.focusHistory.length > 0) {
            if (backBtn) backBtn.style.display = 'inline-flex';
            const prev = this.focusHistory[this.focusHistory.length - 1];
            const countryName = prev.region === 'JP' ? 'Japan' : (prev.region === 'DE' ? 'Germany' : 'India');
            if (backLabel) backLabel.innerText = `${countryName} Overview`;
            if (divider) divider.style.display = 'inline';
            if (typeBadge) typeBadge.style.display = 'none';
        } else {
            if (backBtn) backBtn.style.display = 'none';
            if (divider) divider.style.display = 'none';
            if (typeBadge) {
                typeBadge.style.display = 'inline-flex';
                typeBadge.innerText = 'Account Focus';
            }
        }

        modalTitle.innerText = `${w.id}`;
        const escId = this.escapeHtml(w.id);

        primaryPanel.innerHTML = `
            <div class="wallet-card ${theme.cls}${secondaryCls} focus-wallet-card">
                <div class="wallet-card-overlay-sheen"></div>
                <div class="wallet-card-header">
                    <div class="wallet-card-chip-group">
                        ${chipSvg}
                        ${contactlessSvg}
                    </div>
                    <div class="wallet-card-top-right">
                        ${secondaryBadge}
                        <button class="wallet-card-menu-btn" data-focus-action="edit" title="Edit Account" aria-label="Edit Account">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                    </div>
                </div>
                <div class="wallet-balance-wrap">
                    <span class="wallet-balance-label">Current Balance</span>
                    <div class="wallet-balance-val financial-amount privacy-blur">
                        ${this.formatMoney(w.balance, w.currency)}
                    </div>
                </div>
                <div class="wallet-card-footer">
                    <div class="wallet-name" title="${escId}">${escId}</div>
                    <div class="wallet-type-tag">${this.escapeHtml(w.type || 'Account')} • ${this.escapeHtml(w.currency)}</div>
                </div>
            </div>
            <div class="focus-wallet-actions">
                <button class="btn btn-primary w-100" data-focus-action="add-tx">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                    <span>Add Transaction</span>
                </button>
            </div>
        `;

        primaryPanel.onclick = (e) => {
            const editBtn = e.target.closest('[data-focus-action="edit"]');
            if (editBtn) {
                this.closeFocusOverlay();
                this.openEditWalletModal(w.id);
                return;
            }
            const addBtn = e.target.closest('[data-focus-action="add-tx"]');
            if (addBtn) {
                this.openUnifiedTransactionSelector({ walletId: w.id, region: w.region });
                return;
            }
        };

        const txs = walletManager.getTransactions({ walletId: w.id });
        const recentTxs = txs.slice(0, 15);

        let txHtml = `
            <div class="focus-activity-header">
                <h4 class="focus-activity-title">Account Activity</h4>
                <span class="text-muted text-xs">${txs.length} ${txs.length === 1 ? 'transaction' : 'transactions'}</span>
            </div>
            <div class="focus-activity-list">
        `;

        if (recentTxs.length === 0) {
            txHtml += `
                <div class="focus-tx-empty-state">
                    <i data-lucide="receipt"></i>
                    <div class="focus-empty-title">No transactions found</div>
                    <div class="focus-empty-subtitle">New expenses, income or transfers logged to ${escId} will appear here.</div>
                </div>
            `;
        } else {
            recentTxs.forEach(tx => {
                const effectiveType = tx.type || (tx.isIncome ? 'income' : (tx.sourceId && tx.destId ? 'transfer' : 'expense'));
                let icon = 'arrow-up-right';
                let colorCls = 'text-rose';
                let sign = '-';
                const catName = this.getTransactionCategory(tx);
                let label = tx.note || catName;

                if (effectiveType === 'income') {
                    icon = 'arrow-down-left';
                    colorCls = 'text-emerald';
                    sign = '+';
                    label = tx.note || catName;
                } else if (effectiveType === 'transfer') {
                    icon = 'repeat';
                    colorCls = 'text-muted';
                    sign = (tx.destId === w.id) ? '+' : '-';
                    label = `Transfer: ${this.getWalletName(tx.sourceId)} → ${this.getWalletName(tx.destId)}`;
                } else if (effectiveType === 'remittance') {
                    icon = 'globe';
                    colorCls = (tx.destId === w.id) ? 'text-emerald' : 'text-muted';
                    sign = (tx.destId === w.id) ? '+' : '-';
                    const { srcCur, dstCur } = this.getRemittanceCurrencies(tx);
                    label = `Remittance: ${this.getWalletName(tx.sourceId)} (${srcCur}) → ${this.getWalletName(tx.destId)} (${dstCur})`;
                }

                const formattedDate = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                const metaParts = [formattedDate, catName, (tx.note && tx.note !== label ? tx.note : '')].filter(Boolean);
                const metaLine = metaParts.join(' • ');
                txHtml += `
                    <div class="tx-row focus-activity-row" data-transaction-id="${this.escapeHtml(tx.id)}" onclick="app.editTransaction(this.dataset.transactionId)">
                        <div class="focus-tx-left">
                            <div class="focus-tx-icon-wrap">
                                <i data-lucide="${icon}"></i>
                            </div>
                            <div class="focus-tx-details">
                                <div class="focus-tx-label" title="${this.escapeHtml(label)}">${this.escapeHtml(label)}</div>
                                <div class="focus-tx-meta" title="${this.escapeHtml(metaLine)}">${this.escapeHtml(metaLine)}</div>
                            </div>
                        </div>
                        <div class="financial-amount privacy-blur focus-tx-amount ${colorCls === 'text-emerald' ? 'text-emerald' : colorCls === 'text-rose' ? 'text-rose' : 'text-secondary'}">
                            ${this.formatMoney(tx.destId === w.id ? (tx.destAmount !== undefined ? tx.destAmount : tx.amount) : (tx.sourceAmount !== undefined ? tx.sourceAmount : tx.amount), w.currency, { prefix: sign })}
                        </div>
                    </div>
                `;
            });
        }

        txHtml += `</div>`;
        secondaryPanel.innerHTML = txHtml;

        overlay.style.display = 'flex';
        void overlay.offsetWidth;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    navigateFocusBack() {
        if (this.focusHistory && this.focusHistory.length > 0) {
            const prev = this.focusHistory.pop();
            if (prev.type === 'country') {
                this.openCountryExpansion(prev.region);
                return;
            }
        }
        if (this.focusCurrentRegion) {
            this.openCountryExpansion(this.focusCurrentRegion);
        } else {
            this.closeFocusOverlay();
        }
    }

    closeFocusOverlay() {
        const overlay = document.getElementById('focus-overlay');
        if (!overlay) return;

        overlay.classList.remove('active');
        setTimeout(() => {
            if (!overlay.classList.contains('active')) {
                overlay.style.display = 'none';
                const backBtn = document.getElementById('focus-back-btn');
                if (backBtn) backBtn.style.display = 'none';
                const divider = document.getElementById('focus-header-divider');
                if (divider) divider.style.display = 'none';
                this.focusHistory = [];
                this.focusCurrentRegion = null;
            }
        }, 200);

        document.body.style.overflow = '';
    }

    openAddTxForWallet(walletId) {
        this.closeFocusOverlay();
        this.openTransactionModal('expense', { walletId });
    }

    openTransferForWallet(walletId) {
        this.closeFocusOverlay();
        this.openTransactionModal('transfer', { walletId });
    }

    openAddTxForWallet(walletId) {
        this.closeFocusOverlay();
        const w = storage.state.wallets[walletId];
        this.openTransactionModal('expense');
        const select = document.getElementById('tx-wallet');
        if (select && w) {
            select.value = walletId;
            this.updateExpenseCategories();
        }
    }

    openTransferForWallet(walletId) {
        this.closeFocusOverlay();
        const w = storage.state.wallets[walletId];
        this.openTransactionModal('transfer');
        const select = document.getElementById('transfer-source-wallet');
        if (select && w) {
            select.value = walletId;
            this.onTransferSourceChange();
        }
    }

    openAddWalletModal(defaultRegion = null) {
        const activeCountries = storage.getActiveCountries();
        const regSelect = document.getElementById('add-wallet-region');
        if (regSelect) {
            regSelect.innerHTML = activeCountries.map(c => {
                const cfg = (typeof CountryConfig !== 'undefined' && CountryConfig.get(c))
                    || { name: c, currency: c === 'JP' ? '¥' : c === 'DE' ? '€' : '₹', currencyCode: c === 'JP' ? 'JPY' : c === 'DE' ? 'EUR' : 'INR' };
                return `<option value="${c}">${cfg.name} (${cfg.currency} ${cfg.currencyCode})</option>`;
            }).join('');
            const targetReg = (defaultRegion && activeCountries.includes(defaultRegion))
                ? defaultRegion
                : (activeCountries.includes(storage.getPrimaryCountry()) ? storage.getPrimaryCountry() : activeCountries[0]);
            regSelect.value = targetReg || 'JP';
        }

        document.getElementById('add-wallet-name').value = '';
        document.getElementById('add-wallet-balance').value = '0';
        document.getElementById('add-wallet-type').value = 'bank';

        const curReg = regSelect ? regSelect.value : 'JP';
        const defaultTheme = curReg === 'IN' ? 'burgundy-axis' : curReg === 'DE' ? 'frankfurt-slate' : 'emerald-salary';
        document.getElementById('add-wallet-theme-val').value = defaultTheme;
        this.populateThemePicker('add-wallet-theme-picker', defaultTheme);
        document.getElementById('add-wallet-modal').classList.add('active');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    onAddWalletRegionChange() {
        const reg = document.getElementById('add-wallet-region').value;
        const defaultTheme = reg === 'IN' ? 'burgundy-axis' : reg === 'DE' ? 'frankfurt-slate' : 'emerald-salary';
        document.getElementById('add-wallet-theme-val').value = defaultTheme;
        this.populateThemePicker('add-wallet-theme-picker', defaultTheme);
    }

    async saveAddWallet() {
        const name = document.getElementById('add-wallet-name').value.trim();
        const region = document.getElementById('add-wallet-region').value;
        const type = document.getElementById('add-wallet-type').value;
        const balInput = document.getElementById('add-wallet-balance').value;
        const theme = document.getElementById('add-wallet-theme-val').value;

        if (!name) {
            alert('Please enter a wallet name.');
            return;
        }

        if (storage.state.wallets && storage.state.wallets[name]) {
            alert('A wallet with this name already exists.');
            return;
        }

        let balance = Number(balInput);
        if (balInput !== '' && (isNaN(balance) || !isFinite(balance) || Math.abs(balance) > 1e12)) {
            alert('Please enter a valid numeric balance.');
            return;
        }
        if (isNaN(balance)) balance = 0;
        if (region === 'JP') balance = Math.round(balance);
        else balance = Math.round(balance * 100) / 100;

        const currency = (typeof CountryConfig !== 'undefined' && CountryConfig.get(region)?.currency)
            || (region === 'JP' ? '¥' : region === 'DE' ? '€' : '₹');
        const chosenTheme = WALLET_THEMES.find(t => t.id === theme) || WALLET_THEMES[0];

        const res = await storage.runExclusive(async (state) => {
            if (!state.wallets) state.wallets = {};
            if (state.wallets[name]) {
                return { success: false, error: 'A wallet with this name already exists.' };
            }
            state.wallets[name] = {
                id: name,
                type: type,
                region: region,
                balance: balance,
                currency: currency,
                color: chosenTheme.color,
                theme: chosenTheme.id
            };
            return true;
        });

        if (res && res.success !== false) {
            this.renderAll();
            this.closeModal('add-wallet-modal');
        } else {
            alert(res?.error || 'Failed to add wallet.');
        }
    }

    openEditWalletModal(walletId) {
        const w = storage.state.wallets[walletId];
        if (!w) return;

        this._editWalletBaseRev = storage.state?.revision;

        // Synchronously set all form fields before revealing modal to prevent data flash
        document.getElementById('edit-wallet-id').value = w.id;
        document.getElementById('edit-wallet-name').value = w.id;
        document.getElementById('edit-wallet-type').value = w.type || 'bank';
        document.getElementById('edit-wallet-balance').value = w.balance !== undefined ? w.balance : 0;

        const theme = this.getThemeForWallet(w);
        document.getElementById('edit-wallet-theme-val').value = theme.id;
        this.populateThemePicker('edit-wallet-theme-picker', theme.id);

        const modal = document.getElementById('edit-wallet-modal');
        if (modal) {
            modal.classList.add('active');
        }
        lucide.createIcons();
    }

    async saveEditWallet() {
        const id = document.getElementById('edit-wallet-id').value;
        const newName = (document.getElementById('edit-wallet-name')?.value || '').trim();
        const type = document.getElementById('edit-wallet-type').value;
        const balStr = document.getElementById('edit-wallet-balance').value;
        const themeId = document.getElementById('edit-wallet-theme-val').value;

        if (!id || !storage.state.wallets || !storage.state.wallets[id]) return;

        if (!newName) {
            alert('Please enter a wallet name.');
            return;
        }

        const isRenaming = newName !== id;
        if (isRenaming && storage.state.wallets[newName]) {
            alert(`A wallet named "${newName}" already exists. Please choose a different name.`);
            return;
        }

        let balance = Number(balStr);
        if (balStr !== '' && (isNaN(balance) || !isFinite(balance) || Math.abs(balance) > 1e12)) {
            alert('Please enter a valid numeric balance.');
            return;
        }

        const wRef = storage.state.wallets[id];
        const cur = (wRef?.currency || '').toUpperCase();
        if (balStr !== '' && !isNaN(balance)) {
            if (cur === '¥' || cur === 'JPY') balance = Math.round(balance);
            else balance = Math.round(balance * 100) / 100;
        }

        const chosenTheme = WALLET_THEMES.find(t => t.id === themeId);

        // Confirmation prompt if renaming a wallet with existing transactions
        if (isRenaming) {
            let txCount = 0;
            if (Array.isArray(storage.state.transactions)) {
                txCount += storage.state.transactions.filter(t => t && (t.walletId === id || t.sourceId === id || t.destId === id)).length;
            }
            if (storage.state.closedMonths) {
                for (const m of Object.values(storage.state.closedMonths)) {
                    if (Array.isArray(m?.transactions)) {
                        txCount += m.transactions.filter(t => t && (t.walletId === id || t.sourceId === id || t.destId === id)).length;
                    }
                }
            }
            if (Array.isArray(storage.state.history)) {
                for (const h of storage.state.history) {
                    if (Array.isArray(h?.transactions)) {
                        txCount += h.transactions.filter(t => t && (t.walletId === id || t.sourceId === id || t.destId === id)).length;
                    }
                }
            }

            if (txCount > 0) {
                const proceed = confirm(`Renaming wallet "${id}" to "${newName}" will update ${txCount} recorded transaction${txCount === 1 ? '' : 's'} across your ledger. Do you want to proceed?`);
                if (!proceed) {
                    return;
                }
            }
        }

        const res = await storage.runExclusive(async (state) => {
            if (!state.wallets || !state.wallets[id]) {
                return { success: false, error: 'Wallet not found.' };
            }

            if (isRenaming) {
                if (state.wallets[newName]) {
                    return { success: false, error: `A wallet named "${newName}" already exists.` };
                }

                // Move wallet record to new key and update id
                const oldWallet = state.wallets[id];
                delete state.wallets[id];
                state.wallets[newName] = {
                    ...oldWallet,
                    id: newName,
                    name: newName
                };

                // Cascade rename across all historical transactions in continuous ledger
                if (Array.isArray(state.transactions)) {
                    state.transactions.forEach(tx => {
                        if (!tx) return;
                        if (tx.walletId === id) tx.walletId = newName;
                        if (tx.sourceId === id) tx.sourceId = newName;
                        if (tx.destId === id) tx.destId = newName;
                    });
                }

                // Cascade rename across closed months archives
                if (state.closedMonths) {
                    for (const m of Object.values(state.closedMonths)) {
                        if (Array.isArray(m?.transactions)) {
                            m.transactions.forEach(tx => {
                                if (!tx) return;
                                if (tx.walletId === id) tx.walletId = newName;
                                if (tx.sourceId === id) tx.sourceId = newName;
                                if (tx.destId === id) tx.destId = newName;
                            });
                        }
                    }
                }

                // Cascade rename across history archives
                if (Array.isArray(state.history)) {
                    for (const h of state.history) {
                        if (Array.isArray(h?.transactions)) {
                            h.transactions.forEach(tx => {
                                if (!tx) return;
                                if (tx.walletId === id) tx.walletId = newName;
                                if (tx.sourceId === id) tx.sourceId = newName;
                                if (tx.destId === id) tx.destId = newName;
                            });
                        }
                    }
                }
            }

            const targetWallet = state.wallets[isRenaming ? newName : id];
            if (!targetWallet) {
                return { success: false, error: 'Target wallet could not be found.' };
            }

            if (!isNaN(balance)) {
                targetWallet.balance = balance;
            }
            targetWallet.type = type;
            targetWallet.theme = themeId;
            if (chosenTheme) {
                targetWallet.color = chosenTheme.color;
            }
            return true;
        }, { expectedRevision: this._editWalletBaseRev });

        if (res && res.conflict) {
            alert('Financial records were modified in another window while editing. Please reopen the wallet to review current details.');
            return;
        }

        if (res && res.success !== false) {
            if (isRenaming && this.ledgerFilters && this.ledgerFilters.walletId === id) {
                this.ledgerFilters.walletId = newName;
            }
            this.renderAll();
            // Modern Web Guidance: Only render wallets view when it is the active screen
            if (this.currentView === 'wallets-view') {
                this.renderWalletsPage();
            }
            this.closeModal('edit-wallet-modal');

            const overlay = document.getElementById('focus-overlay');
            if (overlay && (overlay.classList.contains('active') || overlay.style.display !== 'none')) {
                const title = document.getElementById('focus-modal-title');
                if (title && (title.innerText === id || title.innerText === newName)) {
                    this.openWalletFocus(newName);
                }
            }
        } else {
            alert(res?.error || 'Failed to update wallet.');
        }
    }

    async deleteWalletFromModal() {
        const id = document.getElementById('edit-wallet-id').value;
        if (!id || !storage.state.wallets || !storage.state.wallets[id]) return;

        if (this.isWalletReferenced(storage.state, id)) {
            alert(`Cannot delete wallet "${id}" because it is referenced by historical transactions, transfers, or remittances. Deleting it would leave orphaned references and break financial accounting. You may set its balance to 0 instead.`);
            return;
        }

        if (!confirm(`Are you sure you want to delete the wallet "${id}"?`)) {
            return;
        }

        const res = await storage.runExclusive(async (state) => {
            if (this.isWalletReferenced(state, id)) {
                return { success: false, error: `Cannot delete wallet "${id}" because it is referenced by historical transactions.` };
            }
            if (state.wallets && state.wallets[id]) {
                delete state.wallets[id];
                return true;
            }
            return false;
        });

        if (res && res.success !== false) {
            if (this.ledgerFilters && this.ledgerFilters.walletId === id) {
                this.ledgerFilters.walletId = 'all';
            }
            this.renderAll();
            // Modern Web Guidance: Only render wallets view when it is the active screen
            if (this.currentView === 'wallets-view') {
                this.renderWalletsPage();
            }
            this.closeModal('edit-wallet-modal');
            this.closeFocusOverlay();
        } else {
            alert(res?.error || 'Failed to delete wallet.');
        }
    }

    getTransactionHtml(tx, editable = false, showDateInMeta = true, ignorePrivacy = false) {
        const effectiveType = tx.type || (tx.isIncome ? 'income' : (tx.sourceId && tx.destId ? 'transfer' : 'expense'));
        let icon = 'arrow-up-right';
        let colorCls = 'debit';
        const catName = this.getTransactionCategory(tx);
        let title = tx.note || catName;
        let amt = '';

        if (effectiveType === 'income') {
            icon = 'arrow-down-left';
            colorCls = 'credit';
            title = tx.note || catName;
            amt = this.formatMoney(tx.amount, tx.currency, { prefix: '+', ignorePrivacy });
        } else if (effectiveType === 'transfer') {
            icon = 'repeat';
            colorCls = 'text-muted';
            title = `Transfer: ${this.getWalletName(tx.sourceId)} \u2192 ${this.getWalletName(tx.destId)}`;
            amt = this.formatMoney(tx.amount, tx.currency, { ignorePrivacy });
        } else if (effectiveType === 'remittance') {
            icon = 'globe';
            colorCls = 'text-muted';
            title = tx.note || 'Remittance';
            amt = this.formatRemittanceAmount(tx, { ignorePrivacy });
        } else {
            // expense
            title = tx.note || catName;
            const currency = tx.currency || (tx.region === 'JP' ? '¥' : (tx.region === 'DE' ? '€' : '₹'));
            amt = this.formatMoney(tx.amount, currency, { prefix: '-', ignorePrivacy });
        }

        const date = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

        const walletName = this.getWalletName(tx.walletId || tx.sourceId);
        const metaParts = [];
        if (showDateInMeta) metaParts.push(date);
        if (walletName) metaParts.push(walletName);
        if (catName && catName !== title) metaParts.push(catName);
        if (tx.note && tx.note !== title) metaParts.push(tx.note);
        const metaString = metaParts.join(' \u2022 ');

        const clickAttr = editable ? `data-transaction-id="${this.escapeHtml(tx.id)}" onclick="app.editTransaction(this.dataset.transactionId)" style="cursor:pointer;"` : '';

        return `
            <div class="tx-item" ${clickAttr}>
                <div class="tx-left">
                    <div class="tx-icon"><i data-lucide="${icon}"></i></div>
                    <div class="tx-details">
                        <span class="tx-title">${this.escapeHtml(title)}</span>
                        <span class="tx-meta">${this.escapeHtml(metaString)}</span>
                    </div>
                </div>
                <div class="tx-right">
                    <span class="tx-amount ${colorCls}">${this.escapeHtml(amt)}</span>
                </div>
            </div>
        `;
    }

    renderHistory() {
        const container = document.getElementById('history-list');
        if (storage.state.history.length === 0) {
            container.innerHTML = '<div class="card"><p class="text-muted text-center">No archived months yet.</p></div>';
            return;
        }

        let html = '';
        storage.state.history.forEach((h, index) => {
            const totals = { JP: {}, IN: {} };
            h.transactions.forEach(tx => {
                if (tx.type === 'expense') {
                    let region = tx.region;
                    if (!region) {
                        region = storage.state.categories.JP.some(c => c.id === tx.categoryId) ? 'JP' : 'IN';
                    }
                    if (totals[region]) {
                        totals[region][tx.categoryId] = (totals[region][tx.categoryId] || 0) + tx.amount;
                    }
                }
            });

            let jpBalance = 0;
            let inBalance = 0;
            if (h.walletsSnapshot) {
                Object.values(h.walletsSnapshot).forEach(w => {
                    if (w.region === 'JP') jpBalance += w.balance;
                    if (w.region === 'IN') inBalance += w.balance;
                });
            }

            let balanceHtml = '';
            if (h.walletsSnapshot) {
                balanceHtml = `
                    <div id="history-bal-${index}" style="display:flex; gap:16px; margin-top:8px; font-size:0.8rem;">
                        <span style="color:var(--text-main); font-weight:500;"><span class="text-muted">JP:</span> ${this.formatMoney(jpBalance, '¥')}</span>
                        <span style="color:var(--text-main); font-weight:500;"><span class="text-muted">IN:</span> ${this.formatMoney(inBalance, '₹', { locale: 'en-IN' })}</span>
                    </div>
                `;
            }

            let catsHtml = '';
            ['JP', 'IN'].forEach(region => {
                const currency = region === 'JP' ? '¥' : '₹';
                let regionSpent = 0;
                let regionBudget = 0;
                let catCardsHtml = '';

                // Build per-category neon-row cards — same design as Home tab's renderCategories()
                storage.state.categories[region].forEach(catDef => {
                    const spent = (totals[region] && totals[region][catDef.id]) || 0;
                    if (spent === 0) return; // skip categories with no spend this month

                    const activeBudget = walletManager.getEffectiveBudget(catDef.id, region, h.monthKey);
                    const isOver = activeBudget > 0 && spent > activeBudget;
                    regionSpent += spent;

                    let catProgressHtml = '';
                    if (activeBudget > 0) {
                        regionBudget += activeBudget;
                        const pct = Math.min((spent / activeBudget) * 100, 100);
                        let barClass = 'neon-safe';
                        if (pct > 90) barClass = 'neon-danger';
                        else if (pct > 75) barClass = 'neon-warn';

                        catProgressHtml = `
                            <div class="neon-bar-bg">
                                <div class="neon-bar-fill ${barClass}" style="width: ${pct}%"></div>
                            </div>
                            <div class="neon-amount-sub" style="margin-top: 4px; display:flex; justify-content:space-between;">
                                <span>${this.formatMoney(spent, currency)}</span>
                                <span>${this.formatMoney(activeBudget, currency)}</span>
                            </div>
                        `;
                    } else {
                        catProgressHtml = `<div class="neon-amount-sub" style="margin-top: 4px;">Spent: ${this.formatMoney(spent, currency)}</div>`;
                    }

                    catCardsHtml += `
                        <div class="neon-row ${isOver ? 'is-overbudget' : ''}" style="padding: 12px;">
                            <div class="neon-header" style="margin-bottom: 8px;">
                                <span class="neon-title"><i data-lucide="${this.categoryIcon(catDef.icon)}"></i> ${this.escapeHtml(catDef.name)}</span>
                            </div>
                            ${catProgressHtml}
                        </div>
                    `;
                });

                if (regionSpent === 0) return; // skip region entirely if nothing spent

                // Overall budget summary row — mirrors Home tab's budget-overview-card
                let overallHtml = '';
                if (regionBudget > 0) {
                    const pct = Math.min((regionSpent / regionBudget) * 100, 100);
                    const barClass = pct > 90 ? 'neon-danger' : pct > 75 ? 'neon-warn' : 'neon-safe';
                    const statusText = pct > 90
                        ? `<span style="color:#ef4444; font-weight:600;">Over Budget!</span>`
                        : pct > 75
                            ? `<span style="color:#f59e0b; font-weight:600;">Nearing Limit</span>`
                            : `<span style="color:#10b981; font-weight:600;">Under Budget!</span>`;

                    overallHtml = `
                        <div class="neon-row" style="padding: 12px; margin-bottom: 16px;">
                            <div class="neon-header" style="margin-bottom: 8px;">
                                <span class="neon-title" style="font-size:0.85rem;">
                                    <i data-lucide="bar-chart-2" style="width:14px;height:14px;"></i> Overall Budget
                                </span>
                                ${statusText}
                            </div>
                            <div class="neon-bar-bg">
                                <div class="neon-bar-fill ${barClass}" style="width: ${pct}%"></div>
                            </div>
                            <div class="neon-amount-sub" style="margin-top: 6px; display:flex; justify-content:space-between;">
                                <span>Spent: ${this.formatMoney(regionSpent, currency)}</span>
                                <span>Budget: ${this.formatMoney(regionBudget, currency)}</span>
                            </div>
                        </div>
                    `;
                } else {
                    overallHtml = `
                        <div class="neon-row" style="padding:12px; margin-bottom:16px;">
                            <div class="neon-amount-sub">Total Spent: ${this.formatMoney(regionSpent, currency)}</div>
                        </div>
                    `;
                }

                catsHtml += `
                    <div style="margin-top:16px;">
                        <h4 style="color:var(--text-muted); font-size:0.85rem; font-weight: 500; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                            ${this.getCountryFlagSvg(region, 16, 12)}
                            <span>${region === 'JP' ? 'Japan' : 'India'} Analytics</span>
                        </h4>

                        <div style="height: 180px; margin-bottom: 16px; position: relative;">
                            <canvas id="history-donut-${index}-${region}"></canvas>
                        </div>

                        ${overallHtml}

                        ${catCardsHtml ? `
                            <h5 style="color:var(--text-muted); font-size:0.75rem; font-weight: 500; margin: 12px 0 10px;">By Category</h5>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px;">
                                ${catCardsHtml}
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            // Build grouped transactions list for this history snapshot
            let txsHtml = '<div style="margin-top: 24px;"><h4 style="color:var(--text-muted); font-size:0.85rem; font-weight: 500; margin-bottom:12px;">Transactions</h4>';

            if (h.transactions && h.transactions.length > 0) {
                // Group by date (same logic as renderTransactions)
                const groupedTxs = {};
                h.transactions.forEach(tx => {
                    const dStr = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    if (!groupedTxs[dStr]) groupedTxs[dStr] = [];
                    groupedTxs[dStr].push(tx);
                });

                Object.keys(groupedTxs).forEach(dateStr => {
                    txsHtml += `
                        <div style="margin-top: 16px;">
                            <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; padding-left: 4px; border-left: 2px solid var(--accent);">${dateStr}</div>
                    `;
                    groupedTxs[dateStr].forEach(tx => {
                        txsHtml += this.getTransactionHtml(tx, true, false); // editable=true, showDateInMeta=false
                    });
                    txsHtml += `</div>`;
                });
            } else {
                txsHtml += '<p class="text-muted text-sm">No transactions found.</p>';
            }
            txsHtml += '</div>';

            html += `
                <div class="card" style="margin-bottom: 16px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div style="cursor:pointer; flex: 1;" onclick="app.toggleHistoryCard(${index})">
                            <h3 style="margin:0;">${this.escapeHtml(h.label || h.monthKey)}</h3>
                            <p class="text-muted text-sm mt-1 mb-0">${h.transactions.length} transactions recorded</p>
                            ${balanceHtml}
                        </div>
                        <div style="display:flex; align-items:center; gap:12px; margin-top:2px;">
                            <button class="icon-btn" data-month-key="${this.escapeHtml(h.monthKey)}" onclick="app.deleteLedger(this.dataset.monthKey)" style="color:var(--red)"><i data-lucide="trash-2"></i></button>
                            <i data-lucide="chevron-down" style="color:var(--text-muted); cursor:pointer;" onclick="app.toggleHistoryCard(${index})"></i>
                        </div>
                    </div>
                    <div id="history-txs-${index}" class="hidden mt-3" style="border-top: 1px solid var(--border); padding-top: 12px;">
                        ${catsHtml}
                        ${txsHtml}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        lucide.createIcons({ root: container });

        // Reset rendered chart tracking when history re-renders
        this.renderedHistoryCharts = new Set();
    }

    deleteLedger(monthKey) {
        if (confirm("Are you sure you want to permanently delete this archived month?")) {
            storage.deleteLedger(monthKey);
            this.renderHistory();

            if (this.viewingMonthKey === monthKey) {
                this.viewingMonthKey = null;
                this.renderAll();
            }
        }
    }

    toggleHistoryCard(index) {
        const el = document.getElementById(`history-txs-${index}`);
        const bal = document.getElementById(`history-bal-${index}`);
        if (el) {
            const isHidden = el.classList.toggle('hidden');
            if (bal) {
                bal.style.display = isHidden ? 'flex' : 'none';
            }

            // Render charts lazily on first expand
            if (!isHidden && !this.renderedHistoryCharts.has(index)) {
                this.renderedHistoryCharts.add(index);
                const h = storage.state.history[index];
                if (h) {
                    const totals = { JP: {}, IN: {} };
                    h.transactions.forEach(tx => {
                        if (tx.type === 'expense') {
                            let region = tx.region;
                            if (!region) {
                                region = storage.state.categories.JP.some(c => c.id === tx.categoryId) ? 'JP' : 'IN';
                            }
                            if (totals[region]) {
                                totals[region][tx.categoryId] = (totals[region][tx.categoryId] || 0) + tx.amount;
                            }
                        }
                    });
                    // Small delay so the container is visible before chart renders
                    setTimeout(() => {
                        charts.renderHistoryDonut(`history-donut-${index}-JP`, 'JP', totals.JP);
                        charts.renderHistoryDonut(`history-donut-${index}-IN`, 'IN', totals.IN);
                        lucide.createIcons({ root: el });
                    }, 50);
                }
            }
        }
    }

    showSettings() {
        this.switchView('settings-view');
        this.renderSettings();
        lucide.createIcons();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.nav-item')[3].classList.add('active'); // Settings tab
    }

    async updateSetting(key, val) {
        if (key === 'jpTotalBudget') {
            if (typeof storage.setTotalBudget === 'function') {
                storage.setTotalBudget('JP', val);
            } else {
                await storage.runExclusive(async (state) => {
                    state.jpTotalBudget = Number(val);
                    return true;
                });
            }
            return;
        }
        await storage.runExclusive(async (state) => {
            state[key] = val;
            return true;
        });
    }

    async toggleLoanVisibility() {
        await storage.runExclusive(async (state) => {
            if (state.loanConfig) {
                state.loanConfig.enabled = (state.loanConfig.enabled === false);
            }
            if (state.preferences?.loanTracking) {
                state.preferences.loanTracking.enabled = Boolean(state.loanConfig?.enabled);
            }
            return true;
        });
        this.renderSettings();
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
        this.renderLoanTracker();
    }

    async updateLoanSetting(key, value) {
        await storage.runExclusive(async (state) => {
            if (!state.loanConfig) return false;

            if (key === 'enabled') {
                state.loanConfig[key] = value === true || value === 'true';
            } else {
                let numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    state.loanConfig[key] = numValue;
                }
            }
            if (state.preferences?.loanTracking && key === 'enabled') {
                state.preferences.loanTracking.enabled = state.loanConfig.enabled;
            }
            return true;
        });
        this.renderLoanTracker();
    }

    renderLoanTracker() {
        if (this.currentView !== 'home-view') return;

        const widget = document.getElementById('loan-tracker-widget');
        if (!storage.isLoanTrackingEnabled()) {
            if (widget) widget.style.display = 'none';
            return;
        }

        const loanState = walletManager.getLoanState();
        if (!loanState || loanState.config.enabled === false) {
            if (widget) widget.style.display = 'none';
            return;
        }

        if (widget) {
            widget.style.display = 'block';
            const loanCountry = loanState.config.country || storage.getPrimaryCountry();
            const loanCurrency = loanState.config.currency || (typeof CountryConfig !== 'undefined' && CountryConfig.get(loanCountry)?.currency) || '₹';
            const loanLocale = (typeof CountryConfig !== 'undefined' && CountryConfig.get(loanCountry)?.locale) || 'en-IN';
            const duesPaid = Number(loanState.config.duesPaid) || 0;
            const totalDues = Number(loanState.config.totalDues) || 0;
            const monthsLeft = Math.max(0, totalDues - duesPaid);

            widget.innerHTML = `
                <div class="loan-card-topbar">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="landmark" style="width: 16px; height: 16px; color: var(--text-secondary);"></i>
                        <h3 class="dash-chart-title" style="margin: 0; font-size: 0.92rem;">Loan Tracker</h3>
                    </div>
                    <button type="button" id="log-emi-btn" class="btn btn-primary btn-sm loan-log-emi-btn" onclick="app.openLogEmiModal()" style="height: 28px; padding: 2px 10px; font-size: 11.5px; gap: 6px;" title="Record monthly EMI installment">
                        <i data-lucide="plus" style="width: 13px; height: 13px;"></i>
                        <span>Log EMI</span>
                    </button>
                </div>

                <div class="loan-header" style="display: flex; justify-content: space-between; flex-wrap: wrap; padding: 0 0 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <div style="width: 50%;">
                        <div class="loan-value financial-amount privacy-blur">${this.formatMoney(loanState.config.totalPrincipal, loanCurrency, { locale: loanLocale })}</div>
                        <div class="loan-label">Total Loan</div>
                    </div>
                    <div style="width: 50%; text-align: right;">
                        <div class="loan-value financial-amount privacy-blur">${this.formatMoney(loanState.config.emi, loanCurrency, { locale: loanLocale })}</div>
                        <div class="loan-label">Monthly EMI</div>
                    </div>
                    <div style="width: 100%; text-align: center; font-size: 0.72rem; color: var(--text-muted); margin-top: 10px;">
                        Next draw in <span style="color: var(--text-main); font-weight: 600;">${loanState.daysUntilNextEmi} Days</span> (${loanState.nextEmiDateStr})
                    </div>
                </div>
                
                <div class="loan-progress-box" style="padding: 12px 0 0 0;">
                    <div class="loan-progress-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <span class="loan-percent financial-amount" style="font-size: 2.2rem; font-weight: 700; color: #10b981; line-height: 1;">${loanState.percentPaid}%</span>
                        <div style="display:flex; flex-direction:column; line-height:1.2; text-align:left;">
                            <span class="loan-label" style="font-size:0.75rem; margin:0;">${loanState.percentLabel || 'Principal'}</span>
                            <span class="loan-label" style="font-size:0.75rem; margin:0;">${loanState.subLabel || 'Repaid'}</span>
                        </div>
                        <span class="loan-status" style="margin-left: auto; font-size: 0.72rem; font-weight: 600; color: #10b981; letter-spacing: 1px;">ON TRACK</span>
                    </div>
                    <div class="budget-streak-track" style="margin: 8px 0 10px 0;">
                        <div class="budget-streak-fill neon-safe" style="width: ${loanState.percentPaid}%;"></div>
                    </div>
                    
                    <div class="loan-tenure-summary" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.76rem; color: var(--text-muted); margin: 0 0 14px 0;">
                        <span><strong style="color: var(--text-primary); font-weight: 600;">${duesPaid}</strong> out of ${totalDues} months paid</span>
                        <span style="font-weight: 500; color: var(--text-secondary);"><strong style="color: var(--text-primary); font-weight: 600;">${monthsLeft}</strong> months left</span>
                    </div>
                    
                    <div class="loan-stats-grid" style="display: grid; grid-template-columns: 1fr auto; row-gap: 6px; font-size: 0.8rem;">
                        <span class="loan-stat-label" style="color: var(--text-muted);">Amount Paid</span>
                        <span class="loan-stat-value financial-amount privacy-blur" style="font-weight: 600; text-align: right;">${this.formatMoney(loanState.amountPaid, loanCurrency, { locale: loanLocale })}</span>
                        
                        <span class="loan-stat-label" style="color: var(--text-muted);">Principal Paid</span>
                        <span class="loan-stat-value financial-amount privacy-blur" style="font-weight: 600; text-align: right;">${this.formatMoney(loanState.principalPaid, loanCurrency, { locale: loanLocale, formatOptions: { minimumFractionDigits: 2, maximumFractionDigits: 2 } })}</span>
                        
                        <span class="loan-stat-label" style="color: var(--text-muted);">Principal Left</span>
                        <span class="loan-stat-value financial-amount privacy-blur" style="font-weight: 600; text-align: right;">${this.formatMoney(loanState.principalLeft, loanCurrency, { locale: loanLocale, formatOptions: { minimumFractionDigits: 2, maximumFractionDigits: 2 } })}</span>

                        ${loanState.totalInterest > 0 ? `
                            <span class="loan-stat-label" style="color: var(--text-muted);">Total Interest</span>
                            <span class="loan-stat-value financial-amount privacy-blur" style="font-weight: 600; text-align: right; color: #f59e0b;">${this.formatMoney(loanState.totalInterest, loanCurrency, { locale: loanLocale, formatOptions: { minimumFractionDigits: 2, maximumFractionDigits: 2 } })}</span>
                        ` : ''}
                    </div>
                </div>
            `;
            if (window.lucide && lucide.createIcons) lucide.createIcons({ root: widget });
        }
    }

    openLogEmiModal() {
        if (!storage.isLoanTrackingEnabled() || !storage.state.loanConfig) {
            alert('Loan tracking is currently not configured or disabled. Please enable it in Settings.');
            return;
        }

        const cfg = storage.state.loanConfig;
        const loanCountry = cfg.country || 'IN';
        const loanCurrency = cfg.currency || (typeof CountryConfig !== 'undefined' && CountryConfig.get(loanCountry)?.currency) || '₹';
        const nextDues = (Number(cfg.duesPaid) || 0) + 1;

        const dateInput = document.getElementById('log-emi-date');
        const amountInput = document.getElementById('log-emi-amount');
        const labelEl = document.getElementById('log-emi-amount-label');
        const noteInput = document.getElementById('log-emi-note');
        const walletSelect = document.getElementById('log-emi-wallet');

        if (dateInput) dateInput.value = typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0];
        if (amountInput) amountInput.value = cfg.emi || 0;
        if (labelEl) labelEl.innerText = `EMI Amount (${loanCurrency})`;
        if (noteInput) noteInput.value = `Loan EMI Payment #${nextDues}`;

        // Populate wallets filtered strictly by loan currency/region
        if (walletSelect) {
            const allWallets = Object.values(storage.state.wallets || {});
            const matchingWallets = allWallets.filter(w => w.region === loanCountry || w.currency === loanCurrency);

            if (matchingWallets.length === 0) {
                walletSelect.innerHTML = `<option value="" disabled selected>No wallets available in ${this.escapeHtml(loanCountry)}</option>`;
            } else {
                walletSelect.innerHTML = matchingWallets.map(w => {
                    const isSelected = (cfg.repaymentWallet && cfg.repaymentWallet === w.id) ? 'selected' : '';
                    const balFormatted = (w.currency || '') + (w.balance !== undefined ? Number(w.balance).toLocaleString() : '0');
                    return `<option value="${this.escapeHtml(w.id)}" ${isSelected}>${this.escapeHtml(w.id)} (${this.escapeHtml(balFormatted)})</option>`;
                }).join('');
            }
        }

        this.updateLogEmiPreview();

        if (amountInput) {
            amountInput.oninput = () => this.updateLogEmiPreview();
        }

        const modal = document.getElementById('log-emi-modal');
        if (modal) modal.classList.add('active');
        if (window.lucide && lucide.createIcons) lucide.createIcons();
    }

    updateLogEmiPreview() {
        const cfg = storage.state.loanConfig;
        if (!cfg) return;

        const loanCountry = cfg.country || 'IN';
        const loanCurrency = cfg.currency || (typeof CountryConfig !== 'undefined' && CountryConfig.get(loanCountry)?.currency) || '₹';
        const amountInput = document.getElementById('log-emi-amount');
        const amt = Number(amountInput?.value) || 0;

        const currentPrincipal = Number(cfg.principalLeft) || 0;
        const newPrincipal = Math.max(0, currentPrincipal - amt);

        const currentDues = Number(cfg.duesPaid) || 0;
        const totalDues = Number(cfg.totalDues) || 0;
        const newDues = currentDues + 1;

        const princEl = document.getElementById('log-emi-preview-principal');
        const duesEl = document.getElementById('log-emi-preview-dues');

        if (princEl) {
            princEl.innerText = `${loanCurrency}${currentPrincipal.toLocaleString()} → ${loanCurrency}${newPrincipal.toLocaleString()}`;
        }
        if (duesEl) {
            duesEl.innerText = `${currentDues}/${totalDues} → ${newDues}/${totalDues}`;
        }
    }

    async saveLogEmiPayment() {
        const date = document.getElementById('log-emi-date')?.value || (typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0]);
        const amt = Number(document.getElementById('log-emi-amount')?.value);
        const walletId = document.getElementById('log-emi-wallet')?.value;
        const note = document.getElementById('log-emi-note')?.value.trim();

        if (!amt || isNaN(amt) || amt <= 0) {
            alert('Please enter a valid EMI payment amount greater than zero.');
            return;
        }

        if (!walletId || !storage.state.wallets || !storage.state.wallets[walletId]) {
            alert('Please select an active payment account.');
            return;
        }

        const cfg = storage.state.loanConfig;
        if (!cfg) return;

        const loanCountry = cfg.country || 'IN';
        const loanCurrency = cfg.currency || '₹';

        const res = await storage.runExclusive(async (state) => {
            const w = state.wallets?.[walletId];
            if (!w) return { success: false, error: 'Selected wallet not found.' };

            if (!state.loanConfig) {
                return { success: false, error: 'Loan configuration not found.' };
            }

            // 1. Deduct payment from wallet balance
            w.balance = (Number(w.balance) || 0) - amt;

            // 2. Update loan configuration
            const oldDues = Number(state.loanConfig.duesPaid) || 0;
            state.loanConfig.duesPaid = oldDues + 1;
            const oldPrincipal = Number(state.loanConfig.principalLeft) || 0;
            state.loanConfig.principalLeft = Math.max(0, oldPrincipal - amt);

            if (state.preferences?.loanTracking) {
                state.preferences.loanTracking.duesPaid = state.loanConfig.duesPaid;
                state.preferences.loanTracking.principalLeft = state.loanConfig.principalLeft;
            }

            // 3. Find or create loan category
            const cats = state.categories?.[loanCountry] || [];
            let loanCat = cats.find(c => c.id === 'in-loan' || c.name.toLowerCase().includes('loan') || c.name.toLowerCase().includes('emi'));
            const catId = loanCat ? loanCat.id : (cats[0]?.id || 'in-loan');

            // 4. Create expense transaction in continuous ledger
            const txId = 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
            const tx = {
                id: txId,
                type: 'expense',
                isLoanPayment: true,
                subType: 'loan_emi',
                walletId: walletId,
                categoryId: catId,
                amount: amt,
                note: note || `Loan EMI #${state.loanConfig.duesPaid}`,
                date: date,
                region: loanCountry,
                currency: loanCurrency,
                createdAt: new Date().toISOString()
            };

            if (!Array.isArray(state.transactions)) state.transactions = [];
            state.transactions.unshift(tx);

            return true;
        });

        if (res && res.success !== false) {
            this.closeModal('log-emi-modal');
            this.renderAll();
            this.renderLoanTracker();
            alert(`EMI Payment of ${loanCurrency}${amt.toLocaleString()} recorded successfully!`);
        } else {
            alert(res?.error || 'Failed to record EMI payment.');
        }
    }

    async deleteLoan(event) {
        if (event) event.stopPropagation();
        if (confirm("Are you sure you want to remove the Loan Tracker? You can re-enable it in Settings.")) {
            await storage.runExclusive(async (state) => {
                if (state.loanConfig) {
                    state.loanConfig.enabled = false;
                }
                if (state.preferences?.loanTracking) {
                    state.preferences.loanTracking.enabled = false;
                }
                return true;
            });
            this.renderLoanTracker();
        }
    }

    exportData() {
        storage.exportJSON();
    }

    importData(e) {
        if (!e.target.files.length) return;
        storage.importJSON(e.target.files[0], (success) => {
            if (success) {
                alert('Data restored successfully!');
                this.init();
            } else {
                alert('Failed to parse backup file.');
            }
        });
    }

    async closeMonth() {
        if (confirm("Are you sure you want to close this month and create a snapshot?")) {
            const res = await storage.runExclusive(async () => {
                return storage.closeCurrentMonth();
            });
            if (res && res.success !== false) {
                alert("Month archived!");
                this.init();
            } else {
                alert(res?.error || "Failed to close month.");
            }
        }
    }

    forceUpdate() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function (registrations) {
                for (let registration of registrations) {
                    registration.unregister();
                }
                window.location.reload(true);
            });
        } else {
            window.location.reload(true);
        }
    }
    openPdfModal() {
        const fromSelect = document.getElementById('pdf-from-month');
        const toSelect = document.getElementById('pdf-to-month');
        fromSelect.replaceChildren();
        toSelect.replaceChildren();

        // Gather all months
        const months = storage.state.history.map(h => h.monthKey);
        // Sort chronologically ascending
        months.sort((a, b) => a.localeCompare(b));
        // Add current month at the end
        months.push(storage.state.currentMonthKey);

        months.forEach(m => {
            const label = m === storage.state.currentMonthKey ? `${m} (Current)` : m;
            fromSelect.innerHTML += `<option value="${this.escapeHtml(m)}">${this.escapeHtml(label)}</option>`;
            toSelect.innerHTML += `<option value="${this.escapeHtml(m)}">${this.escapeHtml(label)}</option>`;
        });

        // Select the earliest month for "From" and latest for "To"
        if (months.length > 0) {
            fromSelect.value = months[0];
            toSelect.value = months[months.length - 1];
        }

        document.getElementById('pdf-modal').classList.add('active');
    }

    generatePdf() {
        this.cancelCurrentReportPrint();
        const printContainer = document.getElementById('print-container');
        if (!printContainer) return;
        const money = (amount, currency, options) => this.formatMoney(amount, currency, { ...options, ignorePrivacy: true });

        const fromMonth = document.getElementById('pdf-from-month').value;
        const toMonth = document.getElementById('pdf-to-month').value;

        if (fromMonth.localeCompare(toMonth) > 0) {
            alert('Invalid range. "From Month" must be before or equal to "To Month".');
            return;
        }

        // Collect ledgers to print
        let ledgersToPrint = storage.state.history.filter(h =>
            h.monthKey.localeCompare(fromMonth) >= 0 && h.monthKey.localeCompare(toMonth) <= 0
        );

        if (storage.state.currentMonthKey.localeCompare(fromMonth) >= 0 && storage.state.currentMonthKey.localeCompare(toMonth) <= 0) {
            // Mock a ledger structure for current month scoped to currentMonthKey
            const currentTxs = typeof walletManager !== 'undefined' && typeof walletManager.getTransactions === 'function'
                ? walletManager.getTransactions({ monthKey: storage.state.currentMonthKey })
                : (storage.state.transactions || []).filter(t => this.isTransactionInMonth(t, storage.state.currentMonthKey));
            ledgersToPrint.push({
                monthKey: storage.state.currentMonthKey,
                label: storage.state.currentMonthKey + ' (Current)',
                transactions: currentTxs,
                walletsSnapshot: JSON.parse(JSON.stringify(storage.state.wallets))
            });
        }

        // Filter out any ledgers that have 0 transactions (like an empty current month)
        ledgersToPrint = ledgersToPrint.filter(h => h.transactions && h.transactions.length > 0);

        if (ledgersToPrint.length === 0) {
            alert("No transactions found in this range. Nothing to generate.");
            return;
        }

        let html = '';
        const chartDataToRender = []; // To store chart data for rendering after DOM injection

        ledgersToPrint.forEach((h, index) => {
            const totals = { JP: {}, IN: {} };
            h.transactions.forEach(tx => {
                if (tx.type === 'expense') {
                    let region = tx.region;
                    if (!region) {
                        region = storage.state.categories.JP.some(c => c.id === tx.categoryId) ? 'JP' : 'IN';
                    }
                    if (totals[region]) {
                        totals[region][tx.categoryId] = (totals[region][tx.categoryId] || 0) + tx.amount;
                    }
                }
            });

            let jpBalance = 0;
            let inBalance = 0;
            if (h.walletsSnapshot) {
                Object.values(h.walletsSnapshot).forEach(w => {
                    if (w.region === 'JP') jpBalance += w.balance;
                    if (w.region === 'IN') inBalance += w.balance;
                });
            }

            let balanceHtml = '';
            if (h.walletsSnapshot) {
                balanceHtml = `
                    <div style="display:flex; gap:16px; margin-top:8px; font-size:0.8rem;">
                        <span style="color:var(--text-main); font-weight:500;"><span class="text-muted">JP:</span> ${money(jpBalance, '¥')}</span>
                        <span style="color:var(--text-main); font-weight:500;"><span class="text-muted">IN:</span> ${money(inBalance, '₹', { locale: 'en-IN' })}</span>
                    </div>
                `;
            }

            let catsHtml = '';
            ['JP', 'IN'].forEach(region => {
                const currency = region === 'JP' ? '¥' : '₹';
                let regionSpent = 0;
                let regionBudget = 0;
                let catCardsHtml = '';

                storage.state.categories[region].forEach(catDef => {
                    const spent = (totals[region] && totals[region][catDef.id]) || 0;
                    if (spent === 0) return;

                    const activeBudget = walletManager.getEffectiveBudget(catDef.id, region, h.monthKey);
                    const isOver = activeBudget > 0 && spent > activeBudget;
                    regionSpent += spent;

                    let catProgressHtml = '';
                    if (activeBudget > 0) {
                        regionBudget += activeBudget;
                        const pct = Math.min((spent / activeBudget) * 100, 100);
                        let barClass = 'neon-safe';
                        if (pct > 90) barClass = 'neon-danger';
                        else if (pct > 75) barClass = 'neon-warn';

                        catProgressHtml = `
                            <div class="neon-bar-bg">
                                <div class="neon-bar-fill ${barClass}" style="width: ${pct}%"></div>
                            </div>
                            <div class="neon-amount-sub" style="margin-top: 4px; display:flex; justify-content:space-between;">
                                <span>${money(spent, currency)}</span>
                                <span>${money(activeBudget, currency)}</span>
                            </div>
                        `;
                    } else {
                        catProgressHtml = `<div class="neon-amount-sub" style="margin-top: 4px;">Spent: ${money(spent, currency)}</div>`;
                    }

                    catCardsHtml += `
                        <div class="neon-row ${isOver ? 'is-overbudget' : ''}" style="padding: 12px;">
                            <div class="neon-header" style="margin-bottom: 8px;">
                                <span class="neon-title"><i data-lucide="${this.categoryIcon(catDef.icon)}"></i> ${this.escapeHtml(catDef.name)}</span>
                            </div>
                            ${catProgressHtml}
                        </div>
                    `;
                });

                if (regionSpent === 0) return;

                let overallHtml = '';
                if (regionBudget > 0) {
                    const pct = Math.min((regionSpent / regionBudget) * 100, 100);
                    const barClass = pct > 90 ? 'neon-danger' : pct > 75 ? 'neon-warn' : 'neon-safe';
                    const statusText = pct > 90
                        ? `<span style="color:#ef4444; font-weight:600;">Over Budget!</span>`
                        : pct > 75
                            ? `<span style="color:#f59e0b; font-weight:600;">Nearing Limit</span>`
                            : `<span style="color:#10b981; font-weight:600;">Under Budget!</span>`;

                    overallHtml = `
                        <div class="neon-row" style="padding: 12px; margin-bottom: 16px;">
                            <div class="neon-header" style="margin-bottom: 8px;">
                                <span class="neon-title" style="font-size:0.85rem;">
                                    <i data-lucide="bar-chart-2" style="width:14px;height:14px;"></i> Overall Budget
                                </span>
                                ${statusText}
                            </div>
                            <div class="neon-bar-bg">
                                <div class="neon-bar-fill ${barClass}" style="width: ${pct}%"></div>
                            </div>
                            <div class="neon-amount-sub" style="margin-top: 6px; display:flex; justify-content:space-between;">
                                <span>Spent: ${money(regionSpent, currency)}</span>
                                <span>Budget: ${money(regionBudget, currency)}</span>
                            </div>
                        </div>
                    `;
                } else {
                    overallHtml = `
                        <div class="neon-row" style="padding:12px; margin-bottom:16px;">
                            <div class="neon-amount-sub">Total Spent: ${money(regionSpent, currency)}</div>
                        </div>
                    `;
                }

                // Add canvas with unique print ID
                const canvasId = `print-donut-${index}-${region}`;
                catsHtml += `
                    <div style="margin-top:16px; break-inside: avoid;">
                        <h4 style="color:var(--text-muted); font-size:0.85rem; font-weight: 500; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                            ${this.getCountryFlagSvg(region, 16, 12)}
                            <span>${region === 'JP' ? 'Japan' : 'India'} Analytics</span>
                        </h4>

                        <div style="height: 180px; margin-bottom: 16px; position: relative;">
                            <canvas id="${canvasId}"></canvas>
                        </div>

                        ${overallHtml}

                        ${catCardsHtml ? `
                            <h5 style="color:var(--text-muted); font-size:0.75rem; font-weight: 500; margin: 12px 0 10px;">By Category</h5>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px;">
                                ${catCardsHtml}
                            </div>
                        ` : ''}
                    </div>
                `;

                chartDataToRender.push({ id: canvasId, region: region, totals: totals[region] });
            });

            let txsHtml = '<div style="margin-top: 24px; break-inside: avoid;"><h4 style="color:var(--text-muted); font-size:0.85rem; font-weight: 500; margin-bottom:12px;">Transactions</h4>';

            if (h.transactions && h.transactions.length > 0) {
                const groupedTxs = {};
                h.transactions.forEach(tx => {
                    const dStr = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    if (!groupedTxs[dStr]) groupedTxs[dStr] = [];
                    groupedTxs[dStr].push(tx);
                });

                Object.keys(groupedTxs).forEach(dateStr => {
                    txsHtml += `
                        <div style="margin-top: 16px;">
                            <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; padding-left: 4px; border-left: 2px solid var(--accent);">${dateStr}</div>
                    `;
                    groupedTxs[dateStr].forEach(tx => {
                        txsHtml += this.getTransactionHtml(tx, false, false, true); // editable=false
                    });
                    txsHtml += `</div>`;
                });
            } else {
                txsHtml += '<p class="text-muted text-sm">No transactions found.</p>';
            }
            txsHtml += '</div>';

            html += `
                <div class="card" style="margin-bottom: 24px; page-break-after: always; box-shadow: none; border: 1px solid rgba(255,255,255,0.1);">
                    <h3 style="margin:0;">${this.escapeHtml(h.label || h.monthKey)}</h3>
                    <p class="text-muted text-sm mt-1 mb-0">${h.transactions.length} transactions recorded</p>
                    ${balanceHtml}
                    <div style="border-top: 1px solid var(--border); padding-top: 12px; margin-top:16px;">
                        ${catsHtml}
                        ${txsHtml}
                    </div>
                </div>
            `;
        });

        const job = { container: printContainer, timer: null, charts: [] };
        this._currentReportPrint = job;
        try {
            printContainer.innerHTML = html;
            this.closeModal('pdf-modal');
            this.refreshIcons(printContainer);

            for (const chart of chartDataToRender) {
                const canvas = document.getElementById(chart.id);
                try {
                    charts.renderHistoryDonut(chart.id, chart.region, chart.totals, true);
                } catch {
                    console.warn('[Print] History chart rendering failed.');
                }
                const instance = canvas && window.Chart?.getChart?.(canvas);
                if (instance) job.charts.push(instance);
            }
        } catch (error) {
            this.cancelCurrentReportPrint();
            throw error;
        }

        this.scheduleReportPrint(job, 500, () => {
            for (const chart of job.charts) {
                this.replacePrintCanvas(chart.canvas, { width: '100%', height: '100%', objectFit: 'contain' });
            }
        });
    }

    /* ==========================================================================
       PHASE 3: TRANSACTIONS & ANALYTICS REDESIGN IMPLEMENTATION
       ========================================================================== */

    // Helper: format dates for ledger headers
    formatLedgerDateHeader(dateStr) {
        const utcDay = getTransactionUtcDay(dateStr);
        if (!Number.isFinite(utcDay)) return 'Unknown Date';
        const d = new Date(utcDay * 86_400_000);

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

        const formatted = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
        if (dateStr === todayStr) {
            return `Today • ${formatted}`;
        } else if (dateStr === yesterdayStr) {
            return `Yesterday • ${formatted}`;
        }
        return formatted;
    }

    // Helper: Category Name resolution
    getCategoryName(catId, region = null) {
        if (!catId || catId === 'undefined' || catId === 'null' || (typeof catId === 'string' && catId.trim() === '')) {
            return 'Uncategorized';
        }
        if (typeof catId === 'object' && ('type' in catId || 'amount' in catId)) {
            return this.getTransactionCategory(catId);
        }
        if (storage.state?.categories) {
            if (region && storage.state.categories[region]) {
                const found = storage.state.categories[region].find(c => c.id === catId || c.name === catId || c.id === `jp-${catId}` || c.id === `in-${catId}` || c.id === `de-${catId}`);
                if (found?.name) return found.name;
            }
            const allRegs = ['JP', 'IN', 'DE'];
            Object.keys(storage.state.categories).forEach(r => {
                if (!allRegs.includes(r)) allRegs.push(r);
            });
            for (const reg of allRegs) {
                const found = storage.state.categories[reg]?.find(c => c.id === catId || c.name === catId || c.id === `jp-${catId}` || c.id === `in-${catId}` || c.id === `de-${catId}`);
                if (found?.name) return found.name;
            }
        }
        // Humanize slugs if not found directly
        if (typeof catId === 'string') {
            let cleaned = catId.replace(/^(jp|in|de)-/i, '');
            // Restrict timestamp removal strictly to the generated timestamp pattern (12-14 digits from Date.now())
            // while preserving legitimate category names that end in numbers (e.g. Room 101, Level 2).
            cleaned = cleaned.replace(/-\d{12,14}$/, '');
            const humanized = cleaned.split(/[-_]/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            if (humanized && humanized.toLowerCase() !== 'undefined' && humanized.toLowerCase() !== 'null') {
                return humanized;
            }
        }
        return (catId && catId !== 'undefined' && catId !== 'null') ? catId : 'Uncategorized';
    }

    // Helper: Transaction Category resolution (handles income, transfer, remittance & expense)
    getTransactionCategory(tx) {
        if (!tx) return 'Uncategorized';

        // 1. Income transactions
        if (tx.type === 'income' || tx.isIncome || (tx.amount > 0 && tx.direction === 'credit')) {
            const rawCat = tx.categoryId || tx.category || tx.incomeType;
            if (rawCat && rawCat !== 'undefined' && rawCat !== 'null' && (typeof rawCat !== 'string' || rawCat.trim() !== '')) {
                const resolved = this.getCategoryName(rawCat, tx.region);
                if (resolved && resolved !== 'Uncategorized' && resolved.toLowerCase() !== 'undefined' && resolved.toLowerCase() !== 'null') {
                    return resolved;
                }
                if (typeof rawCat === 'string') {
                    const cleaned = rawCat.replace(/^(jp|in|de)-/i, '');
                    const humanized = cleaned.split(/[-_]/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    if (humanized && humanized.toLowerCase() !== 'undefined' && humanized.toLowerCase() !== 'null') {
                        return humanized;
                    }
                }
                return String(rawCat);
            }
            return 'Income';
        }

        // 2. Transfers
        if (tx.type === 'transfer') {
            return 'Internal Transfer';
        }

        // 3. Remittances
        if (tx.type === 'remittance') {
            return 'Cross-Border Remittance';
        }

        // 4. Expense transactions
        const rawCat = tx.categoryId || tx.category;
        if (!rawCat || rawCat === 'undefined' || rawCat === 'null' || (typeof rawCat === 'string' && rawCat.trim() === '')) {
            return 'Uncategorized';
        }
        return this.getCategoryName(rawCat, tx.region);
    }

    // Helper: Wallet Name resolution
    getWalletName(walletId) {
        if (!walletId) return 'Wallet';
        if (storage.state?.wallets) {
            const w = storage.state.wallets[walletId];
            if (w) return w.name || w.id || walletId;
            const found = Object.values(storage.state.wallets).find(x => x.id === walletId || x.name === walletId);
            if (found) return found.name || found.id || walletId;
        }
        // Humanize if it's an ID like "jp-wallet-1" or "in-wallet-bank"
        if (typeof walletId === 'string') {
            if (walletId === 'jp-wallet-1') return 'Salary Account';
            if (walletId === 'jp-wallet-2') return 'Cash';
            if (walletId === 'jp-wallet-3') return 'PayPay';
            if (walletId === 'in-wallet-1') return 'Bank Account';
            const cleaned = walletId.replace(/^(jp|in)-wallet-?/, '');
            return cleaned.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        return String(walletId || 'Wallet');
    }

    // Helper: Remittance Currency Resolution (Supports JPY, INR, EUR across arbitrary pairs)
    getRemittanceCurrencies(tx) {
        if (!tx) return { srcCur: '¥', dstCur: '₹' };
        const srcWallet = (storage.state?.wallets && tx.sourceId) ? storage.state.wallets[tx.sourceId] : null;
        const dstWallet = (storage.state?.wallets && tx.destId) ? storage.state.wallets[tx.destId] : null;

        let srcCur = tx.sourceCurrency || (srcWallet && (srcWallet.currency || (srcWallet.region === 'JP' ? '¥' : srcWallet.region === 'DE' ? '€' : '₹')));
        let dstCur = tx.destCurrency || (dstWallet && (dstWallet.currency || (dstWallet.region === 'JP' ? '¥' : dstWallet.region === 'DE' ? '€' : '₹')));

        if (!srcCur && tx.currency) srcCur = tx.currency;
        if (!srcCur) srcCur = '¥';
        if (!dstCur) dstCur = '₹';

        return { srcCur, dstCur };
    }

    // Helper: Remittance Country Names Resolution
    getRemittanceCountryNames(tx) {
        if (!tx) return { srcName: 'Japan', dstName: 'India' };
        const srcWallet = (storage.state?.wallets && tx.sourceId) ? storage.state.wallets[tx.sourceId] : null;
        const dstWallet = (storage.state?.wallets && tx.destId) ? storage.state.wallets[tx.destId] : null;
        const regionNames = { JP: 'Japan', IN: 'India', DE: 'Germany' };

        const srcRegion = (srcWallet && srcWallet.region) || (tx.sourceCurrency === '¥' || tx.sourceCurrency === 'JPY' ? 'JP' : (tx.sourceCurrency === '€' || tx.sourceCurrency === 'EUR' ? 'DE' : (tx.sourceCurrency === '₹' || tx.sourceCurrency === 'INR' ? 'IN' : 'JP')));
        const dstRegion = (dstWallet && dstWallet.region) || (tx.destCurrency === '₹' || tx.destCurrency === 'INR' ? 'IN' : (tx.destCurrency === '€' || tx.destCurrency === 'EUR' ? 'DE' : (tx.destCurrency === '¥' || tx.destCurrency === 'JPY' ? 'JP' : 'IN')));

        const srcName = regionNames[srcRegion] || srcRegion || 'Japan';
        const dstName = regionNames[dstRegion] || dstRegion || 'India';

        return { srcName, dstName };
    }

    // Helper: Format Remittance Amount String
    formatRemittanceAmount(tx, { ignorePrivacy = false } = {}) {
        if (this.isPrivacyHidden && !ignorePrivacy) return '******';
        if (!tx) return '0';
        const { srcCur, dstCur } = this.getRemittanceCurrencies(tx);
        const srcFormatted = this.formatMoney(Number(tx.sourceAmount || 0), srcCur, { ignorePrivacy });
        const dstFormatted = this.formatMoney(Number(tx.destAmount || 0), dstCur, { ignorePrivacy });
        return `${srcFormatted} → ${dstFormatted}`;
    }

    // --------------------------------------------------------------------------
    // TRANSACTIONS CONTINUOUS LEDGER
    // --------------------------------------------------------------------------

    _getLedgerActiveCountries() {
        const active = (typeof storage !== 'undefined' && typeof storage.getActiveCountries === 'function')
            ? storage.getActiveCountries()
            : ['JP', 'IN'];
        const normalized = Array.isArray(active) ? active.map(c => String(c).toUpperCase()).filter(Boolean) : [];
        return normalized.length > 0 ? normalized : ['JP', 'IN'];
    }

    _syncLedgerRegionState() {
        const activeCountries = this._getLedgerActiveCountries();
        let effectiveRegion = 'all';

        if (activeCountries.length === 1) {
            this.ledgerFilters.region = 'all';
            effectiveRegion = activeCountries[0];
        } else {
            if (this.ledgerFilters.region !== 'all' && !activeCountries.includes(this.ledgerFilters.region)) {
                this.ledgerFilters.region = 'all';
            }
            effectiveRegion = this.ledgerFilters.region || 'all';
        }

        const segment = document.getElementById('ledger-country-filter');
        if (segment) {
            if (activeCountries.length <= 1) {
                segment.style.display = 'none';
            } else {
                segment.style.display = '';
                segment.querySelectorAll('.segment-btn').forEach(btn => {
                    const btnRegion = btn.getAttribute('data-region');
                    const isVisible = btnRegion === 'all' || activeCountries.includes(btnRegion);
                    btn.style.display = isVisible ? '' : 'none';
                    if (isVisible && btnRegion === effectiveRegion) btn.classList.add('active');
                    else btn.classList.remove('active');
                });
            }
        }

        return { activeCountries, effectiveRegion };
    }

    _inferLedgerTxRegions(tx) {
        const regions = new Set();
        if (!tx) return regions;

        const wallets = storage.state?.wallets || {};
        let primary = tx.region ? String(tx.region).toUpperCase() : null;
        if (!primary && tx.walletId && wallets[tx.walletId]?.region) {
            primary = String(wallets[tx.walletId].region).toUpperCase();
        }
        if (!primary && tx.sourceId && wallets[tx.sourceId]?.region) {
            primary = String(wallets[tx.sourceId].region).toUpperCase();
        }
        if (!primary && tx.categoryId && storage.state?.categories) {
            for (const reg of Object.keys(storage.state.categories)) {
                const list = storage.state.categories[reg];
                if (Array.isArray(list) && list.some(c => c.id === tx.categoryId)) {
                    primary = reg.toUpperCase();
                    break;
                }
            }
        }
        if (!primary) {
            const cur = String(tx.currency || tx.sourceCurrency || '').toUpperCase();
            if (cur === '¥' || cur === 'JPY') primary = 'JP';
            else if (cur === '€' || cur === 'EUR') primary = 'DE';
            else if (cur === '₹' || cur === 'INR') primary = 'IN';
        }
        if (primary) regions.add(primary);

        if ((tx.type === 'remittance' || tx.type === 'transfer') && tx.destId && wallets[tx.destId]?.region) {
            regions.add(String(wallets[tx.destId].region).toUpperCase());
        }
        return regions;
    }

    _getFilteredLedgerTransactions(activeCountries, effectiveRegion) {
        const queryFilters = {};
        if (this.ledgerSearchQuery) queryFilters.search = this.ledgerSearchQuery;
        if (this.ledgerFilters.type !== 'all') queryFilters.type = this.ledgerFilters.type;
        if (this.ledgerFilters.categoryId !== 'all') queryFilters.categoryId = this.ledgerFilters.categoryId;
        if (this.ledgerFilters.walletId !== 'all') queryFilters.walletId = this.ledgerFilters.walletId;
        if (this.ledgerFilters.startDate) queryFilters.startDate = this.ledgerFilters.startDate;
        if (this.ledgerFilters.endDate) queryFilters.endDate = this.ledgerFilters.endDate;
        if (this.ledgerFilters.minAmount !== null) queryFilters.minAmount = this.ledgerFilters.minAmount;
        if (this.ledgerFilters.maxAmount !== null) queryFilters.maxAmount = this.ledgerFilters.maxAmount;

        const baseTxs = walletManager.getTransactions(queryFilters);
        return baseTxs.filter(tx => {
            const txRegions = this._inferLedgerTxRegions(tx);
            if (txRegions.size === 0) return effectiveRegion === 'all';
            if (effectiveRegion !== 'all') {
                const primary = tx.region ? String(tx.region).toUpperCase() : Array.from(txRegions)[0];
                return primary === effectiveRegion;
            }
            return Array.from(txRegions).some(r => activeCountries.includes(r));
        });
    }

    _syncLedgerCategoryDropdown(activeCountries) {
        const catSelect = document.getElementById('filter-category-select');
        if (!catSelect) return;
        if (!catSelect.dataset) catSelect.dataset = {};

        const rawEnabled = Array.isArray(activeCountries) ? activeCountries : this._getLedgerActiveCountries();
        const enabled = rawEnabled.map(c => String(c).toUpperCase());
        const availableRegions = ['JP', 'IN', 'DE'].filter(r => enabled.includes(r));
        if (storage.state?.categories) {
            Object.keys(storage.state.categories).forEach(r => {
                const upperR = String(r).toUpperCase();
                if (!availableRegions.includes(upperR) && enabled.includes(upperR)) {
                    availableRegions.push(upperR);
                }
            });
        }

        const regionCats = {};
        const sigParts = [];
        availableRegions.forEach(reg => {
            const list = (storage.state?.categories?.[reg] || []).filter(c => c && c.isActive !== false && !c.archived && !c.isArchived);
            regionCats[reg] = list;
            sigParts.push(`${reg}:` + list.map(c => `${c.id}=${c.name || ''}`).join(','));
        });
        const optionsSig = sigParts.join('|');
        const totalActiveCats = availableRegions.reduce((sum, reg) => sum + (regionCats[reg] || []).length, 0);

        const needsRebuild = !catSelect.dataset.optionsSig ||
            catSelect.dataset.optionsSig !== optionsSig ||
            (catSelect.options && catSelect.options.length === 1 && totalActiveCats > 0);

        if (needsRebuild) {
            let catOptions = '<option value="all">All Categories</option>';
            const regionLabels = { JP: 'Japan', IN: 'India', DE: 'Germany' };
            availableRegions.forEach(reg => {
                const cats = regionCats[reg] || [];
                if (cats.length > 0) {
                    const label = regionLabels[reg] ? `${regionLabels[reg]} Categories` : `${reg} Categories`;
                    catOptions += `<optgroup label="${this.escapeHtml(label)}">`;
                    cats.forEach(c => {
                        catOptions += `<option value="${this.escapeHtml(c.id)}">${this.escapeHtml(c.name || c.id)}</option>`;
                    });
                    catOptions += '</optgroup>';
                }
            });
            catSelect.innerHTML = catOptions;
            catSelect.dataset.optionsSig = optionsSig;
        }

        const targetCatId = (this.ledgerFilters && this.ledgerFilters.categoryId) || 'all';
        catSelect.value = targetCatId;
        const optionExists = catSelect.options && catSelect.options.length > 0
            ? Array.from(catSelect.options).some(o => o.value === targetCatId)
            : (catSelect.value === targetCatId);
        if (!optionExists || catSelect.value !== targetCatId) {
            catSelect.value = 'all';
            if (this.ledgerFilters) this.ledgerFilters.categoryId = 'all';
        }
    }

    _syncLedgerWalletDropdown(activeCountries) {
        const walletSelect = document.getElementById('filter-wallet-select');
        if (!walletSelect) return;
        if (!walletSelect.dataset) walletSelect.dataset = {};

        const rawEnabled = Array.isArray(activeCountries) ? activeCountries : this._getLedgerActiveCountries();
        const enabled = rawEnabled.map(c => String(c).toUpperCase());
        const availableWallets = Object.values(storage.state?.wallets || {}).filter(w => {
            if (!w || !w.id) return false;
            if (w.isActive === false || w.isArchived === true || w.archived === true) return false;
            const reg = (w.region || 'JP').toUpperCase();
            return enabled.includes(reg);
        });

        const optionsSig = availableWallets
            .map(w => `${w.id}:${(w.region || 'JP').toUpperCase()}:${w.name || w.id}`)
            .join('|');

        const needsRebuild = !walletSelect.dataset.optionsSig ||
            walletSelect.dataset.optionsSig !== optionsSig ||
            (walletSelect.options && walletSelect.options.length === 1 && availableWallets.length > 0);

        if (needsRebuild) {
            let walletOptions = '<option value="all">All Wallets</option>';
            availableWallets.forEach(w => {
                const countryTag = `[${(w.region || 'JP').toUpperCase()}]`;
                const label = `${countryTag} ${w.name || w.id}`;
                walletOptions += `<option value="${this.escapeHtml(w.id)}">${this.escapeHtml(label)}</option>`;
            });
            walletSelect.innerHTML = walletOptions;
            walletSelect.dataset.optionsSig = optionsSig;
        }

        const targetWalletId = (this.ledgerFilters && this.ledgerFilters.walletId) || 'all';
        walletSelect.value = targetWalletId;
        const walletOptionExists = walletSelect.options && walletSelect.options.length > 0
            ? Array.from(walletSelect.options).some(o => o.value === targetWalletId)
            : (walletSelect.value === targetWalletId);
        if (!walletOptionExists || walletSelect.value !== targetWalletId) {
            walletSelect.value = 'all';
            if (this.ledgerFilters) this.ledgerFilters.walletId = 'all';
        }
    }

    renderTransactionsPage() {
        const timelineEl = document.getElementById('ledger-timeline-container');
        if (!timelineEl) return;

        this._flushLedgerSearchTimer();

        const { activeCountries, effectiveRegion } = this._syncLedgerRegionState();

        // 1. Synchronize Category dropdown
        this._syncLedgerCategoryDropdown(activeCountries);

        // 2. Synchronize Wallet dropdown
        this._syncLedgerWalletDropdown(activeCountries);

        // Reconcile remaining filter input controls
        const typeSelect = document.getElementById('filter-type-select');
        if (typeSelect) {
            typeSelect.value = this.ledgerFilters.type || 'all';
            if (typeSelect.value !== (this.ledgerFilters.type || 'all')) {
                typeSelect.value = 'all';
                this.ledgerFilters.type = 'all';
            }
        }

        const dateSelect = document.getElementById('filter-date-preset');
        if (dateSelect) {
            dateSelect.value = this.ledgerFilters.datePreset || 'all';
            if (dateSelect.value !== (this.ledgerFilters.datePreset || 'all')) {
                dateSelect.value = 'all';
                this.ledgerFilters.datePreset = 'all';
            }
        }

        const customWrap = document.getElementById('filter-custom-date-wrap');
        if (customWrap) customWrap.style.display = this.ledgerFilters.datePreset === 'custom' ? 'grid' : 'none';

        const startInput = document.getElementById('filter-date-start');
        if (startInput && document.activeElement !== startInput) startInput.value = this.ledgerFilters.startDate || '';
        const endInput = document.getElementById('filter-date-end');
        if (endInput && document.activeElement !== endInput) endInput.value = this.ledgerFilters.endDate || '';

        const minInput = document.getElementById('filter-amount-min');
        if (minInput && document.activeElement !== minInput) minInput.value = (this.ledgerFilters.minAmount !== null && this.ledgerFilters.minAmount !== undefined) ? this.ledgerFilters.minAmount : '';
        const maxInput = document.getElementById('filter-amount-max');
        if (maxInput && document.activeElement !== maxInput) maxInput.value = (this.ledgerFilters.maxAmount !== null && this.ledgerFilters.maxAmount !== undefined) ? this.ledgerFilters.maxAmount : '';

        const searchInput = document.getElementById('ledger-search-input');
        if (searchInput && document.activeElement !== searchInput) searchInput.value = this.ledgerSearchQuery || '';

        // 3. Filter transactions consistently with active/selected country
        const allFilteredTxs = this._getFilteredLedgerTransactions(activeCountries, effectiveRegion);
        const totalCount = allFilteredTxs.length;
        const showingCount = Math.min(this.ledgerVisibleCount, totalCount);

        // Update count indicators
        const showingEl = document.getElementById('ledger-showing-count');
        const totalEl = document.getElementById('ledger-total-count');
        if (showingEl) showingEl.innerText = showingCount;
        if (totalEl) totalEl.innerText = totalCount;

        // Update active filter badge & chips
        this.renderLedgerActiveChips();

        // Search clear button
        const clearSearchBtn = document.getElementById('ledger-search-clear');
        if (clearSearchBtn) {
            clearSearchBtn.style.display = this.ledgerSearchQuery ? 'flex' : 'none';
        }

        // Empty state check
        if (totalCount === 0) {
            const allTotalTxs = (storage.state?.transactions || []).length;
            const isGenuineEmpty = allTotalTxs === 0;

            timelineEl.innerHTML = `
                <div class="card ledger-empty-state">
                    <div class="empty-icon-circle">
                        <i data-lucide="${isGenuineEmpty ? 'receipt-text' : 'search-x'}"></i>
                    </div>
                    <h3 style="margin: 0; font-size: 1.05rem; font-weight: 600;">${isGenuineEmpty ? 'No Transactions Yet' : 'No Matching Transactions'}</h3>
                    <p class="text-muted text-sm" style="margin: 0; max-width: 360px;">${isGenuineEmpty ? 'Record your first expense or income to start building your financial timeline.' : 'No transactions match your search query or applied filter criteria.'}</p>
                    ${isGenuineEmpty ? `
                        <button class="btn btn-primary btn-sm" onclick="app.openUnifiedTransactionSelector()" style="margin-top: 6px;">
                            <i data-lucide="plus"></i>
                            <span>Add First Transaction</span>
                        </button>
                    ` : `
                        <button class="btn btn-secondary btn-sm" onclick="app.resetAllLedgerFilters()" style="margin-top: 6px;">
                            <i data-lucide="rotate-ccw"></i>
                            <span>Reset All Filters</span>
                        </button>
                    `}
                </div>
            `;
            const paginationWrap = document.getElementById('ledger-pagination-wrap');
            if (paginationWrap) paginationWrap.style.display = 'none';
            if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
            return;
        }

        // Slice visible records for incremental loading
        const visibleTxs = allFilteredTxs.slice(0, showingCount);

        // Group transactions by date (reverse chronological)
        const dateGroups = new Map();
        visibleTxs.forEach(tx => {
            const date = tx.date || null;
            if (!dateGroups.has(date)) dateGroups.set(date, []);
            dateGroups.get(date).push(tx);
        });

        let html = '';
        dateGroups.forEach((groupTxs, dateStr) => {
            const dateHeaderLabel = this.formatLedgerDateHeader(dateStr);

            // Compute day net summary safely per currency (never sum mixed currencies into one scalar)
            const currencyNets = {};
            groupTxs.forEach(t => {
                const effType = t.type || (t.isIncome ? 'income' : 'expense');
                if (effType !== 'income' && effType !== 'expense') return;

                let sym = '¥';
                if (t.currency === 'INR' || t.currency === '₹' || t.region === 'IN') sym = '₹';
                else if (t.currency === 'EUR' || t.currency === '€' || t.region === 'DE') sym = '€';
                else if (t.currency === 'USD' || t.currency === '$' || t.region === 'US') sym = '$';
                else if (t.currency) sym = t.currency;

                if (!currencyNets[sym]) currencyNets[sym] = 0;
                if (effType === 'income') currencyNets[sym] += Number(t.amount || 0);
                else if (effType === 'expense') currencyNets[sym] -= Number(t.amount || 0);
            });

            const subtotalChips = Object.entries(currencyNets)
                .filter(([_, net]) => net !== 0)
                .map(([sym, net]) => {
                    const formatted = this.escapeHtml(this.formatMoney(Math.abs(net), sym));
                    return net > 0 ? `+${formatted}` : `-${formatted}`;
                });
            const subtotalHtml = subtotalChips.join(' &bull; ');

            html += `
                <div class="ledger-date-group">
                    <div class="ledger-date-header">
                        <div class="ledger-date-title">
                            <span>${dateHeaderLabel}</span>
                            <span class="day-pill">${groupTxs.length} ${groupTxs.length === 1 ? 'tx' : 'txs'}</span>
                        </div>
                        <div class="ledger-date-subtotal privacy-blur">
                            ${subtotalHtml}
                        </div>
                    </div>
            `;

            groupTxs.forEach(tx => {
                const effectiveType = tx.type || (tx.isIncome ? 'income' : 'expense');
                let icon = 'arrow-up-right';
                let typeCls = 'expense';
                let sign = '-';
                const categoryName = this.getTransactionCategory(tx);
                let title = tx.note || categoryName;
                let walletName = this.getWalletName(tx.walletId);
                const flag = tx.region ? this.getCountryFlagSvg(tx.region, 14, 10.5) : '';

                if (effectiveType === 'income') {
                    icon = 'arrow-down-left';
                    typeCls = 'income';
                    sign = '+';
                    title = tx.note || categoryName;
                } else if (effectiveType === 'transfer') {
                    icon = 'arrow-left-right';
                    typeCls = 'transfer';
                    sign = '';
                    title = `${this.getWalletName(tx.sourceId)} → ${this.getWalletName(tx.destId)}`;
                } else if (effectiveType === 'remittance') {
                    icon = 'send';
                    typeCls = 'remittance';
                    sign = '';
                    const { srcCur, dstCur } = this.getRemittanceCurrencies(tx);
                    title = `${this.getWalletName(tx.sourceId)} (${srcCur}) → ${this.getWalletName(tx.destId)} (${dstCur})`;
                }

                // Amount string
                let amountHtml = '';
                if (effectiveType === 'remittance') {
                    amountHtml = this.formatRemittanceAmount(tx);
                } else {
                    const cur = (tx.currency === 'INR' || tx.currency === '₹' || tx.region === 'IN') ? '₹' : (tx.currency === 'EUR' || tx.currency === '€' || tx.region === 'DE') ? '€' : '¥';
                    amountHtml = this.formatMoney(tx.amount, cur, { prefix: sign });
                }

                // Refined typographic metadata line
                let metaItemsHtml = '';
                if (effectiveType === 'expense') {
                    metaItemsHtml += `<span class="ledger-tx-meta-item category">${this.escapeHtml(categoryName)}</span>`;
                    metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                    metaItemsHtml += `<span class="ledger-tx-meta-item account">${this.escapeHtml(walletName)}</span>`;
                    if (tx.note && tx.note !== title) {
                        metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                        metaItemsHtml += `<span class="ledger-tx-meta-item note">"${this.escapeHtml(tx.note)}"</span>`;
                    }
                } else if (effectiveType === 'income') {
                    metaItemsHtml += `<span class="ledger-tx-meta-item category">${this.escapeHtml(categoryName)}</span>`;
                    metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                    metaItemsHtml += `<span class="ledger-tx-meta-item account">${this.escapeHtml(walletName)}</span>`;
                    if (tx.note && tx.note !== title) {
                        metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                        metaItemsHtml += `<span class="ledger-tx-meta-item note">"${this.escapeHtml(tx.note)}"</span>`;
                    }
                } else if (effectiveType === 'transfer') {
                    metaItemsHtml += `<span class="ledger-tx-meta-item category">Internal Transfer</span>`;
                    if (tx.note) {
                        metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                        metaItemsHtml += `<span class="ledger-tx-meta-item note">"${this.escapeHtml(tx.note)}"</span>`;
                    }
                } else if (effectiveType === 'remittance') {
                    metaItemsHtml += `<span class="ledger-tx-meta-item category">Cross-Border Remittance</span>`;
                    if (tx.exchangeRate) {
                        metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                        metaItemsHtml += `<span class="ledger-tx-meta-item rate">Rate: ${this.escapeHtml(tx.exchangeRate)}</span>`;
                    }
                    if (tx.note) {
                        metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                        metaItemsHtml += `<span class="ledger-tx-meta-item note">"${this.escapeHtml(tx.note)}"</span>`;
                    }
                }

                html += `
                    <div class="ledger-tx-row" data-transaction-id="${this.escapeHtml(tx.id)}" onclick="app.openTransactionDetail(this.dataset.transactionId)" title="Inspect details and actions">
                        <div class="ledger-tx-left">
                            <div class="tx-type-icon ${typeCls}">
                                <i data-lucide="${icon}"></i>
                            </div>
                            <div class="ledger-tx-details">
                                <div class="ledger-tx-primary-line">
                                    <span class="ledger-tx-title">${this.escapeHtml(title)}</span>
                                    ${flag ? `<span class="tx-flag-pill">${flag}</span>` : ''}
                                </div>
                                <div class="ledger-tx-meta">
                                    ${metaItemsHtml}
                                </div>
                            </div>
                        </div>
                        <div class="ledger-tx-right">
                            <span class="ledger-tx-amount ${typeCls} privacy-blur">${this.escapeHtml(amountHtml)}</span>
                        </div>
                    </div>
                `;
            });

            html += `</div>`; // Close date group
        });

        timelineEl.innerHTML = html;

        // Handle Load More
        const paginationWrap = document.getElementById('ledger-pagination-wrap');
        const remainingSpan = document.getElementById('ledger-remaining-count');
        if (paginationWrap) {
            if (totalCount > showingCount) {
                paginationWrap.style.display = 'flex';
                if (remainingSpan) remainingSpan.innerText = totalCount - showingCount;
            } else {
                paginationWrap.style.display = 'none';
            }
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    renderLedgerActiveChips() {
        const chipsContainer = document.getElementById('ledger-active-chips');
        const badgeEl = document.getElementById('ledger-active-filter-badge');
        if (!chipsContainer) return;

        let activeCount = 0;
        let chipsHtml = '';

        if (this.ledgerSearchQuery) {
            activeCount++;
            const safeSearch = this.escapeHtml(this.ledgerSearchQuery);
            chipsHtml += `
                <span class="filter-chip">
                    <span>Search: "${safeSearch}"</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('search')" title="Remove search">×</button>
                </span>
            `;
        }

        if (this.ledgerFilters.type !== 'all') {
            activeCount++;
            chipsHtml += `
                <span class="filter-chip">
                    <span>Type: ${this.escapeHtml(this.ledgerFilters.type)}</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('type')" title="Remove type filter">×</button>
                </span>
            `;
        }

        if (this._getLedgerActiveCountries().length > 1 && this.ledgerFilters.region !== 'all') {
            activeCount++;
            const regName = this.ledgerFilters.region === 'JP' ? 'Japan' : (this.ledgerFilters.region === 'DE' ? 'Germany' : 'India');
            chipsHtml += `
                <span class="filter-chip">
                    <span style="display:inline-flex; align-items:center; gap:6px;">Country: ${this.getCountryFlagSvg(this.ledgerFilters.region, 14, 10.5)} ${this.escapeHtml(regName)}</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('region')" title="Remove region filter">×</button>
                </span>
            `;
        }

        if (this.ledgerFilters.datePreset !== 'all') {
            activeCount++;
            let dateLabel = this.ledgerFilters.datePreset;
            if (dateLabel === 'today') dateLabel = 'Today';
            else if (dateLabel === 'week') dateLabel = 'This Week';
            else if (dateLabel === 'month') dateLabel = 'This Month';
            else if (dateLabel === 'prev_month') dateLabel = 'Previous Month';
            else if (dateLabel === 'custom') dateLabel = `${this.ledgerFilters.startDate} to ${this.ledgerFilters.endDate}`;

            chipsHtml += `
                <span class="filter-chip">
                    <span>Date: ${this.escapeHtml(dateLabel)}</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('datePreset')" title="Remove date filter">×</button>
                </span>
            `;
        }

        if (this.ledgerFilters.categoryId !== 'all') {
            activeCount++;
            chipsHtml += `
                <span class="filter-chip">
                    <span>Category: ${this.escapeHtml(this.getCategoryName(this.ledgerFilters.categoryId))}</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('categoryId')" title="Remove category filter">×</button>
                </span>
            `;
        }

        if (this.ledgerFilters.walletId !== 'all') {
            activeCount++;
            chipsHtml += `
                <span class="filter-chip">
                    <span>Wallet: ${this.escapeHtml(this.getWalletName(this.ledgerFilters.walletId))}</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('walletId')" title="Remove wallet filter">×</button>
                </span>
            `;
        }

        if (this.ledgerFilters.minAmount !== null || this.ledgerFilters.maxAmount !== null) {
            activeCount++;
            const minStr = this.ledgerFilters.minAmount !== null ? String(this.ledgerFilters.minAmount) : '0';
            const maxStr = this.ledgerFilters.maxAmount !== null ? String(this.ledgerFilters.maxAmount) : '∞';
            chipsHtml += `
                <span class="filter-chip">
                    <span>Amount: ${this.escapeHtml(minStr)} - ${this.escapeHtml(maxStr)}</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('amount')" title="Remove amount filter">×</button>
                </span>
            `;
        }

        if (activeCount > 0) {
            chipsHtml += `<button class="clear-all-chip" onclick="app.resetAllLedgerFilters()">Clear All</button>`;
        }

        chipsContainer.innerHTML = chipsHtml;

        if (badgeEl) {
            if (activeCount > 0) {
                badgeEl.innerText = activeCount;
                badgeEl.style.display = 'inline-block';
            } else {
                badgeEl.style.display = 'none';
            }
        }
    }

    _cancelLedgerSearchTimer() {
        if (this.ledgerSearchDebounceTimer) {
            clearTimeout(this.ledgerSearchDebounceTimer);
            this.ledgerSearchDebounceTimer = null;
        }
        this._pendingSearchQuery = null;
    }

    _flushLedgerSearchTimer() {
        if (this.ledgerSearchDebounceTimer) {
            clearTimeout(this.ledgerSearchDebounceTimer);
            this.ledgerSearchDebounceTimer = null;
            if (this._pendingSearchQuery !== null && this._pendingSearchQuery !== undefined) {
                const query = this._pendingSearchQuery;
                this._pendingSearchQuery = null;
                if (this.ledgerSearchQuery !== query) {
                    this.ledgerSearchQuery = query;
                    this.ledgerVisibleCount = this.ledgerPageSize;
                }
            }
        }
    }

    onLedgerSearchInput(event) {
        this._cancelLedgerSearchTimer();

        const input = document.getElementById('ledger-search-input');
        const rawValue = (event && event.target) ? event.target.value : (input ? input.value : '');
        const query = rawValue.trim();
        const clearBtn = document.getElementById('ledger-search-clear');
        if (clearBtn) clearBtn.style.display = rawValue ? 'flex' : 'none';

        this._pendingSearchQuery = query;
        this.ledgerSearchDebounceTimer = setTimeout(() => {
            this.ledgerSearchDebounceTimer = null;
            this._pendingSearchQuery = null;
            if (this.ledgerSearchQuery !== query) {
                this.ledgerSearchQuery = query;
                this.ledgerVisibleCount = this.ledgerPageSize;
                this.renderTransactionsPage();
            }
        }, 200);
    }

    clearLedgerSearch(options = {}) {
        this._cancelLedgerSearchTimer();
        const input = document.getElementById('ledger-search-input');
        if (input) input.value = '';
        const clearBtn = document.getElementById('ledger-search-clear');
        if (clearBtn) clearBtn.style.display = 'none';
        this.ledgerSearchQuery = '';
        this.ledgerVisibleCount = this.ledgerPageSize;
        const skipRender = (options === true) || Boolean(options && options.skipRender);
        if (!skipRender) {
            this.renderTransactionsPage();
        }
    }

    toggleLedgerFilterPanel() {
        const panel = document.getElementById('ledger-filter-panel');
        if (!panel) return;
        const isHidden = panel.style.display === 'none' || panel.style.display === '';
        panel.style.display = isHidden ? 'block' : 'none';
    }

    onLedgerFilterChange() {
        const typeSelect = document.getElementById('filter-type-select');
        const catSelect = document.getElementById('filter-category-select');
        const walletSelect = document.getElementById('filter-wallet-select');
        const minInput = document.getElementById('filter-amount-min');
        const maxInput = document.getElementById('filter-amount-max');

        if (typeSelect) this.ledgerFilters.type = typeSelect.value;
        if (catSelect) this.ledgerFilters.categoryId = catSelect.value;
        if (walletSelect) this.ledgerFilters.walletId = walletSelect.value;

        if (minInput && minInput.value !== '') {
            this.ledgerFilters.minAmount = Number(minInput.value);
        } else {
            this.ledgerFilters.minAmount = null;
        }

        if (maxInput && maxInput.value !== '') {
            this.ledgerFilters.maxAmount = Number(maxInput.value);
        } else {
            this.ledgerFilters.maxAmount = null;
        }

        if (this.ledgerFilters.datePreset === 'custom') {
            const startInput = document.getElementById('filter-date-start');
            const endInput = document.getElementById('filter-date-end');
            this.ledgerFilters.startDate = startInput?.value || '';
            this.ledgerFilters.endDate = endInput?.value || '';
        }

        this.ledgerVisibleCount = this.ledgerPageSize;
        this.renderTransactionsPage();
    }

    _computeDatePresetRange(preset) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const date = now.getDate();

        if (preset === 'today') {
            const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
            return { startDate: todayStr, endDate: todayStr };
        } else if (preset === 'week') {
            const dayOfWeek = now.getDay();
            const sunday = new Date(now);
            sunday.setDate(now.getDate() - dayOfWeek);
            const saturday = new Date(sunday);
            saturday.setDate(sunday.getDate() + 6);
            return {
                startDate: `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`,
                endDate: `${saturday.getFullYear()}-${String(saturday.getMonth() + 1).padStart(2, '0')}-${String(saturday.getDate()).padStart(2, '0')}`
            };
        } else if (preset === 'month') {
            const lastDay = new Date(year, month + 1, 0).getDate();
            return {
                startDate: `${year}-${String(month + 1).padStart(2, '0')}-01`,
                endDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
            };
        } else if (preset === 'prev_month') {
            const prevMonthDate = new Date(year, month - 1, 1);
            const py = prevMonthDate.getFullYear();
            const pm = prevMonthDate.getMonth();
            const lastDay = new Date(py, pm + 1, 0).getDate();
            return {
                startDate: `${py}-${String(pm + 1).padStart(2, '0')}-01`,
                endDate: `${py}-${String(pm + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
            };
        }
        return { startDate: '', endDate: '' };
    }

    onLedgerDatePresetChange() {
        const dateSelect = document.getElementById('filter-date-preset');
        const customWrap = document.getElementById('filter-custom-date-wrap');
        const preset = dateSelect?.value || 'all';
        this.ledgerFilters.datePreset = preset;

        if (preset === 'custom') {
            if (customWrap) customWrap.style.display = 'grid';
            const startInput = document.getElementById('filter-date-start');
            const endInput = document.getElementById('filter-date-end');
            this.ledgerFilters.startDate = startInput?.value || '';
            this.ledgerFilters.endDate = endInput?.value || '';
        } else {
            if (customWrap) customWrap.style.display = 'none';
            const range = this._computeDatePresetRange(preset);
            this.ledgerFilters.startDate = range.startDate;
            this.ledgerFilters.endDate = range.endDate;
        }

        this.ledgerVisibleCount = this.ledgerPageSize;
        this.renderTransactionsPage();
    }

    setLedgerRegion(region) {
        const activeCountries = this._getLedgerActiveCountries();
        const isAllowed = region === 'all' || (typeof region === 'string' && activeCountries.includes(region));
        if (!isAllowed) {
            this._syncLedgerRegionState();
            return false;
        }
        this.ledgerFilters.region = activeCountries.length <= 1 ? 'all' : region;
        this._syncLedgerRegionState();
        this.ledgerVisibleCount = this.ledgerPageSize;
        this.renderTransactionsPage();
        return true;
    }

    removeLedgerFilter(key) {
        if (key === 'search') {
            this.clearLedgerSearch();
            return;
        } else if (key === 'type') {
            this.ledgerFilters.type = 'all';
            const el = document.getElementById('filter-type-select');
            if (el) el.value = 'all';
        } else if (key === 'region' || key === 'country') {
            this.setLedgerRegion('all');
            return;
        } else if (key === 'datePreset' || key === 'date') {
            this.ledgerFilters.datePreset = 'all';
            this.ledgerFilters.startDate = '';
            this.ledgerFilters.endDate = '';
            const el = document.getElementById('filter-date-preset');
            if (el) el.value = 'all';
            const customWrap = document.getElementById('filter-custom-date-wrap');
            if (customWrap) customWrap.style.display = 'none';
            const startInput = document.getElementById('filter-date-start');
            const endInput = document.getElementById('filter-date-end');
            if (startInput) startInput.value = '';
            if (endInput) endInput.value = '';
        } else if (key === 'categoryId' || key === 'category') {
            this.ledgerFilters.categoryId = 'all';
            const el = document.getElementById('filter-category-select');
            if (el) el.value = 'all';
        } else if (key === 'walletId' || key === 'wallet') {
            this.ledgerFilters.walletId = 'all';
            const el = document.getElementById('filter-wallet-select');
            if (el) el.value = 'all';
        } else if (key === 'amount') {
            this.ledgerFilters.minAmount = null;
            this.ledgerFilters.maxAmount = null;
            const minEl = document.getElementById('filter-amount-min');
            const maxEl = document.getElementById('filter-amount-max');
            if (minEl) minEl.value = '';
            if (maxEl) maxEl.value = '';
        }

        this.ledgerVisibleCount = this.ledgerPageSize;
        this.renderTransactionsPage();
    }

    resetAllLedgerFilters(options = {}) {
        this.clearLedgerSearch(true);
        this.ledgerFilters = {
            type: 'all',
            categoryId: 'all',
            walletId: 'all',
            region: 'all',
            datePreset: 'all',
            startDate: '',
            endDate: '',
            minAmount: null,
            maxAmount: null
        };

        const typeSelect = document.getElementById('filter-type-select');
        if (typeSelect) typeSelect.value = 'all';
        const catSelect = document.getElementById('filter-category-select');
        if (catSelect) catSelect.value = 'all';
        const walletSelect = document.getElementById('filter-wallet-select');
        if (walletSelect) walletSelect.value = 'all';
        const dateSelect = document.getElementById('filter-date-preset');
        if (dateSelect) dateSelect.value = 'all';
        const minInput = document.getElementById('filter-amount-min');
        if (minInput) minInput.value = '';
        const maxInput = document.getElementById('filter-amount-max');
        if (maxInput) maxInput.value = '';
        const customWrap = document.getElementById('filter-custom-date-wrap');
        if (customWrap) customWrap.style.display = 'none';
        const startInput = document.getElementById('filter-date-start');
        if (startInput) startInput.value = '';
        const endInput = document.getElementById('filter-date-end');
        if (endInput) endInput.value = '';

        this._syncLedgerRegionState();

        const panel = document.getElementById('ledger-filter-panel');
        if (panel) panel.style.display = 'none';

        this.ledgerVisibleCount = this.ledgerPageSize;
        const skipRender = (options === true) || Boolean(options && options.skipRender);
        if (!skipRender) {
            this.renderTransactionsPage();
        }
    }

    loadMoreLedger() {
        this.ledgerVisibleCount += this.ledgerPageSize;
        this.renderTransactionsPage();
    }

    // --------------------------------------------------------------------------
    // TRANSACTION DETAIL MODAL
    // --------------------------------------------------------------------------

    openTransactionDetail(id) {
        const found = walletManager.findTransaction(id);
        if (!found) return;

        const tx = found.tx;
        this.currentDetailTxId = id;

        // Elements
        const modal = document.getElementById('transaction-detail-modal');
        const badge = document.getElementById('tx-detail-type-badge');
        const dateDisplay = document.getElementById('tx-detail-date-display');
        const amountVal = document.getElementById('tx-detail-amount-val');
        const subtitle = document.getElementById('tx-detail-subtitle');
        const walletVal = document.getElementById('tx-detail-wallet-val');
        const categoryVal = document.getElementById('tx-detail-category-val');
        const categoryWrap = document.getElementById('tx-detail-category-wrap');
        const destWrap = document.getElementById('tx-detail-transfer-dest-wrap');
        const destVal = document.getElementById('tx-detail-transfer-dest-val');
        const rateWrap = document.getElementById('tx-detail-rate-wrap');
        const rateVal = document.getElementById('tx-detail-rate-val');
        const noteVal = document.getElementById('tx-detail-note-val');
        const idVal = document.getElementById('tx-detail-id-val');

        if (!modal) return;

        // Populate metadata
        if (badge) {
            badge.innerText = (tx.type || 'expense').toUpperCase();
            badge.className = `badge ${tx.type === 'income' ? 'badge-success' : tx.type === 'transfer' ? 'badge-info' : tx.type === 'remittance' ? 'badge-purple' : 'badge-danger'}`;
        }

        if (dateDisplay) {
            dateDisplay.innerText = tx.date ? this.formatLedgerDateHeader(tx.date) : '--';
        }

        if (amountVal) {
            if (tx.type === 'remittance') {
                amountVal.innerText = this.formatRemittanceAmount(tx);
            } else {
                const sign = tx.type === 'income' ? '+' : (tx.type === 'expense' ? '-' : '');
                const cur = (tx.currency === 'INR' || tx.currency === '₹' || tx.region === 'IN') ? '₹' : (tx.currency === 'EUR' || tx.currency === '€' || tx.region === 'DE') ? '€' : '¥';
                amountVal.innerText = this.formatMoney(tx.amount, cur, { prefix: sign });
            }
            amountVal.className = `tx-detail-amount-val privacy-blur ${tx.type || 'expense'}`;
        }

        const categoryName = this.getTransactionCategory(tx);

        if (subtitle) {
            if (tx.type === 'expense') {
                subtitle.innerText = categoryName;
            } else if (tx.type === 'income') {
                subtitle.innerText = categoryName !== 'Income' ? `Income • ${categoryName}` : 'Income Deposit';
            } else if (tx.type === 'transfer') {
                subtitle.innerText = 'Internal Wallet Transfer';
            } else if (tx.type === 'remittance') {
                const { srcName, dstName } = this.getRemittanceCountryNames(tx);
                subtitle.innerText = `Cross-Border Remittance (${srcName} → ${dstName})`;
            }
        }

        if (walletVal) {
            walletVal.innerText = this.getWalletName(tx.walletId || tx.sourceId);
        }

        if (tx.type === 'expense' || tx.type === 'income') {
            if (categoryWrap) categoryWrap.style.display = 'flex';
            if (categoryVal) categoryVal.innerText = categoryName;
            if (destWrap) destWrap.style.display = 'none';
            if (rateWrap) rateWrap.style.display = 'none';
        } else if (tx.type === 'transfer') {
            if (categoryWrap) categoryWrap.style.display = 'none';
            if (destWrap) {
                destWrap.style.display = 'flex';
                if (destVal) destVal.innerText = this.getWalletName(tx.destId);
            }
            if (rateWrap) rateWrap.style.display = 'none';
        } else if (tx.type === 'remittance') {
            if (categoryWrap) categoryWrap.style.display = 'none';
            if (destWrap) {
                destWrap.style.display = 'flex';
                const { dstCur } = this.getRemittanceCurrencies(tx);
                const dstFormatted = this.formatMoney(Number(tx.destAmount || 0), dstCur, { ignorePrivacy });
                if (destVal) destVal.innerText = `${this.getWalletName(tx.destId)} (${dstFormatted})`;
            }
            if (rateWrap) {
                rateWrap.style.display = 'flex';
                const { srcCur, dstCur } = this.getRemittanceCurrencies(tx);
                const srcCode = srcCur === '¥' ? 'JPY' : srcCur === '€' ? 'EUR' : srcCur === '₹' ? 'INR' : srcCur;
                const dstCode = dstCur === '¥' ? 'JPY' : dstCur === '€' ? 'EUR' : dstCur === '₹' ? 'INR' : dstCur;
                if (rateVal) rateVal.innerText = tx.exchangeRate ? `1 ${srcCode} = ${tx.exchangeRate} ${dstCode}` : '--';
            }
        } else {
            if (categoryWrap) categoryWrap.style.display = 'none';
            if (destWrap) destWrap.style.display = 'none';
            if (rateWrap) rateWrap.style.display = 'none';
        }

        if (noteVal) {
            noteVal.innerText = tx.note || 'No note recorded.';
        }

        if (idVal) {
            idVal.innerText = `#${tx.id}`;
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
    }

    closeTransactionDetail() {
        const modal = document.getElementById('transaction-detail-modal');
        if (modal) modal.classList.remove('active');
        if (typeof document !== 'undefined' && document.body && document.body.style) {
            document.body.style.overflow = '';
        }
        this.currentDetailTxId = null;
    }

    editCurrentDetailTransaction() {
        const id = this.currentDetailTxId;
        this._lastDetailTxId = id;
        this._txModalSource = 'detail';
        this.closeTransactionDetail();
        if (id) {
            this.editTransaction(id);
        }
    }

    async deleteCurrentDetailTransaction() {
        const id = this.currentDetailTxId;
        if (!id) return false;
        return await this.deleteTx(id);
    }

    exportTransactionsCsv() {
        const { activeCountries, effectiveRegion } = this._syncLedgerRegionState();
        const txs = this._getFilteredLedgerTransactions(activeCountries, effectiveRegion);
        if (!txs || txs.length === 0) {
            alert('No transactions to export.');
            return;
        }

        const escapeCsvField = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
        let csv = 'ID,Date,Type,Region,Wallet,Category,Amount,Currency,DestWallet,DestAmount,ExchangeRate,Note\n';
        txs.forEach(t => {
            const row = [
                escapeCsvField(t.id),
                escapeCsvField(t.date),
                escapeCsvField(t.type),
                escapeCsvField(t.region),
                escapeCsvField(this.getWalletName(t.walletId || t.sourceId)),
                escapeCsvField(this.getTransactionCategory(t)),
                t.amount !== undefined ? t.amount : (t.sourceAmount || 0),
                escapeCsvField(t.currency === '' ? t.sourceCurrency : (t.currency ?? t.sourceCurrency)),
                escapeCsvField(t.destId ? this.getWalletName(t.destId) : ''),
                t.destAmount || '',
                t.exchangeRate || '',
                escapeCsvField(t.note)
            ];
            csv += row.join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `expense_manager_ledger_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --------------------------------------------------------------------------
    // PART C: ANALYTICS PAGE (JAPAN & INDIA SEPARATION)
    // --------------------------------------------------------------------------

    renderAnalyticsPage() {
        const activeCountries = storage.getActiveCountries();
        const primaryCountry = storage.getPrimaryCountry();

        if (!this.analyticsCountry || !activeCountries.includes(this.analyticsCountry)) {
            this.analyticsCountry = activeCountries.includes(primaryCountry) ? primaryCountry : activeCountries[0] || 'JP';
        }

        const jpWorkspace = document.getElementById('analytics-jp-workspace');
        const inWorkspace = document.getElementById('analytics-in-workspace');
        const deWorkspace = document.getElementById('analytics-de-workspace');
        const selector = document.getElementById('analytics-country-selector');
        const tabJp = document.getElementById('analytics-tab-jp');
        const tabIn = document.getElementById('analytics-tab-in');
        const tabDe = document.getElementById('analytics-tab-de');

        if (selector) {
            if (activeCountries.length <= 1) {
                selector.style.display = 'none';
            } else {
                selector.style.display = 'flex';
                if (tabJp) {
                    tabJp.style.display = activeCountries.includes('JP') ? 'inline-flex' : 'none';
                    tabJp.classList.toggle('active', this.analyticsCountry === 'JP');
                }
                if (tabIn) {
                    tabIn.style.display = activeCountries.includes('IN') ? 'inline-flex' : 'none';
                    tabIn.classList.toggle('active', this.analyticsCountry === 'IN');
                }
                if (tabDe) {
                    tabDe.style.display = activeCountries.includes('DE') ? 'inline-flex' : 'none';
                    tabDe.classList.toggle('active', this.analyticsCountry === 'DE');
                }
            }
        }

        if (jpWorkspace) jpWorkspace.style.display = this.analyticsCountry === 'JP' ? 'flex' : 'none';
        if (inWorkspace) inWorkspace.style.display = this.analyticsCountry === 'IN' ? 'flex' : 'none';
        if (deWorkspace) deWorkspace.style.display = this.analyticsCountry === 'DE' ? 'flex' : 'none';

        if (this.analyticsCountry === 'JP') {
            this.renderJapanAnalytics();
        } else if (this.analyticsCountry === 'DE') {
            this.renderGermanyAnalytics();
        } else {
            this.renderIndiaAnalytics();
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    setAnalyticsCountry(country) {
        if (!storage.getActiveCountries().includes(country)) return;
        this.analyticsCountry = country;
        const selector = document.getElementById('analytics-country-selector');
        if (selector) {
            selector.querySelectorAll('.segment-btn').forEach(btn => {
                if (btn.getAttribute('data-region') === country) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        this.renderAnalyticsPage();
    }

    renderGermanyAnalytics() {
        const now = new Date();
        const { periodRange, transactions: deTxs } = this.getAnalyticsSelection('DE', now);
        const { label } = periodRange;

        const expenseTxs = deTxs.filter(t => t.type === 'expense');
        const totalExpenses = expenseTxs.reduce((s, t) => s + Number(t.amount || 0), 0);

        const comparison = this.compareAnalyticsPeriods('DE', deTxs, periodRange, now);
        const expenseChange = this.formatAnalyticsChange(comparison.expense);

        const kpiExpenses = document.getElementById('de-kpi-expenses');
        const kpiExpensesMeta = document.getElementById('de-kpi-expenses-meta');
        if (kpiExpenses) kpiExpenses.innerText = this.formatMoney(totalExpenses, '€');
        if (kpiExpensesMeta) {
            kpiExpensesMeta.innerHTML = `<span class="delta-neutral">${label || 'This period'}</span>`;
        }

        const weeklyAvg = this.calculateAnalyticsWeeklyAverage(deTxs, periodRange, now);
        const kpiWeeklyAvg = document.getElementById('de-kpi-weekly-avg');
        if (kpiWeeklyAvg) kpiWeeklyAvg.innerText = this.formatMoney(weeklyAvg, '€');

        const kpiComp = document.getElementById('de-kpi-comparison');
        const kpiCompMeta = document.getElementById('de-kpi-comparison-meta');
        if (kpiComp) {
            if (expenseChange) {
                const { magnitude, direction } = expenseChange;
                const sign = direction > 0 ? '+' : direction < 0 ? '-' : '';
                kpiComp.innerHTML = `<span class="${direction <= 0 ? 'text-emerald' : 'text-rose'}">${sign}${magnitude}%</span>`;
            } else {
                kpiComp.innerText = '--';
            }
        }
        if (kpiCompMeta) {
            const label = expenseChange ? comparison.label : (comparison.label ? 'No prior spending baseline' : 'No comparison available');
            kpiCompMeta.innerHTML = `<span class="text-faint">${label}</span>`;
        }

        const kpiCount = document.getElementById('de-kpi-count');
        if (kpiCount) kpiCount.innerText = String(deTxs.length);

        // Render recent German transactions list
        const recentContainer = document.getElementById('de-recent-tx-list');
        if (recentContainer) {
            const recent = expenseTxs.slice(0, 5);
            if (recent.length === 0) {
                recentContainer.innerHTML = `<p class="text-muted text-sm" style="text-align: center; padding: 24px 0;">No German expense records found for this period.</p>`;
            } else {
                recentContainer.innerHTML = recent.map(tx => this.getTransactionHtml(tx, true, true)).join('');
            }
        }
    }

    setAnalyticsPeriod(period) {
        this.analyticsPeriod = period;
        const periodCtrl = document.getElementById('analytics-period-control');
        if (periodCtrl) {
            periodCtrl.querySelectorAll('.segment-btn').forEach(btn => {
                if (btn.getAttribute('data-period') === period) btn.classList.add('active');
                else btn.classList.remove('active');
            });
        }
        this.renderAnalyticsPage();
    }

    getAnalyticsPeriodRange(period, now = new Date()) {
        const curYear = now.getFullYear();
        const curMonth = now.getMonth(); // 0-11

        if (period === 'last-month') {
            const prevMonthDate = new Date(curYear, curMonth - 1, 1);
            const y = prevMonthDate.getFullYear();
            const m = prevMonthDate.getMonth();
            const lastDay = new Date(y, m + 1, 0).getDate();
            const startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
            const endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            const priorDate = new Date(y, m - 1, 1);
            const py = priorDate.getFullYear();
            const pm = priorDate.getMonth();
            const plastDay = new Date(py, pm + 1, 0).getDate();
            const prevStartDate = `${py}-${String(pm + 1).padStart(2, '0')}-01`;
            const prevEndDate = `${py}-${String(pm + 1).padStart(2, '0')}-${String(plastDay).padStart(2, '0')}`;

            return { startDate, endDate, prevStartDate, prevEndDate, label: 'Last Month' };
        } else if (period === 'last-3-months') {
            const start3Date = new Date(curYear, curMonth - 2, 1);
            const y = start3Date.getFullYear();
            const m = start3Date.getMonth();
            const startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
            const endDate = getLocalDateString(now);

            const pstart = new Date(y, m - 3, 1);
            const pend = new Date(y, m, 0);
            const prevStartDate = `${pstart.getFullYear()}-${String(pstart.getMonth() + 1).padStart(2, '0')}-01`;
            const prevEndDate = `${pend.getFullYear()}-${String(pend.getMonth() + 1).padStart(2, '0')}-${String(pend.getDate()).padStart(2, '0')}`;

            return { startDate, endDate, prevStartDate, prevEndDate, label: 'Last 3 Months' };
        } else if (period === 'all-time') {
            return { startDate: null, endDate: getLocalDateString(now), prevStartDate: null, prevEndDate: null, label: 'All Time' };
        } else {
            // 'this-month' default
            const startDate = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-01`;
            const endDate = getLocalDateString(now);

            const prevDate = new Date(curYear, curMonth - 1, 1);
            const py = prevDate.getFullYear();
            const pm = prevDate.getMonth();
            const plastDay = new Date(py, pm + 1, 0).getDate();
            const prevStartDate = `${py}-${String(pm + 1).padStart(2, '0')}-01`;
            const prevEndDate = `${py}-${String(pm + 1).padStart(2, '0')}-${String(plastDay).padStart(2, '0')}`;

            return { startDate, endDate, prevStartDate, prevEndDate, label: 'This Month' };
        }
    }

    getAnalyticsSelection(region, now) {
        const periodRange = this.getAnalyticsPeriodRange(this.analyticsPeriod, now);
        const { startDate, endDate } = periodRange;
        const transactions = walletManager.getTransactions({ region, startDate, endDate });
        return { periodRange, transactions };
    }

    getAnalyticsUtcDay(date) {
        return getTransactionUtcDay(date);
    }

    getAnalyticsComparisonRange(period, range, now) {
        if (period === 'last-month' || !range.startDate) return range;

        const endDate = getLocalDateString(now);
        const firstDay = this.getAnalyticsUtcDay(range.startDate);
        const elapsedDays = this.getAnalyticsUtcDay(endDate) - firstDay + 1;
        const dateFromUtcDay = day => new Date(day * 86_400_000).toISOString().slice(0, 10);
        return {
            startDate: range.startDate,
            endDate,
            prevStartDate: dateFromUtcDay(firstDay - elapsedDays),
            prevEndDate: dateFromUtcDay(firstDay - 1)
        };
    }

    compareAnalyticsPeriods(region, transactions, periodRange, now) {
        const { startDate, endDate, prevStartDate, prevEndDate } = this.getAnalyticsComparisonRange(this.analyticsPeriod, periodRange, now);
        if (!prevStartDate) return { income: null, expense: null, label: null };

        const sumByType = (txs, start, end) => {
            const totals = { income: 0, expense: 0 };
            for (const tx of txs) {
                if (tx.type !== 'income' && tx.type !== 'expense') continue;
                if (!Number.isFinite(this.getAnalyticsUtcDay(tx.date)) || tx.date < start || tx.date > end) continue;
                totals[tx.type] += Number(tx.amount || 0);
            }
            return totals;
        };
        const previousTxs = walletManager.getTransactions({ region, startDate: prevStartDate, endDate: prevEndDate });
        const current = sumByType(transactions, startDate, endDate);
        const previous = sumByType(previousTxs, prevStartDate, prevEndDate);
        return {
            income: this.calculateAnalyticsPercentageChange(current.income, previous.income),
            expense: this.calculateAnalyticsPercentageChange(current.expense, previous.expense),
            label: this.analyticsPeriod === 'last-month' ? 'vs previous month' : 'vs previous equal-length period'
        };
    }

    calculateAnalyticsPercentageChange(current, previous) {
        if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
        const change = ((current - previous) / previous) * 100;
        return Number.isFinite(change) ? change : null;
    }

    formatAnalyticsChange(change) {
        if (change === null) return null;
        const magnitude = Math.abs(change).toLocaleString('en-US', {
            useGrouping: false,
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        });
        return { magnitude, direction: magnitude === '0.0' ? 0 : Math.sign(change) };
    }

    calculateAnalyticsWeeklyAverage(transactions, { startDate, endDate }, now = new Date()) {
        const today = this.getAnalyticsUtcDay(getLocalDateString(now));
        const lastDay = endDate === null ? today : Math.min(today, this.getAnalyticsUtcDay(endDate));
        const allTime = startDate === null;
        let firstDay = allTime ? Infinity : this.getAnalyticsUtcDay(startDate);
        if (!Number.isFinite(lastDay) || (!allTime && !Number.isFinite(firstDay))) return 0;

        let expenses = 0;
        for (const tx of transactions) {
            const day = this.getAnalyticsUtcDay(tx.date);
            if (!Number.isFinite(day) || day > lastDay) continue;
            if (allTime) firstDay = Math.min(firstDay, day);
            if (day < firstDay || tx.type !== 'expense') continue;

            const amount = Number(tx.amount || 0);
            if (Number.isFinite(amount)) expenses += amount;
        }

        if (firstDay > lastDay) return 0;
        const elapsedWeeks = (lastDay - firstDay + 1) / 7;
        const average = expenses / elapsedWeeks;
        return Number.isFinite(average) ? average : 0;
    }

    renderJapanAnalytics() {
        this.syncJapanAnalyticsPreferences();
        const now = new Date();
        const { periodRange, transactions: jpTxs } = this.getAnalyticsSelection('JP', now);
        const { startDate, endDate } = periodRange;

        // 1. Calculations: Income, Expenses, Savings
        const incomeTxs = jpTxs.filter(t => t.type === 'income');
        const expenseTxs = jpTxs.filter(t => t.type === 'expense');

        const totalIncome = incomeTxs.reduce((s, t) => s + Number(t.amount || 0), 0);
        const totalExpenses = expenseTxs.reduce((s, t) => s + Number(t.amount || 0), 0);

        // Analytical spending (excluding configured lifestyle categories)
        const analyticalTxs = expenseTxs.filter(t => !this.jpExclusions.has(t.categoryId));
        const analyticalExpenses = analyticalTxs.reduce((s, t) => s + Number(t.amount || 0), 0);
        const excludedDiff = totalExpenses - analyticalExpenses;

        const netSavings = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) : '0';

        const comparison = this.compareAnalyticsPeriods('JP', jpTxs, periodRange, now);
        const incomeChange = this.formatAnalyticsChange(comparison.income);
        const expenseChange = this.formatAnalyticsChange(comparison.expense);

        // 3. Update KPI Elements
        const kpiIncome = document.getElementById('jp-kpi-income');
        const kpiIncomeDelta = document.getElementById('jp-kpi-income-delta');
        if (kpiIncome) kpiIncome.innerText = this.formatMoney(totalIncome, '¥');
        if (kpiIncomeDelta) {
            if (incomeChange) {
                const { magnitude, direction } = incomeChange;
                const arrow = direction > 0 ? '↑ ' : direction < 0 ? '↓ ' : '';
                kpiIncomeDelta.innerHTML = `<span class="${direction >= 0 ? 'delta-positive' : 'delta-negative'}">${arrow}${magnitude}%</span> ${comparison.label}`;
            } else {
                kpiIncomeDelta.innerHTML = `<span class="delta-neutral">-- · ${comparison.label ? 'No prior income baseline' : 'No comparison available'}</span>`;
            }
        }

        const kpiExpenses = document.getElementById('jp-kpi-expenses');
        const kpiExpensesDelta = document.getElementById('jp-kpi-expenses-delta');
        if (kpiExpenses) kpiExpenses.innerText = this.formatMoney(totalExpenses, '¥');
        if (kpiExpensesDelta) {
            if (expenseChange) {
                const { magnitude, direction } = expenseChange;
                const arrow = direction > 0 ? '↑ ' : direction < 0 ? '↓ ' : '';
                kpiExpensesDelta.innerHTML = `<span class="${direction <= 0 ? 'delta-positive' : 'delta-negative'}">${arrow}${magnitude}%</span> ${comparison.label}`;
            } else {
                kpiExpensesDelta.innerHTML = `<span class="delta-neutral">-- · ${comparison.label ? 'No prior spending baseline' : 'No comparison available'}</span>`;
            }
        }

        const kpiSavings = document.getElementById('jp-kpi-savings');
        if (kpiSavings) {
            kpiSavings.innerText = this.formatMoney(Math.abs(netSavings), '¥', { prefix: netSavings >= 0 ? '+' : '-' });
            kpiSavings.className = `kpi-value privacy-blur${this.isPrivacyHidden ? '' : (netSavings >= 0 ? ' text-emerald' : ' text-rose')}`;
        }

        const kpiSavingsRate = document.getElementById('jp-kpi-savings-rate');
        const kpiSavingsRateMeta = document.getElementById('jp-kpi-savings-rate-meta');
        if (kpiSavingsRate) kpiSavingsRate.innerText = `${savingsRate}%`;
        if (kpiSavingsRateMeta) {
            if (Number(savingsRate) >= 20) {
                kpiSavingsRateMeta.innerHTML = `<span class="delta-positive">Healthy</span> • Target &gt; 20%`;
            } else if (Number(savingsRate) > 0) {
                kpiSavingsRateMeta.innerHTML = `<span class="text-orange">Moderate</span> • Target &gt; 20%`;
            } else {
                kpiSavingsRateMeta.innerHTML = `<span class="delta-negative">Deficit</span> • Spending exceeds income`;
            }
        }

        // 4. Update Lifestyle Exclusions Banner
        const exclusionsChips = document.getElementById('jp-exclusions-chips');
        const statTotalExpenses = document.getElementById('jp-stat-total-expenses');
        const statAnalyticalExpenses = document.getElementById('jp-stat-analytical-expenses');
        const statExcludedDiff = document.getElementById('jp-stat-excluded-diff');
        const statExcludedDiffWrap = document.getElementById('jp-stat-excluded-diff-wrap');

        if (statTotalExpenses) statTotalExpenses.innerText = this.formatMoney(totalExpenses, '¥');
        if (statAnalyticalExpenses) statAnalyticalExpenses.innerText = this.formatMoney(analyticalExpenses, '¥');
        if (statExcludedDiff) statExcludedDiff.innerText = this.formatMoney(Math.abs(excludedDiff), '¥', { prefix: excludedDiff < 0 ? '+' : '-' });
        if (statExcludedDiffWrap) statExcludedDiffWrap.style.display = excludedDiff !== 0 ? 'flex' : 'none';

        const jpCategories = new Map((storage.state?.categories?.JP || []).filter(cat => cat?.id).map(cat => [cat.id, cat]));
        if (exclusionsChips) {
            // Selectable candidate categories for lifestyle exclusion
            const candidateCats = [...jpCategories.values()].filter(c => {
                return c.id === 'jp-food' || c.id === 'jp-dining' || c.id === 'jp-shopping' ||
                    c.id === 'jp-misc' || c.id === 'jp-tax' || String(c.id).startsWith('jp-utility') || this.jpExclusions.has(c.id);
            });
            for (const id of this.jpExclusions) {
                if (!jpCategories.has(id)) candidateCats.push({ id, name: this.getCategoryName(id, 'JP') });
            }

            let chipsHtml = '';
            candidateCats.forEach(cat => {
                const isExcluded = this.jpExclusions.has(cat.id);
                chipsHtml += `
                    <button class="exclusion-pill ${isExcluded ? 'excluded' : ''}" data-category-id="${this.escapeHtml(cat.id)}" onclick="app.toggleCategoryExclusion(this.dataset.categoryId)">
                        <i data-lucide="${isExcluded ? 'x' : 'check'}" style="width: 13px; height: 13px;"></i>
                        <span>${this.escapeHtml(cat.name)}</span>
                    </button>
                `;
            });
            exclusionsChips.innerHTML = chipsHtml;
        }

        // 5. Render Spending Trend Chart
        if (typeof charts !== 'undefined' && typeof charts.renderJpSpendingTrend === 'function') {
            const trendStart = startDate || jpTxs.at(-1)?.date;
            charts.renderJpSpendingTrend(this.jpTrendGranularity, analyticalTxs, trendStart, endDate);
        }

        // 6. Category Breakdown & Ranking List
        const categoryTotals = new Map();
        for (const tx of analyticalTxs) {
            const id = jpCategories.has(tx.categoryId) ? tx.categoryId : null;
            categoryTotals.set(id, (categoryTotals.get(id) || 0) + Number(tx.amount || 0));
        }
        const activeCats = !Number.isFinite(analyticalExpenses) || analyticalExpenses === 0 ? [] : [...categoryTotals]
            .filter(([, amount]) => amount !== 0)
            .map(([id, amount]) => ({ id, name: jpCategories.get(id)?.name || 'Uncategorized / Historical', amount }))
            .sort((a, b) => b.amount - a.amount);

        const catRankingList = document.getElementById('jp-category-ranking-list');
        const catCountLabel = document.getElementById('jp-category-count-label');
        if (catCountLabel) catCountLabel.innerText = `${activeCats.length} ${activeCats.length === 1 ? 'category' : 'categories'}`;

        if (catRankingList) {
            if (activeCats.length === 0) {
                catRankingList.innerHTML = '<p class="text-muted text-sm text-center" style="padding: 24px;">No category expenses in this period.</p>';
            } else {
                const baseColors = [
                    '#3e63dd', '#bf5af2', '#34d399', '#f97316', '#06b6d4',
                    '#fb7185', '#eab308', '#9333ea', '#0ea5e9', '#f43f5e'
                ];
                let rankingHtml = '';
                activeCats.forEach((cat, idx) => {
                    const share = analyticalExpenses > 0 ? (cat.amount / analyticalExpenses) * 100 : 0;
                    const pct = analyticalExpenses > 0 ? `${share.toFixed(1).replace(/^-0\.0$/, '0.0')}%` : '--';
                    const name = this.escapeHtml(cat.name);
                    const drilldown = cat.id === null ? 'style="cursor: default"' :
                        `data-category-id="${this.escapeHtml(cat.id)}" onclick="app.openCategoryDrilldown(this.dataset.categoryId)" title="Inspect transactions for ${name}"`;
                    const color = baseColors[idx % baseColors.length];

                    rankingHtml += `
                        <div class="category-rank-row" ${drilldown}>
                            <div class="category-rank-top">
                                <div class="category-rank-info">
                                    <span class="category-dot" style="background: ${color};"></span>
                                    <span class="category-name">${name}</span>
                                </div>
                                <div class="category-amount-wrap">
                                    <span class="category-amount privacy-blur">${this.formatMoney(cat.amount, '¥')}</span>
                                    <span class="category-pct">${pct}</span>
                                </div>
                            </div>
                            <div class="category-bar-bg">
                                <div class="category-bar-fill" style="width: ${Math.min(100, Math.max(0, share))}%; background: ${color};"></div>
                            </div>
                        </div>
                    `;
                });
                catRankingList.innerHTML = rankingHtml;
            }
        }

        // Render Donut Chart
        if (typeof charts !== 'undefined' && typeof charts.renderJpCategoryDonut === 'function') {
            charts.renderJpCategoryDonut(activeCats, (cat) => this.openCategoryDrilldown(cat.id));
        }

        // 7. Category Drilldown view (if active)
        this.renderCategoryDrilldownView(analyticalTxs);

        // 8. Budget Performance
        const budgetBody = document.getElementById('jp-budget-perf-body');
        if (budgetBody) {
            const jpBudget = storage.state?.jpTotalBudget || 0;
            const remainingBudget = Math.max(0, jpBudget - totalExpenses);
            const budgetPct = jpBudget > 0 ? Math.min(100, (totalExpenses / jpBudget) * 100).toFixed(1) : 0;
            const barClass = budgetPct > 90 ? 'neon-danger' : (budgetPct > 75 ? 'neon-warn' : 'neon-safe');

            budgetBody.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <span class="text-sm text-secondary">Allocated Monthly Budget</span>
                    <span class="text-sm font-bold text-primary privacy-blur">${this.formatMoney(jpBudget, '¥')}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px;">
                    <span class="text-xs text-muted">Actual Spending: <strong class="privacy-blur text-primary">${this.formatMoney(totalExpenses, '¥')}</strong></span>
                    <span class="text-xs text-muted">Remaining: <strong class="privacy-blur text-emerald">${this.formatMoney(remainingBudget, '¥')}</strong></span>
                </div>
                <div class="neon-bar-bg" style="margin-top: 8px;">
                    <div class="neon-bar-fill ${barClass}" style="width: ${budgetPct}%"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-faint); margin-top: 4px;">
                    <span>${budgetPct}% consumed</span>
                    <span>${100 - Number(budgetPct) > 0 ? (100 - Number(budgetPct)).toFixed(1) + '% cushion' : 'Budget exhausted'}</span>
                </div>
            `;
        }

        // 9. Data-Supported Financial Observations / Insights
        const insightsList = document.getElementById('jp-insights-list');
        if (insightsList) {
            let insightsHtml = '';

            // Insight 1: Top Category
            if (analyticalExpenses > 0 && activeCats.length > 0) {
                const topCat = activeCats[0];
                const topName = this.escapeHtml(topCat.name);
                const topPct = ((topCat.amount / analyticalExpenses) * 100).toFixed(1);
                insightsHtml += `
                    <div class="insight-item">
                        <div class="insight-icon"><i data-lucide="pie-chart"></i></div>
                        <div class="insight-content">
                            <span class="insight-title">Dominant Category: ${topName}</span>
                            <p class="insight-desc">${topName} accounts for ${topPct}% of your analytical spending (<span class="privacy-blur">${this.formatMoney(topCat.amount, '¥')}</span>).</p>
                        </div>
                    </div>
                `;
            }

            // Insight 2: Spending comparison
            if (expenseChange) {
                const { magnitude, direction } = expenseChange;
                const title = direction < 0 ? 'Spending Reduced' : direction > 0 ? 'Expenditure Accelerated' : 'Spending Unchanged';
                const change = direction === 0 ? 'unchanged' : `${direction < 0 ? 'down' : 'up'} ${magnitude}%`;
                insightsHtml += `
                    <div class="insight-item">
                        <div class="insight-icon" style="color: ${direction <= 0 ? '#34d399' : '#fb7185'}; background: ${direction <= 0 ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 113, 133, 0.12)'}">
                            <i data-lucide="${direction < 0 ? 'trending-down' : direction > 0 ? 'trending-up' : 'minus'}"></i>
                        </div>
                        <div class="insight-content">
                            <span class="insight-title">${this.escapeHtml(title)}</span>
                            <p class="insight-desc">Outflows are ${change} ${comparison.label}.</p>
                        </div>
                    </div>
                `;
            }

            // Insight 3: Largest single outlay
            if (expenseTxs.length > 0) {
                const maxTx = expenseTxs.toSorted((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
                if (maxTx && Number(maxTx.amount || 0) > 0) {
                    insightsHtml += `
                        <div class="insight-item">
                            <div class="insight-icon"><i data-lucide="alert-circle"></i></div>
                            <div class="insight-content">
                                <span class="insight-title">Peak Transaction Outlay</span>
                                <p class="insight-desc">Largest single transaction was <span class="privacy-blur">${this.formatMoney(maxTx.amount, '¥')}</span> on ${this.escapeHtml(maxTx.date)} (${this.escapeHtml(maxTx.note || this.getTransactionCategory(maxTx))}).</p>
                            </div>
                        </div>
                    `;
                }
            }

            // Insight 4: Savings Rate
            insightsHtml += `
                <div class="insight-item">
                    <div class="insight-icon"><i data-lucide="piggy-bank"></i></div>
                    <div class="insight-content">
                        <span class="insight-title">Savings Rate Evaluation: ${savingsRate}%</span>
                        <p class="insight-desc">${Number(savingsRate) >= 20 ? 'Your savings rate meets target SaaS wealth-accumulation standards (>20%).' : 'Savings rate is below the recommended 20% target. Review lifestyle exclusions and discretionary spending.'}</p>
                    </div>
                </div>
            `;

            insightsList.innerHTML = insightsHtml;
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    getJapanExclusions(state) {
        return Array.isArray(state?.analyticsExclusions) ? state.analyticsExclusions : ['jp-misc'];
    }

    syncJapanAnalyticsPreferences() {
        if (this.jpAnalyticsUserId !== storage.currentUserId) {
            this.jpAnalyticsUserId = storage.currentUserId;
            this.closeCategoryDrilldown();
        }
        this.jpExclusions = new Set(this.getJapanExclusions(storage.state));
    }

    async toggleCategoryExclusion(catId) {
        const userId = storage.currentUserId;
        // Serialize clicks even when Storage uses its fallback lock.
        while (this.jpExclusionSave) await this.jpExclusionSave;
        if (storage.currentUserId !== userId) return;

        this.jpExclusionSave = storage.runExclusive(state => {
            if (storage.currentUserId !== userId) return false;
            const exclusions = new Set(this.getJapanExclusions(state));
            if (!exclusions.delete(catId)) exclusions.add(catId);
            state.analyticsExclusions = [...exclusions];
            return true;
        }).catch(error => {
            console.error('Could not save Analytics exclusions:');
            return false;
        });
        const saved = await this.jpExclusionSave === true;
        this.jpExclusionSave = null;

        if (storage.currentUserId !== userId) return;
        if (!saved) this.showToast('Could not save the category exclusion. Please try again.', 'error');
        if (this.analyticsCountry === 'JP') this.renderJapanAnalytics();
        else this.syncJapanAnalyticsPreferences();
    }

    setJpTrendGranularity(granularity) {
        this.jpTrendGranularity = granularity;
        const ctrl = document.getElementById('jp-trend-granularity-control');
        if (ctrl) {
            ctrl.querySelectorAll('.segment-btn').forEach(btn => {
                if (btn.getAttribute('data-granularity') === granularity) btn.classList.add('active');
                else btn.classList.remove('active');
            });
        }
        this.renderJapanAnalytics();
    }

    openCategoryDrilldown(catId) {
        if (catId == null || this.getJapanExclusions(storage.state).includes(catId)) return;
        this.selectedDrilldownCategoryId = catId;
        const drilldownSection = document.getElementById('jp-drilldown-section');
        if (drilldownSection) {
            drilldownSection.style.display = 'block';
            this.renderJapanAnalytics();
            if (this.selectedDrilldownCategoryId !== null) {
                drilldownSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    closeCategoryDrilldown() {
        this.selectedDrilldownCategoryId = null;
        const drilldownSection = document.getElementById('jp-drilldown-section');
        if (drilldownSection) drilldownSection.style.display = 'none';
        const listEl = document.getElementById('jp-drilldown-tx-list');
        if (listEl) listEl.replaceChildren();
    }

    renderCategoryDrilldownView(analyticalTxs) {
        const drilldownSection = document.getElementById('jp-drilldown-section');
        if (!drilldownSection || !this.selectedDrilldownCategoryId) return;
        if (this.jpExclusions.has(this.selectedDrilldownCategoryId)) {
            this.closeCategoryDrilldown();
            return;
        }

        const catName = this.getCategoryName(this.selectedDrilldownCategoryId, 'JP');
        const catTxs = analyticalTxs.filter(t => t.categoryId === this.selectedDrilldownCategoryId);

        const titleEl = document.getElementById('jp-drilldown-title');
        const subtitleEl = document.getElementById('jp-drilldown-subtitle');
        const listEl = document.getElementById('jp-drilldown-tx-list');

        if (titleEl) titleEl.innerText = `${catName} Transactions`;
        if (subtitleEl) subtitleEl.innerText = `${catTxs.length} ${catTxs.length === 1 ? 'transaction' : 'transactions'} found`;

        if (listEl) {
            if (catTxs.length === 0) {
                listEl.innerHTML = '<p class="text-muted text-sm text-center" style="padding: 16px;">No transactions recorded in this period.</p>';
            } else {
                let html = '';
                catTxs.forEach(tx => {
                    const amount = Number(tx.amount || 0);
                    const prefix = amount < 0 ? '+' : amount > 0 ? '-' : '';
                    html += `
                        <div class="ledger-tx-row" data-transaction-id="${this.escapeHtml(tx.id)}" onclick="app.openTransactionDetail(this.dataset.transactionId)">
                            <div class="ledger-tx-left">
                                <div class="tx-type-icon expense"><i data-lucide="arrow-up-right"></i></div>
                                <div class="ledger-tx-details">
                                    <div class="ledger-tx-primary-line">
                                        <span class="ledger-tx-title">${this.escapeHtml(tx.note || catName)}</span>
                                    </div>
                                    <div class="tx-meta-pills">
                                        <span class="tx-pill">${this.escapeHtml(tx.date)}</span>
                                        <span class="tx-pill">${this.escapeHtml(this.getWalletName(tx.walletId))}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="ledger-tx-right">
                                <span class="ledger-tx-amount expense privacy-blur">${this.formatMoney(Math.abs(amount), this.escapeHtml(tx.currency || '¥'), { prefix })}</span>
                            </div>
                        </div>
                    `;
                });
                listEl.innerHTML = html;
            }
        }
    }

    renderIndiaAnalytics() {
        const now = new Date();
        const { periodRange, transactions: inTxs } = this.getAnalyticsSelection('IN', now);

        const inExpenses = inTxs.filter(t => t.type === 'expense');
        const totalExpenses = inExpenses.reduce((s, t) => s + Number(t.amount || 0), 0);
        const txCount = inTxs.length;

        const weeklyAvg = this.calculateAnalyticsWeeklyAverage(inTxs, periodRange, now);

        const comparison = this.compareAnalyticsPeriods('IN', inTxs, periodRange, now);
        const expenseChange = this.formatAnalyticsChange(comparison.expense);

        // Update India KPI elements
        const kpiExpenses = document.getElementById('in-kpi-expenses');
        const kpiWeeklyAvg = document.getElementById('in-kpi-weekly-avg');
        const kpiComparison = document.getElementById('in-kpi-comparison');
        const kpiComparisonMeta = document.getElementById('in-kpi-comparison-meta');
        const kpiCount = document.getElementById('in-kpi-count');

        if (kpiExpenses) kpiExpenses.innerText = this.formatMoney(totalExpenses, '₹');
        if (kpiWeeklyAvg) kpiWeeklyAvg.innerText = this.formatMoney(weeklyAvg, '₹');
        if (kpiCount) kpiCount.innerText = txCount;

        if (kpiComparison) {
            if (expenseChange) {
                const { magnitude, direction } = expenseChange;
                const arrow = direction > 0 ? '↑ ' : direction < 0 ? '↓ ' : '';
                kpiComparison.innerHTML = `<span class="${direction <= 0 ? 'delta-positive' : 'delta-negative'}">${arrow}${magnitude}%</span>`;
            } else {
                kpiComparison.innerText = '--';
            }
        }
        if (kpiComparisonMeta) kpiComparisonMeta.innerText = expenseChange ? comparison.label : (comparison.label ? 'No prior spending baseline' : 'No comparison available');

        // Render India Weekly Spending Trend
        if (typeof charts !== 'undefined' && typeof charts.renderInSpendingTrend === 'function') {
            charts.renderInSpendingTrend(inTxs, this.analyticsPeriod);
        }

        // Render Recent India Transactions
        const recentList = document.getElementById('in-recent-tx-list');
        if (recentList) {
            const latestIndian = inTxs.slice(0, 8);
            if (latestIndian.length === 0) {
                recentList.innerHTML = '<p class="text-muted text-sm text-center" style="padding: 24px;">No Indian transactions recorded in this period.</p>';
            } else {
                let html = '';
                latestIndian.forEach(tx => {
                    let sign = tx.type === 'income' ? '+' : '-';
                    let typeCls = tx.type === 'income' ? 'income' : 'expense';
                    html += `
                        <div class="ledger-tx-row" data-transaction-id="${this.escapeHtml(tx.id)}" onclick="app.openTransactionDetail(this.dataset.transactionId)">
                            <div class="ledger-tx-left">
                                <div class="tx-type-icon ${typeCls}"><i data-lucide="${tx.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'}"></i></div>
                                <div class="ledger-tx-details">
                                    <div class="ledger-tx-primary-line">
                                        <span class="ledger-tx-title">${this.escapeHtml(tx.note || this.getTransactionCategory(tx))}</span>
                                    </div>
                                    <div class="tx-meta-pills">
                                        <span class="tx-pill">${this.escapeHtml(tx.date)}</span>
                                        <span class="tx-pill">${this.escapeHtml(this.getWalletName(tx.walletId))}</span>
                                        <span class="tx-pill">${this.escapeHtml(this.getTransactionCategory(tx))}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="ledger-tx-right">
                                <span class="ledger-tx-amount ${typeCls} privacy-blur">${this.formatMoney(tx.amount, tx.currency || '₹', { prefix: sign })}</span>
                            </div>
                        </div>
                    `;
                });
                recentList.innerHTML = html;
            }
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    viewTransactionsWithFilter(filterObj = {}) {
        const filters = (filterObj && typeof filterObj === 'object') ? filterObj : {};
        this.resetAllLedgerFilters(true);

        if (filters.search !== undefined && filters.search !== null) {
            this.ledgerSearchQuery = String(filters.search).trim();
        }

        const validTypes = ['all', 'expense', 'income', 'transfer', 'remittance'];
        const incomingType = filters.type ? String(filters.type).toLowerCase() : '';
        if (incomingType && validTypes.includes(incomingType)) {
            this.ledgerFilters.type = incomingType;
        }

        const activeCountries = this._getLedgerActiveCountries();
        const incomingRegion = filters.region ? String(filters.region).toUpperCase() : '';
        if (incomingRegion && incomingRegion !== 'ALL' && activeCountries.includes(incomingRegion) && activeCountries.length > 1) {
            this.ledgerFilters.region = incomingRegion;
        } else {
            this.ledgerFilters.region = 'all';
        }
        this._syncLedgerRegionState();

        if (filters.categoryId && filters.categoryId !== 'all') {
            let isValidCat = false;
            if (storage.state?.categories) {
                for (const reg of Object.keys(storage.state.categories)) {
                    const list = storage.state.categories[reg];
                    if (Array.isArray(list) && list.some(c => c.id === filters.categoryId)) {
                        isValidCat = true;
                        break;
                    }
                }
            }
            if (isValidCat) {
                this.ledgerFilters.categoryId = filters.categoryId;
            }
        }

        if (filters.walletId && filters.walletId !== 'all') {
            if (storage.state?.wallets && storage.state.wallets[filters.walletId]) {
                this.ledgerFilters.walletId = filters.walletId;
            }
        }

        if (filters.datePreset === 'custom' || filters.startDate || filters.endDate) {
            this.ledgerFilters.datePreset = 'custom';
            this.ledgerFilters.startDate = filters.startDate ? String(filters.startDate).trim() : '';
            this.ledgerFilters.endDate = filters.endDate ? String(filters.endDate).trim() : '';
        } else if (['today', 'week', 'month', 'prev_month'].includes(filters.datePreset)) {
            this.ledgerFilters.datePreset = filters.datePreset;
            const range = this._computeDatePresetRange(filters.datePreset);
            this.ledgerFilters.startDate = range.startDate;
            this.ledgerFilters.endDate = range.endDate;
        }

        if (filters.minAmount !== undefined && filters.minAmount !== null && filters.minAmount !== '') {
            const min = Number(filters.minAmount);
            this.ledgerFilters.minAmount = (!isNaN(min) && min >= 0) ? min : null;
        }
        if (filters.maxAmount !== undefined && filters.maxAmount !== null && filters.maxAmount !== '') {
            const max = Number(filters.maxAmount);
            this.ledgerFilters.maxAmount = (!isNaN(max) && max >= 0) ? max : null;
        }

        this.ledgerVisibleCount = this.ledgerPageSize;
        this.switchView('transactions-view');
    }

    // =========================================================================
    // PHASE 4: REPORTS WORKSPACE & SNAPSHOTS
    // =========================================================================

    isTransactionInMonth(tx, monthKey) {
        return typeof tx.date === 'string' && tx.date.slice(0, 7) === monthKey &&
            Number.isFinite(getTransactionUtcDay(tx.date));
    }

    setReportRegion(region) {
        if (!storage.getActiveCountries().includes(region)) return;
        this.reportRegion = region;
        const selector = document.getElementById('report-country-selector');
        if (selector) {
            selector.querySelectorAll('.segment-btn').forEach(btn => {
                if (btn.getAttribute('data-region') === region) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        this.renderReportsPage();
    }

    onReportMonthChange(event) {
        const val = event.target.value;
        if (val) {
            this.reportMonthKey = val;
            this.renderReportsPage();
        }
    }

    setReportCategoryFilter(filter) {
        this.reportCategoryFilter = filter;
        this.renderReportsPage();
    }

    async refreshReportSnapshot() {
        const cacheKey = `${this.reportRegion}_${this.reportMonthKey}`;
        const now = new Date().toLocaleString();

        if (!storage.state.reportSnapshots) {
            storage.state.reportSnapshots = {};
        }
        this.reportSnapshotsCache = storage.state.reportSnapshots;

        const allTxs = storage.state.transactions || [];
        const reportTxs = allTxs.filter(tx => tx.region === this.reportRegion && this.isTransactionInMonth(tx, this.reportMonthKey));
        let expTotal = 0;
        let incTotal = 0;
        reportTxs.forEach(t => {
            if (t.type === 'expense') expTotal += Number(t.amount || 0);
            else if (t.type === 'income') incTotal += Number(t.amount || 0);
        });

        if (!this.reportSnapshotsCache[cacheKey]) {
            this.reportSnapshotsCache[cacheKey] = {
                generatedAt: now,
                refreshedAt: now,
                revisionsCount: 1,
                revisions: [
                    { rev: 1, timestamp: now, txCount: reportTxs.length, totalExpense: expTotal, totalIncome: incTotal }
                ],
                log: [`Initial calculation generated at ${now} (${reportTxs.length} transactions)`]
            };
        } else {
            const entry = this.reportSnapshotsCache[cacheKey];
            entry.refreshedAt = now;
            entry.revisionsCount = (entry.revisionsCount || 1) + 1;
            entry.revisions = entry.revisions || [];
            entry.revisions.unshift({
                rev: entry.revisionsCount,
                timestamp: now,
                txCount: reportTxs.length,
                totalExpense: expTotal,
                totalIncome: incTotal
            });
            if (entry.revisions.length > 10) entry.revisions.pop();
            entry.log = entry.log || [];
            entry.log.unshift(`Refreshed from continuous ledger at ${now} (Rev ${entry.revisionsCount}, ${reportTxs.length} txs)`);
            if (entry.log.length > 10) entry.log.pop();
        }

        const cache = this.reportSnapshotsCache;
        await storage.runExclusive(async (state) => {
            state.reportSnapshots = cache;
            return true;
        });
        this.renderReportsPage();
    }

    printCurrentReport() {
        this.cancelCurrentReportPrint();
        const printContainer = document.getElementById('print-container');
        if (!printContainer) return;
        const formatMoney = (amount, currency) => this.formatMoney(amount, currency, { ignorePrivacy: true });

        const monthKey = this.reportMonthKey || (storage.state && storage.state.currentMonthKey) || new Date().toISOString().slice(0, 7);
        const region = this.reportRegion || 'JP';
        const countryCfg = typeof CountryConfig !== 'undefined' ? CountryConfig.get(region) : null;
        const currency = (countryCfg && countryCfg.currency) || (region === 'JP' ? '¥' : region === 'DE' ? '€' : '₹');
        const countryName = (countryCfg && countryCfg.name) || (region === 'JP' ? 'Japan' : region === 'DE' ? 'Germany' : 'India');
        const currencyCode = (countryCfg && countryCfg.currencyCode) || (region === 'JP' ? 'JPY' : region === 'DE' ? 'EUR' : 'INR');

        const allTxs = storage.state.transactions || [];
        const reportTxs = allTxs.filter(tx => tx.region === region && this.isTransactionInMonth(tx, monthKey));

        // 1. Calculate Financial Aggregates
        let totalIncome = 0;
        let totalExpense = 0;
        const categorySpendMap = {};
        const categoryTxCountMap = {};

        reportTxs.forEach(tx => {
            const amt = Number(tx.amount || 0);
            if (tx.type === 'income') {
                totalIncome += amt;
            } else if (tx.type === 'expense') {
                totalExpense += amt;
                const cId = tx.categoryId || 'misc';
                categorySpendMap[cId] = (categorySpendMap[cId] || 0) + amt;
                categoryTxCountMap[cId] = (categoryTxCountMap[cId] || 0) + 1;
            }
        });

        const netSavings = totalIncome - totalExpense;
        const savingsRate = totalIncome > 0 ? Math.max(0, ((netSavings / totalIncome) * 100)).toFixed(1) : '0.0';

        // 2. Budget Handling
        const isClosed = storage.state.closedMonths && storage.state.closedMonths[monthKey];
        const closedMeta = isClosed ? storage.state.closedMonths[monthKey] : null;

        let periodTotalBudget = 0;
        const periodCatBudgets = {};

        if (closedMeta) {
            periodTotalBudget = region === 'JP' ? (closedMeta.jpTotalBudget || 0) : region === 'DE' ? (closedMeta.deTotalBudget || 0) : (closedMeta.inTotalBudget || 0);
            if (closedMeta.categoriesSnapshot && closedMeta.categoriesSnapshot[region]) {
                closedMeta.categoriesSnapshot[region].forEach(c => {
                    periodCatBudgets[c.id] = c.budget || 0;
                });
            }
        } else if (monthKey === storage.state.currentMonthKey) {
            if (typeof storage.getTotalBudget === 'function') {
                periodTotalBudget = storage.getTotalBudget(region);
                if (!periodTotalBudget && region === 'IN') {
                    periodTotalBudget = (storage.state.categories?.['IN'] || []).reduce((sum, c) => sum + (c.budget || 0), 0);
                }
            } else if (region === 'JP') {
                periodTotalBudget = storage.state.jpTotalBudget || 0;
            } else if (region === 'DE') {
                periodTotalBudget = storage.state.budgets?.DE?.monthlyTotal || (storage.state.categories?.['DE'] || []).reduce((sum, c) => sum + (c.budget || 0), 0);
            } else {
                periodTotalBudget = storage.state.inTotalBudget || (storage.state.categories?.['IN'] || []).reduce((sum, c) => sum + (c.budget || 0), 0);
            }
            (storage.state.categories[region] || []).forEach(c => {
                periodCatBudgets[c.id] = c.budget || 0;
            });
        }

        const budgetPct = periodTotalBudget > 0 ? Math.min((totalExpense / periodTotalBudget) * 100, 100).toFixed(1) : 0;
        const budgetRem = periodTotalBudget - totalExpense;
        const isOverBudget = budgetRem < 0;
        const budgetBarClass = Number(budgetPct) > 90 ? 'danger' : (Number(budgetPct) > 75 ? 'warn' : 'safe');

        // 3. Snapshot Metadata
        const cacheKey = `${region}_${monthKey}`;
        const snapshotMeta = (this.reportSnapshotsCache && this.reportSnapshotsCache[cacheKey]) || {
            generatedAt: new Date().toLocaleString(),
            revisionsCount: 1
        };

        // 4. Categories & Chart Data
        const allRegionCats = (storage.state.categories && storage.state.categories[region]) || [];
        const catMap = new Map();
        allRegionCats.forEach(c => catMap.set(c.id, c));
        Object.keys(categorySpendMap).forEach(id => {
            if (!catMap.has(id)) {
                catMap.set(id, { id: id, name: this.getCategoryName(id, region), icon: 'tag' });
            }
        });

        const allCategoriesList = Array.from(catMap.values()).map(cat => {
            const spent = categorySpendMap[cat.id] || 0;
            const budgetLimit = periodCatBudgets[cat.id] || 0;
            const txCount = categoryTxCountMap[cat.id] || 0;
            const pctOfTotal = totalExpense > 0 ? ((spent / totalExpense) * 100).toFixed(1) : '0.0';
            const variance = budgetLimit > 0 ? (budgetLimit - spent) : null;
            return {
                ...cat,
                spent,
                budgetLimit,
                txCount,
                pctOfTotal,
                variance
            };
        });

        allCategoriesList.sort((a, b) => {
            if (b.spent !== a.spent) return b.spent - a.spent;
            if (b.budgetLimit !== a.budgetLimit) return b.budgetLimit - a.budgetLimit;
            return a.name.localeCompare(b.name);
        });

        const activeCategories = allCategoriesList.filter(c => c.spent > 0);

        // 5. Build HTML Structure
        const incomeCount = reportTxs.filter(t => t.type === 'income').length;
        const expenseCount = reportTxs.filter(t => t.type === 'expense').length;

        const headerHtml = `
            <div class="print-header-banner">
                <div class="print-header-left">
                    <div class="print-brand-tag">
                        ${this.getCountryFlagSvg(region, 18, 13)}
                        <span>EXPENSE MANAGER</span>
                    </div>
                    <h1 class="print-report-title">${this.escapeHtml(monthKey)} Financial Statement</h1>
                    <p class="print-report-subtitle">${countryName} Portfolio (${currencyCode} ${currency}) • Monthly Financial Snapshot & Continuous Audit</p>
                </div>
                <div class="print-header-right">
                    <span class="print-status-badge ${isClosed ? 'closed' : 'active'}">
                        ${isClosed ? '● Closed & Reconciled' : '● Active Ledger Snapshot'}
                    </span>
                    <span class="print-meta-line">Generated: ${this.escapeHtml(snapshotMeta.generatedAt || new Date().toLocaleString())} (Rev ${this.escapeHtml(snapshotMeta.revisionsCount || 1)})</span>
                    <span class="print-meta-line">${reportTxs.length} Transactions Captured</span>
                </div>
            </div>
        `;

        const kpisHtml = `
            <div class="print-kpi-grid">
                <div class="print-kpi-card">
                    <span class="print-kpi-label">Total Income</span>
                    <span class="print-kpi-value income">+${formatMoney(totalIncome, currency)}</span>
                    <span class="print-kpi-sub">${incomeCount} income credit${incomeCount === 1 ? '' : 's'}</span>
                </div>
                <div class="print-kpi-card">
                    <span class="print-kpi-label">Total Expenses</span>
                    <span class="print-kpi-value expense">-${formatMoney(totalExpense, currency)}</span>
                    <span class="print-kpi-sub">${expenseCount} expense debit${expenseCount === 1 ? '' : 's'}</span>
                </div>
                <div class="print-kpi-card">
                    <span class="print-kpi-label">Net Savings / Surplus</span>
                    <span class="print-kpi-value ${netSavings >= 0 ? 'savings-pos' : 'savings-neg'}">
                        ${netSavings >= 0 ? '+' : '-'}${formatMoney(Math.abs(netSavings), currency)}
                    </span>
                    <span class="print-kpi-sub">${netSavings >= 0 ? `${savingsRate}% savings retained` : 'Deficit spent'}</span>
                </div>
            </div>
        `;

        let budgetHtml = '';
        if (periodTotalBudget > 0) {
            budgetHtml = `
                <div class="print-budget-card">
                    <div class="print-budget-header">
                        <h3 class="print-budget-title">Monthly Budget Allocation & Performance</h3>
                        <span class="print-budget-status ${isOverBudget ? 'over' : 'safe'}">
                            ${isOverBudget ? `${formatMoney(Math.abs(budgetRem), currency)} Over Budget` : `+${formatMoney(budgetRem, currency)} Cushion Remaining`}
                        </span>
                    </div>
                    <div class="print-budget-bar-track">
                        <div class="print-budget-bar-fill ${budgetBarClass}" style="width: ${budgetPct}%;"></div>
                    </div>
                    <div class="print-budget-stats">
                        <span>Spent: <strong>${formatMoney(totalExpense, currency)}</strong> (${budgetPct}% consumed)</span>
                        <span>Monthly Limit: <strong>${formatMoney(periodTotalBudget, currency)}</strong></span>
                    </div>
                </div>
            `;
        }

        // Japan Analytics Pie Chart (rendered for Japan alone per user confirmation)
        let pieHtml = '';
        const chartId = 'print-jp-pie-chart';
        let chartData = null;

        if (region === 'JP') {
            const chartCategories = activeCategories.length > 0 ? activeCategories : [];
            const glassStyles = typeof charts !== 'undefined' && typeof charts.getGlassStyles === 'function'
                ? charts.getGlassStyles(document.createElement('canvas').getContext('2d'), Math.max(chartCategories.length, 1), 300)
                : { backgrounds: ['#3e63dd'], borders: ['#3e63dd'] };

            const legendItemsHtml = chartCategories.map((c, i) => {
                const color = glassStyles.borders[i % glassStyles.borders.length];
                return `
                    <div class="print-legend-item">
                        <div class="print-legend-left">
                            <span class="print-legend-dot" style="background: ${color};"></span>
                            <span class="print-legend-name">${this.escapeHtml(c.name)}</span>
                        </div>
                        <div class="print-legend-right">
                            <span class="print-legend-pct">${c.pctOfTotal}%</span>
                            <span class="print-legend-amt">${formatMoney(c.spent, currency)}</span>
                        </div>
                    </div>
                `;
            }).join('');

            pieHtml = `
                <div class="print-analytics-card">
                    <div class="print-section-title">
                        <span>Analytics: Expense Distribution by Category</span>
                        <span style="font-size: 11px; font-weight: 500; color: #8b8b99;">Proportional Share (${chartCategories.length} Active)</span>
                    </div>
                    <div class="print-chart-grid">
                        <div class="print-chart-visual">
                            <canvas id="${chartId}" width="380" height="380" style="width: 190px; height: 190px; display: block;"></canvas>
                        </div>
                        <div class="print-chart-legend">
                            ${chartCategories.length > 0 ? legendItemsHtml : '<p style="color:#8b8b99;font-size:12px;margin:auto;">No expense debits recorded in this period.</p>'}
                        </div>
                    </div>
                </div>
            `;

            chartData = {
                id: chartId,
                labels: chartCategories.map(c => c.name),
                data: chartCategories.map(c => c.spent),
                glassStyles: glassStyles
            };
        }

        // Category Breakdown Table
        const displayedCats = allCategoriesList.filter(c => c.spent > 0 || c.budgetLimit > 0);
        const tableRowsHtml = (displayedCats.length > 0 ? displayedCats : allCategoriesList.slice(0, 8)).map(cat => {
            const varianceHtml = cat.variance !== null
                ? (cat.variance >= 0
                    ? `<span style="color:#34d399;font-weight:600;">+${formatMoney(cat.variance, currency)}</span>`
                    : `<span style="color:#fb7185;font-weight:600;">${formatMoney(cat.variance, currency)}</span>`)
                : '<span style="color:#6b6b78;">—</span>';

            return `
                <tr>
                    <td style="font-weight: 600; color: #ffffff;">${this.escapeHtml(cat.name)}</td>
                    <td>${cat.budgetLimit > 0 ? formatMoney(cat.budgetLimit, currency) : '<span style="color:#6b6b78;">—</span>'}</td>
                    <td style="font-weight: 600;">${formatMoney(cat.spent, currency)}</td>
                    <td>${varianceHtml}</td>
                    <td style="color:#8b8b99;font-weight:600;">${cat.pctOfTotal}%</td>
                    <td style="color:#8b8b99;">${cat.txCount}</td>
                </tr>
            `;
        }).join('');

        const tableHtml = `
            <div class="print-table-card">
                <div class="print-section-title">
                    <span>Category Breakdown & Budget Cushion Audit</span>
                    <span style="font-size: 11px; font-weight: 500; color: #8b8b99;">${displayedCats.length} Categories</span>
                </div>
                <table class="print-report-table">
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Allocated Budget</th>
                            <th>Actual Spent</th>
                            <th>Variance / Cushion</th>
                            <th>% of Total</th>
                            <th>Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml || '<tr><td colspan="6" style="text-align:center;color:#8b8b99;padding:16px;">No category records.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        // Itemized Transactions
        let txsHtml = '';
        if (reportTxs.length > 0) {
            const sortedTxs = reportTxs.toSorted((a, b) => (b.date || '').localeCompare(a.date || ''));
            const groupedTxs = Object.groupBy(sortedTxs, tx => tx.date || 'Undated');

            let groupsHtml = '';
            Object.keys(groupedTxs).forEach(dateStr => {
                const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });

                const groupRowsHtml = groupedTxs[dateStr].map(tx => {
                    const isIncome = tx.type === 'income';
                    const walletName = this.getWalletName(tx.walletId) || '-';
                    const catName = this.getTransactionCategory(tx);
                    const noteText = tx.note || catName;

                    return `
                        <tr>
                            <td style="width: 25%; font-weight: 500; color: #ffffff;">${this.escapeHtml(noteText)}</td>
                            <td style="width: 25%; color: #8b8b99;">${this.escapeHtml(catName)}</td>
                            <td style="width: 25%; color: #8b8b99;">${this.escapeHtml(walletName)}</td>
                            <td style="width: 25%;" class="${isIncome ? 'tx-amount-in' : 'tx-amount-out'}">
                                ${isIncome ? '+' : '-'}${formatMoney(tx.amount, currency)}
                            </td>
                        </tr>
                    `;
                }).join('');

                groupsHtml += `
                    <div class="print-tx-group">
                        <div class="print-date-header">${formattedDate}</div>
                        <table class="print-tx-table">
                            <tbody>
                                ${groupRowsHtml}
                            </tbody>
                        </table>
                    </div>
                `;
            });

            txsHtml = `
                <div class="print-transactions-section">
                    <div class="print-section-title" style="margin-bottom: 10px;">
                        <span>Itemized Transactions Audit Ledger</span>
                        <span style="font-size: 11px; font-weight: 500; color: #8b8b99;">${reportTxs.length} Records</span>
                    </div>
                    ${groupsHtml}
                </div>
            `;
        }

        const footerHtml = `
            <div class="print-footer">
                <span>Expense Manager • Financial Statement Snapshot (${this.escapeHtml(monthKey)} • ${region})</span>
                <span>Continuous Ledger Integrity Verified • Generated ${new Date().toLocaleDateString()}</span>
            </div>
        `;

        const job = { container: printContainer, timer: null, chart: null };
        this._currentReportPrint = job;
        try {
            printContainer.innerHTML = `
                <div class="print-report-wrapper">
                    ${headerHtml}
                    ${kpisHtml}
                    ${budgetHtml}
                    ${pieHtml}
                    ${tableHtml}
                    ${txsHtml}
                    ${footerHtml}
                </div>
            `;
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                lucide.createIcons({ root: printContainer });
            }
        } catch (error) {
            this.cancelCurrentReportPrint();
            throw error;
        }

        let canvasEl;
        if (region === 'JP' && chartData && chartData.data.length > 0 && typeof Chart !== 'undefined') {
            canvasEl = document.getElementById(chartData.id);
            if (canvasEl) {
                try {
                    job.chart = new Chart(canvasEl, {
                        type: 'doughnut',
                        data: {
                            labels: chartData.labels,
                            datasets: [{
                                data: chartData.data,
                                backgroundColor: chartData.glassStyles.backgrounds,
                                borderColor: chartData.glassStyles.borders,
                                borderWidth: 1.5,
                                hoverOffset: 0
                            }]
                        },
                        options: {
                            responsive: false,
                            animation: false,
                            cutout: '70%',
                            devicePixelRatio: 2,
                            plugins: {
                                legend: { display: false },
                                tooltip: { enabled: false }
                            }
                        }
                    });
                } catch (e) {
                    job.chart = Chart.getChart?.(canvasEl);
                    canvasEl = null;
                    console.warn('[Print] Chart rendering failed:');
                }
            }
        }

        this.scheduleReportPrint(job, job.chart ? 400 : 300, () => {
            if (canvasEl && job.chart) {
                this.replacePrintCanvas(canvasEl, {
                    width: '190px', height: '190px', display: 'block', margin: '0 auto'
                });
            }
        });
    }

    replacePrintCanvas(canvas, style) {
        try {
            const image = document.createElement('img');
            image.src = canvas.toDataURL('image/png');
            Object.assign(image.style, style);
            canvas.replaceWith(image);
        } catch {
            console.warn('[Print] Canvas image unavailable.');
        }
    }

    scheduleReportPrint(job, delay, prepare = () => {}) {
        job.timer = setTimeout(() => {
            if (this._currentReportPrint !== job) return;
            prepare();
            try {
                window.print();
            } catch (error) {
                console.warn('[Print] Browser print failed:');
                if (this._currentReportPrint === job) this.cancelCurrentReportPrint();
                return;
            }
            if (this._currentReportPrint === job) {
                job.timer = setTimeout(() => {
                    if (this._currentReportPrint === job) this.cancelCurrentReportPrint();
                }, 1000);
            }
        }, delay);
    }

    cancelCurrentReportPrint() {
        const job = this._currentReportPrint;
        if (!job) return;
        this._currentReportPrint = null;
        clearTimeout(job.timer);
        for (const chart of job.charts || (job.chart ? [job.chart] : [])) {
            try {
                chart.destroy();
            } catch {
                console.warn('[Print] Chart cleanup failed.');
            }
        }
        job.container.replaceChildren();
    }

    exportReportCsv() {
        const allTxs = storage.state.transactions || [];
        const reportTxs = allTxs.filter(tx => tx.region === this.reportRegion && this.isTransactionInMonth(tx, this.reportMonthKey));

        let csv = 'Transaction ID,Date,Region,Wallet,Category,Type,Amount,Currency,Note\n';
        reportTxs.forEach(tx => {
            const catName = this.getTransactionCategory(tx);
            const walletName = this.getWalletName(tx.walletId);
            const safeNote = (tx.note || '').replace(/"/g, '""');
            csv += `"${tx.id}","${tx.date}","${tx.region}","${walletName}","${catName}","${tx.type}","${tx.amount}","${tx.currency || ''}","${safeNote}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Expense_Report_${this.reportRegion}_${this.reportMonthKey}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    renderReportsPage() {
        const activeCountries = storage.getActiveCountries();
        const primaryCountry = storage.getPrimaryCountry();

        if (!this.reportRegion || !activeCountries.includes(this.reportRegion)) {
            this.reportRegion = activeCountries.includes(primaryCountry) ? primaryCountry : activeCountries[0] || 'JP';
        }

        const selector = document.getElementById('report-country-selector');
        const tabJp = document.getElementById('report-tab-jp');
        const tabIn = document.getElementById('report-tab-in');
        const tabDe = document.getElementById('report-tab-de');

        if (selector) {
            if (activeCountries.length <= 1) {
                selector.style.display = 'none';
            } else {
                selector.style.display = 'flex';
                if (tabJp) {
                    tabJp.style.display = activeCountries.includes('JP') ? 'inline-flex' : 'none';
                    tabJp.classList.toggle('active', this.reportRegion === 'JP');
                }
                if (tabIn) {
                    tabIn.style.display = activeCountries.includes('IN') ? 'inline-flex' : 'none';
                    tabIn.classList.toggle('active', this.reportRegion === 'IN');
                }
                if (tabDe) {
                    tabDe.style.display = activeCountries.includes('DE') ? 'inline-flex' : 'none';
                    tabDe.classList.toggle('active', this.reportRegion === 'DE');
                }
            }
        }

        const allTxs = storage.state.transactions || [];
        const currency = (typeof CountryConfig !== 'undefined' && CountryConfig.get(this.reportRegion)?.currency)
            || (this.reportRegion === 'JP' ? '¥' : this.reportRegion === 'DE' ? '€' : '₹');

        // 1. Collect all available month keys (currentMonthKey + closedMonths + any dates present in ledger)
        const availableMonthsSet = new Set();
        if (storage.state.currentMonthKey) availableMonthsSet.add(storage.state.currentMonthKey);
        if (storage.state.closedMonths) {
            Object.keys(storage.state.closedMonths).forEach(m => availableMonthsSet.add(m));
        }
        allTxs.forEach(tx => {
            if (Number.isFinite(getTransactionUtcDay(tx.date))) {
                availableMonthsSet.add(tx.date.slice(0, 7));
            }
        });
        const sortedMonths = Array.from(availableMonthsSet).sort().reverse();

        // Ensure this.reportMonthKey is valid
        if (!this.reportMonthKey || !availableMonthsSet.has(this.reportMonthKey)) {
            this.reportMonthKey = sortedMonths[0] || new Date().toISOString().slice(0, 7);
        }

        // 2. Populate Month Selector dropdown
        const monthSelect = document.getElementById('report-month-select');
        if (monthSelect) {
            monthSelect.innerHTML = sortedMonths.map(m => {
                const isClosed = storage.state.closedMonths && storage.state.closedMonths[m];
                return `<option value="${this.escapeHtml(m)}" ${m === this.reportMonthKey ? 'selected' : ''}>${this.escapeHtml(m)}${isClosed ? ' [Closed]' : ''}</option>`;
            }).join('');
        }

        // 3. Filter transactions strictly by transaction date (Section 5 rule)
        const reportTxs = allTxs.filter(tx => tx.region === this.reportRegion && this.isTransactionInMonth(tx, this.reportMonthKey));

        // 4. Calculate Financial Aggregates
        let totalIncome = 0;
        let totalExpense = 0;
        const categorySpendMap = {};
        const categoryTxCountMap = {};

        reportTxs.forEach(tx => {
            const amt = Number(tx.amount || 0);
            if (tx.type === 'income') {
                totalIncome += amt;
            } else if (tx.type === 'expense') {
                totalExpense += amt;
                const cId = tx.categoryId || 'misc';
                categorySpendMap[cId] = (categorySpendMap[cId] || 0) + amt;
                categoryTxCountMap[cId] = (categoryTxCountMap[cId] || 0) + 1;
            }
        });

        const netSavings = totalIncome - totalExpense;
        const savingsRate = totalIncome > 0 ? Math.max(0, ((netSavings / totalIncome) * 100)).toFixed(1) : '0.0';

        // 5. Historical Budget Handling (Honoring Section 5: inspect data model without assumptions)
        const isClosed = storage.state.closedMonths && storage.state.closedMonths[this.reportMonthKey];
        const closedMeta = isClosed ? storage.state.closedMonths[this.reportMonthKey] : null;

        let periodTotalBudget = 0;
        let periodCatBudgets = {};
        let historicalBudgetNote = '';

        if (closedMeta) {
            // Historical closed period
            periodTotalBudget = this.reportRegion === 'JP' ? (closedMeta.jpTotalBudget || 0) : this.reportRegion === 'DE' ? (closedMeta.deTotalBudget || 0) : (closedMeta.inTotalBudget || 0);
            if (closedMeta.categoriesSnapshot && closedMeta.categoriesSnapshot[this.reportRegion]) {
                closedMeta.categoriesSnapshot[this.reportRegion].forEach(c => {
                    periodCatBudgets[c.id] = c.budget || 0;
                });
            } else {
                historicalBudgetNote = `Historical category-level budgets were not preserved for closed month ${this.reportMonthKey} in the legacy schema; recorded overall budget limit: ${this.formatMoney(periodTotalBudget, currency)}. Category totals are computed from the continuous ledger.`;
            }
        } else if (this.reportMonthKey === storage.state.currentMonthKey) {
            // Current active month
            periodTotalBudget = storage.getTotalBudget(this.reportRegion);
            (storage.state.categories?.[this.reportRegion] || []).forEach(c => {
                periodCatBudgets[c.id] = c.budget || 0;
            });
        } else {
            historicalBudgetNote = `Unclosed historical period: No archived budget record exists for month ${this.reportMonthKey}. Current spending is ledger-calculated.`;
        }

        // 6. Snapshot Timestamps & Persistent Cache
        if (!storage.state.reportSnapshots) {
            storage.state.reportSnapshots = {};
        }
        this.reportSnapshotsCache = storage.state.reportSnapshots;

        const cacheKey = `${this.reportRegion}_${this.reportMonthKey}`;
        if (!this.reportSnapshotsCache[cacheKey]) {
            const now = new Date().toLocaleString();
            this.reportSnapshotsCache[cacheKey] = {
                generatedAt: now,
                refreshedAt: now,
                revisionsCount: 1,
                revisions: [
                    { rev: 1, timestamp: now, txCount: reportTxs.length, totalExpense, totalIncome }
                ],
                log: [`Initial calculation generated at ${now} (${reportTxs.length} transactions)`]
            };
            storage.state.reportSnapshots = this.reportSnapshotsCache;
            // Kept in-memory and synchronized during mutation cycles without triggering saveData during view render
        }
        const snapshotMeta = this.reportSnapshotsCache[cacheKey];

        // 7. Render Snapshot Hero Section
        const heroEl = document.getElementById('report-snapshot-hero');
        if (heroEl) {
            const statusBadge = isClosed
                ? `<span class="report-status-badge closed"><i data-lucide="lock" style="width:12px;height:12px;"></i> Closed & Reconciled</span>`
                : `<span class="report-status-badge active"><i data-lucide="activity" style="width:12px;height:12px;"></i> Active Reporting Period</span>`;

            const incomeCount = reportTxs.filter(t => t.type === 'income').length;
            const expenseCount = reportTxs.filter(t => t.type === 'expense').length;

            heroEl.innerHTML = `
                <div class="card reports-snapshot-banner">
                    <div class="report-snapshot-header">
                        <div class="report-snapshot-title-row">
                            <div class="report-snapshot-title-group">
                                ${this.getCountryFlagSvg(this.reportRegion, 20, 15)}
                                <h2 class="reports-snapshot-title">${this.escapeHtml(this.reportMonthKey)} Financial Snapshot</h2>
                            </div>
                            <div class="report-snapshot-badge-wrap">
                                ${statusBadge}
                            </div>
                        </div>
                        <div class="report-meta-text">
                            <span class="report-meta-item">Updated: <strong>${this.escapeHtml(snapshotMeta.refreshedAt || snapshotMeta.generatedAt)}</strong>${snapshotMeta.revisionsCount && snapshotMeta.revisionsCount > 1 ? ` <span class="report-rev-tag">Rev ${this.escapeHtml(snapshotMeta.revisionsCount)}</span>` : ''}</span>
                            <span class="report-meta-dot">•</span>
                            <span class="report-meta-item">Transactions: <strong>${reportTxs.length}</strong></span>
                        </div>
                    </div>
                    ${snapshotMeta.revisions && snapshotMeta.revisions.length > 1 ? `
                        <div class="card reports-revisions-box">
                            <span style="color: var(--text-muted); font-weight: 600;">Revision History (${snapshotMeta.revisions.length} retained):</span>
                            <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 3px; color: var(--text-secondary);">
                                ${snapshotMeta.revisions.slice(0, 3).map(r => `
                                    <div>• Rev ${this.escapeHtml(r.rev)} (${this.escapeHtml(r.timestamp)}): ${this.escapeHtml(r.txCount)} txs, Spent ${this.formatMoney(r.totalExpense, currency)}</div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                <div class="reports-kpi-grid">
                    <div class="card analytics-kpi-card reports-kpi-card">
                        <div class="kpi-header">
                            <span class="kpi-title reports-kpi-label">Total Income</span>
                            <div class="kpi-icon-wrap income"><i data-lucide="arrow-down-left"></i></div>
                        </div>
                        <div class="kpi-value-row">
                            <span class="kpi-value reports-kpi-val text-emerald positive privacy-blur">${this.formatMoney(totalIncome, currency)}</span>
                        </div>
                        <div class="kpi-meta">
                            <span class="text-faint">${incomeCount} income credit${incomeCount === 1 ? '' : 's'}</span>
                        </div>
                    </div>

                    <div class="card analytics-kpi-card reports-kpi-card">
                        <div class="kpi-header">
                            <span class="kpi-title reports-kpi-label">Total Expenses</span>
                            <div class="kpi-icon-wrap expense"><i data-lucide="arrow-up-right"></i></div>
                        </div>
                        <div class="kpi-value-row">
                            <span class="kpi-value reports-kpi-val text-rose negative privacy-blur">${this.formatMoney(totalExpense, currency)}</span>
                        </div>
                        <div class="kpi-meta">
                            <span class="text-faint">${expenseCount} expense debit${expenseCount === 1 ? '' : 's'}</span>
                        </div>
                    </div>

                    <div class="card analytics-kpi-card reports-kpi-card">
                        <div class="kpi-header">
                            <span class="kpi-title reports-kpi-label">Net Savings</span>
                            <div class="kpi-icon-wrap savings"><i data-lucide="piggy-bank"></i></div>
                        </div>
                        <div class="kpi-value-row">
                            <span class="kpi-value reports-kpi-val ${netSavings >= 0 ? 'text-emerald positive' : 'text-rose negative'} privacy-blur">${this.formatMoney(netSavings, currency)}</span>
                        </div>
                        <div class="kpi-meta">
                            <span class="text-faint">${netSavings >= 0 ? 'Surplus retained' : 'Deficit spent'}</span>
                        </div>
                    </div>
                </div>

                ${periodTotalBudget > 0 ? this.getBudgetOverviewCardHtml({
                region: this.reportRegion,
                currency: currency,
                monthKey: this.reportMonthKey,
                allocatedBudget: periodTotalBudget,
                carryover: closedMeta ? (closedMeta[`${this.reportRegion}CarryoverPrior`] || 0) : 0,
                totalSpent: totalExpense,
                sumCatBudgets: Object.values(periodCatBudgets).reduce((s, b) => s + (Number(b) || 0), 0),
                title: 'Monthly Budget',
                showEditButton: false,
                isInteractive: false,
                enabled: isClosed ? (periodTotalBudget > 0) : undefined,
                cardClass: 'reports-budget-perf-card'
            }) : ''}

                ${historicalBudgetNote ? `
                    <div style="padding: 10px 14px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: var(--radius-sm); font-size: 0.78rem; color: #93c5fd; display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="info" style="width: 14px; height: 14px; flex-shrink: 0;"></i>
                        <span>${this.escapeHtml(historicalBudgetNote)}</span>
                    </div>
                ` : ''}
            `;
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        }

        // 8. Render Category Breakdown Table
        const breakdownCard = document.getElementById('report-category-breakdown-card');
        if (breakdownCard) {
            const allRegionCats = storage.state.categories[this.reportRegion] || [];

            // Collect all categories that either exist in config or have transactions
            const catMap = new Map();
            allRegionCats.forEach(c => catMap.set(c.id, c));
            Object.keys(categorySpendMap).forEach(id => {
                if (!catMap.has(id)) {
                    catMap.set(id, { id: id, name: this.getCategoryName(id, this.reportRegion), icon: 'tag' });
                }
            });

            // Convert to array with calculated values
            const allCategoriesList = Array.from(catMap.values()).map(cat => {
                const spent = categorySpendMap[cat.id] || 0;
                const budgetLimit = periodCatBudgets[cat.id] || 0;
                const txCount = categoryTxCountMap[cat.id] || 0;
                const pctOfTotal = totalExpense > 0 ? ((spent / totalExpense) * 100).toFixed(1) : '0.0';
                const variance = budgetLimit > 0 ? (budgetLimit - spent) : null;
                return {
                    ...cat,
                    spent,
                    budgetLimit,
                    txCount,
                    pctOfTotal,
                    variance
                };
            });

            // Sort descending: highest spend first, then highest budget limit, then name
            allCategoriesList.sort((a, b) => {
                if (b.spent !== a.spent) return b.spent - a.spent;
                if (b.budgetLimit !== a.budgetLimit) return b.budgetLimit - a.budgetLimit;
                return a.name.localeCompare(b.name);
            });

            const activeCategoriesCount = allCategoriesList.filter(c => c.spent > 0 || c.budgetLimit > 0).length;
            const filterMode = this.reportCategoryFilter || (activeCategoriesCount > 0 ? 'active' : 'all');

            let displayedCategories = allCategoriesList;
            if (filterMode === 'active' && activeCategoriesCount > 0) {
                displayedCategories = allCategoriesList.filter(c => c.spent > 0 || c.budgetLimit > 0);
            }

            const rowsHtml = displayedCategories.map(cat => {
                return `
                    <tr>
                        <td>
                            <div class="category-cell">
                                <div class="category-icon-box">
                                    <i data-lucide="${this.categoryIcon(cat.icon)}" style="width: 14px; height: 14px;"></i>
                                </div>
                                <span>${this.escapeHtml(cat.name)}</span>
                            </div>
                        </td>
                        <td class="privacy-blur">${cat.budgetLimit > 0 ? this.formatMoney(cat.budgetLimit, currency) : '<span class="text-muted">—</span>'}</td>
                        <td>
                            <div class="spend-cell">
                                <span class="font-bold privacy-blur">${this.formatMoney(cat.spent, currency)}</span>
                                ${cat.spent > 0 && totalExpense > 0 ? `
                                    <div class="micro-spend-track" title="${cat.pctOfTotal}% of total spend">
                                        <div class="micro-spend-fill" style="width: ${Math.min(Number(cat.pctOfTotal), 100)}%;"></div>
                                    </div>
                                ` : ''}
                            </div>
                        </td>
                        <td class="privacy-blur">
                            ${cat.variance !== null
                        ? (cat.variance >= 0
                            ? `<span class="badge-cushion">+${this.formatMoney(cat.variance, currency)}</span>`
                            : `<span class="badge-overspend">${this.formatMoney(cat.variance, currency)}</span>`)
                        : '<span class="text-muted">—</span>'}
                        </td>
                        <td><span style="font-weight: 600; color: var(--text-secondary);">${cat.pctOfTotal}%</span></td>
                        <td><span class="tx-count-pill">${cat.txCount} tx${cat.txCount === 1 ? '' : 's'}</span></td>
                    </tr>
                `;
            }).join('');

            breakdownCard.innerHTML = `
                <div class="category-breakdown-header">
                    <div>
                        <h3 class="breakdown-title">Category Expense Breakdown</h3>
                        <p class="text-xs text-muted" style="margin: 3px 0 0 0;">Budget allocation, actual debits and cushion variance</p>
                    </div>
                    <div class="breakdown-controls">
                        <div class="segmented-control" id="report-cat-filter-control">
                            <button class="segment-btn ${filterMode === 'active' ? 'active' : ''}" onclick="app.setReportCategoryFilter('active')">
                                Active (${activeCategoriesCount})
                            </button>
                            <button class="segment-btn ${filterMode === 'all' ? 'active' : ''}" onclick="app.setReportCategoryFilter('all')">
                                All (${allCategoriesList.length})
                            </button>
                        </div>
                    </div>
                </div>
                <div class="report-table-scroll">
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Allocated Budget</th>
                                <th>Actual Spent</th>
                                <th>Variance / Cushion</th>
                                <th>% of Total</th>
                                <th>Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${displayedCategories.length > 0 ? rowsHtml : `
                                <tr>
                                    <td colspan="6">
                                        <div class="report-empty-state">
                                            <div class="empty-icon-wrap"><i data-lucide="inbox"></i></div>
                                            <div style="font-weight: 600; font-size: 0.9rem;">No Active Category Expenses</div>
                                            <p class="text-muted text-xs">Switch to "All" to inspect categories with zero activity.</p>
                                        </div>
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            `;

            // 8b. Render Restored Expense Distribution Doughnut Chart (Section 3 Requirement)
            if (typeof charts !== 'undefined' && charts.renderReportExpensePie) {
                const pieBadge = document.getElementById('report-pie-period-badge');
                if (pieBadge) {
                    const pieCurrencyCode = (typeof CountryConfig !== 'undefined' && CountryConfig.get(this.reportRegion)?.currencyCode)
                        || (this.reportRegion === 'JP' ? 'JPY' : this.reportRegion === 'DE' ? 'EUR' : 'INR');
                    pieBadge.innerText = `${this.reportMonthKey} • ${pieCurrencyCode}`;
                }
                const categoriesForPie = Array.from(catMap.values());
                charts.renderReportExpensePie(categoriesForPie, categorySpendMap, currency, this.reportRegion);
            }
        }

        // 9. Render Historical Closed Months Archive
        const closedMonthsList = document.getElementById('report-closed-months-list');
        if (closedMonthsList) {
            const closedList = storage.state.closedMonths ? Object.values(storage.state.closedMonths).sort((a, b) => b.monthKey.localeCompare(a.monthKey)) : [];
            if (closedList.length === 0) {
                closedMonthsList.innerHTML = `<p class="text-muted text-sm" style="padding: 12px 0;">No closed months recorded in audit history yet. Run Monthly Closing to create your first permanent month snapshot.</p>`;
            } else {
                closedMonthsList.innerHTML = closedList.map(h => {
                    const closedTxsCount = allTxs.filter(t => this.isTransactionInMonth(t, h.monthKey)).length;
                    const closedDateFormatted = h.closedAt ? new Date(h.closedAt).toLocaleDateString() : 'Recorded';
                    return `
                        <div class="history-snapshot-item">
                            <div class="history-snapshot-left">
                                <div style="width: 36px; height: 36px; border-radius: var(--radius-md); background: rgba(16, 185, 129, 0.12); color: #34d399; display: flex; align-items: center; justify-content: center;">
                                    <i data-lucide="shield-check" style="width: 18px; height: 18px;"></i>
                                </div>
                                <div class="history-snapshot-info">
                                    <h4 style="margin: 0; font-size: 0.95rem;">${this.escapeHtml(h.label || h.monthKey)}</h4>
                                    <span class="text-xs text-muted">Closed on ${closedDateFormatted} • ${closedTxsCount} transactions captured • Overall limit: ${this.formatMoney(h.jpTotalBudget || 0, '¥')}</span>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-secondary btn-sm" data-month-key="${this.escapeHtml(h.monthKey)}" onclick="app.reportMonthKey=this.dataset.monthKey; app.renderReportsPage();" title="Inspect snapshot">
                                    <i data-lucide="eye"></i>
                                    <span>View Snapshot</span>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
        this.populateCustomReportFilters();
    }

    populateCustomReportFilters() {
        const regSelect = document.getElementById('report-custom-region');
        const walletSelect = document.getElementById('report-custom-wallet');
        const catSelect = document.getElementById('report-custom-category');
        if (!walletSelect || !catSelect) return;

        const selectedRegion = regSelect ? regSelect.value : 'ALL';
        const currentWallet = walletSelect.value || 'ALL';
        const currentCat = catSelect.value || 'ALL';

        // Wallets
        const wallets = Object.values(storage.state.wallets || {});
        const filteredWallets = selectedRegion === 'ALL'
            ? wallets
            : wallets.filter(w => w.region === selectedRegion);

        walletSelect.innerHTML = '<option value="ALL">All Wallets</option>' +
            filteredWallets.map(w => `<option value="${this.escapeHtml(w.id)}" ${w.id === currentWallet ? 'selected' : ''}>${this.escapeHtml(w.id)} (${this.escapeHtml(w.currency || (w.region === 'JP' ? '¥' : w.region === 'DE' ? '€' : '₹'))})</option>`).join('');

        // Categories
        let cats = [];
        if (selectedRegion === 'ALL') {
            const jpCats = storage.state.categories?.JP || [];
            const inCats = storage.state.categories?.IN || [];
            const deCats = storage.state.categories?.DE || [];
            const seen = new Set();
            [...jpCats, ...inCats, ...deCats].forEach(c => {
                if (!seen.has(c.id)) {
                    seen.add(c.id);
                    cats.push(c);
                }
            });
        } else {
            cats = storage.state.categories?.[selectedRegion] || [];
        }

        catSelect.innerHTML = '<option value="ALL">All Categories</option>' +
            cats.map(c => `<option value="${this.escapeHtml(c.id)}" ${c.id === currentCat ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>`).join('');
    }

    onCustomReportRegionChange() {
        this.populateCustomReportFilters();
    }

    openDatePicker(inputId) {
        const el = document.getElementById(inputId);
        if (!el) return;
        if (typeof el.showPicker === 'function') {
            try {
                el.showPicker();
                return;
            } catch (e) {
                // fall through to focus
            }
        }
        el.focus();
    }

    setCustomReportPreset(preset) {
        const startInput = document.getElementById('report-custom-start');
        const endInput = document.getElementById('report-custom-end');
        if (!startInput || !endInput) return;

        const now = new Date();
        const curYear = now.getFullYear();
        const curMonth = now.getMonth(); // 0-11
        const curDay = now.getDate();

        const formatDate = (y, m, d) => {
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        };

        let startStr = '';
        let endStr = '';

        if (preset === 'this-month') {
            startStr = formatDate(curYear, curMonth + 1, 1);
            const lastDay = new Date(curYear, curMonth + 1, 0).getDate();
            endStr = formatDate(curYear, curMonth + 1, lastDay);
        } else if (preset === 'last-month') {
            const prevMonthDate = new Date(curYear, curMonth - 1, 1);
            const py = prevMonthDate.getFullYear();
            const pm = prevMonthDate.getMonth() + 1;
            const lastDay = new Date(py, pm, 0).getDate();
            startStr = formatDate(py, pm, 1);
            endStr = formatDate(py, pm, lastDay);
        } else if (preset === 'last-90-days') {
            const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            startStr = formatDate(d90.getFullYear(), d90.getMonth() + 1, d90.getDate());
            endStr = formatDate(curYear, curMonth + 1, curDay);
        } else if (preset === 'this-year') {
            startStr = formatDate(curYear, 1, 1);
            endStr = formatDate(curYear, curMonth + 1, curDay);
        }

        startInput.value = startStr;
        endInput.value = endStr;

        const container = document.querySelector('.custom-report-presets-pills');
        if (container) {
            container.querySelectorAll('.preset-pill-btn').forEach(btn => {
                if (btn.getAttribute('data-preset') === preset) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    }

    onCustomDateManualChange() {
        const container = document.querySelector('.custom-report-presets-pills');
        if (container) {
            container.querySelectorAll('.preset-pill-btn').forEach(btn => btn.classList.remove('active'));
        }
    }

    resetCustomRangeReport() {
        const startInput = document.getElementById('report-custom-start');
        const endInput = document.getElementById('report-custom-end');
        const regSelect = document.getElementById('report-custom-region');
        const resultsEl = document.getElementById('report-custom-results');

        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
        if (regSelect) regSelect.value = 'ALL';

        const container = document.querySelector('.custom-report-presets-pills');
        if (container) {
            container.querySelectorAll('.preset-pill-btn').forEach(btn => btn.classList.remove('active'));
        }

        this.populateCustomReportFilters();

        if (resultsEl) {
            resultsEl.style.display = 'none';
            resultsEl.replaceChildren();
        }
        this.lastCustomReportData = null;
    }

    generateCustomRangeReport() {
        const startInput = document.getElementById('report-custom-start');
        const endInput = document.getElementById('report-custom-end');
        const regSelect = document.getElementById('report-custom-region');
        const walletSelect = document.getElementById('report-custom-wallet');
        const catSelect = document.getElementById('report-custom-category');
        const resultsEl = document.getElementById('report-custom-results');
        if (!startInput || !endInput || !resultsEl) return;

        const start = startInput.value;
        const end = endInput.value;
        if (!start || !end) {
            alert('Please select both a start date and an end date for the custom report range.');
            return;
        }
        if (start > end) {
            alert('Start date cannot be after end date.');
            return;
        }

        const selRegion = regSelect ? regSelect.value : 'ALL';
        const selWallet = walletSelect ? walletSelect.value : 'ALL';
        const selCategory = catSelect ? catSelect.value : 'ALL';

        const allTxs = storage.state.transactions || [];
        const customTxs = allTxs.filter(tx => {
            if (!Number.isFinite(getTransactionUtcDay(tx.date)) || tx.date < start || tx.date > end) return false;
            if (selRegion !== 'ALL' && tx.region !== selRegion) return false;
            if (selWallet !== 'ALL' && tx.walletId !== selWallet) return false;
            if (selCategory !== 'ALL' && tx.categoryId !== selCategory) return false;
            return true;
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // Separate totals by region (JP, IN, DE)
        let jpIncome = 0, jpExpense = 0;
        let inIncome = 0, inExpense = 0;
        let deIncome = 0, deExpense = 0;
        const catMap = {};

        customTxs.forEach(tx => {
            const amt = Number(tx.amount || 0);
            const reg = tx.region || (storage.state.categories?.JP?.some(c => c.id === tx.categoryId) ? 'JP' : storage.state.categories?.DE?.some(c => c.id === tx.categoryId) ? 'DE' : 'IN');
            if (reg === 'JP') {
                if (tx.type === 'income') jpIncome += amt;
                else if (tx.type === 'expense') jpExpense += amt;
            } else if (reg === 'DE') {
                if (tx.type === 'income') deIncome += amt;
                else if (tx.type === 'expense') deExpense += amt;
            } else {
                if (tx.type === 'income') inIncome += amt;
                else if (tx.type === 'expense') inExpense += amt;
            }

            if (tx.type === 'expense') {
                const cId = tx.categoryId || 'misc';
                if (!catMap[cId]) {
                    catMap[cId] = {
                        name: this.getCategoryName(cId, reg),
                        icon: (storage.state.categories?.[reg]?.find(c => c.id === cId) || {}).icon || 'tag',
                        region: reg,
                        amount: 0,
                        count: 0
                    };
                }
                catMap[cId].amount += amt;
                catMap[cId].count++;
            }
        });

        const sortedCats = Object.values(catMap).sort((a, b) => b.amount - a.amount);

        this.lastCustomReportData = {
            startDate: start,
            endDate: end,
            region: selRegion,
            wallet: selWallet,
            category: selCategory,
            transactions: customTxs,
            jpIncome,
            jpExpense,
            jpNet: jpIncome - jpExpense,
            inIncome,
            inExpense,
            inNet: inIncome - inExpense,
            deIncome,
            deExpense,
            deNet: deIncome - deExpense,
            categories: sortedCats
        };

        const hasJp = (selRegion === 'ALL' || selRegion === 'JP');
        const hasIn = (selRegion === 'ALL' || selRegion === 'IN');
        const hasDe = (selRegion === 'DE') || (selRegion === 'ALL' && (deIncome > 0 || deExpense > 0 || customTxs.some(t => t.region === 'DE')));

        const fmtMoney = (val, cur) => this.formatMoney(val, cur, { ignorePrivacy: true });
        const renderCustomRegionKpi = (code, inc, exp) => {
            const cfg = typeof CountryConfig !== 'undefined' ? CountryConfig.get(code) : null;
            const cur = (cfg && cfg.currency) || (code === 'JP' ? '¥' : code === 'DE' ? '€' : '₹');
            const name = (cfg && cfg.name) || (code === 'JP' ? 'Japan' : code === 'DE' ? 'Germany' : 'India');
            const curCode = (cfg && cfg.currencyCode) || (code === 'JP' ? 'JPY' : code === 'DE' ? 'EUR' : 'INR');
            return `
                <div style="background: rgba(255, 255, 255, 0.02); padding: 12px 16px; border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06); display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${this.getCountryFlagSvg(code, 16, 12)}
                        <strong style="font-size: 0.85rem;">${name} (${curCode} ${cur})</strong>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                        <div>
                            <span class="text-xs text-muted">Income</span>
                            <div class="font-bold text-success font-numeric" style="font-size: 1.05rem;">${fmtMoney(inc, cur)}</div>
                        </div>
                        <div>
                            <span class="text-xs text-muted">Expenses</span>
                            <div class="font-bold text-danger font-numeric" style="font-size: 1.05rem;">${fmtMoney(exp, cur)}</div>
                        </div>
                        <div>
                            <span class="text-xs text-muted">Net Surplus</span>
                            <div class="font-bold ${inc - exp >= 0 ? 'text-success' : 'text-danger'} font-numeric" style="font-size: 1.05rem;">${fmtMoney(inc - exp, cur)}</div>
                        </div>
                    </div>
                </div>
            `;
        };

        let kpiHtml = '';
        if (hasJp) kpiHtml += renderCustomRegionKpi('JP', jpIncome, jpExpense);
        if (hasIn) kpiHtml += renderCustomRegionKpi('IN', inIncome, inExpense);
        if (hasDe) kpiHtml += renderCustomRegionKpi('DE', deIncome, deExpense);

        let catBreakdownHtml = '';
        if (sortedCats.length > 0) {
            catBreakdownHtml = `
                <div style="margin-top: 10px;">
                    <h5 style="margin: 0 0 8px 0; font-size: 0.86rem; font-weight: 600; color: var(--text-secondary);">Category Breakdown</h5>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${sortedCats.slice(0, 8).map(c => {
                const cur = (typeof CountryConfig !== 'undefined' && CountryConfig.get(c.region)?.currency)
                    || (c.region === 'JP' ? '¥' : c.region === 'DE' ? '€' : '₹');
                const regTotalExp = c.region === 'JP' ? jpExpense : c.region === 'DE' ? deExpense : inExpense;
                const share = regTotalExp > 0 ? Math.round((c.amount / regTotalExp) * 100) : 0;
                return `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.04); font-size: 0.82rem;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <i data-lucide="${this.categoryIcon(c.icon)}" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
                                        <span>${this.escapeHtml(c.name)}</span>
                                        <span class="text-xs text-muted">(${c.count} txs)</span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="text-xs text-muted font-numeric">${share}%</span>
                                        <strong class="font-numeric">${fmtMoney(c.amount, cur)}</strong>
                                    </div>
                                </div>
                            `;
            }).join('')}
                    </div>
                </div>
            `;
        }

        resultsEl.style.display = 'block';
        resultsEl.innerHTML = `
            <div style="padding: 18px 20px; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--radius-lg); display: flex; flex-direction: column; gap: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
                    <div>
                        <h4 style="margin: 0; font-size: 1.02rem; font-weight: 600;">Statement: ${this.escapeHtml(start)} to ${this.escapeHtml(end)}</h4>
                        <span class="text-xs text-muted">Filtered: Region ${selRegion} • Wallet ${selWallet} • Category ${selCategory}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="report-status-badge active" style="font-size: 0.74rem;">${customTxs.length} transactions included</span>
                        <button class="btn btn-secondary btn-sm" id="btn-custom-report-pdf" onclick="app.exportCustomReportPdf()" title="Download PDF Statement">
                            <i data-lucide="file-down"></i>
                            <span>Download PDF</span>
                        </button>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${kpiHtml}
                </div>

                ${catBreakdownHtml}
            </div>
        `;

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    exportCustomReportPdf() {
        if (!this.lastCustomReportData) {
            alert('Please generate a custom report first before exporting.');
            return;
        }

        const data = this.lastCustomReportData;
        const printContainer = document.getElementById('print-container');
        if (!printContainer) return;

        this.cancelCurrentReportPrint();
        const fmt = (val, cur) => this.formatMoney(val, cur, { ignorePrivacy: true });

        let sectionsHtml = '';
        const renderPdfRegionSection = (code, txs, inc, exp, net, isSubsequent) => {
            const cfg = typeof CountryConfig !== 'undefined' ? CountryConfig.get(code) : null;
            const cur = (cfg && cfg.currency) || (code === 'JP' ? '¥' : code === 'DE' ? '€' : '₹');
            const name = (cfg && cfg.name) || (code === 'JP' ? 'Japan' : code === 'DE' ? 'Germany' : 'India');
            const curCode = (cfg && cfg.currencyCode) || (code === 'JP' ? 'JPY' : code === 'DE' ? 'EUR' : 'INR');
            return `
                <div class="print-page-section ${isSubsequent ? 'print-page-break' : ''}" style="margin-top: ${isSubsequent ? '40px' : '0'};">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 16px;">
                        <h2 style="margin: 0; font-size: 1.3rem; color: #fff;">${name} Portfolio (${curCode} ${cur})</h2>
                        <span style="font-size: 0.85rem; color: #aaa;">${txs.length} Transactions</span>
                    </div>
                    <div class="print-summary" style="margin-bottom: 20px;">
                        <div class="print-summary-item">
                            <span>Total Income</span>
                            <strong style="color: #34d399;">${fmt(inc, cur)}</strong>
                        </div>
                        <div class="print-summary-item">
                            <span>Total Expenses</span>
                            <strong style="color: #fb7185;">${fmt(exp, cur)}</strong>
                        </div>
                        <div class="print-summary-item">
                            <span>Net Position</span>
                            <strong style="color: ${net >= 0 ? '#34d399' : '#fb7185'};">${fmt(net, cur)}</strong>
                        </div>
                    </div>

                    <table class="print-table" style="margin-bottom: 30px;">
                        <thead>
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.2); text-align: left;">
                                <th style="padding: 8px;">Date</th>
                                <th style="padding: 8px;">Wallet</th>
                                <th style="padding: 8px;">Category</th>
                                <th style="padding: 8px;">Note</th>
                                <th style="padding: 8px; text-align: right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${txs.map(t => `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                                    <td style="padding: 6px 8px;">${this.escapeHtml(t.date)}</td>
                                    <td style="padding: 6px 8px;">${this.escapeHtml(t.walletId || '-')}</td>
                                    <td style="padding: 6px 8px;">${this.escapeHtml(this.getTransactionCategory(t))}</td>
                                    <td style="padding: 6px 8px; color: #aaa;">${this.escapeHtml(t.note || '-')}</td>
                                    <td style="padding: 6px 8px; text-align: right; font-weight: 600; color: ${t.type === 'income' ? '#34d399' : '#ffffff'};">
                                        ${t.type === 'income' ? '+' : '-'}${fmt(t.amount, cur)}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        };

        let sectionCount = 0;
        if (data.region === 'ALL' || data.region === 'JP') {
            const jpTxs = data.transactions.filter(t => t.region === 'JP' || (!t.region && storage.state.categories?.JP?.some(c => c.id === t.categoryId)));
            sectionsHtml += renderPdfRegionSection('JP', jpTxs, data.jpIncome, data.jpExpense, data.jpNet, sectionCount > 0);
            sectionCount++;
        }
        if (data.region === 'ALL' || data.region === 'IN') {
            const inTxs = data.transactions.filter(t => t.region === 'IN' || (!t.region && storage.state.categories?.IN?.some(c => c.id === t.categoryId)));
            sectionsHtml += renderPdfRegionSection('IN', inTxs, data.inIncome, data.inExpense, data.inNet, sectionCount > 0);
            sectionCount++;
        }
        const deTxs = data.transactions.filter(t => t.region === 'DE' || (!t.region && storage.state.categories?.DE?.some(c => c.id === t.categoryId)));
        if (data.region === 'DE' || (data.region === 'ALL' && deTxs.length > 0)) {
            sectionsHtml += renderPdfRegionSection('DE', deTxs, data.deIncome || 0, data.deExpense || 0, data.deNet || 0, sectionCount > 0);
            sectionCount++;
        }

        const now = new Date().toLocaleString();
        const job = { container: printContainer, timer: null };
        this._currentReportPrint = job;
        try {
            printContainer.innerHTML = `
            <div class="print-header">
                <h1>Expense Manager Statement</h1>
                <p>Statement Period: <strong>${this.escapeHtml(data.startDate)}</strong> to <strong>${this.escapeHtml(data.endDate)}</strong> • Scope: ${this.escapeHtml(data.region)} (${this.escapeHtml(data.wallet)} / ${this.escapeHtml(data.category)})</p>
                <p style="font-size: 0.78rem; color: #888; margin-top: 4px;">Generated on ${now} • Continuous Ledger Audit Snapshot</p>
            </div>
            ${sectionsHtml}
        `;

            this.refreshIcons(printContainer);
        } catch (error) {
            this.cancelCurrentReportPrint();
            throw error;
        }
        this.scheduleReportPrint(job, 300);
    }

    // =========================================================================
    // PHASE 4: GUIDED MONTHLY CLOSING WORKFLOW (5-STEP SEQUENCE)
    // =========================================================================

    openClosingWizard() {
        const curMonth = (storage.state && storage.state.currentMonthKey) || new Date().toISOString().slice(0, 7);
        if (walletManager.isMonthClosed(curMonth)) {
            alert(`Month ${curMonth} is already closed and sealed. Duplicate closing operations are prevented.`);
            return;
        }

        const [y, m] = curMonth.split('-').map(Number);
        const nextDate = new Date(Date.UTC(y, m, 1));
        const nextMonthKey = nextDate.toISOString().slice(0, 7);

        this.closingWizardState = {
            step: 1,
            monthKey: curMonth,
            nextMonthKey: nextMonthKey,
            budgetOption: 'copy',
            adjustmentPercent: 0,
            customJpBudget: storage.state.jpTotalBudget || 0,
            customCatBudgets: {}
        };

        const modal = document.getElementById('closing-wizard-modal');
        if (modal) {
            modal.classList.add('active');
            this.setClosingStep(1);
        }
    }

    // =========================================================================
    // Budget Recovery & Reconciliation Handlers
    // =========================================================================

    updateBudgetRecoveryBanner() {
        const banner = document.getElementById('budget-recovery-banner');
        if (!banner) return;
        const status = (typeof storage !== 'undefined') ? storage.getBudgetRecoveryStatus() : 'RESOLVED';
        if (status === 'BUDGET_RECOVERY_REQUIRED') {
            banner.style.display = 'flex';
            const desc = document.getElementById('recovery-banner-desc');
            const unfinalized = storage.unfinalizedMonths || [];
            if (desc && unfinalized.length > 0) {
                desc.textContent = `Unfinalized accounting months detected (${unfinalized.join(', ')}). New transactions are paused until budget history is reconciled.`;
            }
        } else {
            banner.style.display = 'none';
        }
    }

    openBudgetRecoveryModal() {
        const modal = document.getElementById('budget-recovery-modal');
        if (!modal) return;
        if (!this.budgetRecoveryState.preview) {
            this.budgetRecoveryState.preview = storage.getBudgetRecoveryPreview(
                this.budgetRecoveryState.option,
                this.budgetRecoveryState.customAdjustments
            );
        }
        this.renderBudgetRecoveryModal();
        modal.classList.add('active');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    closeBudgetRecoveryModal() {
        const modal = document.getElementById('budget-recovery-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.updateBudgetRecoveryBanner();
    }

    setBudgetRecoveryOption(option) {
        if (!['review', 'continue', 'fresh'].includes(option)) return;
        this.budgetRecoveryState.option = option;
        this.budgetRecoveryState.preview = storage.getBudgetRecoveryPreview(
            option,
            this.budgetRecoveryState.customAdjustments
        );
        this.renderBudgetRecoveryModal();
    }

    onRecoveryAdjustmentChange(monthKey, countryCode, field, value) {
        if (!this.budgetRecoveryState.customAdjustments[monthKey]) {
            this.budgetRecoveryState.customAdjustments[monthKey] = {};
        }
        if (!this.budgetRecoveryState.customAdjustments[monthKey][countryCode]) {
            this.budgetRecoveryState.customAdjustments[monthKey][countryCode] = {};
        }
        if (field === 'baseBudget') {
            const num = Math.max(0, Number(value) || 0);
            this.budgetRecoveryState.customAdjustments[monthKey][countryCode].baseBudget = num;
        } else if (field === 'rolloverEnabled') {
            this.budgetRecoveryState.customAdjustments[monthKey][countryCode].rolloverEnabled = Boolean(value);
        }

        // Recalculate preview
        this.budgetRecoveryState.preview = storage.getBudgetRecoveryPreview(
            'review',
            this.budgetRecoveryState.customAdjustments
        );
        this.renderBudgetRecoveryModal();
    }

    renderBudgetRecoveryModal() {
        const contentEl = document.getElementById('budget-recovery-content');
        if (!contentEl) return;

        const preview = this.budgetRecoveryState.preview || storage.getBudgetRecoveryPreview(
            this.budgetRecoveryState.option,
            this.budgetRecoveryState.customAdjustments
        );
        this.budgetRecoveryState.preview = preview;

        const unfinalized = preview.unfinalizedMonths || [];
        const option = this.budgetRecoveryState.option;

        const periodLabel = (unfinalized.length > 0)
            ? `${unfinalized[0]} – ${unfinalized[unfinalized.length - 1]} (${unfinalized.length} month${unfinalized.length > 1 ? 's' : ''})`
            : 'No unfinalized months';

        let html = '';

        // Period chip
        html += `
            <div class="recovery-period-chip">
                <div class="recovery-period-info">
                    <i data-lucide="calendar" style="width: 16px; height: 16px; color: #94a3b8;"></i>
                    <span>Unfinalized Accounting Period: <strong>${this.escapeHtml(periodLabel)}</strong></span>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    ${this.getCountryFlagSvg('JP')}
                    ${this.getCountryFlagSvg('IN')}
                    ${this.getCountryFlagSvg('DE')}
                </div>
            </div>
        `;

        // 3 Recovery Option Cards
        html += `
            <div class="recovery-options-group">
                <div class="recovery-option-card ${option === 'review' ? 'active' : ''}" onclick="app.setBudgetRecoveryOption('review')">
                    <div class="recovery-opt-title">
                        <i data-lucide="sliders" style="width: 14px; height: 14px;"></i>
                        <span>Review Missed Months</span>
                    </div>
                    <div class="recovery-opt-desc">
                        (Recommended) Inspect and adjust recurring base budgets and rollover flags per month.
                    </div>
                </div>

                <div class="recovery-option-card ${option === 'continue' ? 'active' : ''}" onclick="app.setBudgetRecoveryOption('continue')">
                    <div class="recovery-opt-title">
                        <i data-lucide="fast-forward" style="width: 14px; height: 14px;"></i>
                        <span>Continue Previous</span>
                    </div>
                    <div class="recovery-opt-desc">
                        Apply previous recurring budget settings to missing months in chronological order.
                    </div>
                </div>

                <div class="recovery-option-card ${option === 'fresh' ? 'active' : ''}" onclick="app.setBudgetRecoveryOption('fresh')">
                    <div class="recovery-opt-title">
                        <i data-lucide="sparkles" style="width: 14px; height: 14px;"></i>
                        <span>Start Fresh</span>
                    </div>
                    <div class="recovery-opt-desc">
                        Seal missing months with zero budget and zero carryover. Active month starts clean.
                    </div>
                </div>
            </div>
        `;

        // Month-by-month details
        html += `<div class="recovery-months-list">`;
        preview.monthsPreview.forEach(m => {
            html += `
                <div class="recovery-month-block">
                    <div class="recovery-month-header">
                        <span class="recovery-month-label">${this.escapeHtml(m.monthKey)}</span>
                        <span style="font-size:0.72rem;color:#94a3b8;">Accounting Closure Preview</span>
                    </div>
            `;

            ['JP', 'IN', 'DE'].forEach(code => {
                const c = m.countries[code];
                if (!c || !c.isConfigured) return;
                const sym = (code === 'JP') ? '¥' : (code === 'IN') ? '₹' : '€';

                html += `
                    <div class="recovery-country-row">
                        <div class="recovery-country-label">
                            ${this.getCountryFlagSvg(code, 16, 12)}
                            <span>${code} (${sym})</span>
                        </div>
                        <div>
                            <div style="font-size:0.7rem;color:#94a3b8;margin-bottom:2px;display:flex;align-items:center;gap:6px;">
                                <span>Base Budget</span>
                                ${this.getProvenanceBadge(c.provenance)}
                            </div>
                            ${option === 'review' ? `
                                <input type="number" class="recovery-input-budget" value="${this.escapeHtml(c.baseBudget)}"
                                    onchange="app.onRecoveryAdjustmentChange('${m.monthKey}', '${code}', 'baseBudget', this.value)">
                            ` : `
                                <span style="font-weight:500;color:#f8fafc;">${sym} ${c.baseBudget.toLocaleString()}</span>
                            `}
                        </div>
                        <div>
                            <div style="font-size:0.7rem;color:#94a3b8;margin-bottom:2px;">Expenses Spent</div>
                            <span style="font-weight:500;color:#f43f5e;">${sym} ${c.spent.toLocaleString()}</span>
                        </div>
                        <div>
                            <div style="font-size:0.7rem;color:#94a3b8;margin-bottom:2px;">Prior Inflow</div>
                            <span style="font-weight:500;color:#94a3b8;">${sym} ${c.carryoverPrior.toLocaleString()}</span>
                        </div>
                        <div>
                            <div style="font-size:0.7rem;color:#94a3b8;margin-bottom:2px;">Rollover Out</div>
                            <span style="font-weight:600;color:#34d399;">+ ${sym} ${c.rolloverAdded.toLocaleString()}</span>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        });
        html += `</div>`;

        // Active Month Result
        const activeSummary = preview.activeMonthSummary;
        html += `
            <div class="recovery-active-preview">
                <div class="recovery-active-header">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <i data-lucide="check-circle-2" style="width:16px;height:16px;"></i>
                        <span>Result for Active Month (${this.escapeHtml(activeSummary.monthKey)})</span>
                    </div>
                    <span style="font-size:0.72rem;color:#93c5fd;">Calculated available budget</span>
                </div>
                <div class="recovery-active-grid">
        `;

        ['JP', 'IN', 'DE'].forEach(code => {
            const c = activeSummary.countries[code];
            if (!c || !c.isConfigured) return;
            const sym = (code === 'JP') ? '¥' : (code === 'IN') ? '₹' : '€';
            html += `
                <div class="recovery-active-col">
                    <div class="recovery-active-label">${code} Available:</div>
                    <div class="recovery-active-val">${sym} ${c.totalAvailable.toLocaleString()}</div>
                    <div style="font-size:0.68rem;color:#94a3b8;">Base ${sym}${c.baseBudget.toLocaleString()} + Rollover ${sym}${c.carryover.toLocaleString()}</div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        contentEl.innerHTML = html;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    getProvenanceBadge(prov) {
        switch (prov) {
            case 'user_confirmed_adjustment':
                return '<span class="recovery-prov-badge" style="font-size:0.65rem;padding:2px 6px;border-radius:4px;background:rgba(59,130,246,0.15);color:#93c5fd;border:1px solid rgba(59,130,246,0.3);font-weight:500;">User Confirmed</span>';
            case 'prior_closed_snapshot':
                return '<span class="recovery-prov-badge" style="font-size:0.65rem;padding:2px 6px;border-radius:4px;background:rgba(168,85,247,0.15);color:#d8b4fe;border:1px solid rgba(168,85,247,0.3);font-weight:500;">Prior Snapshot</span>';
            case 'explicit_zero_budget':
                return '<span class="recovery-prov-badge" style="font-size:0.65rem;padding:2px 6px;border-radius:4px;background:rgba(148,163,184,0.15);color:#cbd5e1;border:1px solid rgba(148,163,184,0.3);font-weight:500;">Explicit Zero</span>';
            case 'reused_active_setting':
            default:
                return '<span class="recovery-prov-badge" style="font-size:0.65rem;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,0.15);color:#6ee7b7;border:1px solid rgba(16,185,129,0.3);font-weight:500;">Active Setting</span>';
        }
    }

    showToast(message, type = 'info') {
        let container = document.getElementById('app-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'app-toast-container';
            container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        const bg = type === 'error' ? 'rgba(239, 68, 68, 0.95)' : type === 'warning' ? 'rgba(245, 158, 11, 0.95)' : type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(15, 23, 42, 0.95)';
        const border = type === 'error' ? 'rgba(248, 113, 113, 0.4)' : type === 'warning' ? 'rgba(251, 191, 36, 0.4)' : type === 'success' ? 'rgba(52, 211, 153, 0.4)' : 'rgba(59, 130, 246, 0.4)';
        toast.style.cssText = `background:${bg};color:#ffffff;border:1px solid ${border};padding:12px 18px;border-radius:8px;font-size:0.85rem;box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);pointer-events:auto;transition:all 0.3s ease;transform:translateY(10px);opacity:0;max-width:380px;line-height:1.4;`;
        toast.textContent = message;
        container.appendChild(toast);
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                toast.style.transform = 'translateY(0)';
                toast.style.opacity = '1';
            });
        } else {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        }
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    async confirmBudgetRecovery() {
        const preview = this.budgetRecoveryState.preview || storage.getBudgetRecoveryPreview(
            this.budgetRecoveryState.option,
            this.budgetRecoveryState.customAdjustments
        );

        const result = await storage.runExclusive(async () => {
            return storage.commitBudgetRecovery(
                this.budgetRecoveryState.option,
                this.budgetRecoveryState.customAdjustments,
                preview?.stateToken
            );
        });

        if (result && result.success) {
            this.closeBudgetRecoveryModal();
            this.updateBudgetRecoveryBanner();
            this.renderAll();
            this.showToast(`Budget history successfully reconciled for ${result.reconciledMonths.join(', ')}.`);
        } else {
            if (result?.conflict) {
                this.showToast(`Financial state changed in another session. Recovery preview refreshed.`, 'warning');
            } else {
                this.showToast(`Reconciliation could not be applied: ${result?.error || 'Unknown error'}`, 'error');
            }
            this.budgetRecoveryState.preview = storage.getBudgetRecoveryPreview(
                this.budgetRecoveryState.option,
                this.budgetRecoveryState.customAdjustments
            );
            this.renderBudgetRecoveryModal();
        }
    }

    closeClosingWizard() {
        const modal = document.getElementById('closing-wizard-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    setClosingStep(step) {
        if (step < 1 || step > 5) return;
        this.closingWizardState.step = step;

        // Update pills
        for (let i = 1; i <= 5; i++) {
            const pill = document.getElementById(`closing-pill-${i}`);
            if (pill) {
                pill.className = 'closing-step-pill';
                if (i === step) {
                    pill.classList.add('active');
                } else if (i < step) {
                    pill.classList.add('completed');
                }
            }
        }

        // Update navigation buttons
        const prevBtn = document.getElementById('closing-btn-prev');
        const nextBtn = document.getElementById('closing-btn-next');
        const confirmBtn = document.getElementById('closing-btn-confirm');

        if (prevBtn) prevBtn.style.display = (step === 1) ? 'none' : 'inline-flex';
        if (nextBtn) nextBtn.style.display = (step === 5) ? 'none' : 'inline-flex';
        if (confirmBtn) confirmBtn.style.display = (step === 5) ? 'inline-flex' : 'none';

        // Render step content
        const contentEl = document.getElementById('closing-step-content');
        if (!contentEl) return;

        const curMonth = this.closingWizardState.monthKey;
        const nextMonth = this.closingWizardState.nextMonthKey;
        const monthKeyPattern = /^\d{4}-(?:0[1-9]|1[0-2])$/;
        if (!monthKeyPattern.test(curMonth) || !monthKeyPattern.test(nextMonth)) {
            contentEl.textContent = 'The closing period is invalid.';
            return;
        }
        const allTxs = storage.state.transactions || [];
        const monthTxs = allTxs.filter(t => this.isTransactionInMonth(t, curMonth));

        let monthIncome = 0;
        let monthExpense = 0;
        monthTxs.forEach(t => {
            const amt = Number(t.amount || 0);
            if (t.type === 'income') monthIncome += amt;
            else if (t.type === 'expense') monthExpense += amt;
        });

        if (step === 1) {
            // STEP 1: Review Monthly Financial Summary
            contentEl.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    <div style="padding: 14px 18px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: var(--radius-md);">
                        <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; color: #93c5fd;">Step 1: Review Closing Period Summary (${this.escapeHtml(curMonth)})</h4>
                        <p class="text-xs text-muted" style="margin: 0;">Review financial performance before proceeding with the closing reconciliation.</p>
                    </div>

                    <div class="closing-stats-grid">
                        <div style="background: rgba(255, 255, 255, 0.02); padding: 12px; border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.05);">
                            <span class="text-xs text-muted">Total Recorded Income</span>
                            <div class="font-bold text-success privacy-blur" style="font-size: 1.1rem; margin-top: 4px;">${this.formatMoney(monthIncome, '¥')}</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.02); padding: 12px; border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.05);">
                            <span class="text-xs text-muted">Total Recorded Expenses</span>
                            <div class="font-bold text-danger privacy-blur" style="font-size: 1.1rem; margin-top: 4px;">${this.formatMoney(monthExpense, '¥')}</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.02); padding: 12px; border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.05);">
                            <span class="text-xs text-muted">Period Net Retained</span>
                            <div class="font-bold ${monthIncome - monthExpense >= 0 ? 'text-success' : 'text-danger'} privacy-blur" style="font-size: 1.1rem; margin-top: 4px;">${this.formatMoney(monthIncome - monthExpense, '¥')}</div>
                        </div>
                    </div>

                    <div style="padding: 12px; background: rgba(0, 0, 0, 0.2); border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--text-secondary);">
                        Total <strong>${monthTxs.length}</strong> transactions recorded in month <code>${this.escapeHtml(curMonth)}</code> will be sealed into the audit snapshot.
                    </div>
                </div>
            `;
        } else if (step === 2) {
            // STEP 2: Confirm Wallet Closing Balances (Continuous Carry-Forward)
            const wallets = Object.values(storage.state.wallets || {});
            const walletRows = wallets.map(w => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.05);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${this.getCountryFlagSvg(w.region, 18, 13.5)}
                        <strong style="font-size: 0.88rem;">${this.escapeHtml(w.id)}</strong>
                    </div>
                    <div class="font-bold privacy-blur" style="font-size: 0.95rem;">${this.formatMoney(w.balance, w.currency || (w.region === 'JP' ? '¥' : (w.region === 'DE' ? '€' : '₹')))}</div>
                </div>
            `).join('');

            contentEl.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    <div style="padding: 14px 18px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-md);">
                        <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; color: #34d399;">Step 2: Wallet Balance Carry-Forward Reconciliation</h4>
                        <p class="text-xs text-muted" style="margin: 0;"><strong>Mandatory Rule 6.1 Safeguard:</strong> The closing balances of all wallets carry forward continuously into next month as opening balances. Wallets are never reset to zero and no artificial transactions or fake incomes are created.</p>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${walletRows}
                    </div>
                </div>
            `;
        } else if (step === 3) {
            // STEP 3: Configure Next Month's Budgets (Section 6.2 rule: limit carried forward, NOT cushion!)
            const opt = this.closingWizardState.budgetOption;
            const currentJpLimit = storage.state.jpTotalBudget || 0;

            contentEl.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    <div style="padding: 14px 18px; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: var(--radius-md);">
                        <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; color: #fbbf24;">Step 3: Configure Budgets for Next Month (${this.escapeHtml(nextMonth)})</h4>
                        <p class="text-xs text-muted" style="margin: 0;"><strong>Rule 6.2 Carry-Forward Guarantee:</strong> Carry forward the allocated budget limit, NOT the unspent budget cushion. Unspent money is never treated as an automatic budget limit increase.</p>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div class="closing-option-box ${opt === 'copy' ? 'selected' : ''}" onclick="app.onClosingBudgetOptionChange('copy')">
                            <input type="radio" name="closing_budget_opt" ${opt === 'copy' ? 'checked' : ''} style="margin-top: 3px; accent-color: var(--accent);">
                            <div style="flex: 1;">
                                <strong style="font-size: 0.9rem;">1. Copy Previous Month's Limits (Recommended)</strong>
                                <p class="text-xs text-muted" style="margin: 4px 0 0 0;">Preserves the identical Japan budget limit (${this.formatMoney(currentJpLimit, '¥')}) and all active category limits without alteration.</p>
                            </div>
                        </div>

                        <div class="closing-option-box ${opt === 'manual' ? 'selected' : ''}" onclick="app.onClosingBudgetOptionChange('manual')">
                            <input type="radio" name="closing_budget_opt" ${opt === 'manual' ? 'checked' : ''} style="margin-top: 3px; accent-color: var(--accent);">
                            <div style="flex: 1;">
                                <strong style="font-size: 0.9rem;">2. Configure Next Month's Budgets Manually</strong>
                                <p class="text-xs text-muted" style="margin: 4px 0 6px 0;">Specify custom overall Japan budget limit.</p>
                                ${opt === 'manual' ? `
                                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px;">
                                        <label class="text-xs text-muted">Overall Japan Limit (¥):</label>
                                        <input type="number" id="closing-manual-jp-input" value="${this.escapeHtml(this.closingWizardState.customJpBudget)}" step="1000" min="0" style="width: 140px; padding: 6px 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: var(--text-primary); font-size: 0.85rem;" onchange="app.closingWizardState.customJpBudget = Number(this.value)">
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (step === 4) {
            // STEP 4: Review Next Month's Opening State
            let calculatedNextJpBudget = storage.state.jpTotalBudget || 0;
            if (this.closingWizardState.budgetOption === 'manual') {
                calculatedNextJpBudget = this.closingWizardState.customJpBudget || 0;
            }

            contentEl.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    <div style="padding: 14px 18px; background: rgba(62, 99, 221, 0.08); border: 1px solid rgba(62, 99, 221, 0.2); border-radius: var(--radius-md);">
                        <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; color: #a5b4fc;">Step 4: Preview Opening State for ${this.escapeHtml(nextMonth)}</h4>
                        <p class="text-xs text-muted" style="margin: 0;">Verify next month's opening state prior to final confirmation.</p>
                    </div>

                    <div class="closing-stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
                        <div style="background: rgba(255, 255, 255, 0.02); padding: 14px; border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06);">
                            <span class="text-xs text-muted">Next Active Month</span>
                            <div class="font-bold text-primary" style="font-size: 1.15rem; margin-top: 4px;">${this.escapeHtml(nextMonth)}</div>
                            <span class="text-xs text-muted mt-2" style="display: block;">Continuous ledger transitions forward</span>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.02); padding: 14px; border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06);">
                            <span class="text-xs text-muted">Allocated Monthly Budget Limit</span>
                            <div class="font-bold text-success privacy-blur" style="font-size: 1.15rem; margin-top: 4px;">${this.formatMoney(calculatedNextJpBudget, '¥')}</div>
                            <span class="text-xs text-muted mt-2" style="display: block;">Budget carry-forward rule strictly applied</span>
                        </div>
                    </div>

                    <div style="padding: 12px; background: rgba(0, 0, 0, 0.2); border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--text-secondary);">
                        All ${Object.keys(storage.state.wallets || {}).length} wallets will open with their exact continuous closing balances.
                    </div>
                </div>
            `;
        } else if (step === 5) {
            // STEP 5: Confirm Closing
            contentEl.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    <div style="padding: 16px 20px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-md); text-align: center;">
                        <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(16, 185, 129, 0.2); color: #34d399; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;">
                            <i data-lucide="lock" style="width: 22px; height: 22px;"></i>
                        </div>
                        <h3 style="margin: 0 0 6px 0; font-size: 1.15rem; font-weight: 600;">Final Confirmation: Close Month ${this.escapeHtml(curMonth)}</h3>
                        <p class="text-xs text-muted" style="margin: 0;">
                            Month <code>${curMonth}</code> will be sealed against further transaction edits. The application will advance to active month <code>${nextMonth}</code>.
                        </p>
                    </div>

                    <div style="padding: 12px 14px; background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px;"><i data-lucide="lock" style="width: 14px; height: 14px; color: var(--emerald); flex-shrink: 0;"></i><span>Transactions in ${this.escapeHtml(curMonth)} will be locked against future edits or accidental deletion.</span></div>
                        <div style="display: flex; align-items: center; gap: 8px;"><i data-lucide="check" style="width: 14px; height: 14px; color: var(--emerald); flex-shrink: 0;"></i><span>Wallet balances continue seamlessly into ${this.escapeHtml(nextMonth)} without artificial resets.</span></div>
                        <div style="display: flex; align-items: center; gap: 8px;"><i data-lucide="check" style="width: 14px; height: 14px; color: var(--emerald); flex-shrink: 0;"></i><span>Continuous transaction ledger remains intact across all historical periods.</span></div>
                    </div>
                </div>
            `;
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    onClosingBudgetOptionChange(opt) {
        this.closingWizardState.budgetOption = opt;
        this.setClosingStep(3);
    }

    isMonthClosed(monthKey) {
        return typeof walletManager !== 'undefined' ? walletManager.isMonthClosed(monthKey) : false;
    }

    async executeMonthlyClosing() {
        const curMonth = this.closingWizardState.monthKey;
        const nextMonth = this.closingWizardState.nextMonthKey;
        if (!curMonth || !nextMonth) return;

        if (walletManager.isMonthClosed(curMonth)) {
            alert(`Month ${curMonth} is already closed and sealed. Duplicate closing operations are prevented.`);
            this.closeClosingWizard();
            return;
        }

        // Calculate next budget limit
        let nextJpBudget = storage.state.jpTotalBudget || 0;
        if (this.closingWizardState.budgetOption === 'manual') {
            nextJpBudget = this.closingWizardState.customJpBudget || 0;
        }

        const res = await storage.runExclusive(async (state) => {
            if (walletManager.isMonthClosed(curMonth)) {
                return { success: false, error: `Month ${curMonth} is already closed.` };
            }

            // Close month authoritatively with multi-country rollover & carryover calculation
            const snapshot = storage.closeCurrentMonth("Monthly Closing Wizard", curMonth);
            if (!snapshot) {
                return { success: false, error: "Failed to finalize month snapshot." };
            }

            // Advance current month key and set next allocated budget limit
            state.currentMonthKey = nextMonth;
            if (typeof storage.setTotalBudget === 'function') {
                storage.setTotalBudget('JP', nextJpBudget);
            } else {
                state.jpTotalBudget = nextJpBudget;
            }
            return true;
        });

        if (res && res.success !== false) {
            // Close wizard modal
            this.closeClosingWizard();

            // Refresh all application views
            this.renderAll();
            if (this.currentView === 'reports-view') {
                this.reportMonthKey = nextMonth;
                this.renderReportsPage();
            } else if (this.currentView === 'budgets-view') {
                this.renderBudgetsPage();
            }

            alert(`Month ${curMonth} successfully closed! Next month ${nextMonth} is now active with Japan budget limit ${this.formatMoney(nextJpBudget, '¥')}.`);
        } else {
            alert(res?.error || 'Failed to close month.');
        }
    }

    // =========================================================================
    // PHASE 4: BUDGETS & CATEGORY MANAGEMENT CENTRE
    // =========================================================================

    setBudgetsRegion(region) {
        if (!storage.getActiveCountries().includes(region)) return;
        this.budgetsRegion = region;
        const selector = document.getElementById('budgets-country-selector');
        if (selector) {
            selector.querySelectorAll('.segment-btn').forEach(btn => {
                if (btn.getAttribute('data-region') === region) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        this.renderBudgetsPage();
    }

    setBudgetsCategoryFilter(filter) {
        if (!['all', 'active', 'over'].includes(filter)) return;
        this.budgetsCatFilter = filter;
        const filterEl = document.getElementById('budgets-cat-filter');
        if (filterEl) {
            filterEl.querySelectorAll('.segment-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
            });
        }
        this.renderBudgetsPage();
    }

    onBudgetsSearch(query) {
        this.budgetsCatSearch = (query || '').toLowerCase().trim();
        this.renderBudgetsPage();
    }

    toggleCategoryExpand(catId) {
        const card = document.getElementById(`budget-cat-card-${catId}`);
        if (card) {
            card.classList.toggle('expanded');
        }
    }

    renderBudgetsPage() {
        const activeCountries = storage.getActiveCountries();
        const primaryCountry = storage.getPrimaryCountry();

        if (!this.budgetsRegion || !activeCountries.includes(this.budgetsRegion)) {
            this.budgetsRegion = activeCountries.includes(primaryCountry) ? primaryCountry : activeCountries[0] || 'JP';
        }

        const region = this.budgetsRegion;
        const currency = (typeof CountryConfig !== 'undefined' && CountryConfig.get(region)?.currency)
            || (region === 'JP' ? '¥' : region === 'DE' ? '€' : '₹');
        const curMonth = (storage.state && storage.state.currentMonthKey) || new Date().toISOString().slice(0, 7);

        // Update active month label
        const monthLabel = document.getElementById('budgets-month-label');
        if (monthLabel) {
            monthLabel.innerText = curMonth;
        }

        // Manage segmented country control visibility
        const selector = document.getElementById('budgets-country-selector');
        if (selector) {
            if (activeCountries.length <= 1) {
                selector.style.display = 'none';
            } else {
                selector.style.display = 'flex';
                ['JP', 'IN', 'DE'].forEach(code => {
                    const btn = selector.querySelector(`[data-region="${code}"]`);
                    if (btn) {
                        btn.style.display = activeCountries.includes(code) ? 'inline-flex' : 'none';
                        btn.classList.toggle('active', code === region);
                    }
                });
            }
        }

        // Sync search input value if present
        const searchInput = document.getElementById('budgets-cat-search-input');
        if (searchInput && document.activeElement !== searchInput) {
            searchInput.value = this.budgetsCatSearch || '';
        }

        // Check whether budgeting is enabled for this active region
        const isBudgetEnabled = storage.isBudgetEnabled(region);
        const disabledBanner = document.getElementById('budgets-disabled-banner');
        const summaryBanner = document.getElementById('budgets-summary-banner');
        if (disabledBanner) {
            disabledBanner.style.display = isBudgetEnabled ? 'none' : 'block';
        }
        if (summaryBanner) {
            summaryBanner.style.display = isBudgetEnabled ? 'block' : 'none';
        }

        // Transactions in active month for active region
        const allTxs = storage.state.transactions || [];
        const monthTxs = allTxs.filter(t => t.region === region && this.isTransactionInMonth(t, curMonth));

        // Calculate totals spent per category
        const totals = {};
        const txCounts = {};
        monthTxs.forEach(tx => {
            if (tx.type === 'expense') {
                totals[tx.categoryId] = (totals[tx.categoryId] || 0) + Number(tx.amount || 0);
                txCounts[tx.categoryId] = (tx.categoryId ? (txCounts[tx.categoryId] || 0) + 1 : 0);
            }
        });

        const totalSpent = Object.values(totals).reduce((s, v) => s + v, 0);
        const allCats = storage.state.categories?.[region] || [];

        const sumCatLimits = allCats
            .filter(c => c.contributesToTotalBudget !== false && c.isActive !== false)
            .reduce((s, c) => s + (c.budget || 0), 0);

        // Overall Monthly Budget
        const allocatedBudget = storage.getTotalBudget(region);

        const cushion = Math.max(0, allocatedBudget - sumCatLimits);
        const remaining = allocatedBudget - totalSpent;
        const utilizationPct = allocatedBudget > 0 ? Math.round((totalSpent / allocatedBudget) * 100) : 0;

        // Days remaining in current calendar month
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysRemaining = Math.max(0, daysInMonth - now.getDate());

        let streakClass = 'neon-safe';
        let utilizationClass = 'text-success';
        if (utilizationPct > 100) {
            streakClass = 'neon-danger';
            utilizationClass = 'text-danger';
        } else if (utilizationPct >= 75) {
            streakClass = 'neon-warn';
            utilizationClass = 'text-warn';
        }

        // Active and Over-Budget counts for filter buttons
        const activeCatsCount = allCats.filter(c => c.isActive !== false).length;
        const overBudgetCatsCount = allCats.filter(c => (c.budget || 0) > 0 && (totals[c.id] || 0) > (c.budget || 0)).length;

        const countAllEl = document.getElementById('cat-count-all');
        const countActiveEl = document.getElementById('cat-count-active');
        const countOverEl = document.getElementById('cat-count-over');
        if (countAllEl) countAllEl.innerText = allCats.length;
        if (countActiveEl) countActiveEl.innerText = activeCatsCount;
        if (countOverEl) countOverEl.innerText = overBudgetCatsCount;

        // 1. Render Consolidated Budgets Overview Card (Reuses Dashboard Central Card)
        if (isBudgetEnabled) {
            this.renderBudgetOverviewCard('budgets-summary-banner', {
                region: region,
                monthKey: curMonth,
                totalSpent: totalSpent,
                allocatedBudget: allocatedBudget,
                isInteractive: true,
                showEditButton: true
            });
        }

        // 2. Filter Category List according to active segmented control & search input
        const currentFilter = this.budgetsCatFilter || 'all';
        const searchQuery = this.budgetsCatSearch || '';

        let displayedCats = allCats.slice();

        if (currentFilter === 'active') {
            displayedCats = displayedCats.filter(c => c.isActive !== false);
        } else if (currentFilter === 'over') {
            displayedCats = displayedCats.filter(c => (c.budget || 0) > 0 && (totals[c.id] || 0) > (c.budget || 0));
        }

        if (searchQuery) {
            displayedCats = displayedCats.filter(c => (c.name || '').toLowerCase().includes(searchQuery));
        }

        // 3. Render Category Cards Grid
        const gridEl = document.getElementById('budgets-categories-grid');
        if (gridEl) {
            if (displayedCats.length === 0) {
                gridEl.innerHTML = `
                    <div class="budgets-empty-state" style="grid-column: 1 / -1;">
                        <i data-lucide="tag" style="width: 32px; height: 32px; color: var(--text-muted); opacity: 0.5; margin-bottom: 8px;"></i>
                        <p class="font-bold" style="margin: 0 0 4px 0; color: var(--text-secondary);">No categories found</p>
                        <span class="text-xs text-muted">Try adjusting your category filter or search query.</span>
                    </div>
                `;
            } else {
                gridEl.innerHTML = displayedCats.map(c => {
                    const spent = totals[c.id] || 0;
                    const budgetLimit = c.budget || 0;
                    const rem = budgetLimit - spent;
                    const isOver = budgetLimit > 0 && spent > budgetLimit;
                    const pct = budgetLimit > 0 ? (spent / budgetLimit) * 100 : 0;
                    const count = txCounts[c.id] || 0;
                    const avgSpend = count > 0 ? Math.round(spent / count) : 0;

                    let barClass = 'neon-safe';
                    if (pct >= 100) {
                        barClass = 'neon-danger';
                    } else if (pct >= 75) {
                        barClass = 'neon-warn';
                    }

                    return `
                        <div class="card budget-cat-card interactive-card ${isOver ? 'is-overbudget' : ''}" id="budget-cat-card-${this.escapeHtml(c.id)}" data-category-id="${this.escapeHtml(c.id)}" data-region="${this.escapeHtml(region)}" onclick="app.openCategoryManageModal(this.dataset.categoryId, this.dataset.region)">
                            <!-- Card Header -->
                            <div class="budget-cat-card-header">
                                <div class="budget-cat-identity">
                                    <div class="budget-cat-icon-box">
                                        <i data-lucide="${this.categoryIcon(c.icon)}" style="width: 18px; height: 18px;"></i>
                                    </div>
                                    <div class="budget-cat-info">
                                        <div class="budget-cat-title-row">
                                            <h4 class="budget-cat-name" title="${this.escapeHtml(c.name)}">${this.escapeHtml(c.name)}</h4>
                                            ${c.isActive === false ? '<span class="budget-badge-archived">Archived</span>' : ''}
                                        </div>
                                        <div class="budget-cat-meta-row">
                                            <span>${count} tx${count === 1 ? '' : 's'}</span>
                                            ${avgSpend > 0 ? `<span class="bullet-dot">•</span><span class="privacy-blur financial-amount">avg ${this.formatMoney(avgSpend, currency)}</span>` : ''}
                                        </div>
                                    </div>
                                </div>
                                <div class="budget-cat-header-right">
                                    ${isOver ? `<span class="budget-overspend-pill font-numeric privacy-blur financial-amount">+${this.formatMoney(Math.abs(rem), currency)} over</span>` : ''}
                                    <button class="budget-cat-config-btn" onclick="event.stopPropagation(); const card = this.closest('.budget-cat-card'); app.openCategoryManageModal(card.dataset.categoryId, card.dataset.region)" title="Configure Category & Limit">
                                        <i data-lucide="sliders" style="width: 13px; height: 13px;"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Financial Amounts -->
                            <div class="budget-cat-figures">
                                <div class="budget-figure-col">
                                    <span class="figure-label">Spent</span>
                                    <span class="figure-value text-primary font-numeric privacy-blur financial-amount">${this.formatMoney(spent, currency)}</span>
                                </div>
                                <div class="budget-figure-col right-align">
                                    <span class="figure-label">Monthly Limit</span>
                                    <span class="figure-value font-numeric privacy-blur financial-amount">${budgetLimit > 0 ? this.formatMoney(budgetLimit, currency) : '<span class="text-muted" style="font-weight: 500;">No Limit</span>'}</span>
                                </div>
                            </div>

                            <!-- Horizontal Progress Streak (Thin Refined Bar) -->
                            ${budgetLimit > 0 ? `
                                <div class="budget-cat-streak-section">
                                    <div class="budget-streak-track">
                                        <div class="budget-streak-fill ${barClass}" style="width: ${Math.min(pct, 100)}%;"></div>
                                    </div>
                                    <div class="budget-cat-streak-footer">
                                        <span class="font-numeric ${pct >= 100 ? 'text-danger' : (pct >= 75 ? 'text-warn' : 'text-muted')}">${Math.round(pct)}% used</span>
                                        <span class="font-numeric privacy-blur financial-amount ${rem < 0 ? 'text-danger' : 'text-muted'}">
                                            ${rem >= 0 ? `${this.formatMoney(rem, currency)} left` : `-${this.formatMoney(Math.abs(rem), currency)} over`}
                                        </span>
                                    </div>
                                </div>
                            ` : `
                                <div class="budget-cat-streak-section">
                                    <div class="budget-streak-track uncapped-track">
                                        <div class="budget-streak-fill uncapped-fill" style="width: 0%;"></div>
                                    </div>
                                    <div class="budget-cat-streak-footer">
                                        <span class="text-xs text-muted">Flexible allocation</span>
                                        <span class="text-xs text-muted">Tracked in continuous ledger</span>
                                    </div>
                                </div>
                            `}
                        </div>
                    `;
                }).join('');
            }
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    // --------------------------------------------------------------------------
    // OVERALL MONTHLY BUDGET CONFIGURATION
    // --------------------------------------------------------------------------

    openOverallBudgetModal(region = null) {
        const targetRegion = region || this.budgetsRegion || 'JP';
        this.overallBudgetModalRegion = targetRegion;

        const modal = document.getElementById('overall-budget-modal');
        if (!modal) return;

        this.setOverallBudgetRegion(targetRegion, false);

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }

        const input = document.getElementById('overall-budget-input');
        if (input) {
            setTimeout(() => {
                input.focus();
                input.select();
            }, 60);
        }
    }

    setOverallBudgetRegion(region, updateFocus = true) {
        this.overallBudgetModalRegion = region;
        const currency = (typeof CountryConfig !== 'undefined' && CountryConfig.get(region)?.currency)
            || (region === 'JP' ? '¥' : region === 'DE' ? '€' : '₹');

        const btnJp = document.getElementById('overall-budget-btn-jp');
        const btnIn = document.getElementById('overall-budget-btn-in');
        if (btnJp) btnJp.classList.toggle('active', region === 'JP');
        if (btnIn) btnIn.classList.toggle('active', region === 'IN');

        const currLabel = document.getElementById('overall-budget-curr-label');
        const currPrefix = document.getElementById('overall-budget-curr-prefix');
        if (currLabel) currLabel.innerText = currency;
        if (currPrefix) currPrefix.innerText = currency;

        const cats = storage.state.categories?.[region] || [];
        const sumCatLimits = cats.filter(c => c.contributesToTotalBudget !== false && c.isActive !== false).reduce((s, c) => s + (c.budget || 0), 0);

        const currentVal = storage.getTotalBudget(region) || sumCatLimits;

        const input = document.getElementById('overall-budget-input');
        if (input) {
            input.value = currentVal;
            input.oninput = () => this.updateOverallBudgetCushionPreview();
        }

        const err = document.getElementById('overall-budget-error');
        if (err) {
            err.style.display = 'none';
            err.innerText = '';
        }

        this.updateOverallBudgetCushionPreview();
        if (updateFocus && input) {
            input.focus();
            input.select();
        }
    }

    updateOverallBudgetCushionPreview() {
        const region = this.overallBudgetModalRegion || 'JP';
        const currency = (typeof CountryConfig !== 'undefined' && CountryConfig.get(region)?.currency)
            || (region === 'JP' ? '¥' : region === 'DE' ? '€' : '₹');

        const cats = storage.state.categories?.[region] || [];
        const sumCatLimits = cats.filter(c => c.contributesToTotalBudget !== false && c.isActive !== false).reduce((s, c) => s + (c.budget || 0), 0);

        const input = document.getElementById('overall-budget-input');
        const enteredVal = input ? parseFloat(input.value) : 0;
        const validVal = isNaN(enteredVal) || enteredVal < 0 ? 0 : enteredVal;

        const cushion = validVal - sumCatLimits;

        const catSumEl = document.getElementById('overall-budget-cat-sum');
        if (catSumEl) {
            catSumEl.innerText = this.formatMoney(sumCatLimits, currency);
        }

        const cushionEl = document.getElementById('overall-budget-cushion-val');
        if (cushionEl) {
            if (cushion >= 0) {
                cushionEl.innerText = `+${this.formatMoney(cushion, currency)}`;
                cushionEl.style.color = '#34d399';
            } else {
                cushionEl.innerText = `-${this.formatMoney(Math.abs(cushion), currency)} (below category sum)`;
                cushionEl.style.color = '#fb7185';
            }
        }
    }

    async saveOverallBudget() {
        const region = this.overallBudgetModalRegion || 'JP';
        const input = document.getElementById('overall-budget-input');
        const err = document.getElementById('overall-budget-error');

        if (!input) return;

        const rawVal = input.value.trim();
        if (rawVal === '' || isNaN(rawVal)) {
            if (err) {
                err.innerText = 'Please enter a valid numeric budget amount.';
                err.style.display = 'block';
            }
            return;
        }

        const numVal = Math.round(Number(rawVal));
        if (numVal < 0) {
            if (err) {
                err.innerText = 'Monthly budget cannot be negative.';
                err.style.display = 'block';
            }
            return;
        }

        await storage.runExclusive(async (state) => {
            if (typeof storage.setTotalBudget === 'function') {
                storage.setTotalBudget(region, numVal);
            } else {
                if (region === 'JP') {
                    state.jpTotalBudget = numVal;
                } else if (region === 'IN') {
                    state.inTotalBudget = numVal;
                }
            }
            return true;
        });

        // Update settings inputs if present
        const jpBudEl = document.getElementById('setting-jp-budget');
        if (jpBudEl && region === 'JP') {
            jpBudEl.value = numVal;
        }

        this.closeOverallBudgetModal();

        // Re-render relevant views
        this.renderBudgetsPage();
        this.renderAll();
        if (this.currentView === 'reports-view') {
            this.renderReportsPage();
        }
        if (this.currentView === 'settings-view') {
            this.renderSettings();
        }
    }

    closeOverallBudgetModal() {
        const modal = document.getElementById('overall-budget-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        document.body.style.overflow = '';
    }

    // =========================================================================
    // CATEGORY MANAGEMENT & LOGICAL ICON ORGANIZATION
    // =========================================================================

    // Curated Logical Icon Groups (10 categories with distinct monochrome Lucide SVGs)
    static get LucideIconGroups() {
        return {
            'Travel & Commute': [
                'train-front', 'bus', 'plane', 'car', 'fuel', 'bike', 'navigation', 'map-pin', 'map', 'compass', 'anchor'
            ],
            'Food & Dining': [
                'shopping-basket', 'utensils', 'coffee', 'pizza', 'beer', 'wine', 'cake', 'apple', 'croissant'
            ],
            'Housing & Utilities': [
                'home', 'building', 'hotel', 'warehouse', 'key', 'zap', 'flame', 'droplet', 'wifi', 'tv', 'phone', 'smartphone'
            ],
            'Shopping & Goods': [
                'shopping-bag', 'shopping-cart', 'tag', 'package', 'box', 'gift', 'shirt', 'watch', 'gem', 'glasses'
            ],
            'Health & Personal': [
                'heart-pulse', 'pill', 'stethoscope', 'activity', 'dumbbell', 'sparkles', 'scissors', 'heart', 'smile'
            ],
            'Finance & Work': [
                'credit-card', 'landmark', 'banknote', 'coins', 'wallet', 'piggy-bank', 'badge-percent', 'receipt', 'file-text', 'file-check', 'briefcase', 'calculator', 'trending-up', 'trending-down', 'pie-chart', 'bar-chart-3', 'scale'
            ],
            'Entertainment & Media': [
                'gamepad-2', 'clapperboard', 'video', 'music', 'ticket', 'camera', 'headphones', 'book', 'book-open', 'newspaper'
            ],
            'Tech & Hardware': [
                'laptop', 'monitor', 'tablet', 'cpu', 'database', 'server', 'hard-drive', 'plug', 'battery-charging', 'printer', 'power', 'rss'
            ],
            'Family, Pets & Nature': [
                'baby', 'user', 'users', 'user-check', 'paw-print', 'dog', 'cat', 'flower-2', 'tree-pine', 'trees', 'sun', 'moon', 'cloud', 'umbrella'
            ],
            'General & System': [
                'wrench', 'hammer', 'shield', 'shield-check', 'lock', 'unlock', 'archive', 'trash-2', 'check-circle-2', 'layers', 'sliders', 'settings', 'layout-grid', 'folder', 'folder-open', 'bookmark', 'lightbulb', 'target', 'life-buoy', 'flag', 'award', 'star'
            ]
        };
    }

    // Flat list of all available icons for search & backward compatibility
    static get LucideIcons() {
        return Object.values(App.LucideIconGroups).flat();
    }

    openCategoryManageModal(catId = null, region = null) {
        this.editingCatId = catId;
        const targetRegion = region || this.budgetsRegion || 'JP';
        this.editingCatRegion = targetRegion;
        this.activeIconGroup = 'All';
        this.catIconSearchQuery = '';

        const titleEl = document.getElementById('cat-modal-title');
        const idInput = document.getElementById('cat-edit-id');
        const nameInput = document.getElementById('cat-edit-name');
        const countrySelect = document.getElementById('cat-edit-country');
        const budgetInput = document.getElementById('cat-edit-budget');
        const currLabel = document.getElementById('cat-edit-curr-label');
        const activeToggle = document.getElementById('cat-toggle-active');
        const overviewToggle = document.getElementById('cat-toggle-overview');
        const contributeToggle = document.getElementById('cat-toggle-contribute');
        const archiveBtn = document.getElementById('cat-btn-archive');
        const archiveText = document.getElementById('cat-btn-archive-text');
        const searchInput = document.getElementById('cat-icon-search-input');

        if (searchInput) searchInput.value = '';
        if (currLabel) currLabel.innerText = targetRegion === 'JP' ? '¥' : '₹';

        let category = null;
        if (catId) {
            category = (storage.state.categories[targetRegion] || []).find(c => c.id === catId);
            if (!category) {
                // Check across all regions in case region was switched
                for (const reg of ['JP', 'IN']) {
                    const found = (storage.state.categories[reg] || []).find(c => c.id === catId);
                    if (found) {
                        category = found;
                        this.editingCatRegion = reg;
                        break;
                    }
                }
            }
        }

        if (category) {
            if (titleEl) titleEl.innerText = `Edit ${category.name}`;
            if (idInput) idInput.value = category.id;
            if (nameInput) nameInput.value = category.name;
            if (countrySelect) countrySelect.value = this.editingCatRegion;
            if (budgetInput) budgetInput.value = category.budget || 0;
            this.selectedCatIcon = category.icon || 'tag';
            if (activeToggle) activeToggle.checked = (category.isActive !== false);
            if (overviewToggle) overviewToggle.checked = !category.hiddenFromBudgetOverview;
            if (contributeToggle) contributeToggle.checked = (category.contributesToTotalBudget !== false);
            if (archiveBtn) {
                archiveBtn.style.display = 'inline-flex';
                if (archiveText) archiveText.innerText = (category.isActive === false) ? 'Unarchive Category' : 'Archive Category';
            }
        } else {
            if (titleEl) titleEl.innerText = 'Create New Category';
            if (idInput) idInput.value = '';
            if (nameInput) nameInput.value = '';
            if (countrySelect) countrySelect.value = targetRegion;
            if (budgetInput) budgetInput.value = 0;
            this.selectedCatIcon = 'tag';
            if (activeToggle) activeToggle.checked = true;
            if (overviewToggle) overviewToggle.checked = true;
            if (contributeToggle) contributeToggle.checked = true;
            if (archiveBtn) archiveBtn.style.display = 'none';
        }

        // Render Group Pills & Icons
        this.renderCategoryIconPicker();
        this.selectCategoryIcon(this.selectedCatIcon);

        const modal = document.getElementById('category-manage-modal');
        if (modal) modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeCategoryManageModal() {
        const modal = document.getElementById('category-manage-modal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    renderCategoryIconPicker() {
        const pillsContainer = document.getElementById('icon-group-pills');
        const grid = document.getElementById('cat-icons-picker-grid');
        if (!grid) return;

        const groups = App.LucideIconGroups;
        const groupNames = Object.keys(groups);

        // 1. Render Group Filter Pills
        if (pillsContainer) {
            const allPills = ['All', ...groupNames];
            pillsContainer.innerHTML = allPills.map(g => `
                <button type="button" class="icon-group-pill ${g === (this.activeIconGroup || 'All') ? 'active' : ''}" onclick="app.selectCategoryIconGroup('${g}')">
                    ${g}
                </button>
            `).join('');
        }

        // 2. Render Icon Grid (Grouped or Search-Filtered)
        const q = (this.catIconSearchQuery || '').toLowerCase().trim();
        const activeGroup = this.activeIconGroup || 'All';

        let html = '';
        if (q) {
            // Search across all groups
            const allIcons = App.LucideIcons;
            const matchedIcons = allIcons.filter(name => name.includes(q));

            if (matchedIcons.length === 0) {
                html = `<div style="grid-column: 1 / -1; padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No icons matching "${this.escapeHtml(q)}"</div>`;
            } else {
                html = `
                    <div class="icon-picker-grid">
                        ${matchedIcons.map(icon => `
                            <button type="button" class="icon-picker-cell ${icon === this.selectedCatIcon ? 'selected' : ''}" onclick="app.selectCategoryIcon('${icon}')" title="${icon}">
                                <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
                            </button>
                        `).join('')}
                    </div>
                `;
            }
        } else if (activeGroup === 'All') {
            // Show grouped sections
            html = groupNames.map(group => {
                const groupIcons = groups[group];
                return `
                    <div class="icon-picker-group">
                        <div class="icon-picker-group-title">
                            <span>${group}</span>
                            <span class="icon-group-count">${groupIcons.length}</span>
                        </div>
                        <div class="icon-picker-grid">
                            ${groupIcons.map(icon => `
                                <button type="button" class="icon-picker-cell ${icon === this.selectedCatIcon ? 'selected' : ''}" onclick="app.selectCategoryIcon('${icon}')" title="${icon}">
                                    <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            // Show only the selected group
            const groupIcons = groups[activeGroup] || [];
            html = `
                <div class="icon-picker-group">
                    <div class="icon-picker-group-title">
                        <span>${activeGroup}</span>
                        <span class="icon-group-count">${groupIcons.length}</span>
                    </div>
                    <div class="icon-picker-grid">
                        ${groupIcons.map(icon => `
                            <button type="button" class="icon-picker-cell ${icon === this.selectedCatIcon ? 'selected' : ''}" onclick="app.selectCategoryIcon('${icon}')" title="${icon}">
                                <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        grid.innerHTML = html;

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    selectCategoryIconGroup(groupName) {
        this.activeIconGroup = groupName;
        this.catIconSearchQuery = '';
        const searchInput = document.getElementById('cat-icon-search-input');
        if (searchInput) searchInput.value = '';
        this.renderCategoryIconPicker();
    }

    filterCategoryIcons(query = '') {
        this.catIconSearchQuery = (query || '').toLowerCase().trim();
        this.renderCategoryIconPicker();
    }

    selectCategoryIcon(iconName) {
        this.selectedCatIcon = iconName;
        const nameEl = document.getElementById('cat-selected-icon-name');
        const prevEl = document.getElementById('cat-selected-icon-preview');
        if (nameEl) nameEl.innerText = iconName;
        if (prevEl) {
            prevEl.setAttribute('data-lucide', iconName);
        }

        // Highlight selected cell
        const cells = document.querySelectorAll('.icon-picker-cell');
        cells.forEach(cell => {
            if (cell.getAttribute('title') === iconName) {
                cell.classList.add('selected');
            } else {
                cell.classList.remove('selected');
            }
        });

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    async saveCategoryConfig() {
        const idInput = document.getElementById('cat-edit-id');
        const nameInput = document.getElementById('cat-edit-name');
        const countrySelect = document.getElementById('cat-edit-country');
        const budgetInput = document.getElementById('cat-edit-budget');
        const activeToggle = document.getElementById('cat-toggle-active');
        const overviewToggle = document.getElementById('cat-toggle-overview');
        const contributeToggle = document.getElementById('cat-toggle-contribute');

        const catName = (nameInput?.value || '').trim();
        if (!catName) {
            alert('Please enter a valid category name.');
            return;
        }

        const catId = idInput?.value || '';
        const targetRegion = countrySelect?.value || 'JP';
        const budgetAmt = Math.max(0, Number(budgetInput?.value || 0));
        const isActive = activeToggle ? activeToggle.checked : true;
        const hiddenFromOverview = overviewToggle ? !overviewToggle.checked : false;
        const contributesToTotal = contributeToggle ? contributeToggle.checked : true;
        const chosenIcon = this.selectedCatIcon;
        const origRegion = this.editingCatRegion || targetRegion;

        const res = await storage.runExclusive(async (state) => {
            if (!state.categories) {
                state.categories = {};
            }
            if (!state.categories[targetRegion]) {
                state.categories[targetRegion] = [];
            }

            if (catId) {
                // Edit existing category
                let cat = (state.categories[origRegion] || []).find(c => c.id === catId);

                if (cat) {
                    cat.name = catName;
                    cat.icon = chosenIcon;
                    cat.budget = budgetAmt;
                    cat.isActive = isActive;
                    cat.hiddenFromBudgetOverview = hiddenFromOverview;
                    cat.contributesToTotalBudget = contributesToTotal;

                    // Handle region migration if region changed
                    if (origRegion !== targetRegion && targetRegion !== 'ALL') {
                        state.categories[origRegion] = state.categories[origRegion].filter(c => c.id !== catId);
                        state.categories[targetRegion].push(cat);
                    }
                }
            } else {
                // Create new category
                const newId = `${targetRegion.toLowerCase()}-${catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
                state.categories[targetRegion].push({
                    id: newId,
                    name: catName,
                    icon: chosenIcon,
                    budget: budgetAmt,
                    isActive: isActive,
                    hiddenFromBudgetOverview: hiddenFromOverview,
                    contributesToTotalBudget: contributesToTotal
                });
            }
            return true;
        });

        if (res && res.success !== false) {
            this.closeCategoryManageModal();
            this.renderAll();
            if (this.currentView === 'budgets-view') {
                this.renderBudgetsPage();
            }
            this.updateExpenseCategories();
        } else {
            alert(res?.error || 'Failed to save category configuration.');
        }
    }

    async toggleCategoryArchive() {
        if (!this.editingCatId) return;
        const targetRegion = this.editingCatRegion || document.getElementById('cat-edit-country')?.value || 'JP';
        const editingCatId = this.editingCatId;

        const res = await storage.runExclusive(async (state) => {
            if (!state.categories) return false;
            let cat = (state.categories[targetRegion] || []).find(c => c.id === editingCatId);

            if (!cat) {
                for (const r of ['JP', 'IN', 'DE']) {
                    const found = (state.categories[r] || []).find(c => c.id === editingCatId);
                    if (found) { cat = found; break; }
                }
            }

            if (!cat) return false;

            cat.isActive = !(cat.isActive !== false);
            return true;
        });

        if (res && res.success !== false) {
            this.closeCategoryManageModal();
            this.renderAll();
            if (this.currentView === 'budgets-view') {
                this.renderBudgetsPage();
            }
            this.updateExpenseCategories();
        }
    }
}
const app = new App();
window.app = app;

