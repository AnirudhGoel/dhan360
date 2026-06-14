"""Refresh the AMFI scheme master from the public NAVAll feed.

Downloads https://www.amfiindia.com/spages/NAVAll.txt and writes a scheme_code -> {name, isin}
map to app/refdata/data/amfi_schemes_full.json. This runs entirely against a public, anonymous
endpoint (no personal data). The classifier matches category by scheme name when an explicit
category isn't present, so this snapshot is enough to widely improve coverage.

Usage:  python -m scripts.fetch_refdata
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

AMFI_URL = "https://www.amfiindia.com/spages/NAVAll.txt"
OUT = Path(__file__).resolve().parents[1] / "app" / "refdata" / "data" / "amfi_schemes_full.json"


def fetch(url: str = AMFI_URL) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "dhan360/0.1 (+refdata)"})
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 — fixed public URL
        return resp.read().decode("utf-8", errors="replace")


def parse_navall(text: str) -> dict[str, dict]:
    """Lines look like:  CODE;ISIN_GROWTH;ISIN_REINVEST;NAME;NAV;DATE  (header lines have no ';')."""
    schemes: dict[str, dict] = {}
    for line in text.splitlines():
        parts = line.split(";")
        if len(parts) < 5:
            continue
        code = parts[0].strip()
        if not code.isdigit():
            continue
        isin = parts[1].strip() or parts[2].strip() or None
        name = parts[3].strip()
        plan = "direct" if "direct" in name.lower() else "regular"
        schemes[code] = {"name": name, "isin": isin, "plan": plan}
    return schemes


def main() -> int:
    print(f"Fetching {AMFI_URL} …")
    try:
        text = fetch()
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to fetch AMFI data: {exc}", file=sys.stderr)
        return 1
    schemes = parse_navall(text)
    if not schemes:
        print("No schemes parsed — feed format may have changed.", file=sys.stderr)
        return 1
    OUT.write_text(json.dumps(schemes, indent=0, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(schemes)} schemes to {OUT.relative_to(OUT.parents[3])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
