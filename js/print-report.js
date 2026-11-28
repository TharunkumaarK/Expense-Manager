/* Read-only document model and shared HTML for the browser's PDF exports. */
class FinancialPrintReport {
    constructor(app, state) {
        this.app = app;
        this.state = state;
        this.countries = CountryConfig.getAll();
    }

    static validMonth(month) {
        return typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
    }

    months() {
        const months = [
            this.state.currentMonthKey,
            ...Object.keys(this.state.closedMonths || {}),
            ...(this.state.history || []).map(entry => entry.monthKey),
            ...(this.state.transactions || []).filter(tx => Number.isFinite(getTransactionUtcDay(tx.date)))
                .map(tx => tx.date.slice(0, 7))
        ];
        return [...new Set(months.filter(FinancialPrintReport.validMonth))].sort();
    }

    monthLabel(key) {
        return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
            .format(new Date(`${key}-01T00:00:00Z`));
    }

    transactionRegion(tx, snapshot) {
        if (tx.region) return String(tx.region).toUpperCase();
        const wallets = snapshot ? snapshot.walletsSnapshot : this.state.wallets;
        const wallet = wallets?.[tx.walletId || tx.sourceId];
        if (wallet?.region) return String(wallet.region).toUpperCase();

        const currency = this.currency(tx.currency || tx.sourceCurrency);
        const country = this.countries.find(entry => entry.currency === currency);
        if (country) return country.code;

        const id = tx.categoryId || tx.category;
        const definitions = snapshot ? snapshot.categoriesSnapshot : this.state.categories;
        const matches = this.countries.filter(entry => definitions?.[entry.code]?.some(category => category.id === id));
        return matches.length === 1 ? matches[0].code : '';
    }

    currency(value, fallback = '') {
        if (typeof value !== 'string') return fallback;
        const normalized = value.trim().toUpperCase();
        return this.countries.find(country => country.currencyCode === normalized)?.currency ||
            (/^(?:[A-Z]{3}|\p{Sc})$/u.test(normalized) ? normalized : fallback);
    }

    transactionCurrency(tx, region, snapshot) {
        const wallets = snapshot ? snapshot.walletsSnapshot : this.state.wallets;
        return this.currency(tx.currency || tx.sourceCurrency || wallets?.[tx.walletId || tx.sourceId]?.currency,
            CountryConfig.get(region)?.currency);
    }

    money(value, currency, prefix = '') {
        const country = this.countries.find(entry => entry.currency === currency);
        return this.app.escapeHtml(this.app.formatMoney(value, currency, {
            ignorePrivacy: true, locale: country?.locale, prefix
        }));
    }

    monthlySection(key, selectedRegion = null) {
        const archived = this.state.closedMonths?.[key] || this.state.history?.find(month => month.monthKey === key);
        const current = key === this.state.currentMonthKey && !archived;
        const transactions = walletManager.getTransactions({ monthKey: key });
        const stored = Object.getOwnPropertyDescriptor(archived || {}, 'transactions')?.value;
        // Keep identifiable legacy transactions even when their day cannot be validated.
        const malformed = (this.state.transactions || []).filter(tx =>
            typeof tx.date === 'string' && tx.date.startsWith(`${key}-`) && !Number.isFinite(getTransactionUtcDay(tx.date)));
        const ids = new Set(transactions.map(tx => tx.id));
        for (const tx of [...(Array.isArray(stored) ? stored : []), ...malformed]) {
            if (!Number.isFinite(getTransactionUtcDay(tx.date)) && !ids.has(tx.id)) {
                transactions.push(tx);
                ids.add(tx.id);
            }
        }
        const tagged = transactions.map(tx => ({ tx, region: this.transactionRegion(tx, archived), snapshot: archived }));
        const scoped = selectedRegion ? tagged.filter(record => record.region === selectedRegion) : tagged;

        // Recovery copies a live wallet object into historical records. That copy is not a period balance.
        const captured = archived && !/^Budget Recovery\b/i.test(archived.reason || '') && archived.walletsSnapshot;
        const wallets = current ? this.state.wallets : captured || null;
        const regions = selectedRegion ? [selectedRegion] : this.countries
            .filter(country => (current && storage.getActiveCountries().includes(country.code)) ||
                scoped.some(record => record.region === country.code) ||
                Object.values(wallets || {}).some(wallet => wallet?.region === country.code) ||
                this.monthlyBudget(country.code, archived, current) > 0)
            .map(country => country.code);

        const balances = regions.map(code => this.balance(code, wallets, current));
        const reports = this.regionalReports(regions, scoped, archived, current);
        const status = archived?.status === 'closed' ? 'Closed month' : current ? 'Current month' : 'Historical month';
        const metadata = selectedRegion && this.state.reportSnapshots?.[`${selectedRegion}_${key}`];
        return {
            label: this.monthLabel(key), period: key, status, balances, reports, records: scoped,
            scope: selectedRegion ? CountryConfig.get(selectedRegion)?.name : reports.map(report => report.name).filter((name, i, all) => all.indexOf(name) === i).join(' · '),
            snapshotDate: metadata?.generatedAt, snapshotRevision: metadata?.revisionsCount
        };
    }

