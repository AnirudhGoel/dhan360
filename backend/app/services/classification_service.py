"""Persist classification for an instrument, honouring disclosed look-through and overrides."""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classify.engine import ClassifyInput, classify
from app.classify.overrides import OverrideIndex
from app.db.models import Classification, Instrument, Lookthrough, Override


def load_override_index(db: Session) -> OverrideIndex:
    return OverrideIndex.from_rows(db.scalars(select(Override)).all())


def _build_input(instrument: Instrument) -> ClassifyInput:
    category_hint = None
    if instrument.extra:
        try:
            extra = json.loads(instrument.extra)
            category_hint = extra.get("scheme_type") or extra.get("category")
        except (ValueError, TypeError):
            pass
    return ClassifyInput(
        name=instrument.name,
        instrument_type=instrument.instrument_type,
        isin=instrument.isin,
        symbol=instrument.symbol,
        scheme_code=instrument.scheme_code,
        amc=instrument.amc,
        plan=instrument.plan,
        category_hint=category_hint,
    )


def classify_instrument(db: Session, instrument: Instrument, index: OverrideIndex) -> Classification:
    inp = _build_input(instrument)
    override = index.match(
        isin=instrument.isin, symbol=instrument.symbol,
        scheme_code=instrument.scheme_code, name=instrument.name,
    )
    result = classify(inp, override)

    # The engine may correct the instrument type (e.g. a "stock" row that's really an ETF).
    if result.refined_type and instrument.instrument_type != result.refined_type:
        instrument.instrument_type = result.refined_type

    # Disclosed look-through (seeded or future parser) always wins over the modelled split.
    disclosed = [lt for lt in instrument.lookthrough if not lt.is_estimated]
    if disclosed:
        has_lookthrough = True
        is_estimated = False
    else:
        # Replace any previously-modelled rows with the fresh estimate.
        for lt in [lt for lt in instrument.lookthrough if lt.is_estimated]:
            db.delete(lt)
        for row in result.lookthrough:
            db.add(Lookthrough(
                instrument_id=instrument.id,
                holding_name=row.holding_name,
                holding_isin=row.holding_isin,
                weight=row.weight,
                asset_class=row.asset_class,
                market_cap=row.market_cap,
                sector=row.sector,
                is_estimated=True,
            ))
        has_lookthrough = bool(result.lookthrough)
        is_estimated = result.is_estimated

    existing = db.scalar(
        select(Classification).where(Classification.instrument_id == instrument.id)
    )
    if existing is None:
        existing = Classification(instrument_id=instrument.id)
        db.add(existing)

    existing.asset_class = result.asset_class
    existing.sub_class = result.sub_class
    existing.sector = result.sector
    existing.market_cap = result.market_cap
    existing.confidence = result.confidence
    existing.is_estimated = is_estimated
    existing.rationale = result.rationale
    existing.has_lookthrough = has_lookthrough
    return existing


def reclassify_all(db: Session) -> int:
    """Re-run classification for every instrument (e.g. after an override change)."""
    index = load_override_index(db)
    instruments = db.scalars(select(Instrument)).all()
    for inst in instruments:
        classify_instrument(db, inst, index)
    db.flush()
    return len(instruments)
