"""Name-based heuristics — the medium/low-confidence fallback when there's no exact
ref-data match. Ordered most-specific-first; the first hit wins.

Each rule returns (asset_class, sub_class, sector_or_None). These are intentionally
conservative: when in doubt we return None so the engine marks it Unclassified rather
than guessing 'Equity' and overstating equity exposure.
"""

from __future__ import annotations

from app.domain.taxonomy import AssetClass, DebtSubClass, EquitySubClass, GoldSubClass

# (keywords, asset_class, sub_class) — checked in order.
_RULES: list[tuple[tuple[str, ...], str, str | None]] = [
    # Gold / precious metals
    (("gold",), AssetClass.GOLD.value, GoldSubClass.GOLD_ETF.value),
    (("sovereign gold", "sgb"), AssetClass.GOLD.value, GoldSubClass.SGB.value),
    (("silver",), AssetClass.OTHERS.value, "Silver"),

    # International — must precede generic equity matches
    (("nasdaq", "fang", "s&p 500", "sp 500", "s & p 500"), AssetClass.INTERNATIONAL_EQUITY.value, EquitySubClass.INTERNATIONAL.value),
    (("us equity", "u.s.", "global", "international", "overseas", "hang seng", "china", "emerging market", "world"), AssetClass.INTERNATIONAL_EQUITY.value, EquitySubClass.INTERNATIONAL.value),

    # Debt
    (("liquid", "overnight", "money market"), AssetClass.DEBT.value, DebtSubClass.LIQUID_OVERNIGHT.value),
    (("gilt", "g-sec", "gsec", "g sec", "government securities"), AssetClass.DEBT.value, DebtSubClass.GILT.value),
    (("bharat bond", "corporate bond", "banking & psu", "banking and psu", "psu bond", "credit risk"), AssetClass.DEBT.value, DebtSubClass.CORPORATE_BOND.value),
    (("ultra short", "low duration", "short duration", "short term", "money manager"), AssetClass.DEBT.value, DebtSubClass.SHORT_DURATION.value),
    (("bond", "debt", "duration", "income fund", "fixed maturity", "fmp"), AssetClass.DEBT.value, DebtSubClass.UNCLASSIFIED.value),

    # Real estate
    (("reit", "invit", "real estate", "realty"), AssetClass.REAL_ESTATE.value, None),

    # Equity caps
    (("small cap", "smallcap"), AssetClass.EQUITY.value, EquitySubClass.SMALL_CAP.value),
    (("mid cap", "midcap", "midcap 150", "nifty next 50"), AssetClass.EQUITY.value, EquitySubClass.MID_CAP.value),
    (("large & mid", "large and mid"), AssetClass.EQUITY.value, EquitySubClass.LARGE_CAP.value),
    (("large cap", "largecap", "nifty 50", "nifty50", "sensex", "top 100", "bluechip"), AssetClass.EQUITY.value, EquitySubClass.LARGE_CAP.value),
    (("flexi cap", "flexicap", "multi cap", "multicap", "focused", "elss", "tax saver", "value", "contra", "dividend yield", "index"), AssetClass.EQUITY.value, EquitySubClass.LARGE_CAP.value),
    (("equity", "nifty", "etf"), AssetClass.EQUITY.value, EquitySubClass.UNCLASSIFIED.value),
]


def classify_by_name(name: str) -> tuple[str, str | None, str | None] | None:
    """Return (asset_class, sub_class, sector) or None if nothing matched."""
    n = name.lower()
    for keywords, asset_class, sub_class in _RULES:
        if any(k in n for k in keywords):
            return asset_class, sub_class, None
    return None
