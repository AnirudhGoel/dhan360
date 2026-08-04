# kite-prices — historical price proxy for dhan360

Kite's `api_secret` can't live in the browser and Kite's data endpoints don't allow browser
(CORS) calls, so this small service — which **you** run and configure with **your** Kite creds —
proxies historical-price requests for the dhan360 client.

It only touches **market prices**. Your holdings never pass through it: the client sends the list
of symbols + a date range it needs, this returns daily closes, and the client fills its own local
cache so direct-equity **period XIRR** and the **performance curve** work.

Nothing is persisted. The Kite session lives in memory only.

## Prerequisites

- A **Kite Connect** app (`api_key` + `api_secret`) — https://developer.kite.trade
- The **Historical Data** subscription active on that app (otherwise `/prices` returns errors).
- In the Kite app settings, set the **Redirect URL** to `<this-service-url>/callback`.

## Configure

| Env var | Purpose |
|---|---|
| `KITE_API_KEY` | Kite Connect app key |
| `KITE_API_SECRET` | Kite Connect app secret (used only for the daily login exchange) |
| `KITE_PRICES_ORIGINS` | Comma-separated allowed browser origins, e.g. `https://dhan360.in` |
| `KITE_ACCESS_TOKEN` | *(optional)* set a token directly and skip the `/login` flow |

## Run

```bash
pip install -r requirements.txt
KITE_API_KEY=... KITE_API_SECRET=... KITE_PRICES_ORIGINS=https://dhan360.in \
  uvicorn app:app --port 8080
# or: docker build -t kite-prices . && docker run -p 8080:8080 --env-file .env kite-prices
```

## Daily login

Kite access tokens expire ~6am daily. Each morning (and after any restart):

1. `GET /login` → returns `{ "login_url": ... }`.
2. Open that URL, log in to Kite; it redirects to `/callback?request_token=...`.
3. The service exchanges the token and holds it in memory. `GET /status` confirms.

The dhan360 client detects a `401` and prompts you to reconnect.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | liveness |
| `GET` | `/status` | `{ authenticated, token_date }` |
| `GET` | `/login` | returns the Kite login URL |
| `GET` | `/callback?request_token=…` | completes login (Kite redirect target) |
| `POST` | `/prices` | `{ symbols[], from_date, to_date, exchange? }` → `{ prices: { SYM: [[date, close]…] }, missing[] }` |

Point the dhan360 client at this service with `VITE_KITE_PRICES_URL=<this-service-url>`.
