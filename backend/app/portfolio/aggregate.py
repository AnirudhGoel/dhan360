"""Portfolio aggregation — turns stored holdings into the numbers the dashboard renders.

Core idea: every holding is expanded into one or more *exposures*. A direct stock is a single
exposure; a mutual fund with look-through is expanded across its underlying buckets (so a
flexi-cap fund contributes partially to large/mid/small and a hybrid to equity+debt). All the
breakdowns (asset class, equity cap, debt, gold, sector) are then simple groupings of exposures,
which keeps the totals internally consistent.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Account, Classification, Holding, Instrument
from app.domain.taxonomy import (
    ASSET_CLASS_ORDER,
    AssetClass,
    EquitySubClass,
)


def holding_value(h: Holding) -> float:
    if h.current_value is not None:
        return h.current_value
    if h.invested_value is not None:
        return h.invested_value
    return 0.0


@dataclass
class Exposure:
    holding_id: int
    instrument_id: int
    instrument_name: str
    instrument_type: str
    account: str
    source: str
    asset_class: str
    sub_class: str | None
    market_cap: str | None
    sector: str | None
    value: float
    via_lookthrough: bool
    is_estimated: bool


@dataclass
class HoldingRow:
    id: int
    instrument_id: int
    name: str
    instrument_type: str
    symbol: str | None
    isin: str | None
    scheme_code: str | None
    account: str
    source: str
    quantity: float
    avg_cost: float | None
    invested_value: float | None
    current_value: float
    last_price: float | None
    pnl: float | None
    pnl_pct: float | None
    asset_class: str
    sub_class: str | None
    market_cap: str | None
    sector: str | None
    confidence: str
    is_estimated: bool
    amc: str | None
    plan: str | None


def _load_holdings(db: Session) -> list[tuple[Holding, Instrument, Classification | None, Account]]:
    stmt = (
        select(Holding, Instrument, Classification, Account)
        .join(Instrument, Holding.instrument_id == Instrument.id)
        .join(Account, Holding.account_id == Account.id)
        .outerjoin(Classification, Classification.instrument_id == Instrument.id)
        .options(joinedload(Instrument.lookthrough))
    )
    seen: dict[int, tuple] = {}
    for row in db.execute(stmt).unique().all():
        seen[row[0].id] = row
    return list(seen.values())


def build_holding_rows(db: Session) -> list[HoldingRow]:
    rows: list[HoldingRow] = []
    for h, inst, cls, acct in _load_holdings(db):
        value = holding_value(h)
        invested = h.invested_value
        pnl = (value - invested) if (invested is not None) else None
        pnl_pct = (pnl / invested * 100) if (pnl is not None and invested) else None
        rows.append(HoldingRow(
            id=h.id, instrument_id=inst.id, name=inst.name,
            instrument_type=inst.instrument_type, symbol=inst.symbol, isin=inst.isin,
            scheme_code=inst.scheme_code, account=acct.name, source=h.source,
            quantity=h.quantity, avg_cost=h.avg_cost, invested_value=invested,
            current_value=value, last_price=h.last_price, pnl=pnl, pnl_pct=pnl_pct,
            asset_class=cls.asset_class if cls else AssetClass.UNCLASSIFIED.value,
            sub_class=cls.sub_class if cls else None,
            market_cap=cls.market_cap if cls else None,
            sector=cls.sector if cls else None,
            confidence=cls.confidence if cls else "none",
            is_estimated=cls.is_estimated if cls else True,
            amc=inst.amc, plan=inst.plan,
        ))
    return rows


def build_exposures(db: Session) -> list[Exposure]:
    exposures: list[Exposure] = []
    for h, inst, cls, acct in _load_holdings(db):
        value = holding_value(h)
        if value == 0:
            continue
        asset_class = cls.asset_class if cls else AssetClass.UNCLASSIFIED.value
        lookthrough = list(inst.lookthrough)

        if lookthrough:
            covered = 0.0
            for lt in lookthrough:
                covered += lt.weight
                exposures.append(Exposure(
                    holding_id=h.id, instrument_id=inst.id, instrument_name=inst.name,
                    instrument_type=inst.instrument_type, account=acct.name, source=h.source,
                    asset_class=lt.asset_class,
                    sub_class=lt.market_cap,
                    market_cap=lt.market_cap if lt.asset_class in (
                        AssetClass.EQUITY.value, AssetClass.INTERNATIONAL_EQUITY.value) else None,
                    sector=lt.sector,
                    value=value * lt.weight,
                    via_lookthrough=True,
                    is_estimated=lt.is_estimated,
                ))
            # Any uncovered remainder falls back to the headline asset class.
            if covered < 0.999:
                exposures.append(Exposure(
                    holding_id=h.id, instrument_id=inst.id, instrument_name=inst.name,
                    instrument_type=inst.instrument_type, account=acct.name, source=h.source,
                    asset_class=asset_class, sub_class=cls.sub_class if cls else None,
                    market_cap=cls.market_cap if cls else None,
                    sector=cls.sector if cls else None,
                    value=value * (1 - covered), via_lookthrough=True,
                    is_estimated=cls.is_estimated if cls else True,
                ))
        else:
            exposures.append(Exposure(
                holding_id=h.id, instrument_id=inst.id, instrument_name=inst.name,
                instrument_type=inst.instrument_type, account=acct.name, source=h.source,
                asset_class=asset_class, sub_class=cls.sub_class if cls else None,
                market_cap=cls.market_cap if cls else None,
                sector=cls.sector if cls else None,
                value=value, via_lookthrough=False,
                is_estimated=cls.is_estimated if cls else True,
            ))
    return exposures


# ---- grouping helpers -------------------------------------------------------------

def _group(items: list[tuple[str, float]]) -> list[dict]:
    agg: dict[str, float] = {}
    for label, value in items:
        agg[label] = agg.get(label, 0.0) + value
    total = sum(agg.values()) or 1.0
    out = [
        {"label": k, "value": round(v, 2), "pct": round(v / total * 100, 2)}
        for k, v in agg.items()
    ]
    out.sort(key=lambda d: d["value"], reverse=True)
    return out


def _ordered_group(items: list[tuple[str, float]], order: list) -> list[dict]:
    grouped = {d["label"]: d for d in _group(items)}
    out = []
    for o in order:
        label = o.value if hasattr(o, "value") else o
        if label in grouped:
            out.append(grouped.pop(label))
    out.extend(grouped.values())
    return out


def summary(db: Session) -> dict:
    rows = build_holding_rows(db)
    exposures = build_exposures(db)

    net_worth = round(sum(r.current_value for r in rows), 2)
    invested = round(sum(r.invested_value for r in rows if r.invested_value is not None), 2)
    known_value = sum(r.current_value for r in rows if r.invested_value is not None)
    pnl = round(known_value - invested, 2)
    pnl_pct = round(pnl / invested * 100, 2) if invested else 0.0
    estimated_value = round(sum(e.value for e in exposures if e.is_estimated), 2)

    by_asset = _ordered_group(
        [(e.asset_class, e.value) for e in exposures], ASSET_CLASS_ORDER
    )

    equity_exp = [e for e in exposures if e.asset_class in (
        AssetClass.EQUITY.value, AssetClass.INTERNATIONAL_EQUITY.value)]
    equity_cap = _ordered_group(
        [(_cap_label(e), e.value) for e in equity_exp],
        [s.value for s in EquitySubClass],
    )

    debt_exp = [e for e in exposures if e.asset_class == AssetClass.DEBT.value]
    debt_split = _group([(e.sub_class or "Unclassified", e.value) for e in debt_exp])

    gold_exp = [e for e in exposures if e.asset_class == AssetClass.GOLD.value]
    gold_split = _group([(e.sub_class or "Unclassified", e.value) for e in gold_exp])

    sector_exp = [e for e in exposures if e.sector and e.asset_class in (
        AssetClass.EQUITY.value, AssetClass.INTERNATIONAL_EQUITY.value)]
    sectors = _group([(e.sector, e.value) for e in sector_exp])

    by_source = _group([(r.source, r.current_value) for r in rows])
    by_account = _group([(r.account, r.current_value) for r in rows])

    return {
        "net_worth": net_worth,
        "invested": invested,
        "pnl": pnl,
        "pnl_pct": pnl_pct,
        "estimated_value": estimated_value,
        "estimated_pct": round(estimated_value / net_worth * 100, 2) if net_worth else 0.0,
        "holdings_count": len(rows),
        "asset_allocation": by_asset,
        "equity_cap_split": equity_cap,
        "debt_split": debt_split,
        "gold_split": gold_split,
        "sector_exposure": sectors,
        "by_source": by_source,
        "by_account": by_account,
    }


def _cap_label(e: Exposure) -> str:
    if e.asset_class == AssetClass.INTERNATIONAL_EQUITY.value:
        return EquitySubClass.INTERNATIONAL.value
    return e.market_cap or e.sub_class or EquitySubClass.UNCLASSIFIED.value
