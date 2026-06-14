"""Holdings table view with click-to-filter support.

The key subtlety: filtering by 'Mid Cap' or a sector must include mutual funds that contribute
to that bucket *through look-through*, not just instruments whose headline classification matches.
So each holding is tagged with every asset class / cap / sub-class / sector it touches (via its
exposures), and we filter on those tags. When a filter is active we also return the holding's
contribution to that specific bucket.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict

from sqlalchemy.orm import Session

from app.domain.taxonomy import AssetClass
from app.portfolio.aggregate import _cap_label, build_exposures, build_holding_rows

_EQUITY_CLASSES = {AssetClass.EQUITY.value, AssetClass.INTERNATIONAL_EQUITY.value}


def holdings_payload(
    db: Session,
    asset_class: str | None = None,
    cap: str | None = None,
    sub_class: str | None = None,
    sector: str | None = None,
    source: str | None = None,
    account: str | None = None,
) -> list[dict]:
    rows = {r.id: r for r in build_holding_rows(db)}
    by_holding: dict[int, list] = defaultdict(list)
    for e in build_exposures(db):
        by_holding[e.holding_id].append(e)

    out: list[dict] = []
    for hid, r in rows.items():
        exps = by_holding.get(hid, [])

        tags_ac = {e.asset_class for e in exps} or {r.asset_class}
        tags_cap = {_cap_label(e) for e in exps if e.asset_class in _EQUITY_CLASSES}
        if r.market_cap:
            tags_cap.add(r.market_cap)
        tags_sub = {e.sub_class for e in exps if e.sub_class}
        if r.sub_class:
            tags_sub.add(r.sub_class)
        tags_sector = {e.sector for e in exps if e.sector}
        if r.sector:
            tags_sector.add(r.sector)

        if asset_class and asset_class not in tags_ac:
            continue
        if cap and cap not in tags_cap:
            continue
        if sub_class and sub_class not in tags_sub and sub_class not in tags_cap:
            continue
        if sector and sector not in tags_sector:
            continue
        if source and r.source != source:
            continue
        if account and r.account != account:
            continue

        contribution = None
        if cap:
            contribution = sum(e.value for e in exps if e.asset_class in _EQUITY_CLASSES and _cap_label(e) == cap)
        elif sector:
            contribution = sum(e.value for e in exps if e.sector == sector)
        elif sub_class:
            contribution = sum(e.value for e in exps if e.sub_class == sub_class)
        elif asset_class:
            contribution = sum(e.value for e in exps if e.asset_class == asset_class)

        d = asdict(r)
        d["contribution"] = round(contribution, 2) if contribution is not None else None
        out.append(d)

    out.sort(key=lambda d: d["current_value"], reverse=True)
    return out
