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

    formatMoney(amount, currency = '', options = {}) {
        if (this.isPrivacyHidden) {
            return '******';
        }
        const num = Number(amount) || 0;
        const prefix = options.prefix || '';
        const locale = options.locale || (currency === '₹' ? 'en-IN' : undefined);
        const formatted = num.toLocaleString(locale, options.formatOptions);
        return `${prefix}${currency}${formatted}`;
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
            const isDesktop = btn.classList.contains('desktop-privacy-btn');
            if (this.isPrivacyHidden) {
                btn.innerHTML = `<i data-lucide="eye-off"></i>${isDesktop ? '<span class="privacy-btn-label">Concealed</span>' : ''}`;
                btn.setAttribute('aria-label', 'Reveal monetary values');
                btn.setAttribute('title', 'Reveal monetary values');
                btn.classList.remove('revealed');
            } else {
                btn.innerHTML = `<i data-lucide="eye"></i>${isDesktop ? '<span class="privacy-btn-label">Revealed</span>' : ''}`;
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
                const overlay = document.getElementById('focus-overlay');
                if (overlay && overlay.style.display !== 'none') {
                    this.closeFocusOverlay();
                    return;
                }
                ['add-wallet-modal', 'edit-wallet-modal', 'transaction-modal', 'quick-edit-modal', 'color-picker-modal', 'pdf-modal'].forEach(mId => {
                    const el = document.getElementById(mId);
                    if (el && el.classList.contains('active')) {
                        this.closeModal(mId);
                    }
                });
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
            'home-view': 'Overview & Accounts',
            'dashboard-view': 'Overview & Accounts',
            'transactions-view': 'Continuous Ledger & Filters',
            'analytics-view': 'Spending Patterns & Insights',
            'reports-view': 'Monthly Snapshots & Closing',
            'budgets-view': 'Budget Allocation & Categories',
            'wallets-view': 'Account Management',
            'settings-view': 'Preferences & Security',
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

        if (user) {
            const email = user.email || '';
            const displayName = user.user_metadata?.full_name || email.split('@')[0] || 'User';
            if (nameEl) nameEl.innerText = displayName;
            if (emailEl) emailEl.innerText = email;
            if (initialsEl) {
                const parts = displayName.trim().split(/\s+/);
                const initials = parts.length > 1
                    ? (parts[0][0] + parts[1][0]).toUpperCase()
                    : displayName.substring(0, 2).toUpperCase();
                initialsEl.innerText = initials || 'TK';
            }
        } else {
            if (nameEl) nameEl.innerText = 'Personal';
            if (emailEl) emailEl.innerText = 'Connected';
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
                <button type="submit" class="btn btn-primary">Save Expense</button>
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
            const utils = storage.state.categories.JP.filter(c => c.id.startsWith('jp-utility-'));
            const others = storage.state.categories.JP.filter(c => !c.id.startsWith('jp-utility-'));

            html = others.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            if (utils.length > 0) {
                html += `<option value="utility-group">Utilities</option>`;
                if (subSelect) {
                    subSelect.innerHTML = utils.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                }
            }
        } else {
            html = storage.state.categories[region].map(c => `<option value="${c.id}">${c.name}</option>`).join('');
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
            const jpBudEl = document.getElementById('setting-jp-budget');
            if (jpBudEl) {
                jpBudEl.value = storage.state.jpTotalBudget;
            }

            if (storage.state.loanConfig) {
                const loanTotalEl = document.getElementById('setting-loan-total-principal');
                if (loanTotalEl) {
                    loanTotalEl.value = storage.state.loanConfig.totalPrincipal;
                }

                const loanPrinEl = document.getElementById('setting-loan-principal');
                if (loanPrinEl) {
                    loanPrinEl.value = storage.state.loanConfig.principalLeft;
                }

                document.getElementById('setting-loan-total-dues').value = storage.state.loanConfig.totalDues;
                document.getElementById('setting-loan-dues').value = storage.state.loanConfig.duesPaid;
                const dateEl = document.getElementById('setting-loan-date');
                if (dateEl) dateEl.value = storage.state.loanConfig.emiDrawDate || 7;

                const btn = document.getElementById('loan-visibility-btn');
                if (btn) {
                    const isEnabled = storage.state.loanConfig.enabled !== false;
                    btn.innerHTML = `<i data-lucide="${isEnabled ? 'eye' : 'eye-off'}" style="width: 18px; height: 18px;"></i>`;
                    if (isEnabled) {
                        btn.style.color = 'var(--text-muted)';
                        btn.style.background = 'transparent';
                    } else {
                        btn.style.color = 'var(--red)';
                        btn.style.background = 'rgba(239, 68, 68, 0.1)';
                        btn.style.borderRadius = '5px';
                    }
                }
            }

            // Render wallet balances
            let walletHtml = '';
            Object.values(storage.state.wallets).forEach(w => {
                const icon = w.type === 'bank' ? 'landmark' : w.type === 'card' ? 'credit-card' : w.type === 'cash' ? 'banknote' : 'smartphone';
                walletHtml += `
                    <div class="draggable-item" data-id="${w.id}" data-type="wallet" draggable="true" ondragstart="app.handleDragStart(event)" ondragover="app.handleDragOver(event)" ondrop="app.handleDrop(event, 'wallet')" ondragenter="app.handleDragEnter(event)" ondragleave="app.handleDragLeave(event)" ondragend="app.handleDragEnd(event)" style="padding:12px 0; border-bottom:1px solid var(--border); transition: all 0.2s ease;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="display:flex; align-items:center; gap:8px; font-size:0.9rem;">
                                <i data-lucide="grip-vertical" style="color:var(--text-muted); cursor:grab; width:16px; height:16px;"></i>
                                <span style="width:10px;height:10px;border-radius:50%;background:${w.color};flex-shrink:0;"></span>
                                <i data-lucide="${icon}"></i> ${w.id} <small class="text-muted">(${w.currency})</small>
                            </span>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <input type="number" value="${w.balance}" onblur="app.updateWalletBalance('${w.id}', this.value)" style="width:100px;">
                                <button onclick="app.openColorPicker('${w.id}')" style="background:var(--bg-elevated);border:1px solid var(--border);color:var(--text-muted);cursor:pointer;padding:5px 8px;border-radius:6px;font-size:0.75rem;font-family:inherit;display:flex;align-items:center;gap:4px;"><i data-lucide="palette" style="width:13px;height:13px;"></i> Color</button>
                                <button onclick="app.removeWallet('${w.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;padding:4px;display:flex;align-items:center;"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                            </div>
                        </div>
                    </div>
                `;
            });

            const inputStyle = 'width:100%;padding:10px;background:var(--bg-main);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-main);font-family:inherit;font-size:0.9rem;';
            walletHtml += `
                <div style="margin-top:16px;">
                    <div style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Add New Wallet</div>
                    <input type="text" id="new-wallet-name" placeholder="Wallet name (e.g. Rakuten Bank)" style="${inputStyle} margin-bottom:8px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                        <select id="new-wallet-type" style="${inputStyle}">
                            <option value="bank">🏦 Bank</option>
                            <option value="digital">📱 Digital</option>
                            <option value="cash">💵 Cash</option>
                            <option value="card">💳 Card</option>
                        </select>
                        <select id="new-wallet-region" style="${inputStyle}">
                            <option value="JP">🇯🇵 Japan (¥)</option>
                            <option value="IN">🇮🇳 India (₹)</option>
                        </select>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <div id="new-wallet-color-preview" style="width:38px;height:38px;border-radius:8px;flex-shrink:0;background:linear-gradient(135deg,rgba(16,185,129,0.22),rgba(16,185,129,0.06));border:1px solid rgba(16,185,129,0.45);"></div>
                        <button onclick="app.openColorPicker(null)" style="flex:1;padding:9px;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text-main);border-radius:var(--radius-sm);font-family:inherit;font-size:0.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;"><i data-lucide="palette" style="width:15px;height:15px;"></i> Pick Color</button>
                        <input type="hidden" id="new-wallet-color" value="${WALLET_COLORS[0]}">
                    </div>
                    <button onclick="app.addWallet()" style="padding:10px;background:var(--accent);color:white;border:none;border-radius:var(--radius-sm);font-weight:600;cursor:pointer;font-family:inherit;width:100%;">+ Add Wallet</button>
                </div>
            `;
            document.getElementById('settings-wallets-list').innerHTML = walletHtml;

            // Render JP category budgets with delete and add-new
            const renderCats = (region, elId) => {
                let catHtml = '';
                storage.state.categories[region].forEach(c => {
                    catHtml += `
                        <div class="setting-row draggable-item" data-id="${c.id}" data-type="category" data-region="${region}" draggable="true" ondragstart="app.handleDragStart(event)" ondragover="app.handleDragOver(event)" ondrop="app.handleDrop(event, 'category', '${region}')" ondragenter="app.handleDragEnter(event)" ondragleave="app.handleDragLeave(event)" ondragend="app.handleDragEnd(event)" style="transition: all 0.2s ease;">
                            <span style="display:flex; align-items:center; gap:8px;">
                                <i data-lucide="grip-vertical" style="color:var(--text-muted); cursor:grab; width:16px; height:16px;"></i>
                                <i data-lucide="${c.icon || 'tag'}"></i> ${c.name}
                            </span>
                            <div style="display:flex;align-items:center;gap:8px;">
                                ${region === 'JP' ? `<input type="number" value="${c.budget || 0}" onblur="app.updateCategoryBudget('${c.id}', this.value)" style="width:90px;">` : ''}
                                <button onclick="app.removeCategory('${region}','${c.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;padding:4px;display:flex;align-items:center;"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                            </div>
                        </div>
                    `;
                });
                catHtml += `
                    <div class="add-category-form" style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
                        <div style="font-size:0.8rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Add New Category</div>
                        <input type="text" id="new-cat-name-${region}" placeholder="Category name (e.g. Car / Parking)" style="width:100%;padding:10px;background:var(--bg-main);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-main);font-family:inherit;font-size:0.9rem;">
                        ${region === 'JP' ? `<input type="number" id="new-cat-budget-${region}" placeholder="Budget (¥, optional)" style="width:100%;padding:10px;background:var(--bg-main);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-main);font-family:inherit;font-size:0.9rem;">` : ''}
                        <button onclick="app.addCategory('${region}')" style="padding:10px;background:var(--accent);color:white;border:none;border-radius:var(--radius-sm);font-weight:600;cursor:pointer;font-family:inherit;">+ Add Category</button>
                    </div>
                `;
                document.getElementById(elId).innerHTML = catHtml;
            };

            renderCats('JP', 'settings-categories-list');
            renderCats('IN', 'settings-in-categories-list');
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

        // Populate Rail mini account breakdown
        const railAccSummary = document.getElementById('rail-account-summary');
        if (railAccSummary) {
            let railHtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
            Object.values(storage.state.wallets).forEach(w => {
                const theme = this.getThemeForWallet(w);
                railHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); cursor: pointer;" onclick="app.openWalletFocus('${w.id}')" title="Inspect ${w.id}">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${theme.color}; flex-shrink: 0;"></span>
                            <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary);">${w.id}</span>
                        </div>
                        <span class="privacy-blur" style="font-size: 0.8rem; font-family: var(--font-numeric); font-weight: 600; color: var(--text-secondary);">${this.formatMoney(w.balance, w.currency)}</span>
                    </div>
                `;
            });
            railHtml += '</div>';
            railAccSummary.innerHTML = railHtml;
        }

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

        // Change layout of category grids to 2-columns
        ['jp-categories-grid', 'in-categories-grid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'grid';
                el.style.gridTemplateColumns = '1fr 1fr';
                el.style.gap = '12px';
            }
        });

        const jpTotalSpent = walletManager.getTotalSpent('JP', this.getActiveTransactions());
        const jpRem = Math.max(0, storage.state.jpTotalBudget - jpTotalSpent);
        const pct = storage.state.jpTotalBudget > 0 ? Math.min((jpTotalSpent / storage.state.jpTotalBudget) * 100, 100) : 0;

        // Cushion = overall budget minus sum of individual category budgets
        const sumCatBudgets = storage.state.categories.JP.reduce((s, c) => s + (c.budget || 0), 0);
        const cushion = Math.max(0, storage.state.jpTotalBudget - sumCatBudgets);

        const card = document.getElementById('budget-overview-card');
        if (card) {
            card.innerHTML = `
                <div class="card" style="margin: 0; padding: 16px; background: transparent; border: none;">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:baseline;">
                            <span class="text-sm text-muted">Japan Budget</span>
                            <span class="font-bold privacy-blur">${this.formatMoney(jpRem, '¥')} left</span>
                        </div>
                        <div class="neon-bar-bg" style="margin-top: 6px;">
                            <div class="neon-bar-fill ${pct > 90 ? 'neon-danger' : pct > 75 ? 'neon-warn' : 'neon-safe'}" style="width: ${pct}%"></div>
                        </div>
                        <div style="margin-top: 8px; display:flex; justify-content:space-between; align-items:center;">
                            <span class="text-muted text-xs privacy-blur">Spent ${this.formatMoney(jpTotalSpent, '¥')} of ${this.formatMoney(storage.state.jpTotalBudget, '¥')}</span>
                            ${cushion > 0 ? `<span style="font-size:0.72rem; background:rgba(16,185,129,0.12); color:#10b981; padding:2px 8px; border-radius:10px; font-weight:600;">+${this.formatMoney(cushion, '¥')} cushion</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        this.renderWalletsPage();
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

            storage.state.categories[region].forEach(c => {
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
                    <div class="neon-row" style="padding: 12px;" onclick="app.openQuickEditModal('category', '${c.id}', '${region}')">
                        <div class="neon-header" style="margin-bottom: 8px;">
                            <span class="neon-title"><i data-lucide="${c.icon}"></i> ${c.name}</span>
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
        const txs = activeTxs.slice(0, 6); // Latest 6 for dashboard
        const container = document.getElementById('recent-transactions-list');

        if (!container) return;

        if (txs.length === 0) {
            container.innerHTML = '<p class="text-muted text-center" style="padding: 24px;">No transactions recorded this month.</p>';
            return;
        }

        let html = '';
        txs.forEach(tx => {
            let icon = 'arrow-up-right';
            let colorCls = 'text-rose';
            let sign = '-';
            let title = tx.note || tx.categoryId || 'Expense';
            let categoryName = '';

            if (tx.type === 'income') {
                icon = 'arrow-down-left';
                colorCls = 'text-emerald';
                sign = '+';
                title = tx.note || 'Income';
            } else if (tx.type === 'transfer') {
                icon = 'repeat';
                colorCls = 'text-muted';
                sign = '';
                title = `Transfer: ${tx.sourceId} → ${tx.destId}`;
            } else if (tx.type === 'remittance') {
                icon = 'globe';
                colorCls = 'text-muted';
                sign = '';
                title = `Remittance: JP → IN`;
            } else {
                const regionCats = storage.state.categories[tx.region];
                const cat = regionCats?.find(c => c.id === tx.categoryId);
                if (cat) {
                    categoryName = cat.name;
                    title = cat.name;
                }
            }

            const amt = (tx.type === 'remittance')
                ? (this.isPrivacyHidden ? '******' : `¥${tx.sourceAmount?.toLocaleString()} → ₹${tx.destAmount?.toLocaleString()}`)
                : this.formatMoney(tx.amount, tx.currency, { prefix: sign });

            const flag = tx.region === 'JP' ? '🇯🇵' : (tx.region === 'IN' ? '🇮🇳' : '');
            const date = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

            let metaString = `${date} • ${tx.walletId || 'Wallet'}`;
            if (tx.note && tx.type !== 'income' && categoryName) {
                metaString += ` • ${tx.note}`;
            }

            html += `
                <div class="tx-row" onclick="app.editTransaction('${tx.id}')" style="cursor: pointer;">
                    <div class="tx-left">
                        <div class="tx-icon-wrap ${tx.type === 'income' ? 'income' : tx.type === 'transfer' ? 'transfer' : 'expense'}">
                            <i data-lucide="${icon}"></i>
                        </div>
                        <div class="tx-info">
                            <div class="tx-title-line">
                                <span class="tx-title">${title}</span>
                                ${flag ? `<span class="tx-country-pill">${flag}</span>` : ''}
                            </div>
                            <span class="tx-meta">${metaString}</span>
                        </div>
                    </div>
                    <div class="tx-right">
                        <span class="tx-amount privacy-blur ${colorCls}">${amt}</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        lucide.createIcons();
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
                <div class="monthly-stat-value privacy-blur" style="color: var(--emerald);">
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
                <div class="monthly-stat-value privacy-blur" style="color: var(--rose);">
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
                <div class="monthly-stat-value privacy-blur ${netSavingsClass}">
                    ${this.formatMoney(jpNet, '¥', { prefix: netSavingsSign })}
                </div>
                <div class="monthly-stat-sub">Inflows minus outflows</div>
            </div>

            <div class="monthly-stat-card">
                <div class="monthly-stat-header">
                    <span class="monthly-stat-label">Savings Rate</span>
                    <span class="monthly-stat-trend" style="color: ${savingsRateColor}; background: rgba(255,255,255,0.05);">
                        <i data-lucide="pie-chart"></i> Target 20%
                    </span>
                </div>
                <div class="monthly-stat-value privacy-blur" style="color: ${savingsRateColor};">
                    ${this.isPrivacyHidden ? '******' : `${jpSavingsRate}%`}
                </div>
                <div class="monthly-stat-sub">
                    <div class="savings-rate-bar" style="height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; margin-top: 6px; overflow: hidden;">
                        <div style="height: 100%; width: ${Math.min(jpSavingsRate, 100)}%; background: ${savingsRateColor}; border-radius: 2px;"></div>
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();
    }

    renderWalletsPage() {
        const jpGrid = document.getElementById('wallets-page-jp-grid');
        const inGrid = document.getElementById('wallets-page-in-grid');
        if (!jpGrid || !inGrid) return;

        let jpHtml = '';
        let inHtml = '';
        let jpCount = 0;
        let inCount = 0;
        let jpTotal = 0;
        let inTotal = 0;

        Object.values(storage.state.wallets).forEach(w => {
            const theme = this.getThemeForWallet(w);
            const flag = w.region === 'JP' ? '🇯🇵' : '🇮🇳';

            const cardHtml = `
                <div class="wallet-card ${theme.cls}" onclick="app.openWalletFocus('${w.id}')" title="Click to inspect ${w.id}">
                    <div class="wallet-card-header">
                        <div class="wallet-card-chip"></div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span class="wallet-type-badge">${(w.type || 'account').toUpperCase()}</span>
                            <button class="wallet-menu-btn" onclick="event.stopPropagation(); app.openEditWalletModal('${w.id}')" title="Edit wallet settings">
                                <i data-lucide="more-vertical" style="width: 14px; height: 14px;"></i>
                            </button>
                        </div>
                    </div>
                    <div class="wallet-balance-wrap">
                        <span class="wallet-balance-label">Balance</span>
                        <div class="wallet-balance-val privacy-blur">${this.formatMoney(w.balance, w.currency)}</div>
                    </div>
                    <div class="wallet-card-footer">
                        <div>
                            <div class="wallet-name">${w.id}</div>
                            <div class="wallet-number">${theme.name}</div>
                        </div>
                        <div style="font-size: 1.1rem; opacity: 0.9;">${flag}</div>
                    </div>
                </div>
            `;

            if (w.region === 'JP') {
                jpHtml += cardHtml;
                jpCount++;
                jpTotal += (w.balance || 0);
            } else {
                inHtml += cardHtml;
                inCount++;
                inTotal += (w.balance || 0);
            }
        });

        jpGrid.innerHTML = jpHtml || '<p class="text-muted text-sm" style="grid-column: 1/-1; padding: 24px; text-align: center;">No Japan wallets created yet.</p>';
        inGrid.innerHTML = inHtml || '<p class="text-muted text-sm" style="grid-column: 1/-1; padding: 24px; text-align: center;">No India wallets created yet.</p>';

        const jpCountEl = document.getElementById('wallets-page-jp-count');
        if (jpCountEl) jpCountEl.innerText = `${jpCount} ${jpCount === 1 ? 'wallet' : 'wallets'}`;

        const inCountEl = document.getElementById('wallets-page-in-count');
        if (inCountEl) inCountEl.innerText = `${inCount} ${inCount === 1 ? 'wallet' : 'wallets'}`;

        const jpTotalEl = document.getElementById('wallets-page-jp-total');
        if (jpTotalEl) jpTotalEl.innerText = this.formatMoney(jpTotal, '¥');

        const inTotalEl = document.getElementById('wallets-page-in-total');
        if (inTotalEl) inTotalEl.innerText = this.formatMoney(inTotal, '₹');

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

        let html = '';
        WALLET_THEMES.forEach(t => {
            const isActive = t.id === activeThemeId ? ' active' : '';
            html += `
                <div class="theme-swatch${isActive}" data-theme-id="${t.id}" onclick="app.selectThemeSwatch('${inputId}', '${t.id}', '${containerId}')" title="${t.name}">
                    <div class="theme-swatch-circle ${t.cls}" style="background: ${t.color};"></div>
                    <span class="theme-swatch-label">${t.name}</span>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    selectThemeSwatch(inputId, themeId, containerId) {
        const input = document.getElementById(inputId);
        if (input) input.value = themeId;
        const container = document.getElementById(containerId);
        if (container) {
            container.querySelectorAll('.theme-swatch').forEach(s => {
                if (s.getAttribute('data-theme-id') === themeId) {
                    s.classList.add('active');
                } else {
                    s.classList.remove('active');
                }
            });
        }
    }

    openCountryExpansion(region) {
        const isJp = region === 'JP';
        const currency = isJp ? '¥' : '₹';
        const flag = isJp ? '🇯🇵' : '🇮🇳';
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

        typeBadge.innerText = 'Country View';
        modalTitle.innerText = `${countryName} Portfolio`;

        primaryPanel.innerHTML = `
            <div class="country-card ${cardThemeCls} expanded" style="padding: 28px; cursor: default; transform: none; min-height: 260px; display: flex; flex-direction: column; justify-content: space-between;">
                <div class="country-card-header">
                    <div class="country-badge">
                        <span class="country-flag-icon" style="font-size: 1.25rem;">${flag}</span>
                        <span class="country-name">${countryName}</span>
                        <span class="currency-code">${isJp ? 'JPY' : 'INR'}</span>
                    </div>
                    <span class="wallet-count-pill">${regionWallets.length} ${regionWallets.length === 1 ? 'Account' : 'Accounts'}</span>
                </div>
                <div class="country-balance-body" style="margin: 24px 0;">
                    <span class="balance-label">Total Portfolio Balance</span>
                    <div class="country-total-amount financial-amount privacy-blur" style="font-size: 2.25rem;">
                        ${this.formatMoney(total, currency)}
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary" style="background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.2); color: #fff; font-size: 0.8rem; padding: 6px 12px;" onclick="app.closeFocusOverlay(); app.openTransactionModal('expense');">
                        <i data-lucide="plus" style="width:14px; height:14px; margin-right:4px;"></i> Log Expense
                    </button>
                    <button class="btn btn-secondary" style="background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.2); color: #fff; font-size: 0.8rem; padding: 6px 12px;" onclick="app.closeFocusOverlay(); app.openTransactionModal('income');">
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
                    <div class="wallet-item-compact ${theme.cls}" onclick="app.openWalletFocus('${w.id}')" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: var(--radius-md); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; border: 1px solid rgba(255,255,255,0.1);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="${icon}" style="width: 16px; height: 16px; color: #fff;"></i>
                            </div>
                            <div>
                                <div style="font-weight: 600; color: #fff; font-size: 0.9rem;">${w.id}</div>
                                <div style="font-size: 0.72rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.5px;">${w.type || 'Account'} • ${w.currency}</div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div class="privacy-blur" style="font-family: var(--font-numeric); font-weight: 700; color: #fff; font-size: 1.05rem;">
                                ${this.formatMoney(w.balance, w.currency)}
                            </div>
                            <span style="font-size: 0.72rem; color: rgba(255,255,255,0.65); text-decoration: underline;">View details →</span>
                        </div>
                    </div>
                `;
            });
        }
        walletsListHtml += `</div>`;
        secondaryPanel.innerHTML = walletsListHtml;

        overlay.style.display = 'flex';
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        lucide.createIcons();
    }

    openWalletFocus(walletId) {
        const w = storage.state.wallets[walletId];
        if (!w) return;

        const theme = this.getThemeForWallet(w);
        const flag = w.region === 'JP' ? '🇯🇵' : '🇮🇳';

        const overlay = document.getElementById('focus-overlay');
        const typeBadge = document.getElementById('focus-type-badge');
        const modalTitle = document.getElementById('focus-modal-title');
        const primaryPanel = document.getElementById('focus-primary-panel');
        const secondaryPanel = document.getElementById('focus-secondary-panel');

        if (!overlay || !primaryPanel || !secondaryPanel) return;

        typeBadge.innerText = 'Account Focus';
        modalTitle.innerText = `${w.id}`;

        primaryPanel.innerHTML = `
            <div class="wallet-card ${theme.cls}" style="padding: 26px; cursor: default; transform: none; min-height: 260px; display: flex; flex-direction: column; justify-content: space-between;">
                <div class="wallet-card-header">
                    <div class="wallet-card-chip"></div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1rem;">${flag}</span>
                        <span class="wallet-type-badge">${(w.type || 'ACCOUNT').toUpperCase()}</span>
                    </div>
                </div>
                <div class="wallet-balance-wrap" style="margin: 20px 0;">
                    <span class="wallet-balance-label">Current Balance</span>
                    <div class="wallet-balance-val privacy-blur" style="font-size: 2.2rem;">
                        ${this.formatMoney(w.balance, w.currency)}
                    </div>
                </div>
                <div class="wallet-card-footer" style="display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                        <div class="wallet-name" style="font-size: 1.15rem; font-weight: 700;">${w.id}</div>
                        <div class="wallet-number" style="font-size: 0.75rem; opacity: 0.8;">${theme.name} • ${w.currency}</div>
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 16px;">
                <button class="btn btn-primary" style="flex: 1;" onclick="app.openAddTxForWallet('${w.id}')">
                    <i data-lucide="plus" style="width: 14px; height: 14px; margin-right: 6px;"></i> Add Transaction
                </button>
                <button class="btn btn-secondary" style="flex: 1;" onclick="app.openEditWalletModal('${w.id}')">
                    <i data-lucide="edit-2" style="width: 14px; height: 14px; margin-right: 6px;"></i> Edit Wallet
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
                let icon = 'arrow-up-right';
                let colorCls = 'text-rose';
                let sign = '-';
                let label = tx.note || tx.categoryId || 'Expense';

                if (tx.type === 'income') {
                    icon = 'arrow-down-left';
                    colorCls = 'text-emerald';
                    sign = '+';
                    label = tx.note || 'Income';
                } else if (tx.type === 'transfer') {
                    icon = 'repeat';
                    colorCls = 'text-muted';
                    sign = (tx.destId === w.id) ? '+' : '-';
                    label = `Transfer: ${tx.sourceId} → ${tx.destId}`;
                } else if (tx.type === 'remittance') {
                    icon = 'globe';
                    colorCls = 'text-muted';
                    sign = '-';
                    label = 'Remittance JP → IN';
                } else if (tx.categoryId && storage.state.categories?.[tx.region]) {
                    const cat = storage.state.categories[tx.region].find(c => c.id === tx.categoryId);
                    if (cat) label = cat.name;
                }

                const formattedDate = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                txHtml += `
                    <div class="tx-row" onclick="app.editTransaction('${tx.id}')" style="cursor: pointer; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 28px; height: 28px; border-radius: 6px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="${icon}" style="width: 14px; height: 14px; color: var(--text-secondary);"></i>
                            </div>
                            <div>
                                <div style="font-weight: 500; font-size: 0.85rem; color: var(--text-primary);">${label}</div>
                                <div style="font-size: 0.72rem; color: var(--text-muted);">${formattedDate} ${tx.note ? `• ${tx.note}` : ''}</div>
                            </div>
                        </div>
                        <div class="privacy-blur" style="font-family: var(--font-numeric); font-weight: 600; font-size: 0.95rem; color: ${colorCls === 'text-emerald' ? 'var(--emerald)' : colorCls === 'text-rose' ? 'var(--rose)' : 'var(--text-secondary)'};">
                            ${this.formatMoney(tx.amount || tx.sourceAmount, w.currency, { prefix: sign })}
                        </div>
                    </div>
                `;
            });
        }

        txHtml += `</div>`;
        secondaryPanel.innerHTML = txHtml;

        overlay.style.display = 'flex';
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        lucide.createIcons();
    }

    closeFocusOverlay() {
        const overlay = document.getElementById('focus-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.style.display = 'none';
        }
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

        document.getElementById('edit-wallet-id').value = w.id;
        document.getElementById('edit-wallet-name').value = w.id;
        document.getElementById('edit-wallet-type').value = w.type || 'bank';
        document.getElementById('edit-wallet-balance').value = w.balance || 0;

        const theme = this.getThemeForWallet(w);
        document.getElementById('edit-wallet-theme-val').value = theme.id;
        this.populateThemePicker('edit-wallet-theme-picker', theme.id);

        document.getElementById('edit-wallet-modal').classList.add('active');
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
        this.closeModal('edit-wallet-modal');

        const overlay = document.getElementById('focus-overlay');
        if (overlay && overlay.style.display !== 'none') {
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
        let icon = 'arrow-up-right';
        let colorCls = 'debit';
        let title = tx.note || tx.categoryId || 'Expense';
        let amt = '';

        if (tx.type === 'income') {
            icon = 'arrow-down-left';
            colorCls = 'credit';
            title = tx.note || 'Income';
            amt = this.formatMoney(tx.amount, tx.currency, { prefix: '+' });
        } else if (tx.type === 'transfer') {
            icon = 'repeat';
            colorCls = 'text-muted';
            title = `Transfer: ${tx.sourceId} \u2192 ${tx.destId}`;
            amt = this.formatMoney(tx.amount, tx.currency);
        } else if (tx.type === 'remittance') {
            icon = 'globe';
            colorCls = 'text-muted';
            title = tx.note || 'Remittance';
            amt = this.isPrivacyHidden ? '******' : `\u00a5${tx.sourceAmount.toLocaleString()} \u2192 \u20b9${tx.destAmount.toLocaleString()}`;
        } else {
            // expense
            const regionKey = tx.region || (storage.state.categories.JP.some(c => c.id === tx.categoryId) ? 'JP' : 'IN');
            const regionCats = storage.state.categories[regionKey];
            if (regionCats) {
                const cat = regionCats.find(c => c.id === tx.categoryId);
                if (cat) title = cat.name;
            }
            const currency = tx.currency || (tx.region === 'JP' ? '\u00a5' : '\u20b9');
            amt = this.formatMoney(tx.amount, currency, { prefix: '-' });
        }

        const date = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

        let metaString = tx.walletId || tx.sourceId || 'Wallet';
        if (showDateInMeta) {
            metaString = `${date} \u2022 ${metaString}`;
        }
        if (tx.note && tx.type !== 'income' && tx.type !== 'transfer' && tx.type !== 'remittance') {
            metaString += ` \u2022 ${tx.note}`;
        }

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
                        <h4 style="color:var(--text-muted); font-size:0.85rem; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">
                            ${region === 'JP' ? '🇯🇵 Japan' : '🇮🇳 India'} Analytics
                        </h4>

                        <div style="height: 180px; margin-bottom: 16px; position: relative;">
                            <canvas id="history-donut-${index}-${region}"></canvas>
                        </div>

                        ${overallHtml}

                        ${catCardsHtml ? `
                            <h5 style="color:var(--text-muted); font-size:0.72rem; margin: 12px 0 10px; text-transform:uppercase; letter-spacing:0.5px;">By Category</h5>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px;">
                                ${catCardsHtml}
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            // Build grouped transactions list for this history snapshot
            let txsHtml = '<div style="margin-top: 24px;"><h4 style="color:var(--text-muted); font-size:0.85rem; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Transactions</h4>';

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
                        <div class="loan-value">${this.formatMoney(loanState.config.totalPrincipal, '₹', { locale: 'en-IN' })}</div>
                        <div class="loan-label">Total Loan</div>
                    </div>
                    <div style="width: 50%; text-align: right;">
                        <div class="loan-value">${this.formatMoney(loanState.config.emi, '₹', { locale: 'en-IN' })}</div>
                        <div class="loan-label">EMI</div>
                    </div>
                    <div style="width: 100%; text-align: center; font-size: 0.7rem; color: var(--text-muted); margin-top: 12px;">
                        Next draw in <span style="color: var(--text-main); font-weight: 600;">${loanState.daysUntilNextEmi} Days</span> (${loanState.nextEmiDateStr})
                    </div>
                </div>
                
                <div class="loan-progress-box">
                    <div class="loan-progress-header">
                        <span class="loan-percent">${loanState.percentPaid}%</span>
                        <div style="display:flex; flex-direction:column; line-height:1.2; text-align:left;">
                            <span class="loan-label" style="font-size:0.75rem;">Paid</span>
                            <span class="loan-label" style="font-size:0.75rem;">Till Date</span>
                        </div>
                        <span class="loan-status">ON TRACK</span>
                    </div>
                    <div class="loan-progress-bar-bg">
                        <div class="loan-progress-bar" style="width: ${loanState.percentPaid}%;"></div>
                    </div>
                    
                    <div class="loan-stats-grid">
                        <span class="loan-stat-label">Amount Paid</span>
                        <span class="loan-stat-value">${this.formatMoney(loanState.amountPaid, '₹', { locale: 'en-IN' })}</span>
                        
                        <span class="loan-stat-label">Principal Paid</span>
                        <span class="loan-stat-value">${this.formatMoney(loanState.principalPaid, '₹', { locale: 'en-IN', formatOptions: { minimumFractionDigits: 2, maximumFractionDigits: 2 } })}</span>
                        
                        <span class="loan-stat-label">Principal Left</span>
                        <span class="loan-stat-value">${this.formatMoney(loanState.principalLeft, '₹', { locale: 'en-IN', formatOptions: { minimumFractionDigits: 2, maximumFractionDigits: 2 } })}</span>
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
                        <h4 style="color:var(--text-muted); font-size:0.85rem; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">
                            ${region === 'JP' ? '🇯🇵 Japan' : '🇮🇳 India'} Analytics
                        </h4>

                        <div style="height: 180px; margin-bottom: 16px; position: relative;">
                            <canvas id="${canvasId}"></canvas>
                        </div>

                        ${overallHtml}

                        ${catCardsHtml ? `
                            <h5 style="color:var(--text-muted); font-size:0.72rem; margin: 12px 0 10px; text-transform:uppercase; letter-spacing:0.5px;">By Category</h5>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px;">
                                ${catCardsHtml}
                            </div>
                        ` : ''}
                    </div>
                `;

                chartDataToRender.push({ id: canvasId, region: region, totals: totals[region] });
            });

            let txsHtml = '<div style="margin-top: 24px; break-inside: avoid;"><h4 style="color:var(--text-muted); font-size:0.85rem; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Transactions</h4>';

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
        if (!catId) return 'Uncategorized';
        if (storage.state?.categories) {
            if (region && storage.state.categories[region]) {
                const found = storage.state.categories[region].find(c => c.id === catId);
                if (found?.name) return found.name;
            }
            for (const reg of ['JP', 'IN']) {
                const found = storage.state.categories[reg]?.find(c => c.id === catId);
                if (found?.name) return found.name;
            }
        }
        return catId;
    }

    // Helper: Wallet Name resolution
    getWalletName(walletId) {
        if (!walletId || !storage.state?.wallets) return walletId || 'Wallet';
        return storage.state.wallets[walletId]?.name || walletId;
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
                    catOptions += '<optgroup label="🇯🇵 Japan Categories">';
                    storage.state.categories.JP.forEach(c => {
                        catOptions += `<option value="${c.id}">${c.name}</option>`;
                    });
                    catOptions += '</optgroup>';
                }
                if (storage.state.categories.IN && storage.state.categories.IN.length > 0) {
                    catOptions += '<optgroup label="🇮🇳 India Categories">';
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
                    const flag = w.region === 'JP' ? '🇯🇵' : '🇮🇳';
                    walletOptions += `<option value="${w.id}">${flag} ${w.name || w.id}</option>`;
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
                    <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700;">No Transactions Found</h3>
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
                if (t.currency) dayCurrency = t.currency;
            });

            html += `
                <div class="ledger-date-group">
                    <div class="ledger-date-header">
                        <div class="ledger-date-title">
                            <span>${dateHeaderLabel}</span>
                            <span class="day-pill">${groupTxs.length} ${groupTxs.length === 1 ? 'tx' : 'txs'}</span>
                        </div>
                        <div class="ledger-date-subtotal privacy-blur">
                            ${dayNet !== 0 ? (dayNet > 0 ? `+${this.formatMoney(dayNet, dayCurrency)}` : `-${this.formatMoney(Math.abs(dayNet), dayCurrency)}`) : ''}
                        </div>
                    </div>
            `;

            groupTxs.forEach(tx => {
                let icon = 'arrow-up-right';
                let typeCls = 'expense';
                let sign = '-';
                let title = tx.note || this.getCategoryName(tx.categoryId, tx.region);
                let categoryName = this.getCategoryName(tx.categoryId, tx.region);
                const flag = tx.region === 'JP' ? '🇯🇵' : (tx.region === 'IN' ? '🇮🇳' : '');

                if (tx.type === 'income') {
                    icon = 'arrow-down-left';
                    typeCls = 'income';
                    sign = '+';
                    title = tx.note || 'Income Deposit';
                } else if (tx.type === 'transfer') {
                    icon = 'repeat';
                    typeCls = 'transfer';
                    sign = '';
                    title = `${this.getWalletName(tx.sourceId)} → ${this.getWalletName(tx.destId)}`;
                } else if (tx.type === 'remittance') {
                    icon = 'globe';
                    typeCls = 'remittance';
                    sign = '';
                    title = `${this.getWalletName(tx.sourceId)} (¥) → ${this.getWalletName(tx.destId)} (₹)`;
                }

                // Amount string
                let amountHtml = '';
                if (tx.type === 'remittance') {
                    if (this.isPrivacyHidden) {
                        amountHtml = '******';
                    } else {
                        amountHtml = `¥${Number(tx.sourceAmount || 0).toLocaleString()} → ₹${Number(tx.destAmount || 0).toLocaleString()}`;
                    }
                } else {
                    amountHtml = this.formatMoney(tx.amount, tx.currency, { prefix: sign });
                }

                // Subtitle metadata pills
                let metaPillsHtml = '';
                if (tx.type === 'expense') {
                    metaPillsHtml += `<span class="tx-pill category-pill">${categoryName}</span>`;
                    metaPillsHtml += `<span class="tx-pill">${this.getWalletName(tx.walletId)}</span>`;
                    if (tx.note && tx.note !== title) {
                        metaPillsHtml += `<span class="tx-pill note-pill">${tx.note}</span>`;
                    }
                } else if (tx.type === 'income') {
                    metaPillsHtml += `<span class="tx-pill">${this.getWalletName(tx.walletId)}</span>`;
                    if (tx.note && tx.note !== title) {
                        metaPillsHtml += `<span class="tx-pill note-pill">${tx.note}</span>`;
                    }
                } else if (tx.type === 'transfer') {
                    metaPillsHtml += `<span class="tx-pill">Internal Transfer</span>`;
                    if (tx.note) metaPillsHtml += `<span class="tx-pill note-pill">${tx.note}</span>`;
                } else if (tx.type === 'remittance') {
                    metaPillsHtml += `<span class="tx-pill">Remittance</span>`;
                    if (tx.exchangeRate) metaPillsHtml += `<span class="tx-rate-tag">Rate: ${tx.exchangeRate}</span>`;
                    if (tx.note) metaPillsHtml += `<span class="tx-pill note-pill">${tx.note}</span>`;
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
                                <div class="tx-meta-pills">
                                    ${metaPillsHtml}
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
                    <span>Country: ${this.ledgerFilters.region === 'JP' ? '🇯🇵 Japan' : '🇮🇳 India'}</span>
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
                amountVal.innerText = this.formatMoney(tx.amount, tx.currency, { prefix: sign });
            }
        }

        if (subtitle) {
            if (tx.type === 'expense') {
                subtitle.innerText = this.getCategoryName(tx.categoryId, tx.region);
            } else if (tx.type === 'income') {
                subtitle.innerText = 'Income Deposit';
            } else if (tx.type === 'transfer') {
                subtitle.innerText = 'Internal Wallet Transfer';
            } else if (tx.type === 'remittance') {
                subtitle.innerText = 'Cross-Border Remittance (Japan → India)';
            }
        }

        if (walletVal) {
            walletVal.innerText = this.getWalletName(tx.walletId || tx.sourceId);
        }

        if (tx.type === 'expense') {
            if (categoryWrap) categoryWrap.style.display = 'flex';
            if (categoryVal) categoryVal.innerText = this.getCategoryName(tx.categoryId, tx.region);
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
        if (window.lucide && typeof window.lucide.createIcons === 'function') lucide.createIcons();
    }

    closeTransactionDetail() {
        const modal = document.getElementById('transaction-detail-modal');
        if (modal) modal.classList.remove('active');
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
                `"${this.getCategoryName(t.categoryId, t.region)}"`,
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
                                <p class="insight-desc">Largest single transaction was <span class="privacy-blur">${this.formatMoney(maxTx.amount, '¥')}</span> on ${maxTx.date} (${maxTx.note || this.getCategoryName(maxTx.categoryId, 'JP')}).</p>
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
                                        <span class="ledger-tx-title">${tx.note || this.getCategoryName(tx.categoryId, 'IN')}</span>
                                    </div>
                                    <div class="tx-meta-pills">
                                        <span class="tx-pill">${tx.date}</span>
                                        <span class="tx-pill">${this.getWalletName(tx.walletId)}</span>
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
}
const app = new App();
window.app = app;

