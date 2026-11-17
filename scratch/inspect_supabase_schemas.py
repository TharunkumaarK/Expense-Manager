import urllib.request, json, ssl

ctx = ssl.create_default_context()

environments = {
    'production': {
        'ref': 'xrovzkibilgbpawnunle',
        'url': 'https://xrovzkibilgbpawnunle.supabase.co',
        'key': 'sb_publishable_YasI1XuZZBMPWAcvRhoBAQ_bah4wBVS',
        'anon_jwt': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhyb3Z6a2liaWxnYnBhd251bmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MDc2ODksImV4cCI6MjEwMTA4MzY4OX0.GUYo0D0itCakd7KaEdElOfUlbYxT3IoHGmMvPqWDOnY'
    },
    'development': {
        'ref': 'nyetklojxqnawdtrrhma',
        'url': 'https://nyetklojxqnawdtrrhma.supabase.co',
        'key': 'sb_publishable_GuWV7--O0vdxBvH0soQHUA_y3LYGOI1',
        'anon_jwt': None
    }
}

results = {}

for env_name, config in environments.items():
    env_res = {
        'openapi': None,
        'tables': {},
        'definitions': {},
        'paths': [],
        'auth_settings': None,
        'storage_buckets': None,
        'app_state_probe': None
    }
    key = config['key']
    url = config['url']

    # 1. Fetch OpenAPI spec
    try:
        req = urllib.request.Request(f"{url}/rest/v1/", headers={
            'apikey': key,
            'Authorization': f"Bearer {key}"
        })
        with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
            spec = json.loads(r.read().decode())
            env_res['openapi'] = {
                'title': spec.get('info', {}).get('title'),
                'description': spec.get('info', {}).get('description'),
                'version': spec.get('info', {}).get('version')
            }
            env_res['definitions'] = spec.get('definitions', {})
            env_res['paths'] = list(spec.get('paths', {}).keys())
    except Exception as e:
        env_res['openapi_error'] = str(e)
        # Try with anon_jwt if available
        if config.get('anon_jwt'):
            try:
                jwt_key = config['anon_jwt']
                req = urllib.request.Request(f"{url}/rest/v1/", headers={
                    'apikey': jwt_key,
                    'Authorization': f"Bearer {jwt_key}"
                })
                with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
                    spec = json.loads(r.read().decode())
                    env_res['openapi'] = {
                        'title': spec.get('info', {}).get('title'),
                        'description': spec.get('info', {}).get('description'),
                        'version': spec.get('info', {}).get('version')
                    }
                    env_res['definitions'] = spec.get('definitions', {})
                    env_res['paths'] = list(spec.get('paths', {}).keys())
                    env_res['openapi_error'] = None
            except Exception as e2:
                env_res['openapi_jwt_error'] = str(e2)

    # 2. Probe Auth Settings
    try:
        req = urllib.request.Request(f"{url}/auth/v1/settings", headers={
            'apikey': key,
            'Authorization': f"Bearer {key}"
        })
        with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
            env_res['auth_settings'] = json.loads(r.read().decode())
    except Exception as e:
        env_res['auth_settings_error'] = str(e)

    # 3. Probe Storage Buckets
    try:
        req = urllib.request.Request(f"{url}/storage/v1/bucket", headers={
            'apikey': key,
            'Authorization': f"Bearer {key}"
        })
        with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
            env_res['storage_buckets'] = json.loads(r.read().decode())
    except Exception as e:
        env_res['storage_buckets_error'] = str(e)

    # 4. Probe app_state table columns & options
    try:
        req = urllib.request.Request(f"{url}/rest/v1/app_state?select=*&limit=0", headers={
            'apikey': key,
            'Authorization': f"Bearer {key}",
            'Prefer': 'count=exact'
        })
        with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
            headers_dict = dict(r.info())
            env_res['app_state_probe'] = {
                'status': r.status,
                'content_range': headers_dict.get('content-range'),
                'content_type': headers_dict.get('content-type')
            }
    except Exception as e:
        env_res['app_state_probe_error'] = str(e)

    results[env_name] = env_res

with open('/mnt/01DB426183A10370/E_Software/Docs/Antigravity Expense Manager/Expense-Manager/scratch/schema_inspection_results.json', 'w') as f:
    json.dump(results, f, indent=2)

print("Inspection completed.")
for env, r in results.items():
    print(f"\n--- {env.upper()} ({environments[env]['ref']}) ---")
    print("OpenAPI Paths:", r.get('paths'))
    print("Definitions:", list(r.get('definitions', {}).keys()))
    for d_name, d_val in r.get('definitions', {}).items():
        print(f"  Table: {d_name}")
        props = d_val.get('properties', {})
        for p_name, p_info in props.items():
            print(f"    - {p_name}: type={p_info.get('type')}, format={p_info.get('format')}, description={p_info.get('description')}")
        print(f"    Required: {d_val.get('required')}")
    print("Auth settings:", "OK" if r.get('auth_settings') else r.get('auth_settings_error'))
    print("Storage buckets:", r.get('storage_buckets') if r.get('storage_buckets') is not None else r.get('storage_buckets_error'))
    print("app_state probe:", r.get('app_state_probe') or r.get('app_state_probe_error'))

