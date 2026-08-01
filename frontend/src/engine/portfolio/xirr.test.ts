import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { xirr, portfolioXirr } from "./xirr";
import { Store } from "../store/store";
import { processParseResult } from "../pipeline/importService";
import { parseZerodhaHoldings } from "../parse/zerodhaHoldings";
import { parseGenericCsv } from "../parse/genericCsv";
import { parseCasJson } from "../parse/casJson";

describe("xirr solver", () => {
  it("one-year 10% return", () => {
    const r = xirr([["2024-01-01", -100], ["2025-01-01", 110]]);
    expect(r).toBeCloseTo(0.1, 2);
  });
  it("negative return", () => {
    const r = xirr([["2024-01-01", -100], ["2025-01-01", 80]]);
    expect(r).toBeCloseTo(-0.2, 2);
  });
  it("requires both signs", () => {
    expect(xirr([["2024-01-01", -100], ["2025-01-01", -50]])).toBeNull();
    expect(xirr([["2024-01-01", 100]])).toBeNull();
  });
  it("half-year annualizes up", () => {
    const r = xirr([["2024-01-01", -100], ["2024-07-01", 105]]);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.09);
    expect(r!).toBeLessThan(0.12);
  });
});

describe("lifetime portfolio XIRR parity vs Python", () => {
  const sample = (f: string) => readFileSync(resolve(process.cwd(), "..", "samples", f), "utf-8");
  it("matches Python lifetime XIRR + coverage", () => {
    const store = new Store();
    processParseResult(store, parseZerodhaHoldings(sample("zerodha_holdings.csv")));
    processParseResult(store, parseCasJson(JSON.parse(sample("cas.json"))));
    processParseResult(store, parseGenericCsv(sample("manual_assets.csv")));
    const p = portfolioXirr(store, null, null, "portfolio")[0];
    expect(p.xirr! * 100).toBeCloseTo(10.08, 0); // Python: 10.08%
    expect((p.covered_value / p.current_value) * 100).toBeCloseTo(50.1, 0);
  });
});
