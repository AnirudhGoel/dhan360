"""Offline smoke test — verifies wiring without hitting Kite (no creds needed)."""
import os
os.environ.setdefault("KITE_API_KEY", "test")
os.environ.setdefault("KITE_API_SECRET", "test")

from fastapi.testclient import TestClient
import app as svc

client = TestClient(svc.app)

r = client.get("/health")
assert r.status_code == 200 and r.json() == {"status": "ok"}, r.text

r = client.get("/status")
assert r.status_code == 200 and r.json()["authenticated"] is False, r.text

r = client.get("/login")
assert r.status_code == 200 and "login_url" in r.json(), r.text
assert "api_key=test" in r.json()["login_url"], r.json()

# Unauthenticated /prices must be rejected (not silently empty).
r = client.post("/prices", json={"symbols": ["RELIANCE"], "from_date": "2025-01-01", "to_date": "2025-02-01"})
assert r.status_code == 401, r.text

# Bad dates while unauthenticated still 401 (auth checked first).
r = client.post("/prices", json={"symbols": ["X"], "from_date": "nope", "to_date": "2025-01-01"})
assert r.status_code == 401, r.text

# With a faked token, bad dates should now surface as 400.
svc._state["access_token"] = "faketoken"
r = client.post("/prices", json={"symbols": ["X"], "from_date": "nope", "to_date": "2025-01-01"})
assert r.status_code == 400, r.text
svc._state["access_token"] = None

print("OK — all smoke assertions passed")
