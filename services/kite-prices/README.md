# equity-prices — NSE price proxy for dhan360

Serves historical daily closes for all NSE equities. Sourced from NSE's public
bhav-copy archives — **no credentials, no API key, no login required**.

How it works: NSE publishes an end-of-day price file for every trading day at
`archives.nseindia.com`. This service downloads those files, extracts EQ-series
closes, and caches them in a local SQLite DB. A cron job keeps the cache current;
`POST /seed` loads years of history in the background.

## Configure

| Env var | Purpose |
|---|---|
| `EQUITY_PRICES_ORIGINS` | Comma-separated allowed browser origins, e.g. `https://dhan360.in` |
| `EQUITY_CACHE_DB` | Path to SQLite cache file (default: `prices.db` next to the script) |

No other configuration needed.

## Run

```bash
pip install -r requirements.txt

EQUITY_PRICES_ORIGINS=https://dhan360.in \
  uvicorn app:app --host 0.0.0.0 --port 8080

# Docker
docker build -t equity-prices .
docker run -p 8080:8080 -v $(pwd)/data:/data \
  -e EQUITY_CACHE_DB=/data/prices.db \
  -e EQUITY_PRICES_ORIGINS=https://dhan360.in \
  equity-prices
```

## Seed historical data

On first deploy, the cache is empty. Trigger a background seed (5 years is recommended):

```bash
curl -X POST "https://your-service/seed?years=5"
```

The seed runs in the background; check progress at `GET /status`. It takes
roughly 5–10 minutes depending on your network. After that, the daily cron
maintains the cache automatically.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | liveness |
| `GET` | `/status` | cache stats, last fetch date, seed progress |
| `POST` | `/seed?years=N` | trigger background historical seed (default 5yr) |
| `POST` | `/prices` | `{ symbols[], from_date, to_date }` → `{ prices: { SYM: [[date, close]…] }, missing[] }` |

Point the dhan360 client at this service with `VITE_EQUITY_PRICES_URL=<this-service-url>`.
