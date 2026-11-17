import urllib.request, json, ssl, urllib.error

ctx = ssl.create_default_context()

candidate_columns = [
    'user_id', 'state', 'updated_at', 'created_at', 'id',
    'data', 'payload', 'version', 'schema_version', 'email'
]

envs = {
    'production': {
        'url': 'https://xrovzkibilgbpawnunle.supabase.co/rest/v1/app_state',
        'key': 'sb_publishable_YasI1XuZZBMPWAcvRhoBAQ_bah4wBVS'
    },
    'development': {
        'url': 'https://nyetklojxqnawdtrrhma.supabase.co/rest/v1/app_state',
        'key': 'sb_publishable_GuWV7--O0vdxBvH0soQHUA_y3LYGOI1'
    }
}

for env_name, cfg in envs.items():
    print(f"\n================ {env_name.upper()} COLUMNS ================")
    for col in candidate_columns:
        url = f"{cfg['url']}?select={col}&limit=0"
        req = urllib.request.Request(url, headers={
            'apikey': cfg['key'],
            'Authorization': f"Bearer {cfg['key']}"
        })
        try:
            with urllib.request.urlopen(req, timeout=5, context=ctx) as r:
                print(f"  {col}: EXISTS (HTTP {r.status})")
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            try:
                err_json = json.loads(body)
                code = err_json.get('code')
                msg = err_json.get('message', '')
                if code == '42501': # Permission denied -> Passed column resolution! Column EXISTS!
                    print(f"  {col}: EXISTS (Passed schema cache, blocked by permission 42501)")
                elif 'PGRST100' in code or 'not found' in msg.lower() or code == '42703':
                    print(f"  {col}: DOES NOT EXIST ({code}: {msg})")
                else:
                    print(f"  {col}: UNKNOWN ({code}: {msg})")
            except:
                print(f"  {col}: HTTP {e.code} - {body[:100]}")

