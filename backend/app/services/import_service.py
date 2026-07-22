"""Orchestrates an import: parse result -> reconcile -> classify -> persist, with counts.

This is the single funnel every source flows through, so the reconciliation/classification
behaviour is identical regardless of which parser produced the holdings.
"""

from __future__ import annotations

import json

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.models import Account, ImportBatch, Instrument, Transaction
from app.domain.taxonomy import AssetClass
from app.parsers.base import ParsedHolding, ParseResult
from app.reconcile.reconciler import (
    find_or_create_account,
    find_or_create_instrument,
    upsert_holding,
)
from app.services.classification_service import classify_instrument, load_override_index


def _persist_transactions(
    db: Session, account: Account, instrument: Instrument, h: ParsedHolding, import_id: int
) -> None:
    """Store dated cashflows for XIRR. Idempotent: re-importing the same source for this
    instrument+account replaces the prior set rather than duplicating it."""
    if not h.transactions:
        return
    db.execute(
        delete(Transaction).where(
            Transaction.instrument_id == instrument.id,
            Transaction.account_id == account.id,
            Transaction.source == h.source.value,
        )
    )
    for t in h.transactions:
        db.add(Transaction(
            instrument_id=instrument.id,
            account_id=account.id,
            date=t.date,
            kind=t.kind,
            units=t.units,
            amount=t.amount,
            price=t.price,
            folio=h.folio,
            source=h.source.value,
            import_id=import_id,
        ))


def process_parse_result(db: Session, result: ParseResult) -> ImportBatch:
    batch = ImportBatch(
        source=result.source.value,
        file_name=result.file_name,
        status="completed" if not any(d.level == "error" for d in result.diagnostics) else "failed",
        count_parsed=len(result.holdings),
    )
    db.add(batch)
    db.flush()

    index = load_override_index(db)
    imported = merged = duplicate = unclassified = 0
    skipped = sum(1 for d in result.diagnostics if "Skipped" in d.message)

    for h in result.holdings:
        account = find_or_create_account(db, h)
        instrument, existed = find_or_create_instrument(db, h)
        outcome = upsert_holding(db, account, instrument, h, import_id=batch.id)

        if outcome == "duplicate":
            duplicate += 1
        else:
            imported += 1
            if existed:
                merged += 1  # new position reconciled onto a pre-existing instrument

        _persist_transactions(db, account, instrument, h, import_id=batch.id)

        classification = classify_instrument(db, instrument, index)
        if classification.asset_class == AssetClass.UNCLASSIFIED.value:
            unclassified += 1

    batch.count_imported = imported
    batch.count_merged = merged
    batch.count_duplicate = duplicate
    batch.count_skipped = skipped
    batch.count_unclassified = unclassified
    batch.diagnostics = json.dumps([d.model_dump() for d in result.diagnostics])

    db.flush()
    return batch
