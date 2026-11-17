import urllib.request, json, ssl, urllib.error

ctx = ssl.create_default_context()

candidate_tables = [
    'app_state', 'transactions', 'wallets', 'categories', 'budgets',
    'history', 'monthly_closings', 'monthly_closing', 'profiles', 'users',
    'settings', 'reports', 'user_settings', 'accounts', 'ledger'
]

envs = {
    'production': {
        'url': 'https://xrovzkibilgbpawnunle.supabase.co/rest/v1/',
        'key': 'sb_publishable_YasI1XuZZBMPWAcvRhoBAQ_bah4wBVS'
    },
    'development': {
        'url': 'https://nyetklojxqnawdtrrhma.supabase.co/rest/v1/',
        'key': 'sb_publishable_GuWV7--O0vdxBvH0soQHUA_y3LYGOI1'
    }
}

for env_name, cfg in envs.items():
    print(f"\n================ {env_name.upper()} ================")
    for tbl in candidate_tables:
        url = f"{cfg['url']}{tbl}?select=*&limit=0"
        req = urllib.request.Request(url, headers={
            'apikey': cfg['key'],
            'Authorization': f"Bearer {cfg['key']}"
        })
        try:
            with urllib.request.urlopen(req, timeout=5, context=ctx) as r:
                print(f"  {tbl}: EXISTS (HTTP {r.status})")
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            try:
                err_json = json.loads(body)
                code = err_json.get('code')
                msg = err_json.get('message', '')
                hint = err_json.get('hint', '')
                if code == '42501': # Permission denied -> TABLE DEFINITELY EXISTS
                    print(f"  {tbl}: EXISTS (Code 42501 - Permission Denied to anon, RLS/Grant active)")
                elif 'PGRST205' in code or 'not found' in msg.lower() or 'schema cache' in msg.lower() or code == '42P01':
                    print(f"  {tbl}: DOES NOT EXIST ({code}: {msg})")
                else:
                    print(f"  {tbl}: UNKNOWN ({code}: {msg})")
            except:
                print(f"  {tbl}: HTTP {e.code} - {body[:100]}")
        except Exception as e:
            print(f"  {tbl}: General error - {e}")

