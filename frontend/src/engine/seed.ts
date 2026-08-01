// Client-side seed — mirrors backend/scripts/seed.py. Imports the 3 sample files through the
// real pipeline, injects a disclosed fund look-through + direct-equity transactions + targets.

import holdingsCsv from "./sample/zerodha_holdings.csv?raw";
import manualCsv from "./sample/manual_assets.csv?raw";
import cas from "./sample/cas.json";
import { Store } from "./store/store";
import { processParseResult } from "./pipeline/importService";
import { reclassifyAll } from "./pipeline/classifyService";
import { parseZerodhaHoldings } from "./parse/zerodhaHoldings";
import { parseGenericCsv } from "./parse/genericCsv";
import { parseCasJson } from "./parse/casJson";

const PPFAS_DISCLOSED: [string, string | null, number, string, string | null, string | null][] = [
  ["HDFC Bank", "INE040A01034", 0.08, "Equity", "Large Cap", "Financial Services"],
  ["ICICI Bank", "INE090A01021", 0.06, "Equity", "Large Cap", "Financial Services"],
  ["Bajaj Finance", "INE296A01024", 0.05, "Equity", "Large Cap", "Financial Services"],
  ["ITC", "INE154A01025", 0.05, "Equity", "Large Cap", "FMCG"],
  ["Infosys", "INE009A01021", 0.05, "Equity", "Large Cap", "Information Technology"],
  ["Coal India", "INE522F01014", 0.04, "Equity", "Large Cap", "Energy"],
  ["Power Grid Corp", "INE752E01010", 0.04, "Equity", "Large Cap", "Power"],
  ["Alphabet Inc", null, 0.07, "International Equity", "International Equity", "Information Technology"],
  ["Microsoft Corp", null, 0.06, "International Equity", "International Equity", "Information Technology"],
  ["Amazon.com Inc", null, 0.05, "International Equity", "International Equity", "Consumer Services"],
  ["Meta Platforms", null, 0.04, "International Equity", "International Equity", "Information Technology"],
  ["Cash & Equivalents", null, 0.20, "Cash", null, null],
];

const DEFAULT_TARGETS: Record<string, number> = {
  Equity: 45, "International Equity": 10, Debt: 25, Gold: 10, "Real Estate": 5, Cash: 5,
};

const BUY_DATES = ["2021-07-01", "2022-02-15", "2022-09-01", "2023-01-10", "2023-06-01"];

export function seedSampleData(store: Store): void {
  store.clear();
  processParseResult(store, parseZerodhaHoldings(holdingsCsv, "zerodha_holdings.csv", "Zerodha Demat"));
  processParseResult(store, parseCasJson(cas as any, "cas.json"));
  processParseResult(store, parseGenericCsv(manualCsv, "manual_assets.csv", "Manual Assets"));

  // Disclosed look-through for Parag Parikh Flexi Cap (AMFI 122639).
  const ppfas = store.instruments.find((i) => i.scheme_code === "122639");
  if (ppfas) {
    for (const [name, isin, weight, ac, cap, sector] of PPFAS_DISCLOSED) {
      store.lookthrough.push({
        id: store.nextId("lookthrough"), instrument_id: ppfas.id, holding_name: name,
        holding_isin: isin, weight, asset_class: ac, market_cap: cap, sector, is_estimated: false,
      });
    }
  }

  // Inject dated buys for direct stocks/ETFs (the holdings CSV is a snapshot with no history).
  let i = 0;
  for (const h of store.holdings) {
    const inst = store.instrument(h.instrument_id)!;
    if ((inst.instrument_type === "stock" || inst.instrument_type === "etf") && h.invested_value) {
      store.transactions.push({
        id: store.nextId("transactions"), instrument_id: inst.id, account_id: h.account_id,
        date: BUY_DATES[i % BUY_DATES.length], kind: "buy", units: h.quantity,
        amount: Math.round(-h.invested_value * 100) / 100, price: h.avg_cost ?? null, source: "zerodha_tradebook",
      });
      i++;
    }
  }

  for (const [bucket, pct] of Object.entries(DEFAULT_TARGETS)) {
    store.targets.push({ id: store.nextId("target_allocation"), level: "asset_class", bucket, target_pct: pct });
  }

  reclassifyAll(store);
}
