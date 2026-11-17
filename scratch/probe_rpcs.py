import urllib.request, json, ssl, urllib.error

ctx = ssl.create_default_context()

candidate_rpcs = [
    'handle_new_user', 'reset_password', 'sync_state',
    'get_user_state', 'save_user_state', 'get_schema_version',
    'close_month', 'rollover', 'get_profile'
]

envs = {
    'production': {
        'url': 'https://xrovzkibilgbpawnunle.supabase.co/rest/v1/rpc/',
        'key': 'sb_publishable_YasI1XuZZBMPWAcvRhoBAQ_bah4wBVS'
    },
    'development': {
        'url': 'https://nyetklojxqnawdtrrhma.supabase.co/rest/v1/rpc/',
        'key': 'sb_publishable_GuWV7--O0vdxBvH0soQHUA_y3LYGOI1'
    }
}

for env_name, cfg in envs.items():
    print(f"\n================ {env_name.upper()} RPCs ================")
    for rpc in candidate_rpcs:
        url = f"{cfg['url']}{rpc}"
        req = urllib.request.Request(url, data=b"{}", headers={
            'apikey': cfg['key'],
            'Authorization': f"Bearer {cfg['key']}",
            'Content-Type': 'application/json'
        })
        try:
            with urllib.request.urlopen(req, timeout=5, context=ctx) as r:
                print(f"  {rpc}: EXISTS (HTTP {r.status})")
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            try:
                err_json = json.loads(body)
                code = err_json.get('code')
                msg = err_json.get('message', '')
                if 'PGRST202' in code or 'not find the function' in msg.lower():
                    print(f"  {rpc}: DOES NOT EXIST (PGRST202)")
                elif code == '42501':
                    print(f"  {rpc}: EXISTS (Code 42501 - Permission Denied)")
                else:
                    print(f"  {rpc}: EXISTS or SPECIAL ({code}: {msg})")
            except:
                print(f"  {rpc}: HTTP {e.code} - {body[:100]}")

