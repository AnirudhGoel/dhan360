# Limitations & honesty notes

dhan360 favours transparency over false precision. Known limitations, kept current:

## Prices
- **No live/real-time quotes.** Values come from your imports or an as-of price source, not a streaming feed:
  - **Mutual funds** use actual NAV — from the statement, and (for period XIRR & the performance curve) fetched client-side from [mfapi.in](https://mfapi.in) by scheme code.
  - **Direct stocks/ETFs** use the broker **LTP/close** in your holdings file for current value. For **period** XIRR and the return curve they need *historical* closes, sourced from either the **Kite price proxy** (`services/kite-prices`) or a **historical-prices CSV** import.
- A **tradebook-only** import has **no current value** until it's reconciled with a holdings import or a price source.
- The **equity price feed** is powered by a shared `equity-prices` service that downloads NSE's public daily bhav-copy files — no credentials or API keys required. Closes are cached in a shared SQLite DB; a daily cron keeps it current. Point the client at it with `VITE_EQUITY_PRICES_URL`. Without the service, equity period boundaries fall back to the price-CSV import path and are flagged.

## XIRR & returns
- **XIRR is computed** — a whole-portfolio/lifetime figure plus a configurable **period** XIRR — using your transaction history (tradebook / CAS) and boundary valuations, via a Newton + bisection solver.
- It's **honest about coverage.** Each result carries flags and a coverage %: `price_return_only` (equity dividends not included), `has_estimated_price` (a boundary price was missing/estimated), `split_flagged`, `insufficient_data`. Holdings we can't value at a boundary are excluded, not guessed.
- **Direct-equity returns are price-return only** — dividends aren't included yet.
- **Corporate actions:** the self-host backend does split-aware quantity reconstruction; the **client store (v1) omits corporate actions** — fine for typical data, and flagged where it matters.
- The **performance curve is mutual-fund-based** today (unitized, time-weighted — the Zerodha Console method). A **combined equity + MF** curve and a Nifty benchmark overlay are on the roadmap.

## Holdings vs tradebook reconciliation
- **Your holdings file is the source of truth for what you *currently* hold.** A tradebook's "net open position" (buys − sells) is only reliable with *complete* trade history — Zerodha caps exports at ~1 year, and splits/bonuses skew raw share counts. So when a holdings snapshot exists for an account, tradebook positions that **aren't in it** (sold, transferred out, or split-skewed) are **excluded from net worth** — their trades are kept for history, and the import diagnostics tell you how many were excluded. A **tradebook-only** portfolio (no holdings file) keeps its net positions, valued at cost until priced.

## Classification
- **Reference data is a bundled snapshot**, not exhaustive. The stock cap/sector list, ETF map and AMFI scheme set cover common instruments; unknown ones fall back to heuristics or an honest `Unclassified`. Extend the JSON (`backend/app/refdata/data/` and `frontend/src/engine/data/`) or set overrides.
- **Mutual-fund look-through is mostly *estimated*** from SEBI category models, not live disclosures. Estimated splits are flagged in the UI and excluded from overlap; only *disclosed* portfolios contribute real constituent names to concentration/overlap.
- **EPF** is bucketed under Debt for simplicity. **NPS** is treated as Debt by default; if your NPS has an equity portion, add it as a separate manual equity entry.
- Cap convention is the AMFI top-100/250 rule; it won't perfectly match a fund's own mandate on any given day.

## Capital gains & tax
- **No real capital-gains / tax computation.** Rebalancing shows *generic, non-personalized* tax & exit-load reminders only. Verify holding periods, exit loads and tax treatment yourself before acting.

## Scope
- **File-based imports only** — no broker-login automation, by design (for privacy).
- **Zerodha is the only first-class broker.** Other brokers import via the **Generic CSV** template.
- **No stock/ETF depository CAS (NSDL/CDSL).** `casparser` targets the CAMS/KFintech **mutual-fund** CAS; the depository e-CAS is a different, messier format with weaker cost/transaction data than a broker CSV — so equities come via a broker CSV or the generic template. (Multi-broker equity consolidation from an e-CAS is a possible future addition.)
- **PDF CAS** relies on `casparser`; unusual/older layouts may fail — fall back to the casparser **JSON** path.
- **No order execution / robo-advisory.** Analytics & visibility only.
- **Family/multi-member portfolios** — the schema is member-aware-ready, but the UI is single-portfolio in this MVP.

## Not advice
dhan360 is an analytics tool. Nothing in it is personalized investment, tax, or legal advice.
