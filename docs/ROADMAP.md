# Roadmap

dhan360's MVP nails the core loop: **import → reconcile → classify → visualize → rebalance**, privacy-first and India-specific. Beyond that:

## Shipped since the MVP
- ✅ **XIRR & cashflows** — lifetime + configurable **period** XIRR from CAS/tradebook transactions, with honest coverage flags.
- ✅ **Mutual-fund NAV & performance curve** — client-side NAV from mfapi.in; a unitized (time-weighted) return curve.
- ✅ **Equity historical prices** — via a **historical-prices CSV** or the self-run **Kite price proxy** (`services/kite-prices`), enabling direct-equity period XIRR.
- ✅ **Fully client-side runtime** — the whole app in the browser (IndexedDB), plus **backup/restore**.

## Near term
- **Combined equity + MF performance curve** + a Nifty benchmark overlay.
- **Dividends in equity returns** (currently price-return only).
- **CDSL/NSDL demat CAS PDF** — parse demat holdings PDFs (stocks/bonds/ETFs/SGBs) natively for multi-broker consolidation.
- **Disclosed fund look-through** — ingest monthly AMC portfolio disclosures so more funds get *real* (not estimated) constituents → better concentration & overlap.
- **Capital-gains reports** — realized/unrealized, STCG/LTCG split, grandfathering.

## More import sources
- **Groww, Kuvera, INDmoney, Coin** CSV/exports.
- **ICICI Direct, HDFC Securities, Upstox, Angel One** holdings/tradebook formats.
- **CAMS / KFintech / MFCentral APIs** (read-only) if/when accessible.
- **NPS (NSDL/CRA) statements**, EPF passbook parsing.

## Product
- **Family / multi-member portfolios** (schema is ready) with consolidated and per-member views.
- **Goal-based buckets** and glide-path targets.
- **Custom classification rule engine** (regex/conditions) beyond single-instrument overrides.
- **Encryption at rest** for the local store (backup/restore already shipped), and optional end-to-end-encrypted cross-device sync.
- **Alerts** on drift thresholds.

## Engineering
- Code-split the SPA bundle; add e2e tests.
- Optional read-only broker integrations behind explicit, local-only consent.

Contributions welcome — adding a parser or extending reference data is intentionally easy. See [CONTRIBUTING](../CONTRIBUTING.md).
