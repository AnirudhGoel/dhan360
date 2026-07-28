"""Capture a snapshot of every read endpoint into a static fixture map for the demo build.

The demo build of the frontend has no backend — it serves these fixtures. Keys are normalized
(path + sorted raw query params) to match how the frontend constructs request URLs, so the
in-browser demo layer can look them up directly. Run against the seeded sample DB:

    cd backend && DHAN360_DATA_DIR=./data ../<venv>/bin/python -m scripts.capture_demo
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "demo" / "fixtures.json"


def demo_key(path: str, params: dict | None = None) -> str:
    if not params:
        return path
    parts = [f"{k}={v}" for k, v in sorted(params.items())]
    return f"{path}?{'&'.join(parts)}"


def main() -> None:
    client = TestClient(app)
    fixtures: dict[str, object] = {}

    def cap(path: str, params: dict | None = None) -> dict:
        r = client.get(path, params=params)
        r.raise_for_status()
        body = r.json()
        fixtures[demo_key(path, params)] = body
        return body

    # Core read endpoints
    summary = cap("/api/portfolio/summary")
    cap("/api/holdings")  # unfiltered
    cap("/api/transactions")
    cap("/api/mutual-funds")
    cap("/api/stocks")
    cap("/api/concentration")
    cap("/api/overlap")
    cap("/api/imports")
    cap("/api/taxonomy")
    cap("/api/overrides")
    cap("/api/targets")

    # Holdings filters — enumerate every value the dashboard/holdings UI can click.
    def labels(key: str) -> list[str]:
        return [s["label"] for s in summary.get(key, [])]

    for ac in labels("asset_allocation"):
        cap("/api/holdings", {"asset_class": ac})
    for cap_label in labels("equity_cap_split"):
        cap("/api/holdings", {"cap": cap_label})
    for sub in labels("debt_split") + labels("gold_split"):
        cap("/api/holdings", {"sub_class": sub})
    for sector in labels("sector_exposure"):
        cap("/api/holdings", {"sector": sector})
    for account in labels("by_account"):
        cap("/api/holdings", {"account": account})

    # Rebalance — both modes at the UI defaults.
    cap("/api/rebalance", {"mode": "rebalance", "new_money": 0})
    cap("/api/rebalance", {"mode": "new_money", "new_money": 100000})

    # XIRR — every scope, lifetime + the fixed (date-independent) demo period.
    for scope in ("portfolio", "asset_class", "instrument"):
        cap("/api/analytics/xirr", {"scope": scope})
        cap("/api/analytics/xirr", {"scope": scope, "from": "2025-06-01", "to": "2025-12-31"})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fixtures, indent=0, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(fixtures)} fixtures ({OUT.stat().st_size // 1024} KB) to {OUT}")


if __name__ == "__main__":
    main()
