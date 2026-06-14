# Plan: License switch (AGPL + CLA) + Configurable XIRR / period analytics

## Context

Two decisions from the product exploration are ready to execute:

1. **License → AGPL-3.0 + CLA.** dhan360 will be sustainable side-income: genuinely open source
   (self-host free) with the option of a paid hosted tier later. The repo is currently **MIT**
   (maximally permissive → no moat; anyone could resell a hosted version). Switching to **AGPL-3.0**
   (network-use copyleft discourages parasitic SaaS) plus a **CLA** (so the maintainer retains the
   right to dual-license a commercial/hosted edition) protects that path. Must happen *before*
   external contributors arrive, because relicensing later needs every contributor's consent.

2. **Configurable XIRR / period analytics.** Today there is *no* XIRR at all — the pipeline parses
   CAS/tradebook transactions but collapses them to a single `invested_value`, discarding the dates.
   Period XIRR (e.g. Jun–Dec 2025) needs dated cashflows + boundary valuations. This adds a
   transactions store, an XIRR engine, a pluggable price/NAV provider, and a config-heavy Analytics
   page. All XIRR logic is pure and portable — it will move cleanly to the future TS client engine,
   so none of it is wasted by the eventual local-first hosted architecture.

Architectural note (from exploration): self-host keeps the Python engine (already private on the
user's machine). The hosted web app becomes a later phase (TS client engine + bulk price packs +
optional ephemeral CAS-PDF microservice + optional E2E-encrypted sync). This plan does **not** start
that rewrite — it builds XIRR in Python where the rest of the engine lives.

---

## Part 1 — License switch (do first; low-risk, hard to reverse later)

- Replace `LICENSE` (MIT) with the full **GNU AGPL-3.0** text.
- Add `CLA.md` — individual + entity Contributor License Agreement granting the maintainer a
  license to the contribution *including the right to relicense/dual-license* (standard open-core
  pattern). Note in `CONTRIBUTING.md` that PRs require CLA sign-off (recommend enabling
  `cla-assistant.io` on the GitHub repo — a manual setup step for the user).
