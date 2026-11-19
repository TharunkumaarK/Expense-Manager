if (!window.SUPABASE_CONFIG?.storageKey) {
    throw new Error('Storage namespace is missing from configuration.');
}

const BASE_STORAGE_KEY = window.SUPABASE_CONFIG.storageKey;

const defaultState = {
    schemaVersion: 3,
    revision: 1,
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
        JP: { enabled: true, monthlyTotal: 0, rolloverEnabled: true, carryover: 0 },
        IN: { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 },
        DE: { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 }
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
        this.tabId = 'tab_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
        this.lastConfirmedCloudRevision = Number(this.state?.revision) || 1;
        this.activeConflict = null;
        this.syncChannel = null;
        this._inExclusiveTransaction = false;
        this._isSyncWorkerRunning = false;
        this.initSyncChannel();
    }

    /**
     * Check if currently running within an exclusive coordinator transaction.
     * @returns {boolean}
     */
    isInsideExclusiveTransaction() {
        return Boolean(this._inExclusiveTransaction);
    }

    /**
     * Compute the scoped lock name for the authenticated user and active storage key.
     */
    getLockScopeName() {
        return `em_lock_${this.currentUserId || this.getActiveStorageKey()}`;
    }

    /**
     * Reload authoritative state from local storage.
     * Guarantees that in-flight mutations always operate against the freshest persisted state.
     */
    reloadAuthoritativeLocalState() {
        if (typeof localStorage === 'undefined') return false;
        try {
            const raw = localStorage.getItem(this.getActiveStorageKey());
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && parsed.wallets && Array.isArray(parsed.transactions)) {
                    this.state = parsed;
                    if (typeof this.state.revision !== 'number') {
                        this.state.revision = 1;
                    }
                    this._attachHistoryGetters(this.state);
                    this._attachBudgetAccessors(this.state);
                    return true;
                }
            }
        } catch (e) {
            console.error('[StorageManager] Failed to reload authoritative local state:', e);
        }
        return false;
    }

    /**
     * Direct synchronous write to localStorage without triggering recursion or external locks.
     */
    _saveDataDirect() {
        if (this.state._haltedMigration || this.migrationError) {
            console.warn('[Storage] _saveDataDirect blocked because migration is in halted safety state.');
            return false;
        }
        try {
            if (this.state.budgets) {
                this.state.jpTotalBudget = this.state.budgets.JP?.monthlyTotal || 0;
                this.state.inTotalBudget = this.state.budgets.IN?.monthlyTotal || 0;
            }
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.getActiveStorageKey(), JSON.stringify(this.state));
            }
            return true;
        } catch (e) {
            console.error('[StorageManager] _saveDataDirect failed:', e);
            return false;
        }
    }

    /**
     * Execute an asynchronous financial mutation within an exclusive cross-tab lock.
     * Uses the browser Web Locks API (navigator.locks) where available, falling back
     * to a robust cooperative localStorage spin-lock with exponential backoff.
     *
     * @param {Function} mutationFn (state) => any
     * @param {Object} [options]
     * @param {number} [options.expectedRevision]
     * @returns {Promise<any>}
     */
    async runExclusive(mutationFn, options = {}) {
        const lockName = this.getLockScopeName();

        const pipeline = async () => {
            // 1. Reload latest authoritative local state
            this.reloadAuthoritativeLocalState();

            // 2. Validate revision if specified
            if (options.expectedRevision !== undefined && this.state.revision !== options.expectedRevision) {
                return {
                    success: false,
                    code: 'STATE_CONFLICT',
                    conflict: true,
                    error: `Financial revision changed in another window (expected ${options.expectedRevision}, found ${this.state.revision}).`
                };
            }

            // Snapshot state for atomic rollback on failure
            const preMutationSnapshot = JSON.parse(JSON.stringify(this.state));

            // Set coordinator context flag to suppress nested duplicate saves
            this._inExclusiveTransaction = true;
            let result;
            try {
                // 3. Execute proposed mutation in-memory
                result = await mutationFn(this.state);
            } catch (err) {
                // Atomic rollback on exception
                this.state = preMutationSnapshot;
                this._inExclusiveTransaction = false;
                throw err;
            }

            if (result === false || (result && typeof result === 'object' && result.success === false)) {
                // Atomic rollback on failure result
                this.state = preMutationSnapshot;
                this._inExclusiveTransaction = false;
                return result;
            }

            // 4. Advance revision and timestamp exactly once
            this.state.revision = (Number(this.state.revision) || 0) + 1;
            this.state._updatedAt = new Date().toISOString();

            // Allow the single authoritative commit
            this._inExclusiveTransaction = false;

            // 5. Persist to local storage exactly once
            const saved = this._saveDataDirect();
            if (!saved) {
                this.state = preMutationSnapshot;
                throw new Error("Local persistence failed (storage quota or access error).");
            }

            // 6. Broadcast update event to all other tabs exactly once
            this.broadcastStateChange({
                type: 'FINANCIAL_STATE_MUTATED',
                revision: this.state.revision,
                fingerprint: this.computeFinancialFingerprint(this.state),
                sourceTabId: this.tabId,
                timestamp: this.state._updatedAt
            });

            // 7. Enqueue into serialized cloud synchronization queue
            if (this.initialSyncDone && typeof supabaseClient !== 'undefined' && supabaseClient.session?.user?.id) {
                this.enqueueCloudSync(this.state.revision);
            }

            return result !== undefined ? result : true;
        };

        if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
            return await navigator.locks.request(lockName, { mode: 'exclusive' }, pipeline);
        } else {
            // Check if multi-tab browser context without Web Locks API
            const isMultiTabBrowser = (typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined');
            if (isMultiTabBrowser) {
                return {
                    success: false,
                    code: 'LOCK_UNAVAILABLE',
                    error: 'Exclusive Web Locks API is unavailable in this browser environment. Concurrent financial writes refused for safety.'
                };
            }
            return await this._runWithFallbackLock(lockName, pipeline);
        }
    }

    /**
     * Enqueue a pending state revision into the serialized cloud sync queue.
     * Guarantees monotonic, ordered, non-overlapping cloud pushes.
     * @param {number} targetRevision
     */
    enqueueCloudSync(targetRevision) {
        if (typeof supabaseClient === 'undefined' || !supabaseClient.session?.user?.id) {
            this.cloudSyncStatus = 'LOCAL_SAVED';
            if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                app.updateSyncStatusPill('LOCAL_ONLY');
            }
            return;
        }
        if (this.cloudSyncStatus === 'CONFLICT') {
            console.warn('[Sync] Queue halted: active conflict detected.');
            return;
        }
        const userId = supabaseClient.session.user.id;
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(`${this.getActiveStorageKey()}_pending_sync`, JSON.stringify({
                    userId,
                    targetRevision: Number(targetRevision) || this.state.revision,
                    timestamp: Date.now()
                }));
            } catch (e) { }
        }
        this.cloudSyncStatus = 'SYNC_PENDING';
        if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
            app.updateSyncStatusPill('SYNC_PENDING');
        }
        this._drainSyncQueue();
    }

    /**
     * Drain the cloud synchronization queue sequentially.
     * Ensures only one in-flight push occurs per client and revisions advance monotonically.
     */
    async _drainSyncQueue() {
        if (this._isSyncWorkerRunning) return;
        if (typeof supabaseClient === 'undefined' || !supabaseClient.session?.user?.id) return;
        if (this.cloudSyncStatus === 'CONFLICT') return;

        this._isSyncWorkerRunning = true;
        try {
            while (typeof supabaseClient !== 'undefined' && supabaseClient.session?.user?.id) {
                if (this.cloudSyncStatus === 'CONFLICT') break;
                const targetRev = Number(this.state.revision) || 1;
                const currentConfirmed = Number(this.lastConfirmedCloudRevision) || 0;
                if (currentConfirmed >= targetRev) {
                    this.cloudSyncStatus = 'CONFIRMED';
                    if (typeof localStorage !== 'undefined') {
                        localStorage.removeItem(`${this.getActiveStorageKey()}_pending_sync`);
                    }
                    if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                        app.updateSyncStatusPill('SYNCED');
                    }
                    break;
                }

                this.cloudSyncStatus = 'SYNCING';
                if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                    app.updateSyncStatusPill('SYNCING');
                }

                const pushOk = await this.pushToSupabase();
                if (pushOk) {
                    if (this.state.revision <= this.lastConfirmedCloudRevision) {
                        this.cloudSyncStatus = 'CONFIRMED';
                        if (typeof localStorage !== 'undefined') {
                            localStorage.removeItem(`${this.getActiveStorageKey()}_pending_sync`);
                        }
                        if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                            app.updateSyncStatusPill('SYNCED');
                        }
                        break;
                    }
                } else {
                    break;
                }
            }
        } finally {
            this._isSyncWorkerRunning = false;
        }
    }

    /**
     * Fallback lock coordination for environments without navigator.locks.
     * Uses cooperative localStorage lease with monotonic timestamp and exponential backoff.
     */
    async _runWithFallbackLock(lockName, fn) {
        if (typeof localStorage === 'undefined') {
            return await fn();
        }
        const lockKey = `${lockName}_lease`;
        const timeoutMs = 8000;
        const startTime = Date.now();
        let acquired = false;

        while (Date.now() - startTime < timeoutMs) {
            const now = Date.now();
            const raw = localStorage.getItem(lockKey);
            let canTake = false;
            if (!raw) {
                canTake = true;
            } else {
                try {
                    const lockObj = JSON.parse(raw);
                    if (typeof lockObj.expiresAt === 'number' && (lockObj.expiresAt < now || lockObj.owner === this.tabId)) {
                        canTake = true;
                    }
                } catch (e) {
                    canTake = true;
                }
            }
            if (canTake) {
                try {
                    localStorage.setItem(lockKey, JSON.stringify({
                        owner: this.tabId,
                        acquiredAt: now,
                        expiresAt: now + 5000
                    }));
                    acquired = true;
                    break;
                } catch (e) {
                    // Retry
                }
            }
            await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
        }

        if (!acquired) {
            throw new Error(`Failed to acquire exclusive coordination lock: ${lockName}`);
        }

        try {
            return await fn();
        } finally {
            try {
                const cur = localStorage.getItem(lockKey);
                if (cur) {
                    const lockObj = JSON.parse(cur);
                    if (lockObj.owner === this.tabId) {
                        localStorage.removeItem(lockKey);
                    }
                }
            } catch (e) { }
        }
    }

    /**
     * Initialize cross-tab synchronization channel and storage event fallback.
     */
    initSyncChannel() {
        if (typeof BroadcastChannel !== 'undefined') {
            try {
                this.syncChannel = new BroadcastChannel('expense_manager_sync');
                this.syncChannel.onmessage = (event) => this.handleSyncMessage(event.data);
            } catch (e) {
                console.warn('[StorageManager] BroadcastChannel unavailable, using storage event fallback:', e);
            }
        }
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (e) => {
                if (e.key === `${this.getActiveStorageKey()}_sync_event` && e.newValue) {
                    try {
                        this.handleSyncMessage(JSON.parse(e.newValue));
                    } catch (err) { }
                }
            });
            window.addEventListener('online', () => this.onNetworkOnline());
            window.addEventListener('offline', () => this.onNetworkOffline());
        }
    }

    /**
     * Broadcast an authoritative financial state change to all other tabs and windows.
     */
    broadcastStateChange(payload) {
        const fullPayload = {
            ...payload,
            state: this.state
        };
        if (this.syncChannel) {
            try {
                this.syncChannel.postMessage(fullPayload);
            } catch (e) { }
        }
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(`${this.getActiveStorageKey()}_sync_event`, JSON.stringify({
                    ...payload,
                    state: this.state,
                    _nonce: Math.random()
                }));
            }
        } catch (e) { }
    }

    /**
     * Handle incoming cross-tab synchronization events.
     */
    handleSyncMessage(data) {
        if (!data || data.sourceTabId === this.tabId) return;
        if (data.type === 'FINANCIAL_STATE_MUTATED') {
            console.log(`[StorageManager] Cross-tab financial update received (Rev ${data.revision}) from ${data.sourceTabId}`);
            if (typeof app !== 'undefined' && typeof app.isAnyModalDirty === 'function' && app.isAnyModalDirty()) {
                app.showInModalConflictWarning(data.revision);
            } else {
                if (data.state && typeof data.state === 'object' && data.state.wallets) {
                    this.state = data.state;
                    this._attachHistoryGetters(this.state);
                    this._attachBudgetAccessors(this.state);
                } else {
                    this.reloadAuthoritativeLocalState();
                }
                if (typeof app !== 'undefined') {
                    if (typeof app.renderAll === 'function') app.renderAll();
                    if (typeof app.updateSyncStatusPill === 'function') app.updateSyncStatusPill('SYNCED', 'Synced');
                }
            }
        }
    }

    /**
     * Handle network recovery.
     */
    onNetworkOnline() {
        console.log('[StorageManager] Network online detected. Attempting pending cloud synchronization...');
        this.cloudSyncStatus = 'SYNCING';
        if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
            app.updateSyncStatusPill('SYNC_PENDING');
        }
        if (this.initialSyncDone && typeof supabaseClient !== 'undefined' && supabaseClient.session?.user?.id) {
            this.pushToSupabase();
        }
    }

    /**
     * Handle network drop.
     */
    onNetworkOffline() {
        console.log('[StorageManager] Network offline detected. Switching to local persistence mode.');
        this.cloudSyncStatus = 'FAILED';
        if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
            app.updateSyncStatusPill('SYNC_FAILED', 'Offline');
        }
    }

    /**
     * Stash local uncommitted state and conflicting remote state into an isolated recovery slot.
     */
    stashConflictState(localState, remoteState) {
        if (arguments.length === 1) {
            remoteState = localState;
            localState = this.state;
        }
        localState = localState || this.state;
        remoteState = remoteState || {};
        const conflictRecord = {
            conflictId: `conflict_${Date.now()}`,
            detectedAt: new Date().toISOString(),
            localRevision: localState?.revision || 1,
            remoteRevision: remoteState?.revision || 1,
            localState: localState ? JSON.parse(JSON.stringify(localState)) : null,
            remoteState: remoteState ? JSON.parse(JSON.stringify(remoteState)) : null,
            detected: true
        };
        this.activeConflict = conflictRecord;
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(`${this.getActiveStorageKey()}_conflict_stash`, JSON.stringify(conflictRecord));
            } catch (e) {
                console.error('[StorageManager] Failed to persist conflict stash:', e);
            }
        }
        return conflictRecord;
    }

    /**
     * Resolve a detected cloud concurrency conflict according to the chosen strategy.
     * @param {'overwrite_cloud' | 'accept_cloud' | 'merge_nonconflicting'} strategy
     */
    async resolveConflict(strategy) {
        if (!this.activeConflict && typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(`${this.getActiveStorageKey()}_conflict_stash`);
            if (raw) {
                try { this.activeConflict = JSON.parse(raw); } catch (e) { }
            }
        }
        if (!this.activeConflict) {
            return { success: false, error: 'No active conflict record found.' };
        }

        if (strategy === 'overwrite_cloud') {
            console.log('[StorageManager] Overwriting cloud with local state.');
            // 1. Create durable backup of the remote state before overwriting
            const remoteBackupKey = `${this.getActiveStorageKey()}_remote_backup_${Date.now()}`;
            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(remoteBackupKey, JSON.stringify(this.activeConflict.remoteState));
                    if (!localStorage.getItem(remoteBackupKey)) {
                        return { success: false, error: 'Failed to verify durable remote backup before overwriting cloud.' };
                    }
                } catch (e) {
                    return { success: false, error: `Remote backup failed: ${e.message}` };
                }
            }

            // 2. Re-check current server revision to ensure server has not advanced again
            let currentServerRev = Number(this.activeConflict.remoteRevision || 0);
            if (typeof supabaseClient !== 'undefined' && supabaseClient.session?.user?.id) {
                try {
                    const { data: latestRemote } = await supabaseClient.client
                        .from('app_state')
                        .select('state, updated_at')
                        .eq('user_id', supabaseClient.session.user.id)
                        .single();
                    if (latestRemote && latestRemote.state) {
                        const actualRemoteRev = Number(latestRemote.state.revision || 0);
                        if (actualRemoteRev !== currentServerRev) {
                            // Server moved again! Refresh conflict and abort overwrite
                            console.warn(`[StorageManager] Server revision moved from ${currentServerRev} to ${actualRemoteRev} during conflict review.`);
                            this.stashConflictState(this.state, latestRemote.state);
                            return {
                                success: false,
                                conflict: true,
                                error: 'Server revision advanced during review. Conflict stash refreshed with latest cloud state.'
                            };
                        }
                    }
                } catch (err) {
                    console.warn('[StorageManager] Server pre-flight check failed, proceeding cautiously:', err);
                }
            }

            this.state.revision = Math.max(
                currentServerRev,
                Number(this.activeConflict.localRevision || 0)
            ) + 1;
            this.state._updatedAt = new Date().toISOString();
            this._saveDataDirect();
            this.lastConfirmedCloudRevision = currentServerRev;
            const pushed = await this.pushToSupabase({ force: true });
            if (pushed) {
                this.activeConflict = null;
                if (typeof localStorage !== 'undefined') {
                    localStorage.removeItem(`${this.getActiveStorageKey()}_conflict_stash`);
                }
                if (typeof app !== 'undefined') {
                    app.updateSyncStatusPill('SYNCED');
                    app.renderAll();
                }
                return { success: true, strategy: 'overwrite_cloud' };
            }
            return { success: false, error: 'Failed to push local state to Supabase.' };
        } else if (strategy === 'accept_cloud') {
            console.log('[StorageManager] Accepting cloud state and archiving local draft.');
            // 1. Create durable local backup in localStorage and verify persistence
            const localPayload = JSON.stringify(this.activeConflict.localState || this.state, null, 2);
            const localBackupKey = `${this.getActiveStorageKey()}_local_backup_${Date.now()}`;
            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(localBackupKey, localPayload);
                    if (!localStorage.getItem(localBackupKey)) {
                        return { success: false, error: 'Failed to verify durable local backup in storage before adopting cloud state.' };
                    }
                } catch (e) {
                    return { success: false, error: `Local backup failed: ${e.message}` };
                }
            }

            // Optional browser file download if supported
            if (typeof window !== 'undefined' && typeof document !== 'undefined') {
                try {
                    const blob = new Blob([localPayload], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ExpenseManager_LocalConflict_Backup_${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (e) {
                    console.warn('[StorageManager] Could not trigger download directly:', e);
                }
            }

            // 2. Validate and adopt remote state safely
            const preview = this.previewContinuousLedgerMigration(this.activeConflict.remoteState);
            if (!preview.success) {
                return { success: false, error: `Remote state migration failed: ${preview.error}` };
            }
            this.applyContinuousLedgerMigration(preview, { isAuthoritativeRemote: true });
            this.lastConfirmedCloudRevision = Number(this.state.revision) || 1;
            this.cloudSyncStatus = 'CONFIRMED';
            this.activeConflict = null;
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(`${this.getActiveStorageKey()}_conflict_stash`);
            }
            if (typeof app !== 'undefined') {
                app.updateSyncStatusPill('SYNCED');
                app.renderAll();
            }
            return { success: true, strategy: 'accept_cloud' };
        } else if (strategy === 'merge_nonconflicting') {
            console.warn('[StorageManager] Automated merge requested, but disabled for financial safety.');
            return {
                success: false,
                code: 'MERGE_DISABLED',
                error: 'Automated transaction merging without 3-way balance reconstruction baseline is disabled for financial safety.'
            };
        }

        return { success: false, error: `Unknown conflict strategy: ${strategy}` };
    }

    /**
     * Acquire a cooperative cross-tab lease lock for recovery operations.
     * Prevents competing tabs from simultaneously committing divergent recovery plans.
     * @param {number} [leaseDurationMs=5000]
     * @returns {boolean} True if lock was acquired, false if held by another live tab.
     */
    acquireRecoveryLock(leaseDurationMs = 5000) {
        if (typeof localStorage === 'undefined') return true;
        const lockKey = `${this.getActiveStorageKey()}_recovery_lock`;
        const now = Date.now();
        try {
            const raw = localStorage.getItem(lockKey);
            if (raw) {
                const lock = JSON.parse(raw);
                if (lock && typeof lock.expiresAt === 'number' && lock.expiresAt > now && lock.owner !== this.tabId) {
                    return false; // Actively held by another tab
                }
            }
            localStorage.setItem(lockKey, JSON.stringify({
                owner: this.tabId,
                acquiredAt: now,
                expiresAt: now + leaseDurationMs
            }));
            return true;
        } catch (e) {
            // Fail closed on storage error during lock attempt
            return false;
        }
    }

    /**
     * Release the cross-tab lease lock if owned by this tab.
     */
    releaseRecoveryLock() {
        if (typeof localStorage === 'undefined') return;
        const lockKey = `${this.getActiveStorageKey()}_recovery_lock`;
        try {
            const raw = localStorage.getItem(lockKey);
            if (raw) {
                const lock = JSON.parse(raw);
                if (lock && lock.owner === this.tabId) {
                    localStorage.removeItem(lockKey);
                }
            }
        } catch (e) {
            // Ignore errors on release
        }
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
                        rolloverEnabled: state.jpBudgetRolloverEnabled !== undefined ? Boolean(state.jpBudgetRolloverEnabled) : true,
                        carryover: 0
                    },
                    IN: {
                        enabled: inVal > 0 || hasInWallets,
                        monthlyTotal: inVal,
                        rolloverEnabled: state.inBudgetRolloverEnabled !== undefined ? Boolean(state.inBudgetRolloverEnabled) : false,
                        carryover: 0
                    },
                    DE: {
                        enabled: false,
                        monthlyTotal: 0,
                        rolloverEnabled: false,
                        carryover: 0
                    }
                };
            } else {
                if (!state.budgets.JP) {
                    state.budgets.JP = { enabled: true, monthlyTotal: Number(state.jpTotalBudget) || 0, rolloverEnabled: true, carryover: 0 };
                }
                if (!state.budgets.IN) {
                    state.budgets.IN = { enabled: (Number(state.inTotalBudget) || 0) > 0, monthlyTotal: Number(state.inTotalBudget) || 0, rolloverEnabled: false, carryover: 0 };
                }
                if (!state.budgets.DE) {
                    state.budgets.DE = { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 };
                }
                ['JP', 'IN', 'DE'].forEach(c => {
                    if (state.budgets[c] && typeof state.budgets[c].carryover !== 'number') {
                        state.budgets[c].carryover = 0;
                    }
                });
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

                // Strict Revision-Lineage Sync
                const localFingerprint = this.computeFinancialFingerprint(this.state);
                const remoteFingerprint = this.computeFinancialFingerprint(remote);
                const localRev = Number(this.state.revision || 1);
                const remoteRev = Number(remote.revision || 1);
                const lastConfirmedRev = Number(this.lastConfirmedCloudRevision || 0);

                const remoteNeedsMigration = remote && (!remote.schemaVersion || remote.schemaVersion < 3 ||
                    (Array.isArray(remote.history) && remote.history.some(h => {
                        const desc = Object.getOwnPropertyDescriptor(h, 'transactions');
                        return desc && Array.isArray(desc.value) && desc.value.length > 0;
                    })) || !remote.preferences || !remote.budgets);

                // Case 1: Identical financial state
                if (localFingerprint === remoteFingerprint) {
                    console.log('[Sync] Local and remote fingerprints match. System in sync.');
                    this.lastConfirmedCloudRevision = Math.max(localRev, remoteRev);
                    this.accountStatus = 'EXISTING_USER';
                    this.cloudSyncStatus = 'CONFIRMED';
                    this.initialSyncDone = true;
                    if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                        app.updateSyncStatusPill('SYNCED');
                    }
                    return false;
                }

                // Check pending local edits vs fresh device
                const localTxCount = this.getUniqueTransactionCount(this.state);
                const hasPendingLocalEdits = localRev > lastConfirmedRev && !this.isFirstLoad && localTxCount > 0;

                let shouldUseRemote = false;
                if (this.isFirstLoad || localTxCount === 0) {
                    // Fresh device / returning user without local transactions adopting cloud
                    shouldUseRemote = true;
                } else if (!hasPendingLocalEdits && remoteRev >= localRev) {
                    // Clean fast-forward: cloud has advanced and local has no unpushed edits
                    shouldUseRemote = true;
                } else if (hasPendingLocalEdits && remoteRev <= lastConfirmedRev) {
                    // Local is ahead, remote has not moved since lastConfirmedRev
                    shouldUseRemote = false;
                } else {
                    // Branch divergence: Both local and remote have advanced past lastConfirmedRev!
                    // Do NOT allow either side to silently overwrite! Stash conflict and require resolution.
                    console.warn(`[Sync] Branch divergence detected! Local rev ${localRev}, Remote rev ${remoteRev}, Last confirmed rev ${lastConfirmedRev}.`);
                    this.stashConflictState(this.state, remote);
                    this.accountStatus = 'EXISTING_USER';
                    this.cloudSyncStatus = 'CONFLICT';
                    this.syncError = 'Both local and cloud states have divergent modifications.';
                    this.initialSyncDone = true;
                    if (typeof app !== 'undefined') {
                        if (typeof app.updateSyncStatusPill === 'function') app.updateSyncStatusPill('CONFLICT_DETECTED');
                        if (typeof app.openConflictResolutionModal === 'function') app.openConflictResolutionModal();
                    }
                    return false;
                }

                if (shouldUseRemote) {
                    console.log(`[Sync] Remote state accepted (Rev ${remoteRev} vs local ${localRev}). Applying...`);
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

                    this.lastConfirmedCloudRevision = remoteRev;
                    this.isFirstLoad = false;
                    this.initialSyncDone = true;
                    this.checkRollover();

                    // Push migrated v3 state to Supabase only after successful validation
                    if (remoteNeedsMigration) {
                        await this.pushToSupabase({ force: true });
                    }

                    if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                        app.updateSyncStatusPill('SYNCED');
                    }
                    return true;
                } else {
                    console.log(`[Sync] Local state is ahead (Rev ${localRev} vs remote ${remoteRev}). Enqueuing conditional upload...`);
                    this.accountStatus = 'EXISTING_USER';
                    this.cloudSyncStatus = 'SYNC_PENDING';
                    this.initialSyncDone = true;
                    this.enqueueCloudSync(this.state.revision);
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
            if (options.force) {
                const { error } = await supabaseClient.client
                    .from('app_state')
                    .upsert({
                        user_id: userId,
                        state: this.state,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });

                if (error) {
                    console.error("[Sync] Failed to push to Supabase (forced):", error);
                    this.syncError = error.message || String(error);
                    this.cloudSyncStatus = 'FAILED';
                    if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                        app.updateSyncStatusPill('SYNC_FAILED');
                    }
                    return false;
                }
                this.syncError = null;
                this.lastConfirmedCloudRevision = Number(this.state.revision) || 1;
                this.cloudSyncStatus = 'CONFIRMED';
                if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                    app.updateSyncStatusPill('SYNCED');
                }
                return true;
            }

            const tableQuery = supabaseClient.client.from('app_state');
            if (typeof tableQuery.update !== 'function') {
                const { error } = await tableQuery.upsert({
                    user_id: userId,
                    state: this.state,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

                if (error) {
                    console.error("[Sync] Failed to push to Supabase (upsert fallback):", error);
                    this.syncError = error.message || String(error);
                    this.cloudSyncStatus = 'FAILED';
                    if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                        app.updateSyncStatusPill('SYNC_FAILED');
                    }
                    return false;
                }
                this.syncError = null;
                this.lastConfirmedCloudRevision = Number(this.state.revision) || 1;
                this.cloudSyncStatus = 'CONFIRMED';
                if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                    app.updateSyncStatusPill('SYNCED');
                }
                return true;
            }

            // Dual-Layer CAS conditional update matching state->>revision
            const expectedRev = Number(this.lastConfirmedCloudRevision) || 1;
            const { data, error } = await tableQuery
                .update({
                    state: this.state,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .eq('state->>revision', String(expectedRev))
                .select('state, updated_at');

            if (error) {
                console.error("[Sync] Conditional CAS update failed:", error);
                this.syncError = error.message || String(error);
                this.cloudSyncStatus = 'FAILED';
                if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                    app.updateSyncStatusPill('SYNC_FAILED');
                }
                return false;
            }

            // If 0 rows updated, server revision differs from expectedRev!
            if (!data || data.length === 0) {
                console.warn(`[Sync] Supabase CAS conflict! Expected remote revision ${expectedRev}, but cloud row was modified.`);
                const { data: remoteRow, error: fetchErr } = await supabaseClient.client
                    .from('app_state')
                    .select('state, updated_at')
                    .eq('user_id', userId)
                    .single();

                if (remoteRow && remoteRow.state) {
                    this.stashConflictState(this.state, remoteRow.state);
                    this.cloudSyncStatus = 'CONFLICT';
                    this.syncError = 'Cloud state was modified on another device.';
                    if (typeof app !== 'undefined') {
                        if (typeof app.updateSyncStatusPill === 'function') app.updateSyncStatusPill('CONFLICT_DETECTED');
                        if (typeof app.openConflictResolutionModal === 'function') app.openConflictResolutionModal();
                    }
                }
                return false;
            }

            this.syncError = null;
            this.lastConfirmedCloudRevision = Number(this.state.revision) || expectedRev + 1;
            this.cloudSyncStatus = 'CONFIRMED';
            if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                app.updateSyncStatusPill('SYNCED');
            }
            return true;
        } catch (e) {
            console.error("[Sync] Push to Supabase failed:", e);
            this.syncError = e.message || String(e);
            this.cloudSyncStatus = 'FAILED';
            if (typeof app !== 'undefined' && typeof app.updateSyncStatusPill === 'function') {
                app.updateSyncStatusPill('SYNC_FAILED');
            }
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
        if (this._inExclusiveTransaction) {
            // Context-Aware Persistence Ownership:
            // Mutation is currently executing within an authoritative coordinator transaction (runExclusive).
            // Intermediate persistence, revision advancement, and cloud sync are owned exclusively
            // by the coordinator boundary to guarantee exactly-once persistence.
            return true;
        }

        if (this.state._haltedMigration || this.migrationError) {
            console.warn('[Storage] saveData blocked because migration is in halted safety state.');
            return false;
        }
        try {
            if (this.state.budgets) {
                this.state.jpTotalBudget = this.state.budgets.JP?.monthlyTotal || 0;
                this.state.inTotalBudget = this.state.budgets.IN?.monthlyTotal || 0;
            }
            if (typeof this.state.revision !== 'number') {
                this.state.revision = 1;
            } else {
                this.state.revision = Number(this.state.revision) + 1;
            }
            this.state._updatedAt = new Date().toISOString();
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.getActiveStorageKey(), JSON.stringify(this.state));
            }
            this.broadcastStateChange({
                type: 'FINANCIAL_STATE_MUTATED',
                revision: this.state.revision,
                fingerprint: this.computeFinancialFingerprint(this.state),
                sourceTabId: this.tabId,
                timestamp: this.state._updatedAt
            });
            // Serialized cloud synchronization queue
            if (this.initialSyncDone && typeof supabaseClient !== 'undefined' && supabaseClient.session?.user?.id) {
                this.enqueueCloudSync(this.state.revision);
            }
            return true;
        } catch (e) {
            console.error("Failed to save data", e);
            return false;
        }
    }

    getCurrentMonthKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    /**
     * Compute chronological list of month keys strictly between startKey and endKey.
     * Inclusive of startKey, exclusive of endKey. Safely handles year transitions.
     * @param {string} startKey e.g. "2026-08"
     * @param {string} endKey e.g. "2026-11"
     * @returns {string[]} e.g. ["2026-08", "2026-09", "2026-10"]
     */
    getMonthRange(startKey, endKey) {
        if (!startKey || !endKey || startKey >= endKey) return [];
        const [startYear, startMonth] = startKey.split('-').map(Number);
        const [endYear, endMonth] = endKey.split('-').map(Number);
        if (!startYear || !startMonth || !endYear || !endMonth) return [];

        const months = [];
        let curYear = startYear;
        let curMonth = startMonth;

        while (curYear < endYear || (curYear === endYear && curMonth < endMonth)) {
            months.push(`${curYear}-${String(curMonth).padStart(2, '0')}`);
            curMonth++;
            if (curMonth > 12) {
                curMonth = 1;
                curYear++;
            }
        }
        return months;
    }

    /**
     * Detect unfinalized calendar months requiring budget reconciliation.
     * Guaranteed pure against unwanted mutations: only updates workflow state.
     * @returns {string[]} Chronological list of unfinalized month keys.
     */
    detectUnfinalizedMonths() {
        const actualMonth = this.getCurrentMonthKey();
        if (!this.state) return [];

        // Exclude accounts still undergoing onboarding or brand-new accounts
        if (this.state.preferences && this.state.preferences.onboardingCompleted === false) {
            return [];
        }
        if (this.isNewUser()) {
            return [];
        }

        const trackedMonth = this.state.currentMonthKey || actualMonth;
        const monthsToCheck = this.getMonthRange(trackedMonth, actualMonth);

        // Filter out any months already sealed and finalized in closedMonths
        const unfinalized = monthsToCheck.filter(m => {
            return !this.state.closedMonths || !this.state.closedMonths[m] || this.state.closedMonths[m].status !== 'closed';
        });

        if (unfinalized.length > 0) {
            this.budgetRecoveryState = 'BUDGET_RECOVERY_REQUIRED';
            this.unfinalizedMonths = unfinalized;
            this.state.budgetRecoveryState = 'BUDGET_RECOVERY_REQUIRED';
            this.state.unfinalizedMonths = unfinalized;
            return unfinalized;
        } else {
            this.budgetRecoveryState = 'RESOLVED';
            this.unfinalizedMonths = [];
            this.state.budgetRecoveryState = 'RESOLVED';
            this.state.unfinalizedMonths = [];
            if (this.state.currentMonthKey !== actualMonth) {
                this.state.currentMonthKey = actualMonth;
                this.saveData();
            }
            return [];
        }
    }

    getBudgetRecoveryStatus() {
        if (this.budgetRecoveryState) return this.budgetRecoveryState;
        if (this.state && this.state.budgetRecoveryState) return this.state.budgetRecoveryState;
        const unfinalized = this.detectUnfinalizedMonths();
        return unfinalized.length > 0 ? 'BUDGET_RECOVERY_REQUIRED' : 'RESOLVED';
    }

    checkRollover() {
        const actualMonth = this.getCurrentMonthKey();
        if (!this.state.currentMonthKey) {
            this.state.currentMonthKey = actualMonth;
            this.saveData();
            return { recoveryRequired: false };
        }

        const unfinalized = this.detectUnfinalizedMonths();
        if (unfinalized.length > 0) {
            console.log(`[StorageManager] Budget recovery required for unfinalized months: ${unfinalized.join(', ')}`);
            return { recoveryRequired: true, unfinalizedMonths: unfinalized };
        }

        if (this.state.currentMonthKey !== actualMonth) {
            this.state.currentMonthKey = actualMonth;
            this.saveData();
        }
        return { recoveryRequired: false };
    }

    /**
     * Compute a deterministic financial revision fingerprint covering 100% of financial information
     * that materially influences recovery calculations: currentMonthKey, workflow status, budgets,
     * wallet balances, closedMonths snapshots, preferences, and all transaction signatures.
     * Uses a dual 32-bit FNV-1a (64-bit composite hex hash) with stable-order canonical serialization.
     *
     * @param {Object} state
     * @returns {string} 16-character hexadecimal composite fingerprint hash.
     */
    computeFinancialFingerprint(state = this.state) {
        if (!state || typeof state !== 'object') return '0000000000000000';
        try {
            // Dual FNV-1a hash accumulators (64 bits total entropy)
            let h1 = 2166136261;
            let h2 = 2166136269;
            const updateHash = (str) => {
                if (!str) return;
                for (let i = 0; i < str.length; i++) {
                    const c = str.charCodeAt(i);
                    h1 ^= c;
                    h1 = Math.imul(h1, 16777619);
                    h2 ^= c;
                    h2 = Math.imul(h2, 16777627);
                }
            };

            // 1. Authoritative accounting calendar month
            updateHash(`M:${state.currentMonthKey || ''};`);

            // 2. Multi-country recurring budgets (stable country key sorting)
            const b = state.budgets || {};
            const budgetKeys = Object.keys(b).sort();
            for (const k of budgetKeys) {
                const bk = b[k] || {};
                const bkAmount = (typeof bk.amount !== 'undefined') ? bk.amount : (bk.monthlyTotal || 0);
                updateHash(`B:${k}:${bk.enabled ? 1 : 0}:${bkAmount}:${bk.monthlyTotal || 0}:${bk.rolloverEnabled ? 1 : 0}:${bk.carryover || 0};`);
            }

            // 3. Wallets collection (sorted by wallet ID)
            const w = state.wallets || {};
            const walletKeys = Object.keys(w).sort();
            for (const k of walletKeys) {
                const wk = w[k] || {};
                updateHash(`W:${k}:${wk.name || ''}:${wk.currency || ''}:${wk.region || ''}:${wk.type || ''}:${wk.balance || 0};`);
            }

            // 4. Closed month snapshots (sorted chronologically)
            const c = state.closedMonths || {};
            const closedKeys = Object.keys(c).sort();
            for (const k of closedKeys) {
                const ck = c[k] || {};
                updateHash(`C:${k}:${ck.status || ''}:${ck.baseBudget || 0}:${ck.spent || 0}:${ck.carryoverPrior || 0}:${ck.rolloverAdded || 0}:${ck.JPRolloverAdded || 0}:${ck.INRolloverAdded || 0}:${ck.DERolloverAdded || 0};`);
                if (ck.walletsSnapshot && typeof ck.walletsSnapshot === 'object') {
                    const snapKeys = Object.keys(ck.walletsSnapshot).sort();
                    for (const sk of snapKeys) {
                        updateHash(`CW:${sk}:${ck.walletsSnapshot[sk]?.balance || 0};`);
                    }
                }
            }

            // 5. User preferences relevant to accounting and budgeting
            const p = state.preferences || {};
            const pCountries = Array.isArray(p.countries) ? p.countries.slice().sort().join(',') : '';
            updateHash(`P:${pCountries}:${p.primaryCountry || ''}:${p.onboardingCompleted ? 1 : 0};`);

            // 6. Complete transaction ledger (100% of transactions in collection order)
            const txs = Array.isArray(state.transactions) ? state.transactions : [];
            updateHash(`TL:${txs.length};`);
            for (let i = 0; i < txs.length; i++) {
                const t = txs[i];
                if (!t) continue;
                updateHash(`T:${t.id || ''}:${t.type || ''}:${t.date || ''}:${t.amount || 0}:${t.currency || ''}:${t.region || ''}:${t.walletId || ''}:${t.categoryId || ''}:${t.sourceId || ''}:${t.destId || ''}:${t.sourceAmount || ''}:${t.destAmount || ''}:${t.exchangeRate || ''};`);
            }

            const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
            const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
            return `${hex1}${hex2}`;
        } catch (e) {
            return String(Date.now());
        }
    }

    /**
     * Validate all user-entered budget recovery inputs before generating preview or committing.
     * Rejects negative amounts, NaN, Infinity, unknown country codes, excessive precision, malformed months, and unsafe bounds.
     * @param {Object} customAdjustments
     * @param {string[]} unfinalizedMonths
     * @returns {{ valid: boolean, error?: string }}
     */
    validateRecoveryAdjustments(customAdjustments, unfinalizedMonths = []) {
        if (!customAdjustments || typeof customAdjustments !== 'object' || Array.isArray(customAdjustments)) {
            return { valid: false, error: 'Adjustments payload must be an object.' };
        }
        const validMonths = new Set(unfinalizedMonths || []);
        const validCountries = new Set(['JP', 'IN', 'DE']);

        for (const [mKey, countriesObj] of Object.entries(customAdjustments)) {
            // Strict calendar month validation rejecting 2026-00, 2026-13, 2026-99
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mKey)) {
                return { valid: false, error: `Invalid month key format '${mKey}'. Expected YYYY-MM with calendar month between 01 and 12.` };
            }
            const year = parseInt(mKey.split('-')[0], 10);
            if (isNaN(year) || year < 2000 || year > 2099) {
                return { valid: false, error: `Year in month key '${mKey}' out of valid range (2000-2099).` };
            }
            if (validMonths.size > 0 && !validMonths.has(mKey)) {
                return { valid: false, error: `Month '${mKey}' is not in the unfinalized months list.` };
            }
            if (!countriesObj || typeof countriesObj !== 'object' || Array.isArray(countriesObj)) {
                return { valid: false, error: `Adjustments for month '${mKey}' must be an object.` };
            }
            for (const [code, adj] of Object.entries(countriesObj)) {
                if (!validCountries.has(code)) {
                    return { valid: false, error: `Unsupported country code '${code}' in month '${mKey}'.` };
                }
                if (!adj || typeof adj !== 'object' || Array.isArray(adj)) {
                    return { valid: false, error: `Adjustment for '${code}' in month '${mKey}' must be an object.` };
                }
                if (typeof adj.baseBudget !== 'undefined') {
                    if (adj.baseBudget === null || adj.baseBudget === '' || typeof adj.baseBudget === 'boolean') {
                        return { valid: false, error: `Base budget for ${code} in month ${mKey} cannot be null, empty, or boolean.` };
                    }
                    const amt = Number(adj.baseBudget);
                    if (typeof amt !== 'number' || isNaN(amt) || !isFinite(amt) || amt < 0 || amt > 1e12) {
                        return { valid: false, error: `Invalid base budget amount '${adj.baseBudget}' for ${code} in month ${mKey}. Must be a finite number between 0 and 1e12.` };
                    }
                    if (code === 'JP' && !Number.isInteger(amt)) {
                        return { valid: false, error: `Japanese Yen budget for ${mKey} must be a whole integer.` };
                    }
                    if (code === 'IN' || code === 'DE') {
                        const str = amt.toString();
                        if (str.includes('e') || str.includes('E')) {
                            return { valid: false, error: `Budget for ${code} in ${mKey} contains exponential notation.` };
                        }
                        const parts = str.split('.');
                        if (parts.length > 1 && parts[1].length > 2) {
                            return { valid: false, error: `Budget for ${code} in ${mKey} cannot exceed 2 decimal places.` };
                        }
                    }
                }
                if (typeof adj.rolloverEnabled !== 'undefined' && typeof adj.rolloverEnabled !== 'boolean') {
                    return { valid: false, error: `rolloverEnabled for ${code} in ${mKey} must be boolean.` };
                }
            }
        }
        return { valid: true };
    }

    /**
     * Compute a pure, read-only preview of budget reconciliation across unfinalized months.
     * Does NOT mutate state.
     *
     * @param {string} option 'review' | 'continue' | 'fresh'
     * @param {Object} customAdjustments Per-month adjustments { [monthKey]: { [countryCode]: { baseBudget, rolloverEnabled } } }
     * @returns {Object} Complete projection of month-by-month closures and resulting active month carryover.
     */
    getBudgetRecoveryPreview(option = 'review', customAdjustments = {}) {
        const unfinalized = this.detectUnfinalizedMonths();
        const actualMonth = this.getCurrentMonthKey();
        const supportedCountries = ['JP', 'IN', 'DE'];

        // Strict engine-level validation for all adjustment inputs
        if (customAdjustments && Object.keys(customAdjustments).length > 0) {
            const valCheck = this.validateRecoveryAdjustments(customAdjustments, unfinalized);
            if (!valCheck.valid) {
                return {
                    success: false,
                    error: valCheck.error,
                    unfinalizedMonths: unfinalized,
                    monthsPreview: [],
                    activeMonthSummary: { monthKey: actualMonth, countries: {} },
                    stateToken: this.computeFinancialFingerprint()
                };
            }
        }

        const monthsPreview = [];
        const runningCarryover = {};

        // Initialize incoming carryover for each country
        supportedCountries.forEach(code => {
            const b = (this.state.budgets && this.state.budgets[code]) || {};
            // If there's an immediate prior closed month, read its carryover
            const priorMonthKey = this.getMonthRange(this.state.currentMonthKey, actualMonth)[0];
            let priorClosed = null;
            if (this.state.closedMonths && priorMonthKey) {
                const keys = Object.keys(this.state.closedMonths).filter(k => k < priorMonthKey).sort();
                if (keys.length > 0) {
                    priorClosed = this.state.closedMonths[keys[keys.length - 1]];
                }
            }
            if (priorClosed && typeof priorClosed[`${code}RolloverAdded`] === 'number') {
                runningCarryover[code] = priorClosed[`${code}RolloverAdded`];
            } else {
                runningCarryover[code] = Number(b.carryover || 0);
            }
        });

        // Sequential calculation for every unfinalized month
        unfinalized.forEach((mKey, idx) => {
            const monthData = {
                monthKey: mKey,
                countries: {}
            };

            supportedCountries.forEach(code => {
                const b = (this.state.budgets && this.state.budgets[code]) || { enabled: false, monthlyTotal: 0, rolloverEnabled: false };
                const isEnabled = Boolean(b.enabled);
                const defaultBaseBudget = Number(b.monthlyTotal || 0);
                const defaultRolloverEnabled = Boolean(b.rolloverEnabled);

                let baseBudget = defaultBaseBudget;
                let rolloverEnabled = defaultRolloverEnabled;
                let provenance = 'reused_active_setting';

                // Look for prior closed snapshot
                let priorSnapshotBudget = null;
                if (this.state.closedMonths) {
                    const keys = Object.keys(this.state.closedMonths).filter(k => k < mKey).sort();
                    if (keys.length > 0) {
                        const lastSnap = this.state.closedMonths[keys[keys.length - 1]];
                        if (typeof lastSnap[`${code}TotalBudget`] === 'number') {
                            priorSnapshotBudget = lastSnap[`${code}TotalBudget`];
                        }
                    }
                }

                if (option === 'fresh') {
                    baseBudget = 0;
                    rolloverEnabled = false;
                    provenance = 'explicit_zero_budget';
                } else if (option === 'review') {
                    if (customAdjustments[mKey] && customAdjustments[mKey][code]) {
                        if (typeof customAdjustments[mKey][code].baseBudget !== 'undefined') {
                            baseBudget = Number(customAdjustments[mKey][code].baseBudget);
                            provenance = 'user_confirmed_adjustment';
                        }
                        if (typeof customAdjustments[mKey][code].rolloverEnabled !== 'undefined') {
                            rolloverEnabled = Boolean(customAdjustments[mKey][code].rolloverEnabled);
                        }
                    } else if (priorSnapshotBudget !== null) {
                        baseBudget = priorSnapshotBudget;
                        provenance = 'prior_closed_snapshot';
                    }
                } else if (option === 'continue') {
                    if (priorSnapshotBudget !== null) {
                        baseBudget = priorSnapshotBudget;
                        provenance = 'prior_closed_snapshot';
                    } else {
                        provenance = 'reused_active_setting';
                    }
                }

                const carryoverPrior = (option === 'fresh') ? 0 : runningCarryover[code];
                const totalAvailable = baseBudget + carryoverPrior;

                // Total actual expenses recorded in this month for this country
                const spent = (this.state.transactions || [])
                    .filter(tx => tx.type === 'expense' && tx.region === code && (tx.date || '').startsWith(mKey))
                    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

                let rolloverAdded = 0;
                if (rolloverEnabled && (isEnabled || option === 'review' || option === 'continue')) {
                    const unspent = totalAvailable - spent;
                    if (unspent > 0) {
                        rolloverAdded = (code === 'JP') ? Math.round(unspent) : Math.round(unspent * 100) / 100;
                    }
                }

                // Update running carryover for the subsequent month
                runningCarryover[code] = (option === 'fresh') ? 0 : rolloverAdded;

                monthData.countries[code] = {
                    countryCode: code,
                    baseBudget,
                    carryoverPrior,
                    spent,
                    totalAvailable,
                    rolloverEnabled,
                    rolloverAdded,
                    provenance,
                    isConfigured: isEnabled || baseBudget > 0 || spent > 0
                };
            });

            monthsPreview.push(monthData);
        });

        // Summary for current active month
        const activeMonthSummary = {
            monthKey: actualMonth,
            countries: {}
        };
        supportedCountries.forEach(code => {
            const b = (this.state.budgets && this.state.budgets[code]) || { monthlyTotal: 0, enabled: false };
            const baseBudget = Number(b.monthlyTotal || 0);
            const resultingCarryover = (option === 'fresh') ? 0 : runningCarryover[code];
            activeMonthSummary.countries[code] = {
                countryCode: code,
                baseBudget,
                carryover: resultingCarryover,
                totalAvailable: baseBudget + resultingCarryover,
                isConfigured: Boolean(b.enabled) || baseBudget > 0
            };
        });

        // Canonical financial revision fingerprint
        const stateToken = this.computeFinancialFingerprint(this.state);

        return {
            success: true,
            option,
            unfinalizedMonths: unfinalized,
            monthsPreview,
            activeMonthSummary,
            stateToken
        };
    }

    /**
     * Atomically commit the approved budget recovery plan with full rollback safety and concurrency validation.
     *
     * @param {string} option 'review' | 'continue' | 'fresh'
     * @param {Object} customAdjustments Per-month adjustments
     * @param {string|null} previewStateToken Token returned by getBudgetRecoveryPreview to guard against stale writes
     * @returns {Object} Result { success: boolean, reconciledMonths?: string[], error?: string }
     */
    commitBudgetRecovery(option = 'review', customAdjustments = {}, previewStateToken = null) {
        const unfinalized = this.detectUnfinalizedMonths();
        if (unfinalized.length === 0) {
            this.budgetRecoveryState = 'RESOLVED';
            this.state.budgetRecoveryState = 'RESOLVED';
            this.saveData();
            return { success: true, reconciledMonths: [] };
        }

        // Concurrency Guard 1: In-memory revision fingerprint check
        const currentFingerprint = this.computeFinancialFingerprint(this.state);
        if (previewStateToken && previewStateToken !== currentFingerprint) {
            return {
                success: false,
                code: 'STATE_CONFLICT',
                conflict: true,
                error: 'Financial state conflict detected: transactions or state changed elsewhere. Please refresh the reconciliation preview.'
            };
        }

        // Cross-tab lock acquisition (unified coordinator or fallback lease)
        if (!this.isInsideExclusiveTransaction() && !this.acquireRecoveryLock(5000)) {
            return {
                success: false,
                code: 'STATE_CONFLICT',
                conflict: true,
                error: 'Another browser session is currently committing budget recovery. Please wait or refresh.'
            };
        }

        try {
            // Concurrency Guard 2: Fail-closed authoritative local storage verification
            if (typeof localStorage !== 'undefined') {
                let storedRaw;
                try {
                    storedRaw = localStorage.getItem(this.getActiveStorageKey());
                } catch (storageErr) {
                    return {
                        success: false,
                        code: 'STORAGE_UNAVAILABLE',
                        error: `Authoritative local storage access error: ${storageErr.message || String(storageErr)}`
                    };
                }

                if (storedRaw === null || storedRaw === undefined || storedRaw.trim() === '') {
                    if (!this.isFirstLoad) {
                        return {
                            success: false,
                            code: 'STORAGE_UNAVAILABLE',
                            error: 'Authoritative local storage value is missing.'
                        };
                    }
                } else {
                    let storedState;
                    try {
                        storedState = JSON.parse(storedRaw);
                    } catch (jsonErr) {
                        return {
                            success: false,
                            code: 'INVALID_STORED_STATE',
                            error: `Authoritative stored data is malformed JSON: ${jsonErr.message || String(jsonErr)}`
                        };
                    }

                    if (!storedState || typeof storedState !== 'object' || !storedState.wallets || !Array.isArray(storedState.transactions)) {
                        return {
                            success: false,
                            code: 'INVALID_STORED_STATE',
                            error: 'Authoritative stored state lacks valid financial structures.'
                        };
                    }

                    const storedFingerprint = this.computeFinancialFingerprint(storedState);
                    if (storedFingerprint !== currentFingerprint) {
                        return {
                            success: false,
                            code: 'STATE_CONFLICT',
                            conflict: true,
                            error: 'Financial state conflict detected: transactions or balances were modified in another tab. Please refresh the reconciliation preview.'
                        };
                    }
                }
            }

            const preview = this.getBudgetRecoveryPreview(option, customAdjustments);
            if (!preview.success) {
                return {
                    success: false,
                    code: 'INVALID_ADJUSTMENTS',
                    error: preview.error || 'Failed to generate reconciliation plan.'
                };
            }

            // Snapshot authoritative pre-commit state for 100% complete rollback guarantee
            const preCommitStateSnapshot = JSON.parse(JSON.stringify(this.state));
            const preCommitRecoveryState = this.budgetRecoveryState;
            const preCommitUnfinalized = Array.isArray(this.unfinalizedMonths) ? this.unfinalizedMonths.slice() : [];

            try {
                if (!this.state.closedMonths) {
                    this.state.closedMonths = {};
                }

                const supportedCountries = ['JP', 'IN', 'DE'];

                // Commit Phase: Sequential creation of immutable closed month snapshots
                preview.monthsPreview.forEach(m => {
                    if (this.state.closedMonths[m.monthKey] && this.state.closedMonths[m.monthKey].status === 'closed') {
                        throw new Error(`Month ${m.monthKey} is already finalized and closed. Skipping duplicate rollover.`);
                    }

                    const snapshot = {
                        monthKey: m.monthKey,
                        label: m.monthKey,
                        closedAt: new Date().toISOString(),
                        reason: `Budget Recovery: ${option}`,
                        walletsSnapshot: JSON.parse(JSON.stringify(this.state.wallets || {})),
                        status: 'closed'
                    };

                    supportedCountries.forEach(code => {
                        const cData = m.countries[code];
                        snapshot[`${code}TotalBudget`] = cData.baseBudget;
                        snapshot[`${code}CarryoverPrior`] = cData.carryoverPrior;
                        snapshot[`${code}Spent`] = cData.spent;
                        snapshot[`${code}RolloverAdded`] = cData.rolloverAdded;
                        snapshot[`${code}Provenance`] = cData.provenance;
                    });

                    // Legacy backward-compatibility
                    snapshot.jpTotalBudget = snapshot.JPTotalBudget || 0;
                    snapshot.jpRolloverAdded = snapshot.JPRolloverAdded || 0;

                    this.state.closedMonths[m.monthKey] = snapshot;
                });

                // Update active month carryover in state.budgets
                supportedCountries.forEach(code => {
                    if (!this.state.budgets) {
                        this.state.budgets = JSON.parse(JSON.stringify(defaultState.budgets));
                    }
                    if (!this.state.budgets[code]) {
                        this.state.budgets[code] = { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 };
                    }
                    this.state.budgets[code].carryover = preview.activeMonthSummary.countries[code].carryover;
                });

                const actualMonth = this.getCurrentMonthKey();
                this.state.currentMonthKey = actualMonth;

                // Stamp comprehensive recovery audit metadata including provenance summary
                this.state.recoveryMetadata = {
                    id: `recovery_${Date.now()}`,
                    reconciledAt: new Date().toISOString(),
                    periodStart: unfinalized[0],
                    periodEnd: unfinalized[unfinalized.length - 1],
                    activeMonth: actualMonth,
                    option: option,
                    countries: supportedCountries,
                    reconciledMonths: unfinalized,
                    provenanceSummary: preview.monthsPreview.map(m => ({
                        monthKey: m.monthKey,
                        countries: Object.fromEntries(
                            supportedCountries.map(c => [c, m.countries[c]?.provenance || 'unknown'])
                        )
                    }))
                };

                // Re-derive history view from closedMonths
                this.state.history = Object.values(this.state.closedMonths).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
                this._attachHistoryGetters(this.state);

                // Transition workflow state to RESOLVED
                this.budgetRecoveryState = 'RESOLVED';
                this.unfinalizedMonths = [];
                this.state.budgetRecoveryState = 'RESOLVED';
                this.state.unfinalizedMonths = [];

                const saved = this.saveData();
                if (saved === false) {
                    throw new Error("Local persistence failed (storage quota or access error).");
                }

                return { success: true, reconciledMonths: unfinalized };
            } catch (commitErr) {
                console.error('[StorageManager] commitBudgetRecovery failed during commit. Rolling back completely...', commitErr);
                this.state = preCommitStateSnapshot;
                this.budgetRecoveryState = preCommitRecoveryState;
                this.unfinalizedMonths = preCommitUnfinalized;
                this._attachBudgetAccessors(this.state);
                this._attachHistoryGetters(this.state);
                return {
                    success: false,
                    code: commitErr.message && commitErr.message.includes('Local persistence failed') ? 'PERSISTENCE_FAILED' : 'COMMIT_FAILED',
                    error: commitErr.message || 'Recovery commit failed.'
                };
            }
        } finally {
            this.releaseRecoveryLock();
        }
    }

    closeCurrentMonth(reason = "Manual Close", targetMonthKey = null) {
        const monthKey = targetMonthKey || this.state.currentMonthKey || this.getCurrentMonthKey();

        if (!this.state.closedMonths) {
            this.state.closedMonths = {};
        }

        // Idempotency Safeguard: An already-closed month must never produce duplicate carryover or alter finalized snapshot
        if (this.state.closedMonths[monthKey] && this.state.closedMonths[monthKey].status === 'closed') {
            console.warn(`[StorageManager] Month ${monthKey} is already finalized and closed. Skipping duplicate rollover.`);
            return this.state.closedMonths[monthKey];
        }

        const snapshot = {
            monthKey: monthKey,
            label: monthKey,
            closedAt: new Date().toISOString(),
            reason: reason,
            walletsSnapshot: JSON.parse(JSON.stringify(this.state.wallets || {})),
            status: 'closed'
        };

        const supportedCountries = ['JP', 'IN', 'DE'];
        supportedCountries.forEach(code => {
            if (!this.state.budgets) {
                this.state.budgets = JSON.parse(JSON.stringify(defaultState.budgets));
            }
            if (!this.state.budgets[code]) {
                this.state.budgets[code] = { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 };
            }
            const b = this.state.budgets[code];
            const isEnabled = Boolean(b.enabled);
            const isRollover = Boolean(b.rolloverEnabled);
            const baseBudget = Number(b.monthlyTotal || 0);
            const currentCarryover = Number(b.carryover || 0);
            const totalAvailable = baseBudget + currentCarryover;

            // Compute total expense spent in monthKey for this country
            const spent = (this.state.transactions || [])
                .filter(tx => tx.type === 'expense' && tx.region === code && (tx.date || '').startsWith(monthKey))
                .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

            let nextCarryover = 0;
            if (isEnabled && isRollover) {
                const unspent = totalAvailable - spent;
                if (unspent > 0) {
                    nextCarryover = (code === 'JP') ? Math.round(unspent) : Math.round(unspent * 100) / 100;
                }
            }

            snapshot[`${code}TotalBudget`] = baseBudget;
            snapshot[`${code}CarryoverPrior`] = currentCarryover;
            snapshot[`${code}Spent`] = spent;
            snapshot[`${code}RolloverAdded`] = nextCarryover;

            // Update carryover for subsequent month (does not mutate recurring base monthlyTotal)
            b.carryover = nextCarryover;
        });

        // Legacy compatibility properties
        snapshot.jpTotalBudget = this.state.jpTotalBudget || snapshot.JPTotalBudget || 0;
        snapshot.jpRolloverAdded = snapshot.JPRolloverAdded || 0;

        this.state.closedMonths[monthKey] = snapshot;

        // Derive history view directly from closedMonths so they share identical object references
        this.state.history = Object.values(this.state.closedMonths).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        this._attachHistoryGetters(this.state);

        // Re-evaluate unfinalized months
        this.detectUnfinalizedMonths();

        // GUARD: Continuous Ledger must NEVER clear this.state.transactions!
        // All transactions remain in the continuous collection.
        this.saveData();
        return snapshot;
    }

    deleteLedger(monthKey) {
        if (this.state.closedMonths && this.state.closedMonths[monthKey] && this.state.closedMonths[monthKey].status === 'closed') {
            console.warn(`[StorageManager] Closed month ${monthKey} is permanently sealed. Deletion is prohibited.`);
            return false;
        }
        if (this.state.closedMonths) {
            delete this.state.closedMonths[monthKey];
            this.state.history = Object.values(this.state.closedMonths).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        } else if (Array.isArray(this.state.history)) {
            this.state.history = this.state.history.filter(h => h.monthKey !== monthKey);
        }
        this._attachHistoryGetters(this.state);
        this.saveData();
        return true;
    }

    reopenMonth(monthKey) {
        console.warn(`[StorageManager] Month ${monthKey} is permanently closed and sealed. Reopening is prohibited.`);
        return false;
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
     * Get unspent rollover carryover from previous closed month for a country.
     * @param {string} countryCode
     * @returns {number}
     */
    getCarryover(countryCode) {
        if (!countryCode || !this.state.budgets) return 0;
        const code = countryCode.toUpperCase();
        return Number(this.state.budgets[code]?.carryover || 0);
    }

    /**
     * Set rollover carryover for a country.
     * @param {string} countryCode
     * @param {number} amount
     */
    setCarryover(countryCode, amount) {
        if (!countryCode) return;
        const code = countryCode.toUpperCase();
        if (!this.state.budgets) {
            this.state.budgets = JSON.parse(JSON.stringify(defaultState.budgets));
        }
        if (!this.state.budgets[code]) {
            this.state.budgets[code] = { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 };
        }
        this.state.budgets[code].carryover = Math.max(0, Number(amount) || 0);
        this.saveData();
    }

    /**
     * Get total available spending budget for the active month (base budget + carryover).
     * @param {string} countryCode
     * @returns {number}
     */
    getTotalAvailableBudget(countryCode) {
        const code = (countryCode || 'JP').toUpperCase();
        const base = this.getTotalBudget(code);
        const carry = this.getCarryover(code);
        return base + carry;
    }

    /**
     * Get budget preference summary for a country.
     * @param {string} countryCode
     * @returns {{enabled: boolean, monthlyTotal: number, rolloverEnabled: boolean, carryover: number, totalAvailable: number}}
     */
    getBudgetPreference(countryCode) {
        const code = (countryCode || 'JP').toUpperCase();
        return {
            enabled: this.isBudgetEnabled(code),
            monthlyTotal: this.getTotalBudget(code),
            rolloverEnabled: this.isBudgetRolloverEnabled(code),
            carryover: this.getCarryover(code),
            totalAvailable: this.getTotalAvailableBudget(code)
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
            this.state.budgets[code] = { enabled: false, monthlyTotal: 0, rolloverEnabled: false, carryover: 0 };
        }

        this.state.budgets[code].enabled = Boolean(enabled);
        if (monthlyTotal !== null && !isNaN(Number(monthlyTotal))) {
            this.state.budgets[code].monthlyTotal = Number(monthlyTotal);
        }
        if (rolloverEnabled !== null) {
            this.state.budgets[code].rolloverEnabled = Boolean(rolloverEnabled);
        }
        if (typeof this.state.budgets[code].carryover !== 'number') {
            this.state.budgets[code].carryover = 0;
        }
        if (!this.state.budgets[code].enabled || !this.state.budgets[code].rolloverEnabled) {
            this.state.budgets[code].carryover = 0;
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
