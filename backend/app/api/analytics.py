"""Analytics endpoints: configurable XIRR over a date range, grouped as requested."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_session
from app.portfolio.xirr import XirrEngine, XirrResult

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _serialize(r: XirrResult) -> dict:
    return {
        "label": r.label,
        "xirr": round(r.xirr * 100, 2) if r.xirr is not None else None,  # as a percentage
        "start_value": r.start_value,
        "end_value": r.end_value,
        "invested": r.invested,
        "current_value": r.current_value,
        "covered_value": r.covered_value,
        "coverage_pct": round(r.covered_value / r.current_value * 100, 1) if r.current_value else 0.0,
        "flags": {
            "price_return_only": r.flags.price_return_only,
            "has_estimated_price": r.flags.has_estimated_price,
            "split_flagged": r.flags.split_flagged,
            "insufficient_data": r.flags.insufficient_data,
        },
    }


@router.get("/xirr")
def get_xirr(
    scope: str = Query("portfolio", pattern="^(portfolio|asset_class|instrument)$"),
    start: date | None = Query(None, alias="from"),
    end: date | None = Query(None, alias="to"),
    db: Session = Depends(get_session),
) -> dict:
    if start and end and start > end:
        raise HTTPException(400, "'from' must be on or before 'to'.")
    engine = XirrEngine(db)
    results = engine.portfolio_xirr(start, end, group_by=scope)
    return {
        "scope": scope,
        "from": start.isoformat() if start else None,
        "to": end.isoformat() if end else None,
        "is_period": start is not None,
        "results": [_serialize(r) for r in results],
        "note": (
            "Mutual-fund XIRR uses actual NAV (accurate). Direct-equity period XIRR needs a "
            "price feed (Kite) — until then, equity holdings without cached historical prices are "
            "flagged and excluded from period boundaries. Equity figures are price-return "
            "(dividends not yet included)."
        ),
    }
