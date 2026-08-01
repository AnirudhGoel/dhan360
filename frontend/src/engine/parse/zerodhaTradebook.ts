// Zerodha tradebook CSV → TS mirror of backend/app/parsers/zerodha_tradebook.py.
// Aggregates trades into net open positions + carries dated trades as transactions.

import { InstrumentType, Source } from "../taxonomy";
import { ParsedTxn, ParseResult, holding } from "./types";
import { findCol, parseDate, round2, sniffRows, toFloat } from "./csv";

export function parseZerodhaTradebook(content: string, fileName: string | null = null, accountName = "Zerodha"): ParseResult {
  const result = new ParseResult(Source.ZERODHA_TRADEBOOK, fileName);
  const rows = sniffRows(content);
  if (!rows.length) {
    result.error("No data rows found in file.");
    return result;
  }
  const h = Object.keys(rows[0]);
  const cSymbol = findCol(h, "symbol", "tradingsymbol", "instrument");
  const cIsin = findCol(h, "isin");
  const cType = findCol(h, "tradetype", "type", "buysell", "transactiontype");
  const cQty = findCol(h, "quantity", "qty");
  const cPrice = findCol(h, "price", "tradeprice", "avgprice");
  const cDate = findCol(h, "tradedate", "date", "orderexecutiontime", "orderdate");

  if (!(cSymbol && cType && cQty && cPrice)) {
    result.error("Tradebook missing required columns (symbol/type/quantity/price).");
    return result;
  }

  type Agg = { isin: string | null; net: number; buyQty: number; buyCost: number; txns: ParsedTxn[] };
  const agg = new Map<string, Agg>();
  const get = (s: string): Agg => {
    if (!agg.has(s)) agg.set(s, { isin: null, net: 0, buyQty: 0, buyCost: 0, txns: [] });
    return agg.get(s)!;
  };

  for (const row of rows) {
    const symbol = (row[cSymbol] || "").trim().toUpperCase();
    if (!symbol) continue;
    const qty = toFloat(row[cQty]) || 0;
    const price = toFloat(row[cPrice]) || 0;
    const ttype = (row[cType] || "").trim().toLowerCase();
    const tdate = cDate ? parseDate(row[cDate]) : null;
    const rec = get(symbol);
    if (cIsin && !rec.isin) rec.isin = (row[cIsin] || "").trim().toUpperCase() || null;
    if (ttype.startsWith("b")) {
      rec.net += qty;
      rec.buyQty += qty;
      rec.buyCost += qty * price;
      if (tdate) rec.txns.push({ date: tdate, kind: "buy", amount: round2(-qty * price), units: qty, price });
    } else if (ttype.startsWith("s")) {
      rec.net -= qty;
      if (tdate) rec.txns.push({ date: tdate, kind: "sell", amount: round2(qty * price), units: qty, price });
    }
  }

  for (const [symbol, rec] of agg) {
    const net = Math.round(rec.net * 1e4) / 1e4;
    if (net <= 0) continue;
    const avg = rec.buyQty ? rec.buyCost / rec.buyQty : null;
    const invested = avg ? net * avg : null;
    result.holdings.push(holding({
      name: symbol,
      instrument_type: InstrumentType.STOCK,
      isin: rec.isin,
      symbol,
      quantity: net,
      avg_cost: avg,
      invested_value: invested,
      source: Source.ZERODHA_TRADEBOOK,
      account_name: accountName,
      account_kind: "demat",
      institution: "Zerodha",
      transactions: rec.txns.slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
      raw: { derived_from: "tradebook" },
    }));
  }
  result.info(`Aggregated ${result.holdings.length} open positions from tradebook.`);
  return result;
}
