import urllib.request, json, ssl, urllib.error

ctx = ssl.create_default_context()

tests = [
    {
        'name': 'Prod with publishable key',
        'url': 'https://xrovzkibilgbpawnunle.supabase.co/rest/v1/app_state?select=*',
        'key': 'sb_publishable_YasI1XuZZBMPWAcvRhoBAQ_bah4wBVS'
    },
    {
        'name': 'Prod with anon JWT',
        'url': 'https://xrovzkibilgbpawnunle.supabase.co/rest/v1/app_state?select=*',
        'key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhyb3Z6a2liaWxnYnBhd251bmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MDc2ODksImV4cCI6MjEwMTA4MzY4OX0.GUYo0D0itCakd7KaEdElOfUlbYxT3IoHGmMvPqWDOnY'
    },
    {
        'name': 'Dev with publishable key',
        'url': 'https://nyetklojxqnawdtrrhma.supabase.co/rest/v1/app_state?select=*',
        'key': 'sb_publishable_GuWV7--O0vdxBvH0soQHUA_y3LYGOI1'
    }
]

for t in tests:
    print(f"\n--- Testing {t['name']} ---")
    req = urllib.request.Request(t['url'], headers={
        'apikey': t['key'],
        'Authorization': f"Bearer {t['key']}"
    })
    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
            print("Status:", r.status)
            print("Body:", r.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)
        print("Error Body:", e.read().decode())
    except Exception as e:
        print("General Exception:", e)

