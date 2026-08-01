// Historical price import — populates the store's price cache so direct-equity PERIOD XIRR and
// performance work without a live feed. Any source (a Kite export, NSE bhavcopy, a broker report)
// can produce this CSV: columns `symbol` or `isin`, `date`, and `close`/`price`/`nav`.

import { Store } from "../store/store";
import { findCol, parseDate, sniffRows, toFloat } from "../parse/csv";
import { ParseResult } from "../parse/types";
import { Source } from "../taxonomy";

export function importPriceCsv(store: Store, content: string, fileName: string | null = null): ParseResult {
  const result = new ParseResult("prices_csv", fileName);
  const rows = sniffRows(content);
  if (!rows.length) {
    result.error("No data rows found in file.");
    return result;
  }
  const h = Object.keys(rows[0]);
  const cSymbol = findCol(h, "symbol", "ticker", "tradingsymbol");
  const cIsin = findCol(h, "isin");
  const cDate = findCol(h, "date", "tradedate");
  const cClose = findCol(h, "close", "closeprice", "price", "nav", "ltp");
  if (!cDate || !cClose || !(cSymbol || cIsin)) {
    result.error("Price CSV needs date, close, and symbol or isin columns.");
    return result;
  }

  // Index instruments by symbol/isin for matching.
  const bySymbol = new Map<string, number>();
  const byIsin = new Map<string, number>();
  for (const inst of store.instruments) {
    if (inst.symbol) bySymbol.set(inst.symbol.toUpperCase(), inst.id);
    if (inst.isin) byIsin.set(inst.isin.toUpperCase(), inst.id);
  }

  let added = 0;
  let unmatched = 0;
  for (const row of rows) {
    const sym = cSymbol ? (row[cSymbol] || "").trim().toUpperCase() : "";
    const isin = cIsin ? (row[cIsin] || "").trim().toUpperCase() : "";
    const instId = (isin && byIsin.get(isin)) || (sym && bySymbol.get(sym)) || null;
    const date = parseDate(row[cDate]);
    const close = toFloat(row[cClose]);
    if (!instId || !date || close === null) {
      if (!instId) unmatched++;
      continue;
    }
    const existing = store.prices.find((p) => p.instrument_id === instId && p.date === date);
    if (existing) existing.close = close;
    else {
      store.prices.push({ id: store.nextId("prices"), instrument_id: instId, date, close, source: "import" });
      added++;
    }
  }

  const batch = {
    id: store.nextId("imports"), source: Source.GENERIC_CSV, file_name: fileName,
    status: "completed", count_parsed: rows.length, count_imported: added, count_merged: 0,
    count_duplicate: 0, count_skipped: unmatched, count_unclassified: 0,
    diagnostics: JSON.stringify(result.diagnostics), created_at: new Date().toISOString(),
  };
  // Prices don't create an import batch in the normal sense, but record it for the history screen.
  store.imports.push({ ...batch, source: "prices_csv" });
  result.info(`Imported ${added} price points (${unmatched} rows unmatched to a holding).`);
  return result;
}
