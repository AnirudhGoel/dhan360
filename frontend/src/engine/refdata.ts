// Reference-data lookups — TS mirror of backend/app/refdata/loader.py.
// The JSON files are copied verbatim from the backend (single source of truth).

import etfRaw from "./data/etf_map.json";
import stocksRaw from "./data/stocks.json";
import mfCatRaw from "./data/mf_categories.json";
import amfiRaw from "./data/amfi_schemes.json";

type Dict = Record<string, any>;

function stripDocs(obj: Dict): Dict {
  const out: Dict = {};
  for (const [k, v] of Object.entries(obj)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

function upperKeys(obj: Dict): Dict {
  const out: Dict = {};
  for (const [k, v] of Object.entries(obj)) out[k.toUpperCase()] = v;
  return out;
}

const ETF_MAP = upperKeys(stripDocs(etfRaw as Dict));
const STOCKS = upperKeys(stripDocs(stocksRaw as Dict));
const MF_CATEGORIES: Dict = (mfCatRaw as Dict).categories ?? {};
const AMFI = stripDocs(amfiRaw as Dict);

const STOCKS_BY_ISIN: Dict = (() => {
  const out: Dict = {};
  for (const [symbol, info] of Object.entries(STOCKS)) {
    const isin = (info as Dict).isin;
    if (isin) out[String(isin).toUpperCase()] = { ...(info as Dict), symbol };
  }
  return out;
})();

export function lookupEtf(symbol?: string | null): Dict | null {
  if (!symbol) return null;
  return ETF_MAP[symbol.toUpperCase()] ?? null;
}

export function lookupStock(symbol?: string | null, isin?: string | null): Dict | null {
  if (symbol) {
    const hit = STOCKS[symbol.toUpperCase()];
    if (hit) return { ...hit, symbol: symbol.toUpperCase() };
  }
  if (isin) {
    const hit = STOCKS_BY_ISIN[isin.toUpperCase()];
    if (hit) return hit;
  }
  return null;
}

export function lookupScheme(schemeCode?: string | null): Dict | null {
  if (!schemeCode) return null;
  return AMFI[String(schemeCode).trim()] ?? null;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();
}

export function matchMfCategory(
  category?: string | null,
  schemeName?: string | null
): [string, Dict] | null {
  const cats = MF_CATEGORIES;
  if (category) {
    for (const [name, rec] of Object.entries(cats)) {
      if (name.toLowerCase() === category.toLowerCase()) return [name, rec as Dict];
    }
    const ncat = norm(category);
    for (const [name, rec] of Object.entries(cats)) {
      const nn = norm(name);
      if (nn.includes(ncat) || ncat.includes(nn)) return [name, rec as Dict];
    }
  }
  if (schemeName) {
    const nname = norm(schemeName);
    let best: [string, Dict] | null = null;
    for (const [name, rec] of Object.entries(cats)) {
      if (nname.includes(norm(name))) {
        if (best === null || name.length > best[0].length) best = [name, rec as Dict];
      }
    }
    if (best) return best;
  }
  return null;
}
