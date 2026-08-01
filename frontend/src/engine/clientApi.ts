// Client engine API — exposes the same surface as the HTTP backend, backed by the local Store.
// This is what powers the fully client-side app: all compute + storage in the browser.

import { Store } from "./store/store";
import { loadSnapshot, saveSnapshot, requestPersistent, exportToFile, importFromFile } from "./store/persistence";
import { seedSampleData } from "./seed";
import { processParseResult } from "./pipeline/importService";
import { reclassifyAll } from "./pipeline/classifyService";
import { parseZerodhaHoldings } from "./parse/zerodhaHoldings";
import { parseZerodhaTradebook } from "./parse/zerodhaTradebook";
import { parseGenericCsv } from "./parse/genericCsv";
import { parseCasJson } from "./parse/casJson";
import { parseManualEntries, ManualEntry } from "./parse/manual";
import { summary } from "./portfolio/aggregate";
import { holdingsPayload } from "./portfolio/holdingsView";
import { transactionsPayload } from "./portfolio/transactionsView";
import { mutualFundAnalysis, stockConcentration, portfolioOverlap, stockEtfAnalysis } from "./portfolio/analysis";
import { rebalancePlan } from "./portfolio/rebalance";
import { portfolioXirr } from "./portfolio/xirr";
import { mfPerformanceCurve } from "./portfolio/performance";
import { populateBoundaryPrices } from "./prices";
import { ASSET_CLASS_ORDER, DebtSubClass, EquitySubClass, GoldSubClass, InstrumentType } from "./taxonomy";

const store = new Store();
let ready: Promise<void> | null = null;

async function init(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // Hydrate from IndexedDB, but never let a slow/blocked store hang the UI.
      let loaded = false;
      try {
        loaded = await Promise.race([
          loadSnapshot(store),
          new Promise<boolean>((r) => setTimeout(() => r(false), 2500)),
        ]);
      } catch {
        loaded = false;
      }
      if (!loaded && store.isEmpty()) {
        seedSampleData(store); // first visit → show the sample portfolio (like the demo)
        persist(); // fire-and-forget; don't block first render on the write
      }
      requestPersistent();
    })();
  }
  return ready;
}
async function persist(): Promise<void> {
  try { await saveSnapshot(store); } catch { /* storage may be blocked; keep in-memory */ }
}

function serializeXirr(r: any): any {
  return {
    label: r.label,
    xirr: r.xirr !== null ? Math.round(r.xirr * 10000) / 100 : null,
    start_value: r.start_value, end_value: r.end_value, invested: r.invested,
    current_value: r.current_value, covered_value: r.covered_value,
    coverage_pct: r.current_value ? Math.round((r.covered_value / r.current_value) * 1000) / 10 : 0,
    flags: r.flags,
  };
}

