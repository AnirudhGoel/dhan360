"""Parser tests against representative inline fixtures."""

from __future__ import annotations

from app.parsers import cas_json, generic_csv, zerodha_holdings, zerodha_tradebook
from app.parsers.manual import ManualEntry, parse_entries
from app.domain.taxonomy import InstrumentType

ZERODHA_HOLDINGS_CSV = """Symbol,ISIN,Sector,Quantity Available,Average Price,Previous Closing Price,Unrealized P&L
RELIANCE,INE002A01018,Energy,10,2400.00,2950.50,5505.00
GOLDBEES,INF204KB17I5,,100,55.20,62.10,690.00
TCS,INE467B01029,IT,5,3100.00,3850.00,3750.00
"""

ZERODHA_TRADEBOOK_CSV = """symbol,isin,trade_type,quantity,price,trade_date
RELIANCE,INE002A01018,buy,10,2400,2023-01-01
RELIANCE,INE002A01018,buy,5,2600,2023-06-01
RELIANCE,INE002A01018,sell,5,2900,2024-01-01
INFY,INE009A01021,buy,20,1400,2023-02-01
"""

GENERIC_CSV = """name,type,current_value,invested_value,asset_class
My PPF Account,ppf,250000,200000,Debt
SGB Series X,sgb,150000,120000,Gold
Emergency Cash,cash,50000,50000,Cash
"""

CAS_DICT = {
    "folios": [
        {
            "folio": "12345/67",
            "amc": "PPFAS Mutual Fund",
            "schemes": [
                {
                    "scheme": "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
                    "isin": "INF879O01027",
                    "amfi": "122639",
                    "advisor": "DIRECT",
                    "type": "EQUITY",
                    "close": 1000.0,
                    "valuation": {"date": "2024-03-31", "nav": 65.0, "value": 65000.0},
                    "transactions": [
                        {"amount": 50000.0, "units": 800.0},
                        {"amount": 5000.0, "units": 80.0},
                    ],
                }
            ],
        }
    ]
}


def test_zerodha_holdings_parses_and_computes_values():
    res = zerodha_holdings.parse(ZERODHA_HOLDINGS_CSV, file_name="holdings.csv")
    assert len(res.holdings) == 3
    rel = next(h for h in res.holdings if h.symbol == "RELIANCE")
    assert rel.quantity == 10
    assert rel.isin == "INE002A01018"
    # current value derived from qty * previous close
    assert rel.current_value == 29505.0
    assert rel.invested_value == 24000.0


def test_zerodha_tradebook_aggregates_net_position():
    res = zerodha_tradebook.parse(ZERODHA_TRADEBOOK_CSV)
    rel = next(h for h in res.holdings if h.symbol == "RELIANCE")
    assert rel.quantity == 10  # 10 + 5 - 5
    # buy-weighted avg over 15 bought units: (10*2400 + 5*2600)/15
    assert round(rel.avg_cost, 2) == round((10 * 2400 + 5 * 2600) / 15, 2)
    assert any(h.symbol == "INFY" for h in res.holdings)


def test_zerodha_tradebook_combines_files_and_dedups_by_trade_id():
    y1 = (
        "symbol,isin,trade_type,quantity,price,trade_date,trade_id\n"
        "RELIANCE,INE002A01018,buy,10,2400,2023-01-01,T1\n"
        "RELIANCE,INE002A01018,buy,5,2600,2023-06-01,T2\n"
    )
    y2 = (
        "symbol,isin,trade_type,quantity,price,trade_date,trade_id\n"
        "RELIANCE,INE002A01018,buy,5,2600,2023-06-01,T2\n"  # overlaps y1 — must be skipped
        "RELIANCE,INE002A01018,buy,8,2700,2024-02-01,T3\n"
    )
    res = zerodha_tradebook.parse([y1, y2])
    rel = next(h for h in res.holdings if h.symbol == "RELIANCE")
    assert rel.quantity == 23  # 10 + 5 + 8 (duplicate T2 counted once)
    assert len(rel.transactions) == 3


def test_xlsx_upload_converts_to_csv():
    import io

    from openpyxl import Workbook

    from app.api.imports import _to_csv_text

    wb = Workbook()
    ws = wb.active
    ws.append(["Symbol", "ISIN", "Quantity Available", "Average Price", "Previous Closing Price"])
    ws.append(["RELIANCE", "INE002A01018", 10, 2400, 2950.5])
    buf = io.BytesIO()
    wb.save(buf)

    csv_text = _to_csv_text(buf.getvalue(), "holdings.xlsx")
    res = zerodha_holdings.parse(csv_text)
    rel = next(h for h in res.holdings if h.symbol == "RELIANCE")
    assert rel.quantity == 10
    assert rel.current_value == 29505.0  # 10 * 2950.5


def test_generic_csv_with_asset_class_hint():
    res = generic_csv.parse(GENERIC_CSV)
    assert len(res.holdings) == 3
    ppf = next(h for h in res.holdings if h.instrument_type == InstrumentType.PPF)
    assert ppf.current_value == 250000
    assert ppf.category_hint == "Debt"


def test_cas_json_parse_dict():
    res = cas_json.parse_dict(CAS_DICT, file_name="cas.json")
    assert len(res.holdings) == 1
    h = res.holdings[0]
    assert h.scheme_code == "122639"
    assert h.quantity == 1000.0
    assert h.current_value == 65000.0
    assert h.invested_value == 55000.0  # 50000 + 5000
    assert h.plan == "direct"
    assert h.account_kind == "mf_folio"


def test_manual_entries():
    res = parse_entries([
        ManualEntry(name="My FD", instrument_type=InstrumentType.FD, current_value=100000),
    ])
    assert res.holdings[0].account_kind == "bank"
    assert res.holdings[0].invested_value == 100000  # defaults to current when omitted
