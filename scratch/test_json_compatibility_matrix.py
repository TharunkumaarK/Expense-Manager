import subprocess, json, time, urllib.request, asyncio, websockets

CHROME_BIN = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'

async def run_matrix():
    p = subprocess.Popen([
        CHROME_BIN,
        '--headless=new',
        '--remote-debugging-port=9475',
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=/tmp/test_chrome_profile_matrix',
        'about:blank'
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    try:
        with urllib.request.urlopen('http://127.0.0.1:9475/json') as r:
            tabs = json.loads(r.read().decode())
        ws_url = tabs[0]['webSocketDebuggerUrl']

        async with websockets.connect(ws_url) as ws:
            msg_id = 0
            async def send(method, params=None):
                nonlocal msg_id
                msg_id += 1
                payload = {'id': msg_id, 'method': method}
                if params: payload['params'] = params
                await ws.send(json.dumps(payload))
                while True:
                    resp = json.loads(await ws.recv())
                    if resp.get('id') == msg_id:
                        return resp

            await send('Page.enable')
            await send('Runtime.enable')

            mock_script = '''
                window.supabase = {
                    createClient: () => ({
                        auth: {
                            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
                            getSession: async () => ({ data: { session: null } }),
                            getUser: async () => ({ data: { user: null } })
                        },
                        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) })
                    })
                };
                window.Chart = class { constructor() {} destroy() {} update() {} };
                window.Chart.register = () => {};
                window.lucide = { createIcons: () => {} };
            '''
            await send('Page.addScriptToEvaluateOnNewDocument', {'source': mock_script})
            await send('Page.navigate', {'url': 'file:///mnt/01DB426183A10370/E_Software/Docs/Antigravity%20Expense%20Manager/Expense-Manager/index.html'})
            await asyncio.sleep(2)

            test_harness = '''(() => {
                const results = {};

                // -------------------------------------------------------------
                // TIER 1: Early PWA (v1 - July 2026)
                // -------------------------------------------------------------
                try {
                    const tier1Input = {
                        currentMonthKey: "2026-07",
                        jpTotalBudget: 150000,
                        wallets: {
                            'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 120000, currency: '¥' },
                            'Forex Card': { id: 'Forex Card', type: 'card', region: 'JP', balance: 34843, currency: '¥' },
                            'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 7000, currency: '¥' },
                            'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', balance: 5000, currency: '¥' },
                            'Axis Bank': { id: 'Axis Bank', type: 'bank', region: 'IN', balance: 17084, currency: '₹' },
                            'Bank of Baroda': { id: 'Bank of Baroda', type: 'bank', region: 'IN', balance: 23485, currency: '₹' },
                            'Credit Card': { id: 'Credit Card', type: 'card', region: 'IN', balance: 0, currency: '₹' }
                        },
                        categories: {
                            JP: [
                                { id: 'jp-food', name: 'Food & Groceries', icon: 'shopping-basket', budget: 30000 },
                                { id: 'jp-rent', name: 'Rent', icon: 'home', budget: 50000 },
                                { id: 'jp-utility-electric', name: 'Electricity', icon: 'zap', budget: 0 }
                            ],
                            IN: [
                                { id: 'in-petrol', name: 'Petrol', icon: 'fuel' }
                            ]
                        },
                        transactions: [
                            { id: 'tx-t1-1', type: 'expense', walletId: 'Salary Account', amount: 50000, categoryId: 'jp-rent', date: '2026-07-01', note: 'July Rent' },
                            { id: 'tx-t1-2', type: 'expense', walletId: 'Cash', amount: 2000, categoryId: 'jp-food', date: '2026-07-05', note: 'Food' }
                        ],
                        history: []
                    };

                    const m1 = storage.parseAndMergeData(tier1Input);
                    results.tier1 = {
                        success: true,
                        forexCardDeleted: !('Forex Card' in m1.wallets),
                        walletsPreservedCount: Object.keys(m1.wallets).length,
                        salaryBalance: m1.wallets['Salary Account']?.balance,
                        salaryColorPopulated: Boolean(m1.wallets['Salary Account']?.color),
                        rentCategoryMovedToIN: m1.categories.IN.some(c => c.id === 'in-rent'),
                        rentCategoryRemovedFromJP: !m1.categories.JP.some(c => c.id === 'jp-rent'),
                        rentTxMigratedToIN: m1.transactions.find(t => t.id === 'tx-t1-1')?.categoryId === 'in-rent',
                        loanConfigPopulated: Boolean(m1.loanConfig && m1.loanConfig.emiDrawDate === 7),
                        schemaVersion: m1.schemaVersion
                    };
                } catch (e) {
                    results.tier1 = { success: false, error: e.message };
                }

                // -------------------------------------------------------------
                // TIER 2: Initial Supabase Launch (v2 - August 2026)
                // -------------------------------------------------------------
                try {
                    const tier2Input = {
                        currentMonthKey: "2026-08",
                        jpTotalBudget: 160000,
                        wallets: {
                            'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 250000, currency: '¥', color: '#009944' },
                            'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 12000, currency: '¥', color: '#d4af37' }
                        },
                        categories: {
                            JP: [
                                { id: 'jp-food', name: 'Food & Groceries', icon: 'shopping-basket', budget: 35000 },
                                { id: 'jp-utilities', name: 'Utilities', icon: 'zap', budget: 15000 }
                            ],
                            IN: [
                                { id: 'in-loan', name: 'Loan EMI', icon: 'landmark' }
                            ]
                        },
                        loanConfig: {
                            enabled: true,
                            totalPrincipal: 200000,
                            principalLeft: 150000,
                            emi: 10000,
                            duesPaid: 5,
                            totalDues: 24,
                            annualInterestRate: 15.5,
                            emiDrawDate: 7
                        },
                        transactions: [
                            { id: 'tx-t2-1', type: 'expense', walletId: 'Salary Account', amount: 4500, categoryId: 'jp-utilities', date: '2026-08-10', note: 'Electricity - TEPCO bill' }
                        ],
                        history: [
                            {
                                monthKey: '2026-07',
                                closedAt: '2026-07-31T23:59:59.000Z',
                                jpTotalBudget: 150000,
                                jpRolloverAdded: 10000,
                                walletsSnapshot: { 'Salary Account': { balance: 200000 } },
                                transactions: [
                                    { id: 'tx-t2-hist-1', type: 'expense', walletId: 'Salary Account', amount: 35000, categoryId: 'jp-food', date: '2026-07-20', note: 'Food' }
                                ]
                            }
                        ]
                    };

                    const m2 = storage.parseAndMergeData(tier2Input);
                    results.tier2 = {
                        success: true,
                        utilitiesSplit: !m2.categories.JP.some(c => c.id === 'jp-utilities') && m2.categories.JP.some(c => c.id === 'jp-utility-electric'),
                        activeUtilTxRecovered: m2.transactions.find(t => t.id === 'tx-t2-1')?.categoryId === 'jp-utility-electric',
                        historicalTxMergedCount: m2.transactions.length, // Expected: 1 active + 1 historical = 2
                        closedMonthsCreated: Object.keys(m2.closedMonths || {}),
                        historyLength: m2.history.length,
                        historyGetterTransactionsCount: m2.history[0]?.transactions?.length,
                        loanConfigPreserved: m2.loanConfig.principalLeft === 150000,
                        schemaVersion: m2.schemaVersion
                    };
                } catch (e) {
                    results.tier2 = { success: false, error: e.message };
                }

                // -------------------------------------------------------------
                // TIER 3: Multi-Month Production State (Current origin/main)
                // -------------------------------------------------------------
                try {
                    const tier3Input = {
                        currentMonthKey: "2026-10",
                        jpTotalBudget: 195000,
                        wallets: {
                            'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 340000, currency: '¥', color: '#009944' },
                            'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 15000, currency: '¥', color: '#d4af37' },
                            'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', balance: 9200, currency: '¥', color: '#ff0033' },
                            'Bank Account': { id: 'Bank Account', type: 'bank', region: 'IN', balance: 85000, currency: '₹', color: '#97144d' }
                        },
                        categories: {
                            JP: [
                                { id: 'jp-food', name: 'Food & Groceries', icon: 'shopping-basket', budget: 40000 },
                                { id: 'jp-dining', name: 'Dining Out', icon: 'utensils', budget: 20000 },
                                { id: 'jp-transport', name: 'Transport', icon: 'train-front', budget: 15000 }
                            ],
                            IN: [
                                { id: 'in-petrol', name: 'Petrol', icon: 'fuel' },
                                { id: 'in-rent', name: 'Rent', icon: 'home' }
                            ]
                        },
                        transactions: [
                            { id: 'tx-oct-1', type: 'expense', walletId: 'Salary Account', amount: 5000, categoryId: 'jp-food', date: '2026-10-02', note: 'Dinner' },
                            { id: 'tx-oct-2', type: 'income', walletId: 'Salary Account', amount: 350000, categoryId: 'jp-salary', date: '2026-10-01', note: 'Salary' },
                            { id: 'tx-oct-3', type: 'transfer', sourceId: 'Salary Account', destId: 'PayPay', amount: 10000, currency: '¥', date: '2026-10-03', note: 'Top up' }
                        ],
                        history: [
                            {
                                monthKey: '2026-09',
                                closedAt: '2026-09-30T23:59:59.000Z',
                                jpTotalBudget: 180000,
                                jpRolloverAdded: 15000,
                                walletsSnapshot: { 'Salary Account': { balance: 310000 } },
                                transactions: [
                                    { id: 'tx-sep-1', type: 'expense', walletId: 'Salary Account', amount: 38000, categoryId: 'jp-food', date: '2026-09-15', note: 'Groceries' },
                                    { id: 'tx-sep-2', type: 'expense', walletId: 'Salary Account', amount: 12000, categoryId: 'jp-dining', date: '2026-09-20', note: 'Dining' },
                                    { id: 'tx-sep-3', type: 'income', walletId: 'Salary Account', amount: 350000, categoryId: 'jp-salary', date: '2026-09-01', note: 'Salary' }
                                ]
                            },
                            {
                                monthKey: '2026-08',
                                closedAt: '2026-08-31T23:59:59.000Z',
                                jpTotalBudget: 170000,
                                jpRolloverAdded: 10000,
                                walletsSnapshot: { 'Salary Account': { balance: 270000 } },
                                transactions: [
                                    { id: 'tx-aug-1', type: 'expense', walletId: 'Cash', amount: 3000, categoryId: 'jp-food', date: '2026-08-12', note: 'Supermarket' },
                                    { id: 'tx-aug-2', type: 'remittance', sourceId: 'Salary Account', destId: 'Bank Account', sourceAmount: 100000, destAmount: 55000, exchangeRate: 0.55, date: '2026-08-15', note: 'Remittance to India' }
                                ]
                            }
                        ]
                    };

                    const preSalary = tier3Input.wallets['Salary Account'].balance;
                    const preCash = tier3Input.wallets['Cash'].balance;
                    const prePayPay = tier3Input.wallets['PayPay'].balance;
                    const preBank = tier3Input.wallets['Bank Account'].balance;

                    const m3 = storage.parseAndMergeData(tier3Input);

                    // Test idempotency by running migration again on the already migrated output
                    const m3Again = storage.parseAndMergeData(JSON.parse(JSON.stringify(m3)));

                    results.tier3 = {
                        success: true,
                        totalContinuousTxCount: m3.transactions.length, // Expected: 3 active + 3 sep + 2 aug = 8
                        chronologicallySorted: m3.transactions[0].date >= m3.transactions[m3.transactions.length - 1].date,
                        closedMonthsPreserved: Object.keys(m3.closedMonths).sort(),
                        walletBalancesExactMatch: (
                            m3.wallets['Salary Account'].balance === preSalary &&
                            m3.wallets['Cash'].balance === preCash &&
                            m3.wallets['PayPay'].balance === prePayPay &&
                            m3.wallets['Bank Account'].balance === preBank
                        ),
                        historyGettersCorrect: (
                            m3.history.find(h => h.monthKey === '2026-09')?.transactions?.length === 3 &&
                            m3.history.find(h => h.monthKey === '2026-08')?.transactions?.length === 2
                        ),
                        remittancePreserved: Boolean(m3.transactions.find(t => t.id === 'tx-aug-2' && t.type === 'remittance' && t.destAmount === 55000)),
                        idempotencyVerified: (
                            m3Again.transactions.length === m3.transactions.length &&
                            m3Again.schemaVersion === 3 &&
                            Object.keys(m3Again.closedMonths).length === Object.keys(m3.closedMonths).length
                        )
                    };
                } catch (e) {
                    results.tier3 = { success: false, error: e.message };
                }

                // -------------------------------------------------------------
                // TIER 4: Edge-Case & Corrupted Payloads
                // -------------------------------------------------------------
                results.tier4 = {};

                // 4.A: Missing optional fields & null categories/history
                try {
                    const edgeA = {
                        wallets: { 'Main': { id: 'Main', type: 'bank', balance: 500, currency: '¥' } },
                        transactions: [],
                        categories: null,
                        loanConfig: null,
                        history: null
                    };
                    const mA = storage.parseAndMergeData(edgeA);
                    results.tier4.missingOptionals = {
                        success: true,
                        categoriesRecovered: Boolean(mA.categories?.JP && mA.categories?.IN),
                        loanConfigRecovered: Boolean(mA.loanConfig && mA.loanConfig.emiDrawDate === 7),
                        historyRecovered: Array.isArray(mA.history),
                        schemaVersion: mA.schemaVersion
                    };
                } catch (e) {
                    results.tier4.missingOptionals = { success: false, error: e.message };
                }

                // 4.B: Identical duplicate transaction in active & history -> safely skipped
                try {
                    const edgeB = {
                        wallets: { 'Main': { id: 'Main', type: 'bank', balance: 500, currency: '¥' } },
                        transactions: [
                            { id: 'dup-1', type: 'expense', walletId: 'Main', amount: 100, date: '2026-09-01', note: 'Coffee' }
                        ],
                        history: [
                            {
                                monthKey: '2026-09',
                                transactions: [
                                    { id: 'dup-1', type: 'expense', walletId: 'Main', amount: 100, date: '2026-09-01', note: 'Coffee' } // IDENTICAL DUPLICATE
                                ]
                            }
                        ]
                    };
                    const mB = storage.parseAndMergeData(edgeB);
                    results.tier4.identicalDuplicateSkipped = {
                        success: true,
                        txCount: mB.transactions.length, // Expected: 1 (not 2)
                        schemaVersion: mB.schemaVersion
                    };
                } catch (e) {
                    results.tier4.identicalDuplicateSkipped = { success: false, error: e.message };
                }

                // 4.C: Conflicting duplicate transaction (same ID, different amount) -> Strict Safety Halt
                try {
                    const edgeC = {
                        wallets: { 'Main': { id: 'Main', type: 'bank', balance: 500, currency: '¥' } },
                        transactions: [
                            { id: 'conflict-1', type: 'expense', walletId: 'Main', amount: 100, date: '2026-09-01', note: 'Coffee' }
                        ],
                        history: [
                            {
                                monthKey: '2026-09',
                                transactions: [
                                    { id: 'conflict-1', type: 'expense', walletId: 'Main', amount: 9999, date: '2026-09-01', note: 'CONFLICTING AMOUNT' }
                                ]
                            }
                        ]
                    };
                    let caughtError = null;
                    try {
                        storage.migrateToContinuousLedger(edgeC);
                    } catch (err) {
                        caughtError = err.message;
                    }
                    results.tier4.conflictSafetyHalt = {
                        haltedProperly: Boolean(caughtError && caughtError.includes('Migration conflict detected')),
                        errorMessage: caughtError
                    };
                } catch (e) {
                    results.tier4.conflictSafetyHalt = { success: false, error: e.message };
                }

                // 4.D: Partially migrated state (schemaVersion 3 set, but raw transactions in history)
                try {
                    const edgeD = {
                        schemaVersion: 3,
                        closedMonths: { '2026-08': { monthKey: '2026-08' } },
                        wallets: { 'Main': { id: 'Main', type: 'bank', balance: 500, currency: '¥' } },
                        transactions: [
                            { id: 'tx-part-1', type: 'expense', walletId: 'Main', amount: 100, date: '2026-09-01', note: 'Active' }
                        ],
                        history: [
                            {
                                monthKey: '2026-08',
                                transactions: [
                                    { id: 'tx-part-hist-1', type: 'expense', walletId: 'Main', amount: 200, date: '2026-08-15', note: 'Raw Leftover' }
                                ]
                            }
                        ]
                    };
                    const mD = storage.parseAndMergeData(edgeD);
                    results.tier4.partiallyMigratedUnrolled = {
                        success: true,
                        totalTx: mD.transactions.length, // Expected: 2 (both active and leftover unrolled)
                        rawTransactionsPurgedFromHistory: typeof Object.getOwnPropertyDescriptor(mD.history[0], 'transactions').get === 'function'
                    };
                } catch (e) {
                    results.tier4.partiallyMigratedUnrolled = { success: false, error: e.message };
                }

                return results;
            })()'''

            res = await send('Runtime.evaluate', {'expression': test_harness, 'returnByValue': True})
            val = res.get('result', {}).get('result', {}).get('value')
            print("\n=== FULL 4-TIER REGRESSION SUITE RESULTS ===")
            print(json.dumps(val, indent=2))
    finally:
        p.terminate()

asyncio.run(run_matrix())

