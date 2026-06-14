# Limitations & honesty notes

dhan360 favours transparency over false precision. Known limitations in this MVP:

## Prices
- **No live prices.** Values come from the imported statement (CAS NAV, broker LTP/close) or your manual entry. There is no market-data feed yet, so values reflect the as-of date of your import. A tradebook-only import has no current value until reconciled with a holdings import. *(Roadmap: optional AMFI NAV + quote refresh.)*

## Classification
- **Reference data is a bundled snapshot**, not exhaustive. The stock cap/sector list, ETF map and AMFI scheme set cover common instruments; unknown ones fall back to heuristics or `Unclassified` (shown honestly). Extend the JSON in `backend/app/refdata/data/` or set overrides.
- **Mutual-fund look-through is mostly *estimated*** from SEBI category models, not live disclosures. Estimated splits are flagged in the UI and excluded from overlap. Only funds with *disclosed* portfolios (seeded, or via a future disclosure parser) contribute to concentration/overlap with real constituent names.
- **EPF** is bucketed under Debt/PPF for simplicity. **NPS** is treated as Debt by default; if your NPS has an equity portion, add it as a separate manual equity entry.
- Cap convention is the AMFI top-100/250 rule; it won't perfectly match a fund's own mandate on any given day.

## XIRR, capital gains & tax
- **No XIRR yet** (needs full cashflow/transaction history; CAS transactions are captured but not yet used for XIRR).
- **No real capital-gains / tax computation.** Rebalancing shows *generic, non-personalized* tax & exit-load reminders only. The Reports page has capital-gains/XIRR placeholders.

## Scope
- **No broker login automation** — file-based imports only (by design, for privacy).
- **No order execution / robo-advisory.** Analytics & visibility only.
- **Family/multi-member portfolios** — schema is member-aware-ready but the UI is single-portfolio in this MVP.
- **PDF CAS** relies on `casparser`; unusual/older layouts may fail — fall back to the casparser JSON path.

## Not advice
dhan360 is an analytics tool. Nothing in it is personalized investment, tax, or legal advice. Verify holding periods, exit loads and tax treatment before acting.
