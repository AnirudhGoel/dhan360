import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "../store/store";
import { processParseResult } from "../pipeline/importService";
import { parseZerodhaHoldings } from "../parse/zerodhaHoldings";
import { parseZerodhaTradebook } from "../parse/zerodhaTradebook";
import { parseGenericCsv } from "../parse/genericCsv";
import { parseCasJson } from "../parse/casJson";
import { summary } from "./aggregate";

// Golden reference captured from the Python backend for the same 3 sample files (no seed injections).
const sample = (f: string) => readFileSync(resolve(process.cwd(), "..", "samples", f), "utf-8");

function pct(slices: { label: string; pct: number }[]): Record<string, number> {
  return Object.fromEntries(slices.map((s) => [s.label, s.pct]));
}

describe("full pipeline parity vs Python", () => {
  const store = new Store();
  processParseResult(store, parseZerodhaHoldings(sample("zerodha_holdings.csv")));
  processParseResult(store, parseCasJson(JSON.parse(sample("cas.json"))));
  processParseResult(store, parseGenericCsv(sample("manual_assets.csv")));
  const s = summary(store);

  it("totals match", () => {
    expect(s.net_worth).toBeCloseTo(6060949.68, 0);
    expect(s.invested).toBeCloseTo(4477763.07, 0);
    expect(s.holdings_count).toBe(35);
  });

  it("asset allocation matches", () => {
    const a = pct(s.asset_allocation);
    expect(a["Equity"]).toBeCloseTo(24.44, 1);
    expect(a["International Equity"]).toBeCloseTo(3.25, 1);
    expect(a["Debt"]).toBeCloseTo(60.25, 1);
    expect(a["Gold"]).toBeCloseTo(6.57, 1);
    expect(a["Real Estate"]).toBeCloseTo(1.98, 1);
    expect(a["Cash"]).toBeCloseTo(3.51, 1);
  });

  it("equity cap split matches (incl. fund look-through)", () => {
    const c = pct(s.equity_cap_split);
    expect(c["Large Cap"]).toBeCloseTo(52.09, 1);
    expect(c["Mid Cap"]).toBeCloseTo(23.93, 1);
    expect(c["Small Cap"]).toBeCloseTo(12.25, 1);
    expect(c["International Equity"]).toBeCloseTo(11.73, 1);
  });

  it("gold + debt splits match", () => {
    const g = pct(s.gold_split);
    expect(g["SGB"]).toBeCloseTo(55.28, 1);
    expect(g["Gold ETF"]).toBeCloseTo(8.29, 1);
    const d = pct(s.debt_split);
    expect(d["PPF"]).toBeCloseTo(42.99, 1);
    expect(d["Corporate Bond"]).toBeCloseTo(12.29, 1);
  });
});

describe("holdings + tradebook for the same stock are one position, not double-counted", () => {
  // Holdings: RELIANCE 10 @ 2950.5 = 29,505 market value.
  const HOLDINGS = `Symbol,ISIN,Quantity Available,Average Price,Previous Closing Price
RELIANCE,INE002A01018,10,2400,2950.5
`;
  // Tradebook: the same 10 shares, invested cost 24,000. No market price in a tradebook.
  const TRADEBOOK = `symbol,isin,trade_type,quantity,price,trade_date,trade_id
RELIANCE,INE002A01018,buy,10,2400,2023-01-01,T1
`;

  it("net worth = market value regardless of import order", () => {
    for (const order of [["h", "t"], ["t", "h"]] as const) {
      const store = new Store();
      for (const step of order) {
        if (step === "h") processParseResult(store, parseZerodhaHoldings(HOLDINGS));
        else processParseResult(store, parseZerodhaTradebook(TRADEBOOK));
      }
      const rowsForReliance = store.holdings.length;
      const s = summary(store);
      expect(rowsForReliance).toBe(1);           // one position, not two
      expect(s.net_worth).toBeCloseTo(29505, 0); // market value, NOT 29505 + 24000
      // cost basis from the tradebook is preserved for P&L
      const h = store.holdings[0];
      expect(h.invested_value).toBeCloseTo(24000, 0);
    }
  });
});

describe("tradebook positions not in the holdings snapshot don't inflate net worth", () => {
  // Holdings: only RELIANCE is currently held (market value 29,505).
  const HOLDINGS = `Symbol,ISIN,Quantity Available,Average Price,Previous Closing Price
RELIANCE,INE002A01018,10,2400,2950.5
`;
  // Tradebook shows RELIANCE (held) + WIPRO with a net open position that was actually sold/
  // transferred (or has incomplete sell history) — WIPRO is NOT in the current holdings.
  const TRADEBOOK = `symbol,isin,trade_type,quantity,price,trade_date,trade_id
RELIANCE,INE002A01018,buy,10,2400,2023-01-01,T1
WIPRO,INE075A01022,buy,100,285,2022-05-01,T2
`;

  it("excludes the unbacked tradebook position (WIPRO), keeps net worth at the holdings value", () => {
    for (const order of [["h", "t"], ["t", "h"]] as const) {
      const store = new Store();
      for (const step of order) {
        if (step === "h") processParseResult(store, parseZerodhaHoldings(HOLDINGS));
        else processParseResult(store, parseZerodhaTradebook(TRADEBOOK));
      }
      const s = summary(store);
      expect(store.holdings.length).toBe(1);        // WIPRO pruned
      expect(s.net_worth).toBeCloseTo(29505, 0);    // NOT 29505 + 28500 (WIPRO at cost)
      expect(store.holdings[0].source).not.toBe("zerodha_tradebook");
    }
  });

  it("but a tradebook-only portfolio (no holdings file) keeps its positions", () => {
    const store = new Store();
    processParseResult(store, parseZerodhaTradebook(TRADEBOOK));
    // No priced snapshot exists → nothing is pruned; both positions stand (valued at cost).
    expect(store.holdings.length).toBe(2);
    const s = summary(store);
    expect(s.net_worth).toBeCloseTo(24000 + 28500, 0);
  });
});
