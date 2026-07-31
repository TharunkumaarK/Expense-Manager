const STORAGE_KEY = 'em_connected_v2';

const defaultState = {
    currentMonthKey: "",
    jpTotalBudget: 0,
    wallets: {
        'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 0, currency: '¥', color: '#009944' },
        'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 0, currency: '¥', color: '#d4af37' },
        'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', balance: 0, currency: '¥', color: '#ff0033' },
        'Bank Account': { id: 'Bank Account', type: 'bank', region: 'IN', balance: 0, currency: '₹', color: '#97144d' }
    },
    categories: {
        JP: [
            { id: 'jp-food', name: 'Food & Groceries', icon: 'shopping-basket', budget: 0 },
            { id: 'jp-dining', name: 'Dining Out', icon: 'utensils', budget: 0 },
            { id: 'jp-transport', name: 'Transport', icon: 'train-front', budget: 0 },
            { id: 'jp-utility-electric', name: 'Electricity', icon: 'zap', budget: 0 },
            { id: 'jp-utility-gas', name: 'Gas', icon: 'flame', budget: 0 },
            { id: 'jp-utility-water', name: 'Water', icon: 'droplet', budget: 0 },
            { id: 'jp-utility-internet', name: 'Internet', icon: 'wifi', budget: 0 },
            { id: 'jp-shopping', name: 'Shopping', icon: 'shopping-bag', budget: 0 },
            { id: 'jp-entertainment', name: 'Entertainment', icon: 'gamepad-2', budget: 0 },
            { id: 'jp-health', name: 'Health', icon: 'heart-pulse', budget: 0 },
            { id: 'jp-personal-care', name: 'Personal Care', icon: 'scissors', budget: 0 },
            { id: 'jp-subscriptions', name: 'Subscriptions', icon: 'smartphone', budget: 0 },
            { id: 'jp-tax', name: 'Tax & Fees', icon: 'file-text', budget: 0 },
            { id: 'jp-misc', name: 'Miscellaneous', icon: 'wrench', budget: 0 }
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
        enabled: false,
        totalPrincipal: 0,
        principalLeft: 0,
        emi: 0,
        duesPaid: 0,
        totalDues: 0,
        annualInterestRate: 0,
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
                return this.parseAndMergeData(parsed);
            }
        } catch (e) {
            console.error("Failed to load local data", e);
        }
        return JSON.parse(JSON.stringify(defaultState));
    }

    parseAndMergeData(parsed) {
        try {
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

                // MIGRATION: Add color field to wallets that don't have one
                const legacyColors = {
                    'Salary Account': '#009944', 'PayPay': '#ff0033', 'Cash': '#d4af37',
                    'Axis Bank': '#97144d', 'Bank of Baroda': '#f05a28', 'Credit Card': '#94a3b8'
                };
                Object.values(mergedState.wallets).forEach(w => {
                    if (!w.color) w.color = legacyColors[w.id] || '#3351d6';
                });
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
        } catch (e) {
            console.error("Failed to parse data", e);
        }
        return JSON.parse(JSON.stringify(defaultState));
    }

    async syncFromSupabase() {
        if (typeof supabaseClient === 'undefined' || !supabaseClient.session) return false;
        
        try {
            const { data, error } = await supabaseClient.client
                .from('app_state')
                .select('state, updated_at')
                .eq('user_id', supabaseClient.session.user.id)
                .single();
                
            if (error) {
                if (error.code === 'PGRST116') {
                    // No row exists yet — this device has the only copy, push it up
                    console.log('[Sync] No remote state found. Pushing local state to Supabase...');
                    await this.pushToSupabase();
                } else {
                    console.error('[Sync] Error fetching from Supabase:', error);
                }
                return false;
            }
            
            if (data && data.state) {
                // Validate the remote state looks real (has wallets & transactions keys)
                const remote = data.state;
                const remoteIsValid = remote && remote.wallets && Array.isArray(remote.transactions);
                
                if (!remoteIsValid) {
                    console.warn('[Sync] Remote state invalid or empty. Keeping local state.');
                    await this.pushToSupabase();
                    return false;
                }

                const remoteUpdatedAt = data.updated_at ? new Date(data.updated_at) : null;
                const localUpdatedAt = this.state._updatedAt ? new Date(this.state._updatedAt) : null;

                // Count data richness as a tiebreaker when timestamps are missing
                const remoteTxCount = (remote.transactions || []).length + (remote.history || []).reduce((s, h) => s + h.transactions.length, 0);
                const localTxCount = (this.state.transactions || []).length + (this.state.history || []).reduce((s, h) => s + h.transactions.length, 0);

                let shouldUseRemote;
                if (remoteUpdatedAt && localUpdatedAt) {
                    // Both have timestamps — trust the newer one
                    shouldUseRemote = remoteUpdatedAt > localUpdatedAt;
                } else if (remoteUpdatedAt && !localUpdatedAt) {
                    // Remote has timestamp, local doesn't — remote wins
                    shouldUseRemote = true;
                } else {
                    // No timestamps — use whichever has more transactions (more data = more complete)
                    shouldUseRemote = remoteTxCount >= localTxCount;
                }

                if (shouldUseRemote) {
                    console.log(`[Sync] Loading remote state (${remoteTxCount} txs) over local (${localTxCount} txs)`);
                    this.state = this.parseAndMergeData(remote);
                    this.checkRollover();
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
                    return true; // signal caller to re-render
                } else {
                    console.log(`[Sync] Local state (${localTxCount} txs) is newer. Pushing to Supabase...`);
                    await this.pushToSupabase();
                    return false;
                }
            }
        } catch (e) {
            console.error('[Sync] Supabase sync failed:', e);
        }
        return false;
    }

    async pushToSupabase() {
        if (typeof supabaseClient === 'undefined' || !supabaseClient.session) return;
        
        try {
            const { error } = await supabaseClient.client
                .from('app_state')
                .upsert({
                    user_id: supabaseClient.session.user.id,
                    state: this.state,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
                
            if (error) console.error("Failed to push to Supabase", error);
        } catch (e) {
            console.error("Push to supabase failed", e);
        }
    }

    saveData() {
        try {
            // Stamp the current time so sync can compare freshness
            this.state._updatedAt = new Date().toISOString();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
            this.pushToSupabase(); // Fire and forget async
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

        // --- Rollover Calculation ---
        // Pool all positive JP category savings into the overall budget cushion.
        // Individual category budgets stay fixed; only jpTotalBudget grows.
        let totalRollover = 0;
        this.state.categories.JP.forEach(cat => {
            if (!cat.budget || cat.budget <= 0) return;
            const spent = this.state.transactions
                .filter(tx => tx.type === 'expense' && tx.region === 'JP' && tx.categoryId === cat.id)
                .reduce((sum, tx) => sum + tx.amount, 0);
            const saving = cat.budget - spent;
            if (saving > 0) totalRollover += saving;
        });

        // Find existing ledger for this monthKey
        let ledger = this.state.history.find(h => h.monthKey === monthKey);

        if (ledger) {
            // Append transactions
            ledger.transactions = ledger.transactions.concat(this.state.transactions);
            // Update snapshot to latest wallets
            ledger.walletsSnapshot = JSON.parse(JSON.stringify(this.state.wallets));
        } else {
            // Snapshot the budget BEFORE rollover is applied (historical record)
            ledger = {
                monthKey: monthKey,
                transactions: JSON.parse(JSON.stringify(this.state.transactions)),
                walletsSnapshot: JSON.parse(JSON.stringify(this.state.wallets)),
                jpTotalBudget: this.state.jpTotalBudget,
                jpRolloverAdded: Math.round(totalRollover)
            };
            this.state.history.push(ledger);
            this.state.history.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        }

        // Add savings to next month's overall budget as cushion
        if (totalRollover > 0) {
            this.state.jpTotalBudget += Math.round(totalRollover);
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
