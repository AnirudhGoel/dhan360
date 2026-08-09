"""NSE equity price service for dhan360.

Serves historical daily closes sourced from NSE's public bhav-copy archives.
No credentials required — the data is publicly available with no login.

How it works:
  - NSE publishes an end-of-day price file ("bhav copy") for every trading day
    at archives.nseindia.com. We download these, extract EQ-series closes, and
    store them in a local SQLite cache.
  - A cron job runs at 02:00 UTC (07:30 IST) each morning to fetch the previous
    trading day's file.
  - On startup the service catches up any gap between the last cached date and
    yesterday.
  - POST /seed triggers a background download of several years of history.
  - POST /prices queries the cache; symbols with no data are returned as missing.

Env:
  EQUITY_PRICES_ORIGINS   comma-separated allowed browser origins (default: *)
  EQUITY_CACHE_DB         path to SQLite cache file (default: prices.db)
"""

from __future__ import annotations

import asyncio
import csv
import io
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Config ────────────────────────────────────────────────────────────────────

ORIGINS  = [o.strip() for o in os.getenv("EQUITY_PRICES_ORIGINS", "*").split(",")]
DB_PATH  = os.getenv("EQUITY_CACHE_DB", "prices.db")
EXCHANGE = "NSE"

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept":     "text/csv,application/csv,*/*",
    "Referer":    "https://www.nseindia.com/",
}

# ─── Service state ─────────────────────────────────────────────────────────────

_state: dict = {
    "last_fetch_date":  None,   # ISO date of last successfully fetched bhav copy
    "last_fetch_error": None,   # error message from last fetch attempt
    "seed_running":     False,
    "seed_progress":    None,   # e.g. "2021-01-04/2025-01-01 (312/1250)"
}
_write_lock = threading.Lock()
_seed_thread: threading.Thread | None = None

# ─── SQLite cache ──────────────────────────────────────────────────────────────

def _init_db() -> None:
    with sqlite3.connect(DB_PATH) as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("""
            CREATE TABLE IF NOT EXISTS price_cache (
                symbol     TEXT NOT NULL,
                exchange   TEXT NOT NULL,
                date       TEXT NOT NULL,
                close      REAL NOT NULL,
                fetched_at TEXT NOT NULL,
                PRIMARY KEY (symbol, exchange, date)
            )
        """)
        con.commit()


def _max_cached_date() -> str | None:
    with sqlite3.connect(DB_PATH) as con:
        row = con.execute(
            "SELECT MAX(date) FROM price_cache WHERE exchange=?", (EXCHANGE,)
        ).fetchone()
    return row[0] if row else None


def _min_cached_date() -> str | None:
    with sqlite3.connect(DB_PATH) as con:
        row = con.execute(
            "SELECT MIN(date) FROM price_cache WHERE exchange=?", (EXCHANGE,)
        ).fetchone()
    return row[0] if row else None


def _read_cache(symbol: str, from_date: str, to_date: str) -> list[list]:
    with sqlite3.connect(DB_PATH) as con:
        rows = con.execute(
            "SELECT date, close FROM price_cache "
            "WHERE symbol=? AND exchange=? AND date>=? AND date<=? ORDER BY date",
            (symbol, EXCHANGE, from_date, to_date),
        ).fetchall()
    return [[r[0], r[1]] for r in rows]


def _write_rows(rows: list[tuple[str, str, float]]) -> int:
    """Upsert (symbol, date, close) triples. Returns number of rows written."""
    if not rows:
        return 0
    now = datetime.now().isoformat()
    with _write_lock, sqlite3.connect(DB_PATH) as con:
        con.executemany(
            "INSERT OR REPLACE INTO price_cache (symbol, exchange, date, close, fetched_at) "
            "VALUES (?,?,?,?,?)",
            [(sym, EXCHANGE, dt, close, now) for sym, dt, close in rows],
        )
        con.commit()
    return len(rows)


def _cache_stats() -> dict:
    with sqlite3.connect(DB_PATH) as con:
        row = con.execute(
            "SELECT COUNT(*), COUNT(DISTINCT symbol), MIN(date), MAX(date) "
            "FROM price_cache WHERE exchange=?",
            (EXCHANGE,),
        ).fetchone()
    return {
        "rows":     row[0] or 0,
        "symbols":  row[1] or 0,
        "min_date": row[2],
        "max_date": row[3],
    }

# ─── NSE bhav copy fetcher ─────────────────────────────────────────────────────

def _bhav_url(d: date) -> str:
    return (
        "https://archives.nseindia.com/products/content/"
        f"sec_bhavdata_full_{d.strftime('%d%m%Y')}.csv"
    )


def _fetch_bhav(d: date) -> list[tuple[str, str, float]] | None:
    """
    Download one day's bhav copy. Returns [(symbol, iso_date, close), ...] for
    EQ-series stocks, or None if the day is a holiday/weekend (404).
    """
    url = _bhav_url(d)
    req = urllib.request.Request(url, headers=FETCH_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8-sig")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None          # holiday or weekend — not an error
        raise
    except Exception:
        raise

    # Columns have leading spaces; strip everything.
    reader = csv.DictReader(io.StringIO(content))
    rows: list[tuple[str, str, float]] = []
    iso_date = d.isoformat()
    for row in reader:
        clean = {k.strip(): (v or "").strip() for k, v in row.items() if k}
        if clean.get("SERIES") != "EQ":
            continue
        symbol = clean.get("SYMBOL", "")
        try:
            close = float(clean.get("CLOSE_PRICE", "0") or "0")
        except ValueError:
            continue
        if symbol and close > 0:
            rows.append((symbol, iso_date, close))
    return rows


def _fetch_range(start: date, end: date, delay: float = 0.3) -> tuple[int, int]:
    """
    Fetch bhav copies from start to end (inclusive). Returns (days_fetched, rows_written).
    Skips holidays/weekends silently. Throttles to avoid hammering NSE.
    """
    days_fetched = rows_written = 0
    d = start
    while d <= end:
        try:
            rows = _fetch_bhav(d)
            if rows:
                rows_written += _write_rows(rows)
                days_fetched += 1
                _state["last_fetch_date"] = d.isoformat()
                _state["last_fetch_error"] = None
        except Exception as exc:
            _state["last_fetch_error"] = f"{d}: {exc}"
        d += timedelta(days=1)
        if d <= end:
            time.sleep(delay)
    return days_fetched, rows_written


# ─── Daily update + seed ───────────────────────────────────────────────────────

def _daily_update_sync() -> None:
    yesterday = date.today() - timedelta(days=1)
    max_str = _max_cached_date()
    if max_str:
        start = date.fromisoformat(max_str) + timedelta(days=1)
    else:
        # No data at all — fetch the last 7 days as a minimal warm-up.
        start = yesterday - timedelta(days=7)
    if start > yesterday:
        return
    _fetch_range(start, yesterday)


async def _daily_update() -> None:
    await asyncio.to_thread(_daily_update_sync)


def _seed_sync(years: int) -> None:
    _state["seed_running"] = True
    try:
        end   = date.today() - timedelta(days=1)
        start = date(end.year - years, end.month, end.day)

        max_str = _max_cached_date()
        min_str = _min_cached_date()
        end_to_fetch = end
        if max_str and min_str:
            cached_end   = date.fromisoformat(max_str)
            cached_start = date.fromisoformat(min_str)
            # Full coverage: tail is current AND history goes back far enough (allow 10 days buffer
            # for weekends/holidays at the start boundary).
            if cached_end >= end and cached_start <= start + timedelta(days=10):
                _state["seed_progress"] = f"already up to date ({min_str} → {max_str})"
                return
            # Historical data is present; only the tail is missing — skip forward.
            if cached_start <= start + timedelta(days=10) and cached_end < end:
                start = cached_end + timedelta(days=1)
            # Otherwise (e.g. only recent data from startup, no history): fetch full range.

        total_calendar = (end_to_fetch - start).days + 1
        done = 0
        d = start
        while d <= end_to_fetch:
            _state["seed_progress"] = f"{d.isoformat()} → {end_to_fetch.isoformat()} ({done}/{total_calendar} days)"
            try:
                rows = _fetch_bhav(d)
                if rows:
                    _write_rows(rows)
                    _state["last_fetch_date"] = d.isoformat()
            except Exception as exc:
                _state["last_fetch_error"] = f"{d}: {exc}"
            d += timedelta(days=1)
            done += 1
            time.sleep(0.25)

        _state["seed_progress"] = f"done — seeded {years}yr to {end_to_fetch.isoformat()}"
    finally:
        _state["seed_running"] = False


# ─── App lifecycle ─────────────────────────────────────────────────────────────

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(_: FastAPI):
    _init_db()
    # Catch up from last cached date to yesterday every morning at 07:30 IST (02:00 UTC).
    scheduler.add_job(
        _daily_update,
        CronTrigger(hour=2, minute=0),
        id="daily_bhav",
        replace_existing=True,
    )
    scheduler.start()
    # On startup: fill any gap since the last cached date (handles restarts/downtime).
    asyncio.create_task(_daily_update())
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="dhan360 equity-prices", version="3.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/status")
def status() -> dict:
    return {
        "cache":              _cache_stats(),
        "last_fetch_date":    _state["last_fetch_date"],
        "last_fetch_error":   _state["last_fetch_error"],
        "seed_running":       _state["seed_running"],
        "seed_progress":      _state["seed_progress"],
    }


@app.post("/seed")
def seed(years: int = 5) -> dict:
    """Trigger a background download of `years` years of historical bhav copies."""
    global _seed_thread
    if _state["seed_running"]:
        return {"status": "already_running", "progress": _state["seed_progress"]}
    _seed_thread = threading.Thread(target=_seed_sync, args=(years,), daemon=True)
    _seed_thread.start()
    return {"status": "started", "years": years}


class PricesRequest(BaseModel):
    symbols:   list[str]
    from_date: str          # YYYY-MM-DD
    to_date:   str          # YYYY-MM-DD
    exchange:  str = "NSE"  # kept for API compatibility; always NSE


FRESHNESS_DAYS = 7   # max gap at tail before we consider a symbol's cache stale


@app.post("/prices")
def prices(req: PricesRequest) -> dict:
    try:
        date.fromisoformat(req.from_date)   # validate format
        to_d = date.fromisoformat(req.to_date)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(400, "from_date/to_date must be YYYY-MM-DD.")

    out:     dict[str, list] = {}
    missing: list[str] = []

    for sym in {s.strip().upper() for s in req.symbols if s.strip()}:
        rows = _read_cache(sym, req.from_date, req.to_date)
        if rows:
            # Check freshness: is the tail covered within FRESHNESS_DAYS of to_date?
            max_row_date = date.fromisoformat(rows[-1][0])
            if (to_d - max_row_date).days <= FRESHNESS_DAYS:
                out[sym] = rows
                continue
        # No data or stale tail — mark as missing; don't block the response on a live fetch.
        if rows:
            out[sym] = rows   # return what we have even if slightly stale
        else:
            missing.append(sym)

    return {"prices": out, "missing": missing}
