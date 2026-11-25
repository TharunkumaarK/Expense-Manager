class ChartManager {
    constructor() {
        this.jpTrendChart = null;
        this.jpCategoryDonut = null;
        this.inTrendChart = null;
        this.reportExpensePie = null;

        // Legacy charts retained for backward compatibility
        this.jpDonut = null;
        this.inDonut = null;
        this.utilityLine = null;

        if (typeof Chart !== 'undefined' && Chart.defaults) {
            Chart.defaults.color = '#8b8b99';
            if (Chart.defaults.font) {
                Chart.defaults.font.family = "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif";
            }
        }
    }

    renderCharts() {
        this.renderJPDonut();
        this.renderINDonut();
        this.renderUtilityLine();
    }

    destroyCharts() {
        if (this.jpTrendChart) { this.jpTrendChart.destroy(); this.jpTrendChart = null; }
        if (this.jpCategoryDonut) { this.jpCategoryDonut.destroy(); this.jpCategoryDonut = null; }
        if (this.inTrendChart) { this.inTrendChart.destroy(); this.inTrendChart = null; }
        if (this.reportExpensePie) { this.reportExpensePie.destroy(); this.reportExpensePie = null; }
        if (this.jpDonut) { this.jpDonut.destroy(); this.jpDonut = null; }
        if (this.inDonut) { this.inDonut.destroy(); this.inDonut = null; }
        if (this.utilityLine) { this.utilityLine.destroy(); this.utilityLine = null; }
    }

    getGlassStyles(canvasCtx, count, height = 300) {
        // SpendIQ vibrant glass palette
        const baseColors = [
            '62, 99, 221',    // SpendIQ Primary Blue (#3e63dd)
            '191, 90, 242',   // SpendIQ Purple (#bf5af2)
            '52, 211, 153',   // Emerald (#34d399)
            '249, 115, 22',   // Vibrant Orange (#f97316)
            '6, 182, 212',    // Cyan (#06b6d4)
            '251, 113, 133',  // Rose (#fb7185)
            '234, 179, 8',    // Amber (#eab308)
            '147, 51, 234',   // Violet (#9333ea)
            '14, 165, 233',   // Sky (#0ea5e9)
            '244, 63, 94'     // Rose Red (#f43f5e)
        ];

        const backgrounds = [];
        const borders = [];

        for (let i = 0; i < count; i++) {
            const rgb = baseColors[i % baseColors.length];
            const grad = canvasCtx.createLinearGradient(0, 0, 0, height);
            grad.addColorStop(0, `rgba(${rgb}, 0.85)`);
            grad.addColorStop(1, `rgba(${rgb}, 0.35)`);
            backgrounds.push(grad);
            borders.push(`rgba(${rgb}, 1.0)`);
        }

        return { backgrounds, borders };
    }

    getSpendingTrendSeries(transactions, granularity, startDate, endDate) {
        const toUtcDate = date => new Date(`${date}T00:00:00Z`);
        const totals = new Map();
        for (const tx of transactions) {
            const amount = Number(tx.amount || 0);
            if (tx.type !== 'expense' || !Number.isFinite(amount) || amount === 0) continue;
            const date = tx.date;
            if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
            const utcDate = toUtcDate(date);
            if (!Number.isFinite(utcDate.getTime()) || utcDate.toISOString().slice(0, 10) !== date) continue;
            if ((startDate && date < startDate) || (endDate && date > endDate)) continue;

            const month = date.slice(0, 7);
            let key = month;
            if (granularity === 'daily') key = date;
            if (granularity === 'weekly') key = `${month}-W${Math.ceil(utcDate.getUTCDate() / 7)}`;
            totals.set(key, (totals.get(key) || 0) + amount);
        }

        const keys = [...totals.keys()].sort();
        if (granularity === 'weekly' && keys.length === 0) {
            return { labels: ['W1', 'W2', 'W3', 'W4'], data: [0, 0, 0, 0] };
        }
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        if (granularity === 'daily') {
            const first = startDate || keys[0] || `${currentMonth}-01`;
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const last = endDate || keys.at(-1) || `${currentMonth}-${lastDay}`;
            const options = { day: 'numeric', month: 'short', timeZone: 'UTC' };
            if (first.slice(0, 4) !== last.slice(0, 4)) options.year = 'numeric';
            const format = new Intl.DateTimeFormat('en-GB', options);
            const labels = [], data = [];
            const end = toUtcDate(last);
            for (const day = toUtcDate(first); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
                labels.push(format.format(day));
                data.push(totals.get(day.toISOString().slice(0, 10)) || 0);
            }
            return { labels, data };
        }

        if (keys.length === 0) keys.push(currentMonth);
        const format = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
        const labels = keys.map(key => {
            const month = format.format(toUtcDate(`${key.slice(0, 7)}-01`));
            return granularity === 'weekly' ? `${month} ${key.slice(8)}` : month;
        });
        return { labels, data: keys.map(key => totals.get(key) || 0) };
    }

    /**
     * Phase 3: Japan Spending Trend (Daily / Weekly / Monthly)
     */
    renderJpSpendingTrend(granularity = 'daily', transactions = [], startDateStr = null, endDateStr = null) {
        const ctx = document.getElementById('jp-trend-chart');
        if (!ctx) return;

        if (this.jpTrendChart) {
            this.jpTrendChart.destroy();
            this.jpTrendChart = null;
        }

        const { labels, data } = this.getSpendingTrendSeries(transactions, granularity, startDateStr, endDateStr);

        const canvasCtx = ctx.getContext('2d');
        const gradient = canvasCtx.createLinearGradient(0, 0, 0, 260);
        gradient.addColorStop(0, 'rgba(62, 99, 221, 0.45)');
        gradient.addColorStop(1, 'rgba(62, 99, 221, 0.0)');

        this.jpTrendChart = new Chart(ctx, {
            type: granularity === 'weekly' ? 'bar' : 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Spent (¥)',
                    data: data,
                    borderColor: '#3e63dd',
                    borderWidth: 2.2,
                    backgroundColor: granularity === 'weekly' ? 'rgba(62, 99, 221, 0.75)' : gradient,
                    borderRadius: granularity === 'weekly' ? 6 : 0,
                    tension: 0.35,
                    fill: granularity !== 'weekly',
                    pointBackgroundColor: '#3e63dd',
                    pointBorderColor: '#08080c',
                    pointBorderWidth: 2,
                    pointRadius: data.length > 25 ? 2 : 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#14141e',
                        titleColor: '#f5f5f7',
                        bodyColor: '#a0a0ab',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        callbacks: {
                            label: (ctx) => {
                                if (typeof app !== 'undefined' && app.isPrivacyHidden) {
                                    return ' Spent: ******';
                                }
                                return ` Spent: ¥${(ctx.parsed.y || 0).toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#8b8b99',
                            font: { size: 11 },
                            callback: (val) => {
                                if (typeof app !== 'undefined' && app.isPrivacyHidden) return '';
                                if (val >= 1000000) return `¥${(val / 1000000).toFixed(1)}M`;
                                if (val >= 1000) return `¥${(val / 1000).toFixed(0)}k`;
                                return `¥${val}`;
                            }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#8b8b99',
                            font: { size: 11 },
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 10
                        }
                    }
                }
            }
        });
    }

    /**
     * Phase 3: Japan Category Donut Chart with Drilldown
     */
    renderJpCategoryDonut(categories = [], onCategoryClick = null) {
        const ctx = document.getElementById('jp-category-donut-chart');
        if (!ctx) return;

        if (this.jpCategoryDonut) {
            this.jpCategoryDonut.destroy();
            this.jpCategoryDonut = null;
        }

        if (categories.length === 0) {
            this.jpCategoryDonut = new Chart(ctx, this.getEmptyConfig('No expenses in period'));
            return;
        }
        // Doughnut slices represent magnitudes and cannot show negative shares.
        if (categories.some(cat => cat.amount < 0)) {
            const message = 'Category shares unavailable for negative totals';
            const config = this.getEmptyConfig(message);
            config.options.plugins.title = { display: true, text: message };
            this.jpCategoryDonut = new Chart(ctx, config);
            return;
        }

        const labels = categories.map(c => c.name);
        const data = categories.map(c => c.amount);
        const totalSum = data.reduce((s, v) => s + v, 0);

        const glassStyles = this.getGlassStyles(ctx.getContext('2d'), data.length);

        this.jpCategoryDonut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: glassStyles.backgrounds,
                    borderColor: glassStyles.borders,
                    borderWidth: 1.5,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                onClick: (event, elements) => {
                    if (elements.length > 0 && typeof onCategoryClick === 'function') {
                        const index = elements[0].index;
                        const selectedCat = categories[index];
                        if (selectedCat && selectedCat.id !== null) onCategoryClick(selectedCat);
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#f0f0f5',
                            boxWidth: 10,
                            padding: 8,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#14141e',
                        titleColor: '#f5f5f7',
                        bodyColor: '#a0a0ab',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.parsed || 0;
                                const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : '0';
                                if (typeof app !== 'undefined' && app.isPrivacyHidden) {
                                    return ` ${ctx.label}: ****** (${pct}%)`;
                                }
                                return ` ${ctx.label}: ¥${val.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Phase 3: India Simplified Weekly Spending Trend
     */
    renderInSpendingTrend(transactions = [], period = 'this-month') {
        const ctx = document.getElementById('in-trend-chart');
        if (!ctx) return;

        if (this.inTrendChart) {
            this.inTrendChart.destroy();
            this.inTrendChart = null;
        }

        const { labels, data } = this.getSpendingTrendSeries(transactions, 'weekly');

        this.inTrendChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'India Spend (₹)',
                    data: data,
                    backgroundColor: 'rgba(249, 115, 22, 0.75)',
                    borderColor: 'rgba(249, 115, 22, 1.0)',
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#14141e',
                        titleColor: '#f5f5f7',
                        bodyColor: '#a0a0ab',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (ctx) => {
                                if (typeof app !== 'undefined' && app.isPrivacyHidden) {
                                    return ' Spent: ******';
                                }
                                return ` Spent: ₹${(ctx.parsed.y || 0).toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#8b8b99',
                            font: { size: 11 },
                            callback: (val) => {
                                if (typeof app !== 'undefined' && app.isPrivacyHidden) return '';
                                if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
                                return `₹${val}`;
                            }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#8b8b99', font: { size: 11 } }
                    }
                }
            }
        });
    }

    updatePrivacy() {
        if (this.jpTrendChart) this.jpTrendChart.update();
        if (this.jpCategoryDonut) this.jpCategoryDonut.update();
        if (this.inTrendChart) this.inTrendChart.update();
        if (this.reportExpensePie) {
            this.reportExpensePie.update();
            const centerEl = document.getElementById('report-pie-center-total');
            if (centerEl && typeof app !== 'undefined' && this.reportExpensePie.data?.datasets?.[0]?.data) {
                const total = this.reportExpensePie.data.datasets[0].data.reduce((s, v) => s + v, 0);
                const repReg = app.reportRegion || 'JP';
                const currency = (typeof CountryConfig !== 'undefined' ? CountryConfig.get(repReg)?.currency : null) || (repReg === 'IN' ? '₹' : repReg === 'DE' ? '€' : '¥');
                centerEl.innerText = app.formatMoney(total, currency);
            }
        }
        if (this.dashboardCategoryDonut) {
            this.dashboardCategoryDonut.update();
            const dashCenterEl = document.getElementById('dash-donut-center-total');
            if (dashCenterEl && typeof app !== 'undefined' && this.dashboardCategoryDonut.data?.datasets?.[0]?.data) {
                const total = this.dashboardCategoryDonut.data.datasets[0].data.reduce((s, v) => s + v, 0);
                const dashReg = app.dashboardChartRegion || 'JP';
                const currency = (typeof CountryConfig !== 'undefined' ? CountryConfig.get(dashReg)?.currency : null) || (dashReg === 'IN' ? '₹' : dashReg === 'DE' ? '€' : '¥');
                dashCenterEl.innerText = app.formatMoney(total, currency);
            }
        }
        if (this.jpDonut) this.jpDonut.update();
        if (this.inDonut) this.inDonut.update();
        if (this.utilityLine) this.utilityLine.update();
        if (typeof app !== 'undefined' && app.renderedHistoryCharts) {
            app.renderedHistoryCharts.forEach(index => {
                const jpChart = Chart.getChart(`history-donut-${index}-JP`);
                if (jpChart) jpChart.update();
                const inChart = Chart.getChart(`history-donut-${index}-IN`);
                if (inChart) inChart.update();
            });
        }
    }

    /**
     * Dashboard: Visual Category Expense Breakdown Donut Chart (Pass 1 Requirement 6.B)
     */
    renderDashboardExpenseDonut(categories = [], totals = {}, currency = '¥', region = 'JP') {
        const ctx = document.getElementById('dashboard-category-donut');
        if (!ctx) return;

        if (this.dashboardCategoryDonut) {
            this.dashboardCategoryDonut.destroy();
            this.dashboardCategoryDonut = null;
        }

        const activeCategories = (categories || []).filter(c => (totals[c.id] || 0) > 0);
        const centerEl = document.getElementById('dash-donut-center-total');
        const legendEl = document.getElementById('dash-donut-legend');

        if (activeCategories.length === 0) {
            this.dashboardCategoryDonut = new Chart(ctx, this.getEmptyConfig('No expenses in this month'));
            if (centerEl && typeof app !== 'undefined') {
                centerEl.innerText = app.formatMoney(0, currency);
            }
            if (legendEl) {
                legendEl.innerHTML = `<p class="dash-donut-empty-text">No category expenses recorded for ${region === 'JP' ? 'Japan' : 'India'} this month.</p>`;
            }
            return;
        }

        // Sort categories descending by spend amount
        activeCategories.sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));

        const labels = activeCategories.map(c => c.name);
        const data = activeCategories.map(c => totals[c.id] || 0);
        const totalSum = data.reduce((s, v) => s + v, 0);

        if (centerEl && typeof app !== 'undefined') {
            centerEl.innerText = app.formatMoney(totalSum, currency);
        }

        const glassStyles = this.getGlassStyles(ctx.getContext('2d'), data.length);

        this.dashboardCategoryDonut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: glassStyles.backgrounds,
                    borderColor: glassStyles.borders,
                    borderWidth: 1.5,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '74%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#121218',
                        titleColor: '#f5f5f7',
                        bodyColor: '#a0a0ab',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (context) => {
                                const val = context.parsed || 0;
                                const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : '0';
                                if (typeof app !== 'undefined' && app.isPrivacyHidden) {
                                    return ` ${context.label}: ****** (${pct}%)`;
                                }
                                return ` ${context.label}: ${typeof app !== 'undefined' ? app.formatMoney(val, currency) : `${currency}${val.toLocaleString()}`} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });

        if (legendEl) {
            legendEl.innerHTML = activeCategories.map((c, i) => {
                const val = totals[c.id] || 0;
                const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : '0';
                const color = glassStyles.borders[i % glassStyles.borders.length];
                const formattedAmt = typeof app !== 'undefined' ? app.formatMoney(val, currency) : `${currency}${val.toLocaleString()}`;
                return `
                    <div class="dash-legend-item" onclick="app.openCategoryManageModal('${c.id}', '${region}')" title="Inspect ${c.name} (${pct}%)">
                        <div class="dash-legend-left">
                            <span class="dash-legend-dot" style="background: ${color};"></span>
                            <span class="dash-legend-name">${c.name}</span>
                        </div>
                        <div class="dash-legend-right">
                            <span class="dash-legend-pct">${pct}%</span>
                            <span class="dash-legend-amt privacy-blur financial-amount">${formattedAmt}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    /**
     * Reports Page: Visual Expense Distribution Donut/Pie Chart
     */
    renderReportExpensePie(categories = [], totals = {}, currency = '¥', region = 'JP') {
        const ctx = document.getElementById('report-expense-pie-chart');
        if (!ctx || typeof Chart === 'undefined') return;

        if (this.reportExpensePie) {
            this.reportExpensePie.destroy();
            this.reportExpensePie = null;
        }

        const activeCategories = (categories || []).filter(c => (totals[c.id] || 0) > 0);
        const centerEl = document.getElementById('report-pie-center-total');
        const legendEl = document.getElementById('report-pie-legend');

        if (activeCategories.length === 0) {
            this.reportExpensePie = new Chart(ctx, this.getEmptyConfig('No expenses recorded in period'));
            if (centerEl) centerEl.innerText = `${currency}0`;
            if (legendEl) legendEl.innerHTML = `<p class="text-xs text-muted" style="text-align:center;padding:16px 0;width:100%;">No category expense debits recorded in this period snapshot.</p>`;
            return;
        }

        // Sort categories descending by spend amount
        activeCategories.sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));

        const labels = activeCategories.map(c => c.name);
        const data = activeCategories.map(c => totals[c.id] || 0);
        const totalSum = data.reduce((s, v) => s + v, 0);

        if (centerEl && typeof app !== 'undefined') {
            centerEl.innerText = app.formatMoney(totalSum, currency);
        }

        const glassStyles = this.getGlassStyles(ctx.getContext('2d'), data.length);

        this.reportExpensePie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: glassStyles.backgrounds,
                    borderColor: glassStyles.borders,
                    borderWidth: 1.5,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#14141e',
                        titleColor: '#f5f5f7',
                        bodyColor: '#a0a0ab',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.parsed || 0;
                                const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : '0';
                                if (typeof app !== 'undefined' && app.isPrivacyHidden) {
                                    return ` ${ctx.label}: ****** (${pct}%)`;
                                }
                                return ` ${ctx.label}: ${currency}${val.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });

        if (legendEl) {
            legendEl.innerHTML = activeCategories.map((c, i) => {
                const val = totals[c.id] || 0;
                const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : '0';
                const color = glassStyles.borders[i % glassStyles.borders.length];
                const formattedAmt = typeof app !== 'undefined' ? app.formatMoney(val, currency) : `${currency}${val.toLocaleString()}`;
                return `
                    <div class="pie-legend-item" title="${c.name}: ${pct}% of total spent">
                        <div class="pie-legend-left">
                            <span class="legend-dot" style="background: ${color};"></span>
                            <span class="legend-cat-name">${c.name}</span>
                        </div>
                        <div class="pie-legend-right">
                            <span class="legend-pct">${pct}%</span>
                            <span class="legend-amt privacy-blur">${formattedAmt}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    getEmptyConfig(message, isPrint = false) {
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        };
        if (isPrint) {
            options.animation = false;
        }
        return {
            type: 'doughnut',
            data: {
                labels: [message],
                datasets: [{ data: [1], backgroundColor: ['#2c2c35'], borderWidth: 0 }]
            },
            options: options
        };
    }

    // Legacy Stubs for backward compatibility
    renderJPDonut() {
        const ctx = document.getElementById('jp-donut-chart');
        if (!ctx) return;
        if (this.jpDonut) this.jpDonut.destroy();
        const totals = typeof walletManager !== 'undefined' ? walletManager.getCategoryTotals('JP') : {};
        const categories = (storage.state?.categories?.JP || []).filter(c => totals[c.id] > 0);
        if (categories.length === 0) {
            this.jpDonut = new Chart(ctx, this.getEmptyConfig('No data yet'));
            return;
        }
        const labels = categories.map(c => c.name);
        const data = categories.map(c => totals[c.id]);
        const glassStyles = this.getGlassStyles(ctx.getContext('2d'), data.length);
        this.jpDonut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: glassStyles.backgrounds,
                    borderColor: glassStyles.borders,
                    borderWidth: 1.5,
                    hoverOffset: 4
                }]
            },
            options: this.getDonutOptions('JP')
        });
    }

    renderINDonut() {
        const ctx = document.getElementById('in-donut-chart');
        if (!ctx) return;
        if (this.inDonut) this.inDonut.destroy();
        const totals = typeof walletManager !== 'undefined' ? walletManager.getCategoryTotals('IN') : {};
        const categories = (storage.state?.categories?.IN || []).filter(c => totals[c.id] > 0);
        if (categories.length === 0) {
            this.inDonut = new Chart(ctx, this.getEmptyConfig('No data yet'));
            return;
        }
        const labels = categories.map(c => c.name);
        const data = categories.map(c => totals[c.id]);
        const glassStyles = this.getGlassStyles(ctx.getContext('2d'), data.length);
        this.inDonut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: glassStyles.backgrounds,
                    borderColor: glassStyles.borders,
                    borderWidth: 1.5,
                    hoverOffset: 4
                }]
            },
            options: this.getDonutOptions('IN')
        });
    }

    renderUtilityLine() {
        const ctx = document.getElementById('utilities-line-chart');
        if (!ctx) return;
        if (this.utilityLine) this.utilityLine.destroy();
        const utilityCats = (storage.state?.categories?.JP || []).filter(c =>
            c.id.includes('utility') ||
            c.name.toLowerCase().includes('electric') ||
            c.name.toLowerCase().includes('gas') ||
            c.name.toLowerCase().includes('water') ||
            c.name.toLowerCase().includes('internet')
        );
        const totals = typeof walletManager !== 'undefined' ? walletManager.getCategoryTotals('JP') : {};
        const labels = utilityCats.map(c => c.name);
        const data = utilityCats.map(c => totals[c.id] || 0);
        const glassStyles = this.getGlassStyles(ctx.getContext('2d'), data.length);
        this.utilityLine = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Spent (¥)',
                    data: data,
                    backgroundColor: glassStyles.backgrounds,
                    borderColor: glassStyles.borders,
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#2c2c35' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    getDonutOptions(region = 'JP') {
        const currency = (typeof CountryConfig !== 'undefined' ? CountryConfig.get(region)?.currency : null) || (region === 'IN' ? '₹' : region === 'DE' ? '€' : '¥');
        return {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#f0f0f5', boxWidth: 10, padding: 8, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (typeof app !== 'undefined' && app.isPrivacyHidden) {
                                return ` ${ctx.label}: ******`;
                            }
                            return ` ${ctx.label}: ${currency}${ctx.parsed.toLocaleString()}`;
                        }
                    }
                }
            }
        };
    }

    renderHistoryDonut(canvasId, region, totals, isPrint = false) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        const categories = (storage.state?.categories?.[region] || []).filter(c => totals[c.id] > 0);
        if (categories.length === 0) {
            return new Chart(ctx, this.getEmptyConfig('No expenses', isPrint));
        }
        const labels = categories.map(c => c.name);
        const data = categories.map(c => totals[c.id]);
        const glassStyles = this.getGlassStyles(ctx.getContext('2d'), data.length);
        let options = this.getDonutOptions(region);
        if (isPrint) options.animation = false;
        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: glassStyles.backgrounds,
                    borderColor: glassStyles.borders,
                    borderWidth: 1.5,
                    hoverOffset: 4
                }]
            },
            options: options
        });
    }
}

const charts = new ChartManager();
window.charts = charts;
