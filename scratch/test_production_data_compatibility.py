import subprocess, json, time, urllib.request, asyncio, websockets

CHROME_BIN = '/home/tharunkumaark/.config/Code/User/globalStorage/saoudrizwan.claude-dev/puppeteer/.chromium-browser-snapshots/chromium/linux-1578628/chrome-linux/chrome'

async def test_compat():
    p = subprocess.Popen([
        CHROME_BIN,
        '--headless=new',
        '--remote-debugging-port=9470',
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=/tmp/test_chrome_profile_compat',
        'about:blank'
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    try:
        with urllib.request.urlopen('http://127.0.0.1:9470/json') as r:
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

            # Synthetic production state reflecting origin/main structure:
            # - No schemaVersion
            # - No closedMonths
            # - No reportSnapshots
            # - No userProfile
            # - Historical transactions stored nested inside history array
            # - Current month transactions in transactions array
            # - Legacy category representations (e.g. jp-rent in JP, legacy colors)
            sim_code = '''(() => {
                const prodLegacyState = {
                    currentMonthKey: "2026-10",
                    jpTotalBudget: 150000,
                    wallets: {
                        'Salary Account': { id: 'Salary Account', type: 'bank', region: 'JP', balance: 284500, currency: '¥' },
                        'Cash': { id: 'Cash', type: 'cash', region: 'JP', balance: 14200, currency: '¥' },
                        'PayPay': { id: 'PayPay', type: 'digital', region: 'JP', balance: 8300, currency: '¥' },
                        'Bank Account': { id: 'Bank Account', type: 'bank', region: 'IN', balance: 75000, currency: '₹' }
                    },
                    categories: {
                        JP: [
                            { id: 'jp-food', name: 'Food & Groceries', icon: 'shopping-basket', budget: 40000 },
                            { id: 'jp-dining', name: 'Dining Out', icon: 'utensils', budget: 20000 },
                            { id: 'jp-transport', name: 'Transport', icon: 'train-front', budget: 15000 },
                            { id: 'jp-rent', name: 'Rent', icon: 'home', budget: 65000 },
                            { id: 'jp-utilities', name: 'Utilities', icon: 'zap', budget: 10000 }
                        ],
                        IN: [
                            { id: 'in-petrol', name: 'Petrol', icon: 'fuel' },
                            { id: 'in-home', name: 'Home Needs', icon: 'home' }
                        ]
                    },
                    transactions: [
                        { id: 'tx-oct-1', type: 'expense', walletId: 'Salary Account', amount: 3500, categoryId: 'jp-food', date: '2026-10-02', note: 'Supermarket' },
                        { id: 'tx-oct-2', type: 'income', walletId: 'Salary Account', amount: 320000, categoryId: 'jp-salary', date: '2026-10-01', note: 'Monthly Salary' },
                        { id: 'tx-oct-3', type: 'expense', walletId: 'Cash', amount: 1200, categoryId: 'jp-dining', date: '2026-10-05', note: 'Lunch' }
                    ],
                    history: [
                        {
                            monthKey: '2026-09',
                            closedAt: '2026-09-30T23:59:59.000Z',
                            transactions: [
                                { id: 'tx-sep-1', type: 'expense', walletId: 'Salary Account', amount: 65000, categoryId: 'jp-rent', date: '2026-09-01', note: 'Sept Rent' },
                                { id: 'tx-sep-2', type: 'expense', walletId: 'Salary Account', amount: 4800, categoryId: 'jp-utilities', date: '2026-09-15', note: 'Electricity - TEPCO' },
                                { id: 'tx-sep-3', type: 'income', walletId: 'Salary Account', amount: 320000, categoryId: 'jp-salary', date: '2026-09-01', note: 'Salary' }
                            ]
                        },
                        {
                            monthKey: '2026-08',
                            closedAt: '2026-08-31T23:59:59.000Z',
                            transactions: [
                                { id: 'tx-aug-1', type: 'expense', walletId: 'PayPay', amount: 2200, categoryId: 'jp-food', date: '2026-08-10', note: 'Conbini' }
                            ]
                        }
                    ]
                };

                // Run test branch's parseAndMergeData
                const migrated = storage.parseAndMergeData(prodLegacyState);

                // Collect audit results
                return {
                    schemaVersion: migrated.schemaVersion,
                    totalTransactionsCount: migrated.transactions ? migrated.transactions.length : 0,
                    historyLength: migrated.history ? migrated.history.length : 0,
                    closedMonthsKeys: migrated.closedMonths ? Object.keys(migrated.closedMonths) : [],
                    hasInTotalBudget: 'inTotalBudget' in migrated,
                    hasRegionalPreferences: 'regionalPreferences' in migrated,
                    hasPrivacyPreferences: 'privacyPreferences' in migrated,
                    walletsPreserved: {
                        salaryBalance: migrated.wallets['Salary Account']?.balance,
                        salaryColor: migrated.wallets['Salary Account']?.color,
                        cashBalance: migrated.wallets['Cash']?.balance,
                        bankAccountBalance: migrated.wallets['Bank Account']?.balance
                    },
                    rentCategoryMigratedToIN: migrated.categories.IN.some(c => c.id === 'in-rent'),
                    rentCategoryRemovedFromJP: !migrated.categories.JP.some(c => c.id === 'jp-rent'),
                    utilityTransactionSplit: migrated.transactions.find(t => t.id === 'tx-sep-2')?.categoryId,
                    historyGetterWorks: migrated.history[0]?.transactions?.length,
                    validationForCloudPush: Boolean(migrated && migrated.wallets && Array.isArray(migrated.transactions))
                };
            })()'''

            res = await send('Runtime.evaluate', {'expression': sim_code, 'returnByValue': True})
            val = res.get('result', {}).get('result', {}).get('value')
            print("\n=== PRODUCTION DATA COMPATIBILITY SIMULATION RESULTS ===")
            print(json.dumps(val, indent=2))
    finally:
        p.terminate()

asyncio.run(test_compat())