    customSection(data) {
        const records = data.transactions.map(tx => ({ tx, region: this.transactionRegion(tx) }));
        const region = data.region === 'ALL' ? null : data.region;
        const walletRegion = this.state.wallets?.[data.wallet]?.region;
        const regions = region ? [region] : this.countries
            .filter(country => records.some(record => record.region === country.code) ||
                (walletRegion ? walletRegion === country.code : !records.length && storage.getActiveCountries().includes(country.code)))
            .map(country => country.code);
        return {
            label: 'Custom date range', period: `${data.startDate} to ${data.endDate}`,
            scope: [
                region ? CountryConfig.get(region)?.name : 'All regions',
                data.wallet !== 'ALL' ? this.app.getWalletName(data.wallet) : 'All wallets',
                data.category !== 'ALL' ? this.app.getCategoryName(data.category, region) : 'All categories'
            ].filter(Boolean).join(' · '),
            balances: [], reports: this.regionalReports(regions, records), records
        };
    }

    balance(region, wallets, current) {
        const country = CountryConfig.get(region);
        const scoped = Object.values(wallets || {}).filter(wallet => wallet?.region === region && !wallet.isArchived && !wallet.archived);
        const matching = scoped.filter(wallet => this.currency(wallet.currency, country.currency) === country.currency);
        const available = matching.length && matching.every(wallet => wallet.balance != null && Number.isFinite(Number(wallet.balance)));
        const date = current ? new Date().toLocaleDateString() : null;
        return {
            region, country, value: available ? matching.reduce((total, wallet) => total + Number(wallet.balance), 0) : null,
            label: current ? 'Current balance' : 'Historical balance snapshot', date
        };
    }

    monthlyBudget(region, archived, current) {
        if (current && storage.isBudgetEnabled(region)) return storage.getTotalAvailableBudget(region);
        if (!archived) return null;

        const base = archived[`${region}TotalBudget`] ?? archived[`${region.toLowerCase()}TotalBudget`];
        const prior = archived[`${region}CarryoverPrior`] ?? 0;
        if (base == null || archived[`${region}Provenance`] === 'unknown') return null;
        const total = Number(base) + Number(prior);
        return Number.isFinite(total) && total > 0 ? total : null;
    }

    regionalReports(regions, records, archived = null, current = false) {
        const buckets = new Map();
        const add = (region, currency) => {
            const key = `${region} ${currency}`;
            if (!buckets.has(key)) {
                const country = CountryConfig.get(region);
                buckets.set(key, { region, country, name: country?.name || 'Region not recorded', currency, records: [] });
            }
            return buckets.get(key);
        };
        for (const region of regions) {
            const country = CountryConfig.get(region);
            if (country && ((archived || current) || !records.some(record => record.region === region))) {
                add(region, country.currency);
            }
        }
        for (const record of records) {
            const { tx, region } = record;
            if (tx.type === 'expense' || tx.type === 'income') {
                add(region, this.transactionCurrency(tx, region, archived) || '').records.push(tx);
            } else if (CountryConfig.get(region)) {
                add(region, CountryConfig.get(region).currency);
            }
        }
        return [...buckets.values()].map(report => this.regionTotals(report, archived, current));
    }

