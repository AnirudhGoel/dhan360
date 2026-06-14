"""The classification engine.

Pipeline (highest authority first):
  1. User override (manual confidence) — keyed by isin/symbol/scheme_code/name.
  2. Explicit asset-class hint from the source (e.g. generic-CSV column, manual entry).
  3. Exact ref-data match (stock list, ETF map, AMFI scheme -> category) — high confidence.
  4. Name heuristics — medium/low confidence.
  5. Give up gracefully -> Unclassified (never silently default to Equity).

For mutual funds we additionally build *estimated* look-through rows from the category's
modelled split when no actual portfolio disclosure exists, so a flexi-cap fund contributes
partially to large/mid/small rather than being one opaque blob. These rows are flagged
estimated and shown as such in the UI.

The engine is pure and DB-free: callers resolve the override dict and pass it in.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.classify.heuristics import classify_by_name
from app.domain.taxonomy import (
    AssetClass,
    Confidence,
    DebtSubClass,
    EquitySubClass,
    GoldSubClass,
    InstrumentType,
)
from app.refdata import loader

_ASSET_CLASS_VALUES = {a.value.lower(): a.value for a in AssetClass}


@dataclass
class ClassifyInput:
    name: str
    instrument_type: str  # InstrumentType value
    isin: str | None = None
    symbol: str | None = None
    scheme_code: str | None = None
    amc: str | None = None
    plan: str | None = None
    category_hint: str | None = None
    sector_hint: str | None = None
    market_cap_hint: str | None = None


@dataclass
class LookthroughRow:
    holding_name: str
    weight: float
    asset_class: str
    market_cap: str | None = None
    sector: str | None = None
    holding_isin: str | None = None


@dataclass
class ClassificationResult:
    asset_class: str
    sub_class: str | None
    market_cap: str | None
    sector: str | None
    confidence: str
    is_estimated: bool
    rationale: str
    refined_type: str | None = None  # engine may correct instrument_type (e.g. STOCK->ETF)
    lookthrough: list[LookthroughRow] = field(default_factory=list)


def _explicit_asset_class(hint: str | None) -> str | None:
    if not hint:
        return None
    return _ASSET_CLASS_VALUES.get(hint.strip().lower())


def _apply_override(base: ClassificationResult, override: dict) -> ClassificationResult:
    return ClassificationResult(
        asset_class=override.get("asset_class") or base.asset_class,
        sub_class=override.get("sub_class") if override.get("sub_class") is not None else base.sub_class,
        market_cap=override.get("market_cap") if override.get("market_cap") is not None else base.market_cap,
        sector=override.get("sector") if override.get("sector") is not None else base.sector,
        confidence=Confidence.MANUAL.value,
        is_estimated=False,
        rationale="User override applied.",
        refined_type=base.refined_type,
        lookthrough=base.lookthrough,
    )


def _classify_stock(inp: ClassifyInput) -> ClassificationResult:
    ref = loader.lookup_stock(symbol=inp.symbol, isin=inp.isin)
    if ref:
        return ClassificationResult(
            asset_class=AssetClass.EQUITY.value,
            sub_class=ref.get("market_cap"),
            market_cap=ref.get("market_cap"),
            sector=ref.get("sector") or inp.sector_hint,
            confidence=Confidence.HIGH.value,
            is_estimated=False,
            rationale=f"Matched direct-equity reference for {ref.get('symbol', inp.symbol)}.",
        )
    # Unknown stock: it IS equity, but we don't know the cap — be honest.
    return ClassificationResult(
        asset_class=AssetClass.EQUITY.value,
        sub_class=inp.market_cap_hint or EquitySubClass.UNCLASSIFIED.value,
        market_cap=inp.market_cap_hint or EquitySubClass.UNCLASSIFIED.value,
        sector=inp.sector_hint,
        confidence=Confidence.MEDIUM.value,
        is_estimated=False,
        rationale="Direct equity (not in reference list); market cap unknown.",
    )


def _classify_etf(inp: ClassifyInput) -> ClassificationResult:
    ref = loader.lookup_etf(inp.symbol)
    if ref:
        return ClassificationResult(
            asset_class=ref["asset_class"],
            sub_class=ref.get("sub_class"),
            market_cap=ref.get("sub_class") if ref["asset_class"] == AssetClass.EQUITY.value else None,
            sector=ref.get("sector"),
            confidence=Confidence.HIGH.value,
            is_estimated=False,
            rationale=f"Matched known ETF '{ref['name']}'.",
            refined_type=InstrumentType.ETF.value,
        )
    guess = classify_by_name(inp.name)
    if guess:
        ac, sub, sector = guess
        return ClassificationResult(
            asset_class=ac,
            sub_class=sub,
            market_cap=sub if ac == AssetClass.EQUITY.value else None,
            sector=sector or inp.sector_hint,
            confidence=Confidence.MEDIUM.value,
            is_estimated=False,
            rationale="ETF classified from name keywords (not in ETF map).",
            refined_type=InstrumentType.ETF.value,
        )
    return ClassificationResult(
        asset_class=AssetClass.EQUITY.value,
        sub_class=EquitySubClass.UNCLASSIFIED.value,
        market_cap=EquitySubClass.UNCLASSIFIED.value,
        sector=None,
        confidence=Confidence.LOW.value,
        is_estimated=True,
        rationale="Unknown ETF; assumed equity with unknown cap.",
        refined_type=InstrumentType.ETF.value,
    )


def _build_mf_lookthrough(record: dict) -> list[LookthroughRow]:
    """Estimated look-through from a category's modelled split."""
    rows: list[LookthroughRow] = []
    asset_split = record.get("asset_split")
    equity_split = record.get("equity_split")

    if asset_split:
        for asset_class, w in asset_split.items():
            if asset_class == AssetClass.EQUITY.value and equity_split:
                for cap, cw in equity_split.items():
                    rows.append(LookthroughRow(
                        holding_name=f"Equity ({cap}) — estimated",
                        weight=round(w * cw, 4),
                        asset_class=AssetClass.EQUITY.value,
                        market_cap=cap,
                    ))
            else:
                rows.append(LookthroughRow(
                    holding_name=f"{asset_class} — estimated",
                    weight=round(w, 4),
                    asset_class=asset_class,
                ))
    elif equity_split:
        for cap, cw in equity_split.items():
            rows.append(LookthroughRow(
                holding_name=f"Equity ({cap}) — estimated",
                weight=round(cw, 4),
                asset_class=AssetClass.EQUITY.value,
                market_cap=cap,
            ))
    return rows


