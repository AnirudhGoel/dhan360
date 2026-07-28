"""Regenerate samples/cas.json so units/NAVs are consistent with real AMFI NAV history.

The performance curve and period XIRR use real NAV (via mfapi), so the sample must reconcile:
units = target_current_value / real_nav_today, and invested = units * real_nav_on_buy_date. That
makes the demo's curves reflect these real funds' actual histories. Run once and commit the output:

    cd backend && ../<venv>/bin/python -m scripts.gen_sample_cas
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from app.prices.provider import AmfiNavProvider, _nearest_on_or_before

OUT = Path(__file__).resolve().parents[2] / "samples" / "cas.json"

# (scheme_code, scheme_name, amc, folio, isin, buy_date, target_current_value, coarse_type)
FUNDS = [
    ("122639", "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", "PPFAS Mutual Fund", "10234567/0", "INF879O01027", date(2021, 1, 15), 160000, "EQUITY"),
    ("118989", "HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth", "HDFC Mutual Fund", "991234567", "INF179K01BE2", date(2021, 3, 1), 130000, "EQUITY"),
    ("125354", "Axis Small Cap Fund - Direct Plan - Growth", "Axis Mutual Fund", "880011223", "INF846K01EW2", date(2021, 5, 1), 120000, "EQUITY"),
    ("119598", "Mirae Asset Large & Midcap Fund - Direct Plan - Growth", "Mirae Asset Mutual Fund", "773344556", "INF769K01010", date(2021, 2, 1), 115000, "EQUITY"),
    ("120505", "ICICI Prudential Nifty 50 Index Fund - Direct Plan - Growth", "ICICI Prudential Mutual Fund", "665544332", "INF109K012R6", date(2022, 1, 1), 90000, "EQUITY"),
    ("135781", "ICICI Prudential Corporate Bond Fund - Direct Plan - Growth", "ICICI Prudential Mutual Fund", "665544332", "INF109K01Z48", date(2022, 4, 1), 95000, "DEBT"),
    ("118533", "ICICI Prudential Balanced Advantage Fund - Direct Plan - Growth", "ICICI Prudential Mutual Fund", "665544332", "INF109K01T07", date(2021, 6, 1), 250000, "HYBRID"),
    ("147794", "Motilal Oswal Nasdaq 100 Fund of Fund - Direct Plan - Growth", "Motilal Oswal Mutual Fund", "554433221", "INF247L01AB9", date(2021, 7, 1), 160000, "OTHER"),
    ("119775", "SBI Gold Fund - Direct Plan - Growth", "SBI Mutual Fund", "443322110", "INF200K01T28", date(2021, 8, 1), 100000, "OTHER"),
    ("120053", "Nippon India Liquid Fund - Direct Plan - Growth", "Nippon India Mutual Fund", "332211009", "INF204K01XR2", date(2023, 10, 1), 168000, "DEBT"),
]


def main() -> None:
    provider = AmfiNavProvider()
    today = date.today()
    folios: dict[tuple[str, str], dict] = {}

    for code, name, amc, folio, isin, buy, target, ctype in FUNDS:
        series = provider.series(code)
        cur_nav = _nearest_on_or_before(series, today) if series else None
        buy_nav = _nearest_on_or_before(series, buy) if series else None
        if not cur_nav or not buy_nav:
            print(f"  WARN {code} {name[:30]}: no NAV — using placeholder")
            cur_nav, buy_nav = 100.0, 80.0
        units = round(target / cur_nav, 3)
        invested = round(units * buy_nav, 2)
        scheme = {
            "scheme": name, "isin": isin, "amfi": code, "advisor": "DIRECT", "type": ctype,
            "open": 0, "close": units,
            "valuation": {"date": today.isoformat(), "nav": round(cur_nav, 4), "value": round(units * cur_nav, 2)},
            "transactions": [
                {"date": buy.isoformat(), "amount": invested, "units": units, "type": "PURCHASE"},
            ],
        }
        key = (amc, folio)
        folios.setdefault(key, {"folio": folio, "amc": amc, "schemes": []})
        folios[key]["schemes"].append(scheme)
        print(f"  {code} {name[:34]:34} units={units:>9.2f} buyNAV={buy_nav:.2f} curNAV={cur_nav:.2f} value={round(units*cur_nav)}")

    cas = {
        "_comment": "Anonymized CAS. Units/NAVs reconciled to real AMFI history via scripts/gen_sample_cas.py so the performance curve & XIRR reflect these funds' actual returns. Regenerate to refresh.",
        "statement_period": {"from": "2020-01-01", "to": today.isoformat()},
        "investor_info": {"name": "Sample Investor", "email": "investor@example.com"},
        "folios": list(folios.values()),
    }
    OUT.write_text(json.dumps(cas, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