    regionTotals(report, archived, current) {
        const { region, currency, country } = report;
        const eligible = currency === country?.currency;
        const liveBudget = eligible && current && storage.isBudgetEnabled(region);
        const historicalDefinitions = archived?.categoriesSnapshot?.[region];
        const definitions = historicalDefinitions || this.state.categories?.[region] || [];
        const actualLimits = eligible && (historicalDefinitions || (liveBudget ? definitions.filter(c => c.isActive !== false) : null));
        const categories = new Map();
        const definitionsById = new Map(definitions.map(category => [category.id, category]));
        const limits = new Map((actualLimits || []).map(category => [category.id, Number(category.budget) || 0]));
        const addCategory = id => {
            if (!categories.has(id)) {
                const definition = definitionsById.get(id);
                categories.set(id, {
                    name: definition?.name || (id ? this.app.getCategoryName(id, region) : 'Uncategorized'),
                    icon: definition?.icon || 'tag', budget: limits.get(id) || 0, spent: 0
                });
            }
            return categories.get(id);
        };

        for (const [id, budget] of limits) {
            if (budget > 0) addCategory(id);
        }
        let income = 0;
        for (const tx of report.records) {
            const amount = Number(tx.amount);
            if (!Number.isFinite(amount)) continue;
            if (tx.type === 'income') income += amount;
            else if (tx.type === 'expense') addCategory(tx.categoryId || tx.category || '').spent += amount;
        }
        const sorted = [...categories.values()].sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
        const expense = sorted.reduce((total, category) => total + category.spent, 0);
        return { ...report, income, expense, categories: sorted, budget: eligible ? this.monthlyBudget(region, archived, current) : null };
    }

    render(title, sections) {
        const e = value => this.app.escapeHtml(value);
        const generated = new Date().toLocaleString();
        return sections.map((section, periodIndex) => `
            <section class="pdf-period">
                <header class="pdf-header">
                    <p class="pdf-wordmark">Expense Manager</p>
                    <h1>${e(title)}</h1>
                    <div class="pdf-period-line">
                        <h2>${e(section.label)}</h2>
                        <span>${e(section.period)}${section.status ? ' · ' + e(section.status) : ''}</span>
                    </div>
                    <p class="pdf-metadata">
                        <span>${[section.scope, `${section.records.length} ${section.records.length === 1 ? 'transaction' : 'transactions'}`].filter(Boolean).map(e).join(' · ')}</span>
                        <span>Generated ${e(generated)}</span>
                        ${section.snapshotDate ? `<span>Snapshot prepared ${e(section.snapshotDate)}${section.snapshotRevision ? ' · Revision ' + e(section.snapshotRevision) : ''}</span>` : ''}
                    </p>
                </header>
                ${section.balances.length ? `<div class="pdf-balances">${section.balances.map(balance => this.renderBalance(balance)).join('')}</div>` : ''}
                ${section.reports.map((report, regionIndex) => this.renderRegion(report, `pdf-donut-${periodIndex}-${regionIndex}`)).join('')}
                ${this.renderTransactions(section.records)}
            </section>
        `).join('');
    }

    renderBalance(balance) {
        const { country, region, label, date, value } = balance;
        return `<div class="pdf-balance" data-region="${this.app.escapeHtml(region)}">
            <h3>${this.app.getCountryFlagSvg(region)} ${this.app.escapeHtml(country.name)} <small>${country.currencyCode}</small></h3>
            <p>${label}${date ? ' · ' + this.app.escapeHtml(date) : ''}</p>
            ${value === null ? '<span>Balance unavailable</span>' : `<strong class="pdf-figure">${this.money(value, country.currency)}</strong>`}
        </div>`;
    }

    renderRegion(report, chartId) {
        const { region, country, name, currency, expense, budget, categories } = report;
        const e = value => this.app.escapeHtml(value);
        const code = this.countries.find(entry => entry.currency === currency)?.currencyCode || currency;
        return `<section class="pdf-region">
            <h3>${country ? this.app.getCountryFlagSvg(region) : ''} ${e(name)} <small>${e(code || 'Currency unavailable')}</small></h3>
            ${this.renderDistribution(report, chartId)}
            ${this.renderBudget('Overall budget', expense, budget, currency, report.income)}
            ${categories.length ? `<h4 class="pdf-section-title">By category</h4>
                ${this.pairs(categories).map(pair => `<div class="pdf-category-row">${pair.map(category =>
                    this.renderBudget(category.name, category.spent, category.budget, currency, null, category.icon)).join('')}</div>`).join('')}` : ''}
        </section>`;
    }

    pairs(items) {
        const rows = [];
        for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
        return rows;
    }

