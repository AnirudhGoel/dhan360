"""Read endpoints: dashboard summary, holdings, MF/stock analysis, concentration, overlap."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.database import get_session
from app.portfolio.aggregate import summary
from app.portfolio.analysis import (
    mutual_fund_analysis,
    portfolio_overlap,
    stock_concentration,
    stock_etf_analysis,
)
from app.portfolio.holdings_view import holdings_payload
from app.portfolio.transactions_view import transactions_payload

router = APIRouter(prefix="/api", tags=["portfolio"])


@router.get("/portfolio/summary")
def get_summary(db: Session = Depends(get_session)) -> dict:
    return summary(db)


@router.get("/transactions")
def get_transactions(db: Session = Depends(get_session)) -> dict:
    return transactions_payload(db)


@router.get("/holdings")
def get_holdings(
    asset_class: str | None = Query(None),
    cap: str | None = Query(None),
    sub_class: str | None = Query(None),
    sector: str | None = Query(None),
    source: str | None = Query(None),
    account: str | None = Query(None),
    db: Session = Depends(get_session),
) -> dict:
    rows = holdings_payload(db, asset_class, cap, sub_class, sector, source, account)
    return {
        "holdings": rows,
        "count": len(rows),
        "total_value": round(sum(r["current_value"] for r in rows), 2),
    }


@router.get("/mutual-funds")
def get_mutual_funds(db: Session = Depends(get_session)) -> dict:
    return mutual_fund_analysis(db)


@router.get("/stocks")
def get_stocks(db: Session = Depends(get_session)) -> dict:
    return stock_etf_analysis(db)


@router.get("/concentration")
def get_concentration(top: int = 15, db: Session = Depends(get_session)) -> dict:
    return stock_concentration(db, top=top)


@router.get("/overlap")
def get_overlap(db: Session = Depends(get_session)) -> dict:
    return portfolio_overlap(db)
