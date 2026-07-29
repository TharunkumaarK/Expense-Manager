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
        
        this.jpDonut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#6b4cff', '#0a84ff', '#32d74b', '#ff9f0a', '#ff453a', 
                        '#bf5af2', '#ff375f', '#5e5ce6', '#30d158', '#ffd60a'
                    ],
                    borderWidth: 0,
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
        
        this.inDonut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#ff9f0a', '#ff453a', '#bf5af2', '#6b4cff', '#0a84ff', '#32d74b'
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: this.getDonutOptions()
        });
    }

    renderUtilityLine() {
        const ctx = document.getElementById('utilities-line-chart');
        if (!ctx) return;

        if (this.utilityLine) this.utilityLine.destroy();

        // For simplicity, we just aggregate the current month data for utilities
        // To build a true month-over-month, we'd need to parse history.
        // Let's do a simple bar chart of utility spending for this month for now.
        const utilityIds = ['jp-utility-electric', 'jp-utility-gas', 'jp-utility-water', 'jp-utility-internet'];
        const totals = walletManager.getCategoryTotals('JP');
        
        const labels = ['Electric', 'Gas', 'Water', 'Internet'];
        const data = utilityIds.map(id => totals[id] || 0);

        this.utilityLine = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Spent (¥)',
                    data: data,
                    backgroundColor: ['#ffd60a', '#ff9f0a', '#0a84ff', '#bf5af2'],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#2c2c35' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    getDonutOptions() {
        return {
            responsive: true,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#f0f0f5', boxWidth: 12, padding: 10 }
                }
            }
        };
    }
    
    getEmptyConfig(message) {
        return {
            type: 'doughnut',
            data: {
                labels: [message],
                datasets: [{ data: [1], backgroundColor: ['#2c2c35'], borderWidth: 0 }]
            },
            options: {
                responsive: true,
                cutout: '70%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        };
    }
}

const charts = new ChartManager();
