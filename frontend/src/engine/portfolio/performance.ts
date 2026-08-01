// Unitized MF performance curve — TS mirror of backend/app/portfolio/performance.py.
// Time-weighted NAV rebased to 0% at inception; accurate for the mutual-fund slice.

import { Store } from "../store/store";
import { Transaction } from "../store/model";
import { fetchNavSeries, nearestOnOrBefore } from "../prices";
import { buildHoldingRows } from "./aggregate";
import { todayISO } from "./xirr";

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const IN = ["buy", "switch_in"];
const OUT = ["sell", "switch_out"];

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

export async function mfPerformanceCurve(store: Store): Promise<any> {
  const funds: { txns: Transaction[]; series: Map<string, number> }[] = [];
  for (const inst of store.instruments) {
    if (inst.instrument_type !== "mutual_fund" || !inst.scheme_code) continue;
    const txns = store.transactionsFor(inst.id);
    if (!txns.length) continue;
    const series = await fetchNavSeries(inst.scheme_code);
    if (series.size) funds.push({ txns, series });
  }

  if (!funds.length) {
    return { points: [], covered_value: 0, covered_pct: 0, final_return_pct: 0,
      note: "No mutual-fund transaction history available to plot." };
  }

  const allTxns = funds.flatMap((f) => f.txns);
  const start = allTxns.reduce((m, t) => (t.date < m ? t.date : m), allTxns[0].date);
  const today = todayISO();
  const sampleDates = [...new Set([start, ...monthEnds(start, today), today])].sort();
  const sampleSet = new Set(sampleDates);
  const eventDates = [...new Set([...allTxns.map((t) => t.date), ...sampleDates])].sort();

  const unitsBefore = (txns: Transaction[], d: string, inclusive: boolean): number => {
    let u = 0;
    for (const t of txns) {
      if (inclusive ? t.date <= d : t.date < d) {
        if (IN.includes(t.kind)) u += t.units || 0;
        else if (OUT.includes(t.kind)) u -= t.units || 0;
      }
    }
    return u;
  };
  const marketValue = (d: string, inclusive: boolean): number => {
    let total = 0;
    for (const f of funds) {
      const u = unitsBefore(f.txns, d, inclusive);
      if (u <= 0) continue;
      const nav = nearestOnOrBefore(f.series, d);
      if (nav) total += u * nav;
    }
    return total;
  };

  let unitsSyn = 0;
  let navSyn = 1000;
  const points: any[] = [];
  for (const d of eventDates) {
    const existing = marketValue(d, false);
    if (unitsSyn > 0) navSyn = existing / unitsSyn;
    const cf = -allTxns.filter((t) => t.date === d).reduce((a, t) => a + t.amount, 0);
    if (cf !== 0) {
      if (unitsSyn <= 0) { unitsSyn = cf / 1000; navSyn = 1000; }
      else unitsSyn += cf / navSyn;
    }
    if (sampleSet.has(d)) {
      const mv = marketValue(d, true);
      const invested = round(allTxns.filter((t) => t.date <= d).reduce((a, t) => a + -t.amount, 0));
      points.push({ date: d, nav: round(navSyn), return_pct: round((navSyn / 1000 - 1) * 100), value: round(mv), invested });
    }
  }

  const netWorth = buildHoldingRows(store).reduce((a, r) => a + r.current_value, 0) || 1;
  const covered = points.length ? points[points.length - 1].value : 0;
  return {
    points,
    covered_value: round(covered),
    covered_pct: round((covered / netWorth) * 100, 1),
    final_return_pct: points.length ? points[points.length - 1].return_pct : 0,
    note: "Mutual-fund performance (time-weighted, unitized NAV rebased to 0% at inception). Equity and combined views arrive with the historical price feed.",
  };
}
