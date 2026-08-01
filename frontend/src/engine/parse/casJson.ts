// CAS JSON (casparser format) → TS mirror of backend/app/parsers/cas_json.py.

import { InstrumentType, Source } from "../taxonomy";
import { ParsedTxn, ParseResult, holding } from "./types";
import { parseDate, round2 } from "./csv";

function planFrom(advisor: string | null | undefined, schemeName: string): string {
  const a = (advisor || "").trim().toUpperCase();
  if (a === "DIRECT" || schemeName.toLowerCase().includes("direct")) return "direct";
  return "regular";
}

export function parseCasJson(data: any, fileName: string | null = null, source: string = Source.CAS_JSON): ParseResult {
  const result = new ParseResult(source, fileName);
  const folios = data?.folios ?? [];
  if (!folios.length) {
    result.error("CAS contains no folios.");
    return result;
  }
  for (const folio of folios) {
    const amc = folio.amc ?? null;
    const folioNo = folio.folio ?? null;
    for (const scheme of folio.schemes ?? []) {
      const name = (scheme.scheme ?? "").trim();
      if (!name) continue;
      const qty = Number(scheme.close ?? 0) || 0;
      if (qty <= 0) {
        result.warn(`Skipped ${name}: zero closing balance.`, folioNo);
        continue;
      }
      const valuation = scheme.valuation ?? {};
      const curVal = valuation.value;
      const nav = valuation.nav;

      let invested: number | null = null;
      const parsedTxns: ParsedTxn[] = [];
      const txns = scheme.transactions ?? [];
      if (txns.length) {
        let total = 0;
        let seen = false;
        for (const t of txns) {
          if (t.amount === null || t.amount === undefined) continue;
          const amt = Number(t.amount);
          if (Number.isNaN(amt)) continue;
          total += amt;
          seen = true;
          const tdate = parseDate(t.date);
          if (!tdate) continue;
          const ttype = (t.type ?? "").toUpperCase();
          let kind = "buy";
          if (ttype.includes("DIVIDEND") && ttype.includes("PAYOUT")) kind = "dividend";
          else if (amt >= 0) kind = "buy";
          else kind = "sell";
          parsedTxns.push({
            date: tdate,
            kind,
            amount: round2(-amt),
            units: t.units != null ? Number(t.units) : null,
          });
        }
        invested = seen ? round2(total) : null;
      }

      result.holdings.push(holding({
        name,
        instrument_type: InstrumentType.MUTUAL_FUND,
        isin: (scheme.isin ?? "").trim().toUpperCase() || null,
        scheme_code: scheme.amfi != null ? String(scheme.amfi).trim() : null,
        quantity: qty,
        current_value: curVal != null ? Number(curVal) : null,
        last_price: nav != null ? Number(nav) : null,
        invested_value: invested,
        amc,
        plan: planFrom(scheme.advisor, name),
        folio: folioNo,
        source,
        account_name: amc || "Mutual Funds",
        account_kind: "mf_folio",
        account_identifier: folioNo,
        institution: amc,
        category_hint: scheme.type ?? null,
        transactions: parsedTxns,
        raw: { rta: scheme.rta ?? null, scheme_type: scheme.type ?? null },
      }));
    }
  }
  result.info(`Parsed ${result.holdings.length} schemes from CAS.`);
  return result;
}
