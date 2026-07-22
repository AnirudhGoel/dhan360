"""Zerodha tradebook CSV import.

A tradebook is a list of individual buy/sell trades. We aggregate it into net open
positions: net quantity and a buy-weighted average cost. Current value is unknown from a
tradebook alone (no live price), so it's left blank and can be filled by a price refresh
or a holdings import that reconciles onto the same instrument.
"""

from __future__ import annotations

from collections import defaultdict

from app.domain.taxonomy import InstrumentType, Source
from app.parsers.base import ParsedHolding, ParsedTxn, ParseResult
from app.parsers.cas_json import _parse_date
from app.parsers.csv_utils import find_col, sniff_rows, to_float


def parse(content: str, file_name: str | None = None, account_name: str = "Zerodha") -> ParseResult:
    result = ParseResult(source=Source.ZERODHA_TRADEBOOK, file_name=file_name)
    rows = sniff_rows(content)
    if not rows:
        result.error("No data rows found in file.")
        return result

    headers = list(rows[0].keys())
    c_symbol = find_col(headers, "symbol", "tradingsymbol", "instrument")
    c_isin = find_col(headers, "isin")
    c_type = find_col(headers, "tradetype", "type", "buysell", "transactiontype")
    c_qty = find_col(headers, "quantity", "qty")
    c_price = find_col(headers, "price", "tradeprice", "avgprice")
    c_date = find_col(headers, "tradedate", "date", "orderexecutiontime", "orderdate")

    if not (c_symbol and c_type and c_qty and c_price):
        result.error("Tradebook missing required columns (symbol/type/quantity/price).")
        return result

    # Aggregate: track net qty and total buy cost/qty for weighted average, plus dated trades.
    agg: dict[str, dict] = defaultdict(
        lambda: {"isin": None, "net_qty": 0.0, "buy_qty": 0.0, "buy_cost": 0.0, "txns": []}
    )
    for row in rows:
        symbol = (row.get(c_symbol) or "").strip().upper()
        if not symbol:
            continue
        qty = to_float(row.get(c_qty)) or 0.0
        price = to_float(row.get(c_price)) or 0.0
        ttype = (row.get(c_type) or "").strip().lower()
        tdate = _parse_date(row.get(c_date)) if c_date else None
        rec = agg[symbol]
        if c_isin and not rec["isin"]:
            rec["isin"] = (row.get(c_isin) or "").strip().upper() or None
        if ttype.startswith("b"):  # buy
            rec["net_qty"] += qty
            rec["buy_qty"] += qty
            rec["buy_cost"] += qty * price
            if tdate:
                # Investor perspective: a buy is money out (negative cashflow).
                rec["txns"].append(ParsedTxn(date=tdate, kind="buy", amount=round(-qty * price, 2), units=qty, price=price))
        elif ttype.startswith("s"):  # sell
            rec["net_qty"] -= qty
            if tdate:
                rec["txns"].append(ParsedTxn(date=tdate, kind="sell", amount=round(qty * price, 2), units=qty, price=price))

    for symbol, rec in agg.items():
        net = round(rec["net_qty"], 4)
        if net <= 0:
            continue  # fully exited
        avg = rec["buy_cost"] / rec["buy_qty"] if rec["buy_qty"] else None
        invested = net * avg if avg else None
        result.holdings.append(
            ParsedHolding(
                name=symbol,
                instrument_type=InstrumentType.STOCK,
                isin=rec["isin"],
                symbol=symbol,
                quantity=net,
                avg_cost=avg,
                invested_value=invested,
                source=Source.ZERODHA_TRADEBOOK,
                account_name=account_name,
                account_kind="demat",
                institution="Zerodha",
                transactions=sorted(rec["txns"], key=lambda t: t.date),
                raw={"derived_from": "tradebook"},
            )
        )

    result.info(f"Aggregated {len(result.holdings)} open positions from tradebook.")
    return result
