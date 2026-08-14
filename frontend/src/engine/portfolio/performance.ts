// Unitized NAV performance curve — MF uses actual NAV; equity uses daily closes from the
// equity-prices service. Both apply the same time-weighted, unitized-NAV algorithm so the
// two series are directly comparable and can be combined into a portfolio view.

import { Store } from "../store/store";
import { Transaction } from "../store/model";
import { fetchNavSeries, nearestOnOrBefore } from "../prices";
import { buildHoldingRows } from "./aggregate";
import { todayISO } from "./xirr";
import { populateEquityFullHistory } from "../equityPrices";

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const MF_IN  = ["buy", "switch_in"];
const MF_OUT = ["sell", "switch_out"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CurvePoint {
  date: string;
  nav: number;
  return_pct: number;
  value: number;
  invested: number;
}

export interface CurveResult {
  points: CurvePoint[];
  available: boolean;
  covered_value: number;
  covered_pct: number;
  final_return_pct: number;
  note: string;
}

// ─── Shared algorithm ─────────────────────────────────────────────────────────

function monthEnds(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let [y, m] = [Number(startIso.slice(0, 4)), Number(startIso.slice(5, 7))];
  const [ey, em] = [Number(endIso.slice(0, 4)), Number(endIso.slice(5, 7))];
  while (y < ey || (y === ey && m <= em)) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    if (d >= startIso && d <= endIso) out.push(d);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// Market-value function: (date, inclusive) => total value.
// inclusive=false → value using positions BEFORE transactions on that date.
// inclusive=true  → value using positions AFTER  transactions on that date.
type MvFn = (date: string, inclusive: boolean) => number;

function runUnitizedNav(
  allTxns: Transaction[],
  mv: MvFn,
  today: string,
): CurvePoint[] {
  if (!allTxns.length) return [];
  const start = allTxns.reduce((m, t) => (t.date < m ? t.date : m), allTxns[0].date);
  const sampleDates = [...new Set([start, ...monthEnds(start, today), today])].sort();
  const sampleSet   = new Set(sampleDates);
  const eventDates  = [...new Set([...allTxns.map((t) => t.date), ...sampleDates])].sort();

  let unitsSyn = 0, navSyn = 1000;
  const points: CurvePoint[] = [];

  for (const d of eventDates) {
    const existing = mv(d, false);
    if (unitsSyn > 0) navSyn = existing / unitsSyn;
    const cf = -allTxns.filter((t) => t.date === d).reduce((a, t) => a + t.amount, 0);
    if (cf !== 0) {
      if (unitsSyn <= 0) { unitsSyn = cf / 1000; navSyn = 1000; }
      else unitsSyn += cf / navSyn;
    }
    if (sampleSet.has(d)) {
      const val     = mv(d, true);
      const invested = round(allTxns.filter((t) => t.date <= d).reduce((a, t) => a + -t.amount, 0));
      points.push({ date: d, nav: round(navSyn), return_pct: round((navSyn / 1000 - 1) * 100), value: round(val), invested });
    }
  }
  return points;
}

// ─── MF data builder ──────────────────────────────────────────────────────────

interface SeriesData { txns: Transaction[]; mv: MvFn }

async function buildMfData(store: Store): Promise<SeriesData | null> {
  const funds: { txns: Transaction[]; series: Map<string, number> }[] = [];
  for (const inst of store.instruments) {
    if (inst.instrument_type !== "mutual_fund" || !inst.scheme_code) continue;
    const txns = store.transactionsFor(inst.id);
    if (!txns.length) continue;
    const series = await fetchNavSeries(inst.scheme_code);
    if (series.size) funds.push({ txns, series });
  }
  if (!funds.length) return null;

  const allTxns = funds.flatMap((f) => f.txns);

  const unitsBefore = (txns: Transaction[], d: string, inclusive: boolean): number => {
    let u = 0;
    for (const t of txns) {
      if (inclusive ? t.date <= d : t.date < d) {
        if (MF_IN.includes(t.kind))  u += t.units || 0;
        if (MF_OUT.includes(t.kind)) u -= t.units || 0;
      }
    }
    return u;
  };

  const mv: MvFn = (d, inclusive) => {
    let total = 0;
    for (const f of funds) {
      const u = unitsBefore(f.txns, d, inclusive);
      if (u <= 0) continue;
      const nav = nearestOnOrBefore(f.series, d);
      if (nav) total += u * nav;
    }
    return total;
  };

  return { txns: allTxns, mv };
}

// ─── Equity data builder ───────────────────────────────────────────────────────

interface EquityData extends SeriesData {
  configured: boolean;
  fetched: boolean;
}

async function buildEquityData(store: Store): Promise<EquityData | null> {
  const equities = store.instruments.filter(
    (i) =>
      (i.instrument_type === "stock" || i.instrument_type === "etf") &&
      i.symbol &&
      store.transactionsFor(i.id).length,
  );
  if (!equities.length) return null;

  const allTxns = equities.flatMap((i) => store.transactionsFor(i.id));
  const start   = allTxns.reduce((m, t) => (t.date < m ? t.date : m), allTxns[0].date);

  const priceResult = await populateEquityFullHistory(store, start, todayISO());

  if (!priceResult.configured) {
    return { txns: allTxns, mv: () => 0, configured: false, fetched: false };
  }

  // Build sorted price series per instrument for O(log n) lookups.
  const priceSeries = new Map<number, [string, number][]>();
  for (const inst of equities) {
    const ps = store.prices
      .filter((p) => p.instrument_id === inst.id)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((p) => [p.date, p.close] as [string, number]);
    if (ps.length) priceSeries.set(inst.id, ps);
  }

  // Binary search: nearest price on or before `date`.
  function priceAt(instId: number, date: string): number | null {
    const s = priceSeries.get(instId);
    if (!s?.length) return null;
    let lo = 0, hi = s.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid][0] <= date) lo = mid + 1; else hi = mid - 1;
    }
    return hi >= 0 ? s[hi][1] : null;
  }

  // Reconstruct historical quantity by reversing from current holdings.
  // inclusive=true  → qty AFTER  transactions on `date` (same as quantityOn in xirr.ts)
  // inclusive=false → qty BEFORE transactions on `date`
  const currentQty  = new Map(equities.map((i) => [i.id, store.holdingsFor(i.id).reduce((a, h) => a + (h.quantity || 0), 0)]));
  const txnsByInst  = new Map(equities.map((i) => [i.id, store.transactionsFor(i.id)]));

  function qtyOnDate(instId: number, date: string, inclusive: boolean): number {
    let qty = currentQty.get(instId) || 0;
    for (const t of txnsByInst.get(instId) || []) {
      if (inclusive ? t.date > date : t.date >= date) {
        if (t.kind === "buy")  qty -= t.units || 0;
        if (t.kind === "sell") qty += t.units || 0;
      }
    }
    return Math.max(0, qty);
  }

  const mv: MvFn = (date, inclusive) => {
    let total = 0;
    for (const inst of equities) {
      const qty   = qtyOnDate(inst.id, date, inclusive);
      if (qty <= 0) continue;
      const price = priceAt(inst.id, date);
      if (price)  total += qty * price;
    }
    return total;
  };

  return { txns: allTxns, mv, configured: true, fetched: priceSeries.size > 0 };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function portfolioPerformance(store: Store): Promise<{
  mf: CurveResult;
  equity: CurveResult;
  combined: CurveResult;
}> {
  const today    = todayISO();
  const netWorth = buildHoldingRows(store).reduce((a, r) => a + r.current_value, 0) || 1;

  const [mfData, equityData] = await Promise.all([
    buildMfData(store),
    buildEquityData(store),
  ]);

  function wrap(points: CurvePoint[], available: boolean, note: string): CurveResult {
    const last    = points[points.length - 1];
    const covered = last?.value ?? 0;
    return {
      points,
      available: available && points.length > 0,
      covered_value:    round(covered),
      covered_pct:      round((covered / netWorth) * 100, 1),
      final_return_pct: last?.return_pct ?? 0,
      note,
    };
  }

  // MF curve
  const mf = mfData
    ? wrap(runUnitizedNav(mfData.txns, mfData.mv, today), true,
        "Time-weighted, unitized NAV (rebased to 0% at inception) — isolates returns from how much you added and when.")
    : wrap([], false, "No mutual-fund transaction history available.");

  // Equity curve
  const equityAvailable = !!equityData && equityData.configured && equityData.fetched;
  const equity = equityData
    ? wrap(
        equityAvailable ? runUnitizedNav(equityData.txns, equityData.mv, today) : [],
        equityAvailable,
        equityData.configured
          ? "Time-weighted equity return (price-return only — dividends not included)."
          : "Equity price feed not configured. Set VITE_EQUITY_PRICES_URL to enable.",
      )
    : wrap([], false, "No equity transaction history available.");

  // Combined portfolio curve — pools MF + equity transactions and market values.
  const combinedTxns = [...(mfData?.txns ?? []), ...(equityData?.txns ?? [])];
  const combinedMv: MvFn = (d, inc) =>
    (mfData?.mv(d, inc) ?? 0) + (equityData?.fetched ? equityData.mv(d, inc) : 0);
  const combined = combinedTxns.length
    ? wrap(runUnitizedNav(combinedTxns, combinedMv, today), true,
        "Portfolio time-weighted return (MF + equity combined). Equity is price-return only.")
    : wrap([], false, "No transaction history available.");

  return { mf, equity, combined };
}

// Legacy single-series export for DEMO mode and any remaining callers.
export async function mfPerformanceCurve(store: Store): Promise<any> {
  const { mf } = await portfolioPerformance(store);
  return {
    points:           mf.points,
    covered_value:    mf.covered_value,
    covered_pct:      mf.covered_pct,
    final_return_pct: mf.final_return_pct,
    note:             mf.note,
  };
}
