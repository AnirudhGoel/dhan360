"""XIRR engine: the annualized money-weighted return over a chosen window.

Design (see docs/PLAN_xirr_and_license.md):
  * cashflows are dated ₹ amounts, signed from the investor's view (out negative, in positive);
  * lifetime XIRR = all trades/dividends + today's current value as a closing inflow;
  * period XIRR = opening value (outflow) + in-window cashflows + closing value (inflow);
  * boundary value = quantity_on(date) × price_on(date), with quantity reconstructed across
    splits using corporate actions (a split is not a cashflow, so it's invisible in trades).

Honesty flags travel with every result: price-return only (no dividends modelled for equity),
estimated price (no historical source for a stock/ETF), and split-flagged.

The solver is pure; the assembly reads the DB. Kept separate so the math is trivially testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CorporateAction, Holding, Instrument, Transaction
from app.portfolio.aggregate import holding_value
from app.prices.provider import PriceService


# --------------------------------------------------------------------------- solver

def xirr(cashflows: list[tuple[date, float]], guess: float = 0.1) -> float | None:
    """Solve Σ cf_i / (1+r)^(years_i) = 0 for r. Newton's method, bisection fallback.

    Returns the annualized rate as a fraction (0.12 = 12%), or None if it can't be solved
    (e.g. all cashflows same sign — no rate makes NPV zero).
    """
    flows = [(d, a) for d, a in cashflows if a != 0]
    if len(flows) < 2:
        return None
    if not (any(a > 0 for _, a in flows) and any(a < 0 for _, a in flows)):
        return None  # need at least one inflow and one outflow

    t0 = min(d for d, _ in flows)
    years = [((d - t0).days / 365.0, a) for d, a in flows]

    def npv(rate: float) -> float:
        return sum(a / (1.0 + rate) ** t for t, a in years)

    def dnpv(rate: float) -> float:
        return sum(-t * a / (1.0 + rate) ** (t + 1) for t, a in years)

    # Newton's method
    rate = guess
    for _ in range(100):
        f = npv(rate)
        d = dnpv(rate)
        if abs(d) < 1e-12:
            break
        step = f / d
        rate -= step
        if rate <= -0.9999:
            rate = -0.9999 + 1e-6
        if abs(step) < 1e-8:
            return rate

    # Bisection fallback over a wide, sane range.
    lo, hi = -0.9999, 100.0
    flo, fhi = npv(lo), npv(hi)
    if flo * fhi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        fmid = npv(mid)
        if abs(fmid) < 1e-7:
            return mid
        if flo * fmid < 0:
            hi, fhi = mid, fmid
        else:
            lo, flo = mid, fmid
    return (lo + hi) / 2


# ------------------------------------------------------------- quantity reconstruction

def _holdings_for(db: Session, instrument_id: int) -> list[Holding]:
    return list(db.scalars(select(Holding).where(Holding.instrument_id == instrument_id)).all())


def current_quantity(db: Session, instrument_id: int) -> float:
    return sum(h.quantity or 0.0 for h in _holdings_for(db, instrument_id))


def quantity_on(db: Session, instrument_id: int, on: date, txns: list[Transaction],
                actions: list[CorporateAction]) -> float:
    """Reconstruct units held at end of `on`, anchored on today's actual holdings.

    Walk backward from the current quantity: undo trades dated after `on`, and undo any
    corporate action (split/bonus) whose date is after `on` (divide by its ratio, since the
    action multiplied the count). This keeps the quantity basis consistent with the price basis.
    """
    qty = current_quantity(db, instrument_id)
    for t in txns:
        if t.date > on and t.units:
            if t.kind in ("buy", "switch_in"):
                qty -= t.units      # this buy hadn't happened yet
            elif t.kind in ("sell", "switch_out"):
                qty += t.units      # this sell hadn't happened yet
    for a in actions:
        if a.date > on and a.ratio:
            qty /= a.ratio          # undo the split multiplier
    return qty


# --------------------------------------------------------------------------- result types

@dataclass
class XirrFlags:
    price_return_only: bool = False   # dividends not included (equity)
    has_estimated_price: bool = False  # a boundary value used a proxy / was unavailable
    split_flagged: bool = False        # a split fell in the window w/o a corp-action record
    insufficient_data: bool = False


@dataclass
class XirrResult:
    label: str
    xirr: float | None
    start_value: float
    end_value: float
    invested: float
    current_value: float
    covered_value: float = 0.0  # value whose return XIRR actually measures (has a cost basis)
    flags: XirrFlags = field(default_factory=XirrFlags)
    note: str = ""
    # Internal: the pooled cashflows behind this result, so groups can be merged correctly.
    flows: list[tuple[date, float]] = field(default_factory=list, repr=False)


# --------------------------------------------------------------------------- assembly

class XirrEngine:
    def __init__(self, db: Session, prices: PriceService | None = None) -> None:
        self.db = db
        self.prices = prices or PriceService()

    def _instrument_txns(self, instrument_id: int) -> list[Transaction]:
        return list(self.db.scalars(
            select(Transaction).where(Transaction.instrument_id == instrument_id)
            .order_by(Transaction.date)
        ).all())

    def _instrument_actions(self, instrument_id: int) -> list[CorporateAction]:
        return list(self.db.scalars(
            select(CorporateAction).where(CorporateAction.instrument_id == instrument_id)
        ).all())

    def _boundary_value(self, instrument: Instrument, on: date, flags: XirrFlags) -> float:
        """Value of a holding as of `on` = qty_on × price_on. Marks estimation on the flags."""
        txns = self._instrument_txns(instrument.id)
        actions = self._instrument_actions(instrument.id)
        qty = quantity_on(self.db, instrument.id, on, txns, actions)
        if qty <= 0:
            return 0.0
        price, estimated = self.prices.value_per_unit(self.db, instrument, on)
        if price is None:
            flags.has_estimated_price = True
            return 0.0  # unknown historical price → excluded from boundary (flagged)
        if estimated:
            flags.has_estimated_price = True
        return qty * price

    def instrument_xirr(self, instrument: Instrument, start: date | None, end: date | None) -> XirrResult:
        flags = XirrFlags()
        txns = self._instrument_txns(instrument.id)
        holdings = _holdings_for(self.db, instrument.id)
        current_val = sum(holding_value(h) for h in holdings)
        invested = sum(h.invested_value or 0.0 for h in holdings)

        cashflows: list[tuple[date, float]] = []
        window_txns = [t for t in txns if (start is None or t.date >= start) and (end is None or t.date <= end)]
        for t in window_txns:
            cashflows.append((t.date, t.amount))
            if t.kind in ("buy", "sell") and instrument.instrument_type in ("stock", "etf"):
                flags.price_return_only = True  # equity dividends not captured

        # Opening boundary (period only): value at start counts as money "put in" (outflow).
        start_value = 0.0
        if start is not None:
            start_value = self._boundary_value(instrument, start, flags)
            if start_value > 0:
                cashflows.insert(0, (start, -start_value))

        # A holding needs a real dated cost basis (at least one outflow) to have a meaningful
        # XIRR. Manual assets (PPF/FD) and holdings-only imports have no transactions and no
        # priced opening boundary → we can't date the money that went in, so we exclude them
        # (rather than pooling a lone closing inflow that would wildly inflate the rate).
        has_basis = any(a < 0 for _, a in cashflows)

        end_date = end or date.today()
        if end is None:
            end_value = current_val
        else:
            end_value = self._boundary_value(instrument, end, flags)

        if not has_basis:
            flags.insufficient_data = True
            return XirrResult(
                label=instrument.name, xirr=None, start_value=round(start_value, 2),
                end_value=round(end_value, 2), invested=round(invested, 2),
                current_value=round(current_val, 2), covered_value=0.0, flags=flags, flows=[],
            )

        # Lifetime XIRR: if the oldest cashflow is less than one year old, the annualised rate
        # is unreliable (a 3-month gain annualises to a misleading figure). Exclude.
        if start is None and cashflows:
            earliest = min(d for d, _ in cashflows)
            if (date.today() - earliest).days < 365:
                flags.insufficient_data = True
                return XirrResult(
                    label=instrument.name, xirr=None, start_value=0.0,
                    end_value=round(end_value, 2), invested=round(invested, 2),
                    current_value=round(current_val, 2), covered_value=0.0, flags=flags, flows=[],
                )

        if end_value > 0:
            cashflows.append((end_date, end_value))

        rate = xirr(cashflows)
        # Period XIRR with no solvable rate (e.g. closing price unavailable → all-negative
        # flows): exclude from the aggregate merge so broken cashflows don't distort the group.
        if end is not None and rate is None:
            flags.insufficient_data = True
            return XirrResult(
                label=instrument.name, xirr=None, start_value=round(start_value, 2),
                end_value=round(end_value, 2), invested=round(invested, 2),
                current_value=round(current_val, 2), covered_value=0.0, flags=flags, flows=[],
            )
        return XirrResult(
            label=instrument.name, xirr=rate, start_value=round(start_value, 2),
            end_value=round(end_value, 2), invested=round(invested, 2),
            current_value=round(current_val, 2), covered_value=round(current_val, 2),
            flags=flags, flows=cashflows,
        )

    def portfolio_xirr(self, start: date | None, end: date | None,
                       group_by: str = "portfolio") -> list[XirrResult]:
        """XIRR grouped by portfolio (single), asset_class, or instrument."""
        instruments = list(self.db.scalars(select(Instrument)).all())
        # Only instruments that actually have positions.
        instruments = [i for i in instruments if _holdings_for(self.db, i.id)]

        per_instrument = {i.id: self.instrument_xirr(i, start, end) for i in instruments}

        if group_by == "instrument":
            results = [r for r in per_instrument.values() if r.current_value > 0]
            results.sort(key=lambda r: r.current_value, reverse=True)
            return results

        if group_by == "asset_class":
            groups: dict[str, list[tuple[Instrument, XirrResult]]] = {}
            for i in instruments:
                ac = i.classification.asset_class if i.classification else "Unclassified"
                groups.setdefault(ac, []).append((i, per_instrument[i.id]))
            out = [self._merge([r for _, r in items], label=ac) for ac, items in groups.items()]
            out.sort(key=lambda r: r.current_value, reverse=True)
            return out

        # portfolio (default): one merged result
        return [self._merge(list(per_instrument.values()), label="Whole portfolio")]

    def _merge(self, results: list[XirrResult], label: str) -> XirrResult:
        """Combine several instruments' cashflows into one XIRR by re-pooling their flows.

        We recompute from pooled cashflows rather than averaging rates (averaging rates is
        mathematically wrong). Each instrument already produced flags; we OR them.
        """
        flags = XirrFlags()
        pooled: list[tuple[date, float]] = []
        invested = current_val = start_v = end_v = covered = 0.0
        for r in results:
            invested += r.invested
            current_val += r.current_value
            start_v += r.start_value
            end_v += r.end_value
            covered += r.covered_value
            flags.price_return_only |= r.flags.price_return_only
            flags.has_estimated_price |= r.flags.has_estimated_price
            flags.split_flagged |= r.flags.split_flagged
            pooled.extend(r.flows)  # pool the actual cashflows — correct way to merge XIRRs
        rate = xirr(pooled) if pooled else None
        # If part of the bucket lacks a cost basis, the XIRR only covers the priced portion.
        if covered < current_val - 1:
            flags.has_estimated_price = True
        if covered <= 0:
            flags.insufficient_data = True
        return XirrResult(
            label=label, xirr=rate, start_value=round(start_v, 2), end_value=round(end_v, 2),
            invested=round(invested, 2), current_value=round(current_val, 2),
            covered_value=round(covered, 2), flags=flags, flows=pooled,
        )
