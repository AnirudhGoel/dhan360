"""Small CSV helpers shared by the CSV-based parsers."""

from __future__ import annotations

import csv
import io
import re
from typing import Iterable


def sniff_rows(content: str) -> list[dict[str, str]]:
    """Parse CSV text into a list of dict rows, locating the real header under banner rows.

    Broker exports often prefix the real table with title/summary lines (e.g. Zerodha Console:
    "Client ID", "Present Value"). Those have only 1–2 populated cells, whereas the header and data
    rows are broad — so we take the first well-populated row as the header and parse from there.
    """
    grid = [row for row in csv.reader(io.StringIO(content))]
    grid = [row for row in grid if any((c or "").strip() for c in row)]  # drop blank/banner-blank rows
    if not grid:
        return []

    def filled(r: list[str]) -> int:
        return sum(1 for c in r if (c or "").strip())

    max_filled = max(filled(r) for r in grid)
    threshold = max(3, -(-max_filled // 2))  # ceil(max_filled / 2), min 3
    header_idx = next((i for i, r in enumerate(grid) if filled(r) >= threshold), 0)

    header = [(c or "").strip() for c in grid[header_idx]]
    rows: list[dict[str, str]] = []
    for r in grid[header_idx + 1:]:
        if not any((c or "").strip() for c in r):
            continue
        rec = {header[j]: (r[j] or "").strip() for j in range(min(len(header), len(r))) if header[j]}
        rows.append(rec)
    return rows


def _norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", h.lower())


def find_col(headers: Iterable[str], *candidates: str) -> str | None:
    """Return the actual header matching any candidate (normalized, substring-aware)."""
    norm = {_norm_header(h): h for h in headers}
    cand_norm = [_norm_header(c) for c in candidates]
    # Exact normalized match first.
    for c in cand_norm:
        if c in norm:
            return norm[c]
    # Substring match.
    for c in cand_norm:
        for nh, original in norm.items():
            if c and c in nh:
                return original
    return None


def to_float(value: str | None) -> float | None:
    if value is None:
        return None
    s = str(value).strip().replace(",", "").replace("₹", "").replace("%", "")
    if s in ("", "-", "NA", "N/A", "null", "None"):
        return None
    # Handle parenthesised negatives e.g. (1,234.50)
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        val = float(s)
    except ValueError:
        return None
    return -val if neg else val
