class WalletManager {

    // Return all transactions from continuous ledger
    getAllTransactions() {
        return (storage.state && Array.isArray(storage.state.transactions))
            ? storage.state.transactions.slice()
            : [];
    }

    // Query transactions with filtering and chronological sorting
    getTransactions(filters = {}) {
        let txs = this.getAllTransactions();

        if (!filters || Object.keys(filters).length === 0) {
            return txs;
        }

        if (filters.startDate) {
            txs = txs.filter(tx => tx.date && tx.date >= filters.startDate);
        }

        if (filters.endDate) {
            txs = txs.filter(tx => tx.date && tx.date <= filters.endDate);
        }

        if (filters.monthKey) {
            txs = txs.filter(tx => tx.date && tx.date.startsWith(filters.monthKey));
        }

        if (filters.walletIds && Array.isArray(filters.walletIds) && filters.walletIds.length > 0) {
            txs = txs.filter(tx => filters.walletIds.includes(tx.walletId) || filters.walletIds.includes(tx.sourceId) || filters.walletIds.includes(tx.destId));
        } else if (filters.walletId && filters.walletId !== 'all') {
            txs = txs.filter(tx => tx.walletId === filters.walletId || tx.sourceId === filters.walletId || tx.destId === filters.walletId);
        }

        if (filters.categoryIds && Array.isArray(filters.categoryIds) && filters.categoryIds.length > 0) {
            txs = txs.filter(tx => filters.categoryIds.includes(tx.categoryId));
        } else if (filters.categoryId && filters.categoryId !== 'all') {
            txs = txs.filter(tx => tx.categoryId === filters.categoryId);
        }

        if (filters.excludeCategoryIds) {
            const excludeSet = filters.excludeCategoryIds instanceof Set
                ? filters.excludeCategoryIds
                : new Set(filters.excludeCategoryIds);
            if (excludeSet.size > 0) {
                txs = txs.filter(tx => !tx.categoryId || !excludeSet.has(tx.categoryId));
            }
        }

        if (filters.types && Array.isArray(filters.types) && filters.types.length > 0) {
            txs = txs.filter(tx => filters.types.includes(tx.type));
        } else if (filters.type && filters.type !== 'all') {
            txs = txs.filter(tx => tx.type === filters.type);
        }

        if (filters.region && filters.region !== 'all') {
            txs = txs.filter(tx => {
                if (tx.region) return tx.region === filters.region;
                if (tx.walletId && storage.state?.wallets?.[tx.walletId]) {
                    return storage.state.wallets[tx.walletId].region === filters.region;
                }
                if (tx.sourceId && storage.state?.wallets?.[tx.sourceId]) {
                    return storage.state.wallets[tx.sourceId].region === filters.region;
                }
                return false;
            });
        }

        if (filters.currency && filters.currency !== 'all') {
            const cur = filters.currency.toUpperCase();
            txs = txs.filter(tx => {
                const c = (tx.currency || '').toUpperCase();
                const sc = (tx.sourceCurrency || '').toUpperCase();
                const dc = (tx.destCurrency || '').toUpperCase();
                return c === cur || sc === cur || dc === cur ||
                    (cur === 'JPY' && (c === '¥' || sc === '¥')) ||
                    (cur === 'INR' && (c === '₹' || dc === '₹')) ||
                    (cur === 'EUR' && (c === '€' || sc === '€' || dc === '€'));
            });
        }

        if (typeof filters.minAmount === 'number' && !isNaN(filters.minAmount)) {
            txs = txs.filter(tx => {
                const amt = tx.amount !== undefined ? Number(tx.amount) : Number(tx.sourceAmount || 0);
                return amt >= filters.minAmount;
            });
        }

        if (typeof filters.maxAmount === 'number' && !isNaN(filters.maxAmount)) {
            txs = txs.filter(tx => {
                const amt = tx.amount !== undefined ? Number(tx.amount) : Number(tx.sourceAmount || 0);
                return amt <= filters.maxAmount;
            });
        }

        const rawSearch = (filters.search || filters.text || filters.query || '').trim();
        if (rawSearch) {
            const terms = rawSearch.toLowerCase().split(/\s+/).filter(Boolean);
            txs = txs.filter(tx => {
                // Collect searchable text for this transaction
                let tokens = [
                    tx.note || '',
                    tx.categoryId || '',
                    tx.walletId || '',
                    tx.sourceId || '',
                    tx.destId || '',
                    tx.type || '',
                    tx.date || '',
                    tx.currency || '',
                    tx.sourceCurrency || '',
                    tx.destCurrency || '',
                    tx.amount !== undefined ? String(tx.amount) : '',
                    tx.sourceAmount !== undefined ? String(tx.sourceAmount) : '',
                    tx.destAmount !== undefined ? String(tx.destAmount) : '',
                    tx.region === 'JP' ? 'japan jpy ¥' : (tx.region === 'IN' ? 'india inr ₹' : (tx.region === 'DE' ? 'germany eur €' : ''))
                ];

                // Add Category Names from storage
                if (tx.categoryId && storage.state?.categories) {
                    Object.keys(storage.state.categories || {}).forEach(reg => {
                        const cat = storage.state.categories[reg]?.find(c => c.id === tx.categoryId);
                        if (cat?.name) tokens.push(cat.name);
                    });
                }

                // Add Wallet Names from storage
                if (storage.state?.wallets) {
                    if (tx.walletId && storage.state.wallets[tx.walletId]) {
                        tokens.push(storage.state.wallets[tx.walletId].name || tx.walletId);
                    }
                    if (tx.sourceId && storage.state.wallets[tx.sourceId]) {
                        tokens.push(storage.state.wallets[tx.sourceId].name || tx.sourceId);
                    }
                    if (tx.destId && storage.state.wallets[tx.destId]) {
                        tokens.push(storage.state.wallets[tx.destId].name || tx.destId);
                    }
                }

                const searchableHaystack = tokens.join(' ').toLowerCase();
                // Every search term should match
                return terms.every(term => searchableHaystack.includes(term));
            });
        }

        const sortOrder = filters.sort === 'asc' ? 'asc' : 'desc';
        txs.sort((a, b) => {
            const dateCmp = (b.date || '').localeCompare(a.date || '');
            const idCmp = String(b.id || '').localeCompare(String(a.id || ''));
            const res = dateCmp !== 0 ? dateCmp : idCmp;
            return sortOrder === 'asc' ? -res : res;
        });

        return txs;
    }