def _classify_mf(inp: ClassifyInput) -> ClassificationResult:
    # 1. AMFI scheme code -> category (most reliable)
    category = None
    confidence = Confidence.MEDIUM.value
    scheme = loader.lookup_scheme(inp.scheme_code)
    if scheme:
        category = scheme.get("category")
        confidence = Confidence.HIGH.value

    match = loader.match_mf_category(category or inp.category_hint, inp.name)
    if match:
        cat_name, record = match
        lookthrough = _build_mf_lookthrough(record)
        return ClassificationResult(
            asset_class=record["asset_class"],
            sub_class=record.get("sub_class"),
            market_cap=record.get("sub_class") if record["asset_class"] == AssetClass.EQUITY.value else None,
            sector=None,
            confidence=confidence,
            is_estimated=bool(lookthrough),  # split is modelled, not disclosed
            rationale=f"Mapped to SEBI category '{cat_name}'"
            + (f" via AMFI code {inp.scheme_code}." if scheme else " by name/category."),
            lookthrough=lookthrough,
        )

    # 2. Coarse CAS type hint (EQUITY/DEBT/HYBRID/OTHER)
    coarse = (inp.category_hint or "").strip().upper()
    if coarse in ("EQUITY", "DEBT", "HYBRID", "OTHER"):
        ac = {
            "EQUITY": AssetClass.EQUITY.value,
            "DEBT": AssetClass.DEBT.value,
            "HYBRID": AssetClass.EQUITY.value,
            "OTHER": AssetClass.OTHERS.value,
        }[coarse]
        return ClassificationResult(
            asset_class=ac,
            sub_class=EquitySubClass.UNCLASSIFIED.value if ac == AssetClass.EQUITY.value else DebtSubClass.UNCLASSIFIED.value,
            market_cap=EquitySubClass.UNCLASSIFIED.value if ac == AssetClass.EQUITY.value else None,
            sector=None,
            confidence=Confidence.LOW.value,
            is_estimated=True,
            rationale=f"Coarse CAS scheme type '{coarse}'; sub-classification unknown.",
        )

    # 3. Name heuristics
    guess = classify_by_name(inp.name)
    if guess:
        ac, sub, sector = guess
        return ClassificationResult(
            asset_class=ac,
            sub_class=sub,
            market_cap=sub if ac == AssetClass.EQUITY.value else None,
            sector=sector,
            confidence=Confidence.LOW.value,
            is_estimated=True,
            rationale="Mutual fund classified from name keywords.",
        )

    return ClassificationResult(
        asset_class=AssetClass.UNCLASSIFIED.value,
        sub_class=None,
        market_cap=None,
        sector=None,
        confidence=Confidence.NONE.value,
        is_estimated=True,
        rationale="Could not classify this mutual fund from available data.",
    )


