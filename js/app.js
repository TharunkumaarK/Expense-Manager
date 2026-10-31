const WALLET_COLORS = [
    '#10b981', '#ef4444', '#d4af37', '#bf5af2', '#f97316',
    '#3b82f6', '#06b6d4', '#ec4899', '#94a3b8', '#8b5cf6',
    '#14b8a6', '#f59e0b'
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
    }

    init() {
        storage.checkRollover();
        this.setupNavigation();
        this.setupInactivityMonitoring();
        this.updatePrivacyUI();
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
        } else if (this.currentView === 'analytics-view') {
            if (typeof charts !== 'undefined' && typeof charts.updatePrivacy === 'function') {
                charts.updatePrivacy();
            }
        } else if (this.currentView === 'history-view') {
            this.renderHistory();
        } else if (this.currentView === 'settings-view') {
            this.renderSettings();
        }

    }

    updatePrivacyUI() {
        const btns = document.querySelectorAll('.global-privacy-btn');
        btns.forEach(btn => {
            if (this.isPrivacyHidden) {
                btn.innerHTML = '<i data-lucide="eye-off"></i>';
                btn.setAttribute('aria-label', 'Reveal monetary values');
                btn.setAttribute('title', 'Reveal monetary values');
                btn.classList.remove('revealed');
            } else {
                btn.innerHTML = '<i data-lucide="eye"></i>';
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
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.currentTarget.getAttribute('data-target');
                this.switchView(target);

                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });
    }

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        this.currentView = viewId;

        if (viewId === 'analytics-view') {
            charts.renderCharts();
        } else if (viewId === 'history-view') {
            this.renderHistory();
        } else if (viewId === 'home-view') {
            this.renderAll();
        } else if (viewId === 'settings-view') {
            this.renderSettings();
            lucide.createIcons();
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
        if (this.currentView === 'history-view') {
            this.renderHistory();
        } else if (this.currentView === 'analytics-view' && typeof charts !== 'undefined') {
            charts.renderCharts();
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
            if (this.currentView === 'history-view') {
                this.renderHistory();
            } else if (this.currentView === 'analytics-view' && typeof charts !== 'undefined') {
                charts.renderCharts();
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
        let jpHtml = '', inHtml = '';

        Object.values(storage.state.wallets).forEach(w => {
            const ws = this.getWalletStyle(w.color);
            const icon = w.type === 'bank' ? 'landmark' : w.type === 'card' ? 'credit-card' : w.type === 'cash' ? 'banknote' : 'smartphone';
            const html = `
                <div class="wallet-item" onclick="app.openQuickEditModal('wallet', '${w.id}')" style="cursor:pointer; ${ws.card}">
                    <div class="wallet-name" style="color:${ws.text};">
                        <i data-lucide="${icon}"></i>
                        ${w.id}
                    </div>
                    <div class="wallet-balance" style="color:${ws.text};">${this.formatMoney(w.balance, w.currency)}</div>
                </div>
            `;
            if (w.region === 'JP') {
                jpHtml += html;
                jpTotal += w.balance;
            } else {
                inHtml += html;
                inTotal += w.balance;
            }
        });

        document.getElementById('jp-wallets').innerHTML = jpHtml;
        document.getElementById('in-wallets').innerHTML = inHtml;
        document.getElementById('jp-total-balance').innerText = this.formatMoney(jpTotal, '¥');
        document.getElementById('in-total-balance').innerText = this.formatMoney(inTotal, '₹');

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
        const pct = Math.min((jpTotalSpent / storage.state.jpTotalBudget) * 100, 100);

        // Cushion = overall budget minus sum of individual category budgets
        const sumCatBudgets = storage.state.categories.JP.reduce((s, c) => s + (c.budget || 0), 0);
        const cushion = Math.max(0, storage.state.jpTotalBudget - sumCatBudgets);

        const card = document.getElementById('budget-overview-card');
        if (card) {
            card.innerHTML = `
                <div class="card" style="margin: 0 16px;">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:baseline;">
                            <span class="text-sm text-muted">Japan Budget</span>
                            <span class="font-bold">${this.formatMoney(jpRem, '¥')} left</span>
                        </div>
                        <div class="neon-bar-bg">
                            <div class="neon-bar-fill ${pct > 90 ? 'neon-danger' : pct > 75 ? 'neon-warn' : 'neon-safe'}" style="width: ${pct}%"></div>
                        </div>
                        <div style="margin-top: 6px; display:flex; justify-content:space-between; align-items:center;">
                            <span class="text-muted text-sm">Spent ${this.formatMoney(jpTotalSpent, '¥')} of ${this.formatMoney(storage.state.jpTotalBudget, '¥')}</span>
                            ${cushion > 0 ? `<span style="font-size:0.72rem; background:rgba(16,185,129,0.12); color:#10b981; padding:2px 8px; border-radius:10px; font-weight:600;">+${this.formatMoney(cushion, '¥')} cushion</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
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
                            <span>${this.formatMoney(spent, currency)}</span>
                            <span>${this.formatMoney(activeBudget, currency)}</span>
                        </div>
                    `;
                } else {
                    progressHtml = `<div class="neon-amount-sub" style="margin-top: 4px;">Spent: ${this.formatMoney(spent, currency)}</div>`;
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
        const txs = activeTxs.slice(0, 5); // Last 5 for home
        const container = document.getElementById('recent-transactions-list');

        if (txs.length === 0) {
            container.innerHTML = '<p class="text-muted text-center" style="padding: 20px;">No transactions yet.</p>';
            return;
        }

        let html = '';
        txs.forEach(tx => {
            let icon = 'arrow-up-right';
            let colorCls = 'debit';
            let title = tx.note || tx.categoryId || 'Expense';
            let amt = this.formatMoney(tx.amount, tx.currency, { prefix: '-' });

            if (tx.type === 'income') {
                icon = 'arrow-down-left';
                colorCls = 'credit';
                title = tx.note || 'Income';
                amt = this.formatMoney(tx.amount, tx.currency, { prefix: '+' });
            } else if (tx.type === 'transfer') {
                icon = 'repeat';
                colorCls = 'text-muted';
                title = `Transfer: ${tx.sourceId} → ${tx.destId}`;
                amt = this.formatMoney(tx.amount, tx.currency);
            } else if (tx.type === 'remittance') {
                icon = 'globe';
                colorCls = 'text-muted';
                title = `Remittance: JP → IN`;
                amt = this.isPrivacyHidden ? '******' : `¥${tx.sourceAmount.toLocaleString()} → ₹${tx.destAmount.toLocaleString()}`;
            } else {
                const regionCats = storage.state.categories[tx.region];
                const cat = regionCats.find(c => c.id === tx.categoryId);
                if (cat) {
                    title = cat.name;
                }
            }

            const date = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

            // For Income, title is currently set to tx.note if it exists. 
            // For other types, we'll just append it to the meta line if it exists.
            let metaString = `${date} • ${tx.walletId || 'Wallet'}`;
            if (tx.note && tx.type !== 'income') {
                metaString += ` • ${tx.note}`;
            } else if (tx.type === 'transfer' || tx.type === 'remittance') {
                metaString = `${date} • ${tx.note ? tx.note : 'Transfer'}`;
            }

            html += `
                <div class="tx-item" onclick="app.editTransaction('${tx.id}')" style="cursor: pointer;">
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
        });

        container.innerHTML = html;
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
}
const app = new App();
