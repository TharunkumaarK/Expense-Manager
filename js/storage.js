if (!window.SUPABASE_CONFIG?.storageKey) {
    throw new Error('Development storage namespace is missing.');
}

const BASE_STORAGE_KEY = window.SUPABASE_CONFIG.storageKey;

const defaultState = {
    schemaVersion: 3,
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
    closedMonths: {},
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
                let mergedState = {
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
                            if (Array.isArray(snapshot.transactions)) {
                                existing.transactions = (existing.transactions || []).concat(snapshot.transactions);
                            }
                        } else {
                            uniqueHistory.push(snapshot);
                        }
                    });
                    
                    // Sort descending by monthKey
                    uniqueHistory.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
                    mergedState.history = uniqueHistory;
                }
                
                // MIGRATION: Migrate to Continuous Ledger (v3)
                mergedState = this.migrateToContinuousLedger(mergedState);
                if (mergedState.closedMonths) {
                    mergedState.history = Object.values(mergedState.closedMonths).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
                }
                this._attachHistoryGetters(mergedState);

                return mergedState;
        } catch (e) {
            console.error("Failed to parse data", e);
        }
        return JSON.parse(JSON.stringify(defaultState));
    }

    /**
     * Attach backward-compatible non-enumerable getters to history entries
     * so legacy views reading h.transactions dynamically query the continuous ledger
     * without duplicating transaction data in serialized JSON.
     */
    _attachHistoryGetters(state) {
        if (!state || !Array.isArray(state.history)) return;
        state.history.forEach(h => {
            if (h && typeof h === 'object') {
                const desc = Object.getOwnPropertyDescriptor(h, 'transactions');
                if (!desc || desc.configurable) {
                    Object.defineProperty(h, 'transactions', {
                        get() {
                            if (!state.transactions) return [];
                            return state.transactions.filter(t => t.date && t.date.startsWith(this.monthKey));
                        },
                        enumerable: false,
                        configurable: true
                    });
                }
            }
        });
    }

    /**
     * Migrate state to Continuous Transaction Ledger (Schema v3).
     * Idempotent, safe, preserves historical metadata and does not mutate wallet balances.
     */
    migrateToContinuousLedger(state) {
        if (!state) return state;

        const hasHistoryTransactions = Array.isArray(state.history) &&
            state.history.some(h => {
                const desc = Object.getOwnPropertyDescriptor(h, 'transactions');
                return desc && Array.isArray(desc.value) && desc.value.length > 0;
            });

        // If already migrated to v3 and has no raw nested transactions in history, return idempotently
        if (state.schemaVersion >= 3 && !hasHistoryTransactions && state.closedMonths) {
            this._attachHistoryGetters(state);
            return state;
        }

        console.log('[Migration] Migrating state to Continuous Transaction Ledger (v3)...');

        // 1. Safety Backup: save untouched copy before modifying
        try {
            const backupKey = `${this.getActiveStorageKey()}_backup_pre_v3`;
            if (typeof localStorage !== 'undefined' && !localStorage.getItem(backupKey)) {
                localStorage.setItem(backupKey, JSON.stringify(state));
                console.log('[Migration] Safety backup saved to:', backupKey);
            }
        } catch (e) {
            console.warn('[Migration] Could not save safety backup:', e);
        }

        // 2. Snapshot pre-migration wallet balances for invariant validation
        const preBalances = {};
        if (state.wallets) {
            Object.keys(state.wallets).forEach(wId => {
                preBalances[wId] = state.wallets[wId].balance;
            });
        }

        // 3. Collect transactions and detect conflicting duplicate IDs
        const continuousTransactions = [];
        const seenTxIds = new Map();
        const closedMonths = state.closedMonths ? { ...state.closedMonths } : {};

        // Canonical comparison of all semantically meaningful transaction properties
        function areTransactionsConflicting(tx1, tx2) {
            // Numerical comparisons
            const numFields = ['amount', 'sourceAmount', 'destAmount'];
            for (const f of numFields) {
                const v1 = tx1[f];
                const v2 = tx2[f];
                if (v1 !== undefined || v2 !== undefined) {
                    if (Number(v1) !== Number(v2)) {
                        return `Conflicting numerical field "${f}": ${v1} !== ${v2}`;
                    }
                }
            }

            // Note & description
            const note1 = (tx1.note ?? tx1.description ?? '').toString().trim();
            const note2 = (tx2.note ?? tx2.description ?? '').toString().trim();
            if (note1 !== note2) {
                return `Conflicting note/description: "${note1}" !== "${note2}"`;
            }

            // Category
            const cat1 = (tx1.categoryId ?? tx1.category ?? '').toString().trim();
            const cat2 = (tx2.categoryId ?? tx2.category ?? '').toString().trim();
            if (cat1 !== cat2) {
                return `Conflicting category: "${cat1}" !== "${cat2}"`;
            }

            // Exchange rate
            if (tx1.exchangeRate !== undefined || tx2.exchangeRate !== undefined) {
                const r1 = tx1.exchangeRate != null ? Number(tx1.exchangeRate).toFixed(4) : '';
                const r2 = tx2.exchangeRate != null ? Number(tx2.exchangeRate).toFixed(4) : '';
                if (r1 !== r2) {
                    return `Conflicting exchangeRate: "${tx1.exchangeRate}" !== "${tx2.exchangeRate}"`;
                }
            }

            // Currencies
            const curFields = ['currency', 'sourceCurrency', 'destCurrency'];
            for (const f of curFields) {
                const c1 = (tx1[f] ?? '').toString().trim();
                const c2 = (tx2[f] ?? '').toString().trim();
                if (c1 !== c2) {
                    return `Conflicting currency field "${f}": "${c1}" !== "${c2}"`;
                }
            }

            // Wallets & transfer endpoints
            const walletFields = ['walletId', 'sourceId', 'destId'];
            for (const f of walletFields) {
                const w1 = (tx1[f] ?? '').toString().trim();
                const w2 = (tx2[f] ?? '').toString().trim();
                if (w1 !== w2) {
                    return `Conflicting wallet/endpoint field "${f}": "${w1}" !== "${w2}"`;
                }
            }

            // Type, region, and date
            const strFields = ['type', 'date', 'region'];
            for (const f of strFields) {
                const s1 = (tx1[f] ?? '').toString().trim();
                const s2 = (tx2[f] ?? '').toString().trim();
                if (s1 !== s2) {
                    return `Conflicting field "${f}": "${s1}" !== "${s2}"`;
                }
            }

            // Compare all remaining fields (including arbitrary unknown metadata)
            const allKeys = new Set([...Object.keys(tx1), ...Object.keys(tx2)]);
            const handledKeys = new Set([
                'id',
                'amount', 'sourceAmount', 'destAmount',
                'note', 'description',
                'categoryId', 'category',
                'exchangeRate',
                'currency', 'sourceCurrency', 'destCurrency',
                'walletId', 'sourceId', 'destId',
                'type', 'date', 'region',
                'updatedAt'
            ]);

            for (const key of allKeys) {
                if (handledKeys.has(key)) continue;
                const v1 = tx1[key];
                const v2 = tx2[key];

                if (typeof v1 === 'object' && v1 !== null && typeof v2 === 'object' && v2 !== null) {
                    if (JSON.stringify(v1) !== JSON.stringify(v2)) {
                        return `Conflicting object field "${key}": ${JSON.stringify(v1)} !== ${JSON.stringify(v2)}`;
                    }
                } else if (v1 !== v2) {
                    return `Conflicting field "${key}": "${v1}" !== "${v2}"`;
                }
            }

            return null; // Identical duplicate
        }

        const ingestTransaction = (tx, source) => {
            if (!tx || !tx.id) return;

            const existing = seenTxIds.get(tx.id);
            if (existing) {
                const conflictReason = areTransactionsConflicting(existing, tx);
                if (conflictReason) {
                    console.error('[Migration] CONFLICT DETECTED on transaction ID:', tx.id, {
                        reason: conflictReason,
                        existing,
                        duplicate: tx,
                        source
                    });
                    throw new Error(`Migration conflict detected on transaction ID "${tx.id}" (${conflictReason}). Halting to prevent data corruption.`);
                }
                // Identical duplicate — skip safely
                return;
            }

            const cloned = { ...tx };
            seenTxIds.set(cloned.id, cloned);
            continuousTransactions.push(cloned);
        };

        // Ingest active transactions first
        if (Array.isArray(state.transactions)) {
            state.transactions.forEach(tx => ingestTransaction(tx, 'active'));
        }

        // Ingest historical transactions and preserve metadata
        if (Array.isArray(state.history)) {
            state.history.forEach(h => {
                if (!h || !h.monthKey) return;

                const desc = Object.getOwnPropertyDescriptor(h, 'transactions');
                const rawTxList = desc && Array.isArray(desc.value) ? desc.value : null;
                if (rawTxList) {
                    rawTxList.forEach(tx => ingestTransaction(tx, `history_${h.monthKey}`));
                }

                // Preserve ALL archive metadata properties, safely excluding only nested transactions
                const { transactions, ...archiveMetadata } = h;

                // Apply defaults ONLY when a field is genuinely absent (undefined)
                if (!closedMonths[h.monthKey]) {
                    closedMonths[h.monthKey] = {
                        ...archiveMetadata,
                        monthKey: h.monthKey,
                        label: archiveMetadata.label !== undefined ? archiveMetadata.label : h.monthKey,
                        closedAt: archiveMetadata.closedAt !== undefined ? archiveMetadata.closedAt : `${h.monthKey}-28T23:59:59.000Z`,
                        walletsSnapshot: archiveMetadata.walletsSnapshot !== undefined 
                            ? (archiveMetadata.walletsSnapshot ? JSON.parse(JSON.stringify(archiveMetadata.walletsSnapshot)) : null)
                            : null,
                        jpTotalBudget: archiveMetadata.jpTotalBudget !== undefined 
                            ? archiveMetadata.jpTotalBudget 
                            : (archiveMetadata.budget !== undefined ? archiveMetadata.budget : 0),
                        jpRolloverAdded: archiveMetadata.jpRolloverAdded !== undefined ? archiveMetadata.jpRolloverAdded : 0,
                        budgetLimits: archiveMetadata.budgetLimits !== undefined ? archiveMetadata.budgetLimits : null,
                        status: archiveMetadata.status !== undefined ? archiveMetadata.status : 'closed'
                    };
                } else {
                    // Merge any additional fields if closedMonths[h.monthKey] was already partially populated
                    closedMonths[h.monthKey] = {
                        ...archiveMetadata,
                        ...closedMonths[h.monthKey]
                    };
                }
            });
        }

        // 4. Chronological sort (newest first, secondary sort by ID)
        continuousTransactions.sort((a, b) => {
            const dateCmp = (b.date || '').localeCompare(a.date || '');
            if (dateCmp !== 0) return dateCmp;
            return String(b.id).localeCompare(String(a.id));
        });

        // 5. Validation
        if (!Array.isArray(continuousTransactions)) {
            throw new Error('Migration validation failed: continuousTransactions is not an array.');
        }

        if (state.wallets) {
            Object.keys(preBalances).forEach(wId => {
                if (state.wallets[wId].balance !== preBalances[wId]) {
                    throw new Error(`Migration validation failed: Balance altered for wallet "${wId}". Expected ${preBalances[wId]}, got ${state.wallets[wId].balance}`);
                }
            });
        }

        // 6. Apply migration to state
        state.transactions = continuousTransactions;
        state.closedMonths = closedMonths;

        // Reconstruct history array as closed months metadata list
        state.history = Object.values(closedMonths).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        this._attachHistoryGetters(state);

        // 7. Update version
        state.schemaVersion = 3;
        state._updatedAt = new Date().toISOString();

        console.log(`[Migration] Successfully migrated: ${state.transactions.length} total transactions, ${Object.keys(closedMonths).length} closed months.`);
        return state;
    }

    /**
     * Compute actual unique transaction count without double-counting compatibility getters.
     * Works identically across v3 (continuous ledger) and v2 (partitioned archives).
     */
    getUniqueTransactionCount(state) {
        if (!state) return 0;
        const activeCount = Array.isArray(state.transactions) ? state.transactions.length : 0;
        let historyRawCount = 0;
        if (Array.isArray(state.history)) {
            state.history.forEach(h => {
                if (!h) return;
                const desc = Object.getOwnPropertyDescriptor(h, 'transactions');
                // Only count if it's an OWN property raw array (v2 legacy partitioned schema), NEVER a getter
                if (desc && Array.isArray(desc.value)) {
                    historyRawCount += desc.value.length;
                }
            });
        }
        return activeCount + historyRawCount;
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
                
                const key = this.getActiveStorageKey();
                const backupKey = `${key}_backup_pre_v3`;
                const remoteNeedsMigration = remote && (!remote.schemaVersion || remote.schemaVersion < 3 || 
                    (Array.isArray(remote.history) && remote.history.some(h => {
                        const desc = Object.getOwnPropertyDescriptor(h, 'transactions');
                        return desc && Array.isArray(desc.value) && desc.value.length > 0;
                    })));

                if (this.isFirstLoad && remoteIsValid) {
                    console.log('[Sync] Fresh device/account detected. Using remote state.');
                    if (remoteNeedsMigration && typeof localStorage !== 'undefined') {
                        try {
                            localStorage.setItem(backupKey, JSON.stringify(remote));
                            console.log('[Sync] Fresh account authoritative remote backup saved to:', backupKey);
                        } catch (e) {
                            console.warn('[Sync] Could not save remote backup:', e);
                        }
                    }

                    let migratedRemote;
                    try {
                        migratedRemote = this.parseAndMergeData(remote);
                    } catch (e) {
                        console.error('[Sync] Fresh load remote migration failed. Aborting:', e);
                        this.initialSyncDone = true;
                        return false;
                    }

                    const isValidMigrated = migratedRemote &&
                        migratedRemote.wallets &&
                        Array.isArray(migratedRemote.transactions) &&
                        migratedRemote.closedMonths &&
                        migratedRemote.schemaVersion >= 3;

                    if (!isValidMigrated) {
                        console.error('[Sync] Migrated remote state failed validation on fresh load.');
                        this.initialSyncDone = true;
                        return false;
                    }

                    this.state = migratedRemote;
                    this.isFirstLoad = false;
                    this.initialSyncDone = true;
                    this.checkRollover();
                    localStorage.setItem(this.getActiveStorageKey(), JSON.stringify(this.state));

                    if (remoteNeedsMigration) {
                        await this.pushToSupabase();
                    }
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

                // Count unique transactions as richness tiebreaker without getter double-counting
                const remoteTxCount = this.getUniqueTransactionCount(remote);
                const localTxCount = this.getUniqueTransactionCount(this.state);

                let shouldUseRemote;
                if (remoteUpdatedAt && localUpdatedAt) {
                    shouldUseRemote = remoteUpdatedAt > localUpdatedAt;
                } else if (remoteUpdatedAt && !localUpdatedAt) {
                    // Remote has a timestamp, local doesn't — remote wins
                    shouldUseRemote = true;
                } else {
                    // No timestamps on either — more unique data = more complete
                    shouldUseRemote = remoteTxCount >= localTxCount;
                }

                if (shouldUseRemote) {
                    console.log(`[Sync] Remote state wins (${remoteTxCount} txs vs local ${localTxCount} txs). Loading...`);
                    
                    // Preserve untouched authoritative pre-migration remote backup
                    if (remoteNeedsMigration && typeof localStorage !== 'undefined') {
                        try {
                            localStorage.setItem(backupKey, JSON.stringify(remote));
                            console.log('[Sync] Authoritative remote pre-migration backup saved to:', backupKey);
                        } catch (e) {
                            console.warn('[Sync] Could not save remote backup:', e);
                        }
                    }

                    // Attempt migration of authoritative remote state
                    let migratedRemote;
                    try {
                        migratedRemote = this.parseAndMergeData(remote);
                    } catch (e) {
                        console.error('[Sync] Migration of authoritative remote state failed. Halting sync:', e);
                        this.initialSyncDone = true;
                        return false;
                    }

                    // Validate migrated state before persisting
                    const isValidMigrated = migratedRemote &&
                        migratedRemote.wallets &&
                        Array.isArray(migratedRemote.transactions) &&
                        migratedRemote.closedMonths &&
                        migratedRemote.schemaVersion >= 3;

                    if (!isValidMigrated) {
                        console.error('[Sync] Migrated remote state failed validation. Aborting sync.');
                        this.initialSyncDone = true;
                        return false;
                    }

                    this.state = migratedRemote;
                    this.initialSyncDone = true;
                    this.checkRollover();
                    localStorage.setItem(this.getActiveStorageKey(), JSON.stringify(this.state));

                    // Push migrated v3 state to Supabase only after successful validation
                    if (remoteNeedsMigration) {
                        await this.pushToSupabase();
                    }

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
        if (this.state.categories && Array.isArray(this.state.categories.JP)) {
            this.state.categories.JP.forEach(cat => {
                if (!cat.budget || cat.budget <= 0) return;
                const spent = this.state.transactions
                    .filter(tx => tx.type === 'expense' && tx.region === 'JP' && tx.categoryId === cat.id && (tx.date || '').startsWith(monthKey))
                    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
                const saving = cat.budget - spent;
                if (saving > 0) totalRollover += saving;
            });
        }

        if (!this.state.closedMonths) {
            this.state.closedMonths = {};
        }

        // Record month snapshot in closedMonths
        this.state.closedMonths[monthKey] = {
            monthKey: monthKey,
            label: monthKey,
            closedAt: new Date().toISOString(),
            walletsSnapshot: JSON.parse(JSON.stringify(this.state.wallets)),
            jpTotalBudget: this.state.jpTotalBudget,
            jpRolloverAdded: Math.round(totalRollover),
            status: 'closed'
        };

        // Derive history view directly from closedMonths so they share identical object references
        this.state.history = Object.values(this.state.closedMonths).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        this._attachHistoryGetters(this.state);

        // Add savings to next month's overall budget as cushion
        if (totalRollover > 0) {
            this.state.jpTotalBudget += Math.round(totalRollover);
        }

        // GUARD: Continuous Ledger must NEVER clear this.state.transactions!
        // All transactions remain in the continuous collection.
        this.saveData();
    }

    deleteLedger(monthKey) {
        if (this.state.closedMonths) {
            delete this.state.closedMonths[monthKey];
            this.state.history = Object.values(this.state.closedMonths).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        } else if (Array.isArray(this.state.history)) {
            this.state.history = this.state.history.filter(h => h.monthKey !== monthKey);
        }
        this._attachHistoryGetters(this.state);
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
