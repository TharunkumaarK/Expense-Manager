class WalletManager {
    
    // Get all transactions
    getTransactions() {
        return storage.state.transactions;
    }

    // Add a standard expense (debit)
    addExpense(walletId, categoryId, amount, note, date = new Date().toISOString().split('T')[0]) {
        const wallet = storage.state.wallets[walletId];
        if (!wallet) return false;

        wallet.balance -= Number(amount);
        
        const tx = {
            id: Date.now().toString(),
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
        storage.saveData();
        return true;
    }

    // Add income (credit)
    addIncome(walletId, amount, note, date = new Date().toISOString().split('T')[0]) {
        const wallet = storage.state.wallets[walletId];
        if (!wallet) return false;

        wallet.balance += Number(amount);
        
        const tx = {
            id: Date.now().toString(),
            type: 'income',
            walletId,
            region: wallet.region,
            amount: Number(amount),
            currency: wallet.currency,
            note,
            date
        };
        
        storage.state.transactions.unshift(tx);
        storage.saveData();
        return true;
    }

    // Transfer between wallets (same currency)
    transfer(sourceId, destId, amount, note, date = new Date().toISOString().split('T')[0]) {
        const source = storage.state.wallets[sourceId];
        const dest = storage.state.wallets[destId];
        
        if (!source || !dest) return false;

        source.balance -= Number(amount);
        dest.balance += Number(amount);

        const tx = {
            id: Date.now().toString(),
            type: 'transfer',
            sourceId,
            destId,
            amount: Number(amount),
            currency: source.currency,
            note,
            date
        };

        storage.state.transactions.unshift(tx);
        storage.saveData();
        return true;
    }

    // Remittance (cross currency)
    remittance(sourceId, destId, sourceAmount, destAmount, note, date = new Date().toISOString().split('T')[0]) {
        const source = storage.state.wallets[sourceId];
        const dest = storage.state.wallets[destId];
        
        if (!source || !dest) return false;

        source.balance -= Number(sourceAmount);
        dest.balance += Number(destAmount);

        const tx = {
            id: Date.now().toString(),
            type: 'remittance',
            sourceId,
            destId,
            sourceAmount: Number(sourceAmount),
            destAmount: Number(destAmount),
            sourceCurrency: source.currency,
            destCurrency: dest.currency,
            exchangeRate: (Number(destAmount) / Number(sourceAmount)).toFixed(4),
            note,
            date
        };

        storage.state.transactions.unshift(tx);
        storage.saveData();
        return true;
    }
    
    // Find transaction in active month or history ledgers
    findTransaction(txId) {
        if (!storage.state) return null;

        if (Array.isArray(storage.state.transactions)) {
            const index = storage.state.transactions.findIndex(t => t.id === txId);
            if (index !== -1) {
                return {
                    tx: storage.state.transactions[index],
                    location: 'current',
                    index,
                    monthKey: storage.state.currentMonthKey
                };
            }
        }

        if (Array.isArray(storage.state.history)) {
            for (let hIndex = 0; hIndex < storage.state.history.length; hIndex++) {
                const ledger = storage.state.history[hIndex];
                if (ledger && Array.isArray(ledger.transactions)) {
                    const index = ledger.transactions.findIndex(t => t.id === txId);
                    if (index !== -1) {
                        return {
                            tx: ledger.transactions[index],
                            location: 'history',
                            ledgerIndex: hIndex,
                            index,
                            monthKey: ledger.monthKey
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

    // In-place update preserving transaction ID and metadata
    updateTransaction(txId, updatedData) {
        const found = this.findTransaction(txId);
        if (!found) return false;

        const tx = found.tx;

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
                tx.exchangeRate = (tx.destAmount / tx.sourceAmount).toFixed(4);
            }
        }

        // 3. Apply new financial balance impacts
        this.applyTransactionEffects(tx);

        // 4. Handle date / month routing if date changed
        const newMonthKey = tx.date ? tx.date.substring(0, 7) : storage.state.currentMonthKey;
        const currentMonthKey = storage.state.currentMonthKey;

        if (found.location === 'current') {
            if (newMonthKey !== currentMonthKey) {
                // Moved from current active month into past archive
                storage.state.transactions.splice(found.index, 1);
                let ledger = storage.state.history.find(h => h.monthKey === newMonthKey);
                if (!ledger) {
                    ledger = {
                        monthKey: newMonthKey,
                        transactions: [],
                        walletsSnapshot: JSON.parse(JSON.stringify(storage.state.wallets))
                    };
                    storage.state.history.push(ledger);
                    storage.state.history.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
                }
                ledger.transactions.unshift(tx);
            }
        } else if (found.location === 'history') {
            if (newMonthKey === currentMonthKey) {
                // Moved from past archive into current active month
                storage.state.history[found.ledgerIndex].transactions.splice(found.index, 1);
                storage.state.transactions.unshift(tx);
            } else if (newMonthKey !== found.monthKey) {
                // Moved between two history archives
                storage.state.history[found.ledgerIndex].transactions.splice(found.index, 1);
                let ledger = storage.state.history.find(h => h.monthKey === newMonthKey);
                if (!ledger) {
                    ledger = {
                        monthKey: newMonthKey,
                        transactions: [],
                        walletsSnapshot: JSON.parse(JSON.stringify(storage.state.wallets))
                    };
                    storage.state.history.push(ledger);
                    storage.state.history.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
                }
                ledger.transactions.unshift(tx);
            }
        }

        // 5. Persist once atomically
        storage.saveData();
        return true;
    }

    // Delete a transaction and reverse its effects
    deleteTransaction(txId) {
        const found = this.findTransaction(txId);
        if (!found) return false;

        this.reverseTransactionEffects(found.tx);

        if (found.location === 'current') {
            storage.state.transactions.splice(found.index, 1);
        } else if (found.location === 'history') {
            storage.state.history[found.ledgerIndex].transactions.splice(found.index, 1);
        }

        storage.saveData();
        return true;
    }

    // Compute total spent per category in a given region
    getCategoryTotals(region) {
        const totals = {};
        storage.state.categories[region].forEach(c => totals[c.id] = 0);
        
        storage.state.transactions.forEach(tx => {
            if (tx.type === 'expense' && tx.region === region && totals[tx.categoryId] !== undefined) {
                totals[tx.categoryId] += tx.amount;
            }
        });
        return totals;
    }

    // Total spent in a region for a specific set of transactions (defaults to current)
    getTotalSpent(region, transactions = storage.state.transactions) {
        return transactions
            .filter(tx => tx.type === 'expense' && tx.region === region)
            .reduce((sum, tx) => sum + tx.amount, 0);
    }

    // Rollover is now pooled into jpTotalBudget as a cushion — not distributed per-category.
    // This method is kept as a stub for compatibility.
    getRollover(categoryId, region, targetMonthKey) {
        return 0;
    }

    // Returns the category's base budget. Rollover is now in jpTotalBudget, not per-category.
    getEffectiveBudget(categoryId, region, monthKey) {
        const cat = storage.state.categories[region].find(c => c.id === categoryId);
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
