// Transactions view — TS mirror of backend/app/portfolio/transactions_view.py.

import { Store } from "../store/store";

const round = (n: number) => Math.round(n * 100) / 100;

export function transactionsPayload(store: Store): any {
  const rows: any[] = [];
  let totalIn = 0;
  let totalOut = 0;
  const sorted = store.transactions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  for (const t of sorted) {
    const inst = store.instrument(t.instrument_id)!;
    const cls = store.classificationFor(inst.id);
    const acct = t.account_id != null ? store.account(t.account_id) : undefined;
    if (t.amount < 0) totalOut += -t.amount;
    else totalIn += t.amount;
    rows.push({
      id: t.id,
      date: t.date,
      instrument: inst.name,
      symbol: inst.symbol ?? inst.scheme_code ?? inst.isin ?? null,
      instrument_type: inst.instrument_type,
      asset_class: cls?.asset_class ?? "Unclassified",
      kind: t.kind,
      units: t.units ?? null,
      amount: round(t.amount),
      direction: t.amount < 0 ? "out" : "in",
      price: t.price ?? null,
      account: acct?.name ?? null,
      source: t.source,
    });
  }
  return {
    transactions: rows,
    count: rows.length,
    total_invested_out: round(totalOut),
    total_in: round(totalIn),
  };
}
