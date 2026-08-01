// Classification engine — TS mirror of backend/app/classify/engine.py.
// Pipeline (highest authority first): override → explicit hint → exact ref-data → name
// heuristics → graceful Unclassified. Mutual funds get estimated look-through rows.

import { classifyByName } from "./heuristics";
import { AssetClass, Confidence, DebtSubClass, EquitySubClass, GoldSubClass, InstrumentType } from "../taxonomy";
import { lookupEtf, lookupScheme, lookupStock, matchMfCategory } from "../refdata";

export interface ClassifyInput {
  name: string;
  instrument_type: string;
  isin?: string | null;
  symbol?: string | null;
  scheme_code?: string | null;
  amc?: string | null;
  plan?: string | null;
  category_hint?: string | null;
  sector_hint?: string | null;
  market_cap_hint?: string | null;
}

export interface LookthroughRow {
  holding_name: string;
  weight: number;
  asset_class: string;
  market_cap?: string | null;
  sector?: string | null;
  holding_isin?: string | null;
}

export interface ClassificationResult {
  asset_class: string;
  sub_class: string | null;
  market_cap: string | null;
  sector: string | null;
  confidence: string;
  is_estimated: boolean;
  rationale: string;
  refined_type?: string | null;
  lookthrough: LookthroughRow[];
}

export interface Override {
  asset_class?: string | null;
  sub_class?: string | null;
  market_cap?: string | null;
  sector?: string | null;
}

const ASSET_CLASS_VALUES: Record<string, string> = Object.fromEntries(
  Object.values(AssetClass).map((a) => [a.toLowerCase(), a])
);

