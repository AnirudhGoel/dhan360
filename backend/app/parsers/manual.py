"""Manual asset entry — PPF, FD, SGB, NPS, bonds, real estate, cash, digital gold, custom.

These rarely have ISINs or live prices, so they're value-based: the user states the current
value (and optionally invested value). A sensible InstrumentType is required so the classifier
can bucket them (e.g. PPF -> Debt/PPF, SGB -> Gold/SGB).
"""

from __future__ import annotations

from pydantic import BaseModel

from app.domain.taxonomy import InstrumentType, Source
from app.parsers.base import ParsedHolding, ParseResult


class ManualEntry(BaseModel):
    name: str
    instrument_type: InstrumentType
    current_value: float
    invested_value: float | None = None
    quantity: float = 1.0
    isin: str | None = None
    symbol: str | None = None
    account_name: str = "Manual"
    institution: str | None = None
    sector: str | None = None
    market_cap: str | None = None
    asset_class: str | None = None  # explicit override hint
    note: str | None = None


def parse_entries(entries: list[ManualEntry], file_name: str | None = None) -> ParseResult:
    result = ParseResult(source=Source.MANUAL, file_name=file_name)
    for e in entries:
        kind = "bank" if e.instrument_type in (InstrumentType.FD, InstrumentType.CASH) else "manual"
        result.holdings.append(
            ParsedHolding(
                name=e.name,
                instrument_type=e.instrument_type,
                isin=(e.isin or "").upper() or None,
                symbol=(e.symbol or "").upper() or None,
                quantity=e.quantity,
                current_value=e.current_value,
                invested_value=e.invested_value if e.invested_value is not None else e.current_value,
                source=Source.MANUAL,
                account_name=e.account_name,
                account_kind=kind,
                institution=e.institution,
                sector_hint=e.sector,
                market_cap_hint=e.market_cap,
                category_hint=e.asset_class,
                raw={"note": e.note} if e.note else {},
            )
        )
    result.info(f"Added {len(result.holdings)} manual entries.")
    return result
