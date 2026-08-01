// Generic CSV template → TS mirror of backend/app/parsers/generic_csv.py.

import { InstrumentType, Source } from "../taxonomy";
import { ParsedTxn, ParseResult, holding } from "./types";
import { findCol, parseDate, round2, sniffRows, toFloat } from "./csv";

const VALID_TYPES = new Set<string>(Object.values(InstrumentType));

export function parseGenericCsv(content: string, fileName: string | null = null, accountName = "Imported"): ParseResult {
  const result = new ParseResult(Source.GENERIC_CSV, fileName);
  const rows = sniffRows(content);
  if (!rows.length) {
    result.error("No data rows found in file.");
    return result;
  }
  const h = Object.keys(rows[0]);
  const cols = {
    name: findCol(h, "name", "instrument", "scheme", "description"),
    type: findCol(h, "type", "instrumenttype", "assettype"),
    isin: findCol(h, "isin"),
    symbol: findCol(h, "symbol", "ticker"),
    scheme_code: findCol(h, "schemecode", "amfi", "amficode"),
    quantity: findCol(h, "quantity", "qty", "units"),
    avg_cost: findCol(h, "avgcost", "averageprice", "avgprice"),
    invested_value: findCol(h, "investedvalue", "invested", "buyvalue", "cost"),
    current_value: findCol(h, "currentvalue", "value", "marketvalue", "amount"),
    amc: findCol(h, "amc", "fundhouse"),
    plan: findCol(h, "plan"),
    folio: findCol(h, "folio"),
    sector: findCol(h, "sector"),
    market_cap: findCol(h, "marketcap", "cap"),
    asset_class: findCol(h, "assetclass", "class"),
    start_date: findCol(h, "startdate", "purchasedate", "investmentdate", "date"),
  };
  if (!cols.name) {
    result.error("Generic CSV needs a 'name' column.");
    return result;
  }
  const g = (row: Record<string, string>, key: string | null) => (key ? (row[key] || "").trim() : "");

  for (const row of rows) {
    const name = g(row, cols.name);
    if (!name) continue;
    const rawType = cols.type ? (row[cols.type] || "").trim().toLowerCase() : "";
    const itype = VALID_TYPES.has(rawType) ? rawType : InstrumentType.OTHER;

    const qty = cols.quantity ? toFloat(row[cols.quantity]) : null;
    const curval = cols.current_value ? toFloat(row[cols.current_value]) : null;
    if (curval === null && qty === null) {
      result.warn(`Skipped ${name}: no quantity or current value.`, name);
      continue;
    }
    const invested = cols.invested_value ? toFloat(row[cols.invested_value]) : null;

    const txns: ParsedTxn[] = [];
    const start = cols.start_date ? parseDate(row[cols.start_date]) : null;
    if (start && invested) txns.push({ date: start, kind: "buy", amount: round2(-invested) });

    result.holdings.push(holding({
      name,
      instrument_type: itype,
      isin: g(row, cols.isin).toUpperCase() || null,
      symbol: g(row, cols.symbol).toUpperCase() || null,
      scheme_code: g(row, cols.scheme_code) || null,
      quantity: qty ?? 1.0,
      avg_cost: cols.avg_cost ? toFloat(row[cols.avg_cost]) : null,
      invested_value: invested,
      current_value: curval,
      amc: g(row, cols.amc) || null,
      plan: g(row, cols.plan).toLowerCase() || null,
      folio: g(row, cols.folio) || null,
      source: Source.GENERIC_CSV,
      account_name: accountName,
      account_kind: "manual",
      sector_hint: g(row, cols.sector) || null,
      market_cap_hint: g(row, cols.market_cap) || null,
      category_hint: g(row, cols.asset_class) || null,
      transactions: txns,
      raw: row,
    }));
  }
  result.info(`Parsed ${result.holdings.length} rows from generic CSV.`);
  return result;
}
