const STORAGE_KEY = 'em_connected_v2';

const defaultState = {
    currentMonthKey: "",
    jpTotalBudget: 150000,
    wallets: {
        'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 0, currency: '¥' },
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
            { id: 'in-loan', name: 'Loan EMI', icon: 'landmark' },
            { id: 'in-home', name: 'Home Needs', icon: 'home' },
            { id: 'in-rent', name: 'Rent', icon: 'home' },
            { id: 'in-medicine', name: 'Medicine & Health', icon: 'pill' },
            { id: 'in-eb', name: 'EB / Utility Bills', icon: 'zap' },
            { id: 'in-recharge', name: 'Recharge', icon: 'smartphone' },
            { id: 'in-ration', name: 'Ration & Groceries', icon: 'shopping-basket' },
            { id: 'in-misc', name: 'Miscellaneous', icon: 'wrench' }
        ]
    },
    loanConfig: {
        totalPrincipal: 211670,
        principalLeft: 181206.29,
        emi: 10566,
        duesPaid: 4,
        totalDues: 24,
        annualInterestRate: 17.99,
        emiDrawDate: 7
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
                // Merge top-level fields but always trust saved wallets/categories
                const mergedState = {
                    ...defaultState,
                    ...parsed,
                    // Wallets: merge defaults with saved (preserves balances)
                    wallets: { ...defaultState.wallets, ...(parsed.wallets || {}) },
                    // Categories: use saved if valid arrays, else use defaults
                    categories: {
                        JP: Array.isArray(parsed.categories?.JP) && parsed.categories.JP.length > 0
                            ? parsed.categories.JP
                            : JSON.parse(JSON.stringify(defaultState.categories.JP)),
                        IN: Array.isArray(parsed.categories?.IN) && parsed.categories.IN.length > 0
                            ? parsed.categories.IN
                            : JSON.parse(JSON.stringify(defaultState.categories.IN)),
                    }
                };
                
                if (mergedState.wallets && mergedState.wallets['Forex Card']) {
                    delete mergedState.wallets['Forex Card'];
                }
                
                // Utility Categories Reverse Migration (Undo the previous merge)
                const hasJpUtilities = mergedState.categories.JP.some(c => c.id === 'jp-utilities');
                if (hasJpUtilities) {
                    // Remove 'jp-utilities'
                    mergedState.categories.JP = mergedState.categories.JP.filter(c => c.id !== 'jp-utilities');
                    // Add the original 4 utilities back
                    const oldUtils = [
                        { id: 'jp-utility-electric', name: 'Electricity', icon: 'zap', budget: 0 },
                        { id: 'jp-utility-gas', name: 'Gas', icon: 'flame', budget: 0 },
                        { id: 'jp-utility-water', name: 'Water', icon: 'droplet', budget: 0 },
                        { id: 'jp-utility-internet', name: 'Internet', icon: 'wifi', budget: 0 }
                    ];
                    // Insert at index 4 (after Rent)
                    mergedState.categories.JP.splice(4, 0, ...oldUtils);
                    
                    // Recover transactions
                    const revMap = {
                        'Electricity': 'jp-utility-electric',
                        'Gas': 'jp-utility-gas',
                        'Water': 'jp-utility-water',
                        'Internet': 'jp-utility-internet'
                    };
                    
                    if (mergedState.transactions && mergedState.transactions.length > 0) {
                        mergedState.transactions.forEach(tx => {
                            if (tx.categoryId === 'jp-utilities' && tx.note) {
                                for (const [oldName, oldId] of Object.entries(revMap)) {
                                    if (tx.note.includes(oldName)) {
                                        tx.categoryId = oldId;
                                        // Clean up the note
                                        if (tx.note === oldName) {
                                            tx.note = '';
                                        } else if (tx.note.startsWith(`${oldName} - `)) {
                                            tx.note = tx.note.substring(oldName.length + 3);
                                        }
                                        break;
                                    }
                                }
                            }
                        });
                    }
                }
                if (!mergedState.categories.IN.some(c => c.id === 'in-loan')) {
                    mergedState.categories.IN.splice(1, 0, { id: 'in-loan', name: 'Loan EMI', icon: 'landmark' });
                }
                
                if (!mergedState.loanConfig || Object.keys(mergedState.loanConfig).length === 0) {
                    mergedState.loanConfig = defaultState.loanConfig;
                } else if (typeof mergedState.loanConfig.emiDrawDate === 'undefined') {
                    mergedState.loanConfig.emiDrawDate = 7;
                }
                
                // MIGRATION: Move Rent from JP to IN
                const jpRentIndex = mergedState.categories.JP.findIndex(c => c.id === 'jp-rent');
                if (jpRentIndex !== -1) {
                    const rentCat = mergedState.categories.JP.splice(jpRentIndex, 1)[0];
                    if (!mergedState.categories.IN.some(c => c.id === 'in-rent')) {
                        mergedState.categories.IN.push({ id: 'in-rent', name: 'Rent', icon: rentCat.icon || 'home' });
                    }
                    
                    // Update transactions
                    if (mergedState.transactions) {
                        mergedState.transactions.forEach(tx => {
                            if (tx.categoryId === 'jp-rent') {
                                tx.categoryId = 'in-rent';
                                tx.region = 'IN';
                            }
                        });
                    }
                    if (mergedState.history) {
                        mergedState.history.forEach(h => {
                            h.transactions.forEach(tx => {
                                if (tx.categoryId === 'jp-rent') {
                                    tx.categoryId = 'in-rent';
                                    tx.region = 'IN';
                                }
                            });
                        });
                    }
                }
                
                // MIGRATION: Merge duplicate history ledgers with the same monthKey
                if (mergedState.history && mergedState.history.length > 0) {
                    const uniqueHistory = [];
                    mergedState.history.forEach(snapshot => {
                        const existing = uniqueHistory.find(h => h.monthKey === snapshot.monthKey);
                        if (existing) {
                            // Merge transactions
                            existing.transactions = existing.transactions.concat(snapshot.transactions);
                        } else {
                            uniqueHistory.push(snapshot);
                        }
                    });
                    
                    // Sort descending by monthKey
                    uniqueHistory.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
                    mergedState.history = uniqueHistory;
                }
                
                return mergedState;
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

    closeCurrentMonth() {
        const monthKey = this.state.currentMonthKey;
        
        // Find existing ledger for this monthKey
        let ledger = this.state.history.find(h => h.monthKey === monthKey);
        
        if (ledger) {
            // Append transactions
            ledger.transactions = ledger.transactions.concat(this.state.transactions);
            // Update snapshot to latest wallets
            ledger.walletsSnapshot = JSON.parse(JSON.stringify(this.state.wallets));
        } else {
            // Create new ledger
            ledger = {
                monthKey: monthKey,
                transactions: JSON.parse(JSON.stringify(this.state.transactions)),
                walletsSnapshot: JSON.parse(JSON.stringify(this.state.wallets)),
                jpTotalBudget: this.state.jpTotalBudget
            };
            this.state.history.push(ledger);
            // Keep history sorted descending
            this.state.history.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        }

        // Clear current month transactions
        this.state.transactions = [];
        this.saveData();
    }

    deleteLedger(monthKey) {
        this.state.history = this.state.history.filter(h => h.monthKey !== monthKey);
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
