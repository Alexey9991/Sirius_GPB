from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_URL = f"sqlite:///{(PROJECT_ROOT / 'data' / 'app.sqlite3').as_posix()}"


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


class Config:
    API_TITLE = "Risk Intelligence API"
    API_VERSION = "1.0.0"
    DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    AUTO_CREATE_DB = env_bool("AUTO_CREATE_DB", DATABASE_URL.startswith("sqlite"))
    DEFAULT_USER_ID = os.getenv("DEFAULT_USER_ID", "local-demo")
