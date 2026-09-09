import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

data = json.dumps({"username": "test", "password": "test123"}).encode()
req = urllib.request.Request(
    "https://api.tickerscope.xyz/api/auth/login",
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    resp = urllib.request.urlopen(req, context=ctx, timeout=10)
    print(f"Status: {resp.status}")
    print(resp.read().decode())
except urllib.error.HTTPError as e:
    print(f"Status: {e.code}")
    print(e.read().decode())
except Exception as e:
    print(f"Error: {e}")
