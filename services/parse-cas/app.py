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

import io
import logging

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# Don't log request bodies. Keep uvicorn access logs off in production if you like.
logging.getLogger("uvicorn.access").disabled = False

import os

MAX_BYTES = 15 * 1024 * 1024  # 15 MB — CAS PDFs are small; reject anything larger.
# Comma-separated allowed origins (your client app). Default permissive for local dev.
ALLOWED_ORIGINS = os.getenv("PARSE_CAS_ORIGINS", "*").split(",")

app = FastAPI(title="dhan360 parse-cas", version="1.0.0", description="Stateless CAS PDF → JSON")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/parse-cas")
async def parse_cas(request: Request, password: str = Form(""), file: UploadFile = File(...)) -> dict:
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
        parsed = casparser.read_cas_pdf(io.BytesIO(data), password, output="dict")
    except Exception as exc:  # noqa: BLE001 — surface a clean message, never the raw stack
        msg = str(exc).lower()
        if "password" in msg or "decrypt" in msg:
            raise HTTPException(422, "Incorrect password or the PDF could not be decrypted.")
        raise HTTPException(422, "Could not parse this CAS PDF. Is it a CAMS/KFintech statement?")
    finally:
        del data  # drop the bytes promptly; nothing is persisted

    return parsed
