# Import formats

All parsing happens locally — in the self-host backend (`backend/app/parsers/`) or, for the
browser app, the mirrored TypeScript engine (`frontend/src/engine/parse/`). Column matching is
**fuzzy** (case/spacing-insensitive, substring-aware), so minor export variations work. Sample
files are in [`../samples/`](../samples/).

On the **Data & Imports** page the sources are grouped by what you have — **Stocks & ETFs**,
**Mutual funds**, and **Everything else** (manual) — with the CAS-JSON and price-CSV options behind
"Show advanced". The sections below list every format.

> **.xlsx works too.** Any CSV source also accepts **.xlsx / .xls** — the first sheet is read for you, no need to convert. (Zerodha's *Kite web* holdings download is CSV; *Console* often gives .xlsx.)

## Zerodha Holdings CSV (`zerodha_holdings`)

From Console → Portfolio → Holdings (or a Kite holdings export). Recognized columns (any subset):

```
Symbol / Instrument, ISIN, Sector, Quantity Available / Qty, Average Price / Avg cost,
Previous Closing Price / LTP, Current Value, Buy Value
```

- Current value is derived from `qty × LTP` if not present; invested from `qty × avg` likewise.
- ETFs in this file (typed as stocks) are auto-detected and re-classified — see [CLASSIFICATION](CLASSIFICATION.md).

## Zerodha Tradebook CSV (`zerodha_tradebook`)

A list of individual trades. Required columns: `symbol`, `isin`, `trade_type` (buy/sell), `quantity`, `price`. The parser aggregates to **net open positions** with a buy-weighted average cost, and keeps the dated trades as **transactions** that feed **XIRR** and the performance curve. Current value is unknown from a tradebook alone (no live price) and stays blank until a holdings import or a price source fills it.

> **Holdings vs Tradebook:** they're complementary. Holdings gives current value & allocation but no dates; the tradebook gives dated cashflows (→ XIRR) but no current value. **Import both** for the full picture — they reconcile onto the same instruments.

**Multiple files at once:** Zerodha caps each tradebook export at ~1 year, so a multi-year investor has one file per year. Select them **all together** — they're combined into one position set and **de-duplicated by trade id** (falling back to symbol+date+type+qty+price), so overlapping windows never double-count.

## Mutual fund CAS — PDF (`cas_pdf`)

Native parsing of CAMS/KFintech/MFCentral consolidated PDFs via **casparser**, including password-protected files (password is usually your PAN). The PDF bytes are parsed in-process and never stored or transmitted.

## Mutual fund CAS — JSON (`cas_json`)

The dict/JSON produced by [`casparser`](https://github.com/codereverser/casparser):

```bash
pip install casparser
casparser your_cas.pdf -o cas.json -p YOUR_PASSWORD
```

Each scheme maps to one holding: `close` units → quantity, `valuation.value` → current value, `valuation.nav` → NAV, and net of `transactions[].amount` → invested. `advisor=DIRECT` (or "Direct" in the name) → direct plan.

## Generic CSV template (`generic_csv`)

For any unsupported broker/source. Header row (case-insensitive); only `name` and one of `current_value`/`quantity` are required:

```csv
name,type,isin,symbol,scheme_code,quantity,avg_cost,invested_value,current_value,amc,plan,folio,sector,market_cap,asset_class
Reliance Industries,stock,INE002A01018,RELIANCE,,40,2350,94000,119200,,,,Energy,Large Cap,
My PPF Account,ppf,,,,,,700000,850000,,,,,Debt
```

- `type` ∈ `stock, etf, mutual_fund, sgb, bond, gsec, fd, ppf, epf, nps, reit, invit, cash, digital_gold, real_estate, other` (defaults to `other`).
- `asset_class` is an optional explicit override applied during classification.

## Historical prices CSV (`prices_csv`) — advanced

Fills the local price cache so **direct-equity period XIRR** and the performance curve have boundary prices. It creates **no holdings**. Header row (case-insensitive); needs `date`, a `close` price, and `symbol` **or** `isin`:

```csv
symbol,isin,date,close
RELIANCE,INE002A01018,2024-04-01,2925.50
RELIANCE,INE002A01018,2025-03-31,1204.70
```

Accepted aliases: price column ∈ `close / closeprice / price / nav / ltp`; symbol ∈ `symbol / ticker / tradingsymbol`; date ∈ `date / tradedate`. Rows are matched to instruments by symbol or ISIN.

> Most users won't need this: the **Kite price feed** below fetches these closes automatically. Mutual-fund NAV is fetched automatically too (client-side from [mfapi.in](https://mfapi.in)); this CSV is only for direct equity when you're not running the Kite proxy.

## Automated equity prices — Kite feed (optional)

Instead of a price CSV, run the self-hosted **`kite-prices` proxy** (`services/kite-prices`) with your own Kite Connect app (Historical Data subscription) and point the client at it via `VITE_KITE_PRICES_URL`. Period XIRR then pulls direct-equity closes automatically — only symbols + a date range leave the browser, never holdings. See [`../services/kite-prices/README.md`](../services/kite-prices/README.md).

## Manual entries (`manual`)

Add PPF/EPF/FD/SGB/NPS/bonds/REITs/cash/digital-gold/custom assets from the **Imports** page (or `POST /api/imports/manual`). The `type` drives classification (SGB → Gold, PPF → Debt, REIT → Real Estate…).

## Reconciliation & history

Every import creates an **ImportBatch** with counts: parsed, imported, **merged** (reconciled onto an existing instrument), duplicate (same source re-imported → refreshed in place), skipped (zero qty/value), unclassified. Review them on **Data & Imports**.