export const clientApi = {
  async summary() { await init(); return summary(store); },
  async holdings(params: Record<string, string> = {}) {
    await init();
    const rows = holdingsPayload(store, params as any);
    return { holdings: rows, count: rows.length, total_value: Math.round(rows.reduce((a, r) => a + r.current_value, 0) * 100) / 100 };
  },
  async transactions() { await init(); return transactionsPayload(store); },
  async mutualFunds() { await init(); return mutualFundAnalysis(store); },
  async stocks() { await init(); return stockEtfAnalysis(store); },
  async concentration() { await init(); return stockConcentration(store); },
  async overlap() { await init(); return portfolioOverlap(store); },
  async rebalance(mode: string, newMoney = 0) { await init(); return rebalancePlan(store, mode as any, newMoney); },
  async performance() { await init(); return mfPerformanceCurve(store); },

  async xirr(scope: string, from?: string, to?: string) {
    await init();
    if (from && to) await populateBoundaryPrices(store, [from, to]);
    const results = portfolioXirr(store, from ?? null, to ?? null, scope);
    return {
      scope, from: from ?? null, to: to ?? null, is_period: !!from,
      results: results.map(serializeXirr),
      note: "Mutual-fund XIRR uses actual NAV. Direct-equity period XIRR needs a price feed (Kite) — until then, equity holdings without cached historical prices are flagged and excluded from period boundaries. Equity figures are price-return (dividends not yet included).",
    };
  },

  async imports() {
    await init();
    return store.imports
      .slice().reverse()
      .map((b) => ({ ...b, diagnostics: b.diagnostics ? JSON.parse(b.diagnostics) : [] }));
  },
  async taxonomy() {
    await init();
    return {
      asset_classes: ASSET_CLASS_ORDER,
      equity_caps: Object.values(EquitySubClass),
      debt_sub_classes: Object.values(DebtSubClass),
      gold_sub_classes: Object.values(GoldSubClass),
      instrument_types: Object.values(InstrumentType),
    };
  },
  async overrides() { await init(); return store.overrides.map((o) => ({ ...o })); },
  async createOverride(body: any) {
    await init();
    const existing = store.overrides.find((o) => o.key_type === body.key_type && o.key_value === body.key_value);
    const o = existing ?? { id: store.nextId("overrides"), key_type: body.key_type, key_value: body.key_value };
    Object.assign(o, { asset_class: body.asset_class ?? null, sub_class: body.sub_class ?? null, sector: body.sector ?? null, market_cap: body.market_cap ?? null, note: body.note ?? null });
    if (!existing) store.overrides.push(o as any);
    reclassifyAll(store);
    await persist();
    return o;
  },
  async deleteOverride(id: number) {
    await init();
    store.overrides = store.overrides.filter((o) => o.id !== id);
    reclassifyAll(store);
    await persist();
    return { deleted: id };
  },
  async getTargets() {
    await init();
    const targets = store.targets.filter((t) => t.level === "asset_class").map((t) => ({ bucket: t.bucket, target_pct: t.target_pct }));
    return { targets, sum: Math.round(targets.reduce((a, t) => a + t.target_pct, 0) * 100) / 100 };
  },
  async setTargets(targets: { bucket: string; target_pct: number }[]) {
    await init();
    store.targets = store.targets.filter((t) => t.level !== "asset_class");
    for (const t of targets) store.targets.push({ id: store.nextId("target_allocation"), level: "asset_class", bucket: t.bucket, target_pct: t.target_pct });
    await persist();
    return this.getTargets();
  },

  async upload(form: FormData) {
    await init();
    const source = String(form.get("source"));
    const accountName = (form.get("account_name") as string) || undefined;
    const file = form.get("file") as File;
    const text = await file.text();
    let result;
    if (source === "cas_json") result = parseCasJson(JSON.parse(text), file.name);
    else if (source === "zerodha_holdings") result = parseZerodhaHoldings(text, file.name, accountName);
    else if (source === "zerodha_tradebook") result = parseZerodhaTradebook(text, file.name, accountName);
    else if (source === "generic_csv") result = parseGenericCsv(text, file.name, accountName);
    else if (source === "cas_pdf") {
      // The one server call: a stateless parse-cas service turns the PDF into CAS JSON, which we
      // then process locally. Nothing about the PDF is stored. Requires VITE_PARSE_CAS_URL at build.
      const base = import.meta.env.VITE_PARSE_CAS_URL;
      if (!base) throw new Error("CAS PDF parsing isn't configured for this build. Convert locally with casparser and upload the JSON (Advanced), or self-host.");
      const password = (form.get("password") as string) || "";
      const svcForm = new FormData();
      svcForm.append("file", file);
      svcForm.append("password", password);
      const resp = await fetch(`${base.replace(/\/$/, "")}/parse-cas`, { method: "POST", body: svcForm });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail ?? "CAS PDF parse failed.");
      result = parseCasJson(await resp.json(), file.name, "cas_pdf");
    } else throw new Error(`Unknown source '${source}'.`);
    const batch = processParseResult(store, result);
    await persist();
    return { ...batch, diagnostics: batch.diagnostics ? JSON.parse(batch.diagnostics) : [] };
  },
  async manual(entries: ManualEntry[]) {
    await init();
    const batch = processParseResult(store, parseManualEntries(entries));
    await persist();
    return { ...batch, diagnostics: [] };
  },

  async seed() { await init(); seedSampleData(store); await persist(); return { status: "seeded" }; },
  async reset() { await init(); store.clear(); await persist(); return { status: "reset" }; },
  async reclassify() { await init(); const n = reclassifyAll(store); await persist(); return { reclassified: n }; },

  // Local-only extras (no HTTP equivalent)
  async exportBackup() { await init(); exportToFile(store); },
  async importBackup(file: File) { await init(); await importFromFile(store, file); await persist(); },
};