- Update references: `README.md` license section (MIT → AGPL-3.0-or-later; add a short "Licensing &
  hosted edition" note), add `"license": "AGPL-3.0-or-later"` to `frontend/package.json`.
- **AGPL §13 (network use):** the app must offer its source to users over the network. Add a
  "Source code (AGPL)" link in the SPA footer/Settings pointing to the repo. Small UI change in
  `frontend/src/components/Layout.tsx` (or Settings privacy card).
- Commit as a discrete change.

## Part 2 — XIRR / period analytics (phased)

### Data model (`backend/app/db/models.py`)
- **`transactions`** — `id, instrument_id, account_id, holding_id?, date, kind` (buy/sell/dividend/
  switch_in/switch_out), `units?, amount` (signed cashflow), `price?, nav?, source, import_id`.
  The core new store; one row per real cashflow.
- **`prices`** — `instrument_id (or symbol), date, close, source`. Local cache of day-end prices/NAV.
- **`corporate_actions`** — `instrument_id, date, kind` (split/bonus), `ratio` (e.g. 5.0 = 1:5),
  `source`. Lets us inject the split into the reconstructed quantity timeline.
- Add an idempotent lightweight migration in `init_db()` path (create_all handles new tables;
  add a tiny `ensure_columns` helper if we alter existing ones).

### Parsers — persist transactions instead of discarding
- `parsers/cas_json.py`: emit each scheme transaction (date, amount, units, nav, kind) on the
  `ParsedHolding` (extend `parsers/base.py` with a `transactions: list[ParsedTxn]`), still compute
  `invested_value` as before for back-compat.
- `parsers/zerodha_tradebook.py`: keep the net-position aggregation, **and** carry the individual
  dated trades through as transactions.
- Import service (`services/import_service.py`) persists `Transaction` rows during reconcile.

### XIRR engine (`backend/app/portfolio/xirr.py`, pure + unit-tested)
- `xirr(cashflows: list[(date, amount)]) -> rate` via Newton's method with a bisection fallback
  (robust when Newton diverges). Standard NPV root-find: Σ cf_i / (1+r)^((t_i−t_0)/365) = 0.
- `quantity_on(instrument, date)` — anchor on current holding, walk back applying `transactions`
  **and** `corporate_actions`; if no corp-action row exists, detect a split via the
  `Σtrades vs current holdings` mismatch and flag it.
- `value_on(instrument, date)` = `quantity_on × price_on(date)` using the price provider.
- Assemble cashflows for **lifetime** (trades + dividends + current value) and **period** (opening
  value out, in-window cashflows, closing value in). Grouping: portfolio / asset-class / instrument.
- Every result carries honesty flags: `price_return_only` (no dividends), `has_estimated_price`,
  `split_flagged`.

### Price/NAV provider (`backend/app/prices/`, pluggable)
- `PriceProvider` interface: `nav(scheme_code, dates)`, `price(symbol, dates)`.
- **AMFI NAV provider** — fetch historical NAV (bulk, free; e.g. AMFI portal / mfapi). Gives
  *accurate* MF valuation at any date → accurate MF period XIRR.
- **Kite provider (stub → wire later)** — lazy-fetch split-adjusted daily closes for the user's
  held symbols + corporate actions, cache to `prices`. Behind the user's own API key (self-host);
  thin proxy for hosted. Left as an interface impl to complete when the user confirms Kite access.
- **Seed/manual fallback** — use the last known price from holdings for endpoints == today.

### API (`backend/app/api/`)
- `GET /api/analytics/xirr?scope=portfolio|asset_class|instrument&from=&to=&group_by=` → per-group
  XIRR + flags. `from/to` optional (omitted ⇒ lifetime).
- `GET /api/analytics/value-series?from=&to=&interval=` (optional, for a value-over-time chart).

### UI (`frontend/src/pages/Analytics.tsx` + nav entry)
- Config-heavy page: date-range picker with presets (This FY, 1Y, custom e.g. Jun–Dec 2025),
  grouping selector (portfolio / asset class / holding), XIRR table, optional value chart.
- Surface the honesty flags prominently (price-return badge, "split-adjusted", "estimated NAV").

### Phasing (ship value early, MF-accurate slice first)
- **Phase A — Lifetime XIRR, no price feed needed.** transactions store + persist from CAS/tradebook
  + XIRR solver + lifetime XIRR for *everything* (cashflows + current value). Big win, self-contained.
- **Phase B — MF period XIRR (accurate).** AMFI NAV provider + period valuation for mutual funds.
- **Phase C — Direct-equity period XIRR.** `prices` + `corporate_actions` + Kite provider;
  split-aware quantity; price-return labeled.
- **Phase D — Analytics UI** with full configuration (can land alongside A/B for lifetime + MF).

## Files (representative)
- License: `LICENSE`, `CLA.md`, `README.md`, `CONTRIBUTING.md`, `frontend/package.json`,
  `frontend/src/components/Layout.tsx`.
- XIRR: `backend/app/db/models.py`, `backend/app/parsers/{base,cas_json,zerodha_tradebook}.py`,
  `backend/app/services/import_service.py`, `backend/app/portfolio/xirr.py`,
  `backend/app/prices/*`, `backend/app/api/analytics.py`, `backend/app/main.py` (router),
  `backend/tests/test_xirr.py`, `frontend/src/pages/Analytics.tsx`, `frontend/src/lib/api.ts`,
  `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`.

## Verification
- `make test` — new `test_xirr.py`: known-cashflow XIRR vs. hand-computed values; split
  reconstruction (10 shares → 1:5 split → 50, value continuous); MF period XIRR from seeded NAV.
- Reseed, hit `/api/analytics/xirr` for portfolio (lifetime) and for a mutual fund over
  Jun–Dec 2025; confirm plausible annualized rates + correct honesty flags.
- Frontend `npm run build`; Analytics page renders with date-range + grouping and flags.
- License: `LICENSE` is AGPL-3.0, README/pkg updated, source link visible in the app footer.

## Out of scope (roadmap)
- Total-return XIRR (needs dividend ingestion from ledger/tax-P&L) — Phase C+.
- Full Kite historical wiring pending the user's confirmed API access.
- TS client-engine port / hosted local-first app (separate future phase).
- Demat CAS (NSDL/CDSL) parser — parked, awaiting a sample file (reminder owed to user).
