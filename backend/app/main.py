"""dhan360 FastAPI application.

Local-first: on startup it ensures the SQLite schema exists. In production it also serves the
built React SPA from ``frontend/dist`` so the whole app runs from a single process/port.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import analytics as analytics_router
from app.api import config as config_router
from app.api import imports as imports_router
from app.api import portfolio as portfolio_router
from app.config import settings
from app.db.database import init_db

app = FastAPI(title="dhan360", version="0.1.0", description="India-first portfolio analytics")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name, "version": "0.1.0"}


app.include_router(imports_router.router)
app.include_router(portfolio_router.router)
app.include_router(config_router.router)
app.include_router(analytics_router.router)


# ---- serve the built SPA (production) ---------------------------------------------
_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=_FRONTEND_DIST / "assets"), name="assets")

    def _index_response() -> FileResponse:
        # The SPA shell must revalidate every load so a rebuilt bundle (new hashed asset names)
        # is always picked up — otherwise a cached index.html keeps loading the old JS/CSS.
        # The hashed /assets files stay immutably cacheable, so only this tiny HTML revalidates.
        return FileResponse(_FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-cache"})

    @app.get("/{full_path:path}")
    def spa(full_path: str):  # noqa: ANN201
        # Serve real files when present, else fall back to index.html for client routing.
        candidate = _FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return _index_response()
