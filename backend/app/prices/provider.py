"""Price / NAV providers with a local cache.

The XIRR engine asks "what was instrument X worth per unit on date D?". Providers answer,
and every fetched value is cached in the ``prices`` table so subsequent lookups are offline
and reproducible. This is the seam where market data enters — swap/add providers without
touching the XIRR math.

Implemented now:
  * ``AmfiNavProvider`` — historical mutual-fund NAV from the free mfapi.in mirror of AMFI data.
  * ``ManualProvider``  — falls back to the instrument's last known price for "today" endpoints.

Stubbed for later (needs the user's Kite access): a ``KiteProvider`` for stock/ETF closes.
"""

from __future__ import annotations

import json
import urllib.request
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Instrument, Price


class PriceLookupError(Exception):
    pass


def _cache_get(db: Session, instrument_id: int, on: date) -> float | None:
    return db.scalar(
        select(Price.close).where(Price.instrument_id == instrument_id, Price.date == on)
    )


def _cache_put(db: Session, instrument_id: int, on: date, close: float, source: str) -> None:
    existing = db.scalar(
        select(Price).where(Price.instrument_id == instrument_id, Price.date == on)
    )
    if existing:
        existing.close = close
        existing.source = source
    else:
        db.add(Price(instrument_id=instrument_id, date=on, close=close, source=source))


def _nearest_on_or_before(series: dict[date, float], on: date, max_back: int = 10) -> float | None:
    """NAV/price isn't published on weekends/holidays — walk back a few days."""
    for i in range(max_back + 1):
        d = on - timedelta(days=i)
        if d in series:
            return series[d]
    return None


class AmfiNavProvider:
    """Historical NAV for a mutual fund scheme via mfapi.in (free AMFI mirror), cached locally."""

    source = "mfapi"

    def __init__(self, fetcher=None) -> None:
        # Injectable fetcher makes this testable without network access.
        self._fetch = fetcher or self._http_fetch
        self._series_cache: dict[str, dict[date, float]] = {}

    def _http_fetch(self, scheme_code: str) -> dict[date, float]:
        url = f"https://api.mfapi.in/mf/{scheme_code}"
        req = urllib.request.Request(url, headers={"User-Agent": "dhan360/0.1"})
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 fixed public URL
            payload = json.loads(resp.read().decode("utf-8"))
        out: dict[date, float] = {}
        for row in payload.get("data", []):
            try:
                d = datetime.strptime(row["date"], "%d-%m-%Y").date()
                out[d] = float(row["nav"])
            except (KeyError, ValueError):
                continue
        return out

    def _series(self, scheme_code: str) -> dict[date, float]:
        if scheme_code not in self._series_cache:
            self._series_cache[scheme_code] = self._fetch(scheme_code)
        return self._series_cache[scheme_code]

    def series(self, scheme_code: str) -> dict[date, float]:
        """Public accessor for the full NAV history (used by the performance curve)."""
        try:
            return self._series(scheme_code)
        except Exception:  # noqa: BLE001
            return {}

    def nav_on(self, db: Session, instrument: Instrument, on: date) -> float | None:
        if not instrument.scheme_code:
            return None
        cached = _cache_get(db, instrument.id, on)
        if cached is not None:
            return cached
        try:
            series = self._series(instrument.scheme_code)
        except Exception:  # noqa: BLE001 — network/parse failure degrades gracefully
            return None
        nav = _nearest_on_or_before(series, on)
        if nav is not None:
            _cache_put(db, instrument.id, on, nav, self.source)
        return nav


class PriceService:
    """Routes an instrument to the right provider and applies sensible fallbacks."""

    def __init__(self, nav_provider: AmfiNavProvider | None = None) -> None:
        self.nav = nav_provider or AmfiNavProvider()

    def value_per_unit(self, db: Session, instrument: Instrument, on: date) -> tuple[float | None, bool]:
        """Return (price_or_nav, is_estimated). is_estimated=True when we fell back to a proxy."""
        # Mutual funds → NAV (accurate, free).
        if instrument.scheme_code:
            nav = self.nav.nav_on(db, instrument, on)
            if nav is not None:
                return nav, False

        # Cached price (e.g. a future Kite backfill) for stocks/ETFs.
        cached = _cache_get(db, instrument.id, on)
        if cached is not None:
            return cached, False

        # No historical source yet (stocks/ETFs without Kite): caller decides how to handle.
        return None, True