    // Helper to keep storage.state.transactions sorted chronologically descending
    _sortContinuousTransactions() {
        if (storage.state && Array.isArray(storage.state.transactions)) {
            storage.state.transactions.sort((a, b) => {
                const dateCmp = (b.date || '').localeCompare(a.date || '');
                if (dateCmp !== 0) return dateCmp;
                return String(b.id || '').localeCompare(String(a.id || ''));
            });
        }
    }

    // Generate strictly unique monotonic timestamp ID to prevent collisions in high-frequency ops
    generateTransactionId() {
        let ts = Date.now();
        if (this._lastTxIdTime && ts <= this._lastTxIdTime) {
            ts = this._lastTxIdTime + 1;
        }
        this._lastTxIdTime = ts;
        return ts.toString();
    }

    // Check if a month is closed/sealed
    isMonthClosed(monthKey) {
        if (!monthKey || !storage.state || !storage.state.closedMonths) return false;
        const entry = storage.state.closedMonths[monthKey];
        return !!(entry && entry.status === 'closed');
    }

    // Add a standard expense (debit)
    addExpense(walletId, categoryId, amount, note, date = new Date().toISOString().split('T')[0]) {
        const monthKey = (date || '').slice(0, 7);
        if (this.isMonthClosed(monthKey)) {
            console.warn(`[WalletManager] Month ${monthKey} is closed. Cannot add expense.`);
            return false;
        }

        const wallet = storage.state?.wallets?.[walletId];
        if (!wallet) return false;

        const numAmount = Number(amount);
        if (!this.isValidAmount(numAmount, wallet.currency)) {
            console.warn(`[WalletManager] Invalid expense amount or precision: ${amount} for ${wallet.currency}`);
            return false;
        }

        const tentativeBalance = this.roundCurrency(wallet.balance - numAmount, wallet.currency);
        if (!isFinite(tentativeBalance)) {
            console.warn('[WalletManager] Invalid resulting balance for expense.');
            return false;
        }

        // Capture complete relevant pre-operation state for atomic rollback guarantee
        const preBalance = wallet.balance;
        const preCommitTransactions = Array.isArray(storage.state.transactions) ? storage.state.transactions.slice() : [];

        const tx = {
            id: this.generateTransactionId(),
            type: 'expense',
            walletId,
            region: wallet.region,
            categoryId,
            amount: numAmount,
            currency: wallet.currency,
            note,
            date
        };

        try {
            wallet.balance = tentativeBalance;
            storage.state.transactions.unshift(tx);
            this._sortContinuousTransactions();

            const saved = storage.saveData();
            if (saved === false) {
                throw new Error("Local persistence failed.");
            }
            return true;
        } catch (err) {
            console.error('[WalletManager] addExpense failed. Rolling back completely...', err);
            wallet.balance = preBalance;
            storage.state.transactions = preCommitTransactions;
            return false;
        }
    }

    // Add income (credit)
    addIncome(walletId, amount, note, date = new Date().toISOString().split('T')[0]) {
        const monthKey = (date || '').slice(0, 7);
        if (this.isMonthClosed(monthKey)) {
            console.warn(`[WalletManager] Month ${monthKey} is closed. Cannot add income.`);
            return false;
        }

        const wallet = storage.state?.wallets?.[walletId];
        if (!wallet) return false;

        const numAmount = Number(amount);
        if (!this.isValidAmount(numAmount, wallet.currency)) {
            console.warn(`[WalletManager] Invalid income amount or precision: ${amount} for ${wallet.currency}`);
            return false;
        }

        const tentativeBalance = this.roundCurrency(wallet.balance + numAmount, wallet.currency);
        if (!isFinite(tentativeBalance)) {
            console.warn('[WalletManager] Invalid resulting balance for income.');
            return false;
        }

        // Capture complete relevant pre-operation state for atomic rollback guarantee
        const preBalance = wallet.balance;
        const preCommitTransactions = Array.isArray(storage.state.transactions) ? storage.state.transactions.slice() : [];

        const tx = {
            id: this.generateTransactionId(),
            type: 'income',
            walletId,
            region: wallet.region,
            amount: numAmount,
            currency: wallet.currency,
            note,
            date
        };

        try {
            wallet.balance = tentativeBalance;
            storage.state.transactions.unshift(tx);
            this._sortContinuousTransactions();

            const saved = storage.saveData();
            if (saved === false) {
                throw new Error("Local persistence failed.");
            }
            return true;
        } catch (err) {
            console.error('[WalletManager] addIncome failed. Rolling back completely...', err);
            wallet.balance = preBalance;
            storage.state.transactions = preCommitTransactions;
            return false;
        }
    }

