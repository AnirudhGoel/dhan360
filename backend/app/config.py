"""Application configuration.

Privacy-first defaults: everything stays on the local machine. The SQLite database
lives in a local file under ``DHAN360_DATA_DIR`` (defaults to ``./data``).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DHAN360_", env_file=".env", extra="ignore")

    # Where the local SQLite db and any user data are stored. Nothing leaves this dir.
    data_dir: str = "./data"

    # CORS origins for the Vite dev server. In production the API serves the built SPA
    # from the same origin, so this is only relevant during development.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    app_name: str = "dhan360"

    @property
    def data_path(self) -> Path:
        p = Path(self.data_dir).expanduser().resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def db_path(self) -> Path:
        return self.data_path / "dhan360.db"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.db_path}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    # Allow overriding the data dir for tests via env without import side effects.
    return Settings()


settings = get_settings()
