"""XIRR engine tests — solver correctness, split-aware quantity, and MF period XIRR."""

from __future__ import annotations

from datetime import date

import pytest

from app.portfolio.xirr import xirr


def approx(a, b, tol=5e-3):
    return a is not None and abs(a - b) < tol


def test_xirr_simple_one_year_doubling():
    # -100 today, +110 in one year → 10% XIRR.
    r = xirr([(date(2024, 1, 1), -100.0), (date(2025, 1, 1), 110.0)])
    assert approx(r, 0.10)


def test_xirr_known_multiflow():
    # Two 100 investments a year apart, worth 240 at year 2. Rate solves NPV=0.
    flows = [
        (date(2023, 1, 1), -100.0),
        (date(2024, 1, 1), -100.0),
        (date(2025, 1, 1), 240.0),
    ]
    r = xirr(flows)
    # Verify by plugging back into NPV.
    t0 = date(2023, 1, 1)
    npv = sum(a / (1 + r) ** ((d - t0).days / 365.0) for d, a in flows)
    assert abs(npv) < 1e-4
    assert 0.10 < r < 0.15  # sanity band (≈12.8%)


def test_xirr_negative_return():
    r = xirr([(date(2024, 1, 1), -100.0), (date(2025, 1, 1), 80.0)])
    assert approx(r, -0.20)


def test_xirr_requires_both_signs():
    assert xirr([(date(2024, 1, 1), -100.0), (date(2025, 1, 1), -50.0)]) is None
    assert xirr([(date(2024, 1, 1), 100.0)]) is None


def test_xirr_matches_half_year():
    # -100 -> +105 in ~6 months annualizes to ~10.25%.
    r = xirr([(date(2024, 1, 1), -100.0), (date(2024, 7, 1), 105.0)])
    assert r is not None and 0.09 < r < 0.12


# --- integration: split-aware quantity + MF period XIRR against a temp DB ---

@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("DHAN360_DATA_DIR", str(tmp_path))
    # Fresh engine bound to the temp dir.
    import importlib
    from app import config as cfg
    importlib.reload(cfg)
    from app.db import database as dbmod
    importlib.reload(dbmod)
    import app.db.models as models
    importlib.reload(models)
    dbmod.init_db()
    session = dbmod.SessionLocal()
    yield session, models
    session.close()


def test_quantity_reconstruction_across_split(db):
    session, models = db
    from app.portfolio.xirr import quantity_on, current_quantity

    inst = models.Instrument(name="RELIANCE", instrument_type="stock", symbol="RELIANCE")
    session.add(inst); session.flush()
    acct = models.Account(name="Z", kind="demat"); session.add(acct); session.flush()
    # Bought 10 in March; today hold 50 after a 1:5 split on July 15.
    session.add(models.Holding(account_id=acct.id, instrument_id=inst.id, quantity=50, source="x"))
    session.add(models.Transaction(instrument_id=inst.id, account_id=acct.id, source="tradebook",
                                   date=date(2025, 3, 1), kind="buy", units=10, amount=-24000.0))
    session.add(models.CorporateAction(instrument_id=inst.id, date=date(2025, 7, 15),
                                       kind="split", ratio=5.0))
    session.flush()

    txns = list(session.query(models.Transaction).all())
    actions = list(session.query(models.CorporateAction).all())
    assert current_quantity(session, inst.id) == 50
    # Before the split you held 10, not 50 — reconstruction must undo the 5x.
    assert quantity_on(session, inst.id, date(2025, 6, 1), txns, actions) == 10
    # After the split you held 50.
    assert quantity_on(session, inst.id, date(2025, 8, 1), txns, actions) == 50


def test_mf_period_xirr_with_injected_nav(db):
    session, models = db
    from app.portfolio.xirr import XirrEngine
    from app.prices.provider import AmfiNavProvider, PriceService

    inst = models.Instrument(name="Test Fund", instrument_type="mutual_fund", scheme_code="999999")
    session.add(inst); session.flush()
    acct = models.Account(name="MF", kind="mf_folio"); session.add(acct); session.flush()
    session.add(models.Holding(account_id=acct.id, instrument_id=inst.id, quantity=100,
                               current_value=13000.0, invested_value=10000.0, source="cas"))
    # One purchase inside the window.
    session.add(models.Transaction(instrument_id=inst.id, account_id=acct.id, source="cas",
                                   date=date(2025, 8, 1), kind="buy", units=20, amount=-2000.0))
    session.flush()

    # Injected NAV series: ₹100 on Jun 1, ₹130 on Dec 31 → strong period return.
    nav_series = {date(2025, 6, 1): 100.0, date(2025, 12, 31): 130.0, date(2025, 8, 1): 100.0}
    provider = AmfiNavProvider(fetcher=lambda code: nav_series)
    engine = XirrEngine(session, prices=PriceService(nav_provider=provider))

    res = engine.instrument_xirr(inst, start=date(2025, 6, 1), end=date(2025, 12, 31))
    # Opening value: qty_on(Jun1)=100-20=80 units × 100 = 8000 (outflow)
    # + buy 2000 out on Aug1; closing qty 100 × 130 = 13000 inflow.
    assert res.start_value == 8000.0
    assert res.end_value == 13000.0
    assert res.xirr is not None and res.xirr > 0.3  # ~46% period, annualized higher
    assert res.flags.price_return_only is False  # MF, no equity-dividend caveat


@pytest.mark.parametrize("order", [("h", "t"), ("t", "h")])
def test_holdings_and_tradebook_not_double_counted(db, order):
    session, models = db
    from app.parsers import zerodha_holdings, zerodha_tradebook
    from app.services.import_service import process_parse_result

    holdings_csv = (
        "Symbol,ISIN,Quantity Available,Average Price,Previous Closing Price\n"
        "RELIANCE,INE002A01018,10,2400,2950.5\n"
    )
    tradebook_csv = (
        "symbol,isin,trade_type,quantity,price,trade_date,trade_id\n"
        "RELIANCE,INE002A01018,buy,10,2400,2023-01-01,T1\n"
    )

    for step in order:
        parsed = zerodha_holdings.parse(holdings_csv) if step == "h" else zerodha_tradebook.parse(tradebook_csv)
        process_parse_result(session, parsed)
        session.commit()

    holdings = session.query(models.Holding).all()
    assert len(holdings) == 1, f"expected one position, got {len(holdings)} (order={order})"
    assert abs(holdings[0].current_value - 29505.0) < 1  # market value, NOT 29505 + 24000
    assert abs(holdings[0].invested_value - 24000.0) < 1  # cost basis preserved for P&L
