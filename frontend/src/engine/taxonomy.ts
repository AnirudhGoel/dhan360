// Canonical classification taxonomy — the TS mirror of backend/app/domain/taxonomy.py.
// String values are the contract the UI renders and the DB/snapshot stores.

export const AssetClass = {
  EQUITY: "Equity",
  DEBT: "Debt",
  GOLD: "Gold",
  CASH: "Cash",
  INTERNATIONAL_EQUITY: "International Equity",
  REAL_ESTATE: "Real Estate",
  OTHERS: "Others",
  UNCLASSIFIED: "Unclassified",
} as const;

export const EquitySubClass = {
  LARGE_CAP: "Large Cap",
  MID_CAP: "Mid Cap",
  SMALL_CAP: "Small Cap",
  MICRO_CAP: "Micro Cap",
  INTERNATIONAL: "International Equity",
  UNCLASSIFIED: "Unclassified",
} as const;

export const DebtSubClass = {
  LIQUID_OVERNIGHT: "Liquid/Overnight",
  SHORT_DURATION: "Short Duration",
  CORPORATE_BOND: "Corporate Bond",
  GILT: "Gilt/G-Sec",
  FD: "FD",
  PPF: "PPF",
  NPS_DEBT: "NPS Debt",
  CASH: "Cash",
  UNCLASSIFIED: "Unclassified",
} as const;

export const GoldSubClass = {
  GOLD_ETF: "Gold ETF",
  GOLD_MF: "Gold Mutual Fund",
  SGB: "SGB",
  DIGITAL_GOLD: "Digital Gold",
  UNCLASSIFIED: "Unclassified",
} as const;

export const InstrumentType = {
  STOCK: "stock",
  ETF: "etf",
  MUTUAL_FUND: "mutual_fund",
  SGB: "sgb",
  BOND: "bond",
  GSEC: "gsec",
  FD: "fd",
  PPF: "ppf",
  EPF: "epf",
  NPS: "nps",
  REIT: "reit",
  INVIT: "invit",
  CASH: "cash",
  REAL_ESTATE: "real_estate",
  DIGITAL_GOLD: "digital_gold",
  OTHER: "other",
} as const;

export const Confidence = {
  MANUAL: "manual",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  ESTIMATED: "estimated",
  NONE: "none",
} as const;

export const Source = {
  ZERODHA_HOLDINGS: "zerodha_holdings",
  ZERODHA_TRADEBOOK: "zerodha_tradebook",
  CAS_PDF: "cas_pdf",
  CAS_EMAIL: "cas_email",
  CAS_JSON: "cas_json",
  DEMAT_CAS: "demat_cas",
  GENERIC_CSV: "generic_csv",
  MANUAL: "manual",
} as const;

export const EQUITY_CAP_ORDER = [
  EquitySubClass.LARGE_CAP,
  EquitySubClass.MID_CAP,
  EquitySubClass.SMALL_CAP,
  EquitySubClass.MICRO_CAP,
  EquitySubClass.INTERNATIONAL,
  EquitySubClass.UNCLASSIFIED,
];

export const ASSET_CLASS_ORDER = [
  AssetClass.EQUITY,
  AssetClass.INTERNATIONAL_EQUITY,
  AssetClass.DEBT,
  AssetClass.GOLD,
  AssetClass.REAL_ESTATE,
  AssetClass.CASH,
  AssetClass.OTHERS,
  AssetClass.UNCLASSIFIED,
];
