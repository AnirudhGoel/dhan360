# Contributing to dhan360

Thanks for helping build a transparent, privacy-first portfolio tool for Indian investors! The architecture is intentionally modular so the two most valuable contributions — **new import sources** and **better reference data** — are easy.

## Dev setup

```bash
make setup     # venv + backend deps + frontend deps
make seed      # sample portfolio
make test      # backend tests
make dev-backend   # :8000
make dev-frontend  # :5173
```

## Add a new import parser

1. Create `backend/app/parsers/<source>.py` with a `parse(content, file_name=..., **kw) -> ParseResult` (or a `parse_dict`/`parse_bytes` for JSON/PDF). Return normalized `ParsedHolding`s using the contract in `parsers/base.py`. Set the right `instrument_type` and pass identity keys (ISIN/symbol/scheme_code) so reconciliation can dedupe.
2. Wire it into `backend/app/api/imports.py` (`_CSV_PARSERS` or a branch in `upload`), and add a button in `frontend/src/pages/Imports.tsx`.
3. Add an **anonymized** sample to `samples/` and a test in `backend/tests/test_parsers.py`.

The rest of the pipeline (reconcile → classify → aggregate) is source-agnostic — you don't touch it.

## Extend reference data

Edit the JSON under `backend/app/refdata/data/`:
- `etf_map.json` — symbol → `{name, asset_class, sub_class, sector?}` for known ETFs.
- `stocks.json` — symbol → `{name, sector, market_cap, isin}`.
- `mf_categories.json` — SEBI category → classification + estimated look-through split.
- `amfi_schemes.json` — scheme code → `{name, category, amc, plan}`.

Keep entries factual and cite-able where possible. Run `make test`.

## Classification changes

The engine (`app/classify/`) is **pure and DB-free** — easy to unit-test. Add cases to `backend/tests/test_classify.py` (especially tricky ones: new ETF kinds, hybrids, internationals). The taxonomy lives in `app/domain/taxonomy.py`; changing a bucket name is a UI contract change, so do it deliberately.

## Contributor License Agreement

dhan360 is licensed under the **AGPL-3.0**. Before we can merge your first contribution, we ask you
to agree to a short **[Contributor License Agreement](CLA.md)** — you keep copyright of your work,
and it lets the project stay open source while supporting an optional hosted edition. The
CLA-assistant bot will prompt you on your first PR.

## Guidelines

- **Never commit real financial data.** Samples must be anonymized.
- Match the surrounding code style. Backend uses type hints; frontend is strict TS.
- Prefer transparency over false precision — when unsure, classify as `Unclassified`/`estimated` and surface it, rather than guessing.
- Keep it privacy-first: no telemetry, no external calls without explicit, local, opt-in consent.

## Reporting issues

Open an issue with the source/format involved (anonymized) and what you expected vs. saw. Misclassifications are valuable bug reports — include the instrument and the bucket you'd expect.
