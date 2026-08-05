"""Orchestrates an import: parse result -> reconcile -> classify -> persist, with counts.

This is the single funnel every source flows through, so the reconciliation/classification
behaviour is identical regardless of which parser produced the holdings.
"""

from __future__ import annotations

import json

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.models import Account, Holding, ImportBatch, Instrument, Transaction
from app.domain.taxonomy import AssetClass, Source
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


def _prune_unbacked_tradebook_holdings(db: Session) -> int:
    """Remove tradebook-derived positions that a priced snapshot doesn't confirm.

    A tradebook's "net open position" is only reliable with complete trade history; when a real
    holdings snapshot (Zerodha holdings / CAS) exists for an account, IT is the ground truth for
    what's currently held. Unconfirmed tradebook positions (sold, transferred out, or skewed by a
    split/bonus) must not inflate net worth. Tradebook-only accounts keep their positions.
    """
    priced_accounts = {
        h.account_id for h in db.query(Holding).filter(Holding.current_value.isnot(None)).all()
    }
    if not priced_accounts:
        return 0
    unbacked = db.query(Holding).filter(
        Holding.source == Source.ZERODHA_TRADEBOOK.value,
        Holding.current_value.is_(None),
        Holding.account_id.in_(priced_accounts),
    ).all()
    for h in unbacked:
        db.delete(h)
    return len(unbacked)


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

    diagnostics = [d.model_dump() for d in result.diagnostics]
    db.flush()  # ensure all just-added holdings are visible to the prune query below
    pruned = _prune_unbacked_tradebook_holdings(db)
    if pruned > 0:
        diagnostics.append({
            "level": "info",
            "message": (
                f"Excluded {pruned} tradebook position(s) not present in your current holdings — "
                "likely sold, transferred out, or affected by a split/bonus. Their trades are kept "
                "for history; they don't count toward net worth."
            ),
            "context": None,
        })
    batch.diagnostics = json.dumps(diagnostics)

    db.flush()
    return batch
