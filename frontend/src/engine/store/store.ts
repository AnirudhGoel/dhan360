// In-memory portfolio store — the client-side replacement for the server SQLite DB.
// One user's dataset is tiny, so plain arrays + linear scans are more than fast enough.
// The whole thing serializes to a snapshot for IndexedDB persistence + file export.

import {
  Account, Classification, Holding, ImportBatch, Instrument, Lookthrough,
  Override, Price, TargetAllocation, Transaction,
} from "./model";

export interface Snapshot {
  version: number;
  accounts: Account[];
  instruments: Instrument[];
  holdings: Holding[];
  classifications: Classification[];
  lookthrough: Lookthrough[];
  overrides: Override[];
  imports: ImportBatch[];
  transactions: Transaction[];
  prices: Price[];
  targets: TargetAllocation[];
  settings: Record<string, string>;
  counters: Record<string, number>;
}

export class Store {
  accounts: Account[] = [];
  instruments: Instrument[] = [];
  holdings: Holding[] = [];
  classifications: Classification[] = [];
  lookthrough: Lookthrough[] = [];
  overrides: Override[] = [];
  imports: ImportBatch[] = [];
  transactions: Transaction[] = [];
  prices: Price[] = [];
  targets: TargetAllocation[] = [];
  settings: Record<string, string> = {};
  private counters: Record<string, number> = {};

  nextId(table: string): number {
    this.counters[table] = (this.counters[table] ?? 0) + 1;
    return this.counters[table];
  }

  // ---- lookups ----
  instrument(id: number): Instrument | undefined {
    return this.instruments.find((i) => i.id === id);
  }
  account(id: number): Account | undefined {
    return this.accounts.find((a) => a.id === id);
  }
  classificationFor(instrumentId: number): Classification | undefined {
    return this.classifications.find((c) => c.instrument_id === instrumentId);
  }
  lookthroughFor(instrumentId: number): Lookthrough[] {
    return this.lookthrough.filter((l) => l.instrument_id === instrumentId);
  }
  holdingsFor(instrumentId: number): Holding[] {
    return this.holdings.filter((h) => h.instrument_id === instrumentId);
  }
  transactionsFor(instrumentId: number): Transaction[] {
    return this.transactions
      .filter((t) => t.instrument_id === instrumentId)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  isEmpty(): boolean {
    return this.holdings.length === 0;
  }

  clear(): void {
    this.accounts = []; this.instruments = []; this.holdings = [];
    this.classifications = []; this.lookthrough = []; this.overrides = [];
    this.imports = []; this.transactions = []; this.prices = []; this.targets = [];
    this.settings = {}; this.counters = {};
  }

  toSnapshot(): Snapshot {
    return {
      version: 1,
      accounts: this.accounts, instruments: this.instruments, holdings: this.holdings,
      classifications: this.classifications, lookthrough: this.lookthrough, overrides: this.overrides,
      imports: this.imports, transactions: this.transactions, prices: this.prices,
      targets: this.targets, settings: this.settings, counters: this.counters,
    };
  }

  loadSnapshot(s: Snapshot): void {
    this.accounts = s.accounts ?? [];
    this.instruments = s.instruments ?? [];
    this.holdings = s.holdings ?? [];
    this.classifications = s.classifications ?? [];
    this.lookthrough = s.lookthrough ?? [];
    this.overrides = s.overrides ?? [];
    this.imports = s.imports ?? [];
    this.transactions = s.transactions ?? [];
    this.prices = s.prices ?? [];
    this.targets = s.targets ?? [];
    this.settings = s.settings ?? {};
    this.counters = s.counters ?? {};
  }
}