function round(n: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function explicitAssetClass(hint?: string | null): string | null {
  if (!hint) return null;
  return ASSET_CLASS_VALUES[hint.trim().toLowerCase()] ?? null;
}

function res(p: Partial<ClassificationResult> & { asset_class: string; confidence: string; rationale: string }): ClassificationResult {
  return {
    sub_class: null, market_cap: null, sector: null, is_estimated: false,
    refined_type: null, lookthrough: [], ...p,
  };
}

function applyOverride(base: ClassificationResult, o: Override): ClassificationResult {
  return {
    asset_class: o.asset_class || base.asset_class,
    sub_class: o.sub_class != null ? o.sub_class : base.sub_class,
    market_cap: o.market_cap != null ? o.market_cap : base.market_cap,
    sector: o.sector != null ? o.sector : base.sector,
    confidence: Confidence.MANUAL,
    is_estimated: false,
    rationale: "User override applied.",
    refined_type: base.refined_type,
    lookthrough: base.lookthrough,
  };
}

function classifyStock(inp: ClassifyInput): ClassificationResult {
  const ref = lookupStock(inp.symbol, inp.isin);
  if (ref) {
    return res({
      asset_class: AssetClass.EQUITY, sub_class: ref.market_cap ?? null, market_cap: ref.market_cap ?? null,
      sector: ref.sector ?? inp.sector_hint ?? null, confidence: Confidence.HIGH,
      rationale: `Matched direct-equity reference for ${ref.symbol ?? inp.symbol}.`,
    });
  }
  return res({
    asset_class: AssetClass.EQUITY,
    sub_class: inp.market_cap_hint || EquitySubClass.UNCLASSIFIED,
    market_cap: inp.market_cap_hint || EquitySubClass.UNCLASSIFIED,
    sector: inp.sector_hint ?? null, confidence: Confidence.MEDIUM,
    rationale: "Direct equity (not in reference list); market cap unknown.",
  });
}

function classifyEtf(inp: ClassifyInput): ClassificationResult {
  const ref = lookupEtf(inp.symbol);
  if (ref) {
    return res({
      asset_class: ref.asset_class, sub_class: ref.sub_class ?? null,
      market_cap: ref.asset_class === AssetClass.EQUITY ? ref.sub_class ?? null : null,
      sector: ref.sector ?? null, confidence: Confidence.HIGH,
      rationale: `Matched known ETF '${ref.name}'.`, refined_type: InstrumentType.ETF,
    });
  }
  const guess = classifyByName(inp.name);
  if (guess) {
    const [ac, sub, sector] = guess;
    return res({
      asset_class: ac, sub_class: sub, market_cap: ac === AssetClass.EQUITY ? sub : null,
      sector: sector ?? inp.sector_hint ?? null, confidence: Confidence.MEDIUM,
      rationale: "ETF classified from name keywords (not in ETF map).", refined_type: InstrumentType.ETF,
    });
  }
  return res({
    asset_class: AssetClass.EQUITY, sub_class: EquitySubClass.UNCLASSIFIED, market_cap: EquitySubClass.UNCLASSIFIED,
    confidence: Confidence.LOW, is_estimated: true,
    rationale: "Unknown ETF; assumed equity with unknown cap.", refined_type: InstrumentType.ETF,
  });
}

function buildMfLookthrough(record: any): LookthroughRow[] {
  const rows: LookthroughRow[] = [];
  const assetSplit = record.asset_split;
  const equitySplit = record.equity_split;
  if (assetSplit) {
    for (const [assetClass, w] of Object.entries(assetSplit as Record<string, number>)) {
      if (assetClass === AssetClass.EQUITY && equitySplit) {
        for (const [cap, cw] of Object.entries(equitySplit as Record<string, number>)) {
          rows.push({ holding_name: `Equity (${cap}) — estimated`, weight: round(w * cw), asset_class: AssetClass.EQUITY, market_cap: cap });
        }
      } else {
        rows.push({ holding_name: `${assetClass} — estimated`, weight: round(w), asset_class: assetClass });
      }
    }
  } else if (equitySplit) {
    for (const [cap, cw] of Object.entries(equitySplit as Record<string, number>)) {
      rows.push({ holding_name: `Equity (${cap}) — estimated`, weight: round(cw), asset_class: AssetClass.EQUITY, market_cap: cap });
    }
  }
  return rows;
}

function classifyMf(inp: ClassifyInput): ClassificationResult {
  let category: string | null = null;
  let confidence: string = Confidence.MEDIUM;
  const scheme = lookupScheme(inp.scheme_code);
  if (scheme) {
    category = scheme.category ?? null;
    confidence = Confidence.HIGH;
  }
  const match = matchMfCategory(category ?? inp.category_hint, inp.name);
  if (match) {
    const [catName, record] = match;
    const lookthrough = buildMfLookthrough(record);
    return res({
      asset_class: record.asset_class, sub_class: record.sub_class ?? null,
      market_cap: record.asset_class === AssetClass.EQUITY ? record.sub_class ?? null : null,
      confidence, is_estimated: lookthrough.length > 0,
      rationale: `Mapped to SEBI category '${catName}'` + (scheme ? ` via AMFI code ${inp.scheme_code}.` : " by name/category."),
      lookthrough,
    });
  }
  const coarse = (inp.category_hint ?? "").trim().toUpperCase();
  if (["EQUITY", "DEBT", "HYBRID", "OTHER"].includes(coarse)) {
    const ac = { EQUITY: AssetClass.EQUITY, DEBT: AssetClass.DEBT, HYBRID: AssetClass.EQUITY, OTHER: AssetClass.OTHERS }[coarse]!;
    return res({
      asset_class: ac,
      sub_class: ac === AssetClass.EQUITY ? EquitySubClass.UNCLASSIFIED : DebtSubClass.UNCLASSIFIED,
      market_cap: ac === AssetClass.EQUITY ? EquitySubClass.UNCLASSIFIED : null,
      confidence: Confidence.LOW, is_estimated: true,
      rationale: `Coarse CAS scheme type '${coarse}'; sub-classification unknown.`,
    });
  }
  const guess = classifyByName(inp.name);
  if (guess) {
    const [ac, sub, sector] = guess;
    return res({
      asset_class: ac, sub_class: sub, market_cap: ac === AssetClass.EQUITY ? sub : null, sector,
      confidence: Confidence.LOW, is_estimated: true, rationale: "Mutual fund classified from name keywords.",
    });
  }
  return res({
    asset_class: AssetClass.UNCLASSIFIED, confidence: Confidence.NONE, is_estimated: true,
    rationale: "Could not classify this mutual fund from available data.",
  });
}

const FIXED: Record<string, [string, string | null]> = {
  [InstrumentType.SGB]: [AssetClass.GOLD, GoldSubClass.SGB],
  [InstrumentType.DIGITAL_GOLD]: [AssetClass.GOLD, GoldSubClass.DIGITAL_GOLD],
  [InstrumentType.GSEC]: [AssetClass.DEBT, DebtSubClass.GILT],
  [InstrumentType.BOND]: [AssetClass.DEBT, DebtSubClass.CORPORATE_BOND],
  [InstrumentType.FD]: [AssetClass.DEBT, DebtSubClass.FD],
  [InstrumentType.PPF]: [AssetClass.DEBT, DebtSubClass.PPF],
  [InstrumentType.EPF]: [AssetClass.DEBT, DebtSubClass.PPF],
  [InstrumentType.NPS]: [AssetClass.DEBT, DebtSubClass.NPS_DEBT],
  [InstrumentType.CASH]: [AssetClass.CASH, DebtSubClass.CASH],
  [InstrumentType.REIT]: [AssetClass.REAL_ESTATE, "REIT"],
  [InstrumentType.INVIT]: [AssetClass.REAL_ESTATE, "InvIT"],
  [InstrumentType.REAL_ESTATE]: [AssetClass.REAL_ESTATE, "Property"],
};

function looksLikeEtf(inp: ClassifyInput): boolean {
  if (lookupEtf(inp.symbol)) return true;
  const sym = (inp.symbol ?? "").toUpperCase();
  if (sym.endsWith("BEES") || sym.endsWith("ETF")) return true;
  return inp.name.toUpperCase().includes("ETF");
}

export function classify(inp: ClassifyInput, override?: Override | null): ClassificationResult {
  let itype = inp.instrument_type;
  if (itype === InstrumentType.STOCK && looksLikeEtf(inp)) itype = InstrumentType.ETF;

  let base: ClassificationResult;
  if (itype === InstrumentType.STOCK) base = classifyStock(inp);
  else if (itype === InstrumentType.ETF) base = classifyEtf(inp);
  else if (itype === InstrumentType.MUTUAL_FUND) base = classifyMf(inp);
  else if (itype in FIXED) {
    const [ac, sub] = FIXED[itype];
    base = res({
      asset_class: ac, sub_class: sub, sector: inp.sector_hint ?? null,
      confidence: Confidence.HIGH, rationale: `Fixed mapping for instrument type '${itype}'.`,
    });
  } else {
    base = res({
      asset_class: AssetClass.OTHERS, sector: inp.sector_hint ?? null,
      confidence: Confidence.LOW, rationale: `Uncategorized instrument type '${itype}'.`,
    });
  }

  const explicit = explicitAssetClass(inp.category_hint);
  if (explicit && [Confidence.LOW, Confidence.NONE, Confidence.MEDIUM].includes(base.confidence as any)) {
    base.asset_class = explicit;
    base.rationale = `Asset class set from source hint '${explicit}'. ` + base.rationale;
    base.confidence = Confidence.MEDIUM;
  }

  return override ? applyOverride(base, override) : base;
}
