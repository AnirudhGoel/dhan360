// Direct-equity historical prices — fetched from the shared equity-prices service.
// The service downloads NSE bhav copies (no credentials needed) and caches them.
// Configured via VITE_EQUITY_PRICES_URL at build time; absent → graceful no-op.

import { Store } from "./store/store";

export interface EquityPriceResult {
  configured: boolean;   // is VITE_EQUITY_PRICES_URL set?
  fetched:    number;    // symbols with at least one close returned
  missing:    string[];  // symbols the service has no data for
}

const base = (import.meta.env.VITE_EQUITY_PRICES_URL as string | undefined)?.replace(/\/$/, "");

// Avoid re-fetching the same window repeatedly within a session.
const done = new Set<string>();

function minusDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Shared fetch+store logic given an already-resolved symbol map and date range. */
async function _fetchPrices(
  store: Store,
  bySymbol: Map<string, { id: number; symbol?: string | null }[]>,
  from: string,
  to: string,
  cacheKey: string,
): Promise<EquityPriceResult> {
  const symbols = [...bySymbol.keys()];
  if (done.has(cacheKey)) return { configured: true, fetched: symbols.length, missing: [] };

  let resp: Response;
  try {
    resp = await fetch(`${base}/prices`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ symbols, from_date: from, to_date: to }),
    });
  } catch {
    return { configured: true, fetched: 0, missing: symbols };
  }
  if (!resp.ok) return { configured: true, fetched: 0, missing: symbols };

  const payload = (await resp.json().catch(() => null)) as
    | { prices: Record<string, [string, number][]>; missing: string[] }
    | null;
  if (!payload) return { configured: true, fetched: 0, missing: symbols };

  let fetched = 0;
  for (const [sym, series] of Object.entries(payload.prices ?? {})) {
    const insts = bySymbol.get(sym.toUpperCase());
    if (!insts || !series.length) continue;
    fetched++;
    for (const inst of insts) {
      for (const [dt, close] of series) {
        if (typeof close !== "number" || Number.isNaN(close)) continue;
        if (!store.prices.some((p) => p.instrument_id === inst.id && p.date === dt)) {
          store.prices.push({ id: store.nextId("prices"), instrument_id: inst.id, date: dt, close, source: "nse" });
        }
      }
    }
  }
  done.add(cacheKey);
  return { configured: true, fetched, missing: payload.missing ?? [] };
}

/** Fill the store's price cache with daily closes for direct stocks/ETFs around `dates`. */
export async function populateEquityBoundaryPrices(
  store: Store,
  dates: string[],
): Promise<EquityPriceResult> {
  const none: EquityPriceResult = { configured: false, fetched: 0, missing: [] };
  if (!base || !dates.length) return none;

  const equities = store.instruments.filter(
    (i) =>
      (i.instrument_type === "stock" || i.instrument_type === "etf") &&
      i.symbol &&
      store.holdingsFor(i.id).length,
  );
  if (!equities.length) return { ...none, configured: true };

  const bySymbol = new Map<string, typeof equities>();
  for (const inst of equities) {
    const key = inst.symbol!.trim().toUpperCase();
    (bySymbol.get(key) ?? bySymbol.set(key, []).get(key)!).push(inst);
  }
  const sorted = [...dates].sort();
  const from = minusDays(sorted[0], 10);
  const to   = sorted[sorted.length - 1];
  return _fetchPrices(store, bySymbol, from, to, `bnd|${from}|${to}|${[...bySymbol.keys()].join(",")}`);
}

/**
 * Fill the store's price cache with the full daily close history for all equity
 * instruments that have transactions (including sold positions). Used by the
 * equity performance curve which needs every month-end price from inception.
 */
export async function populateEquityFullHistory(
  store: Store,
  from: string,
  to: string,
): Promise<EquityPriceResult> {
  const none: EquityPriceResult = { configured: false, fetched: 0, missing: [] };
  if (!base) return none;

  // Include instruments with any transaction history (not just current holdings),
  // so fully-sold positions contribute to the historical performance curve.
  const equities = store.instruments.filter(
    (i) =>
      (i.instrument_type === "stock" || i.instrument_type === "etf") &&
      i.symbol &&
      store.transactionsFor(i.id).length,
  );
  if (!equities.length) return { ...none, configured: true };

  const bySymbol = new Map<string, typeof equities>();
  for (const inst of equities) {
    const key = inst.symbol!.trim().toUpperCase();
    (bySymbol.get(key) ?? bySymbol.set(key, []).get(key)!).push(inst);
  }
  // 10-day buffer so nearest-on-or-before works at the left boundary.
  const buffered = minusDays(from, 10);
  return _fetchPrices(store, bySymbol, buffered, to, `hist|${buffered}|${to}|${[...bySymbol.keys()].join(",")}`);
}
