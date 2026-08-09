"""Offline smoke test — verifies wiring without hitting NSE or writing real files.

Run from inside the service directory with the venv active:
  python smoke_test.py
"""
import os
import tempfile

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["EQUITY_CACHE_DB"] = _tmp.name
_tmp.close()

from fastapi.testclient import TestClient
import app as svc

with TestClient(svc.app) as client:
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}, r.text

    r = client.get("/status")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "cache" in body, body
    assert body["cache"]["rows"] == 0, body
    # No auth fields — credentials are gone.
    assert "authenticated" not in body, body

    # /prices with empty cache → 200 (no 401), symbol in missing
    r = client.post("/prices", json={"symbols": ["RELIANCE"], "from_date": "2025-01-01", "to_date": "2025-02-01"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["prices"] == {}, body
    assert "RELIANCE" in body["missing"], body

    # Bad date format → 400
    r = client.post("/prices", json={"symbols": ["X"], "from_date": "nope", "to_date": "2025-01-01"})
    assert r.status_code == 400, r.text

    # /seed returns immediately
    r = client.post("/seed", params={"years": 1})
    assert r.status_code == 200, r.text
    assert r.json()["status"] in ("started", "already_running"), r.json()

import os as _os
for suffix in ("", "-wal", "-shm"):
    try:
        _os.unlink(_tmp.name + suffix)
    except FileNotFoundError:
        pass

print("OK — all smoke assertions passed")
