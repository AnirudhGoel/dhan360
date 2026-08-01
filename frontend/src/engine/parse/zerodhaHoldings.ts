// Zerodha holdings CSV → TS mirror of backend/app/parsers/zerodha_holdings.py.

import { InstrumentType, Source } from "../taxonomy";
import { ParseResult, holding } from "./types";
import { findCol, sniffRows, toFloat } from "./csv";

export function parseZerodhaHoldings(content: string, fileName: string | null = null, accountName = "Zerodha"): ParseResult {
  const result = new ParseResult(Source.ZERODHA_HOLDINGS, fileName);
  const rows = sniffRows(content);
  if (!rows.length) {
    result.error("No data rows found in file.");
    return result;
  }
  const h = Object.keys(rows[0]);
  const cSymbol = findCol(h, "symbol", "instrument", "tradingsymbol");
  const cIsin = findCol(h, "isin");
  const cSector = findCol(h, "sector");
  const cQty = findCol(h, "quantityavailable", "qty", "quantity", "qty.");
  const cAvg = findCol(h, "averageprice", "avgcost", "avg.cost", "avgprice", "buyaverage");
  const cLtp = findCol(h, "ltp", "lastprice", "previousclosingprice", "closingprice", "lasttradedprice");
  const cCurval = findCol(h, "currentvalue", "curval", "curr.val", "marketvalue");
  const cBuyval = findCol(h, "buyvalue", "investedvalue", "investment");

  if (!cSymbol) {
    result.error("Could not find a Symbol/Instrument column.");
    return result;
  }

  for (const row of rows) {
    const symbol = (row[cSymbol] || "").trim().toUpperCase();
    if (!symbol) continue;
    const qty = cQty ? toFloat(row[cQty]) : null;
    const avg = cAvg ? toFloat(row[cAvg]) : null;
    const ltp = cLtp ? toFloat(row[cLtp]) : null;
    let curval = cCurval ? toFloat(row[cCurval]) : null;
    let buyval = cBuyval ? toFloat(row[cBuyval]) : null;

    if (qty === null || qty === 0) {
      result.warn(`Skipped ${symbol}: zero/blank quantity.`, symbol);
      continue;
    }
    if (curval === null && ltp !== null) curval = qty * ltp;
    if (buyval === null && avg !== null) buyval = qty * avg;

    result.holdings.push(holding({
      name: symbol,
      instrument_type: InstrumentType.STOCK,
      isin: cIsin ? (row[cIsin] || "").trim().toUpperCase() || null : null,
      symbol,
      quantity: qty,
      avg_cost: avg,
      invested_value: buyval,
      current_value: curval,
      last_price: ltp,
      source: Source.ZERODHA_HOLDINGS,
      account_name: accountName,
      account_kind: "demat",
      institution: "Zerodha",
      sector_hint: cSector ? (row[cSector] || "").trim() || null : null,
      raw: row,
    }));
  }
  result.info(`Parsed ${result.holdings.length} holdings from Zerodha export.`);
  return result;
}
