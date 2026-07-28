"""Seed the local DB with the bundled sample portfolio.

Runs the real import pipeline (parse -> reconcile -> classify) so the seed exercises the
same code paths as a user upload. Also injects one fund's *disclosed* portfolio to
demonstrate look-through concentration and direct-vs-fund overlap, and sets a default target.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from sqlalchemy import select

from app.db.database import session_scope
from app.db.models import Holding, Instrument, Lookthrough, TargetAllocation, Transaction
from app.parsers import cas_json, generic_csv, zerodha_holdings
from app.services.classification_service import reclassify_all
from app.services.import_service import process_parse_result
from scripts.reset import reset

SAMPLES = Path(__file__).resolve().parents[2] / "samples"

DEFAULT_TARGETS = {
    "Equity": 45.0,
    "International Equity": 10.0,
    "Debt": 25.0,
    "Gold": 10.0,
    "Real Estate": 5.0,
    "Cash": 5.0,
}

# A disclosed (not estimated) slice of Parag Parikh Flexi Cap, with real constituents that
# overlap the direct equity book (HDFCBANK, ITC, BAJFINANCE, INFY) plus its US holdings.
PPFAS_DISCLOSED = [
    ("HDFC Bank", "INE040A01034", 0.08, "Equity", "Large Cap", "Financial Services"),
    ("ICICI Bank", "INE090A01021", 0.06, "Equity", "Large Cap", "Financial Services"),
    ("Bajaj Finance", "INE296A01024", 0.05, "Equity", "Large Cap", "Financial Services"),
    ("ITC", "INE154A01025", 0.05, "Equity", "Large Cap", "FMCG"),
    ("Infosys", "INE009A01021", 0.05, "Equity", "Large Cap", "Information Technology"),
    ("Coal India", "INE522F01014", 0.04, "Equity", "Large Cap", "Energy"),
    ("Power Grid Corp", "INE752E01010", 0.04, "Equity", "Large Cap", "Power"),
    ("Alphabet Inc", None, 0.07, "International Equity", "International Equity", "Information Technology"),
    ("Microsoft Corp", None, 0.06, "International Equity", "International Equity", "Information Technology"),
    ("Amazon.com Inc", None, 0.05, "International Equity", "International Equity", "Consumer Services"),
    ("Meta Platforms", None, 0.04, "International Equity", "International Equity", "Information Technology"),
    ("Cash & Equivalents", None, 0.20, "Cash", None, None),
]


def _import_file(db, parser, path: Path, **kwargs):
    content = path.read_text(encoding="utf-8")
    result = parser.parse(content, file_name=path.name, **kwargs)
    batch = process_parse_result(db, result)
    print(f"  {path.name}: parsed={batch.count_parsed} imported={batch.count_imported} "
          f"merged={batch.count_merged} unclassified={batch.count_unclassified}")


def seed() -> None:
    reset()
    with session_scope() as db:
        print("Importing sample files through the pipeline:")
        _import_file(db, zerodha_holdings, SAMPLES / "zerodha_holdings.csv", account_name="Zerodha Demat")

        cas = json.loads((SAMPLES / "cas.json").read_text(encoding="utf-8"))
        cas_result = cas_json.parse_dict(cas, file_name="cas.json")
        batch = process_parse_result(db, cas_result)
        print(f"  cas.json: parsed={batch.count_parsed} imported={batch.count_imported} "
              f"merged={batch.count_merged} unclassified={batch.count_unclassified}")

        _import_file(db, generic_csv, SAMPLES / "manual_assets.csv", account_name="Manual Assets")

        # Inject disclosed look-through for Parag Parikh Flexi Cap (AMFI 122639).
        ppfas = db.scalar(select(Instrument).where(Instrument.scheme_code == "122639"))
        if ppfas:
            for name, isin, weight, ac, cap, sector in PPFAS_DISCLOSED:
                db.add(Lookthrough(
                    instrument_id=ppfas.id, holding_name=name, holding_isin=isin,
                    weight=weight, asset_class=ac, market_cap=cap, sector=sector,
                    is_estimated=False,
                ))
            db.flush()
            print(f"  Added {len(PPFAS_DISCLOSED)} disclosed holdings for {ppfas.name}.")

        # The Zerodha holdings CSV is a snapshot with no transaction history, so direct
        # stocks/ETFs would have no XIRR. Inject a dated buy for each (as a tradebook would
        # provide) so lifetime XIRR is demonstrable. Dates are staggered for realism.
        buy_dates = [date(2021, 7, 1), date(2022, 2, 15), date(2022, 9, 1),
                     date(2023, 1, 10), date(2023, 6, 1)]
        stock_holdings = db.execute(
            select(Holding, Instrument)
            .join(Instrument, Holding.instrument_id == Instrument.id)
            .where(Instrument.instrument_type.in_(("stock", "etf")))
        ).all()
        injected = 0
        for i, (h, inst) in enumerate(stock_holdings):
            if h.invested_value:
                db.add(Transaction(
                    instrument_id=inst.id, account_id=h.account_id,
                    date=buy_dates[i % len(buy_dates)], kind="buy",
                    units=h.quantity, amount=round(-h.invested_value, 2),
                    price=h.avg_cost, source="zerodha_tradebook",
                ))
                injected += 1
        db.flush()
        print(f"  Injected {injected} direct-equity buy transactions (for XIRR).")

        # Default target allocation.
        for bucket, pct in DEFAULT_TARGETS.items():
            db.add(TargetAllocation(level="asset_class", bucket=bucket, target_pct=pct))

        # Re-run classification so disclosed look-through replaces the estimated split.
        count = reclassify_all(db)
        print(f"Re-classified {count} instruments.")

    print("Seed complete.")


if __name__ == "__main__":
    seed()
