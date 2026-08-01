// Parser contract — TS mirror of backend/app/parsers/base.py.
// Dates are ISO "YYYY-MM-DD" strings throughout (serialize cleanly to the local snapshot).

import { LookthroughRow } from "../classify/engine";

export interface ParsedTxn {
  date: string; // ISO YYYY-MM-DD
  kind: string; // buy | sell | dividend | switch_in | switch_out
  amount: number; // signed: purchase negative (money out), sell/dividend positive
  units?: number | null;
  price?: number | null;
}

export interface ParsedHolding {
  name: string;
  instrument_type: string;
  isin?: string | null;
  symbol?: string | null;
  scheme_code?: string | null;
  quantity: number;
  avg_cost?: number | null;
  invested_value?: number | null;
  current_value?: number | null;
  last_price?: number | null;
  amc?: string | null;
  plan?: string | null;
  folio?: string | null;
  expense_ratio?: number | null;
  source: string;
  account_name: string;
  account_kind: string;
  account_identifier?: string | null;
  institution?: string | null;
  category_hint?: string | null;
  sector_hint?: string | null;
  market_cap_hint?: string | null;
  lookthrough: LookthroughRow[];
  transactions: ParsedTxn[];
  raw: Record<string, any>;
}

export interface Diagnostic {
  level: "info" | "warning" | "error";
  message: string;
  context?: string | null;
}

export class ParseResult {
  source: string;
  file_name: string | null;
  holdings: ParsedHolding[] = [];
  diagnostics: Diagnostic[] = [];

  constructor(source: string, fileName: string | null = null) {
    this.source = source;
    this.file_name = fileName;
  }
  warn(message: string, context: string | null = null) {
    this.diagnostics.push({ level: "warning", message, context });
  }
  info(message: string, context: string | null = null) {
    this.diagnostics.push({ level: "info", message, context });
  }
  error(message: string, context: string | null = null) {
    this.diagnostics.push({ level: "error", message, context });
  }
  hasError(): boolean {
    return this.diagnostics.some((d) => d.level === "error");
  }
}

/** Build a ParsedHolding with the same defaults as the Python model. */
export function holding(p: Partial<ParsedHolding> & { name: string; instrument_type: string; source: string; account_name: string }): ParsedHolding {
  return {
    quantity: 0,
    account_kind: "demat",
    lookthrough: [],
    transactions: [],
    raw: {},
    ...p,
  };
}
