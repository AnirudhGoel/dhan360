// Historical NAV fetch — client-side, directly from mfapi.in (CORS-enabled: no proxy needed).
// Series are cached in-memory (not persisted). Used by period XIRR + the performance curve.

import { Store } from "./store/store";

const seriesCache = new Map<string, Map<string, number>>();

function toIso(ddmmyyyy: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export async function fetchNavSeries(schemeCode: string): Promise<Map<string, number>> {
  if (seriesCache.has(schemeCode)) return seriesCache.get(schemeCode)!;
  const out = new Map<string, number>();
  try {
    const resp = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    if (resp.ok) {
      const payload = await resp.json();
      for (const row of payload.data ?? []) {
        const iso = toIso(row.date);
        const nav = Number(row.nav);
        if (iso && !Number.isNaN(nav)) out.set(iso, nav);
      }
    }
  } catch {
    /* network/parse failure degrades gracefully to an empty series */
  }
  seriesCache.set(schemeCode, out);
  return out;
}

function minusDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function nearestOnOrBefore(series: Map<string, number>, on: string, maxBack = 10): number | null {
  for (let i = 0; i <= maxBack; i++) {
    const d = minusDays(on, i);
    if (series.has(d)) return series.get(d)!;
  }
  return null;
}

/** Pre-populate the store's price cache with NAV at the given boundary dates (for period XIRR). */
export async function populateBoundaryPrices(store: Store, dates: string[]): Promise<void> {
  const mfInstruments = store.instruments.filter((i) => i.instrument_type === "mutual_fund" && i.scheme_code);
  for (const inst of mfInstruments) {
    const series = await fetchNavSeries(inst.scheme_code!);
    if (!series.size) continue;
    for (const on of dates) {
      const nav = nearestOnOrBefore(series, on);
      if (nav === null) continue;
      const exists = store.prices.some((p) => p.instrument_id === inst.id && p.date === on);
      if (!exists) {
        store.prices.push({ id: store.nextId("prices"), instrument_id: inst.id, date: on, close: nav, source: "mfapi" });
      }
    }
  }
}
