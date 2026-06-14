"""Native CAS PDF importer using the ``casparser`` library.

Supports CAMS/KFintech/MFCentral consolidated PDFs, including password-protected files.
Parsing happens entirely on the local machine — the PDF bytes are never sent anywhere.
The parsed structure is normalized through the shared :mod:`cas_json` core.
"""

from __future__ import annotations

import io

from app.domain.taxonomy import Source
from app.parsers.base import ParseResult
from app.parsers.cas_json import parse_dict


def parse_bytes(data: bytes, password: str, file_name: str | None = None) -> ParseResult:
    try:
        import casparser
    except ImportError:  # pragma: no cover
        result = ParseResult(source=Source.CAS_PDF, file_name=file_name)
        result.error("casparser is not installed; cannot parse CAS PDF.")
        return result

    try:
        parsed = casparser.read_cas_pdf(io.BytesIO(data), password, output="dict")
    except Exception as exc:  # noqa: BLE001 — surface any parse failure to the UI
        result = ParseResult(source=Source.CAS_PDF, file_name=file_name)
        msg = str(exc)
        if "password" in msg.lower() or "decrypt" in msg.lower():
            result.error("Incorrect password or the PDF could not be decrypted.")
        else:
            result.error(f"Failed to parse CAS PDF: {msg}")
        return result

    return parse_dict(parsed, file_name=file_name, source=Source.CAS_PDF)
