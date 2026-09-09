import httpx

try:
    r = httpx.post(
        "http://127.0.0.1:8000/api/auth/google",
        json={"credential": "bad_token"},
        timeout=10,
    )
    print(f"Status: {r.status_code}")
    print(f"Body: {r.text[:300]}")
except Exception as e:
    print(f"Error: {e}")