    renderDistribution(report, chartId) {
        const { currency, expense, categories } = report;
        const e = value => this.app.escapeHtml(value);
        const items = categories.filter(category => category.spent > 0);
        if (!items.length) {
            return '<div class="pdf-panel pdf-empty"><h4>Expense distribution</h4><p>No expenses recorded for this period.</p></div>';
        }
        const chartTotal = items.reduce((total, category) => total + category.spent, 0);
        const centerAmount = this.money(chartTotal, currency);
        let offset = 0;
        const slices = items.map((category, index) => {
            const share = category.spent / chartTotal * 100;
            const color = `rgb(${expenseChartPalette[index % expenseChartPalette.length]})`;
            const start = offset;
            offset += share;
            return { ...category, share, color, start };
        });
        const pointAt = (share, radius) => {
            const radians = share * Math.PI / 50 - Math.PI / 2;
            return `${50 + Math.cos(radians) * radius} ${50 + Math.sin(radians) * radius}`;
        };
        const gradients = [...new Set(slices.map(slice => slice.color))];
        const gradientId = color => `${chartId}-${gradients.indexOf(color)}`;
        const definitions = gradients.map(color => `
            <linearGradient id="${gradientId(color)}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
                ${expenseChartGradientStops.map(([offset, opacity]) =>
                    `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`).join('')}
            </linearGradient>`).join('');
        const ring = slices.map(({ share, color, start }) => {
            const gap = Math.min(0.65, share * 0.18);
            const from = start + gap / 2;
            const to = start + share - gap / 2;
            const largeArc = to - from > 50 ? 1 : 0;
            const outer = 46;
            const inner = outer * 0.72;
            const path = `M ${pointAt(from, outer)} A ${outer} ${outer} 0 ${largeArc} 1 ${pointAt(to, outer)}
                L ${pointAt(to, inner)} A ${inner} ${inner} 0 ${largeArc} 0 ${pointAt(from, inner)} Z`;
            // Very small slices keep their actual width instead of gaining a visible outline.
            const outline = share >= 1 ? ` stroke="${color}" stroke-width="0.75"` : '';
            return `<path d="${path}" fill="url(#${gradientId(color)})"${outline}/>`;
        }).join('');
        const legend = slice => `<div class="pdf-legend-item"><svg viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" fill="${slice.color}"/></svg>
            <span>${e(slice.name)}</span><span>${e(this.chartPercent(slice.share))}</span><strong>${this.money(slice.spent, currency)}</strong></div>`;
        const front = slices.slice(0, 6);
        const remaining = slices.slice(6);
        return `<div class="pdf-chart-block">
            <h4>Expense distribution</h4>
            <div class="pdf-chart-layout">
                <figure class="pdf-donut">
                    <svg viewBox="0 0 100 100" aria-hidden="true"><defs>${definitions}</defs>${ring}</svg>
                    <figcaption><span>${chartTotal === expense ? 'Total spent' : 'Positive spend'}</span>
                        <strong class="pdf-figure${centerAmount.length > 13 ? ' pdf-figure-long' : ''}">${centerAmount}</strong></figcaption>
                </figure>
                <div class="pdf-legend">${front.map(legend).join('')}</div>
            </div>
            ${chartTotal !== expense ? '<p class="pdf-chart-note">Negative category totals are reflected in expenditure and excluded from the donut.</p>' : ''}
        </div>
        ${remaining.length ? `<div class="pdf-legend-continuation"><h5>Expense distribution continued</h5>
            ${this.pairs(remaining).map(row => `<div class="pdf-legend-row">${row.map(legend).join('')}</div>`).join('')}</div>` : ''}`;
    }

    chartPercent(value) {
        const minimum = this.percent(0.1);
        const maximum = this.percent(99.9);
        if (value > 0 && value < 0.1) return `<${minimum}%`;
        if (value < 100 && value > 99.9) return `>${maximum}%`;
        return `${this.percent(value)}%`;
    }

    percent(value) {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
    }

