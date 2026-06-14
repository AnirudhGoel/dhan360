"""Zerodha Console / Kite holdings CSV import.

Handles the common export shapes. Console holdings typically have columns like:
    Symbol, ISIN, Sector, Quantity Available, Quantity Pledged, Average Price,
    Previous Closing Price, Unrealized P&L, ...
Kite holdings export uses:
    Instrument, Qty., Avg. cost, LTP, Cur. val, P&L, ...
We detect columns by fuzzy header matching so both work, plus most hand-edited variants.
"""

from __future__ import annotations

from app.domain.taxonomy import InstrumentType, Source
from app.parsers.base import ParsedHolding, ParseResult
from app.parsers.csv_utils import find_col, sniff_rows, to_float


def parse(content: str, file_name: str | None = None, account_name: str = "Zerodha") -> ParseResult:
    result = ParseResult(source=Source.ZERODHA_HOLDINGS, file_name=file_name)
    rows = sniff_rows(content)
    if not rows:
        result.error("No data rows found in file.")
        return result

    headers = list(rows[0].keys())
    c_symbol = find_col(headers, "symbol", "instrument", "tradingsymbol")
    c_isin = find_col(headers, "isin")
    c_sector = find_col(headers, "sector")
    c_qty = find_col(headers, "quantityavailable", "qty", "quantity", "qty.")
    c_avg = find_col(headers, "averageprice", "avgcost", "avg.cost", "avgprice", "buyaverage")
    c_ltp = find_col(headers, "ltp", "lastprice", "previousclosingprice", "closingprice", "lasttradedprice")
    c_curval = find_col(headers, "currentvalue", "curval", "curr.val", "marketvalue")
    c_buyval = find_col(headers, "buyvalue", "investedvalue", "investment")

    if not c_symbol:
        result.error("Could not find a Symbol/Instrument column.")
        return result

    for row in rows:
        symbol = (row.get(c_symbol) or "").strip().upper()
        if not symbol:
            continue
        qty = to_float(row.get(c_qty)) if c_qty else None
        avg = to_float(row.get(c_avg)) if c_avg else None
        ltp = to_float(row.get(c_ltp)) if c_ltp else None
        curval = to_float(row.get(c_curval)) if c_curval else None
        buyval = to_float(row.get(c_buyval)) if c_buyval else None

        if qty is None or qty == 0:
            result.warn(f"Skipped {symbol}: zero/blank quantity.", context=symbol)
            continue

        if curval is None and ltp is not None:
            curval = qty * ltp
        if buyval is None and avg is not None:
            buyval = qty * avg

        result.holdings.append(
            ParsedHolding(
                name=symbol,
                instrument_type=InstrumentType.STOCK,  # refined later (ETF vs stock) by classifier
                isin=(row.get(c_isin) or "").strip().upper() or None if c_isin else None,
                symbol=symbol,
                quantity=qty,
                avg_cost=avg,
                invested_value=buyval,
                current_value=curval,
                last_price=ltp,
                source=Source.ZERODHA_HOLDINGS,
                account_name=account_name,
                account_kind="demat",
                institution="Zerodha",
                sector_hint=(row.get(c_sector) or "").strip() or None if c_sector else None,
                raw=row,
            )
        )

    result.info(f"Parsed {len(result.holdings)} holdings from Zerodha export.")
    return result
