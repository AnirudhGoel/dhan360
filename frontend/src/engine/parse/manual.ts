// Manual asset entry → TS mirror of backend/app/parsers/manual.py.

import { InstrumentType, Source } from "../taxonomy";
import { ParsedTxn, ParseResult, holding } from "./types";
import { round2 } from "./csv";

export interface ManualEntry {
  name: string;
  instrument_type: string;
  current_value: number;
  invested_value?: number | null;
  quantity?: number;
  isin?: string | null;
  symbol?: string | null;
  account_name?: string;
  institution?: string | null;
  sector?: string | null;
  market_cap?: string | null;
  asset_class?: string | null;
  start_date?: string | null; // ISO YYYY-MM-DD
  note?: string | null;
}

export function parseManualEntries(entries: ManualEntry[], fileName: string | null = "manual-entry"): ParseResult {
  const result = new ParseResult(Source.MANUAL, fileName);
  for (const e of entries) {
    const kind = e.instrument_type === InstrumentType.FD || e.instrument_type === InstrumentType.CASH ? "bank" : "manual";
    const invested = e.invested_value != null ? e.invested_value : e.current_value;
    const txns: ParsedTxn[] = [];
    if (e.start_date && invested) txns.push({ date: e.start_date, kind: "buy", amount: round2(-invested) });
    result.holdings.push(holding({
      name: e.name,
      instrument_type: e.instrument_type,
      isin: (e.isin || "").toUpperCase() || null,
      symbol: (e.symbol || "").toUpperCase() || null,
      quantity: e.quantity ?? 1.0,
      current_value: e.current_value,
      invested_value: invested,
      source: Source.MANUAL,
      account_name: e.account_name ?? "Manual",
      account_kind: kind,
      institution: e.institution ?? null,
      sector_hint: e.sector ?? null,
      market_cap_hint: e.market_cap ?? null,
      category_hint: e.asset_class ?? null,
      transactions: txns,
      raw: e.note ? { note: e.note } : {},
    }));
  }
  result.info(`Added ${result.holdings.length} manual entries.`);
  return result;
}
