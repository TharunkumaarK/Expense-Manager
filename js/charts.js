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

        if (typeof Chart !== 'undefined') {
            Chart.defaults.color = '#8b8b99';
            Chart.defaults.font.family = 'Inter, sans-serif';
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

        const validTxs = transactions.filter(t => t.type === 'expense' && Number(t.amount || 0) > 0);

        // Build data points according to granularity
        let labels = [];
        let data = [];

        if (granularity === 'daily') {
            // Determine date bounds
            let minD = startDateStr;
            let maxD = endDateStr;

            if (!minD || !maxD) {
                if (validTxs.length > 0) {
                    const sortedDates = validTxs.map(t => t.date).sort();
                    minD = minD || sortedDates[0];
                    maxD = maxD || sortedDates[sortedDates.length - 1];
                } else {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    minD = `${year}-${month}-01`;
                    maxD = `${year}-${month}-${String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
                }
            }

            // Group by date
            const dayTotals = {};
            validTxs.forEach(t => {
                if (t.date) dayTotals[t.date] = (dayTotals[t.date] || 0) + Number(t.amount || 0);
            });

            // Fill all days between minD and maxD
            const curDate = new Date(minD + 'T00:00:00');
            const targetDate = new Date(maxD + 'T00:00:00');

            while (curDate <= targetDate) {
                const yyyy = curDate.getFullYear();
                const mm = String(curDate.getMonth() + 1).padStart(2, '0');
                const dd = String(curDate.getDate()).padStart(2, '0');
                const dKey = `${yyyy}-${mm}-${dd}`;
                labels.push(curDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
                data.push(dayTotals[dKey] || 0);
                curDate.setDate(curDate.getDate() + 1);
            }
        } else if (granularity === 'weekly') {
            // Group by 7-day intervals
            const weekTotals = {};
            validTxs.forEach(t => {
                if (t.date) {
                    const d = new Date(t.date + 'T00:00:00');
                    const dayNum = d.getDate();
                    const weekNum = Math.min(Math.ceil(dayNum / 7), 5);
                    const weekKey = `W${weekNum} (${d.toLocaleDateString('en-GB', { month: 'short' })})`;
                    weekTotals[weekKey] = (weekTotals[weekKey] || 0) + Number(t.amount || 0);
                }
            });

            if (Object.keys(weekTotals).length === 0) {
                ['W1', 'W2', 'W3', 'W4'].forEach(w => {
                    weekTotals[w] = 0;
                });
            }

            labels = Object.keys(weekTotals);
            data = Object.values(weekTotals);
        } else {
            // Monthly
            const monthTotals = {};
            validTxs.forEach(t => {
                if (t.date) {
                    const mKey = t.date.substring(0, 7);
                    monthTotals[mKey] = (monthTotals[mKey] || 0) + Number(t.amount || 0);
                }
            });

            const sortedKeys = Object.keys(monthTotals).sort();
            if (sortedKeys.length === 0) {
                const now = new Date();
                const curM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                sortedKeys.push(curM);
                monthTotals[curM] = 0;
            }

            sortedKeys.forEach(mk => {
                const [y, m] = mk.split('-');
                const d = new Date(parseInt(y), parseInt(m) - 1, 1);
                labels.push(d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
                data.push(monthTotals[mk] || 0);
            });
        }

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
    renderJpCategoryDonut(categories = [], totals = {}, onCategoryClick = null) {
        const ctx = document.getElementById('jp-category-donut-chart');
        if (!ctx) return;

        if (this.jpCategoryDonut) {
            this.jpCategoryDonut.destroy();
            this.jpCategoryDonut = null;
        }

        const activeCategories = categories.filter(c => (totals[c.id] || 0) > 0);

        if (activeCategories.length === 0) {
            this.jpCategoryDonut = new Chart(ctx, this.getEmptyConfig('No expenses in period'));
            return;
        }

        const labels = activeCategories.map(c => c.name);
        const data = activeCategories.map(c => totals[c.id] || 0);
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
                        const selectedCat = activeCategories[index];
                        if (selectedCat) onCategoryClick(selectedCat);
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

        const validTxs = transactions.filter(t => t.type === 'expense' && Number(t.amount || 0) > 0);

        // Group into week buckets
        const weekTotals = {};
        validTxs.forEach(t => {
            if (t.date) {
                const d = new Date(t.date + 'T00:00:00');
                const weekNum = Math.min(Math.ceil(d.getDate() / 7), 5);
                const wKey = `Week ${weekNum}`;
                weekTotals[wKey] = (weekTotals[wKey] || 0) + Number(t.amount || 0);
            }
        });

        if (Object.keys(weekTotals).length === 0) {
            ['Week 1', 'Week 2', 'Week 3', 'Week 4'].forEach(w => {
                weekTotals[w] = 0;
            });
        }

        const labels = Object.keys(weekTotals);
        const data = Object.values(weekTotals);

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
                const currency = (typeof app.reportRegion !== 'undefined' && app.reportRegion === 'IN') ? '₹' : '¥';
                centerEl.innerText = app.formatMoney(total, currency);
            }
        }
        if (this.dashboardCategoryDonut) {
            this.dashboardCategoryDonut.update();
            const dashCenterEl = document.getElementById('dash-donut-center-total');
            if (dashCenterEl && typeof app !== 'undefined' && this.dashboardCategoryDonut.data?.datasets?.[0]?.data) {
                const total = this.dashboardCategoryDonut.data.datasets[0].data.reduce((s, v) => s + v, 0);
                const currency = (typeof app.dashboardChartRegion !== 'undefined' && app.dashboardChartRegion === 'IN') ? '₹' : '¥';
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
        if (!ctx) return;

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
                        <div class="legend-dot" style="background: ${color};"></div>
                        <div class="legend-info">
                            <span class="legend-cat-name">${c.name}</span>
                            <div class="legend-meta">
                                <span class="legend-pct">${pct}%</span>
                                <span class="legend-dot-sep">•</span>
                                <span class="legend-amt privacy-blur">${formattedAmt}</span>
                            </div>
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
        const currency = region === 'IN' ? '₹' : '¥';
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
