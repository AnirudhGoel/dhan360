# Client-side architecture (local-first hosted app)

dhan360 has **two runtimes that share one React UI**:

| Mode | Build | Compute | Storage | For |
|---|---|---|---|---|
| **Self-host** | `npm run build` (Docker) | Python/FastAPI backend | server SQLite file | technical users, full privacy on their own machine |
| **Client** | `npm run build:client` | **TypeScript engine, in the browser** | **IndexedDB (local)** | anyone — "just visit dhan360.in", data never leaves the device |
| *(Demo)* | `npm run build:demo` | none (bundled fixtures) | none | try-with-sample-data static page |

The **client mode** is the answer to "non-technical users, but keep the privacy promise": the whole
app — parsing, classification, aggregation, XIRR, performance — runs in the browser. The only server
role is optional CAS-PDF parsing (see below) and NAV data (fetched directly from mfapi.in, CORS-enabled).

## How it's wired

```
frontend/src/lib/api.ts
  └─ export const api = CLIENT ? clientApi : httpApi      // one flag routes the whole app

frontend/src/engine/                 ← the TS engine (mirrors backend/app, parity-tested)
  taxonomy.ts, refdata.ts, data/*.json (shared with backend)
  classify/{engine,heuristics}.ts
  parse/{csv,zerodhaHoldings,zerodhaTradebook,genericCsv,casJson,manual,types}.ts
  store/{model,store,persistence}.ts  ← in-memory Store, IndexedDB snapshot, file export/import
  pipeline/{reconcile,classifyService,importService}.ts
  portfolio/{aggregate,holdingsView,transactionsView,analysis,rebalance,xirr,performance}.ts
  prices.ts                           ← NAV from mfapi.in (client-side fetch, in-memory cache)
  seed.ts                             ← first-visit sample portfolio (mirrors scripts/seed.py)
  clientApi.ts                        ← exposes the backend API surface, backed by the Store
```

The existing pages/components are **unchanged** — they call `api.*` exactly as before; in client mode
those calls hit `clientApi` (local engine) instead of HTTP.

## Parity discipline

The TS engine is a faithful port of the tested Python. **Golden-vector tests** (`*.test.ts`, run with
`npm test`) assert the TS produces identical output to the Python for the same inputs — classification
cases, parser fixtures, XIRR solver, and a full-pipeline test that reproduces the Python `summary()`
(net worth, allocation, cap/debt/gold splits) exactly for the sample files. Change one engine, update
both, keep the vectors green.

## Storage & durability

Data lives in the browser's IndexedDB (a serialized snapshot; NAV cache excluded, it's re-fetchable).
Browsers **can evict** site storage, so:
- the app calls `navigator.storage.persist()` (best-effort durability), and
- **Reports → Backup & restore** exports/imports the whole portfolio as a JSON file. Backups are the
  real safety net; this is surfaced prominently in client mode.

## CAS PDF (the one carve-out)

`casparser` needs a native binary that won't run in the browser, so CAS **PDF** import is not client-side.
The plan (not yet wired): a **stateless, ephemeral `parse-cas` microservice** that reuses the Python
`casparser`, parses in memory, stores nothing, and returns CAS JSON the browser then processes locally —
with an "Advanced: parse locally, upload JSON" escape hatch for purists. CSV + CAS-**JSON** + manual
imports are fully client-side today.

## Status / roadmap

- ✅ Phase 1 — client engine (parse/classify/aggregate/XIRR/performance), local store, backup, wiring.
- ⬜ `parse-cas` microservice (or pdf.js) for client-side CAS PDF.
- ⬜ Deploy the client build to dhan360.in (change the Pages workflow `build:demo` → `build:client`).
- ⬜ Equity + combined performance/period-XIRR once a stock price feed exists.
- ⬜ Optional end-to-end-encrypted sync (server stores ciphertext only) for cross-device.
- ⬜ Eventually retire the Python backend, leaving one TS engine + the tiny PDF service.
