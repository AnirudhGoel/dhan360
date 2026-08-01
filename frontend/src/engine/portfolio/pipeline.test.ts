import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "../store/store";
import { processParseResult } from "../pipeline/importService";
import { parseZerodhaHoldings } from "../parse/zerodhaHoldings";
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
