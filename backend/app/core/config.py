from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_DEV_JWT_SECRET_PLACEHOLDER = "dev-only-replace-with-strong-random-secret-key-2026"


def normalize_async_database_url(raw_url: str) -> str:
    """Normalize PostgreSQL URLs (including Neon) for SQLAlchemy + asyncpg."""
    url = raw_url.strip()
    lower_url = url.lower()
    if lower_url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://") :]
    elif lower_url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    elif lower_url.startswith("postgres+asyncpg://"):
        url = "postgresql+asyncpg://" + url[len("postgres+asyncpg://") :]
    elif lower_url.startswith("postgresql+asyncpg://"):
        url = "postgresql+asyncpg://" + url[len("postgresql+asyncpg://") :]

    parts = urlsplit(url)
    if not parts.query:
        return url

    filtered_params: list[tuple[str, str]] = []
    sslmode_value: str | None = None
    has_ssl = False
    for key, val in parse_qsl(parts.query, keep_blank_values=True):
        key_lower = key.lower()
        if key_lower == "channel_binding":
            continue
        if key_lower == "sslmode":
            sslmode_value = val.lower()
            continue
        if key_lower == "ssl":
            has_ssl = True
            filtered_params.append(("ssl", val))
        else:
            filtered_params.append((key, val))

    if sslmode_value is not None and not has_ssl:
        if sslmode_value == "disable":
            filtered_params.append(("ssl", "disable"))
        elif sslmode_value in {"allow", "prefer"}:
            filtered_params.append(("ssl", "prefer"))
        else:
            filtered_params.append(("ssl", sslmode_value))

    new_query = urlencode(filtered_params)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "ShasthoGrid API"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str = "postgresql+asyncpg://awaregrid:awaregrid@localhost:5432/awaregrid"

    REDIS_URL: str = "redis://localhost:6379/0"
    UPSTASH_REDIS_REST_URL: str | None = None
    UPSTASH_REDIS_REST_TOKEN: str | None = None

    JWT_SECRET_KEY: str = _DEV_JWT_SECRET_PLACEHOLDER
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    RATE_LIMIT_REQUESTS: int = 120
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    IDEMPOTENCY_TTL_HOURS: int = 24

    GROQ_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None

    # Routing (CareMatch ETAs). OSRM is optional; a Haversine x road-factor estimate is the fallback.
    OSRM_ENABLED: bool = False
    OSRM_BASE_URL: str = "https://router.project-osrm.org"
    OSRM_TIMEOUT_SECONDS: float = 2.5
    URBAN_ROAD_FACTOR: float = 1.35
    AMBULANCE_SPEED_KMH: float = 22.0
    COURIER_SPEED_KMH: float = 30.0

    # LockStep holds: auto-expire after HOLD_TTL_SECONDS; the sweeper runs every interval.
    HOLD_TTL_SECONDS: int = 600
    HOLD_SWEEP_INTERVAL_SECONDS: int = 30
    LOCKSTEP_SWEEPER_ENABLED: bool = True

    # Live capacity: counts older than this (from STAFF or FEED) are flagged stale and deprioritised.
    CAPACITY_STALE_MINUTES: int = 360

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _validate_database_url(cls, value: Any) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("DATABASE_URL must be a non-empty string")
        return normalize_async_database_url(value)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            if raw.startswith("["):
                parsed = json.loads(raw)
                return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in raw.split(",") if item.strip()]
        raise ValueError("Invalid CORS_ORIGINS configuration")

    @field_validator(
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
        "GROQ_API_KEY",
        "GEMINI_API_KEY",
        mode="before",
    )
    @classmethod
    def _empty_string_to_none(cls, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return str(value)

    @model_validator(mode="after")
    def _validate_jwt_secret_key(self) -> Settings:
        secret = self.JWT_SECRET_KEY.strip()
        if not secret:
            raise ValueError("JWT_SECRET_KEY must not be blank.")
        if self.ENVIRONMENT.strip().lower() in {"production", "prod"}:
            if secret == _DEV_JWT_SECRET_PLACEHOLDER or len(secret) < 32:
                raise ValueError(
                    "JWT_SECRET_KEY must be a strong (>=32 char) non-default secret in production."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
