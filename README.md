<div align="center">

<img src="frontend/public/logo.svg" width="72" alt="dhan360 logo" />

# dhan<span>360</span>

**India-first, privacy-first portfolio analytics &amp; rebalancing — your data never leaves your machine.**

<sub>And it goes deep: fund **look-through** to true sector/cap exposure, direct-vs-fund **overlap**, **XIRR** &amp; a performance curve, and **rebalancing** insights — the kind of depth normally locked in paid tools, here free, open, and 100% local.</sub>

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-2563eb.svg)](LICENSE)
&nbsp;·&nbsp; [**🔎 Live demo →**](https://dhan360.in) &nbsp;·&nbsp; Self-hosted &nbsp;·&nbsp; No signup, nothing collected

<img src="docs/screenshots/demo.gif" width="820" alt="dhan360 walkthrough" />

<sub>Dashboard → click-to-filter → performance curve → funds → rebalancing → transactions</sub>

</div>

---

dhan360 gives an Indian retail investor a complete 360° view of their holdings across **mutual funds, direct stocks, ETFs, gold, debt, PPF, EPF, FDs, NPS, bonds, SGBs, REITs and manually-entered assets** — and helps them understand asset allocation, drift, and rebalancing. It is **not** a trading or robo-advisory tool; it's an analytics and visibility tool.

It's **privacy-first by design** — there are two ways to run it, and with both, **your data never leaves your device**:

- **🌐 Use it now at [dhan360.in](https://dhan360.in)** — the *entire app runs in your browser*. Import your own files and all the parsing and analytics happen on your device; data is stored locally (IndexedDB) and **never uploaded**. No install, no signup, no account. (First visit shows a sample portfolio you can replace with your own.)
- **🖥️ Or self-host** with Docker for a fully offline setup on your own machine (Python backend + local SQLite).

The one optional exception is CAS **PDF** parsing (a native library that can't run in-browser), handled by a tiny **stateless** service that parses in memory and stores nothing — or you can convert locally and upload the JSON. See [docs/CLIENT_ARCHITECTURE.md](docs/CLIENT_ARCHITECTURE.md).

> ⚠️ dhan360 provides analytics only. It is **not investment advice**.

### Screenshots

| Analytics — performance curve & XIRR | Holdings (click-to-filter) | Mobile |
|---|---|---|
| <img src="docs/screenshots/analytics-desktop.png" width="280" alt="Analytics" /> | <img src="docs/screenshots/holdings-desktop.png" width="280" alt="Holdings" /> | <img src="docs/screenshots/dashboard-mobile.png" width="150" alt="Mobile" /> |

---

## What it does

Upload a **Zerodha holdings/tradebook CSV**, a **mutual-fund CAS** (PDF or casparser JSON), and add **manual assets** (PPF/FD/SGB/NPS…), and instantly see:

- **Net worth** across every imported & manual asset.
- **Asset allocation** — Equity, International Equity, Debt, Gold, Cash, Real Estate (REITs/InvITs), Others.
- **Equity cap split** — Large / Mid / Small / Micro / International / Unclassified, **including mutual-fund look-through** (a flexi-cap fund contributes partially to each cap, not as one blob).
- **Debt split** — Liquid/Overnight, Short Duration, Corporate Bond, Gilt/G-Sec, FD, PPF, NPS Debt, Cash.
- **Gold split** — Gold ETF, Gold Mutual Fund, SGB, Digital Gold.
- **Sector exposure** across direct stocks + fund look-through.
- **Stock concentration** and **direct-vs-fund overlap** (where fund portfolios are disclosed).
- **Current vs target allocation**, **drift**, and **rebalancing suggestions** (incl. a *new-money-only* mode and generic tax / exit-load reminders).

The dashboard is inspired by Zerodha Console: clean donut charts with hover (amount + %) and **click-to-filter** — click **Gold** to filter the holdings table to all gold assets, click **Mid Cap** to see every stock, ETF and fund contributing to mid-cap exposure.

### Transparent classification

dhan360 never just labels "all ETFs = equity". A gold ETF is **Gold**, a Bharat Bond / gilt ETF is **Debt**, an index ETF is **Equity**, a Nasdaq ETF is **International Equity**. Every classification carries a **confidence level** (`manual` / `high` / `medium` / `low` / `estimated`) and is shown in the UI, and you can set **remembered overrides** that apply everywhere. See [docs/CLASSIFICATION.md](docs/CLASSIFICATION.md).

---

## Tech stack

dhan360 has **two runtimes that share one React UI** (see [docs/CLIENT_ARCHITECTURE.md](docs/CLIENT_ARCHITECTURE.md)):

| Layer | Choice |
|---|---|
| UI | **React + Vite + TypeScript · Recharts · Tailwind** |
| Client engine (browser) | **TypeScript** — parsing, classification, aggregation, XIRR, performance run in-browser; data in **IndexedDB**. Powers `dhan360.in`. |
| Self-host backend | **Python 3.12 · FastAPI · SQLAlchemy 2 · SQLite** (one local file), packaged with **Docker** |
| CAS parsing | **casparser** (native CAMS/KFintech PDF) — in the backend, or the stateless `parse-cas` service |

The two engines are kept in lock-step by **golden-vector parity tests** (`npm test`) that assert identical output.

---

## Quick start

### Option A — Docker (recommended for self-hosting)

```bash
docker compose up --build
# open http://localhost:8000  → Data & Imports → "Load sample data"
```

Your data persists in `./data` (a local SQLite file).

### Option B — Local dev (two processes)

Prerequisites: Python 3.12 (e.g. via `pyenv`) and Node 20.

```bash
make setup          # create venv + install backend & frontend deps
make seed           # load the bundled sample portfolio (optional)

# terminal 1
make dev-backend    # FastAPI on http://localhost:8000

# terminal 2
make dev-frontend   # Vite on http://localhost:5173  (proxies /api to :8000)
```

Open **http://localhost:5173**. To run as a single process like production: `make build` then `make dev-backend` and open **http://localhost:8000**.

### Tests

```bash
make test           # parser + classification unit tests
```

---

## Importing your own data

| Source | How |
|---|---|
| Zerodha holdings | Console → Portfolio → Holdings → download CSV → upload as *Zerodha Holdings CSV* |
| Zerodha tradebook | Console → Reports → Tradebook → CSV → upload as *Zerodha Tradebook CSV* |
| Mutual fund CAS (PDF) | Get a CAS from CAMS/KFintech/MFCentral → upload as *CAS PDF* (enter the password, usually your PAN) |
| Mutual fund CAS (JSON) | `pip install casparser && casparser input.pdf -o cas.json` → upload the JSON |
| Anything else | Use the **Generic CSV template** (see [docs/IMPORT_FORMATS.md](docs/IMPORT_FORMATS.md)) |
| PPF / FD / SGB / NPS / bonds / REITs / cash | Add via **Manual entry** on the Imports page |

Sample/anonymized files live in [`samples/`](samples/). See [docs/IMPORT_FORMATS.md](docs/IMPORT_FORMATS.md) for exact column specs.

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — modules, data model, import pipeline.
- [Classification methodology](docs/CLASSIFICATION.md) — how buckets, look-through and confidence work.
- [Import formats](docs/IMPORT_FORMATS.md) — supported files & the generic CSV template.
- [Limitations](docs/LIMITATIONS.md) — what's approximate, what's missing.
- [Roadmap](docs/ROADMAP.md) — combined equity+MF curve, demat CAS, disclosed look-through, more brokers…
- [Contributing](CONTRIBUTING.md) — add a parser or extend reference data.

## Privacy

- Your data stays on your device — in the **browser** (IndexedDB) at [dhan360.in](https://dhan360.in), or in a local **SQLite** file (`DHAN360_DATA_DIR`, default `./data`) when self-hosted. **Nothing is uploaded anywhere.**
- PDFs/CSVs are parsed locally — in your browser, or by the backend process **you** run.
- The only optional network calls are non-sensitive lookups you control: mutual-fund NAV from mfapi.in, and (if you enable them) the stateless `parse-cas` and self-run `kite-prices` helpers — which receive scheme codes / symbols, never your holdings.
- `Data & Imports → Reset` wipes everything instantly; **Reports → Backup** exports a portable JSON.

## Licensing & hosted edition

dhan360 is **open source under the [GNU AGPL-3.0](LICENSE)** — you can self-host it free, forever,
and any modified version you run as a network service must share its source (AGPL §13).

Contributions are welcome under a lightweight **[Contributor License Agreement](CLA.md)**, which
keeps the project open source while letting the maintainers offer an optional **hosted/managed
edition** to fund development. A hosted version (if/when offered) is designed to preserve the same
privacy promise — see [the architecture notes](docs/ARCHITECTURE.md).

Built for the Indian investor community.
