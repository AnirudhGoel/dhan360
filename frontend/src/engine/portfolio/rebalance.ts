// Rebalancing — TS mirror of backend/app/portfolio/rebalance.py.

import { Store } from "../store/store";
import { ASSET_CLASS_ORDER, AssetClass } from "../taxonomy";
import { summary } from "./aggregate";

const round = (n: number) => Math.round(n * 100) / 100;

const SELL_WARNINGS: Record<string, string> = {
  [AssetClass.EQUITY]: "Equity/equity-fund sales: LTCG (>1yr) taxed 12.5% above ₹1.25L/yr; STCG (<1yr) at 20%. Equity funds may levy ~1% exit load if <1yr.",
  [AssetClass.INTERNATIONAL_EQUITY]: "International funds are taxed like debt/non-equity for many schemes — confirm the scheme's tax treatment and holding period.",
  [AssetClass.DEBT]: "Debt fund gains are taxed at your slab rate (post-Apr-2023 units). Check exit load on short-duration/credit funds.",
  [AssetClass.GOLD]: "Gold funds/ETFs: gains taxable; SGBs are illiquid before maturity and best redeemed at the RBI window/exchange.",
};

function targetsMap(store: Store): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of store.targets) if (t.level === "asset_class") out[t.bucket] = t.target_pct;
  return out;
}

export function rebalancePlan(store: Store, mode: "rebalance" | "new_money" = "rebalance", newMoney = 0): any {
  const s = summary(store);
  const netWorth = s.net_worth;
  const currentByClass = new Map<string, { value: number; pct: number }>(
    s.asset_allocation.map((d: any) => [d.label, d])
  );
  const targets = targetsMap(store);

  const buckets = [...new Set([...ASSET_CLASS_ORDER, ...currentByClass.keys(), ...Object.keys(targets)])];
  const newTotal = netWorth + (mode === "new_money" ? newMoney : 0);
  const lines: any[] = [];

  for (const bucket of buckets) {
    const cur = currentByClass.get(bucket);
    const curValue = cur ? cur.value : 0;
    const curPct = cur ? cur.pct : 0;
    let targetPct = targets[bucket];
    if (targetPct === undefined && curValue === 0) continue;
    targetPct = targetPct || 0;
    const targetValue = round((targetPct / 100) * newTotal);
    const driftPct = round(curPct - targetPct);
    const driftValue = round(curValue - targetValue);

    let action: string;
    let amount: number;
    if (mode === "new_money") {
      const suggested = round(Math.max(0, targetValue - curValue));
      action = suggested > 0 ? "buy" : "hold";
      amount = suggested;
    } else {
      action = driftValue > 0 ? "sell" : driftValue < 0 ? "buy" : "hold";
      amount = round(Math.abs(driftValue));
    }
    const warnings: string[] = [];
    if (action === "sell" && SELL_WARNINGS[bucket]) warnings.push(SELL_WARNINGS[bucket]);

    lines.push({
      bucket, current_value: round(curValue), current_pct: round(curPct),
      target_pct: round(targetPct), target_value: targetValue, drift_pct: driftPct, drift_value: driftValue,
      action, amount,
      status: driftValue > 1 ? "overweight" : driftValue < -1 ? "underweight" : "on target",
      warnings,
    });
  }

  if (mode === "new_money" && newMoney > 0) {
    const totalBuy = lines.filter((l) => l.action === "buy").reduce((a, l) => a + l.amount, 0);
    if (totalBuy > 0) {
      const scale = newMoney / totalBuy;
      for (const l of lines) if (l.action === "buy") l.amount = round(l.amount * scale);
    }
  }

  return {
    mode, new_money: newMoney, net_worth: netWorth,
    has_targets: Object.keys(targets).length > 0,
    targets_sum: round(Object.values(targets).reduce((a, b) => a + b, 0)),
    lines,
    disclaimer: "Informational drift analysis only — not personalized investment advice. Verify tax, holding period and exit loads before acting.",
  };
}
