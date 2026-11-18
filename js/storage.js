if (!window.SUPABASE_CONFIG?.storageKey) {
    throw new Error('Storage namespace is missing from configuration.');
}

const BASE_STORAGE_KEY = window.SUPABASE_CONFIG.storageKey;

const defaultState = {
    schemaVersion: 3,
    currentMonthKey: "",
    jpTotalBudget: 0,
    inTotalBudget: 0,
    preferences: {
        version: 1,
        activeCountries: ['JP', 'IN'],
        defaultCountry: 'JP',
        onboardingCompleted: false,
        onboardingStep: 1,
        tourCompleted: false,
        tourDismissed: false,
        theme: 'dark'
    },
    budgets: {
        JP: { enabled: true, monthlyTotal: 0, rolloverEnabled: true },
        IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false },
        DE: { enabled: false, monthlyTotal: 0, rolloverEnabled: false }
    },
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
        ],
        DE: [
            { id: 'de-groceries', name: 'Groceries & Supermarket', icon: 'shopping-basket', budget: 0 },
            { id: 'de-dining', name: 'Dining & Cafes', icon: 'utensils', budget: 0 },
            { id: 'de-transport', name: 'Public Transit & Train', icon: 'train-front', budget: 0 },
            { id: 'de-rent', name: 'Rent & Housing', icon: 'home', budget: 0 },
            { id: 'de-utilities', name: 'Electricity & Heating', icon: 'zap', budget: 0 },
            { id: 'de-internet', name: 'Internet & Mobile', icon: 'wifi', budget: 0 },
            { id: 'de-insurance', name: 'Insurance', icon: 'shield-check', budget: 0 },
            { id: 'de-health', name: 'Health & Pharmacy', icon: 'pill', budget: 0 },
            { id: 'de-leisure', name: 'Leisure & Subscriptions', icon: 'gamepad-2', budget: 0 },
            { id: 'de-shopping', name: 'Shopping & Household', icon: 'shopping-bag', budget: 0 },
            { id: 'de-misc', name: 'Miscellaneous', icon: 'wrench', budget: 0 }
        ]
    },
    loanConfig: {
        enabled: false,
        country: 'IN',
        currency: '₹',
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
    reportSnapshots: {},
    userProfile: {
        displayName: ''
    },
    regionalPreferences: {
        defaultCountry: 'JP',
        defaultCurrency: 'JPY',
        dateFormat: 'YYYY-MM-DD',
        weekStart: 'monday',
        numberFormat: 'standard',
        timezone: 'Asia/Tokyo'
    },
    privacyPreferences: {
        defaultConcealed: true,
        timeoutMinutes: 3
    },
    history: []
};

class StorageManager {
    constructor() {
        this.currentUserId = null;
        this.initialSyncDone = false;
        this.accountStatus = 'UNRESOLVED';
        this.cloudSyncStatus = 'IDLE';
        this.syncError = null;
        this.state = this.loadData();
        this._attachBudgetAccessors(this.state);
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
            this.accountStatus = 'UNRESOLVED';
            this.cloudSyncStatus = 'IDLE';
            this.syncError = null;
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
        this.accountStatus = 'UNRESOLVED';
        this.cloudSyncStatus = 'IDLE';
        this.syncError = null;
        this.isFirstLoad = true;
        this.state = JSON.parse(JSON.stringify(defaultState));
        this._attachBudgetAccessors(this.state);
    }

    loadData() {
        try {
            const key = this.getActiveStorageKey();
            const data = localStorage.getItem(key);
            if (data) {
                const parsed = JSON.parse(data);
                const preview = this.previewContinuousLedgerMigration(parsed);
                if (preview.success) {
                    this._attachHistoryGetters(preview.migratedState);
                    this._attachBudgetAccessors(preview.migratedState);
                    return preview.migratedState;
                } else {
                    console.error('[Storage] Local data migration validation failed. Safe-halting storage load:', preview.error);
                    this.migrationError = preview.error;
                    const safeHaltedState = JSON.parse(JSON.stringify(defaultState));
                    safeHaltedState._haltedMigration = true;
                    this._attachBudgetAccessors(safeHaltedState);
                    return safeHaltedState;
                }
            }
        } catch (e) {
            console.error("Failed to load local data", e);
        }
        const fallbackState = JSON.parse(JSON.stringify(defaultState));
        this._attachBudgetAccessors(fallbackState);
        return fallbackState;
    }

