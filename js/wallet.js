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
    
    // Delete a transaction and reverse its effects
    deleteTransaction(txId) {
        const txIndex = storage.state.transactions.findIndex(t => t.id === txId);
        if (txIndex === -1) return false;
        
        const tx = storage.state.transactions[txIndex];
        
        if (tx.type === 'expense') {
            storage.state.wallets[tx.walletId].balance += tx.amount;
        } else if (tx.type === 'income') {
            storage.state.wallets[tx.walletId].balance -= tx.amount;
        } else if (tx.type === 'transfer') {
            storage.state.wallets[tx.sourceId].balance += tx.amount;
            storage.state.wallets[tx.destId].balance -= tx.amount;
        } else if (tx.type === 'remittance') {
            storage.state.wallets[tx.sourceId].balance += tx.sourceAmount;
            storage.state.wallets[tx.destId].balance -= tx.destAmount;
        }
        
        storage.state.transactions.splice(txIndex, 1);
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

    // Recursively calculate rollover savings from previous months with proportional debt balancing
    getRollover(categoryId, region, targetMonthKey) {
        const prevLedger = storage.state.history.find(h => h.monthKey < targetMonthKey);
        if (!prevLedger) return 0;
        
        let totalPositiveSavings = 0;
        let totalDebt = 0;
        const catSavings = {};
        
        storage.state.categories[region].forEach(c => {
            const baseBudget = c.budget || 0;
            if (baseBudget <= 0) return;
            
            const prevPrevRollover = this.getRollover(c.id, region, prevLedger.monthKey);
            const effectivePrevBudget = baseBudget + prevPrevRollover;
            
            let spent = 0;
            prevLedger.transactions.forEach(tx => {
                if (tx.type === 'expense' && tx.region === region && tx.categoryId === c.id) {
                    spent += tx.amount;
                }
            });
            
            const remaining = effectivePrevBudget - spent;
            catSavings[c.id] = remaining;
            
            if (remaining > 0) {
                totalPositiveSavings += remaining;
            } else {
                totalDebt += Math.abs(remaining);
            }
        });
        
        if (totalDebt >= totalPositiveSavings) return 0; // Total budget blown
        
        const myRemaining = catSavings[categoryId] || 0;
        if (myRemaining <= 0) return 0; // In debt
        
        const myShareOfSavings = myRemaining / totalPositiveSavings;
        const myDebtAbsorption = totalDebt * myShareOfSavings;
        
        const finalRollover = myRemaining - myDebtAbsorption;
        return finalRollover > 0 ? finalRollover : 0;
    }

    // Get the effective budget for a category in a specific month
    getEffectiveBudget(categoryId, region, monthKey) {
        const cat = storage.state.categories[region].find(c => c.id === categoryId);
        const baseBudget = cat ? (cat.budget || 0) : 0;
        if (baseBudget <= 0) return 0;
        
        const rollover = this.getRollover(categoryId, region, monthKey);
        return baseBudget + rollover;
    }

    // Calculate current loan state based on manual config
    getLoanState() {
        const config = storage.state.loanConfig;
        if (!config) return null;

        const amountPaid = config.duesPaid * config.emi;
        const totalExpected = config.emi * config.totalDues;
        const principalPaid = config.totalPrincipal - config.principalLeft;
        const percentPaid = Math.min(100, (config.duesPaid / config.totalDues) * 100).toFixed(0);

        return {
            amountPaid,
            principalPaid,
            principalLeft: config.principalLeft,
            percentPaid,
            emiCount: config.duesPaid,
            config
        };
    }
}

const walletManager = new WalletManager();
