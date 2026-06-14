# Roadmap

dhan360's MVP nails the core loop: **import → reconcile → classify → visualize → rebalance**, privacy-first and India-specific. Beyond that:

## Near term
- **Live-ish prices** — refresh NAVs from AMFI NAVAll and equity/ETF quotes (optional, user-triggered, still local).
- **XIRR & cashflows** — use CAS/tradebook transactions (already captured) to compute XIRR per holding and portfolio.
- **CDSL/NSDL demat CAS PDF** — parse demat holdings PDFs (stocks/bonds/ETFs/SGBs) natively.
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
- **Backup / restore & encryption at rest** for the local DB.
- **Alerts** on drift thresholds.

## Engineering
- Code-split the SPA bundle; add e2e tests.
- Optional read-only broker integrations behind explicit, local-only consent.

Contributions welcome — adding a parser or extending reference data is intentionally easy. See [CONTRIBUTING](../CONTRIBUTING.md).
