"""Rebalancing: compare current vs target asset allocation, compute drift and suggested moves.

Two modes:
  * ``rebalance``  — assumes you can buy AND sell to hit targets exactly.
  * ``new_money``  — only deploy fresh money into underweight buckets (no selling), which is
                     how most retail investors actually rebalance and avoids tax/exit-load events.

This produces *informational* drift math and generic, non-personalized tax/exit-load reminders.
It is explicitly NOT financial advice.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import TargetAllocation
from app.domain.taxonomy import ASSET_CLASS_ORDER, AssetClass
from app.portfolio.aggregate import summary

# Generic, non-personalized reminders surfaced when a bucket would be trimmed.
_SELL_WARNINGS = {
    AssetClass.EQUITY.value: "Equity/equity-fund sales: LTCG (>1yr) taxed 12.5% above ₹1.25L/yr; "
                             "STCG (<1yr) at 20%. Equity funds may levy ~1% exit load if <1yr.",
    AssetClass.INTERNATIONAL_EQUITY.value: "International funds are taxed like debt/non-equity for "
                             "many schemes — confirm the scheme's tax treatment and holding period.",
    AssetClass.DEBT.value: "Debt fund gains are taxed at your slab rate (post-Apr-2023 units). "
                           "Check exit load on short-duration/credit funds.",
    AssetClass.GOLD.value: "Gold funds/ETFs: gains taxable; SGBs are illiquid before maturity and "
                           "best redeemed at the RBI window/exchange.",
}


def _targets(db: Session) -> dict[str, float]:
    rows = db.scalars(
        select(TargetAllocation).where(TargetAllocation.level == "asset_class")
    ).all()
    return {r.bucket: r.target_pct for r in rows}


def rebalance_plan(db: Session, mode: str = "rebalance", new_money: float = 0.0) -> dict:
    s = summary(db)
    net_worth = s["net_worth"]
    current_by_class = {d["label"]: d for d in s["asset_allocation"]}
    targets = _targets(db)

    buckets = list(dict.fromkeys(
        [a.value for a in ASSET_CLASS_ORDER]
        + list(current_by_class.keys())
        + list(targets.keys())
    ))

    new_total = net_worth + (new_money if mode == "new_money" else 0.0)
    lines = []
    for bucket in buckets:
        cur = current_by_class.get(bucket)
        cur_value = cur["value"] if cur else 0.0
        cur_pct = cur["pct"] if cur else 0.0
        target_pct = targets.get(bucket)
        if target_pct is None and cur_value == 0:
            continue

        target_pct = target_pct or 0.0
        target_value = round(target_pct / 100 * new_total, 2)
        drift_pct = round(cur_pct - target_pct, 2)
        drift_value = round(cur_value - target_value, 2)

        if mode == "new_money":
            # Only top up underweight buckets; never suggest selling.
            suggested = round(max(0.0, target_value - cur_value), 2)
            action = "buy" if suggested > 0 else "hold"
            amount = suggested
        else:
            action = "sell" if drift_value > 0 else ("buy" if drift_value < 0 else "hold")
            amount = round(abs(drift_value), 2)

        warnings = []
        if action == "sell":
            w = _SELL_WARNINGS.get(bucket)
            if w:
                warnings.append(w)

        lines.append({
            "bucket": bucket,
            "current_value": round(cur_value, 2),
            "current_pct": round(cur_pct, 2),
            "target_pct": round(target_pct, 2),
            "target_value": target_value,
            "drift_pct": drift_pct,
            "drift_value": drift_value,
            "action": action,
            "amount": amount,
            "status": "overweight" if drift_value > 1 else ("underweight" if drift_value < -1 else "on target"),
            "warnings": warnings,
        })

    # In new-money mode, scale buys so they sum to the injected amount (proportional to need).
    if mode == "new_money" and new_money > 0:
        total_buy = sum(l["amount"] for l in lines if l["action"] == "buy")
        if total_buy > 0:
            scale = new_money / total_buy
            for l in lines:
                if l["action"] == "buy":
                    l["amount"] = round(l["amount"] * scale, 2)

    has_targets = bool(targets)
    return {
        "mode": mode,
        "new_money": new_money,
        "net_worth": net_worth,
        "has_targets": has_targets,
        "targets_sum": round(sum(targets.values()), 2),
        "lines": lines,
        "disclaimer": "Informational drift analysis only — not personalized investment advice. "
                      "Verify tax, holding period and exit loads before acting.",
    }
