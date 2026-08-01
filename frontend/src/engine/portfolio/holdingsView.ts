// Holdings table view with click-to-filter — TS mirror of backend/app/portfolio/holdings_view.py.
// Filtering by cap/sector/sub-class includes funds that contribute via look-through.

import { Store } from "../store/store";
import { AssetClass } from "../taxonomy";
import { Exposure, HoldingRow, buildExposures, buildHoldingRows, capLabel } from "./aggregate";

const EQUITY_CLASSES = [AssetClass.EQUITY, AssetClass.INTERNATIONAL_EQUITY];
const round = (n: number) => Math.round(n * 100) / 100;

export interface HoldingsFilter {
  asset_class?: string | null;
  cap?: string | null;
  sub_class?: string | null;
  sector?: string | null;
  source?: string | null;
  account?: string | null;
}

export function holdingsPayload(store: Store, f: HoldingsFilter = {}): (HoldingRow & { contribution: number | null })[] {
  const rows = buildHoldingRows(store);
  const byHolding = new Map<number, Exposure[]>();
  for (const e of buildExposures(store)) {
    if (!byHolding.has(e.holding_id)) byHolding.set(e.holding_id, []);
    byHolding.get(e.holding_id)!.push(e);
  }

  const out: (HoldingRow & { contribution: number | null })[] = [];
  for (const r of rows) {
    const exps = byHolding.get(r.id) ?? [];

    const tagsAc = new Set(exps.map((e) => e.asset_class));
    if (tagsAc.size === 0) tagsAc.add(r.asset_class);
    const tagsCap = new Set(exps.filter((e) => EQUITY_CLASSES.includes(e.asset_class as any)).map(capLabel));
    if (r.market_cap) tagsCap.add(r.market_cap);
    const tagsSub = new Set(exps.filter((e) => e.sub_class).map((e) => e.sub_class!));
    if (r.sub_class) tagsSub.add(r.sub_class);
    const tagsSector = new Set(exps.filter((e) => e.sector).map((e) => e.sector!));
    if (r.sector) tagsSector.add(r.sector);

    if (f.asset_class && !tagsAc.has(f.asset_class)) continue;
    if (f.cap && !tagsCap.has(f.cap)) continue;
    if (f.sub_class && !tagsSub.has(f.sub_class) && !tagsCap.has(f.sub_class)) continue;
    if (f.sector && !tagsSector.has(f.sector)) continue;
    if (f.source && r.source !== f.source) continue;
    if (f.account && r.account !== f.account) continue;

    let contribution: number | null = null;
    if (f.cap) contribution = exps.filter((e) => EQUITY_CLASSES.includes(e.asset_class as any) && capLabel(e) === f.cap).reduce((a, e) => a + e.value, 0);
    else if (f.sector) contribution = exps.filter((e) => e.sector === f.sector).reduce((a, e) => a + e.value, 0);
    else if (f.sub_class) contribution = exps.filter((e) => e.sub_class === f.sub_class).reduce((a, e) => a + e.value, 0);
    else if (f.asset_class) contribution = exps.filter((e) => e.asset_class === f.asset_class).reduce((a, e) => a + e.value, 0);

    out.push({ ...r, contribution: contribution != null ? round(contribution) : null });
  }
  out.sort((a, b) => b.current_value - a.current_value);
  return out;
}
