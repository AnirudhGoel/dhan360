import { describe, it, expect } from "vitest";
import { Store } from "../store/store";
import { importPriceCsv } from "./importPrices";
import { instrumentXirr } from "../portfolio/xirr";

describe("price import enables direct-equity period XIRR", () => {
  it("computes period XIRR for a stock once prices are imported", () => {
    const store = new Store();
    const inst = { id: store.nextId("instruments"), name: "RELIANCE", instrument_type: "stock", symbol: "RELIANCE" };
    store.instruments.push(inst as any);
    const acct = { id: store.nextId("accounts"), name: "Z", kind: "demat" };
    store.accounts.push(acct as any);
    store.holdings.push({ id: store.nextId("holdings"), account_id: acct.id, instrument_id: inst.id, quantity: 10, invested_value: 24000, current_value: 30000, source: "zerodha_holdings" } as any);
    store.transactions.push({ id: store.nextId("transactions"), instrument_id: inst.id, account_id: acct.id, date: "2024-01-01", kind: "buy", units: 10, amount: -24000, source: "zerodha_tradebook" } as any);

    // Before importing prices: no cost basis at the period boundaries → not computable.
    const before = instrumentXirr(store, inst as any, "2024-06-01", "2024-12-31");
    expect(before.flags.insufficient_data).toBe(true);

    // Import boundary prices.
    const res = importPriceCsv(store, "symbol,date,close\nRELIANCE,2024-06-01,2500\nRELIANCE,2024-12-31,3000\n");
    expect(res.diagnostics.some((d) => d.message.includes("2 price points"))).toBe(true);

    // Now period XIRR computes: opening 10×2500=25000 out, closing 10×3000=30000 in.
    const after = instrumentXirr(store, inst as any, "2024-06-01", "2024-12-31");
    expect(after.start_value).toBe(25000);
    expect(after.end_value).toBe(30000);
    expect(after.xirr).not.toBeNull();
    expect(after.xirr!).toBeGreaterThan(0.15); // ~20% over 7 months annualizes higher
  });
});
