"""Loads bundled reference data and exposes simple lookup helpers.

All data is local JSON shipped with the app (``app/refdata/data``). The lookups are kept
deliberately tiny and pure so the classification engine stays easy to test.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent / "data"


def _load(name: str) -> dict[str, Any]:
    with open(DATA_DIR / name, encoding="utf-8") as f:
        data = json.load(f)
    # Strip documentation keys.
    return {k: v for k, v in data.items() if not k.startswith("_")}


@lru_cache(maxsize=1)
def etf_map() -> dict[str, dict]:
    return {k.upper(): v for k, v in _load("etf_map.json").items()}


@lru_cache(maxsize=1)
def stocks() -> dict[str, dict]:
    return {k.upper(): v for k, v in _load("stocks.json").items()}


@lru_cache(maxsize=1)
def stocks_by_isin() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for symbol, info in stocks().items():
        isin = info.get("isin")
        if isin:
            out[isin.upper()] = {**info, "symbol": symbol}
    return out


@lru_cache(maxsize=1)
def mf_categories() -> dict[str, dict]:
    return _load("mf_categories.json").get("categories", {})


@lru_cache(maxsize=1)
def amfi_schemes() -> dict[str, dict]:
    return _load("amfi_schemes.json")


def lookup_etf(symbol: str | None) -> dict | None:
    if not symbol:
        return None
    return etf_map().get(symbol.upper())


def lookup_stock(symbol: str | None = None, isin: str | None = None) -> dict | None:
    if symbol:
        hit = stocks().get(symbol.upper())
        if hit:
            return {**hit, "symbol": symbol.upper()}
    if isin:
        hit = stocks_by_isin().get(isin.upper())
        if hit:
            return hit
    return None


def lookup_scheme(scheme_code: str | None) -> dict | None:
    if not scheme_code:
        return None
    return amfi_schemes().get(str(scheme_code).strip())


_norm_re = re.compile(r"[^a-z0-9 ]+")


def _norm(text: str) -> str:
    return _norm_re.sub(" ", text.lower()).strip()


def match_mf_category(category: str | None, scheme_name: str | None) -> tuple[str, dict] | None:
    """Find the best matching MF category record.

    First tries the explicit category string, then falls back to substring matching the
    category name inside the scheme name (e.g. 'Small Cap' appearing in the scheme name).
    Returns ``(category_name, record)`` or ``None``.
    """
    cats = mf_categories()
    if category:
        # Exact (case-insensitive) match first.
        for name, rec in cats.items():
            if name.lower() == category.lower():
                return name, rec
        ncat = _norm(category)
        for name, rec in cats.items():
            if _norm(name) in ncat or ncat in _norm(name):
                return name, rec
    if scheme_name:
        nname = _norm(scheme_name)
        # Prefer longer category names (more specific) when several match.
        best: tuple[str, dict] | None = None
        for name, rec in cats.items():
            if _norm(name) in nname:
                if best is None or len(name) > len(best[0]):
                    best = (name, rec)
        if best:
            return best
    return None
