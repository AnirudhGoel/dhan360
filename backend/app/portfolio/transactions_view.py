"""Flat, sortable view of every stored cashflow for the Transactions page."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Account, Classification, Instrument, Transaction


def transactions_payload(db: Session) -> dict:
    stmt = (
        select(Transaction, Instrument, Account, Classification)
        .join(Instrument, Transaction.instrument_id == Instrument.id)
        .outerjoin(Account, Transaction.account_id == Account.id)
        .outerjoin(Classification, Classification.instrument_id == Instrument.id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
    )
    rows = []
    total_in = total_out = 0.0
    for t, inst, acct, cls in db.execute(stmt).all():
        if t.amount < 0:
            total_out += -t.amount
        else:
            total_in += t.amount
        rows.append({
            "id": t.id,
            "date": t.date.isoformat(),
            "instrument": inst.name,
            "symbol": inst.symbol or inst.scheme_code or inst.isin,
            "instrument_type": inst.instrument_type,
            "asset_class": cls.asset_class if cls else "Unclassified",
            "kind": t.kind,
            "units": t.units,
            "amount": round(t.amount, 2),
            "direction": "out" if t.amount < 0 else "in",
            "price": t.price,
            "account": acct.name if acct else None,
            "source": t.source,
        })
    return {
        "transactions": rows,
        "count": len(rows),
        "total_invested_out": round(total_out, 2),
        "total_in": round(total_in, 2),
    }
