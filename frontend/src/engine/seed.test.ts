import { describe, it, expect } from "vitest";
import { Store } from "./store/store";
import { seedSampleData } from "./seed";
import { summary } from "./portfolio/aggregate";

describe("client seed", () => {
  it("seeds the sample portfolio and produces a summary", () => {
    const store = new Store();
    seedSampleData(store);
    const s = summary(store);
    expect(s.holdings_count).toBe(35);
    expect(s.net_worth).toBeGreaterThan(6000000);
    // disclosed look-through injected → overlap should exist
    expect(store.lookthrough.some((l) => !l.is_estimated)).toBe(true);
    // stock transactions injected
    expect(store.transactions.some((t) => t.source === "zerodha_tradebook")).toBe(true);
  });
});
