"""CAS (Consolidated Account Statement) importer from casparser-style JSON.

Accepts the dict produced by the ``casparser`` library (and the equivalent JSON export).
This is the shared core used by both the JSON upload path and the native PDF path.

Reference shape (abridged)::

    {
      "folios": [
        {"folio": "123/45", "amc": "PPFAS Mutual Fund",
         "schemes": [
            {"scheme": "Parag Parikh Flexi Cap - Direct - Growth", "isin": "INF...",
             "amfi": "122639", "advisor": "DIRECT", "type": "EQUITY",
             "close": 1234.5, "valuation": {"nav": 65.4, "value": 80776.5},
             "transactions": [{"amount": 5000.0, ...}]}
         ]}
      ]
    }
"""

from __future__ import annotations

from datetime import date, datetime

from app.domain.taxonomy import InstrumentType, Source
from app.parsers.base import ParsedHolding, ParsedTxn, ParseResult


def _plan_from(advisor: str | None, scheme_name: str) -> str:
    a = (advisor or "").strip().upper()
    if a == "DIRECT" or "direct" in scheme_name.lower():
        return "direct"
    return "regular"


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    # ISO datetime fallback
    try:
        return datetime.fromisoformat(s).date()
    except ValueError:
        return None


def parse_dict(
    data: dict, file_name: str | None = None, source: Source = Source.CAS_JSON
) -> ParseResult:
    result = ParseResult(source=source, file_name=file_name)
    folios = data.get("folios") or []
    if not folios:
        result.error("CAS contains no folios.")
        return result

    for folio in folios:
        amc = folio.get("amc")
        folio_no = folio.get("folio")
        for scheme in folio.get("schemes") or []:
            name = (scheme.get("scheme") or "").strip()
            if not name:
                continue
            close = scheme.get("close")
            try:
                qty = float(close) if close is not None else 0.0
            except (TypeError, ValueError):
                qty = 0.0
            if qty <= 0:
                result.warn(f"Skipped {name}: zero closing balance.", context=folio_no)
                continue

            valuation = scheme.get("valuation") or {}
            cur_val = valuation.get("value")
            nav = valuation.get("nav")

            # Parse transactions once: net invested (CAS sign: purchases +ve, redemptions -ve)
            # AND per-txn XIRR cashflows (investor sign: purchase = money OUT = negative).
            invested = None
            parsed_txns: list[ParsedTxn] = []
            txns = scheme.get("transactions") or []
            if txns:
                total = 0.0
                seen = False
                for t in txns:
                    amt = t.get("amount")
                    if amt is None:
                        continue
                    try:
                        amt = float(amt)
                    except (TypeError, ValueError):
                        continue
                    total += amt
                    seen = True
                    tdate = _parse_date(t.get("date"))
                    if tdate is None:
                        continue
                    ttype = (t.get("type") or "").upper()
                    if "DIVIDEND" in ttype and "PAYOUT" in ttype:
                        kind = "dividend"
                    elif amt >= 0:
                        kind = "buy"
                    else:
                        kind = "sell"
                    units = t.get("units")
                    parsed_txns.append(ParsedTxn(
                        date=tdate,
                        kind=kind,
                        amount=round(-amt, 2),  # investor perspective: purchase negative
                        units=float(units) if units is not None else None,
                    ))
                invested = round(total, 2) if seen else None

            result.holdings.append(
                ParsedHolding(
                    name=name,
                    instrument_type=InstrumentType.MUTUAL_FUND,
                    isin=(scheme.get("isin") or "").strip().upper() or None,
                    scheme_code=str(scheme.get("amfi")).strip() if scheme.get("amfi") else None,
                    quantity=qty,
                    current_value=float(cur_val) if cur_val is not None else None,
                    last_price=float(nav) if nav is not None else None,
                    invested_value=invested,
                    amc=amc,
                    plan=_plan_from(scheme.get("advisor"), name),
                    folio=folio_no,
                    source=source,
                    account_name=amc or "Mutual Funds",
                    account_kind="mf_folio",
                    account_identifier=folio_no,
                    institution=amc,
                    category_hint=scheme.get("type"),  # coarse EQUITY/DEBT/HYBRID hint
                    transactions=parsed_txns,
                    raw={"rta": scheme.get("rta"), "scheme_type": scheme.get("type")},
                )
            )

    result.info(f"Parsed {len(result.holdings)} schemes from CAS.")
    return result
