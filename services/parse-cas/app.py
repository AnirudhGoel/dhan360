"""Stateless CAS PDF → JSON microservice.

The one server-side carve-out for the otherwise-fully-client-side dhan360. It parses a
mutual-fund CAS PDF with `casparser` (which needs a native PDF binary that can't run in the
browser) and returns CAS JSON. The client then does everything else locally.

Privacy contract — this service is deliberately minimal and trust-minimising:
  * Stateless: the PDF is parsed in memory and immediately discarded.
  * No persistence, no database, no content logging.
  * Scale-to-zero friendly (Cloud Run / Fly / Render) so it costs ~nothing at rest.

Users who want zero server involvement can instead run `casparser` locally and upload the JSON,
or self-host the whole app. This service is the convenience path for non-technical users.
"""

from __future__ import annotations

import decimal
import io
import logging
from datetime import date
from enum import Enum

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logging.getLogger("uvicorn.access").disabled = False

MAX_BYTES = 15 * 1024 * 1024  # 15 MB — CAS PDFs are small; reject anything larger.

app = FastAPI(title="dhan360 parse-cas", version="1.0.0", description="Stateless CAS PDF → JSON")

# Allow any origin — this service stores nothing and processes everything in memory.
# Restricting origins here adds no meaningful security for a stateless parse endpoint.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


def _to_jsonable(obj: object) -> object:
    """Recursively convert casparser objects (Decimal, date, Enum) to JSON-safe types."""
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_jsonable(v) for v in obj]
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, Enum):
        return obj.value
    return obj


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/parse-cas")
async def parse_cas(request: Request, password: str = Form(""), file: UploadFile = File(...)):
    # Guard against oversized uploads before reading fully.
    clen = request.headers.get("content-length")
    if clen and int(clen) > MAX_BYTES:
        raise HTTPException(413, "File too large.")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large.")
    if not data:
        raise HTTPException(400, "Empty file.")

    try:
        import casparser
    except ImportError:  # pragma: no cover
        raise HTTPException(500, "casparser not installed.")

    try:
        parsed = casparser.read_cas_pdf(io.BytesIO(data), password)
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        if "password" in msg or "decrypt" in msg:
            raise HTTPException(422, "Incorrect password or the PDF could not be decrypted.")
        if "issuer" in msg or "identify" in msg:
            raise HTTPException(422, "MFCentral statements aren't supported yet — casparser can't identify the issuer. Download a CAS directly from mycams.com (CAMS) or kfintech.com (KFintech) and upload that instead.")
        raise HTTPException(422, f"Could not parse this CAS PDF. ({exc!s})")
    finally:
        del data  # drop the bytes promptly; nothing is persisted

    # casparser >= 0.6 returns a Pydantic CASData model. Serialize it manually so that
    # Decimal, date, and Enum fields become plain JSON types the browser can consume.
    raw = parsed.model_dump() if hasattr(parsed, "model_dump") else dict(parsed)
    return JSONResponse(content=_to_jsonable(raw))
