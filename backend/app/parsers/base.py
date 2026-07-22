"""Parser contract: the normalized shape every import adapter produces."""

from __future__ import annotations

from datetime import date as date_cls

from pydantic import BaseModel, Field

from app.domain.taxonomy import InstrumentType, Source


class ParsedLookthrough(BaseModel):
    holding_name: str
    holding_isin: str | None = None
    weight: float  # fraction 0..1
    asset_class: str = "Equity"
    market_cap: str | None = None
    sector: str | None = None


class ParsedTxn(BaseModel):
    """A dated cashflow tied to the holding it belongs to (for XIRR).

    ``amount`` is signed from the investor's perspective: purchase negative (out),
    sell/redemption/dividend positive (in).
    """

    date: date_cls
    kind: str  # buy | sell | dividend | switch_in | switch_out
    amount: float
    units: float | None = None
    price: float | None = None


class ParsedHolding(BaseModel):
    """One normalized position coming out of a parser, before reconcile/classify."""

    name: str
    instrument_type: InstrumentType

    isin: str | None = None
    symbol: str | None = None
    scheme_code: str | None = None

    quantity: float = 0.0
    avg_cost: float | None = None
    invested_value: float | None = None
    current_value: float | None = None
    last_price: float | None = None

    amc: str | None = None
    plan: str | None = None  # direct | regular
    folio: str | None = None
    expense_ratio: float | None = None

    # Account/source identity
    source: Source
    account_name: str
    account_kind: str = "demat"  # demat | mf_folio | manual | nps | bank
    account_identifier: str | None = None
    institution: str | None = None

    # Hints the parser can pass to the classifier (e.g. CAS scheme category)
    category_hint: str | None = None
    sector_hint: str | None = None
    market_cap_hint: str | None = None

    lookthrough: list[ParsedLookthrough] = Field(default_factory=list)
    transactions: list[ParsedTxn] = Field(default_factory=list)
    raw: dict = Field(default_factory=dict)


class Diagnostic(BaseModel):
    level: str  # info | warning | error
    message: str
    context: str | None = None


class ParseResult(BaseModel):
    source: Source
    file_name: str | None = None
    holdings: list[ParsedHolding] = Field(default_factory=list)
    diagnostics: list[Diagnostic] = Field(default_factory=list)

    def warn(self, message: str, context: str | None = None) -> None:
        self.diagnostics.append(Diagnostic(level="warning", message=message, context=context))

    def info(self, message: str, context: str | None = None) -> None:
        self.diagnostics.append(Diagnostic(level="info", message=message, context=context))

    def error(self, message: str, context: str | None = None) -> None:
        self.diagnostics.append(Diagnostic(level="error", message=message, context=context))
