// Portfolio aggregation — TS mirror of backend/app/portfolio/aggregate.py.
// Each holding is expanded into exposures (funds expand across look-through), then every
// breakdown is a simple grouping of exposures, keeping all the totals internally consistent.

import { Store } from "../store/store";
import { Holding } from "../store/model";
import { ASSET_CLASS_ORDER, AssetClass, EquitySubClass } from "../taxonomy";

export function holdingValue(h: Holding): number {
  if (h.current_value != null) return h.current_value;
  if (h.invested_value != null) return h.invested_value;
  return 0;
}

export interface Exposure {
  holding_id: number;
  instrument_id: number;
  instrument_name: string;
  instrument_type: string;
  account: string;
  source: string;
  asset_class: string;
  sub_class: string | null;
  market_cap: string | null;
  sector: string | null;
  value: number;
  via_lookthrough: boolean;
  is_estimated: boolean;
}

export interface HoldingRow {
  id: number;
  instrument_id: number;
  name: string;
  instrument_type: string;
  symbol: string | null;
  isin: string | null;
  scheme_code: string | null;
  account: string;
  source: string;
  quantity: number;
  avg_cost: number | null;
  invested_value: number | null;
  current_value: number;
  last_price: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  asset_class: string;
  sub_class: string | null;
  market_cap: string | null;
  sector: string | null;
  confidence: string;
  is_estimated: boolean;
  amc: string | null;
  plan: string | null;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const EQUITY_CLASSES = [AssetClass.EQUITY, AssetClass.INTERNATIONAL_EQUITY];

export function buildHoldingRows(store: Store): HoldingRow[] {
  const rows: HoldingRow[] = [];
  for (const h of store.holdings) {
    const inst = store.instrument(h.instrument_id)!;
    const cls = store.classificationFor(inst.id);
    const acct = store.account(h.account_id)!;
    const value = holdingValue(h);
    const invested = h.invested_value ?? null;
    const pnl = invested != null ? value - invested : null;
    const pnl_pct = pnl != null && invested ? (pnl / invested) * 100 : null;
    rows.push({
      id: h.id, instrument_id: inst.id, name: inst.name, instrument_type: inst.instrument_type,
      symbol: inst.symbol ?? null, isin: inst.isin ?? null, scheme_code: inst.scheme_code ?? null,
      account: acct.name, source: h.source, quantity: h.quantity, avg_cost: h.avg_cost ?? null,
      invested_value: invested, current_value: value, last_price: h.last_price ?? null,
      pnl, pnl_pct,
      asset_class: cls?.asset_class ?? AssetClass.UNCLASSIFIED,
      sub_class: cls?.sub_class ?? null, market_cap: cls?.market_cap ?? null, sector: cls?.sector ?? null,
      confidence: cls?.confidence ?? "none", is_estimated: cls?.is_estimated ?? true,
      amc: inst.amc ?? null, plan: inst.plan ?? null,
    });
  }
  return rows;
}

export function buildExposures(store: Store): Exposure[] {
  const exposures: Exposure[] = [];
  for (const h of store.holdings) {
    const inst = store.instrument(h.instrument_id)!;
    const cls = store.classificationFor(inst.id);
    const acct = store.account(h.account_id)!;
    const value = holdingValue(h);
    if (value === 0) continue;
    const assetClass = cls?.asset_class ?? AssetClass.UNCLASSIFIED;
    const lookthrough = store.lookthroughFor(inst.id);
    const common = {
      holding_id: h.id, instrument_id: inst.id, instrument_name: inst.name,
      instrument_type: inst.instrument_type, account: acct.name, source: h.source,
    };
    if (lookthrough.length) {
      let covered = 0;
      for (const lt of lookthrough) {
        covered += lt.weight;
        exposures.push({
          ...common,
          asset_class: lt.asset_class, sub_class: lt.market_cap ?? null,
          market_cap: EQUITY_CLASSES.includes(lt.asset_class as any) ? lt.market_cap ?? null : null,
          sector: lt.sector ?? null, value: value * lt.weight, via_lookthrough: true, is_estimated: lt.is_estimated,
        });
      }
      if (covered < 0.999) {
        exposures.push({
          ...common,
          asset_class: assetClass, sub_class: cls?.sub_class ?? null, market_cap: cls?.market_cap ?? null,
          sector: cls?.sector ?? null, value: value * (1 - covered), via_lookthrough: true,
          is_estimated: cls?.is_estimated ?? true,
        });
      }
    } else {
      exposures.push({
        ...common,
        asset_class: assetClass, sub_class: cls?.sub_class ?? null, market_cap: cls?.market_cap ?? null,
        sector: cls?.sector ?? null, value, via_lookthrough: false, is_estimated: cls?.is_estimated ?? true,
      });
    }
  }
  return exposures;
}

export interface Slice { label: string; value: number; pct: number; }

export function group(items: [string, number][]): Slice[] {
  const agg: Record<string, number> = {};
  for (const [label, value] of items) agg[label] = (agg[label] ?? 0) + value;
  const total = Object.values(agg).reduce((a, b) => a + b, 0) || 1;
  const out = Object.entries(agg).map(([label, v]) => ({ label, value: round(v), pct: round((v / total) * 100) }));
  out.sort((a, b) => b.value - a.value);
  return out;
}

function orderedGroup(items: [string, number][], order: string[]): Slice[] {
  const grouped = new Map(group(items).map((d) => [d.label, d]));
  const out: Slice[] = [];
  for (const label of order) {
    if (grouped.has(label)) {
      out.push(grouped.get(label)!);
      grouped.delete(label);
    }
  }
  for (const d of grouped.values()) out.push(d);
  return out;
}

function capLabel(e: Exposure): string {
  if (e.asset_class === AssetClass.INTERNATIONAL_EQUITY) return EquitySubClass.INTERNATIONAL;
  return e.market_cap || e.sub_class || EquitySubClass.UNCLASSIFIED;
}
export { capLabel };

export function summary(store: Store): any {
  const rows = buildHoldingRows(store);
  const exposures = buildExposures(store);

  const net_worth = round(rows.reduce((a, r) => a + r.current_value, 0));
  const invested = round(rows.reduce((a, r) => a + (r.invested_value ?? 0), 0));
  const knownValue = rows.filter((r) => r.invested_value != null).reduce((a, r) => a + r.current_value, 0);
  const pnl = round(knownValue - invested);
  const pnl_pct = invested ? round((pnl / invested) * 100) : 0;
  const estimated_value = round(exposures.filter((e) => e.is_estimated).reduce((a, e) => a + e.value, 0));

  const byAsset = orderedGroup(exposures.map((e) => [e.asset_class, e.value] as [string, number]), ASSET_CLASS_ORDER);

  const equityExp = exposures.filter((e) => EQUITY_CLASSES.includes(e.asset_class as any));
  const equityCap = orderedGroup(equityExp.map((e) => [capLabel(e), e.value] as [string, number]), Object.values(EquitySubClass));

  const debtExp = exposures.filter((e) => e.asset_class === AssetClass.DEBT);
  const debtSplit = group(debtExp.map((e) => [e.sub_class || "Unclassified", e.value] as [string, number]));

  const goldExp = exposures.filter((e) => e.asset_class === AssetClass.GOLD);
  const goldSplit = group(goldExp.map((e) => [e.sub_class || "Unclassified", e.value] as [string, number]));

  const sectorExp = exposures.filter((e) => e.sector && EQUITY_CLASSES.includes(e.asset_class as any));
  const sectors = group(sectorExp.map((e) => [e.sector!, e.value] as [string, number]));

  const bySource = group(rows.map((r) => [r.source, r.current_value] as [string, number]));
  const byAccount = group(rows.map((r) => [r.account, r.current_value] as [string, number]));

  return {
    net_worth, invested, pnl, pnl_pct,
    estimated_value, estimated_pct: net_worth ? round((estimated_value / net_worth) * 100) : 0,
    holdings_count: rows.length,
    asset_allocation: byAsset, equity_cap_split: equityCap, debt_split: debtSplit, gold_split: goldSplit,
    sector_exposure: sectors, by_source: bySource, by_account: byAccount,
  };
}
