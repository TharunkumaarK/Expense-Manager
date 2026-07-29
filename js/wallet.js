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

    // Total spent in a region
    getTotalSpent(region) {
        return storage.state.transactions
            .filter(tx => tx.type === 'expense' && tx.region === region)
            .reduce((sum, tx) => sum + tx.amount, 0);
    }
}

const walletManager = new WalletManager();
