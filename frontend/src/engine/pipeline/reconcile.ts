// Reconciliation — TS mirror of backend/app/reconcile/reconciler.py, operating on the Store.

import { Store } from "../store/store";
import { Account, Instrument } from "../store/model";
import { ParsedHolding } from "../parse/types";
import { Source } from "../taxonomy";

export function findOrCreateAccount(store: Store, h: ParsedHolding): Account {
  const identifier = h.account_identifier ?? null;
  let acct = identifier
    ? store.accounts.find((a) => a.kind === h.account_kind && a.identifier === identifier)
    : store.accounts.find((a) => a.kind === h.account_kind && a.name === h.account_name);
  if (acct) return acct;
  acct = {
    id: store.nextId("accounts"),
    name: h.account_name,
    kind: h.account_kind,
    identifier,
    institution: h.institution ?? null,
  };
  store.accounts.push(acct);
  return acct;
}

function findInstrument(store: Store, h: ParsedHolding): Instrument | undefined {
  if (h.isin) {
    const i = store.instruments.find((x) => x.isin === h.isin);
    if (i) return i;
  }
  if (h.scheme_code) {
    const i = store.instruments.find((x) => x.scheme_code === h.scheme_code);
    if (i) return i;
  }
  if (h.symbol) {
    const i = store.instruments.find((x) => x.symbol === h.symbol);
    if (i) return i;
  }
  return store.instruments.find((x) => x.name === h.name && x.instrument_type === h.instrument_type);
}

export function findOrCreateInstrument(store: Store, h: ParsedHolding): [Instrument, boolean] {
  const inst = findInstrument(store, h);
  if (inst) {
    if (!inst.isin && h.isin) inst.isin = h.isin;
    if (!inst.symbol && h.symbol) inst.symbol = h.symbol;
    if (!inst.scheme_code && h.scheme_code) inst.scheme_code = h.scheme_code;
    if (!inst.amc && h.amc) inst.amc = h.amc;
    if (!inst.plan && h.plan) inst.plan = h.plan;
    return [inst, true];
  }
  const created: Instrument = {
    id: store.nextId("instruments"),
    name: h.name,
    instrument_type: h.instrument_type,
    isin: h.isin ?? null,
    symbol: h.symbol ?? null,
    scheme_code: h.scheme_code ?? null,
    amc: h.amc ?? null,
    plan: h.plan ?? null,
    expense_ratio: h.expense_ratio ?? null,
    extra: h.raw && Object.keys(h.raw).length ? JSON.stringify(h.raw) : null,
  };
  store.instruments.push(created);
  return [created, false];
}

export function upsertHolding(
  store: Store, account: Account, instrument: Instrument, h: ParsedHolding, importId: number | null
): "created" | "duplicate" {
  // A position is identified by (account, instrument) — NOT by source. Otherwise the same stock
  // from a Holdings file and a Tradebook would become two rows and be counted twice (the tradebook
  // row, lacking a market price, adds its invested cost on top of the market value).
  const existing = store.holdings.find(
    (x) => x.account_id === account.id && x.instrument_id === instrument.id
  );
  if (existing) {
    // A tradebook has no market price, so it must never overwrite a priced snapshot's value/qty;
    // it only enriches cost basis (and supplies qty when no snapshot has priced the position).
    const isTradebook = h.source === Source.ZERODHA_TRADEBOOK;
    if (!isTradebook) {
      existing.quantity = h.quantity;
      existing.current_value = h.current_value ?? existing.current_value;
      existing.last_price = h.last_price ?? existing.last_price;
      existing.avg_cost = h.avg_cost ?? existing.avg_cost;
      existing.invested_value = h.invested_value ?? existing.invested_value;
      existing.folio = h.folio ?? existing.folio;
      existing.source = h.source;
    } else {
      if (existing.current_value == null) existing.quantity = h.quantity;
      existing.avg_cost = existing.avg_cost ?? h.avg_cost;
      existing.invested_value = existing.invested_value ?? h.invested_value;
    }
    existing.import_id = importId;
    return "duplicate";
  }
  store.holdings.push({
    id: store.nextId("holdings"),
    account_id: account.id,
    instrument_id: instrument.id,
    quantity: h.quantity,
    avg_cost: h.avg_cost ?? null,
    invested_value: h.invested_value ?? null,
    current_value: h.current_value ?? null,
    last_price: h.last_price ?? null,
    folio: h.folio ?? null,
    source: h.source,
    import_id: importId,
  });
  return "created";
}
