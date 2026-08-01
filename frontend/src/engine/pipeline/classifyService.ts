// Classification persistence + override index — TS mirror of
// backend/app/classify/overrides.py + services/classification_service.py.

import { Store } from "../store/store";
import { Instrument, Override as OverrideRow, Classification } from "../store/model";
import { classify, ClassifyInput, Override } from "../classify/engine";

export class OverrideIndex {
  private by: Record<string, Record<string, Override>> = {
    isin: {}, symbol: {}, scheme_code: {}, name: {},
  };
  static fromRows(rows: OverrideRow[]): OverrideIndex {
    const idx = new OverrideIndex();
    for (const row of rows) {
      const payload: Override = {};
      if (row.asset_class != null) payload.asset_class = row.asset_class;
      if (row.sub_class != null) payload.sub_class = row.sub_class;
      if (row.sector != null) payload.sector = row.sector;
      if (row.market_cap != null) payload.market_cap = row.market_cap;
      const bucket = idx.by[row.key_type];
      if (bucket) bucket[row.key_value.trim().toUpperCase()] = payload;
    }
    return idx;
  }
  match(isin?: string | null, symbol?: string | null, schemeCode?: string | null, name?: string | null): Override | null {
    for (const [keyType, value] of [
      ["isin", isin], ["symbol", symbol], ["scheme_code", schemeCode], ["name", name],
    ] as [string, string | null | undefined][]) {
      if (value) {
        const hit = this.by[keyType][value.trim().toUpperCase()];
        if (hit) return hit;
      }
    }
    return null;
  }
}

export function loadOverrideIndex(store: Store): OverrideIndex {
  return OverrideIndex.fromRows(store.overrides);
}

function buildInput(inst: Instrument): ClassifyInput {
  let categoryHint: string | null = null;
  if (inst.extra) {
    try {
      const extra = JSON.parse(inst.extra);
      categoryHint = extra.scheme_type ?? extra.category ?? null;
    } catch {
      /* ignore */
    }
  }
  return {
    name: inst.name,
    instrument_type: inst.instrument_type,
    isin: inst.isin,
    symbol: inst.symbol,
    scheme_code: inst.scheme_code,
    amc: inst.amc,
    plan: inst.plan,
    category_hint: categoryHint,
  };
}

export function classifyInstrument(store: Store, inst: Instrument, index: OverrideIndex): Classification {
  const inp = buildInput(inst);
  const override = index.match(inst.isin, inst.symbol, inst.scheme_code, inst.name);
  const result = classify(inp, override);

  if (result.refined_type && inst.instrument_type !== result.refined_type) {
    inst.instrument_type = result.refined_type;
  }

  const own = store.lookthroughFor(inst.id);
  const disclosed = own.filter((lt) => !lt.is_estimated);
  let hasLookthrough: boolean;
  let isEstimated: boolean;
  if (disclosed.length) {
    hasLookthrough = true;
    isEstimated = false;
  } else {
    // remove prior estimated rows, add fresh estimates
    store.lookthrough = store.lookthrough.filter((lt) => !(lt.instrument_id === inst.id && lt.is_estimated));
    for (const row of result.lookthrough) {
      store.lookthrough.push({
        id: store.nextId("lookthrough"),
        instrument_id: inst.id,
        holding_name: row.holding_name,
        holding_isin: row.holding_isin ?? null,
        weight: row.weight,
        asset_class: row.asset_class,
        market_cap: row.market_cap ?? null,
        sector: row.sector ?? null,
        is_estimated: true,
      });
    }
    hasLookthrough = result.lookthrough.length > 0;
    isEstimated = result.is_estimated;
  }

  let existing = store.classificationFor(inst.id);
  if (!existing) {
    existing = {
      id: store.nextId("classifications"), instrument_id: inst.id,
      asset_class: "", confidence: "", is_estimated: false, has_lookthrough: false,
    };
    store.classifications.push(existing);
  }
  existing.asset_class = result.asset_class;
  existing.sub_class = result.sub_class;
  existing.sector = result.sector;
  existing.market_cap = result.market_cap;
  existing.confidence = result.confidence;
  existing.is_estimated = isEstimated;
  existing.rationale = result.rationale;
  existing.has_lookthrough = hasLookthrough;
  return existing;
}

export function reclassifyAll(store: Store): number {
  const index = loadOverrideIndex(store);
  for (const inst of store.instruments) classifyInstrument(store, inst, index);
  return store.instruments.length;
}