    parseAndMergeData(parsed) {
        const preview = this.previewContinuousLedgerMigration(parsed);
        if (!preview.success) {
            console.error('[Storage] parseAndMergeData validation failed:', preview.error);
            throw new Error(preview.error);
        }
        this._attachHistoryGetters(preview.migratedState);
        this._attachBudgetAccessors(preview.migratedState);
        return preview.migratedState;
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
     * Attach synchronized getters and setters for legacy budget properties
     * (jpTotalBudget and inTotalBudget) mapping directly to budgets.JP and budgets.IN.
     * Guarantees that legacy direct assignments and new multi-country budget methods
     * are always 100% synchronized and serialize identically into JSON.
     * @param {Object} state
     */
    _attachBudgetAccessors(state) {
        if (!state || typeof state !== 'object' || !state.budgets) return;

        const descJp = Object.getOwnPropertyDescriptor(state, 'jpTotalBudget');
        if (!descJp || descJp.configurable) {
            Object.defineProperty(state, 'jpTotalBudget', {
                get() {
                    return (this.budgets && this.budgets.JP) ? Number(this.budgets.JP.monthlyTotal) || 0 : 0;
                },
                set(val) {
                    const num = Number(val) || 0;
                    if (!this.budgets) this.budgets = {};
                    if (!this.budgets.JP) {
                        this.budgets.JP = { enabled: true, monthlyTotal: num, rolloverEnabled: true };
                    } else {
                        this.budgets.JP.monthlyTotal = num;
                    }
                },
                enumerable: true,
                configurable: true
            });
        }

        const descIn = Object.getOwnPropertyDescriptor(state, 'inTotalBudget');
        if (!descIn || descIn.configurable) {
            Object.defineProperty(state, 'inTotalBudget', {
                get() {
                    return (this.budgets && this.budgets.IN) ? Number(this.budgets.IN.monthlyTotal) || 0 : 0;
                },
                set(val) {
                    const num = Number(val) || 0;
                    if (!this.budgets) this.budgets = {};
                    if (!this.budgets.IN) {
                        this.budgets.IN = { enabled: num > 0, monthlyTotal: num, rolloverEnabled: false };
                    } else {
                        this.budgets.IN.monthlyTotal = num;
                    }
                },
                enumerable: true,
                configurable: true
            });
        }
    }

    /**
     * Check if a state contains established user financial records.
     * Used to safely distinguish between truly new accounts and existing accounts.
     * Guaranteed pure: does NOT mutate state.
     * @param {Object} state
     * @returns {boolean}
     */
    hasEstablishedFinancialData(state) {
        if (!state || typeof state !== 'object') return false;

        // 1. Has any transactions (active or in historical archives)
        const txCount = this.getUniqueTransactionCount(state);
        if (txCount > 0) return true;

        // 2. Has any closed months in history
        if (state.closedMonths && Object.keys(state.closedMonths).length > 0) return true;
        if (Array.isArray(state.history) && state.history.length > 0) return true;

        // 3. Has wallets with non-zero balance or custom wallet IDs
        if (state.wallets && typeof state.wallets === 'object') {
            const walletsList = Object.values(state.wallets);
            const hasNonZeroBalance = walletsList.some(w => w && Number(w.balance) !== 0);
            if (hasNonZeroBalance) return true;

            const defaultWalletIds = new Set(['Salary Account', 'Cash', 'PayPay', 'Bank Account']);
            const hasCustomWallet = walletsList.some(w => w && w.id && !defaultWalletIds.has(w.id));
            if (hasCustomWallet) return true;
        }

        // 4. Has custom budget limits configured
        if (Number(state.jpTotalBudget) > 0 || Number(state.inTotalBudget) > 0) return true;
        if (state.budgets && typeof state.budgets === 'object') {
            const anyBudgetConfigured = Object.values(state.budgets).some(b => b && Number(b.monthlyTotal) > 0);
            if (anyBudgetConfigured) return true;
        }

        // 5. Has active loan configuration
        if (state.loanConfig && (state.loanConfig.enabled || Number(state.loanConfig.totalPrincipal) > 0)) {
            return true;
        }

        return false;
    }

    /**
     * Determine if a state represents an established legacy account with real financial data.
     * Draft onboarding states (preferences.onboardingCompleted === false) are strictly excluded,
     * ensuring opening balances or draft inputs are never mistaken for established accounts.
     *
     * @param {Object} state
     * @returns {boolean}
     */
    isEstablishedLegacyFinancialData(state) {
        if (!state || typeof state !== 'object') return false;

        // If explicitly marked as incomplete onboarding, this is draft configuration, NOT established legacy data
        if (state.preferences && state.preferences.onboardingCompleted === false) {
            // An incomplete onboarding session is only considered to have established data if it contains
            // actual persisted transaction history from a continuous ledger
            return this.getUniqueTransactionCount(state) > 0 ||
                Boolean(state.closedMonths && Object.keys(state.closedMonths).length > 0) ||
                Boolean(Array.isArray(state.history) && state.history.length > 0);
        }

        // If onboarding was already marked complete, it is an established configuration
        if (state.preferences && state.preferences.onboardingCompleted === true) {
            return true;
        }

        // For legacy states lacking a preferences object (pre-v3 envelopes):
        return this.hasEstablishedFinancialData(state);
    }

    /**
     * Check if a state is currently in draft (in-progress/interrupted) onboarding.
     * Requires that onboarding is uncompleted AND user has made draft progress
     * (e.g. advanced past step 1, or entered custom configuration/balances).
     * @param {Object} state
     * @returns {boolean}
     */
    isDraftOnboardingConfiguration(state) {
        if (!state || typeof state !== 'object') return false;
        if (!state.preferences || state.preferences.onboardingCompleted !== false) {
            return false;
        }
        // If user has advanced past step 1, it's an in-progress draft
        if (typeof state.preferences.onboardingStep === 'number' && state.preferences.onboardingStep > 1) {
            return true;
        }
        // If user entered nonzero wallet balances or custom budget in draft steps
        if (state.wallets && typeof state.wallets === 'object') {
            const hasNonZeroBalance = Object.values(state.wallets).some(w => w && Number(w.balance) !== 0);
            if (hasNonZeroBalance) return true;
        }
        return false;
    }

    /**
     * Check if a state has completed onboarding configuration.
     * @param {Object} state
     * @returns {boolean}
     */
    hasCompletedOnboarding(state) {
        if (!state || typeof state !== 'object') return false;
        return Boolean(state.preferences && state.preferences.onboardingCompleted === true);
    }

    /**
     * Check if cloud synchronization has been confirmed by Supabase.
     * @returns {boolean}
     */
    isCloudSyncConfirmed() {
        return this.cloudSyncStatus === 'CONFIRMED';
    }

    /**
     * Get the current cloud synchronization status.
     * @returns {'IDLE' | 'SYNCING' | 'CONFIRMED' | 'FAILED'}
     */
    getCloudSyncStatus() {
        return this.cloudSyncStatus || 'IDLE';
    }

    /**
     * PHASE 1: PURE PREVIEW & VALIDATION
     * Performs complete migration and invariant validation on an isolated deep clone of state.
     * Guaranteed pure: does NOT write to localStorage, does NOT mutate inputState, does NOT call cloud sync.
     * 
     * @param {Object} rawInputState
     * @returns {{ success: boolean, migratedState?: Object, error?: string, conflictDetails?: Object, preview?: Object, alreadyMigrated?: boolean }}
     */
    previewContinuousLedgerMigration(rawInputState) {
        const normalizedInput = this.normalizeBackupPayload(rawInputState);
        if (!normalizedInput || typeof normalizedInput !== 'object') {
            return { success: false, error: 'Input state is not a valid object.' };
        }

        // Deep clone input to guarantee zero side-effects during validation
        let state;
        try {
            state = JSON.parse(JSON.stringify(normalizedInput));
        } catch (e) {
            return { success: false, error: 'Failed to clone state: ' + e.message };
        }

        // Apply legacy repairs (Schema v1 -> v2) on clone
        try {
            // Wallets & Categories defaults fallback
            if (!state.wallets || typeof state.wallets !== 'object' || Object.keys(state.wallets).length === 0) {
                state.wallets = JSON.parse(JSON.stringify(defaultState.wallets));
            }
            if (!state.categories || typeof state.categories !== 'object') {
                state.categories = JSON.parse(JSON.stringify(defaultState.categories));
            } else {
                if (!Array.isArray(state.categories.JP) || state.categories.JP.length === 0) {
                    state.categories.JP = JSON.parse(JSON.stringify(defaultState.categories.JP));
                }
                if (!Array.isArray(state.categories.IN) || state.categories.IN.length === 0) {
                    state.categories.IN = JSON.parse(JSON.stringify(defaultState.categories.IN));
                }
                if (!Array.isArray(state.categories.DE) || state.categories.DE.length === 0) {
                    state.categories.DE = (typeof CountryConfig !== 'undefined' && typeof CountryConfig.getDefaultCategories === 'function')
                        ? CountryConfig.getDefaultCategories('DE')
                        : JSON.parse(JSON.stringify(defaultState.categories.DE));
                }
            }

            // Remove deprecated Forex Card
            if (state.wallets && state.wallets['Forex Card']) {
                delete state.wallets['Forex Card'];
            }

            // Inject wallet colors
            const legacyColors = {
                'Salary Account': '#009944', 'PayPay': '#ff0033', 'Cash': '#d4af37',
                'Axis Bank': '#97144d', 'Bank of Baroda': '#f05a28', 'Credit Card': '#94a3b8'
            };
            Object.values(state.wallets).forEach(w => {
                if (w && !w.color) w.color = legacyColors[w.id] || '#3351d6';
            });

            // Utilities reverse migration
            const hasJpUtilities = state.categories.JP.some(c => c.id === 'jp-utilities');
            if (hasJpUtilities) {
                state.categories.JP = state.categories.JP.filter(c => c.id !== 'jp-utilities');
                const oldUtils = [
                    { id: 'jp-utility-electric', name: 'Electricity', icon: 'zap', budget: 0 },
                    { id: 'jp-utility-gas', name: 'Gas', icon: 'flame', budget: 0 },
                    { id: 'jp-utility-water', name: 'Water', icon: 'droplet', budget: 0 },
                    { id: 'jp-utility-internet', name: 'Internet', icon: 'wifi', budget: 0 }
                ];
                state.categories.JP.splice(4, 0, ...oldUtils);
                const revMap = {
                    'Electricity': 'jp-utility-electric',
                    'Gas': 'jp-utility-gas',
                    'Water': 'jp-utility-water',
                    'Internet': 'jp-utility-internet'
                };
                if (Array.isArray(state.transactions)) {
                    state.transactions.forEach(tx => {
                        if (tx.categoryId === 'jp-utilities' && tx.note) {
                            for (const [oldName, oldId] of Object.entries(revMap)) {
                                if (tx.note.includes(oldName)) {
                                    tx.categoryId = oldId;
                                    if (tx.note === oldName) tx.note = '';
                                    else if (tx.note.startsWith(`${oldName} - `)) tx.note = tx.note.substring(oldName.length + 3);
                                    break;
                                }
                            }
                        }
                    });
                }
            }

            // Ensure Loan EMI category
            if (!state.categories.IN.some(c => c.id === 'in-loan')) {
                state.categories.IN.splice(1, 0, { id: 'in-loan', name: 'Loan EMI', icon: 'landmark' });
            }

            // Ensure loanConfig
            if (!state.loanConfig || Object.keys(state.loanConfig).length === 0) {
                state.loanConfig = JSON.parse(JSON.stringify(defaultState.loanConfig));
            } else {
                if (typeof state.loanConfig.country === 'undefined') state.loanConfig.country = 'IN';
                if (typeof state.loanConfig.currency === 'undefined') state.loanConfig.currency = '₹';
                if (typeof state.loanConfig.emiDrawDate === 'undefined') state.loanConfig.emiDrawDate = 7;
            }

            // Ensure independent multi-country budgets map
            if (!state.budgets || typeof state.budgets !== 'object') {
                const jpVal = Number(state.jpTotalBudget) || 0;
                const inVal = Number(state.inTotalBudget) || 0;
                const hasInWallets = state.wallets && Object.values(state.wallets).some(w => w && (w.region === 'IN' || w.currency === '₹'));
                state.budgets = {
                    JP: {
                        enabled: true,
                        monthlyTotal: jpVal,
                        rolloverEnabled: state.jpBudgetRolloverEnabled !== undefined ? Boolean(state.jpBudgetRolloverEnabled) : true
                    },
                    IN: {
                        enabled: inVal > 0 || hasInWallets,
                        monthlyTotal: inVal,
                        rolloverEnabled: state.inBudgetRolloverEnabled !== undefined ? Boolean(state.inBudgetRolloverEnabled) : false
                    },
                    DE: {
                        enabled: false,
                        monthlyTotal: 0,
                        rolloverEnabled: false
                    }
                };
            } else {
                if (!state.budgets.JP) {
                    state.budgets.JP = { enabled: true, monthlyTotal: Number(state.jpTotalBudget) || 0, rolloverEnabled: true };
                }
                if (!state.budgets.IN) {
                    state.budgets.IN = { enabled: (Number(state.inTotalBudget) || 0) > 0, monthlyTotal: Number(state.inTotalBudget) || 0, rolloverEnabled: false };
                }
                if (!state.budgets.DE) {
                    state.budgets.DE = { enabled: false, monthlyTotal: 0, rolloverEnabled: false };
                }
            }

            // Reconcile legacy direct assignments if present before attaching accessors
            if (state.budgets && state.budgets.JP && state.jpTotalBudget !== undefined && Number(state.jpTotalBudget) !== state.budgets.JP.monthlyTotal) {
                state.budgets.JP.monthlyTotal = Number(state.jpTotalBudget) || 0;
            }
            if (state.budgets && state.budgets.IN && state.inTotalBudget !== undefined && Number(state.inTotalBudget) !== state.budgets.IN.monthlyTotal) {
                state.budgets.IN.monthlyTotal = Number(state.inTotalBudget) || 0;
            }

            this._attachBudgetAccessors(state);

            // Ensure user preferences & onboarding configuration layer
            const hasFinancialData = this.isEstablishedLegacyFinancialData(state);
            if (!state.preferences || typeof state.preferences !== 'object') {
                const detectedCountries = new Set();
                if (state.wallets && typeof state.wallets === 'object') {
                    Object.values(state.wallets).forEach(w => {
                        if (w && w.region) detectedCountries.add(w.region.toUpperCase());
                        else if (w && w.currency === '¥') detectedCountries.add('JP');
                        else if (w && w.currency === '₹') detectedCountries.add('IN');
                        else if (w && w.currency === '€') detectedCountries.add('DE');
                    });
                }
                if (Array.isArray(state.transactions)) {
                    state.transactions.forEach(tx => {
                        if (tx && tx.region) detectedCountries.add(tx.region.toUpperCase());
                    });
                }
                const activeList = Array.from(detectedCountries).filter(c => ['JP', 'IN', 'DE'].includes(c));
                const activeCountries = activeList.length > 0 ? activeList : ['JP', 'IN'];

                state.preferences = {
                    version: 1,
                    activeCountries: activeCountries,
                    defaultCountry: activeCountries.includes('JP') ? 'JP' : activeCountries[0] || 'JP',
                    onboardingCompleted: hasFinancialData, // Existing users with data bypass onboarding
                    onboardingStep: hasFinancialData ? 4 : 1,
                    tourCompleted: hasFinancialData,
                    tourDismissed: false,
                    theme: (state.regionalPreferences && state.regionalPreferences.theme) || 'dark'
                };
            } else {
                const currentActive = Array.isArray(state.preferences.activeCountries) && state.preferences.activeCountries.length > 0
                    ? state.preferences.activeCountries
                    : ['JP', 'IN'];
                state.preferences = {
                    version: state.preferences.version || 1,
                    activeCountries: currentActive,
                    defaultCountry: state.preferences.defaultCountry || (currentActive.includes('JP') ? 'JP' : currentActive[0]),
                    onboardingCompleted: typeof state.preferences.onboardingCompleted === 'boolean'
                        ? state.preferences.onboardingCompleted
                        : hasFinancialData,
                    onboardingStep: state.preferences.onboardingStep || (state.preferences.onboardingCompleted ? 4 : 1),
                    tourCompleted: Boolean(state.preferences.tourCompleted),
                    tourDismissed: Boolean(state.preferences.tourDismissed),
                    theme: state.preferences.theme || 'dark'
                };
            }

            // Remap Rent from JP to IN
            const jpRentIndex = state.categories.JP.findIndex(c => c.id === 'jp-rent');
            if (jpRentIndex !== -1) {
                const rentCat = state.categories.JP.splice(jpRentIndex, 1)[0];
                if (!state.categories.IN.some(c => c.id === 'in-rent')) {
                    state.categories.IN.push({ id: 'in-rent', name: 'Rent', icon: rentCat.icon || 'home' });
                }
                if (Array.isArray(state.transactions)) {
                    state.transactions.forEach(tx => {
                        if (tx.categoryId === 'jp-rent') {
                            tx.categoryId = 'in-rent';
                            tx.region = 'IN';
                        }
                    });
                }
                if (Array.isArray(state.history)) {
                    state.history.forEach(h => {
                        if (Array.isArray(h.transactions)) {
                            h.transactions.forEach(tx => {
                                if (tx.categoryId === 'jp-rent') {
                                    tx.categoryId = 'in-rent';
                                    tx.region = 'IN';
                                }
                            });
                        }
                    });
                }
            }

            // Merge duplicate history ledgers with same monthKey
            if (Array.isArray(state.history) && state.history.length > 0) {
                const uniqueHistory = [];
                state.history.forEach(snapshot => {
                    const existing = uniqueHistory.find(h => h.monthKey === snapshot.monthKey);
                    if (existing) {
                        if (Array.isArray(snapshot.transactions)) {
                            existing.transactions = (existing.transactions || []).concat(snapshot.transactions);
                        }
                    } else {
                        uniqueHistory.push(snapshot);
                    }
                });
                uniqueHistory.sort((a, b) => (b.monthKey || '').localeCompare(a.monthKey || ''));
                state.history = uniqueHistory;
            }
        } catch (e) {
            return { success: false, error: 'Legacy schema repair failed: ' + e.message };
        }

        // Check if already Schema v3 continuous ledger without raw history transactions
        const hasHistoryTransactions = Array.isArray(state.history) &&
            state.history.some(h => {
                const desc = Object.getOwnPropertyDescriptor(h, 'transactions');
                return desc && Array.isArray(desc.value) && desc.value.length > 0;
            });

        if (state.schemaVersion >= 3 && !hasHistoryTransactions && state.closedMonths) {
            return {
                success: true,
                migratedState: state,
                alreadyMigrated: true,
                preview: {
                    totalTransactions: Array.isArray(state.transactions) ? state.transactions.length : 0,
                    closedMonthsCount: Object.keys(state.closedMonths).length
                }
            };
        }

        // Snapshot pre-migration wallet balances for mathematical invariant check
        const preBalances = {};
        if (state.wallets) {
            Object.keys(state.wallets).forEach(wId => {
                preBalances[wId] = state.wallets[wId].balance;
            });
        }

        // Continuous ledger collection and semantic conflict detection
        const continuousTransactions = [];
        const seenTxIds = new Map();
        const closedMonths = state.closedMonths ? { ...state.closedMonths } : {};

        function areTransactionsConflicting(tx1, tx2) {
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
            const note1 = (tx1.note ?? tx1.description ?? '').toString().trim();
            const note2 = (tx2.note ?? tx2.description ?? '').toString().trim();
            if (note1 !== note2) return `Conflicting note/description: "${note1}" !== "${note2}"`;

            const cat1 = (tx1.categoryId ?? tx1.category ?? '').toString().trim();
            const cat2 = (tx2.categoryId ?? tx2.category ?? '').toString().trim();
            if (cat1 !== cat2) return `Conflicting category: "${cat1}" !== "${cat2}"`;

            if (tx1.exchangeRate !== undefined || tx2.exchangeRate !== undefined) {
                const r1 = tx1.exchangeRate != null ? Number(tx1.exchangeRate).toFixed(4) : '';
                const r2 = tx2.exchangeRate != null ? Number(tx2.exchangeRate).toFixed(4) : '';
                if (r1 !== r2) return `Conflicting exchangeRate: "${tx1.exchangeRate}" !== "${tx2.exchangeRate}"`;
            }

            const curFields = ['currency', 'sourceCurrency', 'destCurrency'];
            for (const f of curFields) {
                const c1 = (tx1[f] ?? '').toString().trim();
                const c2 = (tx2[f] ?? '').toString().trim();
                if (c1 !== c2) return `Conflicting currency field "${f}": "${c1}" !== "${c2}"`;
            }

            const walletFields = ['walletId', 'sourceId', 'destId'];
            for (const f of walletFields) {
                const w1 = (tx1[f] ?? '').toString().trim();
                const w2 = (tx2[f] ?? '').toString().trim();
                if (w1 !== w2) return `Conflicting wallet/endpoint field "${f}": "${w1}" !== "${w2}"`;
            }

            const strFields = ['type', 'date', 'region'];
            for (const f of strFields) {
                const s1 = (tx1[f] ?? '').toString().trim();
                const s2 = (tx2[f] ?? '').toString().trim();
                if (s1 !== s2) return `Conflicting field "${f}": "${s1}" !== "${s2}"`;
            }

            const allKeys = new Set([...Object.keys(tx1), ...Object.keys(tx2)]);
            const handledKeys = new Set([
                'id', 'amount', 'sourceAmount', 'destAmount', 'note', 'description',
                'categoryId', 'category', 'exchangeRate', 'currency', 'sourceCurrency',
                'destCurrency', 'walletId', 'sourceId', 'destId', 'type', 'date', 'region', 'updatedAt'
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

        let conflictError = null;
        let conflictDetails = null;

        const ingestTransaction = (tx, source) => {
            if (conflictError || !tx || !tx.id) return;
            const existing = seenTxIds.get(tx.id);
            if (existing) {
                const conflictReason = areTransactionsConflicting(existing, tx);
                if (conflictReason) {
                    conflictError = `Migration conflict detected on transaction ID "${tx.id}" (${conflictReason}). Halting to prevent data corruption.`;
                    conflictDetails = { id: tx.id, reason: conflictReason, existing, duplicate: tx, source };
                    return;
                }
                return; // Identical duplicate — skip safely
            }
            const cloned = { ...tx };
            seenTxIds.set(cloned.id, cloned);
            continuousTransactions.push(cloned);
        };

        // Ingest active transactions
        if (Array.isArray(state.transactions)) {
            state.transactions.forEach(tx => ingestTransaction(tx, 'active'));
        }

        // Ingest historical transactions
        if (!conflictError && Array.isArray(state.history)) {
            state.history.forEach(h => {
                if (!h || !h.monthKey || conflictError) return;
                const desc = Object.getOwnPropertyDescriptor(h, 'transactions');
                const rawTxList = desc && Array.isArray(desc.value) ? desc.value : null;
                if (rawTxList) {
                    rawTxList.forEach(tx => ingestTransaction(tx, `history_${h.monthKey}`));
                }
                const { transactions, ...archiveMetadata } = h;
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
                    closedMonths[h.monthKey] = {
                        ...archiveMetadata,
                        ...closedMonths[h.monthKey]
                    };
                }
            });
        }

        if (conflictError) {
            return { success: false, error: conflictError, conflictDetails };
        }

        // Chronological sort (newest first, secondary sort by ID)
        continuousTransactions.sort((a, b) => {
            const dateCmp = (b.date || '').localeCompare(a.date || '');
            if (dateCmp !== 0) return dateCmp;
            return String(b.id).localeCompare(String(a.id));
        });

        // Invariant Validation: check that continuousTransactions is an array
        if (!Array.isArray(continuousTransactions)) {
            return { success: false, error: 'Migration validation failed: continuousTransactions is not an array.' };
        }

        // Invariant Validation: check that no wallet balance shifted
        if (state.wallets) {
            for (const wId of Object.keys(preBalances)) {
                if (state.wallets[wId].balance !== preBalances[wId]) {
                    return {
                        success: false,
                        error: `Migration validation failed: Balance altered for wallet "${wId}". Expected ${preBalances[wId]}, got ${state.wallets[wId].balance}`
                    };
                }
            }
        }

        // Apply continuous ledger updates to cloned state
        state.transactions = continuousTransactions;
        state.closedMonths = closedMonths;
        state.history = Object.values(closedMonths).sort((a, b) => (b.monthKey || '').localeCompare(a.monthKey || ''));
        state.schemaVersion = 3;
        state._updatedAt = new Date().toISOString();

        return {
            success: true,
            migratedState: state,
            alreadyMigrated: false,
            preview: {
                totalTransactions: continuousTransactions.length,
                closedMonthsCount: Object.keys(closedMonths).length
            }
        };
    }

    /**
     * PHASE 2: ATOMIC PERSISTENCE GATE
     * Persists a verified migration state.
     * Only callable when previewContinuousLedgerMigration has returned success: true.
     * Takes an emergency local snapshot, updates in-memory state, attaches getters, and writes to storage.
     * 
     * NOTE ON SNAPSHOTS: Local snapshots in localStorage are ephemeral, device-local fallbacks
     * meant for crash recovery during migration. They are NOT substitutes for authoritative
     * production database backups (such as Supabase point-in-time recovery / WAL backups).
     * 
     * @param {Object} previewResult
     * @param {Object} [options]
     * @returns {boolean}
     */
    applyContinuousLedgerMigration(previewResult, { isAuthoritativeRemote = false } = {}) {
        if (!previewResult || !previewResult.success || !previewResult.migratedState) {
            console.error('[Migration Gate] Attempted to persist invalid or unverified migration state. Persistence halted.');
            return false;
        }

        const migratedState = previewResult.migratedState;

        // 1. Emergency local snapshot before overwriting
        try {
            const backupKey = `${this.getActiveStorageKey()}_backup_pre_v3`;
            if (typeof localStorage !== 'undefined' && !localStorage.getItem(backupKey)) {
                localStorage.setItem(backupKey, JSON.stringify(this.state || migratedState));
                console.log('[Migration] Emergency local snapshot preserved at:', backupKey);
            }
        } catch (e) {
            console.warn('[Migration] Could not save emergency local snapshot:', e);
        }

        // 2. Attach non-enumerable getters and budget accessors
        this._attachHistoryGetters(migratedState);
        this._attachBudgetAccessors(migratedState);

        // 3. Atomically update in-memory state
        this.state = migratedState;

        // 4. Persist to localStorage
        try {
            localStorage.setItem(this.getActiveStorageKey(), JSON.stringify(this.state));
        } catch (e) {
            console.error('[Migration] Failed to write migrated state to localStorage:', e);
            return false;
        }

        console.log(`[Migration Gate] Schema v3 successfully persisted (${migratedState.transactions.length} continuous txs).`);
        return true;
    }

    /**
     * Migrate state to Continuous Transaction Ledger (Schema v3).
     * Backward-compatible delegation wrapper around previewContinuousLedgerMigration.
     */
    migrateToContinuousLedger(state) {
        const preview = this.previewContinuousLedgerMigration(state);
        if (!preview.success) {
            throw new Error(preview.error);
        }
        this._attachHistoryGetters(preview.migratedState);
        this._attachBudgetAccessors(preview.migratedState);
        return preview.migratedState;
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
            this.accountStatus = this.hasEstablishedFinancialData(this.state) ? 'EXISTING_USER' : 'NEW_USER';
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
                    // No remote state found in Supabase for this user
                    const isDraft = this.isDraftOnboardingConfiguration(this.state);
                    const hasEstablishedLegacy = this.isEstablishedLegacyFinancialData(this.state);

                    if (hasEstablishedLegacy) {
                        console.log('[Sync] No remote state found, but established legacy financial data detected. Initializing cloud backup...');
                        this.accountStatus = 'EXISTING_USER';
                        this.cloudSyncStatus = 'SYNCING';
                        if (this.state.preferences) {
                            this.state.preferences.onboardingCompleted = true;
                        }
                        this.initialSyncDone = true;
                        const pushed = await this.pushToSupabase({ force: true });
                        this.cloudSyncStatus = pushed ? 'CONFIRMED' : 'FAILED';
                    } else if (isDraft) {
                        console.log('[Sync] Incomplete onboarding draft detected locally. Preserving local draft, deferring cloud push.');
                        this.accountStatus = 'ONBOARDING_INCOMPLETE';
                        this.cloudSyncStatus = 'IDLE';
                        this.initialSyncDone = true;
                    } else {
                        console.log('[Sync] Genuine new user account detected (no remote row, empty financial data). Onboarding required.');
                        this.accountStatus = 'NEW_USER';
                        this.cloudSyncStatus = 'IDLE';
                        if (this.state.preferences) {
                            this.state.preferences.onboardingCompleted = false;
                            this.state.preferences.onboardingStep = 1;
                        }
                        this.initialSyncDone = true;
                        // Intentionally do NOT push placeholder default wallets to cloud yet!
                    }
                } else {
                    console.error('[Sync] Error fetching from Supabase:', error);
                    // Network or server error: fail closed!
                    this.accountStatus = 'SYNC_FAILED';
                    this.cloudSyncStatus = 'FAILED';
                    this.syncError = error.message || String(error);
                    this.initialSyncDone = true;
                }
                return false;
            }

            if (data && data.state) {
                const remote = data.state;
                const remoteIsValid = remote && remote.wallets && Array.isArray(remote.transactions);

                if (!remoteIsValid) {
                    console.warn('[Sync] Remote state invalid or empty structure.');
                    const isDraft = this.isDraftOnboardingConfiguration(this.state);
                    const hasEstablishedLegacy = this.isEstablishedLegacyFinancialData(this.state);
                    if (hasEstablishedLegacy) {
                        console.log('[Sync] Local state has valid data. Preserving local and pushing up...');
                        this.accountStatus = 'EXISTING_USER';
                        this.cloudSyncStatus = 'SYNCING';
                        this.initialSyncDone = true;
                        const pushed = await this.pushToSupabase({ force: true });
                        this.cloudSyncStatus = pushed ? 'CONFIRMED' : 'FAILED';
                    } else if (isDraft) {
                        this.accountStatus = 'ONBOARDING_INCOMPLETE';
                        this.cloudSyncStatus = 'IDLE';
                        this.initialSyncDone = true;
                    } else {
                        this.accountStatus = 'NEW_USER';
                        this.cloudSyncStatus = 'IDLE';
                        this.initialSyncDone = true;
                    }
                    return false;
                }

                // Authoritative remote is structurally valid — run full migration preview
                const preview = this.previewContinuousLedgerMigration(remote);
                if (!preview.success) {
                    console.error('[Sync] Migration of authoritative remote state failed validation. Halting sync:', preview.error);
                    this.accountStatus = 'SYNC_FAILED';
                    this.cloudSyncStatus = 'FAILED';
                    this.syncError = preview.error;
                    this.initialSyncDone = true;
                    return false;
                }

                const remoteUpdatedAt = data.updated_at ? new Date(data.updated_at) : null;
                const localUpdatedAt = this.state._updatedAt ? new Date(this.state._updatedAt) : null;

                // Count unique transactions as richness tiebreaker without getter double-counting
                const remoteTxCount = this.getUniqueTransactionCount(remote);
                const localTxCount = this.getUniqueTransactionCount(this.state);

                const remoteNeedsMigration = remote && (!remote.schemaVersion || remote.schemaVersion < 3 ||
                    (Array.isArray(remote.history) && remote.history.some(h => {
                        const desc = Object.getOwnPropertyDescriptor(h, 'transactions');
                        return desc && Array.isArray(desc.value) && desc.value.length > 0;
                    })) || !remote.preferences || !remote.budgets);

                let shouldUseRemote = false;
                if (this.isFirstLoad) {
                    // Fresh device / returning user on new device loads remote
                    console.log('[Sync] Fresh device/account detected. Using authoritative remote state.');
                    shouldUseRemote = true;
                } else if (remoteUpdatedAt && localUpdatedAt) {
                    shouldUseRemote = remoteUpdatedAt > localUpdatedAt;
                } else if (remoteUpdatedAt && !localUpdatedAt) {
                    shouldUseRemote = true;
                } else {
                    shouldUseRemote = remoteTxCount >= localTxCount;
                }

                if (shouldUseRemote) {
                    console.log(`[Sync] Remote state accepted (${remoteTxCount} txs vs local ${localTxCount} txs). Applying...`);

                    const persisted = this.applyContinuousLedgerMigration(preview, { isAuthoritativeRemote: true });
                    if (!persisted) {
                        this.accountStatus = 'SYNC_FAILED';
                        this.cloudSyncStatus = 'FAILED';
                        this.initialSyncDone = true;
                        return false;
                    }

                    // Derive account resolution status
                    if (this.state.preferences && this.state.preferences.onboardingCompleted === false) {
                        const hasTx = this.getUniqueTransactionCount(this.state) > 0;
                        this.accountStatus = hasTx ? 'EXISTING_USER' : 'ONBOARDING_INCOMPLETE';
                        this.cloudSyncStatus = 'IDLE';
                    } else {
                        this.accountStatus = 'EXISTING_USER';
                        this.cloudSyncStatus = 'CONFIRMED';
                    }

                    this.isFirstLoad = false;
                    this.initialSyncDone = true;
                    this.checkRollover();

                    // Push migrated v3 state to Supabase only after successful validation
                    if (remoteNeedsMigration) {
                        await this.pushToSupabase();
                    }

                    return true; // signal caller to re-render
                } else {
                    console.log(`[Sync] Local state wins (${localTxCount} txs vs remote ${remoteTxCount} txs). Pushing up...`);
                    this.accountStatus = 'EXISTING_USER';
                    this.cloudSyncStatus = 'SYNCING';
                    this.initialSyncDone = true;
                    const pushed = await this.pushToSupabase({ force: true });
                    this.cloudSyncStatus = pushed ? 'CONFIRMED' : 'FAILED';
                    return false;
                }
            }
        } catch (e) {
            console.error('[Sync] Supabase sync failed with exception:', e);
            this.accountStatus = 'SYNC_FAILED';
            this.cloudSyncStatus = 'FAILED';
            this.syncError = e.message || String(e);
            this.initialSyncDone = true;
        }
        return false;
    }