    // Currency precision rounding helper: whole integers for JPY, 2 decimal places for INR/EUR
    roundCurrency(amount, currency) {
        if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) return 0;
        const cur = (currency || '').toUpperCase();
        if (cur === '¥' || cur === 'JPY') {
            return Math.round(amount);
        }
        return Math.round(amount * 100) / 100;
    }

    // Validate numeric amount and decimal precision according to currency
    // Exact monetary validation: JPY whole yen, INR/EUR max 2 decimal places
    isValidAmount(amount, currency) {
        if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount) || amount <= 0 || amount > 1e12) {
            return false;
        }
        const cur = (currency || '').toUpperCase();
        if (cur === '¥' || cur === 'JPY') {
            return Number.isInteger(amount);
        }
        // INR and EUR: max 2 decimal places with zero IEEE 754 precision leakage
        const str = amount.toString();
        if (str.includes('e') || str.includes('E')) return false;
        const parts = str.split('.');
        if (parts.length > 2) return false;
        if (parts.length === 2 && parts[1].length > 2) return false;
        return true;
    }

    // Pure calculation preview for domestic and international transfers (zero side effects)
    getTransferPreview(type, sourceId, destId, amt1, amt2 = null) {
        const preview = {
            valid: false,
            error: '',
            type,
            source: null,
            dest: null,
            debitedAmount: 0,
            creditedAmount: 0,
            effectiveRate: null,
            rateFormatted: ''
        };

        if (!storage.state || !storage.state.wallets) {
            preview.error = 'Wallets not available.';
            return preview;
        }

        const source = storage.state.wallets[sourceId];
        const dest = storage.state.wallets[destId];

        if (!source || !dest) {
            preview.error = 'Please select valid source and destination accounts.';
            return preview;
        }

        if (sourceId === destId) {
            preview.error = 'Source and destination accounts must be different.';
            return preview;
        }

        const num1 = Number(amt1);
        const num2 = Number(amt2);

        if (type === 'transfer') {
            if (source.currency !== dest.currency) {
                preview.error = 'Domestic transfer accounts must have the same currency.';
                return preview;
            }
            if (!amt1 || isNaN(num1) || num1 <= 0) {
                preview.error = 'Please enter a positive transfer amount.';
                return preview;
            }
            if (!this.isValidAmount(num1, source.currency)) {
                preview.error = `Invalid precision for ${source.currency}. Whole numbers for JPY; up to 2 decimal places for EUR/INR.`;
                return preview;
            }

            preview.valid = true;
            preview.debitedAmount = num1;
            preview.creditedAmount = num1;
            preview.source = {
                id: sourceId,
                name: sourceId,
                currency: source.currency,
                currentBalance: source.balance || 0,
                newBalance: this.roundCurrency((source.balance || 0) - num1, source.currency)
            };
            preview.dest = {
                id: destId,
                name: destId,
                currency: dest.currency,
                currentBalance: dest.balance || 0,
                newBalance: this.roundCurrency((dest.balance || 0) + num1, dest.currency)
            };
            return preview;
        }

        if (type === 'remittance') {
            if (source.currency === dest.currency) {
                preview.error = 'International transfer requires accounts with different currencies.';
                return preview;
            }
            if (!amt1 || isNaN(num1) || num1 <= 0 || !amt2 || isNaN(num2) || num2 <= 0) {
                preview.error = 'Please enter positive amounts for both sent and received.';
                return preview;
            }
            if (!this.isValidAmount(num1, source.currency)) {
                preview.error = `Invalid precision for sent amount (${source.currency}).`;
                return preview;
            }
            if (!this.isValidAmount(num2, dest.currency)) {
                preview.error = `Invalid precision for received amount (${dest.currency}).`;
                return preview;
            }

            const effectiveRate = Number((num2 / num1).toFixed(6));
            preview.valid = true;
            preview.debitedAmount = num1;
            preview.creditedAmount = num2;
            preview.effectiveRate = effectiveRate;
            preview.rateFormatted = `1 ${source.currency} = ${(num2 / num1).toFixed(4)} ${dest.currency}`;
            preview.source = {
                id: sourceId,
                name: sourceId,
                currency: source.currency,
                currentBalance: source.balance || 0,
                newBalance: this.roundCurrency((source.balance || 0) - num1, source.currency)
            };
            preview.dest = {
                id: destId,
                name: destId,
                currency: dest.currency,
                currentBalance: dest.balance || 0,
                newBalance: this.roundCurrency((dest.balance || 0) + num2, dest.currency)
            };
            return preview;
        }

        preview.error = 'Unknown transfer type.';
        return preview;
    }

    // Transfer between wallets (same currency)
    transfer(sourceId, destId, amount, note, date = new Date().toISOString().split('T')[0]) {
        const monthKey = (date || '').slice(0, 7);
        if (this.isMonthClosed(monthKey)) {
            console.warn(`[WalletManager] Month ${monthKey} is closed. Cannot create transfer.`);
            return false;
        }

        const preview = this.getTransferPreview('transfer', sourceId, destId, amount);
        if (!preview.valid) {
            console.warn(`[WalletManager] Transfer rejected: ${preview.error}`);
            return false;
        }

        const numAmount = Number(amount);
        const source = storage.state.wallets[sourceId];
        const dest = storage.state.wallets[destId];

        // Prepare phase: compute tentative balances and validate in isolated structures
        const tentativeSource = this.roundCurrency(source.balance - numAmount, source.currency);
        const tentativeDest = this.roundCurrency(dest.balance + numAmount, dest.currency);
        if (!isFinite(tentativeSource) || !isFinite(tentativeDest)) {
            console.warn('[WalletManager] Transfer aborted - resulting balances nonfinite.');
            return false;
        }

        // Commit phase: apply state mutation atomically with rollback protection
        const preCommit = { [sourceId]: source.balance, [destId]: dest.balance };
        const preCommitTransactions = Array.isArray(storage.state.transactions) ? storage.state.transactions.slice() : [];
        let createdTx = null;
        try {
            source.balance = tentativeSource;
            dest.balance = tentativeDest;

            createdTx = {
                id: this.generateTransactionId(),
                type: 'transfer',
                sourceId,
                destId,
                amount: numAmount,
                currency: source.currency,
                note: note || '',
                date
            };

            storage.state.transactions.unshift(createdTx);
            this._sortContinuousTransactions();
            const saved = storage.saveData();
            if (saved === false) {
                throw new Error("Local persistence failed.");
            }
            return true;
        } catch (err) {
            console.error('[WalletManager] Transfer commit failed. Rolling back completely...', err);
            source.balance = preCommit[sourceId];
            dest.balance = preCommit[destId];
            storage.state.transactions = preCommitTransactions;
            return false;
        }
    }

    // Remittance (cross currency international money transfer)
    remittance(sourceId, destId, sourceAmount, destAmount, note, date = new Date().toISOString().split('T')[0]) {
        const monthKey = (date || '').slice(0, 7);
        if (this.isMonthClosed(monthKey)) {
            console.warn(`[WalletManager] Month ${monthKey} is closed. Cannot create remittance.`);
            return false;
        }

        const preview = this.getTransferPreview('remittance', sourceId, destId, sourceAmount, destAmount);
        if (!preview.valid) {
            console.warn(`[WalletManager] International transfer rejected: ${preview.error}`);
            return false;
        }

        const numSource = Number(sourceAmount);
        const numDest = Number(destAmount);
        const source = storage.state.wallets[sourceId];
        const dest = storage.state.wallets[destId];

        // Prepare phase: compute tentative balances and validate in isolated structures
        const tentativeSource = this.roundCurrency(source.balance - numSource, source.currency);
        const tentativeDest = this.roundCurrency(dest.balance + numDest, dest.currency);
        if (!isFinite(tentativeSource) || !isFinite(tentativeDest)) {
            console.warn('[WalletManager] Remittance aborted - resulting balances nonfinite.');
            return false;
        }

        // Commit phase: apply state mutation atomically with rollback protection
        const preCommit = { [sourceId]: source.balance, [destId]: dest.balance };
        const preCommitTransactions = Array.isArray(storage.state.transactions) ? storage.state.transactions.slice() : [];
        let createdTx = null;
        try {
            source.balance = tentativeSource;
            dest.balance = tentativeDest;

            createdTx = {
                id: this.generateTransactionId(),
                type: 'remittance',
                sourceId,
                destId,
                sourceAmount: numSource,
                destAmount: numDest,
                sourceCurrency: source.currency,
                destCurrency: dest.currency,
                exchangeRate: (numDest / numSource).toFixed(6),
                note: note || '',
                date
            };

            storage.state.transactions.unshift(createdTx);
            this._sortContinuousTransactions();
            const saved = storage.saveData();
            if (saved === false) {
                throw new Error("Local persistence failed.");
            }
            return true;
        } catch (err) {
            console.error('[WalletManager] Remittance commit failed. Rolling back completely...', err);
            source.balance = preCommit[sourceId];
            dest.balance = preCommit[destId];
            storage.state.transactions = preCommitTransactions;
            return false;
        }
    }

    // Find transaction anywhere in continuous ledger (with legacy fallback)
    findTransaction(txId) {
        if (!storage.state) return null;

        if (Array.isArray(storage.state.transactions)) {
            const index = storage.state.transactions.findIndex(t => t.id === txId);
            if (index !== -1) {
                const tx = storage.state.transactions[index];
                return {
                    tx,
                    location: 'continuous',
                    index,
                    monthKey: tx.date ? tx.date.substring(0, 7) : (storage.state.currentMonthKey || '')
                };
            }
        }

        // Legacy fallback for unmigrated states or testing
        if (Array.isArray(storage.state.history)) {
            for (let hIndex = 0; hIndex < storage.state.history.length; hIndex++) {
                const ledger = storage.state.history[hIndex];
                if (ledger && Array.isArray(ledger.transactions)) {
                    const index = ledger.transactions.findIndex(t => t.id === txId);
                    if (index !== -1) {
                        const tx = ledger.transactions[index];
                        return {
                            tx,
                            location: 'history',
                            ledgerIndex: hIndex,
                            index,
                            monthKey: tx.date ? tx.date.substring(0, 7) : (ledger.monthKey || '')
                        };
                    }
                }
            }
        }

        return null;
    }

    // Two-Phase Validation: Verify that all referenced wallets and amounts exist and are valid for reversal
    validateTransactionForReversal(tx) {
        if (!tx || typeof tx !== 'object') {
            return { valid: false, error: 'Transaction object is required.' };
        }
        if (!storage.state || !storage.state.wallets) {
            return { valid: false, error: 'Wallets state not available.' };
        }

        if (tx.type === 'expense' || tx.type === 'income') {
            const w = storage.state.wallets[tx.walletId];
            if (!w || typeof w !== 'object') {
                return { valid: false, error: `Referenced wallet '${tx.walletId}' does not exist.` };
            }
            if (typeof w.balance !== 'number' || !isFinite(w.balance)) {
                return { valid: false, error: `Referenced wallet '${tx.walletId}' has nonfinite balance.` };
            }
            if (typeof tx.amount !== 'number' || !isFinite(tx.amount) || tx.amount <= 0) {
                return { valid: false, error: `Transaction amount is invalid: ${tx.amount}` };
            }
            return { valid: true };
        }

        if (tx.type === 'transfer') {
            const s = storage.state.wallets[tx.sourceId];
            const d = storage.state.wallets[tx.destId];
            if (!s || typeof s !== 'object') {
                return { valid: false, error: `Source wallet '${tx.sourceId}' does not exist.` };
            }
            if (!d || typeof d !== 'object') {
                return { valid: false, error: `Destination wallet '${tx.destId}' does not exist.` };
            }
            if (typeof s.balance !== 'number' || !isFinite(s.balance)) {
                return { valid: false, error: `Source wallet '${tx.sourceId}' has nonfinite balance.` };
            }
            if (typeof d.balance !== 'number' || !isFinite(d.balance)) {
                return { valid: false, error: `Destination wallet '${tx.destId}' has nonfinite balance.` };
            }
            if (typeof tx.amount !== 'number' || !isFinite(tx.amount) || tx.amount <= 0) {
                return { valid: false, error: `Transfer amount is invalid: ${tx.amount}` };
            }
            return { valid: true };
        }

        if (tx.type === 'remittance') {
            const s = storage.state.wallets[tx.sourceId];
            const d = storage.state.wallets[tx.destId];
            if (!s || typeof s !== 'object') {
                return { valid: false, error: `Source wallet '${tx.sourceId}' does not exist.` };
            }
            if (!d || typeof d !== 'object') {
                return { valid: false, error: `Destination wallet '${tx.destId}' does not exist.` };
            }
            if (typeof s.balance !== 'number' || !isFinite(s.balance)) {
                return { valid: false, error: `Source wallet '${tx.sourceId}' has nonfinite balance.` };
            }
            if (typeof d.balance !== 'number' || !isFinite(d.balance)) {
                return { valid: false, error: `Destination wallet '${tx.destId}' has nonfinite balance.` };
            }
            if (typeof tx.sourceAmount !== 'number' || !isFinite(tx.sourceAmount) || tx.sourceAmount <= 0) {
                return { valid: false, error: `Sent amount is invalid: ${tx.sourceAmount}` };
            }
            if (typeof tx.destAmount !== 'number' || !isFinite(tx.destAmount) || tx.destAmount <= 0) {
                return { valid: false, error: `Received amount is invalid: ${tx.destAmount}` };
            }
            return { valid: true };
        }

        return { valid: false, error: `Unknown transaction type '${tx.type}'` };
    }

    // Two-Phase Validation: Verify that all referenced wallets and amounts are valid for applying
    validateTransactionForApplication(tx) {
        if (!tx || typeof tx !== 'object') {
            return { valid: false, error: 'Transaction object is required.' };
        }
        if (!storage.state || !storage.state.wallets) {
            return { valid: false, error: 'Wallets state not available.' };
        }

        if (tx.type === 'expense' || tx.type === 'income') {
            const w = storage.state.wallets[tx.walletId];
            if (!w || typeof w !== 'object') {
                return { valid: false, error: `Referenced wallet '${tx.walletId}' does not exist.` };
            }
            if (typeof w.balance !== 'number' || !isFinite(w.balance)) {
                return { valid: false, error: `Referenced wallet '${tx.walletId}' has nonfinite balance.` };
            }
            const amt = Number(tx.amount);
            if (!this.isValidAmount(amt, w.currency)) {
                return { valid: false, error: `Amount ${tx.amount} violates precision or magnitude bounds for ${w.currency}.` };
            }
            if (tx.type === 'expense' && !tx.categoryId) {
                return { valid: false, error: 'Expense category is required.' };
            }
            return { valid: true };
        }

        if (tx.type === 'transfer') {
            const s = storage.state.wallets[tx.sourceId];
            const d = storage.state.wallets[tx.destId];
            if (!s || !d) {
                return { valid: false, error: 'Source and destination accounts must exist.' };
            }
            if (tx.sourceId === tx.destId) {
                return { valid: false, error: 'Source and destination must be different.' };
            }
            if (s.currency !== d.currency) {
                return { valid: false, error: 'Domestic transfer accounts must have matching currencies.' };
            }
            const amt = Number(tx.amount);
            if (!this.isValidAmount(amt, s.currency)) {
                return { valid: false, error: `Transfer amount violates precision for ${s.currency}.` };
            }
            return { valid: true };
        }

        if (tx.type === 'remittance') {
            const s = storage.state.wallets[tx.sourceId];
            const d = storage.state.wallets[tx.destId];
            if (!s || !d) {
                return { valid: false, error: 'Source and destination accounts must exist.' };
            }
            if (tx.sourceId === tx.destId) {
                return { valid: false, error: 'Source and destination must be different.' };
            }
            if (s.currency === d.currency) {
                return { valid: false, error: 'International transfer requires accounts with different currencies.' };
            }
            const sAmt = Number(tx.sourceAmount);
            const dAmt = Number(tx.destAmount);
            if (!this.isValidAmount(sAmt, s.currency)) {
                return { valid: false, error: `Sent amount violates precision for ${s.currency}.` };
            }
            if (!this.isValidAmount(dAmt, d.currency)) {
                return { valid: false, error: `Received amount violates precision for ${d.currency}.` };
            }
            return { valid: true };
        }

        return { valid: false, error: `Unknown transaction type '${tx.type}'` };
    }

    // Reverse financial balance impacts of a transaction with atomic validation and precision rounding
    reverseTransactionEffects(tx) {
        const check = this.validateTransactionForReversal(tx);
        if (!check.valid) {
            console.warn(`[WalletManager] reverseTransactionEffects aborted: ${check.error}`);
            return false;
        }

        if (tx.type === 'expense') {
            const w = storage.state.wallets[tx.walletId];
            w.balance = this.roundCurrency(w.balance + Number(tx.amount), w.currency);
        } else if (tx.type === 'income') {
            const w = storage.state.wallets[tx.walletId];
            w.balance = this.roundCurrency(w.balance - Number(tx.amount), w.currency);
        } else if (tx.type === 'transfer') {
            const s = storage.state.wallets[tx.sourceId];
            const d = storage.state.wallets[tx.destId];
            s.balance = this.roundCurrency(s.balance + Number(tx.amount), s.currency);
            d.balance = this.roundCurrency(d.balance - Number(tx.amount), d.currency);
        } else if (tx.type === 'remittance') {
            const s = storage.state.wallets[tx.sourceId];
            const d = storage.state.wallets[tx.destId];
            s.balance = this.roundCurrency(s.balance + Number(tx.sourceAmount), s.currency);
            d.balance = this.roundCurrency(d.balance - Number(tx.destAmount), d.currency);
        }
        return true;
    }

    // Apply financial balance impacts of a transaction with atomic validation and precision rounding
    applyTransactionEffects(tx) {
        const check = this.validateTransactionForApplication(tx);
        if (!check.valid) {
            console.warn(`[WalletManager] applyTransactionEffects aborted: ${check.error}`);
            return false;
        }

        if (tx.type === 'expense') {
            const w = storage.state.wallets[tx.walletId];
            w.balance = this.roundCurrency(w.balance - Number(tx.amount), w.currency);
        } else if (tx.type === 'income') {
            const w = storage.state.wallets[tx.walletId];
            w.balance = this.roundCurrency(w.balance + Number(tx.amount), w.currency);
        } else if (tx.type === 'transfer') {
            const s = storage.state.wallets[tx.sourceId];
            const d = storage.state.wallets[tx.destId];
            s.balance = this.roundCurrency(s.balance - Number(tx.amount), s.currency);
            d.balance = this.roundCurrency(d.balance + Number(tx.amount), d.currency);
        } else if (tx.type === 'remittance') {
            const s = storage.state.wallets[tx.sourceId];
            const d = storage.state.wallets[tx.destId];
            s.balance = this.roundCurrency(s.balance - Number(tx.sourceAmount), s.currency);
            d.balance = this.roundCurrency(d.balance + Number(tx.destAmount), d.currency);
        }
        return true;
    }

    // In-place update preserving transaction ID and metadata with atomic rollback safety
    updateTransaction(txId, updatedData) {
        const found = this.findTransaction(txId);
        if (!found) return false;

        const tx = found.tx;
        const origMonth = (tx.date || '').slice(0, 7);
        if (this.isMonthClosed(origMonth)) {
            console.warn(`[WalletManager] Month ${origMonth} is closed. Cannot edit transaction.`);
            return false;
        }
        if (updatedData.date && this.isMonthClosed(updatedData.date.slice(0, 7))) {
            console.warn(`[WalletManager] Target month ${updatedData.date.slice(0, 7)} is closed. Cannot move transaction.`);
            return false;
        }

        // Validate date format
        const targetDate = updatedData.date || tx.date;
        if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
            console.warn(`[WalletManager] Invalid date format: ${targetDate}`);
            return false;
        }

        // 1. Prepare phase: Validate that existing transaction CAN be reversed
        const revCheck = this.validateTransactionForReversal(tx);
        if (!revCheck.valid) {
            console.warn(`[WalletManager] Update aborted - existing transaction cannot be reversed: ${revCheck.error}`);
            return false;
        }

        // 2. Prepare phase: Build prospective updated transaction clone
        const prospectiveTx = JSON.parse(JSON.stringify(tx));
        if (updatedData.date) prospectiveTx.date = updatedData.date;
        if (typeof updatedData.note !== 'undefined') prospectiveTx.note = updatedData.note;

        if (tx.type === 'expense') {
            if (updatedData.walletId) prospectiveTx.walletId = updatedData.walletId;
            const wallet = storage.state.wallets[prospectiveTx.walletId];
            if (wallet) {
                prospectiveTx.currency = wallet.currency;
                prospectiveTx.region = wallet.region;
            }
            if (updatedData.categoryId) prospectiveTx.categoryId = updatedData.categoryId;
            if (typeof updatedData.amount !== 'undefined') prospectiveTx.amount = Number(updatedData.amount);
        } else if (tx.type === 'income') {
            if (updatedData.walletId) prospectiveTx.walletId = updatedData.walletId;
            const wallet = storage.state.wallets[prospectiveTx.walletId];
            if (wallet) {
                prospectiveTx.currency = wallet.currency;
                prospectiveTx.region = wallet.region;
            }
            if (typeof updatedData.amount !== 'undefined') prospectiveTx.amount = Number(updatedData.amount);
        } else if (tx.type === 'transfer') {
            if (updatedData.sourceId) prospectiveTx.sourceId = updatedData.sourceId;
            if (updatedData.destId) prospectiveTx.destId = updatedData.destId;
            if (typeof updatedData.amount !== 'undefined') prospectiveTx.amount = Number(updatedData.amount);
            const source = storage.state.wallets[prospectiveTx.sourceId];
            if (source) prospectiveTx.currency = source.currency;
        } else if (tx.type === 'remittance') {
            if (updatedData.sourceId) prospectiveTx.sourceId = updatedData.sourceId;
            if (updatedData.destId) prospectiveTx.destId = updatedData.destId;
            if (typeof updatedData.sourceAmount !== 'undefined') prospectiveTx.sourceAmount = Number(updatedData.sourceAmount);
            if (typeof updatedData.destAmount !== 'undefined') prospectiveTx.destAmount = Number(updatedData.destAmount);
            const source = storage.state.wallets[prospectiveTx.sourceId];
            const dest = storage.state.wallets[prospectiveTx.destId];
            if (source) prospectiveTx.sourceCurrency = source.currency;
            if (dest) prospectiveTx.destCurrency = dest.currency;
            if (prospectiveTx.sourceAmount > 0 && prospectiveTx.destAmount > 0) {
                prospectiveTx.exchangeRate = (prospectiveTx.destAmount / prospectiveTx.sourceAmount).toFixed(6);
            }
        }

        // 3. Prepare phase: Validate prospective updated clone before modifying ANY state
        const applyCheck = this.validateTransactionForApplication(prospectiveTx);
        if (!applyCheck.valid) {
            console.warn(`[WalletManager] Update aborted - proposed transaction invalid: ${applyCheck.error}`);
            return false;
        }

        // 4. Prepare phase: Identify all affected wallets and compute final tentative balances in isolated temporary structures
        const affectedWalletIds = new Set();
        if (tx.type === 'expense' || tx.type === 'income') {
            affectedWalletIds.add(tx.walletId);
        } else if (tx.type === 'transfer' || tx.type === 'remittance') {
            affectedWalletIds.add(tx.sourceId);
            affectedWalletIds.add(tx.destId);
        }
        if (prospectiveTx.type === 'expense' || prospectiveTx.type === 'income') {
            affectedWalletIds.add(prospectiveTx.walletId);
        } else if (prospectiveTx.type === 'transfer' || prospectiveTx.type === 'remittance') {
            affectedWalletIds.add(prospectiveTx.sourceId);
            affectedWalletIds.add(prospectiveTx.destId);
        }

        for (const wId of affectedWalletIds) {
            const w = storage.state.wallets[wId];
            if (!w || typeof w !== 'object' || typeof w.balance !== 'number' || !isFinite(w.balance)) {
                console.warn(`[WalletManager] Update aborted - affected wallet '${wId}' is invalid or missing.`);
                return false;
            }
        }

        const tentativeBalances = {};
        affectedWalletIds.forEach(wId => {
            tentativeBalances[wId] = storage.state.wallets[wId].balance;
        });

        // 4a. Apply reversal delta to tentative balances
        if (tx.type === 'expense') {
            tentativeBalances[tx.walletId] += Number(tx.amount);
        } else if (tx.type === 'income') {
            tentativeBalances[tx.walletId] -= Number(tx.amount);
        } else if (tx.type === 'transfer') {
            tentativeBalances[tx.sourceId] += Number(tx.amount);
            tentativeBalances[tx.destId] -= Number(tx.amount);
        } else if (tx.type === 'remittance') {
            tentativeBalances[tx.sourceId] += Number(tx.sourceAmount);
            tentativeBalances[tx.destId] -= Number(tx.destAmount);
        }

        // 4b. Apply prospective application delta to tentative balances
        if (prospectiveTx.type === 'expense') {
            tentativeBalances[prospectiveTx.walletId] -= Number(prospectiveTx.amount);
        } else if (prospectiveTx.type === 'income') {
            tentativeBalances[prospectiveTx.walletId] += Number(prospectiveTx.amount);
        } else if (prospectiveTx.type === 'transfer') {
            tentativeBalances[prospectiveTx.sourceId] -= Number(prospectiveTx.amount);
            tentativeBalances[prospectiveTx.destId] += Number(prospectiveTx.amount);
        } else if (prospectiveTx.type === 'remittance') {
            tentativeBalances[prospectiveTx.sourceId] -= Number(prospectiveTx.sourceAmount);
            tentativeBalances[prospectiveTx.destId] += Number(prospectiveTx.destAmount);
        }

        // 4c. Round and validate all tentative balances
        for (const wId of affectedWalletIds) {
            const cur = storage.state.wallets[wId].currency;
            tentativeBalances[wId] = this.roundCurrency(tentativeBalances[wId], cur);
            if (typeof tentativeBalances[wId] !== 'number' || isNaN(tentativeBalances[wId]) || !isFinite(tentativeBalances[wId])) {
                console.warn(`[WalletManager] Update aborted - resulting balance for '${wId}' is nonfinite.`);
                return false;
            }
        }

        // 5. Commit phase: Apply prepared changes atomically with complete rollback guarantee
        const preCommitBalances = {};
        affectedWalletIds.forEach(wId => {
            preCommitBalances[wId] = storage.state.wallets[wId].balance;
        });
        const preCommitTxFields = JSON.parse(JSON.stringify(tx));
        const preCommitTransactions = Array.isArray(storage.state.transactions) ? storage.state.transactions.slice() : [];
        const preCommitHistory = storage.state.history ? JSON.parse(JSON.stringify(storage.state.history)) : null;
        const preCommitLoanConfig = storage.state.loanConfig ? JSON.parse(JSON.stringify(storage.state.loanConfig)) : null;

        const isLoanPayment = Boolean(
            tx.isLoanPayment ||
            tx.subType === 'loan_emi' ||
            tx.categoryId === 'in-loan' ||
            (typeof tx.note === 'string' && /Loan EMI/i.test(tx.note))
        );

        try {
            affectedWalletIds.forEach(wId => {
                storage.state.wallets[wId].balance = tentativeBalances[wId];
            });

            // Adjust loan principal if an existing loan EMI transaction's amount was edited
            if (isLoanPayment && storage.state.loanConfig && typeof updatedData.amount !== 'undefined') {
                const oldAmt = Number(tx.amount) || 0;
                const newAmt = Number(prospectiveTx.amount) || 0;
                const diff = newAmt - oldAmt;
                const oldPrincipal = Number(storage.state.loanConfig.principalLeft) || 0;
                storage.state.loanConfig.principalLeft = Math.max(0, oldPrincipal - diff);
                if (storage.state.preferences?.loanTracking) {
                    storage.state.preferences.loanTracking.principalLeft = storage.state.loanConfig.principalLeft;
                }
            }

            Object.assign(tx, prospectiveTx);
            tx.updatedAt = new Date().toISOString();

            this._sortContinuousTransactions();
            const saved = storage.saveData();
            if (saved === false) {
                throw new Error("Local persistence failed.");
            }
            return true;
        } catch (commitErr) {
            console.error('[WalletManager] Unexpected error during atomic update commit. Rolling back completely...', commitErr);
            affectedWalletIds.forEach(wId => {
                storage.state.wallets[wId].balance = preCommitBalances[wId];
            });
            Object.assign(tx, preCommitTxFields);
            if (Array.isArray(storage.state.transactions)) {
                storage.state.transactions = preCommitTransactions;
            }
            if (preCommitHistory) {
                storage.state.history = preCommitHistory;
                storage._attachHistoryGetters(storage.state);
            }
            if (preCommitLoanConfig && storage.state.loanConfig) {
                Object.assign(storage.state.loanConfig, preCommitLoanConfig);
                if (storage.state.preferences?.loanTracking) {
                    storage.state.preferences.loanTracking.duesPaid = preCommitLoanConfig.duesPaid;
                    storage.state.preferences.loanTracking.principalLeft = preCommitLoanConfig.principalLeft;
                }
            }
            return false;
        }
    }

    // Delete a transaction and reverse its effects with atomicity and wallet existence guarantees
    deleteTransaction(txId) {
        const found = this.findTransaction(txId);
        if (!found) return false;

        const tx = found.tx;
        const origMonth = (tx.date || '').slice(0, 7);
        if (this.isMonthClosed(origMonth)) {
            console.warn(`[WalletManager] Month ${origMonth} is closed. Cannot delete transaction.`);
            return false;
        }

        // 1. Prepare phase: Validate that transaction CAN be reversed before touching anything
        const revCheck = this.validateTransactionForReversal(tx);
        if (!revCheck.valid) {
            console.warn(`[WalletManager] Cannot delete transaction due to invalid or missing wallet reference: ${revCheck.error}`);
            return false;
        }

        // 2. Prepare phase: Identify affected wallets and compute tentative balances
        const affectedWalletIds = new Set();
        if (tx.type === 'expense' || tx.type === 'income') {
            affectedWalletIds.add(tx.walletId);
        } else if (tx.type === 'transfer' || tx.type === 'remittance') {
            affectedWalletIds.add(tx.sourceId);
            affectedWalletIds.add(tx.destId);
        }

        const tentativeBalances = {};
        for (const wId of affectedWalletIds) {
            const w = storage.state.wallets[wId];
            if (!w || typeof w !== 'object' || typeof w.balance !== 'number' || !isFinite(w.balance)) {
                console.warn(`[WalletManager] Delete aborted - affected wallet '${wId}' is invalid.`);
                return false;
            }
            tentativeBalances[wId] = w.balance;
        }

        if (tx.type === 'expense') {
            tentativeBalances[tx.walletId] += Number(tx.amount);
        } else if (tx.type === 'income') {
            tentativeBalances[tx.walletId] -= Number(tx.amount);
        } else if (tx.type === 'transfer') {
            tentativeBalances[tx.sourceId] += Number(tx.amount);
            tentativeBalances[tx.destId] -= Number(tx.amount);
        } else if (tx.type === 'remittance') {
            tentativeBalances[tx.sourceId] += Number(tx.sourceAmount);
            tentativeBalances[tx.destId] -= Number(tx.destAmount);
        }

        for (const wId of affectedWalletIds) {
            const cur = storage.state.wallets[wId].currency;
            tentativeBalances[wId] = this.roundCurrency(tentativeBalances[wId], cur);
            if (!isFinite(tentativeBalances[wId])) {
                console.warn(`[WalletManager] Delete aborted - resulting balance for '${wId}' is nonfinite.`);
                return false;
            }
        }

        // 3. Commit phase: Apply balances and remove transaction atomically with complete rollback guarantee
        const preCommitBalances = {};
        affectedWalletIds.forEach(wId => {
            preCommitBalances[wId] = storage.state.wallets[wId].balance;
        });
        const preCommitTransactions = Array.isArray(storage.state.transactions) ? storage.state.transactions.slice() : [];
        const preCommitHistory = storage.state.history ? JSON.parse(JSON.stringify(storage.state.history)) : null;
        const preCommitLoanConfig = storage.state.loanConfig ? JSON.parse(JSON.stringify(storage.state.loanConfig)) : null;

        const isLoanPayment = Boolean(
            tx.isLoanPayment ||
            tx.subType === 'loan_emi' ||
            tx.categoryId === 'in-loan' ||
            (typeof tx.note === 'string' && /Loan EMI/i.test(tx.note))
        );

        try {
            affectedWalletIds.forEach(wId => {
                storage.state.wallets[wId].balance = tentativeBalances[wId];
            });

            // If deleting a loan payment, reverse the loan tracker state (decrement duesPaid, restore principalLeft)
            if (isLoanPayment && storage.state.loanConfig) {
                const oldDues = Number(storage.state.loanConfig.duesPaid) || 0;
                storage.state.loanConfig.duesPaid = Math.max(0, oldDues - 1);
                const oldPrincipal = Number(storage.state.loanConfig.principalLeft) || 0;
                const totalPrinc = Number(storage.state.loanConfig.totalPrincipal) || Infinity;
                storage.state.loanConfig.principalLeft = Math.min(totalPrinc, oldPrincipal + Number(tx.amount || 0));
                if (storage.state.preferences?.loanTracking) {
                    storage.state.preferences.loanTracking.duesPaid = storage.state.loanConfig.duesPaid;
                    storage.state.preferences.loanTracking.principalLeft = storage.state.loanConfig.principalLeft;
                }
            }

            // Remove from canonical continuous collection
            if (Array.isArray(storage.state.transactions)) {
                const cIndex = storage.state.transactions.findIndex(t => t.id === txId);
                if (cIndex !== -1) {
                    storage.state.transactions.splice(cIndex, 1);
                }
            }

            // Remove from legacy history if present
            if (found.location === 'history' && found.ledgerIndex !== undefined) {
                const ledger = storage.state.history[found.ledgerIndex];
                if (ledger) {
                    const desc = Object.getOwnPropertyDescriptor(ledger, 'transactions');
                    if (desc && Array.isArray(desc.value)) {
                        const hIndex = ledger.transactions.findIndex(t => t.id === txId);
                        if (hIndex !== -1) {
                            ledger.transactions.splice(hIndex, 1);
                        }
                    }
                }
            }

            const saved = storage.saveData();
            if (saved === false) {
                throw new Error("Local persistence failed.");
            }
            return true;
        } catch (commitErr) {
            console.error('[WalletManager] Unexpected error during atomic delete commit. Rolling back completely...', commitErr);
            affectedWalletIds.forEach(wId => {
                storage.state.wallets[wId].balance = preCommitBalances[wId];
            });
            if (Array.isArray(storage.state.transactions)) {
                storage.state.transactions = preCommitTransactions;
            }
            if (preCommitHistory) {
                storage.state.history = preCommitHistory;
                storage._attachHistoryGetters(storage.state);
            }
            if (preCommitLoanConfig && storage.state.loanConfig) {
                Object.assign(storage.state.loanConfig, preCommitLoanConfig);
                if (storage.state.preferences?.loanTracking) {
                    storage.state.preferences.loanTracking.duesPaid = preCommitLoanConfig.duesPaid;
                    storage.state.preferences.loanTracking.principalLeft = preCommitLoanConfig.principalLeft;
                }
            }
            return false;
        }
    }

    // Compute total spent per category in a given region for a specific month (defaults to active month)
    getCategoryTotals(region, monthKey = storage.state?.currentMonthKey) {
        const totals = {};
        if (storage.state?.categories?.[region]) {
            storage.state.categories[region].forEach(c => totals[c.id] = 0);
        }

        const txs = this.getTransactions({
            region,
            type: 'expense',
            monthKey: monthKey || undefined
        });

        txs.forEach(tx => {
            if (totals[tx.categoryId] !== undefined) {
                totals[tx.categoryId] += Number(tx.amount || 0);
            }
        });
        return totals;
    }

    // Total spent in a region for a specific set of transactions (defaults to active month expenses)
    getTotalSpent(region, transactions = null) {
        const txs = transactions || this.getTransactions({
            region,
            type: 'expense',
            monthKey: storage.state?.currentMonthKey
        });
        return txs
            .filter(tx => tx.type === 'expense' && tx.region === region)
            .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    }

    // Rollover is now pooled into jpTotalBudget as a cushion — not distributed per-category.
    // This method is kept as a stub for compatibility.
    getRollover(categoryId, region, targetMonthKey) {
        return 0;
    }

    // Returns the category's base budget. Rollover is now in jpTotalBudget, not per-category.
    getEffectiveBudget(categoryId, region, monthKey) {
        const cat = (storage.state.categories?.[region] || []).find(c => c.id === categoryId);
        return cat ? (cat.budget || 0) : 0;
    }

    // Calculate current loan state based on manual config
    getLoanState() {
        const config = storage.state.loanConfig;
        if (!config) return null;

        const totalPrincipal = Number(config.totalPrincipal) || 0;
        const principalLeft = Number(config.principalLeft) || 0;
        const emi = Number(config.emi) || 0;
        const duesPaid = Number(config.duesPaid) || 0;
        const totalDues = Number(config.totalDues) || 0;
        const rate = Number(config.annualInterestRate) || 0;
        const mode = config.percentMode || 'principal';

        const amountPaid = duesPaid * emi;
        const totalExpected = (emi > 0 && totalDues > 0) ? (emi * totalDues) : totalPrincipal;
        const totalInterest = Math.max(0, totalExpected - totalPrincipal);
        const principalPaid = Math.max(0, totalPrincipal - principalLeft);

        let rawPercent = 0;
        let percentLabel = 'Principal';
        let subLabel = 'Repaid';

        if (mode === 'total') {
            rawPercent = totalExpected > 0 ? (amountPaid / totalExpected) * 100 : 0;
            percentLabel = 'Total';
            subLabel = 'Repaid';
        } else if (mode === 'tenure') {
            rawPercent = totalDues > 0 ? (duesPaid / totalDues) * 100 : 0;
            percentLabel = 'Tenure';
            subLabel = 'Completed';
        } else {
            // Default: 'principal'
            rawPercent = totalPrincipal > 0 ? (principalPaid / totalPrincipal) * 100 : 0;
            percentLabel = 'Principal';
            subLabel = 'Repaid';
        }

        const percentPaid = Math.min(100, Math.max(0, rawPercent)).toFixed(0);

        const today = new Date();
        const drawDay = config.emiDrawDate || 7;
        let nextEmiDate = new Date(today.getFullYear(), today.getMonth(), drawDay);

        if (today.getDate() >= drawDay) {
            nextEmiDate.setMonth(nextEmiDate.getMonth() + 1);
        }

        const diffTime = nextEmiDate - today;
        const daysUntilNextEmi = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const nextEmiDateStr = nextEmiDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

        return {
            amountPaid,
            principalPaid,
            principalLeft: config.principalLeft,
            totalExpected,
            totalInterest,
            percentPaid,
            percentMode: mode,
            percentLabel,
            subLabel,
            emiCount: config.duesPaid,
            daysUntilNextEmi,
            nextEmiDateStr,
            config
        };
    }
}

const walletManager = new WalletManager();
window.walletManager = walletManager;
