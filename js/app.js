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
    { id: 'aurora-nordic', name: 'Aurora Teal', cls: 'wallet-theme-aurora-nordic', color: '#0f766e', region: 'ALL', match: ['teal', 'savings'] }
];

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
        this.activityThrottleTimer = null;
        this._isSubmitting = false;
        this.dashboardChartRegion = 'JP'; // Pass 1: Dashboard Category Chart Active Region (JP or IN)

        // Phase 3: Transactions Continuous Ledger state
        this.ledgerSearchQuery = '';
        this.ledgerSearchDebounceTimer = null;
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
        this.jpExclusions = new Set(
            (storage.state && Array.isArray(storage.state.analyticsExclusions))
                ? storage.state.analyticsExclusions
                : ['jp-misc']
        );
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
    }

    init() {
        storage.checkRollover();
        this.initSidebarState();
        this.setupNavigation();
        this.setupInactivityMonitoring();
        this.updatePrivacyUI();
        this.updateDesktopAccountInfo();
        this.renderAll();
    }

    getCountryFlagSvg(region, width = 18, height = 13.5) {
        if (region === 'JP') {
            return `<svg class="country-flag-svg flag-jp" viewBox="0 0 640 480" width="${width}" height="${height}" style="border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,0.14);vertical-align:middle;display:inline-block;flex-shrink:0;" aria-label="Japan"><rect width="640" height="480" fill="#ffffff"/><circle cx="320" cy="240" r="120" fill="#bc002d"/></svg>`;
        } else if (region === 'IN') {
            return `<svg class="country-flag-svg flag-in" viewBox="0 0 640 480" width="${width}" height="${height}" style="border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,0.14);vertical-align:middle;display:inline-block;flex-shrink:0;" aria-label="India"><path fill="#f4f5f8" d="M0 160h640v160H0z"/><path fill="#ff9933" d="M0 0h640v160H0z"/><path fill="#138808" d="M0 320h640v160H0z"/><circle cx="320" cy="240" r="40" fill="#000080"/><circle cx="320" cy="240" r="32" fill="#ffffff"/><circle cx="320" cy="240" r="8" fill="#000080"/></svg>`;
        }
        return '';
    }

    getCardChipSvg() {
        return `<svg class="card-chip-svg" width="30" height="22" viewBox="0 0 34 26" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));">
            <rect width="34" height="26" rx="4" fill="url(#chip-metallic-grad)" stroke="#d4af37" stroke-width="0.75"/>
            <path d="M0 9h12v8H0M34 9H22v8h12M12 9V0M22 9V0M12 17v9M22 17v9M12 13h10" stroke="#997a15" stroke-width="0.75"/>
            <defs>
                <linearGradient id="chip-metallic-grad" x1="0" y1="0" x2="34" y2="26" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#ffe259"/>
                    <stop offset="0.5" stop-color="#ffa751"/>
                    <stop offset="1" stop-color="#b8860b"/>
                </linearGradient>
            </defs>
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
        if (this.isPrivacyHidden) {
            return '******';
        }
        let sym = currency || '';
        if (sym === 'JPY') sym = '¥';
        else if (sym === 'INR') sym = '₹';
        const num = Number(amount) || 0;
        const prefix = options.prefix || '';
        const locale = options.locale || (sym === '₹' ? 'en-IN' : undefined);
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
                const reg = titleEl && titleEl.innerText.includes('India') ? 'IN' : 'JP';
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
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
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
        // Mobile bottom navigation items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.currentTarget.getAttribute('data-target');
                this.switchView(target);
            });
        });

        // Desktop sidebar navigation items
        document.querySelectorAll('.desktop-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.currentTarget.getAttribute('data-target');
                this.switchView(target);
                // Auto-close mobile drawer if open
                const sidebar = document.getElementById('desktop-sidebar');
                if (sidebar && sidebar.classList.contains('mobile-open')) {
                    sidebar.classList.remove('mobile-open');
                }
            });
        });

        // Keyboard shortcuts (Escape key dismisses focus overlay and modals)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
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
    }

    switchView(viewId) {
        if (!viewId) return;

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

        // Synchronize active item on desktop sidebar
        document.querySelectorAll('.desktop-nav-item').forEach(n => {
            const t = n.getAttribute('data-target');
            if (t === resolvedId || (resolvedId === 'home-view' && t === 'home-view')) {
                n.classList.add('active');
            } else {
                n.classList.remove('active');
            }
        });

        // Synchronize active item on mobile bottom nav
        document.querySelectorAll('.nav-item').forEach(n => {
            const t = n.getAttribute('data-target');
            if (t === resolvedId || (resolvedId === 'home-view' && t === 'home-view')) {
                n.classList.add('active');
            } else {
                n.classList.remove('active');
            }
        });

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
        if (monthSelectorEl) {
            monthSelectorEl.style.display = (resolvedId === 'home-view' || resolvedId === 'reports-view') ? 'inline-flex' : 'none';
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

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    toggleSidebarCollapse() {
        const sidebar = document.getElementById('desktop-sidebar');
        if (!sidebar) return;
        const isCollapsed = sidebar.classList.toggle('collapsed');
        try {
            localStorage.setItem('em_sidebar_collapsed', isCollapsed ? 'true' : 'false');
        } catch (e) {
            console.warn('[UI] Failed to save sidebar collapse state:', e);
        }
    }

    initSidebarState() {
        try {
            if (localStorage.getItem('em_sidebar_collapsed') === 'true') {
                const sidebar = document.getElementById('desktop-sidebar');
                if (sidebar) sidebar.classList.add('collapsed');
            }
        } catch (e) {
            console.warn('[UI] Failed to read sidebar collapse state:', e);
        }
    }

    toggleMobileSidebar() {
        const sidebar = document.getElementById('desktop-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('mobile-open');
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
            if (popoverEmailEl) popoverEmailEl.innerText = 'Connected (nyetklojxqnawdtrrhma)';
            if (initialsEl) initialsEl.innerText = 'TK';
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

    getWalletOptionsHtml(selectedWalletId = null, regionFilter = null) {
        if (!storage.state || !storage.state.wallets) {
            return `
                <optgroup label="Japan">
                    <option value="Salary Account">Salary Account (¥)</option>
                    <option value="Cash">Cash (¥)</option>
                    <option value="PayPay">PayPay (¥)</option>
                </optgroup>
                <optgroup label="India">
                    <option value="Axis Bank">Axis Bank (₹)</option>
                    <option value="Bank of Baroda">Bank of Baroda (₹)</option>
                    <option value="Credit Card">Credit Card (₹)</option>
                </optgroup>
            `;
        }

        let jpOpts = '';
        let inOpts = '';

        Object.values(storage.state.wallets).forEach(w => {
            if (regionFilter && w.region !== regionFilter) return;
            const sel = (w.id === selectedWalletId) ? ' selected' : '';
            const opt = `<option value="${w.id}"${sel}>${w.id} (${w.currency})</option>`;
            if (w.region === 'JP') jpOpts += opt;
            else inOpts += opt;
        });

        if (regionFilter === 'JP') return jpOpts;
        if (regionFilter === 'IN') return inOpts;

        let html = '';
        if (jpOpts) html += `<optgroup label="Japan">${jpOpts}</optgroup>`;
        if (inOpts) html += `<optgroup label="India">${inOpts}</optgroup>`;
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

    openUnifiedTransactionSelector() {
        const modal = document.getElementById('tx-action-selector-modal');
        if (!modal) return;
        modal.classList.add('active');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    closeUnifiedTransactionSelector() {
        const modal = document.getElementById('tx-action-selector-modal');
        if (modal) modal.classList.remove('active');
    }

    selectTransactionType(type) {
        this.closeUnifiedTransactionSelector();
        this.openTransactionModal(type);
    }

    openTransactionModal(type) {
        document.getElementById('main-fab').classList.remove('open');
        document.getElementById('fab-menu').classList.remove('active');

        const modal = document.getElementById('transaction-modal');
        const title = document.getElementById('modal-title');
        const content = document.getElementById('modal-content');

        const currentDate = new Date().toISOString().split('T')[0];
        let formInnerHtml = '';

        const allWalletOpts = this.getWalletOptionsHtml();
        const jpWalletOpts = this.getWalletOptionsHtml(null, 'JP');
        const inWalletOpts = this.getWalletOptionsHtml(null, 'IN');

        if (type === 'expense') {
            title.innerText = 'Log Expense';
            formInnerHtml = `
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="tx-date" value="${currentDate}">
                </div>
                <div class="form-group">
                    <label>Wallet</label>
                    <select id="tx-wallet" onchange="app.updateExpenseCategories()">
                        ${allWalletOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label>Category</label>
                    <select id="tx-category" onchange="app.handleCategoryChange()"></select>
                </div>
                <div class="form-group hidden" id="tx-subcategory-group">
                    <label>Specific Utility</label>
                    <select id="tx-subcategory"></select>
                </div>
                <div class="form-group">
                    <label>Amount</label>
                    <input type="number" id="tx-amount" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Note (Optional)</label>
                    <input type="text" id="tx-note" placeholder="What was this for?">
                </div>
                <button type="submit" class="btn btn-primary"><span>Save Expense</span></button>
            `;
        } else if (type === 'transfer') {
            title.innerText = 'Transfer Between Wallets';
            formInnerHtml = `
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="tx-date" value="${currentDate}">
                </div>
                <div class="form-group">
                    <label>From (Source)</label>
                    <select id="tx-source">
                        ${allWalletOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label>To (Destination)</label>
                    <select id="tx-dest">
                        ${allWalletOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label>Amount</label>
                    <input type="number" id="tx-amount" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Note (Optional)</label>
                    <input type="text" id="tx-note" placeholder="ATM withdraw, topup, etc.">
                </div>
                <button type="submit" class="btn btn-blue">Complete Transfer</button>
            `;
        } else if (type === 'remittance') {
            title.innerText = 'Remittance (Send to India)';
            formInnerHtml = `
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="tx-date" value="${currentDate}">
                </div>
                <div class="form-group">
                    <label>From (Source JPY)</label>
                    <select id="tx-source">
                        ${jpWalletOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label>Amount Sent (¥)</label>
                    <input type="number" id="tx-amount-jpy" placeholder="e.g. 50000">
                </div>
                <div class="form-group">
                    <label>To (Destination INR)</label>
                    <select id="tx-dest">
                        ${inWalletOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label>Amount Received (₹)</label>
                    <input type="number" id="tx-amount-inr" placeholder="e.g. 27500">
                </div>
                <div class="form-group">
                    <label>Note</label>
                    <input type="text" id="tx-note" value="Monthly Remittance">
                </div>
                <button type="submit" class="btn btn-purple">Log Remittance</button>
            `;
        } else if (type === 'income') {
            title.innerText = 'Add Income / Credit';
            formInnerHtml = `
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="tx-date" value="${currentDate}">
                </div>
                <div class="form-group">
                    <label>Credit To</label>
                    <select id="tx-wallet">
                        ${allWalletOpts}
                    </select>
                </div>
                <div class="form-group">
                    <label>Amount</label>
                    <input type="number" id="tx-amount" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Note / Source</label>
                    <input type="text" id="tx-note" placeholder="Salary, refund, etc.">
                </div>
                <button type="submit" class="btn btn-green">Add Income</button>
            `;
        }

        content.innerHTML = `
            <form id="tx-form" onsubmit="app.handleFormSubmit(event, null, '${type}')">
                ${formInnerHtml}
            </form>
        `;
        modal.classList.add('active');

        this.setupDatePickerHelper();

        if (type === 'expense') {
            this.updateExpenseCategories();
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

        this.openTransactionModal(tx.type);
        document.getElementById('modal-title').innerText = 'Edit Transaction';

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
            delBtn.className = 'btn btn-danger mt-2';
            delBtn.innerText = 'Delete Transaction';
            delBtn.onclick = () => this.deleteTx(id);
            if (form) form.appendChild(delBtn);
            else content.appendChild(delBtn);
        } else {
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

            const btn = content.querySelector('.btn-primary');
            if (btn) btn.innerText = 'Save Changes';
        } else if (tx.type === 'income') {
            const walletSelect = document.getElementById('tx-wallet');
            if (walletSelect) walletSelect.value = tx.walletId;
            const amtInput = document.getElementById('tx-amount');
            if (amtInput) amtInput.value = tx.amount;
            const noteInput = document.getElementById('tx-note');
            if (noteInput) noteInput.value = tx.note || '';

            const btn = content.querySelector('.btn-green');
            if (btn) btn.innerText = 'Save Changes';
        } else if (tx.type === 'transfer') {
            const srcSelect = document.getElementById('tx-source');
            if (srcSelect) srcSelect.value = tx.sourceId;
            const destSelect = document.getElementById('tx-dest');
            if (destSelect) destSelect.value = tx.destId;
            const amtInput = document.getElementById('tx-amount');
            if (amtInput) amtInput.value = tx.amount;
            const noteInput = document.getElementById('tx-note');
            if (noteInput) noteInput.value = tx.note || '';

            const btn = content.querySelector('.btn-blue');
            if (btn) btn.innerText = 'Save Changes';
        } else if (tx.type === 'remittance') {
            const srcSelect = document.getElementById('tx-source');
            if (srcSelect) srcSelect.value = tx.sourceId;
            const destSelect = document.getElementById('tx-dest');
            if (destSelect) destSelect.value = tx.destId;
            const jpyInput = document.getElementById('tx-amount-jpy');
            if (jpyInput) jpyInput.value = tx.sourceAmount;
            const inrInput = document.getElementById('tx-amount-inr');
            if (inrInput) inrInput.value = tx.destAmount;
            const noteInput = document.getElementById('tx-note');
            if (noteInput) noteInput.value = tx.note || '';

            const btn = content.querySelector('.btn-purple');
            if (btn) btn.innerText = 'Save Changes';
        }
    }

    handleFormSubmit(event, editId = null, type) {
        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }

        if (this._isSubmitting) return;

        const dateEl = document.getElementById('tx-date');
        const date = (dateEl && dateEl.value) ? dateEl.value : new Date().toISOString().split('T')[0];

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            alert('Please select a valid date.');
            return;
        }

        if (editId) {
            const found = walletManager.findTransaction(editId);
            if (found && walletManager.isMonthClosed((found.tx.date || '').slice(0, 7))) {
                alert(`Cannot edit transaction in closed month ${(found.tx.date || '').slice(0, 7)}. This historical period is permanently sealed.`);
                return;
            }
        }

        const txMonth = (date || '').slice(0, 7);
        if (walletManager.isMonthClosed(txMonth)) {
            alert(`Cannot record transactions in closed month ${txMonth}. This historical period is permanently sealed.`);
            return;
        }

        let updatedData = { date };

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
                return;
            }
            if (!walletId || !storage.state.wallets[walletId]) {
                alert('Please select a valid wallet.');
                return;
            }
            if (!cat) {
                alert('Please select a category.');
                return;
            }

            if (editId) {
                updatedData = { ...updatedData, walletId, categoryId: cat, amount: amt, note };
            } else {
                this._isSubmitting = true;
                try {
                    walletManager.addExpense(walletId, cat, amt, note, date);
                } finally {
                    this._isSubmitting = false;
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
                return;
            }
            if (!walletId || !storage.state.wallets[walletId]) {
                alert('Please select a valid wallet.');
                return;
            }

            if (editId) {
                updatedData = { ...updatedData, walletId, amount: amt, note };
            } else {
                this._isSubmitting = true;
                try {
                    walletManager.addIncome(walletId, amt, note, date);
                } finally {
                    this._isSubmitting = false;
                }
            }
        } else if (type === 'transfer') {
            const src = document.getElementById('tx-source')?.value;
            const dest = document.getElementById('tx-dest')?.value;
            const amtStr = document.getElementById('tx-amount')?.value;
            const amt = Number(amtStr);
            const note = document.getElementById('tx-note')?.value || '';

            if (!amtStr || isNaN(amt) || amt <= 0) {
                alert('Please enter a valid amount greater than 0.');
                return;
            }
            if (!src || !dest || !storage.state.wallets[src] || !storage.state.wallets[dest]) {
                alert('Please select valid source and destination wallets.');
                return;
            }
            if (src === dest) {
                alert('Source and destination must be different.');
                return;
            }
            if (storage.state.wallets[src].currency !== storage.state.wallets[dest].currency) {
                alert('Cross-currency transfers must use the Remittance tool.');
                return;
            }

            if (editId) {
                updatedData = { ...updatedData, sourceId: src, destId: dest, amount: amt, note };
            } else {
                this._isSubmitting = true;
                try {
                    walletManager.transfer(src, dest, amt, note, date);
                } finally {
                    this._isSubmitting = false;
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

            if (!amtJpyStr || isNaN(amtJpy) || amtJpy <= 0 || !amtInrStr || isNaN(amtInr) || amtInr <= 0) {
                alert('Please enter valid amounts for both JPY and INR.');
                return;
            }
            if (!src || !dest || !storage.state.wallets[src] || !storage.state.wallets[dest]) {
                alert('Please select valid source and destination wallets.');
                return;
            }

            if (editId) {
                updatedData = { ...updatedData, sourceId: src, destId: dest, sourceAmount: amtJpy, destAmount: amtInr, note };
            } else {
                this._isSubmitting = true;
                try {
                    walletManager.remittance(src, dest, amtJpy, amtInr, note, date);
                } finally {
                    this._isSubmitting = false;
                }
            }
        }

        if (editId) {
            this._isSubmitting = true;
            try {
                const ok = walletManager.updateTransaction(editId, updatedData);
                if (!ok) {
                    alert('Could not update transaction.');
                    return;
                }
            } finally {
                this._isSubmitting = false;
            }
        }

        this.closeModal('transaction-modal');
        this.renderAll();
        if (this.currentView === 'transactions-view') {
            this.renderTransactionsPage();
        } else if (this.currentView === 'analytics-view') {
            this.renderAnalyticsPage();
        } else if (this.currentView === 'history-view') {
            this.renderHistory();
        }
    }

    submitEdit(id, type) {
        this.handleFormSubmit(null, id, type);
    }

    deleteTx(id) {
        const found = walletManager.findTransaction(id);
        if (found && walletManager.isMonthClosed((found.tx.date || '').slice(0, 7))) {
            alert(`Cannot delete transaction in closed month ${(found.tx.date || '').slice(0, 7)}. This historical period is permanently sealed.`);
            return;
        }

        if (confirm("Are you sure you want to delete this transaction?")) {
            walletManager.deleteTransaction(id);
            this.closeModal('transaction-modal');
            this.renderAll();
            if (this.currentView === 'transactions-view') {
                this.renderTransactionsPage();
            } else if (this.currentView === 'analytics-view') {
                this.renderAnalyticsPage();
            } else if (this.currentView === 'history-view') {
                this.renderHistory();
            }
        }
    }

    closeModal(id) {
        document.getElementById(id).classList.remove('active');
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

    saveQuickEdit() {
        const type = document.getElementById('quick-edit-type').value;
        const id = document.getElementById('quick-edit-id').value;
        const region = document.getElementById('quick-edit-region').value;
        const amt = Number(document.getElementById('quick-edit-amount').value);

        if (isNaN(amt)) return;

        if (type === 'wallet') {
            this.updateWalletBalance(id, amt);
        } else if (type === 'category') {
            const cat = storage.state.categories[region].find(c => c.id === id);
            if (cat) {
                cat.budget = amt;
                storage.saveData();
                this.renderAll();
            }
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

            html = others.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            if (utils.length > 0) {
                html += `<option value="utility-group">Utilities</option>`;
                if (subSelect) {
                    subSelect.innerHTML = utils.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                }
            }
        } else {
            const activeIN = (storage.state.categories[region] || []).filter(c => c.isActive !== false);
            html = activeIN.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        catSelect.innerHTML = html;
        this.handleCategoryChange();
    }

    submitExpense() {
        this.handleFormSubmit(null, null, 'expense');
    }

    submitTransfer() {
        this.handleFormSubmit(null, null, 'transfer');
    }

    submitRemittance() {
        this.handleFormSubmit(null, null, 'remittance');
    }

    submitIncome() {
        this.handleFormSubmit(null, null, 'income');
    }

    renderAll() {
        this.renderWallets();
        this.renderLoanTracker();
        this.renderCategories();
        this.renderTransactions();
        this.renderMonthlySummary();
        this.renderDashboardExpenseChart();
        this.renderWalletsPage();

        this.renderSettings();
        lucide.createIcons();
    }

    clearViewsOnLogout() {
        this.setPrivacyHidden(true);
        this.clearInactivityTimer();
        this.viewingMonthKey = null;
        if (this.renderedHistoryCharts && typeof this.renderedHistoryCharts.clear === 'function') {
            this.renderedHistoryCharts.clear();
        }
        this._hasInit = false;

        const elIds = [
            'jp-wallets-list', 'in-wallets-list',
            'jp-categories-list', 'in-categories-list',
            'recent-transactions-list', 'settings-wallets-list',
            'settings-categories-list', 'settings-in-categories-list'
        ];
        elIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });

        const jpBal = document.getElementById('jp-total-balance');
        if (jpBal) jpBal.innerText = '******';
        const inBal = document.getElementById('in-total-balance');
        if (inBal) inBal.innerText = '******';

        const loanWidget = document.getElementById('loan-tracker-widget');
        if (loanWidget) loanWidget.style.display = 'none';

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
                        <div class="draggable-item" data-id="${w.id}" data-type="wallet" draggable="true" style="padding:12px 0; border-bottom:1px solid var(--border);">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="display:flex; align-items:center; gap:8px; font-size:0.9rem;">
                                    <span style="width:10px;height:10px;border-radius:50%;background:${w.color};flex-shrink:0;"></span>
                                    <i data-lucide="${icon}"></i> ${w.id} <small class="text-muted">(${w.currency})</small>
                                </span>
                                <input type="number" value="${w.balance}" onblur="app.updateWalletBalance('${w.id}', this.value)" style="width:100px;">
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

        // Regional preferences
        const reg = storage.state.regionalPreferences;
        const countryEl = document.getElementById('setting-default-country');
        if (countryEl) countryEl.value = reg.defaultCountry || 'JP';

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
            syncStatusEl.innerText = (typeof supabaseClient !== 'undefined' && supabaseClient.session) ? 'Connected & Synced' : 'Connected (nyetklojxqnawdtrrhma)';
        }
        const lastSyncedEl = document.getElementById('about-last-synced');
        if (lastSyncedEl) {
            lastSyncedEl.innerText = this.lastSyncTime ? new Date(this.lastSyncTime).toLocaleTimeString() : 'Just now';
        }
    }

    switchSettingsSection(sectionId) {
        this.currentSettingsSection = sectionId;
        const tabs = document.querySelectorAll('.settings-tab-btn');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-section') === sectionId) {
                tab.classList.add('active');
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
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
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

    updateUserProfile(field, value) {
        if (!storage.state.userProfile) storage.state.userProfile = {};
        storage.state.userProfile[field] = value.trim();
        storage.saveData();
        this.updateDesktopAccountInfo();
    }

    updateRegionalPreference(field, value) {
        if (!storage.state.regionalPreferences) {
            storage.state.regionalPreferences = { ...defaultState.regionalPreferences };
        }
        storage.state.regionalPreferences[field] = value;
        storage.saveData();
        // Changing regional presentation does NOT rewrite historical ledger amounts or wallet currencies
        this.renderAll();
    }

    updatePrivacyPreference(field, value) {
        if (!storage.state.privacyPreferences) {
            storage.state.privacyPreferences = { ...defaultState.privacyPreferences };
        }
        storage.state.privacyPreferences[field] = value;
        storage.saveData();

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
        reader.onload = (e) => {
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
                    this._pendingRestoreData = parsed;
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

    confirmRestore() {
        if (!this._pendingRestoreData) {
            alert('No valid backup data selected.');
            return;
        }
        const confirmed = confirm('WARNING: Restoring will overwrite all current wallets, transactions, and report snapshots with this backup. This cannot be undone. Are you sure you want to proceed?');
        if (!confirmed) return;

        try {
            const migrated = storage.migrateToContinuousLedger(this._pendingRestoreData);
            storage._attachHistoryGetters(migrated);
            storage.state = migrated;
            storage.saveData();
            this._pendingRestoreData = null;
            this.cancelRestore();
            alert('Backup successfully restored! Refreshing workspace...');
            this.init();
            this.renderAll();
        } catch (err) {
            alert('Restoration error: ' + err.message);
        }
    }

    updateWalletBalance(id, val) {
        if (val === '' || isNaN(val)) return;
        if (storage.state.wallets[id]) {
            storage.state.wallets[id].balance = Number(val);
            storage.saveData();
            this.renderWallets();
        }
    }

    removeCategory(region, id) {
        if (!confirm('Remove this category?')) return;
        storage.state.categories[region] = storage.state.categories[region].filter(c => c.id !== id);
        storage.saveData();
        this.renderSettings();
        lucide.createIcons();
    }

    addCategory(region) {
        const nameEl = document.getElementById(`new-cat-name-${region}`);
        const name = nameEl ? nameEl.value.trim() : '';
        if (!name) return alert('Please enter a category name.');

        const id = region.toLowerCase() + '-' + name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
        const newCat = { id, name, icon: 'tag' };

        if (region === 'JP') {
            const budgetEl = document.getElementById(`new-cat-budget-${region}`);
            newCat.budget = budgetEl ? Number(budgetEl.value) || 0 : 0;
        }

        storage.state.categories[region].push(newCat);
        storage.saveData();
        this.renderSettings();
        lucide.createIcons();
    }

    updateCategoryBudget(id, val) {
        if (val === '' || isNaN(val)) return;
        const cat = storage.state.categories.JP.find(c => c.id === id);
        if (cat) {
            cat.budget = Number(val);
            storage.saveData();
        }
    }

    // Converts a hex color into inline gradient styles for wallet cards
    getWalletStyle(hexColor) {
        const hex = (hexColor || '#3351d6').replace('#', '');
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

    addWallet() {
        const name = (document.getElementById('new-wallet-name').value || '').trim();
        if (!name) return alert('Please enter a wallet name.');
        if (storage.state.wallets[name]) return alert('A wallet with this name already exists.');

        const type = document.getElementById('new-wallet-type').value;
        const region = document.getElementById('new-wallet-region').value;
        const color = document.getElementById('new-wallet-color').value || WALLET_COLORS[0];
        const currency = region === 'JP' ? '¥' : '₹';

        storage.state.wallets[name] = { id: name, type, region, balance: 0, currency, color };
        storage.saveData();
        this.renderAll();
        this.renderSettings();
        lucide.createIcons();
    }

    removeWallet(id) {
        const txCount = storage.state.transactions.filter(tx =>
            tx.walletId === id || tx.sourceId === id || tx.destId === id
        ).length;
        const msg = txCount > 0
            ? `"${id}" has ${txCount} transaction(s). They stay in history but wallet will be removed. Continue?`
            : `Remove wallet "${id}"?`;
        if (!confirm(msg)) return;
        delete storage.state.wallets[id];
        storage.saveData();
        this.renderAll();
        this.renderSettings();
        lucide.createIcons();
    }

    updateWalletColor(id, color) {
        if (storage.state.wallets[id]) {
            storage.state.wallets[id].color = color;
            storage.saveData();
            this.renderWallets();
            this.renderSettings();
            lucide.createIcons();
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

    reorderWallets(draggedId, targetId) {
        const keys = Object.keys(storage.state.wallets);
        const draggedIndex = keys.indexOf(draggedId);
        const targetIndex = keys.indexOf(targetId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;
        
        keys.splice(draggedIndex, 1);
        keys.splice(targetIndex, 0, draggedId);
        
        const newWallets = {};
        keys.forEach(k => newWallets[k] = storage.state.wallets[k]);
        storage.state.wallets = newWallets;
        
        storage.saveData();
        this.renderAll();
        this.renderSettings();
        lucide.createIcons();
    }

    reorderCategories(region, draggedId, targetId) {
        const cats = storage.state.categories[region];
        const draggedIndex = cats.findIndex(c => c.id === draggedId);
        const targetIndex = cats.findIndex(c => c.id === targetId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;
        
        const [draggedItem] = cats.splice(draggedIndex, 1);
        cats.splice(targetIndex, 0, draggedItem);
        
        storage.saveData();
        this.renderSettings();
        lucide.createIcons();
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
        const W = canvas.clientWidth, H = canvas.clientHeight;
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
        const W = canvas.clientWidth, H = canvas.clientHeight;
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
        let jpTotal = 0, inTotal = 0;
        let jpCount = 0, inCount = 0;
        let jpHtml = '', inHtml = '';

        Object.values(storage.state.wallets).forEach(w => {
            const ws = this.getWalletStyle(w.color);
            const icon = w.type === 'bank' ? 'landmark' : w.type === 'card' ? 'credit-card' : w.type === 'cash' ? 'banknote' : 'smartphone';
            const html = `
                <div class="wallet-item" onclick="app.openWalletFocus('${w.id}')" style="cursor:pointer; ${ws.card}">
                    <div class="wallet-name" style="color:${ws.text};">
                        <i data-lucide="${icon}"></i>
                        ${w.id}
                    </div>
                    <div class="wallet-balance" style="color:${ws.text};">${this.formatMoney(w.balance, w.currency)}</div>
                </div>
            `;
            if (w.region === 'JP') {
                jpHtml += html;
                jpTotal += (w.balance || 0);
                jpCount++;
            } else {
                inHtml += html;
                inTotal += (w.balance || 0);
                inCount++;
            }
        });

        const jpel = document.getElementById('jp-wallets');
        if (jpel) jpel.innerHTML = jpHtml;
        const inel = document.getElementById('in-wallets');
        if (inel) inel.innerHTML = inHtml;

        const jpTotalEl = document.getElementById('jp-total-balance');
        if (jpTotalEl) jpTotalEl.innerText = this.formatMoney(jpTotal, '¥');
        const inTotalEl = document.getElementById('in-total-balance');
        if (inTotalEl) inTotalEl.innerText = this.formatMoney(inTotal, '₹');

        const jpCountBadge = document.getElementById('jp-wallet-count-badge');
        if (jpCountBadge) jpCountBadge.innerText = `${jpCount} ${jpCount === 1 ? 'account' : 'accounts'}`;
        const inCountBadge = document.getElementById('in-wallet-count-badge');
        if (inCountBadge) inCountBadge.innerText = `${inCount} ${inCount === 1 ? 'account' : 'accounts'}`;

        // Refresh Dashboard Category Breakdown Chart (Pass 1 Requirement 6.B)
        this.renderDashboardExpenseChart();

        // Update Month Header
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        let headerStr = "";
        const mKey = this.activeMonthKey;
        if (mKey) {
            const [y, m] = mKey.split('-');
            headerStr = `${monthNames[parseInt(m) - 1]} ${y}`;
            if (this.isViewingPast()) {
                headerStr = `<span style="color:var(--orange)">${headerStr} (Past)</span>`;
            }
        }
        const disp = document.getElementById('current-month-display');
        if (disp) disp.innerHTML = headerStr;
        const desktopDisp = document.getElementById('desktop-current-month-display');
        if (desktopDisp) desktopDisp.innerHTML = headerStr;

        // Clear inline overrides so CSS responsive 3-column desktop layout applies
        ['jp-categories-grid', 'in-categories-grid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = '';
                el.style.gridTemplateColumns = '';
                el.style.gap = '';
            }
        });

        const jpTotalSpent = walletManager.getTotalSpent('JP', this.getActiveTransactions());
        this.renderBudgetOverviewCard('budget-overview-card', {
            region: 'JP',
            monthKey: this.activeMonthKey,
            totalSpent: jpTotalSpent,
            allocatedBudget: storage.state.jpTotalBudget,
            isInteractive: true,
            showEditButton: true
        });

        this.renderWalletsPage();
    }

    renderBudgetOverviewCard(target, options = {}) {
        const el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el) return;

        const region = options.region || 'JP';
        const isJp = region === 'JP';
        const currency = isJp ? '¥' : '₹';
        const monthKey = options.monthKey || this.activeMonthKey || (storage.state && storage.state.currentMonthKey) || new Date().toISOString().slice(0, 7);

        // Sum category limits for cushion calculation
        const cats = (storage.state.categories && storage.state.categories[region]) || [];
        const sumCatBudgets = cats
            .filter(c => c.contributesToTotalBudget !== false && c.isActive !== false)
            .reduce((s, c) => s + (c.budget || 0), 0);

        // Overall allocated budget for region
        let allocatedBudget;
        if (options.allocatedBudget !== undefined && options.allocatedBudget !== null) {
            allocatedBudget = Number(options.allocatedBudget) || 0;
        } else {
            allocatedBudget = isJp
                ? (storage.state.jpTotalBudget !== undefined && storage.state.jpTotalBudget !== null ? storage.state.jpTotalBudget : 0)
                : (storage.state.inTotalBudget !== undefined && storage.state.inTotalBudget !== null ? storage.state.inTotalBudget : sumCatBudgets);
        }

        // Total spent in region for active month
        let totalSpent;
        if (options.totalSpent !== undefined && options.totalSpent !== null) {
            totalSpent = Number(options.totalSpent) || 0;
        } else {
            totalSpent = walletManager.getTotalSpent(region, this.getActiveTransactions());
        }

        const remaining = allocatedBudget - totalSpent;
        const isOver = remaining < 0;
        const pct = allocatedBudget > 0 ? Math.min((totalSpent / allocatedBudget) * 100, 100) : 0;
        const utilizationPct = allocatedBudget > 0 ? Math.round((totalSpent / allocatedBudget) * 100) : 0;
        const cushion = Math.max(0, allocatedBudget - sumCatBudgets);

        let barClass = 'neon-safe';
        if (pct > 90 || utilizationPct > 100) barClass = 'neon-danger';
        else if (pct > 75 || utilizationPct >= 75) barClass = 'neon-warn';

        const editButtonHtml = options.showEditButton ? `
            <button class="budgets-kpi-edit-btn" onclick="event.stopPropagation(); app.openOverallBudgetModal('${region}')" title="Configure Overall Monthly Limit" style="margin-left: 6px; cursor: pointer;">
                <i data-lucide="sliders" style="width: 13px; height: 13px;"></i>
            </button>
        ` : '';

        const cardContent = `
            <div class="budget-central-header">
                <div class="budget-central-title-group">
                    ${this.getCountryFlagSvg(region, 20, 15)}
                    <h3>Monthly Budget</h3>
                    <span class="text-xs text-muted font-numeric">(${monthKey})</span>
                    ${cushion > 0 ? `<span class="budget-cushion-pill privacy-blur">+${this.formatMoney(cushion, currency)} cushion</span>` : ''}
                    ${editButtonHtml}
                </div>
                <div class="budget-remaining-hero">
                    <span class="remaining-val privacy-blur ${isOver ? 'text-danger' : ''}">${this.formatMoney(remaining, currency)}</span>
                    <span class="remaining-label">${isOver ? 'over budget' : 'remaining'}</span>
                </div>
            </div>
            <div class="budget-central-progress-wrap">
                <div class="budget-streak-track">
                    <div class="budget-streak-fill ${barClass}" style="width: ${pct}%;"></div>
                </div>
            </div>
            <div class="budget-central-stats-row">
                <span class="privacy-blur">Spent: <strong>${this.formatMoney(totalSpent, currency)}</strong></span>
                <span class="text-xs text-muted font-numeric">${utilizationPct}% used</span>
                <span class="privacy-blur">Total Allocation: <strong>${this.formatMoney(allocatedBudget, currency)}</strong></span>
            </div>
        `;

        if (el.classList.contains('budget-central-card')) {
            el.innerHTML = cardContent;
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
            const interactiveAttr = options.isInteractive ? `onclick="app.openOverallBudgetModal('${region}')" style="cursor: pointer;" title="Configure Overall Monthly Limit"` : '';
            const interactiveCls = options.isInteractive ? ' interactive' : '';
            el.innerHTML = `<div class="card budget-central-card${interactiveCls}" ${interactiveAttr}>${cardContent}</div>`;
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    renderCategories() {
        const renderGrid = (region, elementId, showProgress) => {
            const activeTxs = this.getActiveTransactions();
            const totals = {};
            activeTxs.forEach(tx => {
                if (tx.type === 'expense' && tx.region === region) {
                    totals[tx.categoryId] = (totals[tx.categoryId] || 0) + tx.amount;
                }
            });

            let html = '';
            const currency = region === 'JP' ? '¥' : '₹';

            // Filter out archived categories and those configured hidden from overview
            const cats = (storage.state.categories[region] || []).filter(c => c.isActive !== false && !c.hiddenFromBudgetOverview);

            cats.forEach(c => {
                const spent = totals[c.id] || 0;
                let progressHtml = '';

                const activeBudget = c.budget || 0;

                if (showProgress && activeBudget > 0) {
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
                    <div class="neon-row" style="padding: 14px; cursor: pointer;" onclick="app.openCategoryManageModal('${c.id}', '${region}')" title="Click to manage ${c.name}">
                        <div class="neon-header" style="margin-bottom: 8px;">
                            <span class="neon-title"><i data-lucide="${c.icon || 'tag'}"></i> ${c.name}</span>
                        </div>
                        ${progressHtml}
                    </div>
                `;
            });
            const el = document.getElementById(elementId);
            if (el) el.innerHTML = html;
        };

        renderGrid('JP', 'jp-categories-grid', true);
        renderGrid('IN', 'in-categories-grid', false);
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
            container.innerHTML = `
                <div class="dash-recent-empty">
                    <i data-lucide="receipt" class="dash-recent-empty-icon"></i>
                    <p class="dash-recent-empty-text">No activity recorded for this period.</p>
                </div>
            `;
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                lucide.createIcons();
            }
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
                title = tx.note || 'Remittance';
                meta = `${dateStr} • Japan → India`;
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
                ? (this.isPrivacyHidden ? '******' : `¥${(tx.sourceAmount || 0).toLocaleString()} → ₹${(tx.destAmount || 0).toLocaleString()}`)
                : this.formatMoney(tx.amount, tx.currency, { prefix: sign });

            html += `
                <div class="dash-recent-row" onclick="app.editTransaction('${tx.id}')" role="button" tabindex="0" title="Click to view/edit">
                    <div class="dash-recent-left">
                        <div class="dash-recent-icon-wrap ${typeCls}">
                            <i data-lucide="${icon}"></i>
                        </div>
                        <div class="dash-recent-info">
                            <span class="dash-recent-title">${title}</span>
                            <span class="dash-recent-meta">${meta}</span>
                        </div>
                    </div>
                    <div class="dash-recent-right">
                        <span class="dash-recent-amount ${amountCls} privacy-blur financial-amount">${amt}</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    renderMonthlySummary() {
        const summaryEl = document.getElementById('monthly-financial-summary');
        if (!summaryEl) return;

        const activeTxs = this.getActiveTransactions();
        let jpIncome = 0;
        let jpExpenses = 0;
        let inExpenses = 0;
        let inIncome = 0;

        activeTxs.forEach(tx => {
            const amt = Number(tx.amount) || 0;
            if (tx.region === 'JP') {
                if (tx.type === 'income') jpIncome += amt;
                else if (tx.type === 'expense') jpExpenses += amt;
            } else if (tx.region === 'IN') {
                if (tx.type === 'income') inIncome += amt;
                else if (tx.type === 'expense') inExpenses += amt;
            }
        });

        const jpNet = jpIncome - jpExpenses;
        const jpSavingsRate = jpIncome > 0 ? Math.max(0, Math.round((jpNet / jpIncome) * 100)) : 0;
        const netSavingsClass = jpNet >= 0 ? 'stat-positive' : 'stat-negative';
        const netSavingsSign = jpNet > 0 ? '+' : '';
        const savingsRateColor = jpSavingsRate >= 20 ? 'var(--emerald)' : jpSavingsRate >= 10 ? 'var(--amber)' : 'var(--text-muted)';

        summaryEl.innerHTML = `
            <div class="monthly-stat-card">
                <div class="monthly-stat-header">
                    <span class="monthly-stat-label">Monthly Income</span>
                    <span class="monthly-stat-trend trend-positive">
                        <i data-lucide="trending-up"></i> JP Inflow
                    </span>
                </div>
                <div class="monthly-stat-value privacy-blur financial-amount" style="color: var(--emerald);">
                    ${this.formatMoney(jpIncome, '¥', { prefix: '+' })}
                </div>
                <div class="monthly-stat-sub">Japan inflows this month</div>
            </div>

            <div class="monthly-stat-card">
                <div class="monthly-stat-header">
                    <span class="monthly-stat-label">Total Outflows</span>
                    <span class="monthly-stat-trend trend-negative">
                        <i data-lucide="trending-down"></i> JP Outflow
                    </span>
                </div>
                <div class="monthly-stat-value privacy-blur financial-amount" style="color: var(--rose);">
                    ${this.formatMoney(jpExpenses, '¥', { prefix: '-' })}
                </div>
                <div class="monthly-stat-sub">Japan expenses this month</div>
            </div>

            <div class="monthly-stat-card">
                <div class="monthly-stat-header">
                    <span class="monthly-stat-label">Net Savings</span>
                    <span class="monthly-stat-trend ${jpNet >= 0 ? 'trend-positive' : 'trend-negative'}">
                        <i data-lucide="${jpNet >= 0 ? 'sparkles' : 'alert-circle'}"></i> JP Net
                    </span>
                </div>
                <div class="monthly-stat-value privacy-blur financial-amount ${netSavingsClass}">
                    ${this.formatMoney(jpNet, '¥', { prefix: netSavingsSign })}
                </div>
                <div class="monthly-stat-sub">Inflows minus outflows</div>
            </div>
        `;
        lucide.createIcons();
    }

    setDashboardChartRegion(region) {
        if (region !== 'JP' && region !== 'IN') return;
        this.dashboardChartRegion = region;
        const jpBtn = document.getElementById('dash-region-jp-btn');
        const inBtn = document.getElementById('dash-region-in-btn');
        if (jpBtn && inBtn) {
            jpBtn.classList.toggle('active', region === 'JP');
            jpBtn.setAttribute('aria-selected', region === 'JP' ? 'true' : 'false');
            inBtn.classList.toggle('active', region === 'IN');
            inBtn.setAttribute('aria-selected', region === 'IN' ? 'true' : 'false');
        }
        this.renderDashboardExpenseChart();
    }

    renderDashboardExpenseChart() {
        if (this.currentView !== 'home-view') return;
        const canvas = document.getElementById('dashboard-category-donut');
        if (!canvas) return;

        const region = this.dashboardChartRegion || 'JP';
        const currency = region === 'JP' ? '¥' : '₹';
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
        const jpGrid = document.getElementById('wallets-page-jp-grid');
        const inGrid = document.getElementById('wallets-page-in-grid');
        if (!jpGrid || !inGrid) return;

        let jpCount = 0;
        let inCount = 0;
        let jpTotal = 0;
        let inTotal = 0;

        const chipSvg = this.getCardChipSvg();
        const contactlessSvg = this.getContactlessSvg();

        const allWallets = Object.values(storage.state.wallets || {});
        const jpWallets = allWallets.filter(w => w.region === 'JP').sort((a, b) => this.getWalletSortRank(a) - this.getWalletSortRank(b));
        const inWallets = allWallets.filter(w => w.region !== 'JP').sort((a, b) => this.getWalletSortRank(a) - this.getWalletSortRank(b));

        const renderCard = (w) => {
            const theme = this.getThemeForWallet(w);
            const isSecondary = this.isSecondaryWallet(w);
            const secondaryCls = isSecondary ? ' wallet-card-secondary' : '';
            const secondaryBadge = isSecondary ? '<span class="wallet-badge-secondary">Secondary</span>' : '';

            return `
                <div class="wallet-card ${theme.cls}${secondaryCls}" onclick="app.openWalletFocus('${w.id}')" title="Click to inspect ${w.id}" role="button" tabindex="0">
                    <div class="wallet-card-overlay-sheen"></div>
                    <div class="wallet-card-header">
                        <div class="wallet-card-chip-group">
                            ${chipSvg}
                            ${contactlessSvg}
                        </div>
                        <div class="wallet-card-top-right">
                            ${secondaryBadge}
                            <button class="wallet-menu-btn" onclick="event.stopPropagation(); app.openEditWalletModal('${w.id}')" title="Edit wallet settings" aria-label="Edit wallet ${w.id}">
                                <i data-lucide="more-vertical" style="width: 15px; height: 15px;"></i>
                            </button>
                        </div>
                    </div>
                    <div class="wallet-balance-wrap">
                        <span class="wallet-balance-label">Current Balance</span>
                        <div class="wallet-balance-val financial-amount privacy-blur">${this.formatMoney(w.balance, w.currency)}</div>
                    </div>
                    <div class="wallet-card-footer">
                        <div class="wallet-name">${w.id}</div>
                    </div>
                </div>
            `;
        };

        let jpHtml = '';
        jpWallets.forEach(w => {
            jpHtml += renderCard(w);
            jpCount++;
            jpTotal += (w.balance || 0);
        });

        let inHtml = '';
        inWallets.forEach(w => {
            inHtml += renderCard(w);
            inCount++;
            inTotal += (w.balance || 0);
        });

        jpGrid.innerHTML = jpHtml || '<p class="text-muted text-sm" style="grid-column: 1/-1; padding: 32px 16px; text-align: center;">No Japan wallets created yet.</p>';
        inGrid.innerHTML = inHtml || '<p class="text-muted text-sm" style="grid-column: 1/-1; padding: 32px 16px; text-align: center;">No India wallets created yet.</p>';

        const jpCountEl = document.getElementById('wallets-page-jp-count');
        if (jpCountEl) jpCountEl.innerText = `${jpCount} ${jpCount === 1 ? 'account' : 'accounts'}`;

        const inCountEl = document.getElementById('wallets-page-in-count');
        if (inCountEl) inCountEl.innerText = `${inCount} ${inCount === 1 ? 'account' : 'accounts'}`;

        const jpSectionCount = document.getElementById('wallets-section-jp-count');
        if (jpSectionCount) jpSectionCount.innerText = `${jpCount} ${jpCount === 1 ? 'account' : 'accounts'}`;

        const inSectionCount = document.getElementById('wallets-section-in-count');
        if (inSectionCount) inSectionCount.innerText = `${inCount} ${inCount === 1 ? 'account' : 'accounts'}`;

        const jpTotalEl = document.getElementById('wallets-page-jp-total');
        if (jpTotalEl) jpTotalEl.innerText = this.formatMoney(jpTotal, '¥');

        const inTotalEl = document.getElementById('wallets-page-in-total');
        if (inTotalEl) inTotalEl.innerText = this.formatMoney(inTotal, '₹');

        const jpSectionTotal = document.getElementById('wallets-section-jp-total');
        if (jpSectionTotal) jpSectionTotal.innerText = this.formatMoney(jpTotal, '¥');

        const inSectionTotal = document.getElementById('wallets-section-in-total');
        if (inSectionTotal) inSectionTotal.innerText = this.formatMoney(inTotal, '₹');

        lucide.createIcons();
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
        const isJp = region === 'JP';
        const currency = isJp ? '¥' : '₹';
        const flagSvg = this.getCountryFlagSvg(region, 22, 16.5);
        const countryName = isJp ? 'Japan' : 'India';
        const cardThemeCls = isJp ? 'country-card-jp' : 'country-card-in';

        let total = 0;
        const regionWallets = [];
        Object.values(storage.state.wallets).forEach(w => {
            if (w.region === region) {
                regionWallets.push(w);
                total += (w.balance || 0);
            }
        });

        const overlay = document.getElementById('focus-overlay');
        const typeBadge = document.getElementById('focus-type-badge');
        const modalTitle = document.getElementById('focus-modal-title');
        const primaryPanel = document.getElementById('focus-primary-panel');
        const secondaryPanel = document.getElementById('focus-secondary-panel');

        if (!overlay || !primaryPanel || !secondaryPanel) return;

        typeBadge.innerText = 'Country Portfolio';
        modalTitle.innerText = `${countryName} Overview`;

        primaryPanel.innerHTML = `
            <div class="country-card ${cardThemeCls} expanded" style="padding: 26px; cursor: default; transform: none; min-height: 250px; display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-lg); position: relative; overflow: hidden; box-shadow: 0 16px 36px -10px rgba(0,0,0,0.6);">
                <div class="wallet-card-overlay-sheen"></div>
                <div class="country-card-header" style="display: flex; justify-content: space-between; align-items: center; z-index: 2;">
                    <div class="country-badge" style="display: flex; align-items: center; gap: 8px;">
                        ${flagSvg}
                        <span class="country-name" style="font-weight: 600; font-size: 1.1rem; color: #fff;">${countryName}</span>
                        <span class="currency-code" style="font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; background: rgba(255,255,255,0.15); font-weight: 500; color: #fff;">${isJp ? 'JPY' : 'INR'}</span>
                    </div>
                    <span class="wallet-count-pill" style="font-size: 0.75rem; padding: 4px 10px; border-radius: 9999px; background: rgba(0,0,0,0.35); color: #fff; font-weight: 500; border: 1px solid rgba(255,255,255,0.12);">${regionWallets.length} ${regionWallets.length === 1 ? 'Account' : 'Accounts'}</span>
                </div>
                <div class="country-balance-body" style="margin: 22px 0; z-index: 2;">
                    <span class="balance-label" style="font-size: 0.74rem; font-weight: 500; opacity: 0.8; color: #fff; display: block; margin-bottom: 4px;">Total Portfolio Balance</span>
                    <div class="country-total-amount financial-amount privacy-blur" style="font-size: 2.3rem; font-weight: 600; color: #fff; font-family: var(--font-numeric); letter-spacing: -0.02em;">
                        ${this.formatMoney(total, currency)}
                    </div>
                </div>
                <div style="display: flex; gap: 10px; z-index: 2;">
                    <button class="btn btn-secondary" style="flex: 1; background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.22); color: #fff; font-size: 0.82rem; padding: 8px 14px;" onclick="app.closeFocusOverlay(); app.openTransactionModal('expense');">
                        <i data-lucide="plus" style="width:14px; height:14px; margin-right:4px;"></i> Log Expense
                    </button>
                    <button class="btn btn-secondary" style="flex: 1; background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.22); color: #fff; font-size: 0.82rem; padding: 8px 14px;" onclick="app.closeFocusOverlay(); app.openTransactionModal('income');">
                        <i data-lucide="arrow-down-left" style="width:14px; height:14px; margin-right:4px;"></i> Log Income
                    </button>
                </div>
            </div>
        `;

        let walletsListHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary); margin: 0;">Associated Accounts (${regionWallets.length})</h4>
                <span class="text-muted text-xs">Click any wallet to focus</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; padding-right: 4px;">
        `;

        if (regionWallets.length === 0) {
            walletsListHtml += `<p class="text-muted text-sm" style="text-align: center; padding: 32px 0;">No accounts found for ${countryName}.</p>`;
        } else {
            regionWallets.forEach(w => {
                const theme = this.getThemeForWallet(w);
                const icon = w.type === 'bank' ? 'landmark' : w.type === 'card' ? 'credit-card' : w.type === 'cash' ? 'banknote' : 'smartphone';
                walletsListHtml += `
                    <div class="wallet-item-compact ${theme.cls}" onclick="app.openWalletFocus('${w.id}')" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: var(--radius-md); cursor: pointer; transition: transform 160ms var(--ease-out), box-shadow 160ms var(--ease-out); border: 1px solid rgba(255,255,255,0.1);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="${icon}" style="width: 16px; height: 16px; color: #fff;"></i>
                            </div>
                            <div>
                                <div style="font-weight: 600; color: #fff; font-size: 0.9rem;">${w.id}</div>
                                <div style="font-size: 0.74rem; color: rgba(255,255,255,0.7);">${w.type || 'Account'} • ${w.currency}</div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div class="financial-amount privacy-blur" style="font-family: var(--font-numeric); font-weight: 600; color: #fff; font-size: 1.05rem;">
                                ${this.formatMoney(w.balance, w.currency)}
                            </div>
                            <span style="font-size: 0.72rem; color: rgba(255,255,255,0.65);">View details →</span>
                        </div>
                    </div>
                `;
            });
        }
        walletsListHtml += `</div>`;
        secondaryPanel.innerHTML = walletsListHtml;

        overlay.style.display = 'flex';
        void overlay.offsetWidth;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        lucide.createIcons();
    }

    openWalletFocus(walletId, sourceEl = null) {
        const w = storage.state.wallets[walletId];
        if (!w) return;

        // Capture source rect for FLIP morphing transition
        let sourceRect = null;
        if (sourceEl && typeof sourceEl.getBoundingClientRect === 'function') {
            sourceRect = sourceEl.getBoundingClientRect();
        } else if (window.event) {
            const evTarget = window.event.currentTarget || window.event.target;
            const clickedCard = evTarget?.closest ? evTarget.closest('.wallet-item, .wallet-item-compact, .wallet-card') : null;
            if (clickedCard) sourceRect = clickedCard.getBoundingClientRect();
        }
        if (!sourceRect) {
            const candidate = document.querySelector(`[onclick*="'${walletId}'"]`);
            if (candidate) sourceRect = candidate.getBoundingClientRect();
        }

        const theme = this.getThemeForWallet(w);
        const chipSvg = this.getCardChipSvg();
        const contactlessSvg = this.getContactlessSvg();
        const isSecondary = this.isSecondaryWallet(w);
        const secondaryCls = isSecondary ? ' wallet-card-secondary' : '';
        const secondaryBadge = isSecondary ? '<span class="wallet-badge-secondary">Secondary</span>' : '';

        const overlay = document.getElementById('focus-overlay');
        const typeBadge = document.getElementById('focus-type-badge');
        const modalTitle = document.getElementById('focus-modal-title');
        const primaryPanel = document.getElementById('focus-primary-panel');
        const secondaryPanel = document.getElementById('focus-secondary-panel');

        if (!overlay || !primaryPanel || !secondaryPanel) return;

        typeBadge.innerText = 'Account Focus';
        modalTitle.innerText = `${w.id}`;

        primaryPanel.innerHTML = `
            <div class="wallet-card ${theme.cls}${secondaryCls}" style="padding: 24px; cursor: default; transform: none; min-height: 220px; display: flex; flex-direction: column; justify-content: space-between; border-radius: 18px; position: relative; overflow: hidden; box-shadow: 0 16px 36px -10px rgba(0,0,0,0.6);">
                <div class="wallet-card-overlay-sheen"></div>
                <div class="wallet-card-header" style="display: flex; justify-content: space-between; align-items: center; z-index: 2;">
                    <div class="wallet-card-chip-group" style="display: flex; align-items: center; gap: 10px;">
                        ${chipSvg}
                        ${contactlessSvg}
                    </div>
                    ${secondaryBadge}
                </div>
                <div class="wallet-balance-wrap" style="margin: 20px 0; z-index: 2;">
                    <span class="wallet-balance-label" style="font-size: 0.74rem; font-weight: 500; color: rgba(255,255,255,0.65); display: block; margin-bottom: 4px;">Current Balance</span>
                    <div class="wallet-balance-val financial-amount privacy-blur" style="font-size: 2.25rem; font-weight: 600; color: #fff; font-family: var(--font-numeric); letter-spacing: -0.02em;">
                        ${this.formatMoney(w.balance, w.currency)}
                    </div>
                </div>
                <div class="wallet-card-footer" style="display: flex; justify-content: space-between; align-items: flex-end; z-index: 2;">
                    <div class="wallet-name" style="font-size: 1.15rem; font-weight: 500; color: rgba(255, 255, 255, 0.92); letter-spacing: 0.01em;">${w.id}</div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px;">
                <button class="btn btn-primary" onclick="app.openAddTxForWallet('${w.id}')">
                    <i data-lucide="plus" style="width: 14px; height: 14px; margin-right: 6px;"></i> <span>Log Expense</span>
                </button>
                <button class="btn btn-secondary" onclick="app.openTransferForWallet('${w.id}')">
                    <i data-lucide="arrow-left-right" style="width: 14px; height: 14px; margin-right: 6px;"></i> <span>Transfer</span>
                </button>
            </div>
            <div style="margin-top: 8px;">
                <button class="btn btn-secondary" style="width: 100%; font-size: 0.82rem;" onclick="app.openEditWalletModal('${w.id}')">
                    <i data-lucide="edit-2" style="width: 14px; height: 14px; margin-right: 6px;"></i> <span>Edit Account Details</span>
                </button>
            </div>
        `;

        const txs = walletManager.getTransactions({ walletId: w.id });
        const recentTxs = txs.slice(0, 15);

        let txHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary); margin: 0;">Account Activity</h4>
                <span class="text-muted text-xs">${txs.length} ${txs.length === 1 ? 'transaction' : 'transactions'}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 420px; overflow-y: auto; padding-right: 4px;">
        `;

        if (recentTxs.length === 0) {
            txHtml += `
                <div style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
                    <i data-lucide="receipt" style="width: 36px; height: 36px; opacity: 0.4; margin-bottom: 10px;"></i>
                    <div style="font-weight: 500; font-size: 0.9rem;">No transactions found</div>
                    <div style="font-size: 0.78rem; opacity: 0.8; margin-top: 4px;">New expenses, income or transfers logged to ${w.id} will appear here.</div>
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
                    colorCls = 'text-muted';
                    sign = '-';
                    label = 'Remittance JP → IN';
                }

                const formattedDate = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                const metaParts = [formattedDate, catName, (tx.note && tx.note !== label ? tx.note : '')].filter(Boolean);
                const metaLine = metaParts.join(' • ');
                txHtml += `
                    <div class="tx-row" onclick="app.editTransaction('${tx.id}')" style="cursor: pointer; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; transition: background 120ms ease;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 28px; height: 28px; border-radius: 6px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="${icon}" style="width: 14px; height: 14px; color: var(--text-secondary);"></i>
                            </div>
                            <div>
                                <div style="font-weight: 500; font-size: 0.85rem; color: var(--text-primary);">${label}</div>
                                <div style="font-size: 0.72rem; color: var(--text-muted);">${metaLine}</div>
                            </div>
                        </div>
                        <div class="financial-amount privacy-blur" style="font-family: var(--font-numeric); font-weight: 600; font-size: 0.95rem; color: ${colorCls === 'text-emerald' ? 'var(--emerald)' : colorCls === 'text-rose' ? 'var(--rose)' : 'var(--text-secondary)'};">
                            ${this.formatMoney(tx.amount || tx.sourceAmount, w.currency, { prefix: sign })}
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
        lucide.createIcons();

        // Progressive FLIP transition from source card to focused layout
        const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (sourceRect && !prefersReduced) {
            const targetCard = primaryPanel.querySelector('.wallet-card');
            if (targetCard) {
                const targetRect = targetCard.getBoundingClientRect();
                if (targetRect.width > 0 && targetRect.height > 0) {
                    const dx = sourceRect.left - targetRect.left;
                    const dy = sourceRect.top - targetRect.top;
                    const scaleX = sourceRect.width / targetRect.width;
                    const scaleY = sourceRect.height / targetRect.height;

                    targetCard.style.transformOrigin = 'top left';
                    targetCard.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
                    targetCard.style.transition = 'none';

                    secondaryPanel.style.opacity = '0';
                    secondaryPanel.style.transform = 'translateX(14px)';
                    secondaryPanel.style.transition = 'none';

                    this.lastWalletFocusSourceRect = sourceRect;

                    void targetCard.offsetWidth;

                    requestAnimationFrame(() => {
                        targetCard.style.transition = 'transform 280ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 280ms cubic-bezier(0.16, 1, 0.3, 1)';
                        targetCard.style.transform = 'none';

                        secondaryPanel.style.transition = 'opacity 240ms cubic-bezier(0.16, 1, 0.3, 1) 40ms, transform 240ms cubic-bezier(0.16, 1, 0.3, 1) 40ms';
                        secondaryPanel.style.opacity = '1';
                        secondaryPanel.style.transform = 'none';
                    });

                    setTimeout(() => {
                        if (targetCard) {
                            targetCard.style.transformOrigin = '';
                            targetCard.style.transform = '';
                            targetCard.style.transition = '';
                        }
                        if (secondaryPanel) {
                            secondaryPanel.style.transition = '';
                            secondaryPanel.style.opacity = '';
                            secondaryPanel.style.transform = '';
                        }
                    }, 340);
                }
            }
        }
    }

    closeFocusOverlay() {
        const overlay = document.getElementById('focus-overlay');
        if (!overlay) return;

        const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const primaryPanel = document.getElementById('focus-primary-panel');
        const targetCard = primaryPanel ? primaryPanel.querySelector('.wallet-card') : null;

        if (targetCard && this.lastWalletFocusSourceRect && !prefersReduced) {
            const targetRect = targetCard.getBoundingClientRect();
            if (targetRect.width > 0 && targetRect.height > 0) {
                const dx = this.lastWalletFocusSourceRect.left - targetRect.left;
                const dy = this.lastWalletFocusSourceRect.top - targetRect.top;
                const scaleX = this.lastWalletFocusSourceRect.width / targetRect.width;
                const scaleY = this.lastWalletFocusSourceRect.height / targetRect.height;

                targetCard.style.transformOrigin = 'top left';
                targetCard.style.transition = 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease';
                targetCard.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
                targetCard.style.opacity = '0.3';
            }
        }

        overlay.classList.remove('active');
        setTimeout(() => {
            if (!overlay.classList.contains('active')) {
                overlay.style.display = 'none';
                if (targetCard) {
                    targetCard.style.transformOrigin = '';
                    targetCard.style.transform = '';
                    targetCard.style.transition = '';
                    targetCard.style.opacity = '';
                }
            }
            this.lastWalletFocusSourceRect = null;
        }, 240);

        document.body.style.overflow = '';
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

    openAddWalletModal() {
        document.getElementById('add-wallet-name').value = '';
        document.getElementById('add-wallet-balance').value = '0';
        document.getElementById('add-wallet-region').value = 'JP';
        document.getElementById('add-wallet-type').value = 'bank';
        document.getElementById('add-wallet-theme-val').value = 'emerald-salary';
        this.populateThemePicker('add-wallet-theme-picker', 'emerald-salary');
        document.getElementById('add-wallet-modal').classList.add('active');
        lucide.createIcons();
    }

    onAddWalletRegionChange() {
        const reg = document.getElementById('add-wallet-region').value;
        const defaultTheme = reg === 'IN' ? 'burgundy-axis' : 'emerald-salary';
        document.getElementById('add-wallet-theme-val').value = defaultTheme;
        this.populateThemePicker('add-wallet-theme-picker', defaultTheme);
    }

    saveAddWallet() {
        const name = document.getElementById('add-wallet-name').value.trim();
        const region = document.getElementById('add-wallet-region').value;
        const type = document.getElementById('add-wallet-type').value;
        const balInput = document.getElementById('add-wallet-balance').value;
        const theme = document.getElementById('add-wallet-theme-val').value;

        if (!name) {
            alert('Please enter a wallet name.');
            return;
        }

        if (storage.state.wallets[name]) {
            alert('A wallet with this name already exists.');
            return;
        }

        const balance = Number(balInput) || 0;
        const currency = region === 'JP' ? '¥' : '₹';
        const chosenTheme = WALLET_THEMES.find(t => t.id === theme) || WALLET_THEMES[0];

        storage.state.wallets[name] = {
            id: name,
            type: type,
            region: region,
            balance: balance,
            currency: currency,
            color: chosenTheme.color,
            theme: chosenTheme.id
        };

        storage.saveData();
        this.renderAll();
        this.closeModal('add-wallet-modal');
    }

    openEditWalletModal(walletId) {
        const w = storage.state.wallets[walletId];
        if (!w) return;

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

    saveEditWallet() {
        const id = document.getElementById('edit-wallet-id').value;
        const type = document.getElementById('edit-wallet-type').value;
        const balance = Number(document.getElementById('edit-wallet-balance').value);
        const themeId = document.getElementById('edit-wallet-theme-val').value;

        const w = storage.state.wallets[id];
        if (!w) return;

        if (!isNaN(balance)) {
            w.balance = balance;
        }
        w.type = type;
        w.theme = themeId;
        const chosenTheme = WALLET_THEMES.find(t => t.id === themeId);
        if (chosenTheme) {
            w.color = chosenTheme.color;
        }

        storage.saveData();
        this.renderAll();
        this.renderWalletsPage();
        this.closeModal('edit-wallet-modal');

        const overlay = document.getElementById('focus-overlay');
        if (overlay && (overlay.classList.contains('active') || overlay.style.display !== 'none')) {
            const title = document.getElementById('focus-modal-title');
            if (title && title.innerText === id) {
                this.openWalletFocus(id);
            }
        }
    }

    deleteWalletFromModal() {
        const id = document.getElementById('edit-wallet-id').value;
        if (!id || !storage.state.wallets[id]) return;

        const txs = walletManager.getTransactions({ walletId: id });
        if (txs.length > 0) {
            if (!confirm(`Wallet "${id}" has ${txs.length} recorded transactions in the ledger. Deleting it will keep the transaction ledger history, but remove the account from your wallet list. Are you sure you want to proceed?`)) {
                return;
            }
        } else {
            if (!confirm(`Are you sure you want to delete the wallet "${id}"?`)) {
                return;
            }
        }

        delete storage.state.wallets[id];
        storage.saveData();
        this.renderAll();
        this.closeModal('edit-wallet-modal');
        this.closeFocusOverlay();
    }

    getTransactionHtml(tx, editable = false, showDateInMeta = true) {
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
            amt = this.formatMoney(tx.amount, tx.currency, { prefix: '+' });
        } else if (effectiveType === 'transfer') {
            icon = 'repeat';
            colorCls = 'text-muted';
            title = `Transfer: ${this.getWalletName(tx.sourceId)} \u2192 ${this.getWalletName(tx.destId)}`;
            amt = this.formatMoney(tx.amount, tx.currency);
        } else if (effectiveType === 'remittance') {
            icon = 'globe';
            colorCls = 'text-muted';
            title = tx.note || 'Remittance';
            amt = this.isPrivacyHidden ? '******' : `\u00a5${(tx.sourceAmount || 0).toLocaleString()} \u2192 \u20b9${(tx.destAmount || 0).toLocaleString()}`;
        } else {
            // expense
            title = tx.note || catName;
            const currency = tx.currency || (tx.region === 'JP' ? '\u00a5' : '\u20b9');
            amt = this.formatMoney(tx.amount, currency, { prefix: '-' });
        }

        const date = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

        const walletName = this.getWalletName(tx.walletId || tx.sourceId);
        const metaParts = [];
        if (showDateInMeta) metaParts.push(date);
        if (walletName) metaParts.push(walletName);
        if (catName && catName !== title) metaParts.push(catName);
        if (tx.note && tx.note !== title) metaParts.push(tx.note);
        const metaString = metaParts.join(' \u2022 ');

        const clickAttr = editable ? `onclick="app.editTransaction('${tx.id}')" style="cursor:pointer;"` : '';

        return `
            <div class="tx-item" ${clickAttr}>
                <div class="tx-left">
                    <div class="tx-icon"><i data-lucide="${icon}"></i></div>
                    <div class="tx-details">
                        <span class="tx-title">${title}</span>
                        <span class="tx-meta">${metaString}</span>
                    </div>
                </div>
                <div class="tx-right">
                    <span class="tx-amount ${colorCls}">${amt}</span>
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
                        <div class="neon-row" style="padding: 12px;">
                            <div class="neon-header" style="margin-bottom: 8px;">
                                <span class="neon-title"><i data-lucide="${catDef.icon || 'tag'}"></i> ${catDef.name}</span>
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
                            <h3 style="margin:0;">${h.label || h.monthKey}</h3>
                            <p class="text-muted text-sm mt-1 mb-0">${h.transactions.length} transactions recorded</p>
                            ${balanceHtml}
                        </div>
                        <div style="display:flex; align-items:center; gap:12px; margin-top:2px;">
                            <button class="icon-btn" onclick="app.deleteLedger('${h.monthKey}')" style="color:var(--red)"><i data-lucide="trash-2"></i></button>
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

    updateSetting(key, val) {
        if (key === 'jpTotalBudget') {
            storage.state.jpTotalBudget = Number(val);
        }
        storage.saveData();
    }

    toggleLoanVisibility() {
        if (storage.state.loanConfig) {
            storage.state.loanConfig.enabled = (storage.state.loanConfig.enabled === false);
            storage.saveData();
            this.renderSettings();
            lucide.createIcons();
            this.renderLoanTracker();
        }
    }

    updateLoanSetting(key, value) {
        if (!storage.state.loanConfig) return;

        if (key === 'enabled') {
            storage.state.loanConfig[key] = value === true || value === 'true';
        } else {
            let numValue = parseFloat(value);
            if (!isNaN(numValue)) {
                storage.state.loanConfig[key] = numValue;
            }
        }
        storage.saveData();
        this.renderLoanTracker();
    }

    updateWalletBalance(id, val) {
        if (!val || isNaN(val)) return;
        if (storage.state.wallets[id]) {
            storage.state.wallets[id].balance = Number(val);
            storage.saveData();
            this.renderAll();
        }
    }

    updateLoanSetting(key, val) {
        if (!val || isNaN(val)) return;
        if (storage.state.loanConfig) {
            storage.state.loanConfig[key] = Number(val);
            storage.saveData();
            this.renderAll();
        }
    }

    renderLoanTracker() {
        if (this.currentView !== 'home-view') return;

        const loanState = walletManager.getLoanState();
        const widget = document.getElementById('loan-tracker-widget');

        if (!loanState || loanState.config.enabled === false) {
            if (widget) widget.style.display = 'none';
            return;
        }

        if (widget) {
            widget.style.display = 'block';
            widget.innerHTML = `
                <div class="loan-header" style="flex-wrap: wrap; padding-bottom: 12px;">
                    <div style="width: 50%;">
                        <div class="loan-value financial-amount privacy-blur">${this.formatMoney(loanState.config.totalPrincipal, '₹', { locale: 'en-IN' })}</div>
                        <div class="loan-label">Total Loan</div>
                    </div>
                    <div style="width: 50%; text-align: right;">
                        <div class="loan-value financial-amount privacy-blur">${this.formatMoney(loanState.config.emi, '₹', { locale: 'en-IN' })}</div>
                        <div class="loan-label">EMI</div>
                    </div>
                    <div style="width: 100%; text-align: center; font-size: 0.72rem; color: var(--text-muted); margin-top: 10px;">
                        Next draw in <span style="color: var(--text-main); font-weight: 600;">${loanState.daysUntilNextEmi} Days</span> (${loanState.nextEmiDateStr})
                    </div>
                </div>
                
                <div class="loan-progress-box">
                    <div class="loan-progress-header">
                        <span class="loan-percent financial-amount">${loanState.percentPaid}%</span>
                        <div style="display:flex; flex-direction:column; line-height:1.2; text-align:left;">
                            <span class="loan-label" style="font-size:0.75rem;">Paid</span>
                            <span class="loan-label" style="font-size:0.75rem;">Till Date</span>
                        </div>
                        <span class="loan-status">ON TRACK</span>
                    </div>
                    <div class="budget-streak-track" style="margin: 8px 0 14px 0;">
                        <div class="budget-streak-fill neon-safe" style="width: ${loanState.percentPaid}%;"></div>
                    </div>
                    
                    <div class="loan-stats-grid">
                        <span class="loan-stat-label">Amount Paid</span>
                        <span class="loan-stat-value financial-amount privacy-blur">${this.formatMoney(loanState.amountPaid, '₹', { locale: 'en-IN' })}</span>
                        
                        <span class="loan-stat-label">Principal Paid</span>
                        <span class="loan-stat-value financial-amount privacy-blur">${this.formatMoney(loanState.principalPaid, '₹', { locale: 'en-IN', formatOptions: { minimumFractionDigits: 2, maximumFractionDigits: 2 } })}</span>
                        
                        <span class="loan-stat-label">Principal Left</span>
                        <span class="loan-stat-value financial-amount privacy-blur">${this.formatMoney(loanState.principalLeft, '₹', { locale: 'en-IN', formatOptions: { minimumFractionDigits: 2, maximumFractionDigits: 2 } })}</span>
                    </div>
                </div>
            `;
        }
    }

    deleteLoan(event) {
        event.stopPropagation();
        if (confirm("Are you sure you want to remove the Loan Tracker? You can re-enable it in Settings.")) {
            if (storage.state.loanConfig) {
                storage.state.loanConfig.enabled = false;
                storage.saveData();
                this.renderLoanTracker();
            }
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

    closeMonth() {
        if (confirm("Are you sure you want to close this month and create a snapshot?")) {
            storage.closeCurrentMonth();
            alert("Month archived!");
            this.init();
        }
    }

    forceUpdate() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
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
        fromSelect.innerHTML = '';
        toSelect.innerHTML = '';

        // Gather all months
        const months = storage.state.history.map(h => h.monthKey);
        // Sort chronologically ascending
        months.sort((a, b) => a.localeCompare(b));
        // Add current month at the end
        months.push(storage.state.currentMonthKey);

        months.forEach(m => {
            const label = m === storage.state.currentMonthKey ? `${m} (Current)` : m;
            fromSelect.innerHTML += `<option value="${m}">${label}</option>`;
            toSelect.innerHTML += `<option value="${m}">${label}</option>`;
        });

        // Select the earliest month for "From" and latest for "To"
        if (months.length > 0) {
            fromSelect.value = months[0];
            toSelect.value = months[months.length - 1];
        }

        document.getElementById('pdf-modal').classList.add('active');
    }

    generatePdf() {
        // PDF exports always contain actual financial values regardless of privacy state
        const savedPrivacy = this.isPrivacyHidden;
        this.isPrivacyHidden = false;

        const fromMonth = document.getElementById('pdf-from-month').value;
        const toMonth = document.getElementById('pdf-to-month').value;

        if (fromMonth.localeCompare(toMonth) > 0) {
            alert('Invalid range. "From Month" must be before or equal to "To Month".');
            this.isPrivacyHidden = savedPrivacy;
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
                : (storage.state.transactions || []).filter(t => t.date && t.date.startsWith(storage.state.currentMonthKey));
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
            this.isPrivacyHidden = savedPrivacy;
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

                storage.state.categories[region].forEach(catDef => {
                    const spent = (totals[region] && totals[region][catDef.id]) || 0;
                    if (spent === 0) return;

                    const activeBudget = walletManager.getEffectiveBudget(catDef.id, region, h.monthKey);
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
                        <div class="neon-row" style="padding: 12px;">
                            <div class="neon-header" style="margin-bottom: 8px;">
                                <span class="neon-title"><i data-lucide="${catDef.icon || 'tag'}"></i> ${catDef.name}</span>
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
                        txsHtml += this.getTransactionHtml(tx, false, false); // editable=false
                    });
                    txsHtml += `</div>`;
                });
            } else {
                txsHtml += '<p class="text-muted text-sm">No transactions found.</p>';
            }
            txsHtml += '</div>';

            html += `
                <div class="card" style="margin-bottom: 24px; page-break-after: always; box-shadow: none; border: 1px solid rgba(255,255,255,0.1);">
                    <h3 style="margin:0;">${h.label || h.monthKey}</h3>
                    <p class="text-muted text-sm mt-1 mb-0">${h.transactions.length} transactions recorded</p>
                    ${balanceHtml}
                    <div style="border-top: 1px solid var(--border); padding-top: 12px; margin-top:16px;">
                        ${catsHtml}
                        ${txsHtml}
                    </div>
                </div>
            `;
        });

        document.getElementById('print-container').innerHTML = html;
        document.getElementById('pdf-modal').classList.remove('active');
        lucide.createIcons({ root: document.getElementById('print-container') });

        // Render all the charts for the print view
        chartDataToRender.forEach(chart => {
            charts.renderHistoryDonut(chart.id, chart.region, chart.totals, true);
        });

        // Convert canvases to images to guarantee they print in all browsers
        setTimeout(() => {
            chartDataToRender.forEach(chart => {
                const canvas = document.getElementById(chart.id);
                if (canvas) {
                    const img = document.createElement('img');
                    img.src = canvas.toDataURL('image/png');
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'contain';
                    img.style.display = 'block';
                    canvas.parentNode.replaceChild(img, canvas);
                }
            });

            // Let UI update, then print
            setTimeout(() => {
                window.print();
                // Restore privacy state after printing
                this.isPrivacyHidden = savedPrivacy;
                // Optional: clear it after
                setTimeout(() => {
                    document.getElementById('print-container').innerHTML = '';
                }, 1000);
            }, 500);
        }, 500);
    }

    /* ==========================================================================
       PHASE 3: TRANSACTIONS & ANALYTICS REDESIGN IMPLEMENTATION
       ========================================================================== */

    // Helper: format dates for ledger headers
    formatLedgerDateHeader(dateStr) {
        if (!dateStr) return 'Unknown Date';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

        const formatted = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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
                const found = storage.state.categories[region].find(c => c.id === catId || c.name === catId || c.id === `jp-${catId}` || c.id === `in-${catId}`);
                if (found?.name) return found.name;
            }
            for (const reg of ['JP', 'IN']) {
                const found = storage.state.categories[reg]?.find(c => c.id === catId || c.name === catId || c.id === `jp-${catId}` || c.id === `in-${catId}`);
                if (found?.name) return found.name;
            }
        }
        // Humanize slugs if not found directly
        if (typeof catId === 'string') {
            const cleaned = catId.replace(/^(jp|in)-/, '');
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
                    const cleaned = rawCat.replace(/^(jp|in)-/, '');
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

    // --------------------------------------------------------------------------
    // TRANSACTIONS CONTINUOUS LEDGER
    // --------------------------------------------------------------------------

    renderTransactionsPage() {
        const timelineEl = document.getElementById('ledger-timeline-container');
        if (!timelineEl) return;

        // 1. Populate Category dropdown
        const catSelect = document.getElementById('filter-category-select');
        if (catSelect && catSelect.options.length <= 1) {
            let catOptions = '<option value="all">All Categories</option>';
            if (storage.state?.categories) {
                if (storage.state.categories.JP && storage.state.categories.JP.length > 0) {
                    catOptions += '<optgroup label="Japan Categories">';
                    storage.state.categories.JP.forEach(c => {
                        catOptions += `<option value="${c.id}">${c.name}</option>`;
                    });
                    catOptions += '</optgroup>';
                }
                if (storage.state.categories.IN && storage.state.categories.IN.length > 0) {
                    catOptions += '<optgroup label="India Categories">';
                    storage.state.categories.IN.forEach(c => {
                        catOptions += `<option value="${c.id}">${c.name}</option>`;
                    });
                    catOptions += '</optgroup>';
                }
            }
            catSelect.innerHTML = catOptions;
            if (this.ledgerFilters.categoryId) catSelect.value = this.ledgerFilters.categoryId;
        }

        // 2. Populate Wallet dropdown
        const walletSelect = document.getElementById('filter-wallet-select');
        if (walletSelect && walletSelect.options.length <= 1) {
            let walletOptions = '<option value="all">All Wallets</option>';
            if (storage.state?.wallets) {
                Object.values(storage.state.wallets).forEach(w => {
                    const countryTag = w.region === 'JP' ? '[JP]' : '[IN]';
                    walletOptions += `<option value="${w.id}">${countryTag} ${w.name || w.id}</option>`;
                });
            }
            walletSelect.innerHTML = walletOptions;
            if (this.ledgerFilters.walletId) walletSelect.value = this.ledgerFilters.walletId;
        }

        // 3. Build query filters for walletManager
        const queryFilters = {};
        if (this.ledgerSearchQuery) queryFilters.search = this.ledgerSearchQuery;
        if (this.ledgerFilters.type !== 'all') queryFilters.type = this.ledgerFilters.type;
        if (this.ledgerFilters.region !== 'all') queryFilters.region = this.ledgerFilters.region;
        if (this.ledgerFilters.categoryId !== 'all') queryFilters.categoryId = this.ledgerFilters.categoryId;
        if (this.ledgerFilters.walletId !== 'all') queryFilters.walletId = this.ledgerFilters.walletId;
        if (this.ledgerFilters.startDate) queryFilters.startDate = this.ledgerFilters.startDate;
        if (this.ledgerFilters.endDate) queryFilters.endDate = this.ledgerFilters.endDate;
        if (this.ledgerFilters.minAmount !== null) queryFilters.minAmount = this.ledgerFilters.minAmount;
        if (this.ledgerFilters.maxAmount !== null) queryFilters.maxAmount = this.ledgerFilters.maxAmount;

        const allFilteredTxs = walletManager.getTransactions(queryFilters);
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
            timelineEl.innerHTML = `
                <div class="card ledger-empty-state">
                    <div class="empty-icon-circle">
                        <i data-lucide="receipt"></i>
                    </div>
                    <h3 style="margin: 0; font-size: 1.05rem; font-weight: 600;">No Transactions Found</h3>
                    <p class="text-muted text-sm" style="margin: 0; max-width: 360px;">No transactions match your search query or applied filter criteria.</p>
                    <button class="btn btn-secondary btn-sm" onclick="app.resetAllLedgerFilters()" style="margin-top: 6px;">
                        <i data-lucide="rotate-ccw"></i>
                        <span>Reset All Filters</span>
                    </button>
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
        const dateGroups = {};
        visibleTxs.forEach(tx => {
            const dKey = tx.date || 'Undated';
            if (!dateGroups[dKey]) dateGroups[dKey] = [];
            dateGroups[dKey].push(tx);
        });

        let html = '';
        Object.keys(dateGroups).forEach(dateStr => {
            const groupTxs = dateGroups[dateStr];
            const dateHeaderLabel = this.formatLedgerDateHeader(dateStr);

            // Compute day net summary
            let dayNet = 0;
            let dayCurrency = '¥';
            groupTxs.forEach(t => {
                if (t.type === 'income') dayNet += Number(t.amount || 0);
                else if (t.type === 'expense') dayNet -= Number(t.amount || 0);
                if (t.currency) {
                    dayCurrency = (t.currency === 'INR' || t.currency === '₹' || t.region === 'IN') ? '₹' : '¥';
                } else if (t.region === 'IN') {
                    dayCurrency = '₹';
                }
            });

            const dayCurrencySym = (dayCurrency === 'INR' || dayCurrency === '₹') ? '₹' : '¥';

            html += `
                <div class="ledger-date-group">
                    <div class="ledger-date-header">
                        <div class="ledger-date-title">
                            <span>${dateHeaderLabel}</span>
                            <span class="day-pill">${groupTxs.length} ${groupTxs.length === 1 ? 'tx' : 'txs'}</span>
                        </div>
                        <div class="ledger-date-subtotal privacy-blur">
                            ${dayNet !== 0 ? (dayNet > 0 ? `+${this.formatMoney(dayNet, dayCurrencySym)}` : `-${this.formatMoney(Math.abs(dayNet), dayCurrencySym)}`) : ''}
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
                    title = `${this.getWalletName(tx.sourceId)} (¥) → ${this.getWalletName(tx.destId)} (₹)`;
                }

                // Amount string
                let amountHtml = '';
                if (effectiveType === 'remittance') {
                    if (this.isPrivacyHidden) {
                        amountHtml = '******';
                    } else {
                        amountHtml = `¥${Number(tx.sourceAmount || 0).toLocaleString()} → ₹${Number(tx.destAmount || 0).toLocaleString()}`;
                    }
                } else {
                    const cur = (tx.currency === 'INR' || tx.currency === '₹' || tx.region === 'IN') ? '₹' : '¥';
                    amountHtml = this.formatMoney(tx.amount, cur, { prefix: sign });
                }

                // Refined typographic metadata line
                let metaItemsHtml = '';
                if (effectiveType === 'expense') {
                    metaItemsHtml += `<span class="ledger-tx-meta-item category">${categoryName}</span>`;
                    metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                    metaItemsHtml += `<span class="ledger-tx-meta-item account">${walletName}</span>`;
                    if (tx.note && tx.note !== title) {
                        metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                        metaItemsHtml += `<span class="ledger-tx-meta-item note">"${tx.note}"</span>`;
                    }
                } else if (effectiveType === 'income') {
                    metaItemsHtml += `<span class="ledger-tx-meta-item category">${categoryName}</span>`;
                    metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                    metaItemsHtml += `<span class="ledger-tx-meta-item account">${walletName}</span>`;
                    if (tx.note && tx.note !== title) {
                        metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                        metaItemsHtml += `<span class="ledger-tx-meta-item note">"${tx.note}"</span>`;
                    }
                } else if (effectiveType === 'transfer') {
                    metaItemsHtml += `<span class="ledger-tx-meta-item category">Internal Transfer</span>`;
                    if (tx.note) {
                        metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                        metaItemsHtml += `<span class="ledger-tx-meta-item note">"${tx.note}"</span>`;
                    }
                } else if (effectiveType === 'remittance') {
                    metaItemsHtml += `<span class="ledger-tx-meta-item category">Cross-Border Remittance</span>`;
                    if (tx.exchangeRate) {
                        metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                        metaItemsHtml += `<span class="ledger-tx-meta-item rate">Rate: ${tx.exchangeRate}</span>`;
                    }
                    if (tx.note) {
                        metaItemsHtml += `<span class="ledger-tx-meta-sep">•</span>`;
                        metaItemsHtml += `<span class="ledger-tx-meta-item note">"${tx.note}"</span>`;
                    }
                }

                html += `
                    <div class="ledger-tx-row" onclick="app.openTransactionDetail('${tx.id}')" title="Inspect details and actions">
                        <div class="ledger-tx-left">
                            <div class="tx-type-icon ${typeCls}">
                                <i data-lucide="${icon}"></i>
                            </div>
                            <div class="ledger-tx-details">
                                <div class="ledger-tx-primary-line">
                                    <span class="ledger-tx-title">${title}</span>
                                    ${flag ? `<span class="tx-flag-pill">${flag}</span>` : ''}
                                </div>
                                <div class="ledger-tx-meta">
                                    ${metaItemsHtml}
                                </div>
                            </div>
                        </div>
                        <div class="ledger-tx-right">
                            <span class="ledger-tx-amount ${typeCls} privacy-blur">${amountHtml}</span>
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
            chipsHtml += `
                <span class="filter-chip">
                    <span>Search: "${this.ledgerSearchQuery}"</span>
                    <button class="filter-chip-remove" onclick="app.clearLedgerSearch()" title="Remove search">×</button>
                </span>
            `;
        }

        if (this.ledgerFilters.type !== 'all') {
            activeCount++;
            chipsHtml += `
                <span class="filter-chip">
                    <span>Type: ${this.ledgerFilters.type}</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('type')" title="Remove type filter">×</button>
                </span>
            `;
        }

        if (this.ledgerFilters.region !== 'all') {
            activeCount++;
            chipsHtml += `
                <span class="filter-chip">
                    <span style="display:inline-flex; align-items:center; gap:6px;">Country: ${this.getCountryFlagSvg(this.ledgerFilters.region, 14, 10.5)} ${this.ledgerFilters.region === 'JP' ? 'Japan' : 'India'}</span>
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
                    <span>Date: ${dateLabel}</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('datePreset')" title="Remove date filter">×</button>
                </span>
            `;
        }

        if (this.ledgerFilters.categoryId !== 'all') {
            activeCount++;
            chipsHtml += `
                <span class="filter-chip">
                    <span>Category: ${this.getCategoryName(this.ledgerFilters.categoryId)}</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('categoryId')" title="Remove category filter">×</button>
                </span>
            `;
        }

        if (this.ledgerFilters.walletId !== 'all') {
            activeCount++;
            chipsHtml += `
                <span class="filter-chip">
                    <span>Wallet: ${this.getWalletName(this.ledgerFilters.walletId)}</span>
                    <button class="filter-chip-remove" onclick="app.removeLedgerFilter('walletId')" title="Remove wallet filter">×</button>
                </span>
            `;
        }

        if (this.ledgerFilters.minAmount !== null || this.ledgerFilters.maxAmount !== null) {
            activeCount++;
            const minStr = this.ledgerFilters.minAmount !== null ? this.ledgerFilters.minAmount : '0';
            const maxStr = this.ledgerFilters.maxAmount !== null ? this.ledgerFilters.maxAmount : '∞';
            chipsHtml += `
                <span class="filter-chip">
                    <span>Amount: ${minStr} - ${maxStr}</span>
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

    onLedgerSearchInput(event) {
        if (this.ledgerSearchDebounceTimer) {
            clearTimeout(this.ledgerSearchDebounceTimer);
        }

        const clearBtn = document.getElementById('ledger-search-clear');
        const query = (event.target.value || '').trim();
        if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';

        this.ledgerSearchDebounceTimer = setTimeout(() => {
            this.ledgerSearchQuery = query;
            this.ledgerVisibleCount = this.ledgerPageSize;
            this.renderTransactionsPage();
        }, 200);
    }

    clearLedgerSearch() {
        const input = document.getElementById('ledger-search-input');
        if (input) input.value = '';
        this.ledgerSearchQuery = '';
        this.ledgerVisibleCount = this.ledgerPageSize;
        this.renderTransactionsPage();
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

    onLedgerDatePresetChange() {
        const dateSelect = document.getElementById('filter-date-preset');
        const customWrap = document.getElementById('filter-custom-date-wrap');
        const preset = dateSelect?.value || 'all';
        this.ledgerFilters.datePreset = preset;

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-11
        const date = now.getDate();

        if (preset === 'today') {
            const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
            this.ledgerFilters.startDate = todayStr;
            this.ledgerFilters.endDate = todayStr;
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === 'week') {
            const dayOfWeek = now.getDay(); // 0 (Sun) - 6 (Sat)
            const sunday = new Date(now);
            sunday.setDate(now.getDate() - dayOfWeek);
            const saturday = new Date(sunday);
            saturday.setDate(sunday.getDate() + 6);

            const sStr = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
            const eStr = `${saturday.getFullYear()}-${String(saturday.getMonth() + 1).padStart(2, '0')}-${String(saturday.getDate()).padStart(2, '0')}`;
            this.ledgerFilters.startDate = sStr;
            this.ledgerFilters.endDate = eStr;
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === 'month') {
            const lastDay = new Date(year, month + 1, 0).getDate();
            this.ledgerFilters.startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            this.ledgerFilters.endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === 'prev_month') {
            const prevMonthDate = new Date(year, month - 1, 1);
            const py = prevMonthDate.getFullYear();
            const pm = prevMonthDate.getMonth();
            const lastDay = new Date(py, pm + 1, 0).getDate();
            this.ledgerFilters.startDate = `${py}-${String(pm + 1).padStart(2, '0')}-01`;
            this.ledgerFilters.endDate = `${py}-${String(pm + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === 'custom') {
            if (customWrap) customWrap.style.display = 'grid';
            const startInput = document.getElementById('filter-date-start');
            const endInput = document.getElementById('filter-date-end');
            this.ledgerFilters.startDate = startInput?.value || '';
            this.ledgerFilters.endDate = endInput?.value || '';
        } else {
            this.ledgerFilters.startDate = '';
            this.ledgerFilters.endDate = '';
            if (customWrap) customWrap.style.display = 'none';
        }

        this.ledgerVisibleCount = this.ledgerPageSize;
        this.renderTransactionsPage();
    }

    setLedgerRegion(region) {
        this.ledgerFilters.region = region;
        const segment = document.getElementById('ledger-country-filter');
        if (segment) {
            segment.querySelectorAll('.segment-btn').forEach(btn => {
                if (btn.getAttribute('data-region') === region) btn.classList.add('active');
                else btn.classList.remove('active');
            });
        }
        this.ledgerVisibleCount = this.ledgerPageSize;
        this.renderTransactionsPage();
    }

    removeLedgerFilter(key) {
        if (key === 'type') {
            this.ledgerFilters.type = 'all';
            const el = document.getElementById('filter-type-select');
            if (el) el.value = 'all';
        } else if (key === 'region') {
            this.setLedgerRegion('all');
            return;
        } else if (key === 'datePreset') {
            this.ledgerFilters.datePreset = 'all';
            this.ledgerFilters.startDate = '';
            this.ledgerFilters.endDate = '';
            const el = document.getElementById('filter-date-preset');
            if (el) el.value = 'all';
            const customWrap = document.getElementById('filter-custom-date-wrap');
            if (customWrap) customWrap.style.display = 'none';
        } else if (key === 'categoryId') {
            this.ledgerFilters.categoryId = 'all';
            const el = document.getElementById('filter-category-select');
            if (el) el.value = 'all';
        } else if (key === 'walletId') {
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

    resetAllLedgerFilters() {
        this.clearLedgerSearch();
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

        const segment = document.getElementById('ledger-country-filter');
        if (segment) {
            segment.querySelectorAll('.segment-btn').forEach(btn => {
                if (btn.getAttribute('data-region') === 'all') btn.classList.add('active');
                else btn.classList.remove('active');
            });
        }

        const panel = document.getElementById('ledger-filter-panel');
        if (panel) panel.style.display = 'none';

        this.ledgerVisibleCount = this.ledgerPageSize;
        this.renderTransactionsPage();
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
                amountVal.innerText = this.isPrivacyHidden
                    ? '******'
                    : `¥${Number(tx.sourceAmount || 0).toLocaleString()} → ₹${Number(tx.destAmount || 0).toLocaleString()}`;
            } else {
                const sign = tx.type === 'income' ? '+' : (tx.type === 'expense' ? '-' : '');
                const cur = (tx.currency === 'INR' || tx.currency === '₹' || tx.region === 'IN') ? '₹' : '¥';
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
                subtitle.innerText = 'Cross-Border Remittance (Japan → India)';
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
                if (destVal) destVal.innerText = `${this.getWalletName(tx.destId)} (₹${Number(tx.destAmount || 0).toLocaleString()})`;
            }
            if (rateWrap) {
                rateWrap.style.display = 'flex';
                if (rateVal) rateVal.innerText = tx.exchangeRate ? `1 JPY = ${tx.exchangeRate} INR` : '--';
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
        document.body.style.overflow = '';
        this.currentDetailTxId = null;
    }

    editCurrentDetailTransaction() {
        const id = this.currentDetailTxId;
        this.closeTransactionDetail();
        if (id) {
            this.editTransaction(id);
        }
    }

    deleteCurrentDetailTransaction() {
        const id = this.currentDetailTxId;
        if (!id) return;

        const found = walletManager.findTransaction(id);
        if (found && walletManager.isMonthClosed((found.tx.date || '').slice(0, 7))) {
            alert(`Cannot delete transaction in closed month ${(found.tx.date || '').slice(0, 7)}. This historical period is permanently sealed.`);
            return;
        }

        if (confirm("Are you sure you want to delete this transaction from the continuous ledger?")) {
            walletManager.deleteTransaction(id);
            this.closeTransactionDetail();
            this.renderAll();
            this.renderTransactionsPage();
            if (this.currentView === 'analytics-view') {
                this.renderAnalyticsPage();
            }
        }
    }

    exportTransactionsCsv() {
        const queryFilters = {};
        if (this.ledgerSearchQuery) queryFilters.search = this.ledgerSearchQuery;
        if (this.ledgerFilters.type !== 'all') queryFilters.type = this.ledgerFilters.type;
        if (this.ledgerFilters.region !== 'all') queryFilters.region = this.ledgerFilters.region;
        if (this.ledgerFilters.categoryId !== 'all') queryFilters.categoryId = this.ledgerFilters.categoryId;
        if (this.ledgerFilters.walletId !== 'all') queryFilters.walletId = this.ledgerFilters.walletId;
        if (this.ledgerFilters.startDate) queryFilters.startDate = this.ledgerFilters.startDate;
        if (this.ledgerFilters.endDate) queryFilters.endDate = this.ledgerFilters.endDate;

        const txs = walletManager.getTransactions(queryFilters);
        if (!txs || txs.length === 0) {
            alert('No transactions to export.');
            return;
        }

        let csv = 'ID,Date,Type,Region,Wallet,Category,Amount,Currency,DestWallet,DestAmount,ExchangeRate,Note\n';
        txs.forEach(t => {
            const row = [
                `"${t.id || ''}"`,
                `"${t.date || ''}"`,
                `"${t.type || ''}"`,
                `"${t.region || ''}"`,
                `"${this.getWalletName(t.walletId || t.sourceId)}"`,
                `"${this.getTransactionCategory(t)}"`,
                t.amount !== undefined ? t.amount : (t.sourceAmount || 0),
                `"${t.currency || t.sourceCurrency || ''}"`,
                `"${t.destId ? this.getWalletName(t.destId) : ''}"`,
                t.destAmount || '',
                t.exchangeRate || '',
                `"${(t.note || '').replace(/"/g, '""')}"`
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
        const jpWorkspace = document.getElementById('analytics-jp-workspace');
        const inWorkspace = document.getElementById('analytics-in-workspace');
        const tabJp = document.getElementById('analytics-tab-jp');
        const tabIn = document.getElementById('analytics-tab-in');

        if (!jpWorkspace || !inWorkspace) return;

        if (this.analyticsCountry === 'JP') {
            jpWorkspace.style.display = 'flex';
            inWorkspace.style.display = 'none';
            if (tabJp) tabJp.classList.add('active');
            if (tabIn) tabIn.classList.remove('active');
            this.renderJapanAnalytics();
        } else {
            jpWorkspace.style.display = 'none';
            inWorkspace.style.display = 'flex';
            if (tabJp) tabJp.classList.remove('active');
            if (tabIn) tabIn.classList.add('active');
            this.renderIndiaAnalytics();
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }

    setAnalyticsCountry(country) {
        this.analyticsCountry = country;
        this.renderAnalyticsPage();
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

    getAnalyticsPeriodRange(period) {
        const now = new Date();
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
            const lastDay = new Date(curYear, curMonth + 1, 0).getDate();
            const endDate = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            const pstart = new Date(y, m - 3, 1);
            const pend = new Date(y, m, 0);
            const prevStartDate = `${pstart.getFullYear()}-${String(pstart.getMonth() + 1).padStart(2, '0')}-01`;
            const prevEndDate = `${pend.getFullYear()}-${String(pend.getMonth() + 1).padStart(2, '0')}-${String(pend.getDate()).padStart(2, '0')}`;

            return { startDate, endDate, prevStartDate, prevEndDate, label: 'Last 3 Months' };
        } else if (period === 'all-time') {
            return { startDate: null, endDate: null, prevStartDate: null, prevEndDate: null, label: 'All Time' };
        } else {
            // 'this-month' default
            const lastDay = new Date(curYear, curMonth + 1, 0).getDate();
            const startDate = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-01`;
            const endDate = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            const prevDate = new Date(curYear, curMonth - 1, 1);
            const py = prevDate.getFullYear();
            const pm = prevDate.getMonth();
            const plastDay = new Date(py, pm + 1, 0).getDate();
            const prevStartDate = `${py}-${String(pm + 1).padStart(2, '0')}-01`;
            const prevEndDate = `${py}-${String(pm + 1).padStart(2, '0')}-${String(plastDay).padStart(2, '0')}`;

            return { startDate, endDate, prevStartDate, prevEndDate, label: 'This Month' };
        }
    }

    renderJapanAnalytics() {
        const periodRange = this.getAnalyticsPeriodRange(this.analyticsPeriod);
        const { startDate, endDate, prevStartDate, prevEndDate } = periodRange;

        // Query Japanese transactions
        const jpTxs = walletManager.getTransactions({
            region: 'JP',
            startDate: startDate || undefined,
            endDate: endDate || undefined
        });

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

        // 2. Previous Period Comparison
        let deltaIncome = null;
        let deltaExpenses = null;
        if (prevStartDate && prevEndDate) {
            const prevJpTxs = walletManager.getTransactions({
                region: 'JP',
                startDate: prevStartDate,
                endDate: prevEndDate
            });
            const prevIncome = prevJpTxs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
            const prevExpenses = prevJpTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);

            if (prevIncome > 0) deltaIncome = (((totalIncome - prevIncome) / prevIncome) * 100).toFixed(1);
            if (prevExpenses > 0) deltaExpenses = (((totalExpenses - prevExpenses) / prevExpenses) * 100).toFixed(1);
        }

        // 3. Update KPI Elements
        const kpiIncome = document.getElementById('jp-kpi-income');
        const kpiIncomeDelta = document.getElementById('jp-kpi-income-delta');
        if (kpiIncome) kpiIncome.innerText = this.formatMoney(totalIncome, '¥');
        if (kpiIncomeDelta) {
            if (deltaIncome !== null) {
                const isPos = Number(deltaIncome) >= 0;
                kpiIncomeDelta.innerHTML = `<span class="${isPos ? 'delta-positive' : 'delta-negative'}">${isPos ? '↑' : '↓'} ${Math.abs(deltaIncome)}%</span> vs prior period`;
            } else {
                kpiIncomeDelta.innerHTML = `<span class="delta-neutral">Baseline period</span>`;
            }
        }

        const kpiExpenses = document.getElementById('jp-kpi-expenses');
        const kpiExpensesDelta = document.getElementById('jp-kpi-expenses-delta');
        if (kpiExpenses) kpiExpenses.innerText = this.formatMoney(totalExpenses, '¥');
        if (kpiExpensesDelta) {
            if (deltaExpenses !== null) {
                const isLess = Number(deltaExpenses) <= 0;
                // For expenses, going down is positive
                kpiExpensesDelta.innerHTML = `<span class="${isLess ? 'delta-positive' : 'delta-negative'}">${Number(deltaExpenses) >= 0 ? '↑' : '↓'} ${Math.abs(deltaExpenses)}%</span> vs prior period`;
            } else {
                kpiExpensesDelta.innerHTML = `<span class="delta-neutral">Baseline period</span>`;
            }
        }

        const kpiSavings = document.getElementById('jp-kpi-savings');
        if (kpiSavings) {
            kpiSavings.innerText = (netSavings >= 0 ? '+' : '-') + this.formatMoney(Math.abs(netSavings), '¥');
            kpiSavings.className = `kpi-value privacy-blur ${netSavings >= 0 ? 'text-emerald' : 'text-rose'}`;
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
        if (statExcludedDiff) statExcludedDiff.innerText = `-${this.formatMoney(excludedDiff, '¥')}`;
        if (statExcludedDiffWrap) statExcludedDiffWrap.style.display = excludedDiff > 0 ? 'flex' : 'none';

        if (exclusionsChips) {
            // Selectable candidate categories for lifestyle exclusion
            const candidateCats = (storage.state?.categories?.JP || []).filter(c => {
                return c.id === 'jp-food' || c.id === 'jp-dining' || c.id === 'jp-shopping' ||
                       c.id === 'jp-misc' || c.id === 'jp-tax' || c.id.startsWith('jp-utility');
            });

            let chipsHtml = '';
            candidateCats.forEach(cat => {
                const isExcluded = this.jpExclusions.has(cat.id);
                chipsHtml += `
                    <button class="exclusion-pill ${isExcluded ? 'excluded' : ''}" onclick="app.toggleCategoryExclusion('${cat.id}')">
                        <i data-lucide="${isExcluded ? 'x' : 'check'}" style="width: 13px; height: 13px;"></i>
                        <span>${cat.name}</span>
                    </button>
                `;
            });
            exclusionsChips.innerHTML = chipsHtml;
        }

        // 5. Render Spending Trend Chart
        if (typeof charts !== 'undefined' && typeof charts.renderJpSpendingTrend === 'function') {
            charts.renderJpSpendingTrend(this.jpTrendGranularity, analyticalTxs, startDate, endDate);
        }

        // 6. Category Breakdown & Ranking List
        const categoryTotals = {};
        analyticalTxs.forEach(t => {
            categoryTotals[t.categoryId] = (categoryTotals[t.categoryId] || 0) + Number(t.amount || 0);
        });

        const activeCats = (storage.state?.categories?.JP || [])
            .filter(c => (categoryTotals[c.id] || 0) > 0)
            .sort((a, b) => (categoryTotals[b.id] || 0) - (categoryTotals[a.id] || 0));

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
                    const spent = categoryTotals[cat.id] || 0;
                    const pct = analyticalExpenses > 0 ? ((spent / analyticalExpenses) * 100).toFixed(1) : '0';
                    const color = baseColors[idx % baseColors.length];

                    rankingHtml += `
                        <div class="category-rank-row" onclick="app.openCategoryDrilldown('${cat.id}')" title="Inspect transactions for ${cat.name}">
                            <div class="category-rank-top">
                                <div class="category-rank-info">
                                    <span class="category-dot" style="background: ${color};"></span>
                                    <span class="category-name">${cat.name}</span>
                                </div>
                                <div class="category-amount-wrap">
                                    <span class="category-amount privacy-blur">${this.formatMoney(spent, '¥')}</span>
                                    <span class="category-pct">${pct}%</span>
                                </div>
                            </div>
                            <div class="category-bar-bg">
                                <div class="category-bar-fill" style="width: ${pct}%; background: ${color};"></div>
                            </div>
                        </div>
                    `;
                });
                catRankingList.innerHTML = rankingHtml;
            }
        }

        // Render Donut Chart
        if (typeof charts !== 'undefined' && typeof charts.renderJpCategoryDonut === 'function') {
            charts.renderJpCategoryDonut(activeCats, categoryTotals, (cat) => this.openCategoryDrilldown(cat.id));
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
            if (activeCats.length > 0) {
                const topCat = activeCats[0];
                const topSpent = categoryTotals[topCat.id] || 0;
                const topPct = analyticalExpenses > 0 ? Math.round((topSpent / analyticalExpenses) * 100) : 0;
                insightsHtml += `
                    <div class="insight-item">
                        <div class="insight-icon"><i data-lucide="pie-chart"></i></div>
                        <div class="insight-content">
                            <span class="insight-title">Dominant Category: ${topCat.name}</span>
                            <p class="insight-desc">${topCat.name} accounts for ${topPct}% of your analytical spending (<span class="privacy-blur">${this.formatMoney(topSpent, '¥')}</span>).</p>
                        </div>
                    </div>
                `;
            }

            // Insight 2: Month-over-month Trend
            if (deltaExpenses !== null) {
                const isDown = Number(deltaExpenses) < 0;
                insightsHtml += `
                    <div class="insight-item">
                        <div class="insight-icon" style="color: ${isDown ? '#34d399' : '#fb7185'}; background: ${isDown ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 113, 133, 0.12)'}">
                            <i data-lucide="${isDown ? 'trending-down' : 'trending-up'}"></i>
                        </div>
                        <div class="insight-content">
                            <span class="insight-title">${isDown ? 'Spending Reduced' : 'Expenditure Accelerated'}</span>
                            <p class="insight-desc">Outflows are ${isDown ? 'down' : 'up'} ${Math.abs(deltaExpenses)}% compared to the prior period (${isDown ? 'positive trajectory' : 'monitor closely'}).</p>
                        </div>
                    </div>
                `;
            }

            // Insight 3: Largest single outlay
            if (expenseTxs.length > 0) {
                const maxTx = [...expenseTxs].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
                if (maxTx && Number(maxTx.amount || 0) > 0) {
                    insightsHtml += `
                        <div class="insight-item">
                            <div class="insight-icon"><i data-lucide="alert-circle"></i></div>
                            <div class="insight-content">
                                <span class="insight-title">Peak Transaction Outlay</span>
                                <p class="insight-desc">Largest single transaction was <span class="privacy-blur">${this.formatMoney(maxTx.amount, '¥')}</span> on ${maxTx.date} (${maxTx.note || this.getTransactionCategory(maxTx)}).</p>
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

    toggleCategoryExclusion(catId) {
        if (this.jpExclusions.has(catId)) {
            this.jpExclusions.delete(catId);
        } else {
            this.jpExclusions.add(catId);
        }

        // Persist safely in state without modifying ledger or balances
        if (storage.state) {
            storage.state.analyticsExclusions = Array.from(this.jpExclusions);
            storage.saveData();
        }

        this.renderJapanAnalytics();
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
        this.selectedDrilldownCategoryId = catId;
        const drilldownSection = document.getElementById('jp-drilldown-section');
        if (drilldownSection) {
            drilldownSection.style.display = 'block';
            this.renderJapanAnalytics();
            drilldownSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    closeCategoryDrilldown() {
        this.selectedDrilldownCategoryId = null;
        const drilldownSection = document.getElementById('jp-drilldown-section');
        if (drilldownSection) drilldownSection.style.display = 'none';
    }

    renderCategoryDrilldownView(analyticalTxs) {
        const drilldownSection = document.getElementById('jp-drilldown-section');
        if (!drilldownSection || !this.selectedDrilldownCategoryId) return;

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
                    html += `
                        <div class="ledger-tx-row" onclick="app.openTransactionDetail('${tx.id}')">
                            <div class="ledger-tx-left">
                                <div class="tx-type-icon expense"><i data-lucide="arrow-up-right"></i></div>
                                <div class="ledger-tx-details">
                                    <div class="ledger-tx-primary-line">
                                        <span class="ledger-tx-title">${tx.note || catName}</span>
                                    </div>
                                    <div class="tx-meta-pills">
                                        <span class="tx-pill">${tx.date}</span>
                                        <span class="tx-pill">${this.getWalletName(tx.walletId)}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="ledger-tx-right">
                                <span class="ledger-tx-amount expense privacy-blur">-${this.formatMoney(tx.amount, tx.currency || '¥')}</span>
                            </div>
                        </div>
                    `;
                });
                listEl.innerHTML = html;
            }
        }
    }

    renderIndiaAnalytics() {
        const periodRange = this.getAnalyticsPeriodRange(this.analyticsPeriod);
        const { startDate, endDate, prevStartDate, prevEndDate } = periodRange;

        // Query Indian transactions
        const inTxs = walletManager.getTransactions({
            region: 'IN',
            startDate: startDate || undefined,
            endDate: endDate || undefined
        });

        const inExpenses = inTxs.filter(t => t.type === 'expense');
        const totalExpenses = inExpenses.reduce((s, t) => s + Number(t.amount || 0), 0);
        const txCount = inTxs.length;

        // Weekly average (paced over active period weeks)
        const weeklyAvg = Math.round(totalExpenses / 4);

        // Previous period comparison
        let delta = null;
        if (prevStartDate && prevEndDate) {
            const prevInTxs = walletManager.getTransactions({
                region: 'IN',
                startDate: prevStartDate,
                endDate: prevEndDate
            });
            const prevTotal = prevInTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
            if (prevTotal > 0) delta = (((totalExpenses - prevTotal) / prevTotal) * 100).toFixed(1);
        }

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
            if (delta !== null) {
                const isLess = Number(delta) <= 0;
                kpiComparison.innerHTML = `<span class="${isLess ? 'delta-positive' : 'delta-negative'}">${Number(delta) >= 0 ? '↑' : '↓'} ${Math.abs(delta)}%</span>`;
                if (kpiComparisonMeta) kpiComparisonMeta.innerText = isLess ? 'Lower than last month' : 'Higher than last month';
            } else {
                kpiComparison.innerText = '--';
                if (kpiComparisonMeta) kpiComparisonMeta.innerText = 'No previous month data';
            }
        }

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
                        <div class="ledger-tx-row" onclick="app.openTransactionDetail('${tx.id}')">
                            <div class="ledger-tx-left">
                                <div class="tx-type-icon ${typeCls}"><i data-lucide="${tx.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'}"></i></div>
                                <div class="ledger-tx-details">
                                    <div class="ledger-tx-primary-line">
                                        <span class="ledger-tx-title">${tx.note || this.getTransactionCategory(tx)}</span>
                                    </div>
                                    <div class="tx-meta-pills">
                                        <span class="tx-pill">${tx.date}</span>
                                        <span class="tx-pill">${this.getWalletName(tx.walletId)}</span>
                                        <span class="tx-pill">${this.getTransactionCategory(tx)}</span>
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
        this.resetAllLedgerFilters();
        Object.assign(this.ledgerFilters, filterObj);
        this.switchView('transactions-view');
        this.renderTransactionsPage();
    }

    // =========================================================================
    // PHASE 4: REPORTS WORKSPACE & SNAPSHOTS
    // =========================================================================

    setReportRegion(region) {
        if (region !== 'JP' && region !== 'IN') return;
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

    refreshReportSnapshot() {
        const cacheKey = `${this.reportRegion}_${this.reportMonthKey}`;
        const now = new Date().toLocaleString();

        if (!storage.state.reportSnapshots) {
            storage.state.reportSnapshots = {};
        }
        this.reportSnapshotsCache = storage.state.reportSnapshots;

        const allTxs = storage.state.transactions || [];
        const reportTxs = allTxs.filter(tx => (tx.date || '').startsWith(this.reportMonthKey) && tx.region === this.reportRegion);
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

        storage.state.reportSnapshots = this.reportSnapshotsCache;
        storage.saveData();
        this.renderReportsPage();
    }

    printCurrentReport() {
        window.print();
    }

    exportReportCsv() {
        const allTxs = storage.state.transactions || [];
        const reportTxs = allTxs.filter(tx => (tx.date || '').startsWith(this.reportMonthKey) && tx.region === this.reportRegion);
        
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
        const allTxs = storage.state.transactions || [];
        const currency = this.reportRegion === 'JP' ? '¥' : '₹';

        // 1. Collect all available month keys (currentMonthKey + closedMonths + any dates present in ledger)
        const availableMonthsSet = new Set();
        if (storage.state.currentMonthKey) availableMonthsSet.add(storage.state.currentMonthKey);
        if (storage.state.closedMonths) {
            Object.keys(storage.state.closedMonths).forEach(m => availableMonthsSet.add(m));
        }
        allTxs.forEach(tx => {
            if (tx.date && tx.date.length >= 7) {
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
                return `<option value="${m}" ${m === this.reportMonthKey ? 'selected' : ''}>${m}${isClosed ? ' [Closed]' : ''}</option>`;
            }).join('');
        }

        // 3. Filter transactions strictly by transaction date (Section 5 rule)
        const reportTxs = allTxs.filter(tx => (tx.date || '').startsWith(this.reportMonthKey) && tx.region === this.reportRegion);

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
            periodTotalBudget = this.reportRegion === 'JP' ? (closedMeta.jpTotalBudget || 0) : (closedMeta.inTotalBudget || 0);
            if (closedMeta.categoriesSnapshot && closedMeta.categoriesSnapshot[this.reportRegion]) {
                closedMeta.categoriesSnapshot[this.reportRegion].forEach(c => {
                    periodCatBudgets[c.id] = c.budget || 0;
                });
            } else {
                historicalBudgetNote = `Historical category-level budgets were not preserved for closed month ${this.reportMonthKey} in the legacy schema; recorded overall budget limit: ${this.formatMoney(periodTotalBudget, currency)}. Category totals are computed from the continuous ledger.`;
            }
        } else if (this.reportMonthKey === storage.state.currentMonthKey) {
            // Current active month
            if (this.reportRegion === 'JP') {
                periodTotalBudget = storage.state.jpTotalBudget || 0;
            } else {
                periodTotalBudget = storage.state.inTotalBudget || (storage.state.categories['IN'] || []).reduce((sum, c) => sum + (c.budget || 0), 0);
            }
            (storage.state.categories[this.reportRegion] || []).forEach(c => {
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
            storage.saveData();
        }
        const snapshotMeta = this.reportSnapshotsCache[cacheKey];

        // 7. Render Snapshot Hero Section
        const heroEl = document.getElementById('report-snapshot-hero');
        if (heroEl) {
            const statusBadge = isClosed 
                ? `<span class="report-status-badge closed"><i data-lucide="lock" style="width:12px;height:12px;"></i> Closed & Reconciled</span>`
                : `<span class="report-status-badge active"><i data-lucide="activity" style="width:12px;height:12px;"></i> Active Reporting Period</span>`;

            const budgetPct = periodTotalBudget > 0 ? Math.min((totalExpense / periodTotalBudget) * 100, 100) : 0;
            const budgetRem = periodTotalBudget - totalExpense;
            const utilizationPct = periodTotalBudget > 0 ? Math.round((totalExpense / periodTotalBudget) * 100) : 0;
            const isOver = budgetRem < 0;

            let barClass = 'neon-safe';
            if (budgetPct > 90 || utilizationPct > 100) barClass = 'neon-danger';
            else if (budgetPct > 75 || utilizationPct >= 75) barClass = 'neon-warn';

            const incomeCount = reportTxs.filter(t => t.type === 'income').length;
            const expenseCount = reportTxs.filter(t => t.type === 'expense').length;

            heroEl.innerHTML = `
                <div class="card reports-snapshot-banner">
                    <div class="report-snapshot-top">
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                                ${this.getCountryFlagSvg(this.reportRegion, 24, 18)}
                                <h2 style="margin: 0; font-size: 1.35rem; font-weight: 600;">${this.reportMonthKey} Financial Snapshot</h2>
                                ${statusBadge}
                            </div>
                            <div class="report-meta-text">
                                <span>Generated: <strong>${snapshotMeta.generatedAt}</strong></span>
                                <span>•</span>
                                <span>Last Refreshed: <strong>${snapshotMeta.refreshedAt}</strong> (Rev ${snapshotMeta.revisionsCount || 1})</span>
                                <span>•</span>
                                <span>Transactions: <strong>${reportTxs.length}</strong></span>
                                <span>•</span>
                                <span>Currency: <strong>${currency} (${this.reportRegion})</strong></span>
                            </div>
                            ${snapshotMeta.revisions && snapshotMeta.revisions.length > 1 ? `
                                <div class="card reports-revisions-box">
                                    <span style="color: var(--text-muted); font-weight: 600;">Revision History (${snapshotMeta.revisions.length} retained):</span>
                                    <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 3px; color: var(--text-secondary);">
                                        ${snapshotMeta.revisions.slice(0, 3).map(r => `
                                            <div>• Rev ${r.rev} (${r.timestamp}): ${r.txCount} txs, Spent ${this.formatMoney(r.totalExpense, currency)}</div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
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

                ${periodTotalBudget > 0 ? `
                    <div class="card budget-central-card reports-budget-perf-card">
                        <div class="budget-central-header">
                            <div class="budget-central-title-group">
                                ${this.getCountryFlagSvg(this.reportRegion, 20, 15)}
                                <h3>Monthly Budget Performance</h3>
                                <span class="text-xs text-muted font-numeric">(${this.reportMonthKey})</span>
                                <span class="budget-cushion-pill privacy-blur ${isOver ? 'text-danger' : ''}" style="${isOver ? 'background: rgba(244, 63, 94, 0.12); color: #fb7185; border-color: rgba(244, 63, 94, 0.25);' : ''}">
                                    ${isOver ? `${this.formatMoney(Math.abs(budgetRem), currency)} over budget` : `+${this.formatMoney(budgetRem, currency)} cushion remaining`}
                                </span>
                            </div>
                            <div class="budget-remaining-hero">
                                <span class="remaining-val privacy-blur ${isOver ? 'text-danger' : 'text-success'}">
                                    ${this.formatMoney(isOver ? Math.abs(budgetRem) : budgetRem, currency)}
                                </span>
                                <span class="remaining-label">${isOver ? 'over budget' : 'cushion remaining'}</span>
                            </div>
                        </div>
                        <div class="budget-central-progress-wrap">
                            <div class="budget-streak-track">
                                <div class="budget-streak-fill ${barClass}" style="width: ${budgetPct}%;"></div>
                            </div>
                        </div>
                        <div class="budget-central-stats-row">
                            <span class="privacy-blur">Spent: <strong>${this.formatMoney(totalExpense, currency)}</strong></span>
                            <span class="text-xs text-muted font-numeric">${utilizationPct}% consumed</span>
                            <span class="privacy-blur">Allocated Limit: <strong>${this.formatMoney(periodTotalBudget, currency)}</strong></span>
                        </div>
                    </div>
                ` : ''}

                ${historicalBudgetNote ? `
                    <div style="padding: 10px 14px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: var(--radius-sm); font-size: 0.78rem; color: #93c5fd; display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="info" style="width: 14px; height: 14px; flex-shrink: 0;"></i>
                        <span>${historicalBudgetNote}</span>
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
                                    <i data-lucide="${cat.icon || 'tag'}" style="width: 14px; height: 14px;"></i>
                                </div>
                                <span>${cat.name}</span>
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
                    pieBadge.innerText = `${this.reportMonthKey} • ${this.reportRegion === 'JP' ? 'JPY' : 'INR'}`;
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
                    const closedTxsCount = allTxs.filter(t => (t.date || '').startsWith(h.monthKey)).length;
                    const closedDateFormatted = h.closedAt ? new Date(h.closedAt).toLocaleDateString() : 'Recorded';
                    return `
                        <div class="history-snapshot-item">
                            <div class="history-snapshot-left">
                                <div style="width: 36px; height: 36px; border-radius: var(--radius-md); background: rgba(16, 185, 129, 0.12); color: #34d399; display: flex; align-items: center; justify-content: center;">
                                    <i data-lucide="shield-check" style="width: 18px; height: 18px;"></i>
                                </div>
                                <div class="history-snapshot-info">
                                    <h4 style="margin: 0; font-size: 0.95rem;">${h.label || h.monthKey}</h4>
                                    <span class="text-xs text-muted">Closed on ${closedDateFormatted} • ${closedTxsCount} transactions captured • Overall limit: ${this.formatMoney(h.jpTotalBudget || 0, '¥')}</span>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-secondary btn-sm" onclick="app.reportMonthKey='${h.monthKey}'; app.renderReportsPage();" title="Inspect snapshot">
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
            filteredWallets.map(w => `<option value="${w.id}" ${w.id === currentWallet ? 'selected' : ''}>${w.id} (${w.currency || (w.region === 'JP' ? '¥' : '₹')})</option>`).join('');

        // Categories
        let cats = [];
        if (selectedRegion === 'ALL') {
            const jpCats = storage.state.categories?.JP || [];
            const inCats = storage.state.categories?.IN || [];
            const seen = new Set();
            [...jpCats, ...inCats].forEach(c => {
                if (!seen.has(c.id)) {
                    seen.add(c.id);
                    cats.push(c);
                }
            });
        } else {
            cats = storage.state.categories?.[selectedRegion] || [];
        }

        catSelect.innerHTML = '<option value="ALL">All Categories</option>' +
            cats.map(c => `<option value="${c.id}" ${c.id === currentCat ? 'selected' : ''}>${c.name}</option>`).join('');
    }

    onCustomReportRegionChange() {
        this.populateCustomReportFilters();
    }

    resetCustomRangeReport() {
        const startInput = document.getElementById('report-custom-start');
        const endInput = document.getElementById('report-custom-end');
        const regSelect = document.getElementById('report-custom-region');
        const resultsEl = document.getElementById('report-custom-results');

        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
        if (regSelect) regSelect.value = 'ALL';

        this.populateCustomReportFilters();

        if (resultsEl) {
            resultsEl.style.display = 'none';
            resultsEl.innerHTML = '';
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
            if (!tx.date || tx.date < start || tx.date > end) return false;
            if (selRegion !== 'ALL' && tx.region !== selRegion) return false;
            if (selWallet !== 'ALL' && tx.walletId !== selWallet) return false;
            if (selCategory !== 'ALL' && tx.categoryId !== selCategory) return false;
            return true;
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // Separate totals for JP and IN
        let jpIncome = 0, jpExpense = 0;
        let inIncome = 0, inExpense = 0;
        const catMap = {};

        customTxs.forEach(tx => {
            const amt = Number(tx.amount || 0);
            const reg = tx.region || (storage.state.categories?.JP?.some(c => c.id === tx.categoryId) ? 'JP' : 'IN');
            if (reg === 'JP') {
                if (tx.type === 'income') jpIncome += amt;
                else if (tx.type === 'expense') jpExpense += amt;
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
            categories: sortedCats
        };

        const hasJp = (selRegion === 'ALL' || selRegion === 'JP');
        const hasIn = (selRegion === 'ALL' || selRegion === 'IN');

        let kpiHtml = '';
        if (hasJp) {
            kpiHtml += `
                <div style="background: rgba(255, 255, 255, 0.02); padding: 12px 16px; border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06); display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${this.getCountryFlagSvg('JP', 16, 12)}
                        <strong style="font-size: 0.85rem;">Japan (JPY ¥)</strong>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                        <div>
                            <span class="text-xs text-muted">Income</span>
                            <div class="font-bold text-success privacy-blur font-numeric" style="font-size: 1.05rem;">${this.formatMoney(jpIncome, '¥')}</div>
                        </div>
                        <div>
                            <span class="text-xs text-muted">Expenses</span>
                            <div class="font-bold text-danger privacy-blur font-numeric" style="font-size: 1.05rem;">${this.formatMoney(jpExpense, '¥')}</div>
                        </div>
                        <div>
                            <span class="text-xs text-muted">Net Surplus</span>
                            <div class="font-bold ${jpIncome - jpExpense >= 0 ? 'text-success' : 'text-danger'} privacy-blur font-numeric" style="font-size: 1.05rem;">${this.formatMoney(jpIncome - jpExpense, '¥')}</div>
                        </div>
                    </div>
                </div>
            `;
        }
        if (hasIn) {
            kpiHtml += `
                <div style="background: rgba(255, 255, 255, 0.02); padding: 12px 16px; border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06); display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${this.getCountryFlagSvg('IN', 16, 12)}
                        <strong style="font-size: 0.85rem;">India (INR ₹)</strong>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                        <div>
                            <span class="text-xs text-muted">Income</span>
                            <div class="font-bold text-success privacy-blur font-numeric" style="font-size: 1.05rem;">${this.formatMoney(inIncome, '₹')}</div>
                        </div>
                        <div>
                            <span class="text-xs text-muted">Expenses</span>
                            <div class="font-bold text-danger privacy-blur font-numeric" style="font-size: 1.05rem;">${this.formatMoney(inExpense, '₹')}</div>
                        </div>
                        <div>
                            <span class="text-xs text-muted">Net Surplus</span>
                            <div class="font-bold ${inIncome - inExpense >= 0 ? 'text-success' : 'text-danger'} privacy-blur font-numeric" style="font-size: 1.05rem;">${this.formatMoney(inIncome - inExpense, '₹')}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        let catBreakdownHtml = '';
        if (sortedCats.length > 0) {
            catBreakdownHtml = `
                <div style="margin-top: 10px;">
                    <h5 style="margin: 0 0 8px 0; font-size: 0.86rem; font-weight: 600; color: var(--text-secondary);">Category Breakdown</h5>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${sortedCats.slice(0, 8).map(c => {
                            const cur = c.region === 'JP' ? '¥' : '₹';
                            const regTotalExp = c.region === 'JP' ? jpExpense : inExpense;
                            const share = regTotalExp > 0 ? Math.round((c.amount / regTotalExp) * 100) : 0;
                            return `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.04); font-size: 0.82rem;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <i data-lucide="${c.icon}" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
                                        <span>${c.name}</span>
                                        <span class="text-xs text-muted">(${c.count} txs)</span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <span class="text-xs text-muted font-numeric">${share}%</span>
                                        <strong class="privacy-blur font-numeric">${this.formatMoney(c.amount, cur)}</strong>
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
                        <h4 style="margin: 0; font-size: 1.02rem; font-weight: 600;">Statement: ${start} to ${end}</h4>
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

        const isPrivacy = this.isPrivacyHidden;
        const fmt = (val, cur) => {
            if (isPrivacy) return '••••••';
            return this.formatMoney(val, cur);
        };

        let sectionsHtml = '';

        if (data.region === 'ALL' || data.region === 'JP') {
            const jpTxs = data.transactions.filter(t => t.region === 'JP' || (!t.region && storage.state.categories?.JP?.some(c => c.id === t.categoryId)));
            sectionsHtml += `
                <div class="print-page-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 16px;">
                        <h2 style="margin: 0; font-size: 1.3rem; color: #fff;">Japan Portfolio (JPY ¥)</h2>
                        <span style="font-size: 0.85rem; color: #aaa;">${jpTxs.length} Transactions</span>
                    </div>
                    <div class="print-summary" style="margin-bottom: 20px;">
                        <div class="print-summary-item">
                            <span>Total Income</span>
                            <strong style="color: #34d399;">${fmt(data.jpIncome, '¥')}</strong>
                        </div>
                        <div class="print-summary-item">
                            <span>Total Expenses</span>
                            <strong style="color: #fb7185;">${fmt(data.jpExpense, '¥')}</strong>
                        </div>
                        <div class="print-summary-item">
                            <span>Net Position</span>
                            <strong style="color: ${data.jpNet >= 0 ? '#34d399' : '#fb7185'};">${fmt(data.jpNet, '¥')}</strong>
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
                            ${jpTxs.map(t => `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                                    <td style="padding: 6px 8px;">${t.date}</td>
                                    <td style="padding: 6px 8px;">${t.walletId || '-'}</td>
                                    <td style="padding: 6px 8px;">${this.getTransactionCategory(t)}</td>
                                    <td style="padding: 6px 8px; color: #aaa;">${t.note || '-'}</td>
                                    <td style="padding: 6px 8px; text-align: right; font-weight: 600; color: ${t.type === 'income' ? '#34d399' : '#ffffff'};">
                                        ${t.type === 'income' ? '+' : '-'}${fmt(t.amount, '¥')}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        if (data.region === 'ALL' || data.region === 'IN') {
            const inTxs = data.transactions.filter(t => t.region === 'IN' || (!t.region && storage.state.categories?.IN?.some(c => c.id === t.categoryId)));
            sectionsHtml += `
                <div class="print-page-section ${data.region === 'ALL' ? 'print-page-break' : ''}" style="margin-top: ${data.region === 'ALL' ? '40px' : '0'};">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 16px;">
                        <h2 style="margin: 0; font-size: 1.3rem; color: #fff;">India Portfolio (INR ₹)</h2>
                        <span style="font-size: 0.85rem; color: #aaa;">${inTxs.length} Transactions</span>
                    </div>
                    <div class="print-summary" style="margin-bottom: 20px;">
                        <div class="print-summary-item">
                            <span>Total Income</span>
                            <strong style="color: #34d399;">${fmt(data.inIncome, '₹')}</strong>
                        </div>
                        <div class="print-summary-item">
                            <span>Total Expenses</span>
                            <strong style="color: #fb7185;">${fmt(data.inExpense, '₹')}</strong>
                        </div>
                        <div class="print-summary-item">
                            <span>Net Position</span>
                            <strong style="color: ${data.inNet >= 0 ? '#34d399' : '#fb7185'};">${fmt(data.inNet, '₹')}</strong>
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
                            ${inTxs.map(t => `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                                    <td style="padding: 6px 8px;">${t.date}</td>
                                    <td style="padding: 6px 8px;">${t.walletId || '-'}</td>
                                    <td style="padding: 6px 8px;">${this.getTransactionCategory(t)}</td>
                                    <td style="padding: 6px 8px; color: #aaa;">${t.note || '-'}</td>
                                    <td style="padding: 6px 8px; text-align: right; font-weight: 600; color: ${t.type === 'income' ? '#34d399' : '#ffffff'};">
                                        ${t.type === 'income' ? '+' : '-'}${fmt(t.amount, '₹')}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        const now = new Date().toLocaleString();
        printContainer.innerHTML = `
            <div class="print-header">
                <h1>Expense Manager Statement</h1>
                <p>Statement Period: <strong>${data.startDate}</strong> to <strong>${data.endDate}</strong> • Scope: ${data.region} (${data.wallet} / ${data.category})</p>
                <p style="font-size: 0.78rem; color: #888; margin-top: 4px;">Generated on ${now} • Continuous Ledger Audit Snapshot</p>
            </div>
            ${sectionsHtml}
        `;

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            lucide.createIcons({ root: printContainer });
        }

        setTimeout(() => {
            window.print();
        }, 300);
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
        const allTxs = storage.state.transactions || [];
        const monthTxs = allTxs.filter(t => (t.date || '').startsWith(curMonth));

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
                        <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; color: #93c5fd;">Step 1: Review Closing Period Summary (${curMonth})</h4>
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
                        Total <strong>${monthTxs.length}</strong> transactions recorded in month <code>${curMonth}</code> will be sealed into the audit snapshot.
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
                        <strong style="font-size: 0.88rem;">${w.id}</strong>
                    </div>
                    <div class="font-bold privacy-blur" style="font-size: 0.95rem;">${this.formatMoney(w.balance, w.currency || (w.region === 'JP' ? '¥' : '₹'))}</div>
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
                        <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; color: #fbbf24;">Step 3: Configure Budgets for Next Month (${nextMonth})</h4>
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
                                        <input type="number" id="closing-manual-jp-input" value="${this.closingWizardState.customJpBudget}" step="1000" min="0" style="width: 140px; padding: 6px 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: var(--text-primary); font-size: 0.85rem;" onchange="app.closingWizardState.customJpBudget = Number(this.value)">
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
                        <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; color: #a5b4fc;">Step 4: Preview Opening State for ${nextMonth}</h4>
                        <p class="text-xs text-muted" style="margin: 0;">Verify next month's opening state prior to final confirmation.</p>
                    </div>

                    <div class="closing-stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
                        <div style="background: rgba(255, 255, 255, 0.02); padding: 14px; border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06);">
                            <span class="text-xs text-muted">Next Active Month</span>
                            <div class="font-bold text-primary" style="font-size: 1.15rem; margin-top: 4px;">${nextMonth}</div>
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
                        <h3 style="margin: 0 0 6px 0; font-size: 1.15rem; font-weight: 600;">Final Confirmation: Close Month ${curMonth}</h3>
                        <p class="text-xs text-muted" style="margin: 0;">
                            Month <code>${curMonth}</code> will be frozen and permanently recorded in <code>closedMonths</code>.
                            The application will advance to <code>${nextMonth}</code>.
                        </p>
                    </div>

                    <div style="padding: 12px 14px; background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px;"><i data-lucide="check" style="width: 14px; height: 14px; color: var(--emerald); flex-shrink: 0;"></i><span>Wallet balances continue seamlessly without artificial adjustments.</span></div>
                        <div style="display: flex; align-items: center; gap: 8px;"><i data-lucide="check" style="width: 14px; height: 14px; color: var(--emerald); flex-shrink: 0;"></i><span>Continuous transaction ledger remains intact.</span></div>
                        <div style="display: flex; align-items: center; gap: 8px;"><i data-lucide="check" style="width: 14px; height: 14px; color: var(--emerald); flex-shrink: 0;"></i><span>Snapshots capture categories and limits for audit reconstruction.</span></div>
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

    executeMonthlyClosing() {
        const curMonth = this.closingWizardState.monthKey;
        const nextMonth = this.closingWizardState.nextMonthKey;

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

        if (!storage.state.closedMonths) {
            storage.state.closedMonths = {};
        }

        // Record permanent month snapshot in closedMonths with category configuration snapshot
        storage.state.closedMonths[curMonth] = {
            monthKey: curMonth,
            label: curMonth,
            closedAt: new Date().toISOString(),
            walletsSnapshot: JSON.parse(JSON.stringify(storage.state.wallets)),
            categoriesSnapshot: JSON.parse(JSON.stringify(storage.state.categories)),
            jpTotalBudget: storage.state.jpTotalBudget,
            status: 'closed'
        };

        // Derive history view directly from closedMonths
        storage.state.history = Object.values(storage.state.closedMonths).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        if (typeof storage._attachHistoryGetters === 'function') {
            storage._attachHistoryGetters(storage.state);
        }

        // Advance current month key and set next allocated budget limit
        storage.state.currentMonthKey = nextMonth;
        storage.state.jpTotalBudget = nextJpBudget;

        // Persist safely to local and cloud
        storage.saveData();

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
    }

    // =========================================================================
    // PHASE 4: BUDGETS & CATEGORY MANAGEMENT CENTRE
    // =========================================================================

    setBudgetsRegion(region) {
        if (region !== 'JP' && region !== 'IN') return;
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
        const region = this.budgetsRegion || 'JP';
        const isJp = region === 'JP';
        const currency = isJp ? '¥' : '₹';
        const curMonth = (storage.state && storage.state.currentMonthKey) || new Date().toISOString().slice(0, 7);

        // Update active month label
        const monthLabel = document.getElementById('budgets-month-label');
        if (monthLabel) {
            monthLabel.innerText = curMonth;
        }

        // Sync search input value if present
        const searchInput = document.getElementById('budgets-cat-search-input');
        if (searchInput && document.activeElement !== searchInput) {
            searchInput.value = this.budgetsCatSearch || '';
        }

        // Transactions in active month for active region
        const allTxs = storage.state.transactions || [];
        const monthTxs = allTxs.filter(t => (t.date || '').startsWith(curMonth) && t.region === region);

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
        const allCats = storage.state.categories[region] || [];

        const sumCatLimits = allCats
            .filter(c => c.contributesToTotalBudget !== false && c.isActive !== false)
            .reduce((s, c) => s + (c.budget || 0), 0);

        // Overall Monthly Budget (Configurable independently of category-level limits)
        const allocatedBudget = isJp
            ? (storage.state.jpTotalBudget !== undefined && storage.state.jpTotalBudget !== null ? storage.state.jpTotalBudget : 0)
            : (storage.state.inTotalBudget !== undefined && storage.state.inTotalBudget !== null ? storage.state.inTotalBudget : sumCatLimits);

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
        this.renderBudgetOverviewCard('budgets-summary-banner', {
            region: region,
            monthKey: curMonth,
            totalSpent: totalSpent,
            allocatedBudget: allocatedBudget,
            isInteractive: true,
            showEditButton: true
        });

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
                        <div class="card budget-cat-card interactive-card ${isOver ? 'is-overbudget' : ''}" id="budget-cat-card-${c.id}" onclick="app.openCategoryManageModal('${c.id}', '${region}')">
                            <!-- Card Header -->
                            <div class="budget-cat-card-header">
                                <div class="budget-cat-identity">
                                    <div class="budget-cat-icon-box">
                                        <i data-lucide="${c.icon || 'tag'}" style="width: 18px; height: 18px;"></i>
                                    </div>
                                    <div class="budget-cat-info">
                                        <div class="budget-cat-title-row">
                                            <h4 class="budget-cat-name" title="${c.name}">${c.name}</h4>
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
                                    <button class="budget-cat-config-btn" onclick="event.stopPropagation(); app.openCategoryManageModal('${c.id}', '${region}')" title="Configure Category & Limit">
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
        const isJp = region === 'JP';
        const currency = isJp ? '¥' : '₹';

        const btnJp = document.getElementById('overall-budget-btn-jp');
        const btnIn = document.getElementById('overall-budget-btn-in');
        if (btnJp && btnIn) {
            btnJp.classList.toggle('active', isJp);
            btnIn.classList.toggle('active', !isJp);
        }

        const currLabel = document.getElementById('overall-budget-curr-label');
        const currPrefix = document.getElementById('overall-budget-curr-prefix');
        if (currLabel) currLabel.innerText = currency;
        if (currPrefix) currPrefix.innerText = currency;

        const cats = storage.state.categories[region] || [];
        const sumCatLimits = cats.filter(c => c.contributesToTotalBudget !== false && c.isActive !== false).reduce((s, c) => s + (c.budget || 0), 0);

        const currentVal = isJp
            ? (storage.state.jpTotalBudget !== undefined ? storage.state.jpTotalBudget : 0)
            : (storage.state.inTotalBudget !== undefined && storage.state.inTotalBudget !== null ? storage.state.inTotalBudget : sumCatLimits);

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
        const isJp = region === 'JP';
        const currency = isJp ? '¥' : '₹';

        const cats = storage.state.categories[region] || [];
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

    saveOverallBudget() {
        const region = this.overallBudgetModalRegion || 'JP';
        const isJp = region === 'JP';
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

        if (isJp) {
            storage.state.jpTotalBudget = numVal;
        } else {
            storage.state.inTotalBudget = numVal;
        }

        // Persist via storage architecture
        storage.saveData();

        // Update settings inputs if present
        const jpBudEl = document.getElementById('setting-jp-budget');
        if (jpBudEl && isJp) {
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
                html = `<div style="grid-column: 1 / -1; padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No icons matching "${q}"</div>`;
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

    saveCategoryConfig() {
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

        if (!storage.state.categories[targetRegion]) {
            storage.state.categories[targetRegion] = [];
        }

        if (catId) {
            // Edit existing category
            const origRegion = this.editingCatRegion || targetRegion;
            let cat = (storage.state.categories[origRegion] || []).find(c => c.id === catId);

            if (cat) {
                cat.name = catName;
                cat.icon = this.selectedCatIcon;
                cat.budget = budgetAmt;
                cat.isActive = isActive;
                cat.hiddenFromBudgetOverview = hiddenFromOverview;
                cat.contributesToTotalBudget = contributesToTotal;

                // Handle region migration if region changed
                if (origRegion !== targetRegion && targetRegion !== 'ALL') {
                    storage.state.categories[origRegion] = storage.state.categories[origRegion].filter(c => c.id !== catId);
                    storage.state.categories[targetRegion].push(cat);
                }
            }
        } else {
            // Create new category
            const newId = `${targetRegion.toLowerCase()}-${catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
            storage.state.categories[targetRegion].push({
                id: newId,
                name: catName,
                icon: this.selectedCatIcon,
                budget: budgetAmt,
                isActive: isActive,
                hiddenFromBudgetOverview: hiddenFromOverview,
                contributesToTotalBudget: contributesToTotal
            });
        }

        storage.saveData();
        this.closeCategoryManageModal();
        this.renderAll();
        if (this.currentView === 'budgets-view') {
            this.renderBudgetsPage();
        }
        this.updateExpenseCategories();
    }

    toggleCategoryArchive() {
        if (!this.editingCatId) return;
        const targetRegion = this.editingCatRegion || document.getElementById('cat-edit-country')?.value || 'JP';
        let cat = (storage.state.categories[targetRegion] || []).find(c => c.id === this.editingCatId);

        if (!cat) {
            for (const r of ['JP', 'IN']) {
                const found = (storage.state.categories[r] || []).find(c => c.id === this.editingCatId);
                if (found) { cat = found; break; }
            }
        }

        if (!cat) return;

        cat.isActive = !(cat.isActive !== false);
        storage.saveData();
        this.closeCategoryManageModal();
        this.renderAll();
        if (this.currentView === 'budgets-view') {
            this.renderBudgetsPage();
        }
        this.updateExpenseCategories();
    }
}
const app = new App();
window.app = app;

