"""Canonical classification taxonomy shared by the engine, API and UI.

Keeping these as plain string enums (str-backed) means they serialize cleanly to JSON
and can be compared directly against DB-stored strings. The exact bucket names here are
the contract the frontend renders, so change them deliberately.
"""

from __future__ import annotations

from enum import Enum


class AssetClass(str, Enum):
    EQUITY = "Equity"
    DEBT = "Debt"
    GOLD = "Gold"
    CASH = "Cash"
    INTERNATIONAL_EQUITY = "International Equity"
    REAL_ESTATE = "Real Estate"  # REITs / InvITs / property
    OTHERS = "Others"
    UNCLASSIFIED = "Unclassified"


class EquitySubClass(str, Enum):
    LARGE_CAP = "Large Cap"
    MID_CAP = "Mid Cap"
    SMALL_CAP = "Small Cap"
    MICRO_CAP = "Micro Cap"
    INTERNATIONAL = "International Equity"
    UNCLASSIFIED = "Unclassified"


class DebtSubClass(str, Enum):
    LIQUID_OVERNIGHT = "Liquid/Overnight"
    SHORT_DURATION = "Short Duration"
    CORPORATE_BOND = "Corporate Bond"
    GILT = "Gilt/G-Sec"
    FD = "FD"
    PPF = "PPF"
    NPS_DEBT = "NPS Debt"
    CASH = "Cash"
    UNCLASSIFIED = "Unclassified"


class GoldSubClass(str, Enum):
    GOLD_ETF = "Gold ETF"
    GOLD_MF = "Gold Mutual Fund"
    SGB = "SGB"
    DIGITAL_GOLD = "Digital Gold"
    UNCLASSIFIED = "Unclassified"


class InstrumentType(str, Enum):
    STOCK = "stock"
    ETF = "etf"
    MUTUAL_FUND = "mutual_fund"
    SGB = "sgb"
    BOND = "bond"
    GSEC = "gsec"
    FD = "fd"
    PPF = "ppf"
    EPF = "epf"
    NPS = "nps"
    REIT = "reit"
    INVIT = "invit"
    CASH = "cash"
    REAL_ESTATE = "real_estate"
    DIGITAL_GOLD = "digital_gold"
    OTHER = "other"


class Confidence(str, Enum):
    """How much we trust a classification, surfaced transparently in the UI."""

    MANUAL = "manual"   # user override — treat as ground truth
    HIGH = "high"       # exact ref-data match (ISIN/scheme/AMFI category)
    MEDIUM = "medium"   # name/category heuristics
    LOW = "low"         # weak guess
    ESTIMATED = "estimated"  # derived (e.g. category-based look-through), not disclosed
    NONE = "none"       # could not classify


class Source(str, Enum):
    ZERODHA_HOLDINGS = "zerodha_holdings"
    ZERODHA_TRADEBOOK = "zerodha_tradebook"
    CAS_PDF = "cas_pdf"
    CAS_JSON = "cas_json"
    GENERIC_CSV = "generic_csv"
    MANUAL = "manual"


# Equity cap buckets ordered large -> small for stable UI ordering.
EQUITY_CAP_ORDER = [
    EquitySubClass.LARGE_CAP,
    EquitySubClass.MID_CAP,
    EquitySubClass.SMALL_CAP,
    EquitySubClass.MICRO_CAP,
    EquitySubClass.INTERNATIONAL,
    EquitySubClass.UNCLASSIFIED,
]

ASSET_CLASS_ORDER = [
    AssetClass.EQUITY,
    AssetClass.INTERNATIONAL_EQUITY,
    AssetClass.DEBT,
    AssetClass.GOLD,
    AssetClass.REAL_ESTATE,
    AssetClass.CASH,
    AssetClass.OTHERS,
    AssetClass.UNCLASSIFIED,
]