    async pushToSupabase(options = {}) {
        if (typeof supabaseClient === 'undefined' || !supabaseClient.session || !supabaseClient.session.user) {
            return false;
        }

        const userId = supabaseClient.session.user.id;
        if (!userId) return false;

        const allowExplicitPersist = Boolean(options && (options.force || options.allowOnboardingPersist));

        // Fail-closed guard: do not push if synchronization failed with server/network error
        // UNLESS an explicit retry / forced persist is requested
        if (this.accountStatus === 'SYNC_FAILED' && !allowExplicitPersist) {
            console.warn('[Storage] Refusing to push state to Supabase while in SYNC_FAILED state.');
            return false;
        }

        // Safety guard for Risk 1:
        // Draft onboarding configuration (preferences.onboardingCompleted !== true) must NEVER
        // be uploaded to Supabase, even if the user entered nonzero wallet opening balances
        // or draft budgets. It remains strictly local until onboarding is explicitly completed.
        const isSetupCompleted = Boolean(this.state.preferences?.onboardingCompleted);

        if (!isSetupCompleted && !allowExplicitPersist) {
            console.log('[Storage] Deferring pushToSupabase: draft onboarding configuration must not be uploaded before confirmation.');
            return false;
        }

        // Basic payload integrity validation
        if (!this.state || !this.state.wallets || !Array.isArray(this.state.transactions)) {
            console.error("[Storage] Refusing to push invalid state payload to Supabase");
            return false;
        }

        if (this.state._haltedMigration || this.migrationError) {
            console.error("[Storage] Refusing to push state to Supabase because migration was halted due to validation/conflict errors.");
            return false;
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
                this.syncError = error.message || String(error);
                return false;
            }
            this.syncError = null;
            return true;
        } catch (e) {
            console.error("[Sync] Push to Supabase failed:", e);
            this.syncError = e.message || String(e);
            return false;
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
            const preview = this.previewContinuousLedgerMigration(remoteState);
            if (!preview.success) {
                console.error('[Realtime] Incoming update failed migration preview:', preview.error);
                return false;
            }
            this.applyContinuousLedgerMigration(preview);
            this.checkRollover();
            return true; // signals caller to re-render
        }
        return false;
    }

    saveData() {
        if (this.state._haltedMigration || this.migrationError) {
            console.warn('[Storage] saveData blocked because migration is in halted safety state.');
            return;
        }
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
            if (this.state.budgets && this.state.budgets.JP) {
                this.state.budgets.JP.monthlyTotal = this.state.jpTotalBudget;
            }
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

    /**
     * Shared normalization helper for backup payloads.
     * Supports both plain application-state backups and wrapped production exports
     * ({ source, exportedAt, databaseUpdatedAt, state }).
     * Rejects malformed wrappers (e.g. non-object or null state envelopes).
     */
    normalizeBackupPayload(data) {
        if (!data || typeof data !== 'object') return data;
        // Detect wrapped export envelope: has 'state' key along with envelope metadata or missing root wallets
        if ('state' in data && (data.source || data.exportedAt || data.databaseUpdatedAt || !data.wallets)) {
            return data.state;
        }
        return data;
    }

    validateBackupData(data) {
        const payload = this.normalizeBackupPayload(data);
        if (!payload || typeof payload !== 'object') {
            return { valid: false, error: 'File content is not a valid JSON object or contains an invalid state envelope.' };
        }
        if (!payload.wallets || typeof payload.wallets !== 'object' || Object.keys(payload.wallets).length === 0) {
            return { valid: false, error: 'Backup is missing a valid "wallets" collection.' };
        }
        if (!Array.isArray(payload.transactions)) {
            return { valid: false, error: 'Backup is missing the required "transactions" ledger array.' };
        }
        return {
            valid: true,
            walletsCount: Object.keys(payload.wallets).length,
            txCount: payload.transactions.length,
            schemaVersion: payload.schemaVersion || 1,
            closedMonthsCount: payload.closedMonths ? Object.keys(payload.closedMonths).length : 0,
            normalizedData: payload
        };
    }

    importJSON(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                const validation = this.validateBackupData(parsed);
                if (!validation.valid) {
                    callback(false, validation.error);
                    return;
                }

                const targetData = validation.normalizedData || this.normalizeBackupPayload(parsed);

                // Migrate to continuous ledger if needed via Two-Phase pipeline
                const preview = this.previewContinuousLedgerMigration(targetData);
                if (!preview.success) {
                    callback(false, preview.error);
                    return;
                }
                this.applyContinuousLedgerMigration(preview);
                this.saveData();
                callback(true, null, validation);
            } catch (err) {
                callback(false, 'Malformed JSON file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ===== Phase 2: User Preferences & Account Configuration API =====

    /**
     * Get a deep copy of current user preferences.
     * @returns {Object}
     */
    getPreferences() {
        if (!this.state || !this.state.preferences) {
            return JSON.parse(JSON.stringify(defaultState.preferences));
        }
        return JSON.parse(JSON.stringify(this.state.preferences));
    }

    /**
     * Update user preferences and persist.
     * Validates active countries and preserves financial invariants.
     * @param {Object} updates
     * @returns {Object} Updated preferences
     */
    updatePreferences(updates) {
        if (!updates || typeof updates !== 'object') return this.getPreferences();

        if (!this.state.preferences) {
            this.state.preferences = JSON.parse(JSON.stringify(defaultState.preferences));
        }

        // Validate activeCountries if provided
        if (updates.activeCountries) {
            if (Array.isArray(updates.activeCountries) && updates.activeCountries.length > 0) {
                const valid = updates.activeCountries
                    .map(c => String(c).toUpperCase())
                    .filter(c => ['JP', 'IN', 'DE'].includes(c));
                if (valid.length > 0) {
                    this.state.preferences.activeCountries = Array.from(new Set(valid));
                }
            }
        }

        if (updates.defaultCountry && ['JP', 'IN', 'DE'].includes(updates.defaultCountry.toUpperCase())) {
            this.state.preferences.defaultCountry = updates.defaultCountry.toUpperCase();
        }

        if (typeof updates.onboardingCompleted === 'boolean') {
            this.state.preferences.onboardingCompleted = updates.onboardingCompleted;
            if (updates.onboardingCompleted) {
                this.accountStatus = 'EXISTING_USER';
            }
        }

        if (typeof updates.onboardingStep === 'number') {
            this.state.preferences.onboardingStep = updates.onboardingStep;
        }

        if (typeof updates.tourCompleted === 'boolean') {
            this.state.preferences.tourCompleted = updates.tourCompleted;
        }

        if (typeof updates.tourDismissed === 'boolean') {
            this.state.preferences.tourDismissed = updates.tourDismissed;
        }

        if (updates.theme && typeof updates.theme === 'string') {
            this.state.preferences.theme = updates.theme;
        }

        this.saveData();
        return this.getPreferences();
    }

    /**
     * Check if current account is a genuine first-time user.
     * Strictly requires authoritative NEW_USER resolution from Supabase sync.
     * Never infers new user on SYNC_FAILED, PENDING_CLOUD_SYNC, UNRESOLVED, or for returning users.
     * @returns {boolean}
     */
    isNewUser() {
        if (this.accountStatus === 'NEW_USER') {
            return true;
        }
        if (this.accountStatus === 'EXISTING_USER' ||
            this.accountStatus === 'ONBOARDING_INCOMPLETE' ||
            this.accountStatus === 'PENDING_CLOUD_SYNC' ||
            this.accountStatus === 'SYNC_FAILED' ||
            this.accountStatus === 'UNRESOLVED') {
            return false;
        }
        return Boolean(!this.state.preferences?.onboardingCompleted && !this.isEstablishedLegacyFinancialData(this.state));
    }

    /**
     * Get account resolution status.
     * @returns {'UNRESOLVED'|'NEW_USER'|'EXISTING_USER'|'ONBOARDING_INCOMPLETE'|'PENDING_CLOUD_SYNC'|'SYNC_FAILED'}
     */
    getAccountStatus() {
        return this.accountStatus;
    }

    /**
     * Check if a sovereign country is currently active in user preferences.
     * @param {string} countryCode - 'JP', 'IN', 'DE'
     * @returns {boolean}
     */
    isCountryActive(countryCode) {
        if (!countryCode || !this.state.preferences?.activeCountries) return false;
        return this.state.preferences.activeCountries.includes(countryCode.toUpperCase());
    }

    /**
     * Get array of active country codes.
     * @returns {Array<string>}
     */
    getActiveCountries() {
        return (this.state.preferences && Array.isArray(this.state.preferences.activeCountries))
            ? [...this.state.preferences.activeCountries]
            : ['JP', 'IN'];
    }

    /**
     * Set active countries.
     * @param {Array<string>} countries
     */
    setActiveCountries(countries) {
        return this.updatePreferences({ activeCountries: countries });
    }

    /**
     * Get the primary operating country code.
     * @returns {string}
     */
    getPrimaryCountry() {
        return (this.state.preferences && this.state.preferences.defaultCountry)
            || (this.state.regionalPreferences && this.state.regionalPreferences.defaultCountry)
            || this.getActiveCountries()[0]
            || 'JP';
    }

    /**
     * Set the primary operating country.
     * @param {string} countryCode
     */
    setPrimaryCountry(countryCode) {
        if (!countryCode) return;
        const code = countryCode.toUpperCase();
        if (!this.state.preferences) {
            this.state.preferences = JSON.parse(JSON.stringify(defaultState.preferences));
        }
        this.state.preferences.defaultCountry = code;
        if (this.state.regionalPreferences) {
            this.state.regionalPreferences.defaultCountry = code;
            const currencyCode = (typeof CountryConfig !== 'undefined' && CountryConfig.get(code)?.currencyCode) || (code === 'JP' ? 'JPY' : code === 'DE' ? 'EUR' : 'INR');
            this.state.regionalPreferences.defaultCurrency = currencyCode;
        }
        this.saveData();
    }

    /**
     * Activate an operating country.
     * @param {string} countryCode
     */
    activateCountry(countryCode) {
        if (!countryCode) return;
        const code = countryCode.toUpperCase();
        if (!['JP', 'IN', 'DE'].includes(code)) return;
        const current = this.getActiveCountries();
        if (!current.includes(code)) {
            current.push(code);
            this.setActiveCountries(current);
            if (!this.state.budgets) {
                this.state.budgets = JSON.parse(JSON.stringify(defaultState.budgets));
            }
            if (!this.state.budgets[code]) {
                this.state.budgets[code] = {
                    enabled: true,
                    monthlyTotal: code === 'JP' ? 50000 : code === 'DE' ? 2500 : 30000,
                    rolloverEnabled: code === 'JP'
                };
            }
            this.saveData();
        }
    }

    /**
     * Deactivate an operating country.
     * Guaranteed safe: preserves all wallets, transactions, and snapshots.
     * @param {string} countryCode
     * @returns {boolean} Whether deactivation succeeded
     */
    deactivateCountry(countryCode) {
        if (!countryCode) return false;
        const code = countryCode.toUpperCase();
        const current = this.getActiveCountries();
        if (current.length <= 1) return false; // At least one country must remain active
        const updated = current.filter(c => c !== code);
        this.setActiveCountries(updated);
        if (this.getPrimaryCountry() === code) {
            this.setPrimaryCountry(updated[0]);
        }
        this.saveData();
        return true;
    }

    /**
     * Get total allocated monthly budget for a country.
     * @param {string} countryCode
     * @returns {number}
     */
    getTotalBudget(countryCode) {
        if (!countryCode) return 0;
        const code = countryCode.toUpperCase();
        if (this.state.budgets && this.state.budgets[code] && typeof this.state.budgets[code].monthlyTotal === 'number') {
            return this.state.budgets[code].monthlyTotal;
        }
        if (code === 'JP') return Number(this.state.jpTotalBudget) || 0;
        if (code === 'IN') return Number(this.state.inTotalBudget) || 0;
        return 0;
    }

    /**
     * Check if budget rollover is enabled for a country.
     * @param {string} countryCode
     * @returns {boolean}
     */
    isBudgetRolloverEnabled(countryCode) {
        if (!countryCode) return false;
        const code = countryCode.toUpperCase();
        if (this.state.budgets && this.state.budgets[code] && typeof this.state.budgets[code].rolloverEnabled === 'boolean') {
            return this.state.budgets[code].rolloverEnabled;
        }
        if (code === 'JP') return Boolean(this.state.jpBudgetRolloverEnabled);
        if (code === 'IN') return Boolean(this.state.inBudgetRolloverEnabled);
        return false;
    }

    /**
     * Get budget preference summary for a country.
     * @param {string} countryCode
     * @returns {{enabled: boolean, monthlyTotal: number, rolloverEnabled: boolean}}
     */
    getBudgetPreference(countryCode) {
        const code = (countryCode || 'JP').toUpperCase();
        return {
            enabled: this.isBudgetEnabled(code),
            monthlyTotal: this.getTotalBudget(code),
            rolloverEnabled: this.isBudgetRolloverEnabled(code)
        };
    }

    /**
     * Check if budgeting is enabled for a given country.
     * @param {string} countryCode
     * @returns {boolean}
     */
    isBudgetEnabled(countryCode) {
        if (!countryCode || !this.state.budgets) return false;
        const code = countryCode.toUpperCase();
        return Boolean(this.state.budgets[code]?.enabled);
    }

    /**
     * Get budgeting configuration for a country.
     * @param {string} countryCode
     * @returns {Object} { enabled: boolean, monthlyTotal: number, rolloverEnabled: boolean }
     */
    getBudgetConfig(countryCode) {
        if (!countryCode || !this.state.budgets) {
            return { enabled: false, monthlyTotal: 0, rolloverEnabled: false };
        }
        const code = countryCode.toUpperCase();
        return this.state.budgets[code]
            ? { ...this.state.budgets[code] }
            : { enabled: false, monthlyTotal: 0, rolloverEnabled: false };
    }

    /**
     * Configure budget for a country and keep legacy properties in sync.
     * @param {string} countryCode
     * @param {boolean} enabled
     * @param {number} [monthlyTotal]
     * @param {boolean} [rolloverEnabled]
     */
    setBudgetEnabled(countryCode, enabled, monthlyTotal = null, rolloverEnabled = null) {
        if (!countryCode) return;
        const code = countryCode.toUpperCase();
        if (!this.state.budgets) {
            this.state.budgets = JSON.parse(JSON.stringify(defaultState.budgets));
        }
        if (!this.state.budgets[code]) {
            this.state.budgets[code] = { enabled: false, monthlyTotal: 0, rolloverEnabled: false };
        }

        this.state.budgets[code].enabled = Boolean(enabled);
        if (monthlyTotal !== null && !isNaN(Number(monthlyTotal))) {
            this.state.budgets[code].monthlyTotal = Number(monthlyTotal);
        }
        if (rolloverEnabled !== null) {
            this.state.budgets[code].rolloverEnabled = Boolean(rolloverEnabled);
        }

        // Keep legacy properties in sync
        if (code === 'JP') {
            this.state.jpTotalBudget = this.state.budgets.JP.monthlyTotal;
            this.state.jpBudgetRolloverEnabled = this.state.budgets.JP.rolloverEnabled;
        } else if (code === 'IN') {
            this.state.inTotalBudget = this.state.budgets.IN.monthlyTotal;
            this.state.inBudgetRolloverEnabled = this.state.budgets.IN.rolloverEnabled;
        }

        this.saveData();
    }

    /**
     * Set total allocated monthly budget for a sovereign country or legacy key.
     * Centralized update method ensuring budgets[country].monthlyTotal and legacy fields stay in lockstep.
     * @param {'JP'|'IN'|'DE'|'jpTotalBudget'|'inTotalBudget'} countryOrKey
     * @param {number} amount
     */
    setTotalBudget(countryOrKey, amount) {
        if (!countryOrKey) return;
        const key = String(countryOrKey).trim();
        const code = (key === 'jpTotalBudget' || key === 'JP' || key === 'JPY') ? 'JP' :
            (key === 'inTotalBudget' || key === 'IN' || key === 'INR') ? 'IN' :
                (key === 'DE' || key === 'EUR') ? 'DE' : key.toUpperCase();
        const num = Number(amount) || 0;

        if (!this.state.budgets) {
            this.state.budgets = JSON.parse(JSON.stringify(defaultState.budgets));
        }
        if (!this.state.budgets[code]) {
            this.state.budgets[code] = { enabled: true, monthlyTotal: num, rolloverEnabled: code === 'JP' };
        } else {
            this.state.budgets[code].monthlyTotal = num;
        }

        this.saveData();
    }

    /**
     * Check if loan tracking is enabled.
     * @returns {boolean}
     */
    isLoanTrackingEnabled() {
        return Boolean(this.state.loanConfig?.enabled);
    }

    /**
     * Enable or disable loan tracking with optional parameters.
     * @param {boolean} enabled
     * @param {Object} [options]
     */
    setLoanTrackingEnabled(enabled, options = {}) {
        if (!this.state.loanConfig) {
            this.state.loanConfig = JSON.parse(JSON.stringify(defaultState.loanConfig));
        }
        this.state.loanConfig.enabled = Boolean(enabled);
        if (options && typeof options === 'object') {
            if (options.country) this.state.loanConfig.country = options.country;
            if (options.currency) this.state.loanConfig.currency = options.currency;
            if (typeof options.totalPrincipal === 'number') this.state.loanConfig.totalPrincipal = options.totalPrincipal;
            if (typeof options.principalLeft === 'number') this.state.loanConfig.principalLeft = options.principalLeft;
            if (typeof options.emi === 'number') this.state.loanConfig.emi = options.emi;
            if (typeof options.annualInterestRate === 'number') this.state.loanConfig.annualInterestRate = options.annualInterestRate;
            if (typeof options.emiDrawDate === 'number') this.state.loanConfig.emiDrawDate = options.emiDrawDate;
            if (typeof options.totalDues === 'number') this.state.loanConfig.totalDues = options.totalDues;
            if (typeof options.duesPaid === 'number') this.state.loanConfig.duesPaid = options.duesPaid;
        }
        this.saveData();
    }

    /**
     * Mark onboarding setup as completed and perform cloud synchronization.
     * Records local completion safely to localStorage first, then attempts pushToSupabase.
     * Guarantees that local configuration is preserved even if cloud synchronization fails.
     *
     * @param {boolean} [completed=true]
     * @param {Object} [options]
     * @returns {Promise<{localSaved: boolean, cloudSynced: boolean, accountStatus: string, cloudSyncStatus: string, error?: string}>}
     */
    async markOnboardingCompleted(completed = true, options = {}) {
        const isComplete = Boolean(completed);

        // 1. Safely persist local configuration first
        this.updatePreferences({
            onboardingCompleted: isComplete,
            onboardingStep: isComplete ? 4 : 1
        });

        if (!isComplete) {
            this.accountStatus = 'ONBOARDING_INCOMPLETE';
            this.cloudSyncStatus = 'IDLE';
            return {
                localSaved: true,
                cloudSynced: false,
                accountStatus: this.accountStatus,
                cloudSyncStatus: this.cloudSyncStatus
            };
        }

        // Mark local completion, awaiting cloud confirmation
        this.accountStatus = 'PENDING_CLOUD_SYNC';
        this.cloudSyncStatus = 'SYNCING';

        // 2. Check for active authentication session
        if (typeof supabaseClient === 'undefined' || !supabaseClient.session || !supabaseClient.session.user) {
            // Local configuration is safe. Cloud sync remains idle/unauthenticated.
            this.cloudSyncStatus = 'IDLE';
            return {
                localSaved: true,
                cloudSynced: false,
                accountStatus: this.accountStatus,
                cloudSyncStatus: this.cloudSyncStatus
            };
        }

        // 3. Attempt cloud synchronization
        const pushSuccess = await this.pushToSupabase({ allowOnboardingPersist: true, force: true });
        if (pushSuccess) {
            this.accountStatus = 'EXISTING_USER';
            this.cloudSyncStatus = 'CONFIRMED';
            this.syncError = null;
            return {
                localSaved: true,
                cloudSynced: true,
                accountStatus: this.accountStatus,
                cloudSyncStatus: this.cloudSyncStatus
            };
        } else {
            // Local configuration remains completely safe in localStorage!
            this.accountStatus = 'SYNC_FAILED';
            this.cloudSyncStatus = 'FAILED';
            return {
                localSaved: true,
                cloudSynced: false,
                accountStatus: this.accountStatus,
                cloudSyncStatus: this.cloudSyncStatus,
                error: this.syncError || 'Cloud synchronization failed'
            };
        }
    }

    /**
     * Retry cloud synchronization following a failed push.
     * Guaranteed to preserve local configuration and financial state.
     * @returns {Promise<{success: boolean, accountStatus: string, cloudSyncStatus: string, error?: string}>}
     */
    async retryCloudSync() {
        if (typeof supabaseClient === 'undefined' || !supabaseClient.session || !supabaseClient.session.user) {
            return {
                success: false,
                accountStatus: this.accountStatus,
                cloudSyncStatus: this.cloudSyncStatus,
                error: 'No active authentication session'
            };
        }

        this.cloudSyncStatus = 'SYNCING';
        const pushSuccess = await this.pushToSupabase({ allowOnboardingPersist: true, force: true });
        if (pushSuccess) {
            this.accountStatus = 'EXISTING_USER';
            this.cloudSyncStatus = 'CONFIRMED';
            this.syncError = null;
            return {
                success: true,
                accountStatus: this.accountStatus,
                cloudSyncStatus: this.cloudSyncStatus
            };
        } else {
            this.accountStatus = 'SYNC_FAILED';
            this.cloudSyncStatus = 'FAILED';
            return {
                success: false,
                accountStatus: this.accountStatus,
                cloudSyncStatus: this.cloudSyncStatus,
                error: this.syncError || 'Cloud synchronization retry failed'
            };
        }
    }

    /**
     * Mark guided tour as completed.
     * @param {boolean} [completed=true]
     */
    markTourCompleted(completed = true) {
        return this.updatePreferences({ tourCompleted: Boolean(completed) });
    }

    /**
     * Mark guided tour as dismissed / skipped.
     * @param {boolean} [dismissed=true]
     */
    markTourDismissed(dismissed = true) {
        return this.updatePreferences({ tourDismissed: Boolean(dismissed) });
    }
}

const storage = new StorageManager();
window.storage = storage;
