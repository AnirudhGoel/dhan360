"""Override index — resolves the remembered user classification rule for an instrument.

Match priority mirrors instrument identity strength: ISIN > symbol > scheme_code > name.
"""

from __future__ import annotations

from collections.abc import Iterable


class OverrideIndex:
    def __init__(self) -> None:
        self._by: dict[str, dict[str, dict]] = {
            "isin": {}, "symbol": {}, "scheme_code": {}, "name": {}
        }

    @classmethod
    def from_rows(cls, rows: Iterable) -> "OverrideIndex":
        idx = cls()
        for row in rows:
            payload = {
                "asset_class": row.asset_class,
                "sub_class": row.sub_class,
                "sector": row.sector,
                "market_cap": row.market_cap,
            }
            payload = {k: v for k, v in payload.items() if v is not None}
            bucket = idx._by.get(row.key_type)
            if bucket is not None:
                bucket[row.key_value.strip().upper()] = payload
        return idx

    def match(
        self,
        isin: str | None = None,
        symbol: str | None = None,
        scheme_code: str | None = None,
        name: str | None = None,
    ) -> dict | None:
        for key_type, value in (
            ("isin", isin), ("symbol", symbol), ("scheme_code", scheme_code), ("name", name)
        ):
            if value:
                hit = self._by[key_type].get(value.strip().upper())
                if hit:
                    return hit
        return None
