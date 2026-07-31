class ChartManager {
    constructor() {
        this.jpDonut = null;
        this.inDonut = null;
        this.utilityLine = null;

        Chart.defaults.color = '#8b8b99';
        Chart.defaults.font.family = 'Inter, sans-serif';
    }

    renderCharts() {
        this.renderJPDonut();
        this.renderINDonut();
        this.renderUtilityLine();
    }

    getGlassStyles(canvasCtx, count, height = 300) {
        // More saturated, vibrant versions of the previous colors
        const baseColors = [
            '59, 130, 246',   // Rich Blue
            '139, 92, 246',   // Rich Purple
            '16, 185, 129',   // Rich Emerald
            '249, 115, 22',   // Rich Orange
            '6, 182, 212',    // Rich Cyan
            '236, 72, 153',   // Rich Pink
        ];

        const backgrounds = [];
        const borders = [];

        for (let i = 0; i < count; i++) {
            const rgb = baseColors[i % baseColors.length];

            // Fading glass gradient matching balance cards (increased opacity for saturation)
            const grad = canvasCtx.createLinearGradient(0, 0, 0, height);
            grad.addColorStop(0, `rgba(${rgb}, 0.75)`);
            grad.addColorStop(1, `rgba(${rgb}, 0.3)`);
            backgrounds.push(grad);

            // Solid bright stroke matching balance cards (increased to 1.0 for more pop)
            borders.push(`rgba(${rgb}, 1.0)`);
        }

        return { backgrounds, borders };
    }

    renderJPDonut() {
        const ctx = document.getElementById('jp-donut-chart');
        if (!ctx) return;

        if (this.jpDonut) this.jpDonut.destroy();

        const totals = walletManager.getCategoryTotals('JP');
        const categories = storage.state.categories.JP.filter(c => totals[c.id] > 0);

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
            options: this.getDonutOptions()
        });
    }

    renderINDonut() {
        const ctx = document.getElementById('in-donut-chart');
        if (!ctx) return;

        if (this.inDonut) this.inDonut.destroy();

        const totals = walletManager.getCategoryTotals('IN');
        const categories = storage.state.categories.IN.filter(c => totals[c.id] > 0);

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
            options: this.getDonutOptions()
        });
    }

    renderHistoryDonut(canvasId, region, totals, isPrint = false) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const categories = storage.state.categories[region].filter(c => totals[c.id] > 0);

        if (categories.length === 0) {
            return new Chart(ctx, this.getEmptyConfig('No expenses', isPrint));
        }

        const labels = categories.map(c => c.name);
        const data = categories.map(c => totals[c.id]);

        const glassStyles = this.getGlassStyles(ctx.getContext('2d'), data.length);
        
        let options = this.getDonutOptions();
        if (isPrint) {
            options.animation = false;
        }

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

    renderUtilityLine() {
        const ctx = document.getElementById('utilities-line-chart');
        if (!ctx) return;

        if (this.utilityLine) this.utilityLine.destroy();

        // Dynamically find utility categories
        const utilityCats = storage.state.categories.JP.filter(c =>
            c.id.includes('utility') ||
            c.name.toLowerCase().includes('electric') ||
            c.name.toLowerCase().includes('gas') ||
            c.name.toLowerCase().includes('water') ||
            c.name.toLowerCase().includes('internet')
        );

        const totals = walletManager.getCategoryTotals('JP');
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
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ¥${ctx.parsed.y.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#2c2c35' },
                        ticks: {
                            color: '#8b8b99',
                            callback: val => `¥${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#8b8b99', maxRotation: 30 }
                    }
                }
            }
        });
    }

    getDonutOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
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
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ¥${ctx.parsed.toLocaleString()}`
                    }
                }
            }
        };
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
}

const charts = new ChartManager();
