#!/usr/bin/env python3
"""
Refresh stocks.json from NSE index constituent files.

Sources (all free, no login required):
  Nifty 50        → Large Cap (ranks  1-50)
  Nifty Next 50   → Large Cap (ranks 51-100)
  Nifty Midcap150 → Mid Cap   (ranks 101-250)
  Nifty Smallcap250→ Small Cap (ranks 251+)

This maps directly to the AMFI convention used throughout dhan360:
  top-100 = Large Cap, 101-250 = Mid Cap, 251+ = Small Cap.

Run:
  python scripts/fetch_refdata.py

Writes (in sync):
  frontend/src/engine/data/stocks.json
  backend/app/refdata/data/stocks.json
"""

from __future__ import annotations

import csv
import io
import json
import sys
import urllib.request
from pathlib import Path

# ─── Sources ──────────────────────────────────────────────────────────────────

NSE_INDICES = [
    ("https://archives.nseindia.com/content/indices/ind_nifty50list.csv",         "Large Cap"),
    ("https://archives.nseindia.com/content/indices/ind_niftynext50list.csv",     "Large Cap"),
    ("https://archives.nseindia.com/content/indices/ind_niftymidcap150list.csv",  "Mid Cap"),
    ("https://archives.nseindia.com/content/indices/ind_niftysmallcap250list.csv","Small Cap"),
]

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "text/csv,application/csv,*/*",
    "Referer": "https://www.nseindia.com/",
}

# ─── Sector mapping ───────────────────────────────────────────────────────────
# NSE industry strings (case-insensitive) → dhan360 sector taxonomy.
# Keys are lowercase; the map is checked after lower-casing the raw NSE value.

SECTOR_MAP: dict[str, str] = {
    "financial services":                   "Financial Services",
    "financial services - nbfc":            "Financial Services",
    "insurance":                            "Financial Services",
    "information technology":               "Information Technology",
    "it":                                   "Information Technology",
    "oil gas & consumable fuels":           "Energy",
    "oil, gas & consumable fuels":          "Energy",
    "energy":                               "Energy",
    "fast moving consumer goods":           "FMCG",
    "fmcg":                                 "FMCG",
    "consumer staples":                     "FMCG",
    "automobile and auto components":       "Automobile",
    "automobile & auto components":         "Automobile",
    "automobile":                           "Automobile",
    "auto components":                      "Automobile",
    "healthcare":                           "Healthcare",
    "pharmaceuticals & biotechnology":      "Healthcare",
    "pharmaceuticals":                      "Healthcare",
    "consumer healthcare":                  "Healthcare",
    "construction":                         "Construction",
    "construction materials":               "Construction",
    "cement & cement products":             "Construction",
    "realty":                               "Real Estate",
    "real estate":                          "Real Estate",
    "metals & mining":                      "Metals & Mining",
    "metals and mining":                    "Metals & Mining",
    "steel":                                "Metals & Mining",
    "mining":                               "Metals & Mining",
    "power":                                "Power",
    "utilities":                            "Power",
    "telecommunication":                    "Telecommunication",
    "telecom":                              "Telecommunication",
    "consumer services":                    "Consumer Services",
    "retailing":                            "Consumer Services",
    "hospitality":                          "Consumer Services",
    "services":                             "Infrastructure",
    "consumer durables":                    "Consumer Durables",
    "durables":                             "Consumer Durables",
    "capital goods":                        "Capital Goods",
    "industrial manufacturing":             "Capital Goods",
    "industrials":                          "Capital Goods",
    "chemicals":                            "Chemicals",
    "fertilisers & agrochemicals":          "Chemicals",
    "agrochemicals":                        "Chemicals",
    "media entertainment & publication":    "Media",
    "media & entertainment":                "Media",
    "media":                                "Media",
    "textiles":                             "Textiles",
    "forest materials":                     "Diversified",
    "diversified":                          "Diversified",
    "conglomerate":                         "Diversified",
    "agriculture":                          "Agriculture",
    "agri":                                 "Agriculture",
}


def map_sector(raw: str) -> str:
    return SECTOR_MAP.get(raw.strip().lower(), raw.strip().title() or "Diversified")


# ─── Fetch ────────────────────────────────────────────────────────────────────

def fetch_csv(url: str) -> list[dict[str, str]]:
    req = urllib.request.Request(url, headers=FETCH_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8-sig")  # utf-8-sig strips BOM if present
    except Exception as exc:
        print(f"  WARN: could not fetch {url.split('/')[-1]}: {exc}", file=sys.stderr)
        return []
    reader = csv.DictReader(io.StringIO(raw))
    return [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in reader]


def fetch_all() -> dict[str, dict]:
    stocks: dict[str, dict] = {}

    for url, market_cap in NSE_INDICES:
        label = url.split("/")[-1].replace("ind_", "").replace("list.csv", "")
        print(f"  {market_cap:10s}  {label} ...", end="  ", flush=True)
        rows = fetch_csv(url)
        if not rows:
            print("SKIPPED (fetch failed)")
            continue

        added = 0
        for row in rows:
            symbol = row.get("Symbol", "").upper()
            series = row.get("Series", "EQ").upper()
            isin   = row.get("ISIN Code", "")
            name   = row.get("Company Name", "")
            sector = map_sector(row.get("Industry", ""))

            # Skip preference shares, warrants, etc.
            if series not in ("EQ", "BE", "BZ", "SM", "ST"):
                continue
            if not symbol or not isin:
                continue

            # First index processed for a symbol wins (Nifty50 > Next50 > Mid > Small).
            if symbol not in stocks:
                stocks[symbol] = {
                    "name":       name,
                    "sector":     sector,
                    "market_cap": market_cap,
                    "isin":       isin,
                }
                added += 1

        already = len(rows) - added
        print(f"+{added} new  ({already} already seen)  →  {len(stocks)} total")

    return stocks


# ─── Write ────────────────────────────────────────────────────────────────────

COMMENT = (
    "Direct-equity reference: NSE symbol → {name, sector, market_cap, isin}. "
    "market_cap follows AMFI convention: top-100 = Large Cap, 101-250 = Mid Cap, 251+ = Small Cap. "
    "Generated by scripts/fetch_refdata.py from NSE index constituent files; "
    "re-run twice a year (AMFI updates in Jan & Jul) to stay current."
)


def write_output(path: Path, stocks: dict[str, dict]) -> None:
    out: dict = {"_comment": COMMENT}
    out.update(sorted(stocks.items()))   # sort by symbol for stable git diffs
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  → {path}  ({len(stocks)} stocks)")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent

    fe_out = repo_root / "frontend" / "src" / "engine" / "data" / "stocks.json"
    be_out = repo_root / "backend" / "app" / "refdata" / "data" / "stocks.json"

    print("dhan360 refdata refresh — NSE index constituents\n")
    print("Fetching ...")
    stocks = fetch_all()

    if not stocks:
        print("\nERROR: No data fetched. Check your internet connection.", file=sys.stderr)
        sys.exit(1)

    print(f"\nTotal: {len(stocks)} stocks across all indices")
    caps = {}
    for v in stocks.values():
        caps[v["market_cap"]] = caps.get(v["market_cap"], 0) + 1
    for cap, n in sorted(caps.items()):
        print(f"  {cap}: {n}")

    print("\nWriting ...")
    write_output(fe_out, stocks)
    write_output(be_out, stocks)

    print("\nDone. Review the diff, then commit both stocks.json files.")
    print("Re-run in January and July when AMFI publishes updated rankings.")


if __name__ == "__main__":
    main()
