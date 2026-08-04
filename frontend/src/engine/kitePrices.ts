// Direct-equity historical prices — fetched from the user's own kite-prices proxy service.
// Kite's api_secret can't live in the browser and its endpoints don't allow browser CORS, so a
// small self-run proxy (services/kite-prices) holds the Kite session and returns daily closes.
// Only symbols + a date range leave the browser; holdings never do. Configured via
// VITE_KITE_PRICES_URL at build time; absent → this is a graceful no-op (equity stays flagged).

import { Store } from "./store/store";

export interface KiteFetchResult {
  configured: boolean;   // is VITE_KITE_PRICES_URL set?
  needsAuth: boolean;    // proxy reachable but not logged in to Kite (daily token)
  fetched: number;       // symbols with at least one close returned
  missing: string[];     // symbols the proxy couldn't resolve/price
}

const base = (import.meta.env.VITE_KITE_PRICES_URL as string | undefined)?.replace(/\/$/, "");

// Avoid re-POSTing the same window repeatedly within a session.
const done = new Set<string>();

function minusDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Fill the store's price cache with daily closes for direct stocks/ETFs around `dates`. */
export async function populateEquityBoundaryPrices(store: Store, dates: string[]): Promise<KiteFetchResult> {
  const none: KiteFetchResult = { configured: false, needsAuth: false, fetched: 0, missing: [] };
  if (!base || !dates.length) return none;

  const equities = store.instruments.filter(
    (i) => (i.instrument_type === "stock" || i.instrument_type === "etf") && i.symbol && store.holdingsFor(i.id).length,
  );
  if (!equities.length) return { ...none, configured: true };

  // Map upper-cased tradingsymbol -> instruments that use it (a symbol can appear once, but be safe).
  const bySymbol = new Map<string, typeof equities>();
  for (const inst of equities) {
    const key = inst.symbol!.trim().toUpperCase();
    (bySymbol.get(key) ?? bySymbol.set(key, []).get(key)!).push(inst);
  }
  const symbols = [...bySymbol.keys()];

  const sorted = [...dates].sort();
  const from = minusDays(sorted[0], 10); // buffer so nearest-on-or-before has data at the low boundary
  const to = sorted[sorted.length - 1];

  const cacheKey = `${from}|${to}|${symbols.join(",")}`;
  if (done.has(cacheKey)) return { configured: true, needsAuth: false, fetched: symbols.length, missing: [] };

  let resp: Response;
  try {
    resp = await fetch(`${base}/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols, from_date: from, to_date: to }),
    });
  } catch {
    return { configured: true, needsAuth: false, fetched: 0, missing: symbols };
  }
  if (resp.status === 401) return { configured: true, needsAuth: true, fetched: 0, missing: [] };
  if (!resp.ok) return { configured: true, needsAuth: false, fetched: 0, missing: symbols };

  const payload = (await resp.json().catch(() => null)) as
    | { prices: Record<string, [string, number][]>; missing: string[] }
    | null;
  if (!payload) return { configured: true, needsAuth: false, fetched: 0, missing: symbols };

  let fetched = 0;
  for (const [sym, series] of Object.entries(payload.prices ?? {})) {
    const insts = bySymbol.get(sym.toUpperCase());
    if (!insts || !series.length) continue;
    fetched++;
    for (const inst of insts) {
      for (const [date, close] of series) {
        if (typeof close !== "number" || Number.isNaN(close)) continue;
        const exists = store.prices.some((p) => p.instrument_id === inst.id && p.date === date);
        if (!exists) {
          store.prices.push({ id: store.nextId("prices"), instrument_id: inst.id, date, close, source: "kite" });
        }
      }
    }
  }
  done.add(cacheKey);
  return { configured: true, needsAuth: false, fetched, missing: payload.missing ?? [] };
}
