"""Reconciliation: map a parsed holding onto the normalized account/instrument model,
deduplicating instruments across sources by identity strength (ISIN > scheme > symbol > name+type).
"""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Account, Holding, Instrument
from app.parsers.base import ParsedHolding


def find_or_create_account(db: Session, h: ParsedHolding) -> Account:
    identifier = h.account_identifier
    stmt = select(Account)
    if identifier:
        acct = db.scalar(stmt.where(Account.kind == h.account_kind, Account.identifier == identifier))
    else:
        acct = db.scalar(stmt.where(Account.kind == h.account_kind, Account.name == h.account_name))
    if acct:
        return acct
    acct = Account(
        name=h.account_name, kind=h.account_kind,
        identifier=identifier, institution=h.institution,
    )
    db.add(acct)
    db.flush()
    return acct


def find_instrument(db: Session, h: ParsedHolding) -> Instrument | None:
    """Locate an existing instrument by identity strength."""
    if h.isin:
        inst = db.scalar(select(Instrument).where(Instrument.isin == h.isin))
        if inst:
            return inst
    if h.scheme_code:
        inst = db.scalar(select(Instrument).where(Instrument.scheme_code == h.scheme_code))
        if inst:
            return inst
    if h.symbol:
        inst = db.scalar(select(Instrument).where(Instrument.symbol == h.symbol))
        if inst:
            return inst
    # Last resort: same name + type (covers manual entries without identity keys).
    return db.scalar(
        select(Instrument).where(
            Instrument.name == h.name,
            Instrument.instrument_type == h.instrument_type.value,
        )
    )


def find_or_create_instrument(db: Session, h: ParsedHolding) -> tuple[Instrument, bool]:
    """Return (instrument, existed). Backfills missing identity keys on an existing record."""
    inst = find_instrument(db, h)
    if inst:
        # Enrich the master record with any newly-seen identity keys.
        if not inst.isin and h.isin:
            inst.isin = h.isin
        if not inst.symbol and h.symbol:
            inst.symbol = h.symbol
        if not inst.scheme_code and h.scheme_code:
            inst.scheme_code = h.scheme_code
        if not inst.amc and h.amc:
            inst.amc = h.amc
        if not inst.plan and h.plan:
            inst.plan = h.plan
        return inst, True

    inst = Instrument(
        name=h.name,
        instrument_type=h.instrument_type.value,
        isin=h.isin,
        symbol=h.symbol,
        scheme_code=h.scheme_code,
        amc=h.amc,
        plan=h.plan,
        expense_ratio=h.expense_ratio,
        extra=json.dumps(h.raw) if h.raw else None,
    )
    db.add(inst)
    db.flush()
    return inst, False


def upsert_holding(
    db: Session, account: Account, instrument: Instrument, h: ParsedHolding, import_id: int | None
) -> str:
    """Create or update a holding. Returns 'created' | 'duplicate'.

    A holding is unique per (account, instrument, source). Re-importing the same source
    refreshes values in place (duplicate); a different source/account becomes a new holding.
    """
    existing = db.scalar(
        select(Holding).where(
            Holding.account_id == account.id,
            Holding.instrument_id == instrument.id,
            Holding.source == h.source.value,
        )
    )
    if existing:
        existing.quantity = h.quantity
        existing.avg_cost = h.avg_cost
        existing.invested_value = h.invested_value
        existing.current_value = h.current_value
        existing.last_price = h.last_price
        existing.folio = h.folio
        existing.import_id = import_id
        return "duplicate"

    db.add(Holding(
        account_id=account.id,
        instrument_id=instrument.id,
        quantity=h.quantity,
        avg_cost=h.avg_cost,
        invested_value=h.invested_value,
        current_value=h.current_value,
        last_price=h.last_price,
        folio=h.folio,
        source=h.source.value,
        import_id=import_id,
    ))
    return "created"
