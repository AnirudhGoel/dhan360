"""SQLAlchemy ORM models — the normalized internal portfolio model.

The design deliberately separates:
  * ``Instrument``   — the *thing* you can own (master record, deduped by ISIN/scheme/symbol)
  * ``Classification`` — how we bucket an instrument (asset class, cap, sector, look-through)
  * ``Holding``      — *your* position in an instrument from a given source account

This separation is what lets two sources (e.g. a Zerodha CSV and a CAS PDF) reconcile onto
one instrument, and lets a user override classification once and have it stick everywhere.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Account(Base):
    """A source account: a Zerodha demat, an MF folio, or 'manual'."""

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(50))  # demat | mf_folio | manual | nps | bank
    identifier: Mapped[str | None] = mapped_column(String(200), nullable=True)  # masked demat/folio
    institution: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Zerodha, HDFC AMC...
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    holdings: Mapped[list["Holding"]] = relationship(back_populates="account")

    __table_args__ = (UniqueConstraint("kind", "identifier", name="uq_account_kind_identifier"),)


class Instrument(Base):
    """A master record for an ownable thing, deduped across sources."""

    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(300))
    instrument_type: Mapped[str] = mapped_column(String(40))  # InstrumentType value

    # Identity keys — any subset may be present depending on source.
    isin: Mapped[str | None] = mapped_column(String(20), index=True, nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(50), index=True, nullable=True)  # NSE/BSE ticker
    scheme_code: Mapped[str | None] = mapped_column(String(20), index=True, nullable=True)  # AMFI code

    amc: Mapped[str | None] = mapped_column(String(200), nullable=True)
    plan: Mapped[str | None] = mapped_column(String(20), nullable=True)  # direct | regular
    expense_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    extra: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON blob for source-specifics

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    holdings: Mapped[list["Holding"]] = relationship(back_populates="instrument")
    classification: Mapped["Classification | None"] = relationship(
        back_populates="instrument", uselist=False, cascade="all, delete-orphan"
    )
    lookthrough: Mapped[list["Lookthrough"]] = relationship(
        back_populates="instrument", cascade="all, delete-orphan"
    )


class Holding(Base):
    """A position in an instrument held in a specific account."""

    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"))

    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    avg_cost: Mapped[float | None] = mapped_column(Float, nullable=True)  # per unit
    invested_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_price: Mapped[float | None] = mapped_column(Float, nullable=True)

    folio: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source: Mapped[str] = mapped_column(String(40))  # Source value
    import_id: Mapped[int | None] = mapped_column(ForeignKey("imports.id"), nullable=True)
    as_of: Mapped[datetime] = mapped_column(DateTime, default=_now)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    account: Mapped["Account"] = relationship(back_populates="holdings")
    instrument: Mapped["Instrument"] = relationship(back_populates="holdings")


class Classification(Base):
    """How an instrument is bucketed. One per instrument; overrides win."""

    __tablename__ = "classifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), unique=True)

    asset_class: Mapped[str] = mapped_column(String(40))      # AssetClass
    sub_class: Mapped[str | None] = mapped_column(String(40), nullable=True)  # cap/debt/gold sub-bucket
    sector: Mapped[str | None] = mapped_column(String(80), nullable=True)
    market_cap: Mapped[str | None] = mapped_column(String(40), nullable=True)  # for equities

    confidence: Mapped[str] = mapped_column(String(20))  # Confidence
    is_estimated: Mapped[bool] = mapped_column(default=False)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)  # human-readable "why"
    has_lookthrough: Mapped[bool] = mapped_column(default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    instrument: Mapped["Instrument"] = relationship(back_populates="classification")


class Lookthrough(Base):
    """Underlying holding of a mutual fund / fund-of-funds (portfolio disclosure)."""

    __tablename__ = "lookthrough"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"))  # the fund

    holding_name: Mapped[str] = mapped_column(String(300))
    holding_isin: Mapped[str | None] = mapped_column(String(20), index=True, nullable=True)
    weight: Mapped[float] = mapped_column(Float)  # fraction 0..1 of the fund
    asset_class: Mapped[str] = mapped_column(String(40))  # equity/debt/cash/...
    market_cap: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(80), nullable=True)
    is_estimated: Mapped[bool] = mapped_column(default=True)  # False = disclosed portfolio

    instrument: Mapped["Instrument"] = relationship(back_populates="lookthrough")


class Override(Base):
    """A remembered user classification rule, keyed by an identity field.

    Applied during (re)classification so the user only has to correct a thing once.
    """

    __tablename__ = "overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key_type: Mapped[str] = mapped_column(String(20))  # isin | symbol | scheme_code | name
    key_value: Mapped[str] = mapped_column(String(300), index=True)

    asset_class: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sub_class: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(80), nullable=True)
    market_cap: Mapped[str | None] = mapped_column(String(40), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    __table_args__ = (UniqueConstraint("key_type", "key_value", name="uq_override_key"),)


class ImportBatch(Base):
    """One upload/import event, with reconciliation counts for the history screen."""

    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(40))  # Source
    file_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="completed")  # completed | failed

    count_parsed: Mapped[int] = mapped_column(Integer, default=0)
    count_imported: Mapped[int] = mapped_column(Integer, default=0)
    count_merged: Mapped[int] = mapped_column(Integer, default=0)   # reconciled into existing
    count_duplicate: Mapped[int] = mapped_column(Integer, default=0)
    count_skipped: Mapped[int] = mapped_column(Integer, default=0)
    count_unclassified: Mapped[int] = mapped_column(Integer, default=0)

    diagnostics: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list of messages
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class TargetAllocation(Base):
    """User-defined target allocation, by asset class (and optional sub-class)."""

    __tablename__ = "target_allocation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    level: Mapped[str] = mapped_column(String(20), default="asset_class")  # asset_class | sub_class
    bucket: Mapped[str] = mapped_column(String(60))  # e.g. "Equity" or "Equity:Mid Cap"
    target_pct: Mapped[float] = mapped_column(Float)  # 0..100

    __table_args__ = (UniqueConstraint("level", "bucket", name="uq_target_bucket"),)


class Setting(Base):
    """Simple key/value settings store."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
