class App {
    constructor() {
        this.currentView = 'home-view';
        this.init();
    }

    init() {
        this.setupNavigation();
        this.renderAll();

        // Month display
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const d = new Date();
        document.getElementById('current-month-display').innerText = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
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

    openTransactionModal(type) {
        this.toggleFabMenu(); // Close FAB menu

        const modal = document.getElementById('transaction-modal');
        const title = document.getElementById('modal-title');
        const content = document.getElementById('modal-content');

        let html = '';

        if (type === 'expense') {
            title.innerText = 'Log Expense';
            html = `
                <div class="form-group">
                    <label>Wallet</label>
                    <select id="tx-wallet" onchange="app.updateExpenseCategories()">
                        <optgroup label="🇯🇵 Japan">
                            <option value="Salary Account">Salary Account (¥)</option>
                            <option value="Forex Card">Forex Card (¥)</option>
                            <option value="Cash">Cash (¥)</option>
                            <option value="PayPay">PayPay (¥)</option>
                        </optgroup>
                        <optgroup label="🇮🇳 India">
                            <option value="Axis Bank">Axis Bank (₹)</option>
                            <option value="Bank of Baroda">Bank of Baroda (₹)</option>
                            <option value="Credit Card">Credit Card (₹)</option>
                        </optgroup>
                    </select>
                </div>
                <div class="form-group">
                    <label>Category</label>
                    <select id="tx-category"></select>
                </div>
                <div class="form-group">
                    <label>Amount</label>
                    <input type="number" id="tx-amount" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Note (Optional)</label>
                    <input type="text" id="tx-note" placeholder="What was this for?">
                </div>
                <button class="btn btn-primary" onclick="app.submitExpense()">Save Expense</button>
            `;
        } else if (type === 'transfer') {
            title.innerText = 'Transfer Between Wallets';
            html = `
                <div class="form-group">
                    <label>From (Source)</label>
                    <select id="tx-source">
                        <option value="Salary Account">Salary Account (¥)</option>
                        <option value="Forex Card">Forex Card (¥)</option>
                        <option value="Cash">Cash (¥)</option>
                        <option value="PayPay">PayPay (¥)</option>
                        <option value="Axis Bank">Axis Bank (₹)</option>
                        <option value="Bank of Baroda">Bank of Baroda (₹)</option>
                        <option value="Credit Card">Credit Card (₹)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>To (Destination)</label>
                    <select id="tx-dest">
                        <option value="Cash">Cash (¥)</option>
                        <option value="PayPay">PayPay (¥)</option>
                        <option value="Salary Account">Salary Account (¥)</option>
                        <option value="Forex Card">Forex Card (¥)</option>
                        <option value="Axis Bank">Axis Bank (₹)</option>
                        <option value="Bank of Baroda">Bank of Baroda (₹)</option>
                        <option value="Credit Card">Credit Card (₹)</option>
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
                <button class="btn btn-blue" onclick="app.submitTransfer()">Complete Transfer</button>
            `;
        } else if (type === 'remittance') {
            title.innerText = 'Remittance (Send to India)';
            html = `
                <div class="form-group">
                    <label>From (Source JPY)</label>
                    <select id="tx-source">
                        <option value="Salary Account">Salary Account (¥)</option>
                        <option value="Cash">Cash (¥)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Amount Sent (¥)</label>
                    <input type="number" id="tx-amount-jpy" placeholder="e.g. 50000">
                </div>
                <div class="form-group">
                    <label>To (Destination INR)</label>
                    <select id="tx-dest">
                        <option value="Axis Bank">Axis Bank (₹)</option>
                        <option value="Bank of Baroda">Bank of Baroda (₹)</option>
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
                <button class="btn btn-purple" onclick="app.submitRemittance()">Log Remittance</button>
            `;
        } else if (type === 'income') {
            title.innerText = 'Add Income / Credit';
            html = `
                <div class="form-group">
                    <label>Credit To</label>
                    <select id="tx-wallet">
                        <optgroup label="🇯🇵 Japan">
                            <option value="Salary Account">Salary Account (¥)</option>
                            <option value="Cash">Cash (¥)</option>
                            <option value="PayPay">PayPay (¥)</option>
                        </optgroup>
                        <optgroup label="🇮🇳 India">
                            <option value="Axis Bank">Axis Bank (₹)</option>
                            <option value="Bank of Baroda">Bank of Baroda (₹)</option>
                        </optgroup>
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
                <button class="btn btn-green" onclick="app.submitIncome()">Add Income</button>
            `;
        }

        content.innerHTML = html;
        modal.classList.add('active');

        if (type === 'expense') {
            this.updateExpenseCategories();
        }
    }

    closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    updateExpenseCategories() {
        const walletSelect = document.getElementById('tx-wallet');
        if (!walletSelect) return;

        const region = storage.state.wallets[walletSelect.value].region;
        const catSelect = document.getElementById('tx-category');

        catSelect.innerHTML = storage.state.categories[region].map(c =>
            `<option value="${c.id}">${c.name}</option>`
        ).join('');
    }

    submitExpense() {
        const wallet = document.getElementById('tx-wallet').value;
        const cat = document.getElementById('tx-category').value;
        const amt = document.getElementById('tx-amount').value;
        const note = document.getElementById('tx-note').value;

        if (!amt || Number(amt) <= 0) return alert('Enter valid amount');

        walletManager.addExpense(wallet, cat, amt, note);
        this.closeModal('transaction-modal');
        this.renderAll();
    }

    submitTransfer() {
        const src = document.getElementById('tx-source').value;
        const dest = document.getElementById('tx-dest').value;
        const amt = document.getElementById('tx-amount').value;
        const note = document.getElementById('tx-note').value;

        if (!amt || Number(amt) <= 0) return alert('Enter valid amount');
        if (src === dest) return alert('Source and destination must be different');

        if (storage.state.wallets[src].currency !== storage.state.wallets[dest].currency) {
            return alert('Cross-currency transfers must use the Remittance tool');
        }

        walletManager.transfer(src, dest, amt, note);
        this.closeModal('transaction-modal');
        this.renderAll();
    }

    submitRemittance() {
        const src = document.getElementById('tx-source').value;
        const dest = document.getElementById('tx-dest').value;
        const amtJpy = document.getElementById('tx-amount-jpy').value;
        const amtInr = document.getElementById('tx-amount-inr').value;
        const note = document.getElementById('tx-note').value;

        if (!amtJpy || !amtInr || Number(amtJpy) <= 0 || Number(amtInr) <= 0) return alert('Enter valid amounts');

        walletManager.remittance(src, dest, amtJpy, amtInr, note);
        this.closeModal('transaction-modal');
        this.renderAll();
    }

    submitIncome() {
        const wallet = document.getElementById('tx-wallet').value;
        const amt = document.getElementById('tx-amount').value;
        const note = document.getElementById('tx-note').value;

        if (!amt || Number(amt) <= 0) return alert('Enter valid amount');

        walletManager.addIncome(wallet, amt, note);
        this.closeModal('transaction-modal');
        this.renderAll();
    }

    renderAll() {
        this.renderWallets();
        this.renderCategories();
        this.renderTransactions();

        this.renderSettings();
        lucide.createIcons();
    }

    renderSettings() {
        if (this.currentView === 'settings-view') {
            document.getElementById('setting-jp-budget').value = storage.state.jpTotalBudget;

            // Render wallet balances
            let walletHtml = '';
            Object.values(storage.state.wallets).forEach(w => {
                const icon = w.type === 'bank' ? 'landmark' : w.type === 'card' ? 'credit-card' : w.type === 'cash' ? 'banknote' : 'smartphone';
                walletHtml += `
                    <div class="setting-row">
                        <span><i data-lucide="${icon}"></i> ${w.id} (${w.currency})</span>
                        <input type="number" value="${w.balance}" onblur="app.updateWalletBalance('${w.id}', this.value)">
                    </div>
                `;
            });
            document.getElementById('settings-wallets-list').innerHTML = walletHtml;

            // Render category budgets
            let catHtml = '';
            storage.state.categories.JP.forEach(c => {
                catHtml += `
                    <div class="setting-row">
                        <span><i data-lucide="${c.icon}"></i> ${c.name}</span>
                        <input type="number" value="${c.budget || 0}" onblur="app.updateCategoryBudget('${c.id}', this.value)">
                    </div>
                `;
            });
            document.getElementById('settings-categories-list').innerHTML = catHtml;
        }
    }

    updateWalletBalance(id, val) {
        if (storage.state.wallets[id]) {
            storage.state.wallets[id].balance = Number(val);
            storage.saveData();
            this.renderAll(); // Re-render balances on home
        }
    }

    updateCategoryBudget(id, val) {
        const cat = storage.state.categories.JP.find(c => c.id === id);
        if (cat) {
            cat.budget = Number(val);
            storage.saveData();
            this.renderAll(); // Re-render to update the progress bars on home if they switch back
        }
    }

    renderWallets() {
        let jpTotal = 0, inTotal = 0;
        let jpHtml = '', inHtml = '';

        Object.values(storage.state.wallets).forEach(w => {
            const html = `
                <div class="wallet-item">
                    <div class="wallet-name">
                        <i data-lucide="${w.type === 'bank' ? 'landmark' : w.type === 'card' ? 'credit-card' : w.type === 'cash' ? 'banknote' : 'smartphone'}"></i>
                        ${w.id}
                    </div>
                    <div class="wallet-balance">${w.currency}${w.balance.toLocaleString()}</div>
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
        document.getElementById('jp-total-balance').innerText = `¥${jpTotal.toLocaleString()}`;
        document.getElementById('in-total-balance').innerText = `₹${inTotal.toLocaleString()}`;

        // Render JP Budget Overview
        const jpSpent = walletManager.getTotalSpent('JP');
        const jpRem = storage.state.jpTotalBudget - jpSpent;
        const pct = Math.min((jpSpent / storage.state.jpTotalBudget) * 100, 100) || 0;

        document.getElementById('budget-overview-card').innerHTML = `
            <div class="card" style="margin: 0 16px;">
                <div class="region-header" style="margin-bottom: 4px;">
                    <span class="text-muted text-sm">Japan Monthly Budget</span>
                    <span class="font-bold">¥${jpRem.toLocaleString()} left</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-fill ${pct > 90 ? 'danger' : pct > 75 ? 'warning' : ''}" style="width: ${pct}%"></div>
                </div>
                <div class="text-muted text-sm" style="margin-top: 6px; text-align: right;">
                    Spent ¥${jpSpent.toLocaleString()} of ¥${storage.state.jpTotalBudget.toLocaleString()}
                </div>
            </div>
        `;
    }

    renderCategories() {
        const renderGrid = (region, elementId, showProgress) => {
            const totals = walletManager.getCategoryTotals(region);
            let html = '';

            storage.state.categories[region].forEach(c => {
                const spent = totals[c.id] || 0;
                let progressHtml = '';

                if (showProgress && c.budget > 0) {
                    const pct = Math.min((spent / c.budget) * 100, 100);
                    progressHtml = `
                        <div class="progress-bg">
                            <div class="progress-fill ${pct > 90 ? 'danger' : pct > 75 ? 'warning' : ''}" style="width: ${pct}%"></div>
                        </div>
                        <div class="cat-meta">¥${spent.toLocaleString()} / ¥${c.budget.toLocaleString()}</div>
                    `;
                } else {
                    progressHtml = `<div class="cat-meta">${storage.state.wallets[region === 'JP' ? 'Cash' : 'Axis Bank'].currency}${spent.toLocaleString()}</div>`;
                }

                html += `
                    <div class="category-card">
                        <div class="cat-header">
                            <span class="cat-icon-name"><i data-lucide="${c.icon}"></i> ${c.name}</span>
                        </div>
                        ${progressHtml}
                    </div>
                `;
            });
            document.getElementById(elementId).innerHTML = html;
        };

        renderGrid('JP', 'jp-categories-grid', true);
        renderGrid('IN', 'in-categories-grid', false);
    }

    renderTransactions() {
        const txs = walletManager.getTransactions().slice(0, 5); // Last 5 for home
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
            let amt = `-${tx.currency}${tx.amount.toLocaleString()}`;

            if (tx.type === 'income') {
                icon = 'arrow-down-left';
                colorCls = 'credit';
                title = tx.note || 'Income';
                amt = `+${tx.currency}${tx.amount.toLocaleString()}`;
            } else if (tx.type === 'transfer') {
                icon = 'repeat';
                colorCls = 'text-muted';
                title = `Transfer: ${tx.sourceId} → ${tx.destId}`;
                amt = `${tx.currency}${tx.amount.toLocaleString()}`;
            } else if (tx.type === 'remittance') {
                icon = 'globe';
                colorCls = 'text-muted';
                title = `Remittance: JP → IN`;
                amt = `¥${tx.sourceAmount.toLocaleString()} → ₹${tx.destAmount.toLocaleString()}`;
            } else {
                // Find category name
                const regionCats = storage.state.categories[tx.region];
                const cat = regionCats.find(c => c.id === tx.categoryId);
                if (cat) title = cat.name;
            }

            const date = new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

            html += `
                <div class="tx-item">
                    <div class="tx-left">
                        <div class="tx-icon"><i data-lucide="${icon}"></i></div>
                        <div class="tx-details">
                            <span class="tx-title">${title}</span>
                            <span class="tx-meta">${date} • ${tx.walletId || 'Wallet'}</span>
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

    renderHistory() {
        const container = document.getElementById('history-list');
        if (storage.state.history.length === 0) {
            container.innerHTML = '<div class="card"><p class="text-muted text-center">No archived months yet.</p></div>';
            return;
        }

        let html = '';
        storage.state.history.forEach(h => {
            html += `
                <div class="card">
                    <h3>${h.label}</h3>
                    <p class="text-muted text-sm mt-2">${h.transactions.length} transactions recorded</p>
                </div>
            `;
        });
        container.innerHTML = html;
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
}

const app = new App();
