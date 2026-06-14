"""Small CSV helpers shared by the CSV-based parsers."""

from __future__ import annotations

import csv
import io
import re
from typing import Iterable


def sniff_rows(content: str) -> list[dict[str, str]]:
    """Parse CSV text into a list of dict rows, tolerating a few junk header lines.

    Broker exports often prefix the real table with title/disclaimer lines. We find the
    first line that looks like a header (>=3 comma-separated cells) and parse from there.
    """
    lines = content.splitlines()
    start = 0
    for i, line in enumerate(lines):
        if line.count(",") >= 2 and any(c.isalpha() for c in line):
            start = i
            break
    reader = csv.DictReader(io.StringIO("\n".join(lines[start:])))
    rows: list[dict[str, str]] = []
    for row in reader:
        # Drop fully-empty rows.
        if any((v or "").strip() for v in row.values()):
            rows.append({(k or "").strip(): (v or "").strip() for k, v in row.items()})
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
