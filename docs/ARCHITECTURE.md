# Architecture

dhan360 is a local-first app: a **FastAPI** backend over a **SQLite** file, and a **React/Vite** SPA. In production the backend also serves the built SPA, so the whole thing is one process / one port.

```
┌──────────────┐   JSON/HTTP    ┌─────────────────────────────────────────────┐
│ React + Vite │ ─────────────► │ FastAPI                                      │
│  SPA (UI)    │                │  parse → reconcile → classify → aggregate    │
└──────────────┘                │                  │                           │
                                │                  ▼                           │
                                │            SQLite (local file)               │
                                └─────────────────────────────────────────────┘
```

## The normalized model

The core idea is separating three concepts (see `backend/app/db/models.py`):

- **Instrument** — the *thing* you can own (master record). Deduped across sources by identity strength: **ISIN → scheme code → symbol → name+type**.
- **Classification** — how an instrument is bucketed (asset class, sub-class, cap, sector, confidence). One per instrument; user overrides win.
- **Holding** — *your* position in an instrument within a specific **Account** (a Zerodha demat, an MF folio, "manual"…). Unique per `(account, instrument, source)`.

This separation is what lets a Zerodha CSV and a CAS reconcile onto the same instrument, and lets one override stick everywhere. **Look-through** rows (a fund's underlying holdings, disclosed or estimated) hang off the instrument.

## The import pipeline

Every source flows through the same funnel (`app/services/import_service.py`), so behaviour is identical regardless of broker:

```
file ─► parser ─► ParseResult(holdings[], diagnostics[])
                      │
                      ▼  for each holding
        reconcile (find/create Account + Instrument, dedupe)
                      │
                      ▼
        classify (engine + overrides) ─► Classification + Lookthrough
                      │
                      ▼
        upsert Holding  ─► ImportBatch counts (imported/merged/dup/skipped/unclassified)
```

### Modules (`backend/app/`)

| Module | Responsibility |
|---|---|
| `parsers/` | One adapter per source → `ParseResult`. Pluggable; add a broker here. |
| `reconcile/` | Dedup/merge instruments & accounts by identity strength. |
| `classify/` | The classification engine (`engine.py`), name `heuristics.py`, `overrides.py`. Pure & DB-free. |
| `refdata/` | Bundled reference data (AMFI schemes, ETF map, cap lists, sectors) + loader. |
| `portfolio/` | `aggregate.py` (exposures + breakdowns), `analysis.py` (concentration/overlap/MF/stock views), `rebalance.py`. |
| `services/` | Orchestration: import + classification persistence. |
| `api/` | FastAPI routers (`imports`, `portfolio`, `config`). |

### Exposure expansion (the key aggregation trick)

`portfolio/aggregate.py` turns each holding into one or more **exposures**. A direct stock = one exposure; a fund with look-through is expanded across its underlying buckets by weight. Every breakdown (asset class, cap, debt, gold, sector) is then a simple grouping of exposures — which keeps all the totals internally consistent and makes "click Mid Cap → see contributors" fall out naturally (`portfolio/holdings_view.py`).

## Frontend (`frontend/src/`)

- `lib/api.ts` — typed fetch client. `lib/format.ts` — INR/lakh-crore formatting. `lib/colors.ts` — stable per-bucket colors.
- `components/` — `DonutChart` (hover + click-to-filter), `BarList`, `HoldingsTable`, layout/primitives.
- `pages/` — Dashboard, Holdings, MutualFunds, StocksEtfs, Rebalancing, Reports, Imports, Settings.
- Click-to-filter uses **URL query params** (`/holdings?cap=Mid+Cap`) so filters are shareable and back-button friendly.
