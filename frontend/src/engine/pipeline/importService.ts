// Import orchestration — TS mirror of backend/app/services/import_service.py.
// parse result → reconcile → persist transactions → classify → counts.

import { Store } from "../store/store";
import { ImportBatch } from "../store/model";
import { AssetClass } from "../taxonomy";
import { ParseResult, ParsedHolding } from "../parse/types";
import { findOrCreateAccount, findOrCreateInstrument, upsertHolding } from "./reconcile";
import { classifyInstrument, loadOverrideIndex } from "./classifyService";

function persistTransactions(store: Store, accountId: number, instrumentId: number, h: ParsedHolding, importId: number): void {
  if (!h.transactions.length) return;
  // Idempotent: re-importing the same source for this instrument+account replaces the set.
  store.transactions = store.transactions.filter(
    (t) => !(t.instrument_id === instrumentId && t.account_id === accountId && t.source === h.source)
  );
  for (const t of h.transactions) {
    store.transactions.push({
      id: store.nextId("transactions"),
      instrument_id: instrumentId,
      account_id: accountId,
      date: t.date,
      kind: t.kind,
      units: t.units ?? null,
      amount: t.amount,
      price: t.price ?? null,
      folio: h.folio ?? null,
      source: h.source,
      import_id: importId,
    });
  }
}

export function processParseResult(store: Store, result: ParseResult): ImportBatch {
  const batch: ImportBatch = {
    id: store.nextId("imports"),
    source: result.source,
    file_name: result.file_name,
    status: result.hasError() ? "failed" : "completed",
    count_parsed: result.holdings.length,
    count_imported: 0, count_merged: 0, count_duplicate: 0, count_skipped: 0, count_unclassified: 0,
    diagnostics: JSON.stringify(result.diagnostics),
    created_at: new Date().toISOString(),
  };
  store.imports.push(batch);

  const index = loadOverrideIndex(store);
  let imported = 0, merged = 0, duplicate = 0, unclassified = 0;
  const skipped = result.diagnostics.filter((d) => d.message.includes("Skipped")).length;

  for (const h of result.holdings) {
    const account = findOrCreateAccount(store, h);
    const [instrument, existed] = findOrCreateInstrument(store, h);
    const outcome = upsertHolding(store, account, instrument, h, batch.id);
    if (outcome === "duplicate") duplicate++;
    else {
      imported++;
      if (existed) merged++;
    }
    persistTransactions(store, account.id, instrument.id, h, batch.id);
    const cls = classifyInstrument(store, instrument, index);
    if (cls.asset_class === AssetClass.UNCLASSIFIED) unclassified++;
  }

  batch.count_imported = imported;
  batch.count_merged = merged;
  batch.count_duplicate = duplicate;
  batch.count_skipped = skipped;
  batch.count_unclassified = unclassified;
  return batch;
}
