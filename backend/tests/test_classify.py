"""Classification engine tests — covering the tricky cases the spec calls out:
ETFs are NOT all equity, hybrids split, internationals separated, graceful degradation.
"""

from __future__ import annotations

from app.classify.engine import ClassifyInput, classify
from app.domain.taxonomy import AssetClass, EquitySubClass, InstrumentType


def c(**kw):
    kw.setdefault("instrument_type", InstrumentType.STOCK.value)
    return classify(ClassifyInput(**kw))


def test_gold_etf_is_gold_not_equity():
    r = c(name="Nippon India Gold ETF", instrument_type=InstrumentType.ETF.value, symbol="GOLDBEES")
    assert r.asset_class == AssetClass.GOLD.value
    assert r.sub_class == "Gold ETF"
    assert r.confidence == "high"


def test_bharat_bond_etf_is_debt():
    r = c(name="Bharat Bond ETF April 2031", instrument_type=InstrumentType.ETF.value, symbol="EBBETF0431")
    assert r.asset_class == AssetClass.DEBT.value
    assert r.sub_class == "Corporate Bond"


def test_gilt_etf_is_debt():
    r = c(name="ICICI 10Y G-Sec ETF", instrument_type=InstrumentType.ETF.value, symbol="GSEC10IETF")
    assert r.asset_class == AssetClass.DEBT.value
    assert r.sub_class == "Gilt/G-Sec"


def test_nasdaq_etf_is_international():
    r = c(name="Motilal Oswal Nasdaq 100 ETF", instrument_type=InstrumentType.ETF.value, symbol="MON100")
    assert r.asset_class == AssetClass.INTERNATIONAL_EQUITY.value


def test_index_etf_is_equity_large():
    r = c(name="Nippon India Nifty 50 ETF", instrument_type=InstrumentType.ETF.value, symbol="NIFTYBEES")
    assert r.asset_class == AssetClass.EQUITY.value
    assert r.sub_class == EquitySubClass.LARGE_CAP.value


def test_unknown_etf_by_name_gold():
    # Not in the ETF map, but the name clearly says gold.
    r = c(name="Some New Gold ETF", instrument_type=InstrumentType.ETF.value, symbol="NEWGOLD")
    assert r.asset_class == AssetClass.GOLD.value
    assert r.confidence == "medium"


def test_etf_imported_as_stock_is_still_detected():
    # Zerodha holdings CSV types everything as 'stock'; a gold ETF must not become equity.
    r = c(name="GOLDBEES", symbol="GOLDBEES", instrument_type=InstrumentType.STOCK.value)
    assert r.asset_class == AssetClass.GOLD.value
    assert r.refined_type == InstrumentType.ETF.value
    # Debt ETF likewise.
    r2 = c(name="EBBETF0433", symbol="EBBETF0433", instrument_type=InstrumentType.STOCK.value)
    assert r2.asset_class == AssetClass.DEBT.value


def test_known_stock_has_cap_and_sector():
    r = c(name="RELIANCE", symbol="RELIANCE")
    assert r.asset_class == AssetClass.EQUITY.value
    assert r.market_cap == "Large Cap"
    assert r.sector == "Energy"
    assert r.confidence == "high"


def test_known_stock_by_isin():
    r = c(name="Infosys Ltd", isin="INE009A01021")
    assert r.market_cap == "Large Cap"
    assert r.sector == "Information Technology"


def test_unknown_stock_is_equity_unclassified_cap():
    r = c(name="SOMETHING UNKNOWN LTD", symbol="ZZZZUNKNOWN")
    assert r.asset_class == AssetClass.EQUITY.value
    assert r.market_cap == EquitySubClass.UNCLASSIFIED.value


def test_flexicap_fund_has_estimated_lookthrough():
    r = c(name="Parag Parikh Flexi Cap Fund - Direct - Growth",
          instrument_type=InstrumentType.MUTUAL_FUND.value, scheme_code="122639")
    assert r.asset_class == AssetClass.EQUITY.value
    assert r.is_estimated is True
    caps = {row.market_cap for row in r.lookthrough}
    assert {"Large Cap", "Mid Cap", "Small Cap"}.issubset(caps)
    assert abs(sum(row.weight for row in r.lookthrough) - 1.0) < 1e-6


def test_hybrid_fund_splits_equity_and_debt():
    r = c(name="ICICI Balanced Advantage Fund", instrument_type=InstrumentType.MUTUAL_FUND.value,
          scheme_code="118533")
    classes = {row.asset_class for row in r.lookthrough}
    assert AssetClass.EQUITY.value in classes
    assert AssetClass.DEBT.value in classes


def test_liquid_fund_is_debt():
    r = c(name="Nippon India Liquid Fund Direct Growth",
          instrument_type=InstrumentType.MUTUAL_FUND.value, scheme_code="120053")
    assert r.asset_class == AssetClass.DEBT.value
    assert r.sub_class == "Liquid/Overnight"


def test_fixed_types():
    assert c(name="SGB 2030", instrument_type=InstrumentType.SGB.value).asset_class == AssetClass.GOLD.value
    assert c(name="HDFC FD", instrument_type=InstrumentType.FD.value).sub_class == "FD"
    assert c(name="PPF", instrument_type=InstrumentType.PPF.value).sub_class == "PPF"
    assert c(name="My REIT", instrument_type=InstrumentType.REIT.value).asset_class == AssetClass.REAL_ESTATE.value


def test_override_wins():
    r = classify(
        ClassifyInput(name="GOLDBEES", instrument_type=InstrumentType.ETF.value, symbol="GOLDBEES"),
        override={"asset_class": AssetClass.DEBT.value, "sub_class": "Corporate Bond"},
    )
    assert r.asset_class == AssetClass.DEBT.value
    assert r.confidence == "manual"


def test_unknown_mf_degrades_gracefully():
    r = c(name="Totally Unknown Scheme XYZ", instrument_type=InstrumentType.MUTUAL_FUND.value)
    assert r.asset_class == AssetClass.UNCLASSIFIED.value
    assert r.confidence == "none"
