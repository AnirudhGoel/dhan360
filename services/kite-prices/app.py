"""Kite price-proxy — serves historical daily closes for the dhan360 client.

Kite's api_secret can't live in the browser and Kite's endpoints don't allow browser CORS, so
this small service (which YOU run and configure with your Kite creds) proxies historical-price
requests. It only touches market prices — your holdings never pass through it. The client sends
the symbols + date range it needs; this returns daily closes; the client fills its local cache
so direct-equity period XIRR / performance work.

Auth: Kite access tokens expire daily. Log in via GET /login once each morning (and after any
restart); the token is held in memory only. Nothing is persisted.

Env:
  KITE_API_KEY, KITE_API_SECRET   — your Kite Connect app credentials.
  KITE_PRICES_ORIGINS             — comma-separated allowed browser origins (your client app).
  KITE_ACCESS_TOKEN               — optional: set a token directly (skips the /login flow).
"""

from __future__ import annotations

import datetime as dt
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from kiteconnect import KiteConnect

API_KEY = os.getenv("KITE_API_KEY", "")
API_SECRET = os.getenv("KITE_API_SECRET", "")
ORIGINS = [o.strip() for o in os.getenv("KITE_PRICES_ORIGINS", "*").split(",")]

app = FastAPI(title="dhan360 kite-prices", version="1.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=ORIGINS, allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"],
)

kite = KiteConnect(api_key=API_KEY)

# In-memory session + instrument map (nothing persisted).
_state: dict = {"access_token": os.getenv("KITE_ACCESS_TOKEN") or None, "token_date": None}
_instruments: dict = {"date": None, "map": {}}  # exchange -> {tradingsymbol: instrument_token}

if _state["access_token"]:
    kite.set_access_token(_state["access_token"])


def _require_auth() -> None:
    if not _state["access_token"]:
        raise HTTPException(401, "Not connected to Kite. Log in at /login (once per day).")


def _instrument_map(exchange: str) -> dict:
    today = dt.date.today().isoformat()
    key = f"{exchange}:{today}"
    if _instruments["date"] == key:
        return _instruments["map"]
    rows = kite.instruments(exchange)
    m = {r["tradingsymbol"].upper(): r["instrument_token"] for r in rows}
    _instruments.update(date=key, map=m)
    return m


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/status")
def status() -> dict:
    return {"authenticated": bool(_state["access_token"]), "token_date": _state["token_date"]}


@app.get("/login")
def login() -> dict:
    return {"login_url": kite.login_url()}


@app.get("/callback", response_class=HTMLResponse)
def callback(request_token: str = "") -> str:
    if not request_token:
        return "<p>Login was cancelled or failed.</p>"
    try:
        session = kite.generate_session(request_token, api_secret=API_SECRET)
    except Exception as exc:  # noqa: BLE001
        return f"<p>Could not complete login: {exc}</p>"
    _state["access_token"] = session["access_token"]
    _state["token_date"] = dt.date.today().isoformat()
    kite.set_access_token(session["access_token"])
    return "<p>✅ Connected to Kite. You can close this tab and return to dhan360.</p>"


class PricesRequest(BaseModel):
    symbols: list[str]
    from_date: str  # YYYY-MM-DD
    to_date: str    # YYYY-MM-DD
    exchange: str = "NSE"


@app.post("/prices")
def prices(req: PricesRequest) -> dict:
    _require_auth()
    try:
        frm = dt.datetime.strptime(req.from_date, "%Y-%m-%d")
        to = dt.datetime.strptime(req.to_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "from_date/to_date must be YYYY-MM-DD.")

    imap = _instrument_map(req.exchange)
    out: dict[str, list] = {}
    missing: list[str] = []
    for sym in {s.strip().upper() for s in req.symbols if s.strip()}:
        token = imap.get(sym)
        if not token:
            missing.append(sym)
            continue
        try:
            candles = kite.historical_data(token, frm, to, interval="day")
        except Exception:  # noqa: BLE001 — skip a symbol that fails, don't fail the batch
            missing.append(sym)
            continue
        out[sym] = [[c["date"].date().isoformat() if hasattr(c["date"], "date") else str(c["date"])[:10],
                     round(float(c["close"]), 4)] for c in candles]
    return {"prices": out, "missing": missing}