    renderBudget(name, spent, budget, currency, income = null, icon = null) {
        const e = value => this.app.escapeHtml(value);
        const hasBudget = Number.isFinite(budget) && budget > 0;
        const utilization = hasBudget ? spent / budget * 100 : 0;
        const over = hasBudget && spent > budget;
        const tone = over || utilization > 90 ? 'danger' : utilization > 75 ? 'warn' : 'safe';
        const status = over ? 'Over budget' : utilization > 90 ? 'Near limit' : utilization > 75 ? 'Approaching limit' : 'On track';
        const heading = icon ? e(name) : hasBudget ? e(name) : 'Expenditure';
        return `<div class="pdf-panel ${icon ? 'pdf-category' : 'pdf-budget'}">
            <div class="pdf-budget-heading"><h4>${icon ? `<i data-lucide="${this.app.categoryIcon(icon)}" aria-hidden="true"></i>` : ''}${heading}</h4>
            ${hasBudget ? `<span class="pdf-budget-status" data-tone="${tone}">${status}</span>` : ''}</div>
            <div class="pdf-budget-figures"><strong class="pdf-figure">${this.money(spent, currency)}</strong>
            ${hasBudget ? `<span>of ${this.money(budget, currency)} allocated</span>` : `<span>${icon ? 'Spent' : 'No budget allocation for this scope'}</span>`}</div>
            ${hasBudget ? `<div class="pdf-progress" data-tone="${tone}"><span style="width:${Math.max(0, Math.min(utilization, 100))}%"></span></div>
                <div class="pdf-budget-meta"><span>${this.percent(utilization)}% used</span>
                <span>${this.money(Math.abs(budget - spent), currency)} ${over ? 'over' : 'remaining'}</span></div>` : ''}
            ${income !== null ? `<div class="pdf-region-totals"><span>Income <b>${this.money(income, currency)}</b></span>
                <span>Net <b>${this.money(Math.abs(income - spent), currency, income < spent ? '−' : income > spent ? '+' : '')}</b></span></div>` : ''}
        </div>`;
    }

    renderTransactions(records) {
        const groups = new Map();
        for (const record of records) {
            const date = Number.isFinite(getTransactionUtcDay(record.tx.date)) ? record.tx.date : '';
            if (!groups.has(date)) groups.set(date, []);
            groups.get(date).push(record);
        }
        const sorted = [...groups].sort(([a], [b]) => b.localeCompare(a));
        return `<section class="pdf-transactions"><h3>Transactions</h3>
            ${sorted.length ? sorted.map(([date, group]) => `<div class="pdf-date-group">
                <div class="pdf-date-start"><h4>${this.app.escapeHtml(date ? this.app.formatLedgerDateHeader(date) : 'Unknown date')}</h4>
                    ${this.renderTransaction(group[0])}</div>
                ${group.slice(1).map(record => this.renderTransaction(record)).join('')}</div>`).join('') : '<p class="pdf-empty">No transactions in this period.</p>'}
        </section>`;
    }

    renderTransaction({ tx, region, snapshot }) {
        const e = value => this.app.escapeHtml(value);
        const type = tx.type || (tx.isIncome ? 'income' : 'expense');
        const transfer = type === 'transfer' || type === 'remittance';
        const label = { expense: 'Expense', income: 'Income', transfer: 'Transfer', remittance: 'Remittance' }[type] || 'Transaction';
        const categoryId = tx.categoryId || tx.category;
        const definition = categoryId && snapshot?.categoriesSnapshot?.[region]
            ?.find(item => item.id === categoryId || item.name === categoryId);
        const category = transfer ? '' : definition?.name || this.app.getTransactionCategory(tx);
        const name = id => id ? snapshot?.walletsSnapshot?.[id]?.name || this.app.getWalletName(id) : 'Account unavailable';
        const accounts = transfer ? `${name(tx.sourceId)} → ${name(tx.destId)}` : name(tx.walletId);
        const currency = this.transactionCurrency(tx, region, snapshot);
        const wallet = (snapshot?.walletsSnapshot || this.state.wallets)?.[tx.destId];
        const destinationCurrency = this.currency(tx.destCurrency || wallet?.currency, CountryConfig.get(wallet?.region)?.currency);
        const amount = type === 'remittance'
            ? `${this.money(tx.sourceAmount, currency)} → ${this.money(tx.destAmount, destinationCurrency)}`
            : this.money(Math.abs(Number(tx.amount || 0)), currency,
                type === 'expense' ? (tx.amount < 0 ? '+' : '−') : type === 'income' ? (tx.amount < 0 ? '−' : '+') : '');
        return `<div class="pdf-transaction">
            <div><p>${e(tx.note || tx.description || label)}</p><div class="pdf-transaction-meta">${[label, category !== label ? category : '', accounts].filter(Boolean).map(e).join(' · ')}</div></div>
            <strong class="pdf-tx-amount" data-kind="${e(type)}">${amount}</strong>
        </div>`;
    }
}
