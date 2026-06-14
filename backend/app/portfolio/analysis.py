"""Stock-level concentration and direct-vs-fund overlap (look-through where disclosed)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Account, Holding, Instrument
from app.domain.taxonomy import InstrumentType
from app.portfolio.aggregate import holding_value


def _underlying_contributions(db: Session) -> dict[str, dict]:
    """Aggregate exposure to each underlying stock across direct holdings + disclosed MF look-through.

    Keyed by ISIN when available, else by upper-cased name. Tracks direct vs via-fund value so
    overlap can be derived. Estimated look-through (no real constituent names) is excluded.
    """
    contrib: dict[str, dict] = {}

    def bump(key: str, name: str, value: float, kind: str, sector: str | None, via: str | None):
        rec = contrib.setdefault(key, {
            "name": name, "sector": sector, "direct": 0.0, "via_fund": 0.0, "funds": set()
        })
        rec[kind] += value
        if not rec["sector"] and sector:
            rec["sector"] = sector
        if via:
            rec["funds"].add(via)

    stmt = (
        select(Holding, Instrument, Account)
        .join(Instrument, Holding.instrument_id == Instrument.id)
        .join(Account, Holding.account_id == Account.id)
        .options(joinedload(Instrument.lookthrough), joinedload(Instrument.classification))
    )
    seen = set()
    for h, inst, _acct in db.execute(stmt).unique().all():
        if h.id in seen:
            continue
        seen.add(h.id)
        value = holding_value(h)
        if value == 0:
            continue

        if inst.instrument_type == InstrumentType.STOCK.value:
            key = (inst.isin or inst.symbol or inst.name).upper()
            sector = inst.classification.sector if inst.classification else None
            bump(key, inst.name, value, "direct", sector, None)

        for lt in inst.lookthrough:
            if lt.is_estimated:
                continue  # don't fabricate constituent names from a modelled split
            key = (lt.holding_isin or lt.holding_name).upper()
            bump(key, lt.holding_name, value * lt.weight, "via_fund", lt.sector, inst.name)

    return contrib


def stock_concentration(db: Session, top: int = 15) -> dict:
    contrib = _underlying_contributions(db)
    items = []
    for rec in contrib.values():
        total = rec["direct"] + rec["via_fund"]
        items.append({
            "name": rec["name"],
            "sector": rec["sector"],
            "direct_value": round(rec["direct"], 2),
            "via_fund_value": round(rec["via_fund"], 2),
            "value": round(total, 2),
            "funds": sorted(rec["funds"]),
        })
    grand_total = sum(i["value"] for i in items) or 1.0
    for i in items:
        i["pct"] = round(i["value"] / grand_total * 100, 2)
    items.sort(key=lambda d: d["value"], reverse=True)
    return {"total_equity_value": round(grand_total, 2), "holdings": items[:top], "count": len(items)}


def mutual_fund_analysis(db: Session) -> dict:
    """Scheme-, AMC- and plan-wise MF views with equity/debt/gold split via look-through."""
    from app.portfolio.aggregate import _group, build_holding_rows  # local import avoids cycle

    rows = [r for r in build_holding_rows(db) if r.instrument_type == InstrumentType.MUTUAL_FUND.value]

    # Per-instrument look-through asset split.
    lt_by_inst: dict[int, list] = {}
    stmt = select(Instrument).options(joinedload(Instrument.lookthrough))
    for inst in db.scalars(stmt).unique().all():
        lt_by_inst[inst.id] = list(inst.lookthrough)

    schemes = []
    for r in rows:
        split: dict[str, float] = {}
        for lt in lt_by_inst.get(r.instrument_id, []):
            split[lt.asset_class] = split.get(lt.asset_class, 0.0) + r.current_value * lt.weight
        schemes.append({
            "name": r.name, "amc": r.amc, "plan": r.plan,
            "current_value": r.current_value, "invested_value": r.invested_value,
            "pnl": r.pnl, "pnl_pct": r.pnl_pct,
            "asset_class": r.asset_class, "sub_class": r.sub_class,
            "confidence": r.confidence, "is_estimated": r.is_estimated,
            "split": {k: round(v, 2) for k, v in split.items()},
        })
    schemes.sort(key=lambda d: d["current_value"], reverse=True)

    return {
        "schemes": schemes,
        "by_amc": _group([(r.amc or "Unknown", r.current_value) for r in rows]),
        "by_plan": _group([((r.plan or "unknown").title(), r.current_value) for r in rows]),
        "total": round(sum(r.current_value for r in rows), 2),
        "count": len(rows),
    }


def stock_etf_analysis(db: Session) -> dict:
    from app.portfolio.aggregate import _group, build_holding_rows

    rows = build_holding_rows(db)
    stocks = [r for r in rows if r.instrument_type == InstrumentType.STOCK.value]
    etfs = [r for r in rows if r.instrument_type == InstrumentType.ETF.value]

    def fmt(r):
        return {
            "name": r.name, "symbol": r.symbol, "current_value": r.current_value,
            "invested_value": r.invested_value, "pnl": r.pnl, "pnl_pct": r.pnl_pct,
            "asset_class": r.asset_class, "market_cap": r.market_cap, "sub_class": r.sub_class,
            "sector": r.sector, "confidence": r.confidence,
        }

    return {
        "stocks": sorted([fmt(r) for r in stocks], key=lambda d: d["current_value"], reverse=True),
        "etfs": sorted([fmt(r) for r in etfs], key=lambda d: d["current_value"], reverse=True),
        "stock_cap_split": _group([(r.market_cap or "Unclassified", r.current_value) for r in stocks]),
        "stock_sectors": _group([(r.sector, r.current_value) for r in stocks if r.sector]),
        "total_direct_equity": round(sum(r.current_value for r in stocks), 2),
    }


def portfolio_overlap(db: Session) -> dict:
    """Stocks held both directly and inside funds (disclosed look-through only)."""
    contrib = _underlying_contributions(db)
    overlaps = []
    overlap_value = 0.0
    for rec in contrib.values():
        if rec["direct"] > 0 and rec["via_fund"] > 0:
            v = rec["direct"] + rec["via_fund"]
            overlap_value += v
            overlaps.append({
                "name": rec["name"],
                "direct_value": round(rec["direct"], 2),
                "via_fund_value": round(rec["via_fund"], 2),
                "value": round(v, 2),
                "funds": sorted(rec["funds"]),
            })
    overlaps.sort(key=lambda d: d["value"], reverse=True)
    total = sum(rec["direct"] + rec["via_fund"] for rec in contrib.values()) or 1.0
    return {
        "overlap_value": round(overlap_value, 2),
        "overlap_pct": round(overlap_value / total * 100, 2),
        "overlaps": overlaps,
        "note": "Overlap uses disclosed fund portfolios only. Funds with estimated look-through "
                "are excluded to avoid false positives.",
    }
