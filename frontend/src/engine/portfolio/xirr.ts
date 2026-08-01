// XIRR engine — TS mirror of backend/app/portfolio/xirr.py.
// Dates are ISO strings. Historical prices are read from the store's local `prices` cache
// (populated for MFs by an async NAV fetch); stocks without cached prices are flagged/excluded.

import { Store } from "../store/store";
import { Instrument } from "../store/model";
import { holdingValue } from "./aggregate";

const round = (n: number) => Math.round(n * 100) / 100;

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function days(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function xirr(cashflows: [string, number][], guess = 0.1): number | null {
  const flows = cashflows.filter(([, a]) => a !== 0);
  if (flows.length < 2) return null;
  if (!(flows.some(([, a]) => a > 0) && flows.some(([, a]) => a < 0))) return null;
  const t0 = flows.reduce((m, [d]) => (d < m ? d : m), flows[0][0]);
  const years = flows.map(([d, a]) => [days(t0, d) / 365, a] as [number, number]);
  const npv = (r: number) => years.reduce((s, [t, a]) => s + a / (1 + r) ** t, 0);
  const dnpv = (r: number) => years.reduce((s, [t, a]) => s + (-t * a) / (1 + r) ** (t + 1), 0);

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const d = dnpv(rate);
    if (Math.abs(d) < 1e-12) break;
    const step = f / d;
    rate -= step;
    if (rate <= -0.9999) rate = -0.9999 + 1e-6;
    if (Math.abs(step) < 1e-8) return rate;
  }
  let lo = -0.9999, hi = 100.0;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid);
    if (Math.abs(fmid) < 1e-7) return mid;
    if (flo * fmid < 0) hi = mid;
    else { lo = mid; flo = fmid; }
  }
  return (lo + hi) / 2;
}

function currentQuantity(store: Store, instrumentId: number): number {
  return store.holdingsFor(instrumentId).reduce((a, h) => a + (h.quantity || 0), 0);
}

export function quantityOn(store: Store, instrumentId: number, on: string): number {
  let qty = currentQuantity(store, instrumentId);
  for (const t of store.transactionsFor(instrumentId)) {
    if (t.date > on && t.units) {
      if (t.kind === "buy" || t.kind === "switch_in") qty -= t.units;
      else if (t.kind === "sell" || t.kind === "switch_out") qty += t.units;
    }
  }
  // Note: corporate actions (splits) are omitted in the client store v1 — none in typical data.
  return qty;
}

interface Flags { price_return_only: boolean; has_estimated_price: boolean; split_flagged: boolean; insufficient_data: boolean; }
const noFlags = (): Flags => ({ price_return_only: false, has_estimated_price: false, split_flagged: false, insufficient_data: false });

export interface XirrResult {
  label: string; xirr: number | null; start_value: number; end_value: number;
  invested: number; current_value: number; covered_value: number; flags: Flags; flows: [string, number][];
}

function priceOn(store: Store, instrument: Instrument, on: string): [number | null, boolean] {
  const prices = store.prices
    .filter((p) => p.instrument_id === instrument.id && p.date <= on)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (prices.length) return [prices[0].close, false];
  return [null, true];
}

function boundaryValue(store: Store, inst: Instrument, on: string, flags: Flags): number {
  const qty = quantityOn(store, inst.id, on);
  if (qty <= 0) return 0;
  const [price, estimated] = priceOn(store, inst, on);
  if (price === null) { flags.has_estimated_price = true; return 0; }
  if (estimated) flags.has_estimated_price = true;
  return qty * price;
}

export function instrumentXirr(store: Store, inst: Instrument, start: string | null, end: string | null): XirrResult {
  const flags = noFlags();
  const txns = store.transactionsFor(inst.id);
  const holdings = store.holdingsFor(inst.id);
  const currentVal = holdings.reduce((a, h) => a + holdingValue(h), 0);
  const invested = holdings.reduce((a, h) => a + (h.invested_value || 0), 0);

  const cashflows: [string, number][] = [];
  for (const t of txns) {
    if ((start === null || t.date >= start) && (end === null || t.date <= end)) {
      cashflows.push([t.date, t.amount]);
      if ((t.kind === "buy" || t.kind === "sell") && (inst.instrument_type === "stock" || inst.instrument_type === "etf")) {
        flags.price_return_only = true;
      }
    }
  }

  let startValue = 0;
  if (start !== null) {
    startValue = boundaryValue(store, inst, start, flags);
    if (startValue > 0) cashflows.unshift([start, -startValue]);
  }

  const hasBasis = cashflows.some(([, a]) => a < 0);
  const endDate = end || todayISO();
  const endValue = end === null ? currentVal : boundaryValue(store, inst, end, flags);

  if (!hasBasis) {
    flags.insufficient_data = true;
    return { label: inst.name, xirr: null, start_value: round(startValue), end_value: round(endValue), invested: round(invested), current_value: round(currentVal), covered_value: 0, flags, flows: [] };
  }
  if (endValue > 0) cashflows.push([endDate, endValue]);
  const rate = xirr(cashflows);
  return { label: inst.name, xirr: rate, start_value: round(startValue), end_value: round(endValue), invested: round(invested), current_value: round(currentVal), covered_value: round(currentVal), flags, flows: cashflows };
}

function merge(results: XirrResult[], label: string): XirrResult {
  const flags = noFlags();
  let pooled: [string, number][] = [];
  let invested = 0, currentVal = 0, startV = 0, endV = 0, covered = 0;
  for (const r of results) {
    invested += r.invested; currentVal += r.current_value; startV += r.start_value; endV += r.end_value; covered += r.covered_value;
    flags.price_return_only ||= r.flags.price_return_only;
    flags.has_estimated_price ||= r.flags.has_estimated_price;
    flags.split_flagged ||= r.flags.split_flagged;
    pooled = pooled.concat(r.flows);
  }
  const rate = pooled.length ? xirr(pooled) : null;
  if (covered < currentVal - 1) flags.has_estimated_price = true;
  if (covered <= 0) flags.insufficient_data = true;
  return { label, xirr: rate, start_value: round(startV), end_value: round(endV), invested: round(invested), current_value: round(currentVal), covered_value: round(covered), flags, flows: pooled };
}

export function portfolioXirr(store: Store, start: string | null, end: string | null, groupBy = "portfolio"): XirrResult[] {
  const instruments = store.instruments.filter((i) => store.holdingsFor(i.id).length);
  const per = new Map<number, XirrResult>(instruments.map((i) => [i.id, instrumentXirr(store, i, start, end)]));

  if (groupBy === "instrument") {
    return [...per.values()].filter((r) => r.current_value > 0).sort((a, b) => b.current_value - a.current_value);
  }
  if (groupBy === "asset_class") {
    const groups = new Map<string, XirrResult[]>();
    for (const i of instruments) {
      const ac = store.classificationFor(i.id)?.asset_class ?? "Unclassified";
      if (!groups.has(ac)) groups.set(ac, []);
      groups.get(ac)!.push(per.get(i.id)!);
    }
    return [...groups.entries()].map(([ac, items]) => merge(items, ac)).sort((a, b) => b.current_value - a.current_value);
  }
  return [merge([...per.values()], "Whole portfolio")];
}
