# Import formats

All parsing happens locally. Each source maps to a parser in `backend/app/parsers/`. Column matching is **fuzzy** (case/spacing-insensitive, substring-aware), so minor export variations work. Sample files are in [`../samples/`](../samples/).

## Zerodha Holdings CSV (`zerodha_holdings`)

From Console → Portfolio → Holdings (or a Kite holdings export). Recognized columns (any subset):

```
Symbol / Instrument, ISIN, Sector, Quantity Available / Qty, Average Price / Avg cost,
Previous Closing Price / LTP, Current Value, Buy Value
```

- Current value is derived from `qty × LTP` if not present; invested from `qty × avg` likewise.
- ETFs in this file (typed as stocks) are auto-detected and re-classified — see [CLASSIFICATION](CLASSIFICATION.md).

## Zerodha Tradebook CSV (`zerodha_tradebook`)

A list of individual trades. Required columns: `symbol`, `isin`, `trade_type` (buy/sell), `quantity`, `price`. The parser aggregates to **net open positions** with a buy-weighted average cost. Current value is unknown from a tradebook alone (no live price) and is left blank until a holdings import or price refresh fills it.

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

## Manual entries (`manual`)

Add PPF/EPF/FD/SGB/NPS/bonds/REITs/cash/digital-gold/custom assets from the **Imports** page (or `POST /api/imports/manual`). The `type` drives classification (SGB → Gold, PPF → Debt, REIT → Real Estate…).

## Reconciliation & history

Every import creates an **ImportBatch** with counts: parsed, imported, **merged** (reconciled onto an existing instrument), duplicate (same source re-imported → refreshed in place), skipped (zero qty/value), unclassified. Review them on **Data & Imports**.
