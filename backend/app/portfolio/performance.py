"""Unitized performance curve — the Zerodha-Console-style NAV progression.

Method (time-weighted, external-cashflow-neutral): treat the portfolio like a mutual fund.
Money flowing in buys "units" at the current NAV; money flowing out redeems units. The NAV
therefore reflects pure investment performance, isolated from how much/when you added money.
NAV is rebased to 1000 at inception; ``return_pct = NAV/1000 - 1``.

Accurate for mutual funds now (units from CAS transactions × AMFI daily NAV). Direct equity and
a combined view need historical stock prices (the Kite price feed — Phase C), so this covers the
mutual-fund slice and reports what fraction of net worth that represents.
"""

from __future__ import annotations

import calendar
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Instrument, Transaction
from app.prices.provider import AmfiNavProvider, _nearest_on_or_before

_IN = ("buy", "switch_in")
_OUT = ("sell", "switch_out")


def _month_ends(start: date, end: date) -> list[date]:
    out: list[date] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        d = date(y, m, calendar.monthrange(y, m)[1])
        if start <= d <= end:
            out.append(d)
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


def mf_performance_curve(db: Session, provider: AmfiNavProvider | None = None) -> dict:
    provider = provider or AmfiNavProvider()

    funds: list[tuple[Instrument, list[Transaction], dict[date, float]]] = []
    for inst in db.scalars(select(Instrument).where(Instrument.instrument_type == "mutual_fund")).all():
        if not inst.scheme_code:
            continue
        txns = list(db.scalars(
            select(Transaction).where(Transaction.instrument_id == inst.id).order_by(Transaction.date)
        ).all())
        if not txns:
            continue
        series = provider.series(inst.scheme_code)
        if series:
            funds.append((inst, txns, series))

    if not funds:
        return {"points": [], "covered_value": 0.0, "covered_pct": 0.0,
                "note": "No mutual-fund transaction history available to plot."}

    all_txns = [t for _, txns, _ in funds for t in txns]
    start = min(t.date for t in all_txns)
    today = date.today()
    sample_dates = sorted(set([start, *_month_ends(start, today), today]))
    event_dates = sorted(set([t.date for t in all_txns]) | set(sample_dates))
    sample_set = set(sample_dates)

    def units_before(txns: list[Transaction], d: date, inclusive: bool) -> float:
        u = 0.0
        for t in txns:
            if (t.date <= d) if inclusive else (t.date < d):
                if t.kind in _IN:
                    u += t.units or 0.0
                elif t.kind in _OUT:
                    u -= t.units or 0.0
        return u

    def market_value(d: date, inclusive: bool) -> float:
        total = 0.0
        for inst, txns, series in funds:
            u = units_before(txns, d, inclusive)
            if u <= 0:
                continue
            nav = _nearest_on_or_before(series, d)
            if nav:
                total += u * nav
        return total

    units_syn = 0.0
    nav_syn = 1000.0
    points = []
    for d in event_dates:
        existing = market_value(d, inclusive=False)  # value of units held before today, repriced
        if units_syn > 0:
            nav_syn = existing / units_syn
        cf = -sum(t.amount for t in all_txns if t.date == d)  # into portfolio (buys +, sells −)
        if cf != 0:
            if units_syn <= 0:
                units_syn = cf / 1000.0  # inception: base NAV 1000
                nav_syn = 1000.0
            else:
                units_syn += cf / nav_syn

        if d in sample_set:
            mv = market_value(d, inclusive=True)
            invested = round(sum(-t.amount for t in all_txns if t.date <= d), 2)
            points.append({
                "date": d.isoformat(),
                "nav": round(nav_syn, 2),
                "return_pct": round((nav_syn / 1000.0 - 1) * 100, 2),
                "value": round(mv, 2),
                "invested": invested,
            })

    # How much of total net worth this MF curve represents.
    from app.portfolio.aggregate import build_holding_rows
    net_worth = sum(r.current_value for r in build_holding_rows(db)) or 1.0
    covered = points[-1]["value"] if points else 0.0
    return {
        "points": points,
        "covered_value": round(covered, 2),
        "covered_pct": round(covered / net_worth * 100, 1),
        "final_return_pct": points[-1]["return_pct"] if points else 0.0,
        "note": "Mutual-fund performance (time-weighted, unitized NAV rebased to 0% at inception). "
                "Equity and combined views arrive with the historical price feed.",
    }
