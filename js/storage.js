if (!window.SUPABASE_CONFIG?.storageKey) {
    throw new Error('Development storage namespace is missing.');
}

const BASE_STORAGE_KEY = window.SUPABASE_CONFIG.storageKey;

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
        this.currentUserId = null;
        this.initialSyncDone = false;
        this.state = this.loadData();
        this.isFirstLoad = !localStorage.getItem(this.getActiveStorageKey());
    }

    /**
     * Compute the active storage key scoped to the authenticated user.
     * Prevents cross-account data leakage on shared browsers.
     */
    getActiveStorageKey() {
        const userId = this.currentUserId || (typeof supabaseClient !== 'undefined' && supabaseClient.session?.user?.id);
        if (userId) {
            return `${BASE_STORAGE_KEY}_${userId}`;
        }
        return `${BASE_STORAGE_KEY}_guest`;
    }

    /**
     * Handle user login / account switch.
     * Migrates legacy un-scoped data if present, loads the user's isolated local data,
     * and prepares for Supabase cloud sync.
     */
    onUserLogin(userId) {
        if (!userId) return;

        const previousUserId = this.currentUserId;
        this.currentUserId = userId;

        const userKey = `${BASE_STORAGE_KEY}_${userId}`;

        // MIGRATION: If legacy single-user storage exists, only migrate if verified to belong to this user.
        // Prevents a new or secondary user from hijacking a previous user's legacy local data.
        const legacyData = localStorage.getItem(BASE_STORAGE_KEY);
        if (legacyData && !localStorage.getItem(userKey)) {
            let isVerifiedOwner = false;
            try {
                const projectRef = window.SUPABASE_CONFIG?.projectRef;
                const authKey = projectRef ? `sb-${projectRef}-auth-token` : null;
                const authData = authKey ? localStorage.getItem(authKey) : null;
                if (authData) {
                    const parsedAuth = JSON.parse(authData);
                    if (parsedAuth?.user?.id === userId) {
                        isVerifiedOwner = true;
                    }
                }
            } catch (e) {
                console.warn('[Storage] Error verifying legacy storage ownership:', e);
            }

            if (isVerifiedOwner) {
                console.log('[Storage] Verified ownership. Migrating legacy local storage to user-scoped key for:', userId);
                try {
                    localStorage.setItem(userKey, legacyData);
                    localStorage.removeItem(BASE_STORAGE_KEY);
                } catch (e) {
                    console.error('[Storage] Error migrating legacy storage:', e);
                }
            } else {
                console.warn('[Storage] Legacy un-scoped data detected but ownership cannot be verified for user:', userId, '- Leaving legacy data intact without assigning to this account.');
            }
        }

        // If the user changed or this is first init:
        if (previousUserId !== userId) {
            this.initialSyncDone = false;
            this.state = this.loadData();
            this.isFirstLoad = !localStorage.getItem(this.getActiveStorageKey());
        }
    }

    /**
     * Handle user logout.
     * Clears in-memory financial data and resets state to default so no data
     * bleeds into subsequent logins or unauthenticated views.
     */
    onUserLogout() {
        this.currentUserId = null;
        this.initialSyncDone = false;
        this.isFirstLoad = true;
        this.state = JSON.parse(JSON.stringify(defaultState));
    }

    loadData() {
        try {
            const key = this.getActiveStorageKey();
            const data = localStorage.getItem(key);
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
                    // Wallets: use parsed.wallets if it exists and is populated, else fallback to defaults.
                    // This prevents deleted default wallets from magically reappearing.
                    wallets: parsed.wallets && Object.keys(parsed.wallets).length > 0
                        ? parsed.wallets
                        : JSON.parse(JSON.stringify(defaultState.wallets)),
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
        if (typeof supabaseClient === 'undefined' || !supabaseClient.session || !supabaseClient.session.user) {
            // Not logged in — allow local saves to work normally
            this.initialSyncDone = true;
            return false;
        }
        
        const userId = supabaseClient.session.user.id;
        this.onUserLogin(userId);
        
        try {
            const { data, error } = await supabaseClient.client
                .from('app_state')
                .select('state, updated_at')
                .eq('user_id', userId)
                .single();
                
            if (error) {
                if (error.code === 'PGRST116') {
                    // No row exists yet for this user in cloud — push local state up
                    console.log('[Sync] No remote state found for user. Pushing local state to Supabase...');
                    this.initialSyncDone = true;
                    await this.pushToSupabase();
                } else {
                    console.error('[Sync] Error fetching from Supabase:', error);
                    this.initialSyncDone = true;
                }
                return false;
            }
            
            if (data && data.state) {
                // Validate the remote state looks real (has wallets & transactions keys)
                const remote = data.state;
                const remoteIsValid = remote && remote.wallets && Array.isArray(remote.transactions);
                
                if (this.isFirstLoad && remoteIsValid) {
                    console.log('[Sync] Fresh device/account detected. Using remote state.');
                    this.state = this.parseAndMergeData(remote);
                    this.isFirstLoad = false;
                    this.initialSyncDone = true;
                    this.checkRollover();
                    localStorage.setItem(this.getActiveStorageKey(), JSON.stringify(this.state));
                    return true;
                }

                if (!remoteIsValid) {
                    console.warn('[Sync] Remote state invalid or empty. Keeping local and pushing up.');
                    this.initialSyncDone = true;
                    await this.pushToSupabase();
                    return false;
                }

                const remoteUpdatedAt = data.updated_at ? new Date(data.updated_at) : null;
                const localUpdatedAt = this.state._updatedAt ? new Date(this.state._updatedAt) : null;

                // Count total transactions as richness tiebreaker
                const remoteTxCount = (remote.transactions || []).length
                    + (remote.history || []).reduce((s, h) => s + (h.transactions || []).length, 0);
                const localTxCount = (this.state.transactions || []).length
                    + (this.state.history || []).reduce((s, h) => s + (h.transactions || []).length, 0);

                let shouldUseRemote;
                if (remoteUpdatedAt && localUpdatedAt) {
                    shouldUseRemote = remoteUpdatedAt > localUpdatedAt;
                } else if (remoteUpdatedAt && !localUpdatedAt) {
                    // Remote has a timestamp, local doesn't — remote wins
                    shouldUseRemote = true;
                } else {
                    // No timestamps on either — more data = more complete
                    shouldUseRemote = remoteTxCount >= localTxCount;
                }

                if (shouldUseRemote) {
                    console.log(`[Sync] Remote state wins (${remoteTxCount} txs vs local ${localTxCount} txs). Loading...`);
                    this.state = this.parseAndMergeData(remote);
                    this.initialSyncDone = true;
                    this.checkRollover();
                    localStorage.setItem(this.getActiveStorageKey(), JSON.stringify(this.state));
                    return true; // signal caller to re-render
                } else {
                    console.log(`[Sync] Local state wins (${localTxCount} txs vs remote ${remoteTxCount} txs). Pushing up...`);
                    this.initialSyncDone = true;
                    await this.pushToSupabase();
                    return false;
                }
            }
        } catch (e) {
            console.error('[Sync] Supabase sync failed:', e);
            this.initialSyncDone = true;
        }
        return false;
    }

    async pushToSupabase() {
        if (typeof supabaseClient === 'undefined' || !supabaseClient.session || !supabaseClient.session.user) {
            return;
        }
        
        const userId = supabaseClient.session.user.id;
        if (!userId) return;

        // Basic payload integrity validation
        if (!this.state || !this.state.wallets || !Array.isArray(this.state.transactions)) {
            console.error("[Storage] Refusing to push invalid state payload to Supabase");
            return;
        }

        try {
            const { error } = await supabaseClient.client
                .from('app_state')
                .upsert({
                    user_id: userId,
                    state: this.state,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
                
            if (error) {
                console.error("[Sync] Failed to push to Supabase:", error);
            }
        } catch (e) {
            console.error("[Sync] Push to Supabase failed:", e);
        }
    }

    applyRealtimeUpdate(remoteState, remoteUpdatedAtStr) {
        const remoteIsValid = remoteState && remoteState.wallets && Array.isArray(remoteState.transactions);
        if (!remoteIsValid) return false;

        // Check the internal timestamp generated by the client that pushed the data
        const incomingInnerTimestamp = remoteState._updatedAt;
        const localTimestamp = this.state._updatedAt;

        // If the timestamps are exactly the same, this is an echo of our own save. Ignore it.
        if (incomingInnerTimestamp === localTimestamp) {
            return false;
        }

        const remoteTime = incomingInnerTimestamp ? new Date(incomingInnerTimestamp) : null;
        const localTime = localTimestamp ? new Date(localTimestamp) : null;

        // If the incoming data is strictly newer than our local state, apply it.
        if (remoteTime && localTime && remoteTime > localTime) {
            console.log('[Realtime] Incoming update is newer. Applying...');
            this.state = this.parseAndMergeData(remoteState);
            this.checkRollover();
            localStorage.setItem(this.getActiveStorageKey(), JSON.stringify(this.state));
            return true; // signals caller to re-render
        }
        return false;
    }

    saveData() {
        try {
            if (this.initialSyncDone || typeof supabaseClient === 'undefined' || !supabaseClient.session) {
                this.state._updatedAt = new Date().toISOString();
            }
            localStorage.setItem(this.getActiveStorageKey(), JSON.stringify(this.state));
            // Only push to Supabase after the initial sync has run.
            // This prevents a fresh device from overwriting real cloud data.
            if (this.initialSyncDone && typeof supabaseClient !== 'undefined' && supabaseClient.session?.user?.id) {
                this.pushToSupabase();
            }
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
