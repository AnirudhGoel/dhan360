"""Generic CSV template import for unsupported brokers/sources.

Documented columns (header row, case-insensitive; extra columns ignored):
    name, type, isin, symbol, scheme_code, quantity, avg_cost,
    invested_value, current_value, amc, plan, folio, sector, market_cap, asset_class

Only ``name`` and one of (``current_value`` or ``quantity``) are strictly required.
``type`` should be one of the InstrumentType values (stock, etf, mutual_fund, sgb, bond,
gsec, fd, ppf, nps, reit, invit, cash, digital_gold, real_estate, other); defaults to
``other``. ``asset_class`` is an optional explicit override applied during classification.
"""

from __future__ import annotations

from app.domain.taxonomy import InstrumentType, Source
from app.parsers.base import ParsedHolding, ParseResult
from app.parsers.csv_utils import find_col, sniff_rows, to_float

_VALID_TYPES = {t.value for t in InstrumentType}


def parse(content: str, file_name: str | None = None, account_name: str = "Imported") -> ParseResult:
    result = ParseResult(source=Source.GENERIC_CSV, file_name=file_name)
    rows = sniff_rows(content)
    if not rows:
        result.error("No data rows found in file.")
        return result

    h = list(rows[0].keys())
    cols = {
        "name": find_col(h, "name", "instrument", "scheme", "description"),
        "type": find_col(h, "type", "instrumenttype", "assettype"),
        "isin": find_col(h, "isin"),
        "symbol": find_col(h, "symbol", "ticker"),
        "scheme_code": find_col(h, "schemecode", "amfi", "amficode"),
        "quantity": find_col(h, "quantity", "qty", "units"),
        "avg_cost": find_col(h, "avgcost", "averageprice", "avgprice"),
        "invested_value": find_col(h, "investedvalue", "invested", "buyvalue", "cost"),
        "current_value": find_col(h, "currentvalue", "value", "marketvalue", "amount"),
        "amc": find_col(h, "amc", "fundhouse"),
        "plan": find_col(h, "plan"),
        "folio": find_col(h, "folio"),
        "sector": find_col(h, "sector"),
        "market_cap": find_col(h, "marketcap", "cap"),
        "asset_class": find_col(h, "assetclass", "class"),
    }
    if not cols["name"]:
        result.error("Generic CSV needs a 'name' column.")
        return result

    for row in rows:
        name = (row.get(cols["name"]) or "").strip()
        if not name:
            continue
        raw_type = (row.get(cols["type"]) or "").strip().lower() if cols["type"] else ""
        itype = raw_type if raw_type in _VALID_TYPES else InstrumentType.OTHER.value

        qty = to_float(row.get(cols["quantity"])) if cols["quantity"] else None
        curval = to_float(row.get(cols["current_value"])) if cols["current_value"] else None
        if curval is None and qty is None:
            result.warn(f"Skipped {name}: no quantity or current value.", context=name)
            continue

        result.holdings.append(
            ParsedHolding(
                name=name,
                instrument_type=InstrumentType(itype),
                isin=(row.get(cols["isin"]) or "").strip().upper() or None if cols["isin"] else None,
                symbol=(row.get(cols["symbol"]) or "").strip().upper() or None if cols["symbol"] else None,
                scheme_code=(row.get(cols["scheme_code"]) or "").strip() or None if cols["scheme_code"] else None,
                quantity=qty or 1.0,
                avg_cost=to_float(row.get(cols["avg_cost"])) if cols["avg_cost"] else None,
                invested_value=to_float(row.get(cols["invested_value"])) if cols["invested_value"] else None,
                current_value=curval,
                amc=(row.get(cols["amc"]) or "").strip() or None if cols["amc"] else None,
                plan=(row.get(cols["plan"]) or "").strip().lower() or None if cols["plan"] else None,
                folio=(row.get(cols["folio"]) or "").strip() or None if cols["folio"] else None,
                source=Source.GENERIC_CSV,
                account_name=account_name,
                account_kind="manual",
                sector_hint=(row.get(cols["sector"]) or "").strip() or None if cols["sector"] else None,
                market_cap_hint=(row.get(cols["market_cap"]) or "").strip() or None if cols["market_cap"] else None,
                category_hint=(row.get(cols["asset_class"]) or "").strip() or None if cols["asset_class"] else None,
                raw=row,
            )
        )

    result.info(f"Parsed {len(result.holdings)} rows from generic CSV.")
    return result
