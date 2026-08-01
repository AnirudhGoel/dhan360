// Concentration, overlap, MF/stock analysis — TS mirror of backend/app/portfolio/analysis.py.

import { Store } from "../store/store";
import { InstrumentType } from "../taxonomy";
import { buildHoldingRows, group, holdingValue } from "./aggregate";

const round = (n: number) => Math.round(n * 100) / 100;

interface Contrib { name: string; sector: string | null; direct: number; via_fund: number; funds: Set<string>; }

function underlyingContributions(store: Store): Map<string, Contrib> {
  const contrib = new Map<string, Contrib>();
  const bump = (key: string, name: string, value: number, kind: "direct" | "via_fund", sector: string | null, via: string | null) => {
    let rec = contrib.get(key);
    if (!rec) {
      rec = { name, sector, direct: 0, via_fund: 0, funds: new Set() };
      contrib.set(key, rec);
    }
    rec[kind] += value;
    if (!rec.sector && sector) rec.sector = sector;
    if (via) rec.funds.add(via);
  };

  for (const h of store.holdings) {
    const inst = store.instrument(h.instrument_id)!;
    const value = holdingValue(h);
    if (value === 0) continue;
    if (inst.instrument_type === InstrumentType.STOCK) {
      const key = (inst.isin || inst.symbol || inst.name).toUpperCase();
      const sector = store.classificationFor(inst.id)?.sector ?? null;
      bump(key, inst.name, value, "direct", sector, null);
    }
    for (const lt of store.lookthroughFor(inst.id)) {
      if (lt.is_estimated) continue;
      const key = (lt.holding_isin || lt.holding_name).toUpperCase();
      bump(key, lt.holding_name, value * lt.weight, "via_fund", lt.sector ?? null, inst.name);
    }
  }
  return contrib;
}

export function stockConcentration(store: Store, top = 15): any {
  const contrib = underlyingContributions(store);
  const items = [...contrib.values()].map((rec) => ({
    name: rec.name, sector: rec.sector,
    direct_value: round(rec.direct), via_fund_value: round(rec.via_fund),
    value: round(rec.direct + rec.via_fund), funds: [...rec.funds].sort(),
    pct: 0,
  }));
  const grand = items.reduce((a, i) => a + i.value, 0) || 1;
  for (const i of items) i.pct = round((i.value / grand) * 100);
  items.sort((a, b) => b.value - a.value);
  return { total_equity_value: round(grand), holdings: items.slice(0, top), count: items.length };
}

export function portfolioOverlap(store: Store): any {
  const contrib = underlyingContributions(store);
  const overlaps: any[] = [];
  let overlapValue = 0;
  for (const rec of contrib.values()) {
    if (rec.direct > 0 && rec.via_fund > 0) {
      const v = rec.direct + rec.via_fund;
      overlapValue += v;
      overlaps.push({ name: rec.name, direct_value: round(rec.direct), via_fund_value: round(rec.via_fund), value: round(v), funds: [...rec.funds].sort() });
    }
  }
  overlaps.sort((a, b) => b.value - a.value);
  const total = [...contrib.values()].reduce((a, r) => a + r.direct + r.via_fund, 0) || 1;
  return {
    overlap_value: round(overlapValue),
    overlap_pct: round((overlapValue / total) * 100),
    overlaps,
    note: "Overlap uses disclosed fund portfolios only. Funds with estimated look-through are excluded to avoid false positives.",
  };
}

export function mutualFundAnalysis(store: Store): any {
  const rows = buildHoldingRows(store).filter((r) => r.instrument_type === InstrumentType.MUTUAL_FUND);
  const schemes = rows.map((r) => {
    const split: Record<string, number> = {};
    for (const lt of store.lookthroughFor(r.instrument_id)) {
      split[lt.asset_class] = (split[lt.asset_class] ?? 0) + r.current_value * lt.weight;
    }
    for (const k of Object.keys(split)) split[k] = round(split[k]);
    return {
      name: r.name, amc: r.amc, plan: r.plan, current_value: r.current_value, invested_value: r.invested_value,
      pnl: r.pnl, pnl_pct: r.pnl_pct, asset_class: r.asset_class, sub_class: r.sub_class,
      confidence: r.confidence, is_estimated: r.is_estimated, split,
    };
  });
  schemes.sort((a, b) => b.current_value - a.current_value);
  const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    schemes,
    by_amc: group(rows.map((r) => [r.amc || "Unknown", r.current_value] as [string, number])),
    by_plan: group(rows.map((r) => [title(r.plan || "unknown"), r.current_value] as [string, number])),
    total: round(rows.reduce((a, r) => a + r.current_value, 0)),
    count: rows.length,
  };
}

export function stockEtfAnalysis(store: Store): any {
  const rows = buildHoldingRows(store);
  const stocks = rows.filter((r) => r.instrument_type === InstrumentType.STOCK);
  const etfs = rows.filter((r) => r.instrument_type === InstrumentType.ETF);
  const fmt = (r: any) => ({
    name: r.name, symbol: r.symbol, current_value: r.current_value, invested_value: r.invested_value,
    pnl: r.pnl, pnl_pct: r.pnl_pct, asset_class: r.asset_class, market_cap: r.market_cap,
    sub_class: r.sub_class, sector: r.sector, confidence: r.confidence,
  });
  return {
    stocks: stocks.map(fmt).sort((a, b) => b.current_value - a.current_value),
    etfs: etfs.map(fmt).sort((a, b) => b.current_value - a.current_value),
    stock_cap_split: group(stocks.map((r) => [r.market_cap || "Unclassified", r.current_value] as [string, number])),
    stock_sectors: group(stocks.filter((r) => r.sector).map((r) => [r.sector!, r.current_value] as [string, number])),
    total_direct_equity: round(stocks.reduce((a, r) => a + r.current_value, 0)),
  };
}
