"""Orchestrates an import: parse result -> reconcile -> classify -> persist, with counts.

This is the single funnel every source flows through, so the reconciliation/classification
behaviour is identical regardless of which parser produced the holdings.
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.db.models import ImportBatch
from app.domain.taxonomy import AssetClass
from app.parsers.base import ParseResult
from app.reconcile.reconciler import (
    find_or_create_account,
    find_or_create_instrument,
    upsert_holding,
)
from app.services.classification_service import classify_instrument, load_override_index


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