# Simple instrument-type -> fixed bucket mappings.
_FIXED: dict[str, tuple[str, str | None]] = {
    InstrumentType.SGB.value: (AssetClass.GOLD.value, GoldSubClass.SGB.value),
    InstrumentType.DIGITAL_GOLD.value: (AssetClass.GOLD.value, GoldSubClass.DIGITAL_GOLD.value),
    InstrumentType.GSEC.value: (AssetClass.DEBT.value, DebtSubClass.GILT.value),
    InstrumentType.BOND.value: (AssetClass.DEBT.value, DebtSubClass.CORPORATE_BOND.value),
    InstrumentType.FD.value: (AssetClass.DEBT.value, DebtSubClass.FD.value),
    InstrumentType.PPF.value: (AssetClass.DEBT.value, DebtSubClass.PPF.value),
    InstrumentType.EPF.value: (AssetClass.DEBT.value, DebtSubClass.PPF.value),
    InstrumentType.NPS.value: (AssetClass.DEBT.value, DebtSubClass.NPS_DEBT.value),
    InstrumentType.CASH.value: (AssetClass.CASH.value, DebtSubClass.CASH.value),
    InstrumentType.REIT.value: (AssetClass.REAL_ESTATE.value, "REIT"),
    InstrumentType.INVIT.value: (AssetClass.REAL_ESTATE.value, "InvIT"),
    InstrumentType.REAL_ESTATE.value: (AssetClass.REAL_ESTATE.value, "Property"),
}


def _looks_like_etf(inp: ClassifyInput) -> bool:
    """Brokers export ETFs in the same holdings table as stocks (type 'stock'). Detect them
    so a gold/debt/international ETF isn't mistaken for an equity share."""
    if loader.lookup_etf(inp.symbol):
        return True
    sym = (inp.symbol or "").upper()
    if sym.endswith("BEES") or sym.endswith("ETF"):
        return True
    return "ETF" in inp.name.upper()


def classify(inp: ClassifyInput, override: dict | None = None) -> ClassificationResult:
    itype = inp.instrument_type

    # Promote mis-typed ETFs (declared as 'stock') before dispatch.
    if itype == InstrumentType.STOCK.value and _looks_like_etf(inp):
        itype = InstrumentType.ETF.value

    if itype == InstrumentType.STOCK.value:
        base = _classify_stock(inp)
    elif itype == InstrumentType.ETF.value:
        base = _classify_etf(inp)
    elif itype == InstrumentType.MUTUAL_FUND.value:
        base = _classify_mf(inp)
    elif itype in _FIXED:
        ac, sub = _FIXED[itype]
        base = ClassificationResult(
            asset_class=ac, sub_class=sub, market_cap=None, sector=inp.sector_hint,
            confidence=Confidence.HIGH.value, is_estimated=False,
            rationale=f"Fixed mapping for instrument type '{itype}'.",
        )
    else:  # OTHER / unknown
        base = ClassificationResult(
            asset_class=AssetClass.OTHERS.value, sub_class=None, market_cap=None,
            sector=inp.sector_hint, confidence=Confidence.LOW.value, is_estimated=False,
            rationale=f"Uncategorized instrument type '{itype}'.",
        )

    # An explicit asset-class hint (from a generic CSV column or manual entry) overrides the
    # heuristic asset class when the user/source stated one and we couldn't do better.
    explicit = _explicit_asset_class(inp.category_hint)
    if explicit and base.confidence in (Confidence.LOW.value, Confidence.NONE.value, Confidence.MEDIUM.value):
        base.asset_class = explicit
        base.rationale = f"Asset class set from source hint '{explicit}'. " + base.rationale
        base.confidence = Confidence.MEDIUM.value

    if override:
        return _apply_override(base, override)
    return base
