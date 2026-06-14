"""Config & admin endpoints: overrides, target allocation, taxonomy, rebalance, reclassify, reset."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.database import get_session
from app.db.models import Override, TargetAllocation
from app.domain.taxonomy import (
    ASSET_CLASS_ORDER,
    AssetClass,
    DebtSubClass,
    EquitySubClass,
    GoldSubClass,
    InstrumentType,
)
from app.portfolio.rebalance import rebalance_plan
from app.services.classification_service import reclassify_all

router = APIRouter(prefix="/api", tags=["config"])


# ---- taxonomy ---------------------------------------------------------------------

@router.get("/taxonomy")
def taxonomy() -> dict:
    return {
        "asset_classes": [a.value for a in ASSET_CLASS_ORDER],
        "equity_caps": [e.value for e in EquitySubClass],
        "debt_sub_classes": [d.value for d in DebtSubClass],
        "gold_sub_classes": [g.value for g in GoldSubClass],
        "instrument_types": [t.value for t in InstrumentType],
    }


# ---- overrides --------------------------------------------------------------------

class OverrideIn(BaseModel):
    key_type: str  # isin | symbol | scheme_code | name
    key_value: str
    asset_class: str | None = None
    sub_class: str | None = None
    sector: str | None = None
    market_cap: str | None = None
    note: str | None = None


def _serialize_override(o: Override) -> dict:
    return {
        "id": o.id, "key_type": o.key_type, "key_value": o.key_value,
        "asset_class": o.asset_class, "sub_class": o.sub_class, "sector": o.sector,
        "market_cap": o.market_cap, "note": o.note,
    }


@router.get("/overrides")
def list_overrides(db: Session = Depends(get_session)) -> list[dict]:
    return [_serialize_override(o) for o in db.scalars(select(Override)).all()]


@router.post("/overrides")
def create_override(body: OverrideIn, db: Session = Depends(get_session)) -> dict:
    if body.key_type not in ("isin", "symbol", "scheme_code", "name"):
        raise HTTPException(400, "key_type must be one of isin|symbol|scheme_code|name")
    existing = db.scalar(
        select(Override).where(
            Override.key_type == body.key_type, Override.key_value == body.key_value
        )
    )
    o = existing or Override(key_type=body.key_type, key_value=body.key_value)
    o.asset_class = body.asset_class
    o.sub_class = body.sub_class
    o.sector = body.sector
    o.market_cap = body.market_cap
    o.note = body.note
    if not existing:
        db.add(o)
    db.flush()
    reclassify_all(db)  # remembered rule applied everywhere immediately
    db.commit()
    return _serialize_override(o)


@router.delete("/overrides/{override_id}")
def delete_override(override_id: int, db: Session = Depends(get_session)) -> dict:
    db.execute(delete(Override).where(Override.id == override_id))
    reclassify_all(db)
    db.commit()
    return {"deleted": override_id}


# ---- target allocation ------------------------------------------------------------

class TargetIn(BaseModel):
    bucket: str
    target_pct: float


@router.get("/targets")
def get_targets(db: Session = Depends(get_session)) -> dict:
    rows = db.scalars(
        select(TargetAllocation).where(TargetAllocation.level == "asset_class")
    ).all()
    targets = [{"bucket": r.bucket, "target_pct": r.target_pct} for r in rows]
    return {"targets": targets, "sum": round(sum(t["target_pct"] for t in targets), 2)}


@router.put("/targets")
def set_targets(targets: list[TargetIn], db: Session = Depends(get_session)) -> dict:
    db.execute(delete(TargetAllocation).where(TargetAllocation.level == "asset_class"))
    for t in targets:
        if t.target_pct < 0:
            raise HTTPException(400, "target_pct cannot be negative")
        db.add(TargetAllocation(level="asset_class", bucket=t.bucket, target_pct=t.target_pct))
    db.commit()
    return get_targets(db)


# ---- rebalance --------------------------------------------------------------------

@router.get("/rebalance")
def get_rebalance(
    mode: str = "rebalance", new_money: float = 0.0, db: Session = Depends(get_session)
) -> dict:
    if mode not in ("rebalance", "new_money"):
        raise HTTPException(400, "mode must be 'rebalance' or 'new_money'")
    return rebalance_plan(db, mode=mode, new_money=new_money)


# ---- admin ------------------------------------------------------------------------

@router.post("/admin/reclassify")
def admin_reclassify(db: Session = Depends(get_session)) -> dict:
    n = reclassify_all(db)
    db.commit()
    return {"reclassified": n}


@router.post("/admin/seed")
def admin_seed() -> dict:
    from scripts.seed import seed
    seed()
    return {"status": "seeded"}


@router.post("/admin/reset")
def admin_reset() -> dict:
    from scripts.reset import reset
    reset()
    return {"status": "reset"}
