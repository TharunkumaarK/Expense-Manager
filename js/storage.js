const STORAGE_KEY = 'em_connected_v2';

const defaultState = {
    currentMonthKey: "",
    jpTotalBudget: 150000,
    wallets: {
        'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 0, currency: '¥' },
        'Forex Card': { id: 'Forex Card', type: 'card', region: 'JP', balance: 34843, currency: '¥' },
        'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 7000, currency: '¥' },
        'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', balance: 0, currency: '¥' },
        'Axis Bank': { id: 'Axis Bank', type: 'bank', region: 'IN', balance: 17084, currency: '₹' },
        'Bank of Baroda': { id: 'Bank of Baroda', type: 'bank', region: 'IN', balance: 23485, currency: '₹' },
        'Credit Card': { id: 'Credit Card', type: 'card', region: 'IN', balance: 0, currency: '₹' }
    },
    categories: {
        JP: [
            { id: 'jp-food', name: 'Food & Groceries', icon: 'shopping-basket', budget: 30000 },
            { id: 'jp-dining', name: 'Dining Out', icon: 'utensils', budget: 10000 },
            { id: 'jp-transport', name: 'Transport', icon: 'train-front', budget: 15000 },
            { id: 'jp-rent', name: 'Rent', icon: 'home', budget: 50000 },
            { id: 'jp-utility-electric', name: 'Electricity', icon: 'zap', budget: 0 },
            { id: 'jp-utility-gas', name: 'Gas', icon: 'flame', budget: 0 },
            { id: 'jp-utility-water', name: 'Water', icon: 'droplet', budget: 0 },
            { id: 'jp-utility-internet', name: 'Internet', icon: 'wifi', budget: 0 },
            { id: 'jp-shopping', name: 'Shopping', icon: 'shopping-bag', budget: 15000 },
            { id: 'jp-entertainment', name: 'Entertainment', icon: 'gamepad-2', budget: 10000 },
            { id: 'jp-health', name: 'Health', icon: 'heart-pulse', budget: 5000 },
            { id: 'jp-personal-care', name: 'Personal Care', icon: 'scissors', budget: 5000 },
            { id: 'jp-subscriptions', name: 'Subscriptions', icon: 'smartphone', budget: 3000 },
            { id: 'jp-tax', name: 'Tax & Fees', icon: 'file-text', budget: 2000 },
            { id: 'jp-misc', name: 'Miscellaneous', icon: 'wrench', budget: 5000 }
        ],
        IN: [
            { id: 'in-petrol', name: 'Petrol', icon: 'fuel' },
            { id: 'in-home', name: 'Home Needs', icon: 'home' },
            { id: 'in-medicine', name: 'Medicine & Health', icon: 'pill' },
            { id: 'in-eb', name: 'EB / Utility Bills', icon: 'zap' },
            { id: 'in-recharge', name: 'Recharge', icon: 'smartphone' },
            { id: 'in-ration', name: 'Ration & Groceries', icon: 'shopping-basket' },
            { id: 'in-misc', name: 'Miscellaneous', icon: 'wrench' }
        ]
    },
    transactions: [],
    history: []
};

class StorageManager {
    constructor() {
        this.state = this.loadData();
        this.checkRollover();
    }

    loadData() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                // Merge with default to ensure new fields are present
                return { ...defaultState, ...parsed, wallets: { ...defaultState.wallets, ...parsed.wallets }, categories: { ...defaultState.categories, ...parsed.categories } };
            }
        } catch (e) {
            console.error("Failed to load data", e);
        }
        return JSON.parse(JSON.stringify(defaultState));
    }

    saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        } catch (e) {
            console.error("Failed to save data", e);
        }
    }

    getCurrentMonthKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    checkRollover() {
        const actualMonth = this.getCurrentMonthKey();
        if (!this.state.currentMonthKey) {
            this.state.currentMonthKey = actualMonth;
            this.saveData();
            return;
        }

        if (this.state.currentMonthKey !== actualMonth) {
            this.closeCurrentMonth("Auto Rollover");
            this.state.currentMonthKey = actualMonth;
            this.saveData();
        }
    }

    closeCurrentMonth(labelSuffix = "Manual Snapshot") {
        const monthKey = this.state.currentMonthKey;
        const d = new Date();
        const dateString = d.toLocaleDateString("en-GB", { month: "short", year: "numeric", day: "2-digit" });
        
        // Deep copy required data
        const snapshot = {
            id: `${monthKey}_${Date.now()}`,
            label: `${monthKey} (${labelSuffix} - ${dateString})`,
            monthKey: monthKey,
            transactions: JSON.parse(JSON.stringify(this.state.transactions)),
            walletsSnapshot: JSON.parse(JSON.stringify(this.state.wallets)),
            jpTotalBudget: this.state.jpTotalBudget
        };

        this.state.history.unshift(snapshot);
        // Clear current month transactions
        this.state.transactions = [];
        this.saveData();
    }

    exportJSON() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state, null, 2));
        const anchor = document.createElement('a');
        anchor.setAttribute("href", dataStr);
        anchor.setAttribute("download", `ExpenseManager_Backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(anchor); 
        anchor.click(); 
        anchor.remove();
    }

    importJSON(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed.wallets && parsed.transactions) {
                    this.state = parsed;
                    this.saveData();
                    callback(true);
                } else {
                    callback(false);
                }
            } catch (err) {
                callback(false);
            }
        };
        reader.readAsText(file);
    }
}

const storage = new StorageManager();
