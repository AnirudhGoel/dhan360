// In-memory entity model — TS mirror of the SQLAlchemy tables (backend/app/db/models.py).
// Dates are ISO strings. IDs are numeric auto-increments managed by the Store.

export interface Account {
  id: number;
  name: string;
  kind: string; // demat | mf_folio | manual | nps | bank
  identifier?: string | null;
  institution?: string | null;
}

export interface Instrument {
  id: number;
  name: string;
  instrument_type: string;
  isin?: string | null;
  symbol?: string | null;
  scheme_code?: string | null;
  amc?: string | null;
  plan?: string | null;
  expense_ratio?: number | null;
  extra?: string | null; // JSON blob of source raw
}

export interface Holding {
  id: number;
  account_id: number;
  instrument_id: number;
  quantity: number;
  avg_cost?: number | null;
  invested_value?: number | null;
  current_value?: number | null;
  last_price?: number | null;
  folio?: string | null;
  source: string;
  import_id?: number | null;
}

export interface Classification {
  id: number;
  instrument_id: number;
  asset_class: string;
  sub_class?: string | null;
  sector?: string | null;
  market_cap?: string | null;
  confidence: string;
  is_estimated: boolean;
  rationale?: string | null;
  has_lookthrough: boolean;
}

export interface Lookthrough {
  id: number;
  instrument_id: number;
  holding_name: string;
  holding_isin?: string | null;
  weight: number;
  asset_class: string;
  market_cap?: string | null;
  sector?: string | null;
  is_estimated: boolean;
}

export interface Override {
  id: number;
  key_type: string; // isin | symbol | scheme_code | name
  key_value: string;
  asset_class?: string | null;
  sub_class?: string | null;
  sector?: string | null;
  market_cap?: string | null;
  note?: string | null;
}

export interface ImportBatch {
  id: number;
  source: string;
  file_name?: string | null;
  status: string;
  count_parsed: number;
  count_imported: number;
  count_merged: number;
  count_duplicate: number;
  count_skipped: number;
  count_unclassified: number;
  diagnostics?: string | null;
  created_at: string;
}

export interface Transaction {
  id: number;
  instrument_id: number;
  account_id?: number | null;
  date: string; // ISO YYYY-MM-DD
  kind: string;
  units?: number | null;
  amount: number;
  price?: number | null;
  folio?: string | null;
  source: string;
  import_id?: number | null;
}

export interface Price {
  id: number;
  instrument_id: number;
  date: string;
  close: number;
  source: string;
}

export interface TargetAllocation {
  id: number;
  level: string; // asset_class | sub_class
  bucket: string;
  target_pct: number;
}
