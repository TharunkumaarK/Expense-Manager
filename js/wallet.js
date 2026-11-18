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

        const wallet = storage.state.wallets[walletId];
        if (!wallet) return false;

        wallet.balance -= Number(amount);

        const tx = {
            id: this.generateTransactionId(),
            type: 'expense',
            walletId,
            region: wallet.region,
            categoryId,
            amount: Number(amount),
            currency: wallet.currency,
            note,
            date
        };

        storage.state.transactions.unshift(tx);
        this._sortContinuousTransactions();
        storage.saveData();
        return true;
    }

    // Add income (credit)
    addIncome(walletId, amount, note, date = new Date().toISOString().split('T')[0]) {
        const monthKey = (date || '').slice(0, 7);
        if (this.isMonthClosed(monthKey)) {
            console.warn(`[WalletManager] Month ${monthKey} is closed. Cannot add income.`);
            return false;
        }

        const wallet = storage.state.wallets[walletId];
        if (!wallet) return false;

        wallet.balance += Number(amount);

        const tx = {
            id: this.generateTransactionId(),
            type: 'income',
            walletId,
            region: wallet.region,
            amount: Number(amount),
            currency: wallet.currency,
            note,
            date
        };

        storage.state.transactions.unshift(tx);
        this._sortContinuousTransactions();
        storage.saveData();
        return true;
    }

    // Validate numeric amount and decimal precision according to currency
    isValidAmount(amount, currency) {
        if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount) || amount <= 0) {
            return false;
        }
        const cur = (currency || '').toUpperCase();
        if (cur === '¥' || cur === 'JPY') {
            return Math.abs(amount - Math.round(amount)) < 1e-6;
        }
        // INR and EUR: max 2 decimal places
        const rounded = Math.round(amount * 100) / 100;
        return Math.abs(amount - rounded) < 1e-6;
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
                newBalance: (source.balance || 0) - num1
            };
            preview.dest = {
                id: destId,
                name: destId,
                currency: dest.currency,
                currentBalance: dest.balance || 0,
                newBalance: (dest.balance || 0) + num1
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
                newBalance: (source.balance || 0) - num1
            };
            preview.dest = {
                id: destId,
                name: destId,
                currency: dest.currency,
                currentBalance: dest.balance || 0,
                newBalance: (dest.balance || 0) + num2
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

        source.balance -= numAmount;
        dest.balance += numAmount;

        const tx = {
            id: this.generateTransactionId(),
            type: 'transfer',
            sourceId,
            destId,
            amount: numAmount,
            currency: source.currency,
            note: note || '',
            date
        };

        storage.state.transactions.unshift(tx);
        this._sortContinuousTransactions();
        storage.saveData();
        return true;
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

        source.balance -= numSource;
        dest.balance += numDest;

        const tx = {
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

        storage.state.transactions.unshift(tx);
        this._sortContinuousTransactions();
        storage.saveData();
        return true;
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

    // Reverse financial balance impacts of a transaction
    reverseTransactionEffects(tx) {
        if (!tx || !storage.state.wallets) return;
        if (tx.type === 'expense') {
            if (storage.state.wallets[tx.walletId]) {
                storage.state.wallets[tx.walletId].balance += Number(tx.amount);
            }
        } else if (tx.type === 'income') {
            if (storage.state.wallets[tx.walletId]) {
                storage.state.wallets[tx.walletId].balance -= Number(tx.amount);
            }
        } else if (tx.type === 'transfer') {
            if (storage.state.wallets[tx.sourceId]) {
                storage.state.wallets[tx.sourceId].balance += Number(tx.amount);
            }
            if (storage.state.wallets[tx.destId]) {
                storage.state.wallets[tx.destId].balance -= Number(tx.amount);
            }
        } else if (tx.type === 'remittance') {
            if (storage.state.wallets[tx.sourceId]) {
                storage.state.wallets[tx.sourceId].balance += Number(tx.sourceAmount);
            }
            if (storage.state.wallets[tx.destId]) {
                storage.state.wallets[tx.destId].balance -= Number(tx.destAmount);
            }
        }
    }

    // Apply financial balance impacts of a transaction
    applyTransactionEffects(tx) {
        if (!tx || !storage.state.wallets) return;
        if (tx.type === 'expense') {
            if (storage.state.wallets[tx.walletId]) {
                storage.state.wallets[tx.walletId].balance -= Number(tx.amount);
            }
        } else if (tx.type === 'income') {
            if (storage.state.wallets[tx.walletId]) {
                storage.state.wallets[tx.walletId].balance += Number(tx.amount);
            }
        } else if (tx.type === 'transfer') {
            if (storage.state.wallets[tx.sourceId]) {
                storage.state.wallets[tx.sourceId].balance -= Number(tx.amount);
            }
            if (storage.state.wallets[tx.destId]) {
                storage.state.wallets[tx.destId].balance += Number(tx.amount);
            }
        } else if (tx.type === 'remittance') {
            if (storage.state.wallets[tx.sourceId]) {
                storage.state.wallets[tx.sourceId].balance -= Number(tx.sourceAmount);
            }
            if (storage.state.wallets[tx.destId]) {
                storage.state.wallets[tx.destId].balance += Number(tx.destAmount);
            }
        }
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

        // Validate proposed changes BEFORE mutating anything
        const targetDate = updatedData.date || tx.date;
        if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
            console.warn(`[WalletManager] Invalid date format: ${targetDate}`);
            return false;
        }

        if (tx.type === 'expense') {
            const wId = updatedData.walletId || tx.walletId;
            const wallet = storage.state.wallets[wId];
            if (!wallet) return false;
            const amt = (typeof updatedData.amount !== 'undefined') ? Number(updatedData.amount) : tx.amount;
            if (!this.isValidAmount(amt, wallet.currency)) return false;
            const catId = updatedData.categoryId || tx.categoryId;
            if (!catId) return false;
        } else if (tx.type === 'income') {
            const wId = updatedData.walletId || tx.walletId;
            const wallet = storage.state.wallets[wId];
            if (!wallet) return false;
            const amt = (typeof updatedData.amount !== 'undefined') ? Number(updatedData.amount) : tx.amount;
            if (!this.isValidAmount(amt, wallet.currency)) return false;
        } else if (tx.type === 'transfer') {
            const sId = updatedData.sourceId || tx.sourceId;
            const dId = updatedData.destId || tx.destId;
            const amt = (typeof updatedData.amount !== 'undefined') ? Number(updatedData.amount) : tx.amount;
            const preview = this.getTransferPreview('transfer', sId, dId, amt);
            if (!preview.valid) return false;
        } else if (tx.type === 'remittance') {
            const sId = updatedData.sourceId || tx.sourceId;
            const dId = updatedData.destId || tx.destId;
            const sAmt = (typeof updatedData.sourceAmount !== 'undefined') ? Number(updatedData.sourceAmount) : tx.sourceAmount;
            const dAmt = (typeof updatedData.destAmount !== 'undefined') ? Number(updatedData.destAmount) : tx.destAmount;
            const preview = this.getTransferPreview('remittance', sId, dId, sAmt, dAmt);
            if (!preview.valid) return false;
        }

        // 1. Reverse old financial balance impacts
        this.reverseTransactionEffects(tx);

        // 2. Update transaction fields in place
        if (updatedData.date) tx.date = updatedData.date;
        if (typeof updatedData.note !== 'undefined') tx.note = updatedData.note;
        tx.updatedAt = new Date().toISOString();

        if (tx.type === 'expense') {
            if (updatedData.walletId) tx.walletId = updatedData.walletId;
            const wallet = storage.state.wallets[tx.walletId];
            if (wallet) {
                tx.currency = wallet.currency;
                tx.region = wallet.region;
            }
            if (updatedData.categoryId) tx.categoryId = updatedData.categoryId;
            if (typeof updatedData.amount !== 'undefined') tx.amount = Number(updatedData.amount);
        } else if (tx.type === 'income') {
            if (updatedData.walletId) tx.walletId = updatedData.walletId;
            const wallet = storage.state.wallets[tx.walletId];
            if (wallet) {
                tx.currency = wallet.currency;
                tx.region = wallet.region;
            }
            if (typeof updatedData.amount !== 'undefined') tx.amount = Number(updatedData.amount);
        } else if (tx.type === 'transfer') {
            if (updatedData.sourceId) tx.sourceId = updatedData.sourceId;
            if (updatedData.destId) tx.destId = updatedData.destId;
            if (typeof updatedData.amount !== 'undefined') tx.amount = Number(updatedData.amount);
            const source = storage.state.wallets[tx.sourceId];
            if (source) tx.currency = source.currency;
        } else if (tx.type === 'remittance') {
            if (updatedData.sourceId) tx.sourceId = updatedData.sourceId;
            if (updatedData.destId) tx.destId = updatedData.destId;
            if (typeof updatedData.sourceAmount !== 'undefined') tx.sourceAmount = Number(updatedData.sourceAmount);
            if (typeof updatedData.destAmount !== 'undefined') tx.destAmount = Number(updatedData.destAmount);
            const source = storage.state.wallets[tx.sourceId];
            const dest = storage.state.wallets[tx.destId];
            if (source) tx.sourceCurrency = source.currency;
            if (dest) tx.destCurrency = dest.currency;
            if (tx.sourceAmount > 0 && tx.destAmount > 0) {
                tx.exchangeRate = (tx.destAmount / tx.sourceAmount).toFixed(6);
            }
        }

        // 3. Apply new financial balance impacts
        this.applyTransactionEffects(tx);

        // 4. In Continuous Ledger: Keep chronological sort descending
        this._sortContinuousTransactions();

        // 5. Persist once atomically
        storage.saveData();
        return true;
    }

    // Delete a transaction and reverse its effects
    deleteTransaction(txId) {
        const found = this.findTransaction(txId);
        if (!found) return false;

        const origMonth = (found.tx.date || '').slice(0, 7);
        if (this.isMonthClosed(origMonth)) {
            console.warn(`[WalletManager] Month ${origMonth} is closed. Cannot delete transaction.`);
            return false;
        }

        this.reverseTransactionEffects(found.tx);

        // 1. Remove from canonical continuous transactions if present
        let deleted = false;
        if (Array.isArray(storage.state.transactions)) {
            const cIndex = storage.state.transactions.findIndex(t => t.id === txId);
            if (cIndex !== -1) {
                storage.state.transactions.splice(cIndex, 1);
                deleted = true;
            }
        }

        // 2. If found in legacy history with raw own-property transactions array (unmigrated)
        if (found.location === 'history' && found.ledgerIndex !== undefined) {
            const ledger = storage.state.history[found.ledgerIndex];
            if (ledger) {
                const desc = Object.getOwnPropertyDescriptor(ledger, 'transactions');
                if (desc && Array.isArray(desc.value)) {
                    const hIndex = ledger.transactions.findIndex(t => t.id === txId);
                    if (hIndex !== -1) {
                        ledger.transactions.splice(hIndex, 1);
                        deleted = true;
                    }
                }
            }
        }

        storage.saveData();
        return true;
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

        const amountPaid = config.duesPaid * config.emi;
        const totalExpected = config.emi * config.totalDues;
        const principalPaid = config.totalPrincipal - config.principalLeft;
        const percentPaid = Math.min(100, (config.duesPaid / config.totalDues) * 100).toFixed(0);

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
            percentPaid,
            emiCount: config.duesPaid,
            daysUntilNextEmi,
            nextEmiDateStr,
            config
        };
    }
}

const walletManager = new WalletManager();
window.walletManager = walletManager;
