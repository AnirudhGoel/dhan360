"""Drop and recreate all tables. Destroys local data — use with care."""

from __future__ import annotations

from app.db.database import Base, engine, init_db


def reset() -> None:
    Base.metadata.drop_all(bind=engine)
    init_db()
    print("Database reset.")


if __name__ == "__main__":
    reset()
