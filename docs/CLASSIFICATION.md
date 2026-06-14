# Classification methodology

dhan360's value is **transparent, honest classification**. It tells you *why* something is bucketed and *how confident* it is, and degrades gracefully instead of pretending precision.

## The pipeline (highest authority first)

For each instrument, `app/classify/engine.py` resolves in this order:

1. **User override** — a remembered rule keyed by ISIN / symbol / scheme code / name. Confidence `manual`. Always wins.
2. **Explicit source hint** — e.g. an `asset_class` column in a generic CSV, or a manual entry's type.
3. **Exact reference-data match** — the stock list, ETF map, or AMFI scheme → SEBI category. Confidence `high`.
4. **Name heuristics** — ordered, most-specific-first keyword rules. Confidence `medium`/`low`.
5. **Graceful give-up** — `Unclassified`, confidence `none`. We never silently default an unknown to "Equity".

### ETFs are not all equity

Brokers export ETFs in the same table as stocks (typed `stock`). The engine **detects ETFs first** (by symbol in the ETF map, a `BEES`/`ETF` symbol suffix, or "ETF" in the name) and routes them through ETF classification:

| ETF kind | Bucket |
|---|---|
| Gold ETF (GOLDBEES, SETFGOLD…) | **Gold** → Gold ETF |
| Bharat Bond / gilt ETF (EBBETF…, GSEC10IETF) | **Debt** → Corporate Bond / Gilt |
| Liquid ETF (LIQUIDBEES) | **Debt** → Liquid/Overnight |
| Index ETF (NIFTYBEES, JUNIORBEES) | **Equity** → Large Cap |
| Nasdaq/FANG/S&P ETF (MON100, MAFANG) | **International Equity** |

## Equity market cap

- **Direct stocks** — from a bundled large/mid/small list following the AMFI convention (top 100 = Large, 101–250 = Mid, 251+ = Small). Unknown stock → Equity with **Unclassified** cap (honest: we know it's equity, not the cap).
- **Mutual funds** — from the fund's SEBI category, expanded via **look-through**.

## Mutual-fund look-through

A fund contributes *partially* to caps/sectors rather than as one opaque blob:

- **Disclosed** — if a fund's actual portfolio is present (`Lookthrough` rows with `is_estimated=false`, e.g. seeded or a future disclosure parser), its real constituents are used. These power **concentration** and **direct-vs-fund overlap**.
- **Estimated** — otherwise, the SEBI category's modelled split is used (`refdata/data/mf_categories.json`). E.g. a Flexi Cap fund ≈ 60% Large / 25% Mid / 15% Small; an Aggressive Hybrid ≈ 70% equity / 25% debt / 5% cash. These are flagged **estimated** and shown as such; they are excluded from overlap to avoid false positives.

## Hybrids

Hybrid funds are split across equity/debt/gold/cash by their category's `asset_split`, and the equity portion is further split by cap. So a Balanced Advantage fund correctly shows up in both Equity and Debt allocation.

## Confidence levels (shown in the UI)

| Level | Meaning |
|---|---|
| `manual` | User override — ground truth |
| `high` | Exact ref-data match (ISIN/scheme/AMFI) |
| `medium` | Name/category heuristics |
| `low` | Weak guess |
| `estimated` | Derived (e.g. modelled look-through), not disclosed |
| `none` | Could not classify |

## Overriding

Set an override in **Settings** (or via `POST /api/overrides`). It's keyed by ISIN/symbol/scheme/name, remembered, and re-applied to every matching instrument immediately. Example: force a particular ETF to **Gold** or **Debt**.

## Extending reference data

All reference data is local JSON under `backend/app/refdata/data/` — `etf_map.json`, `stocks.json`, `mf_categories.json`, `amfi_schemes.json`. Add entries and they take effect on the next (re)classification. `scripts/fetch_refdata.py` refreshes the AMFI scheme master.
