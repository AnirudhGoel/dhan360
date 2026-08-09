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
  const symbols = [...bySymbol.keys()];

  const sorted = [...dates].sort();
  const from = minusDays(sorted[0], 10); // buffer for nearest-on-or-before at the low boundary
  const to   = sorted[sorted.length - 1];

  const cacheKey = `${from}|${to}|${symbols.join(",")}`;
  if (done.has(cacheKey)) {
    return { configured: true, fetched: symbols.length, missing: [] };
  }

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
        const exists = store.prices.some((p) => p.instrument_id === inst.id && p.date === dt);
        if (!exists) {
          store.prices.push({
            id: store.nextId("prices"),
            instrument_id: inst.id,
            date: dt,
            close,
            source: "nse",
          });
        }
      }
    }
  }
  done.add(cacheKey);
  return { configured: true, fetched, missing: payload.missing ?? [] };
}
