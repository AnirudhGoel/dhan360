// Name-based classification heuristics — TS mirror of backend/app/classify/heuristics.py.
// Ordered most-specific-first; the first hit wins. Conservative by design.

import { AssetClass, DebtSubClass, EquitySubClass, GoldSubClass } from "../taxonomy";

type Rule = [string[], string, string | null];

const RULES: Rule[] = [
  [["gold"], AssetClass.GOLD, GoldSubClass.GOLD_ETF],
  [["sovereign gold", "sgb"], AssetClass.GOLD, GoldSubClass.SGB],
  [["silver"], AssetClass.OTHERS, "Silver"],

  [["nasdaq", "fang", "s&p 500", "sp 500", "s & p 500"], AssetClass.INTERNATIONAL_EQUITY, EquitySubClass.INTERNATIONAL],
  [["us equity", "u.s.", "global", "international", "overseas", "hang seng", "china", "emerging market", "world"], AssetClass.INTERNATIONAL_EQUITY, EquitySubClass.INTERNATIONAL],

  [["liquid", "overnight", "money market"], AssetClass.DEBT, DebtSubClass.LIQUID_OVERNIGHT],
  [["gilt", "g-sec", "gsec", "g sec", "government securities"], AssetClass.DEBT, DebtSubClass.GILT],
  [["bharat bond", "corporate bond", "banking & psu", "banking and psu", "psu bond", "credit risk"], AssetClass.DEBT, DebtSubClass.CORPORATE_BOND],
  [["ultra short", "low duration", "short duration", "short term", "money manager"], AssetClass.DEBT, DebtSubClass.SHORT_DURATION],
  [["bond", "debt", "duration", "income fund", "fixed maturity", "fmp"], AssetClass.DEBT, DebtSubClass.UNCLASSIFIED],

  [["reit", "invit", "real estate", "realty"], AssetClass.REAL_ESTATE, null],

  [["small cap", "smallcap"], AssetClass.EQUITY, EquitySubClass.SMALL_CAP],
  [["mid cap", "midcap", "midcap 150", "nifty next 50"], AssetClass.EQUITY, EquitySubClass.MID_CAP],
  [["large & mid", "large and mid"], AssetClass.EQUITY, EquitySubClass.LARGE_CAP],
  [["large cap", "largecap", "nifty 50", "nifty50", "sensex", "top 100", "bluechip"], AssetClass.EQUITY, EquitySubClass.LARGE_CAP],
  [["flexi cap", "flexicap", "multi cap", "multicap", "focused", "elss", "tax saver", "value", "contra", "dividend yield", "index"], AssetClass.EQUITY, EquitySubClass.LARGE_CAP],
  [["equity", "nifty", "etf"], AssetClass.EQUITY, EquitySubClass.UNCLASSIFIED],
];

export function classifyByName(name: string): [string, string | null, string | null] | null {
  const n = name.toLowerCase();
  for (const [keywords, assetClass, subClass] of RULES) {
    if (keywords.some((k) => n.includes(k))) return [assetClass, subClass, null];
  }
  return null;
}
