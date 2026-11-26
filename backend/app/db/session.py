from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import normalize_async_database_url, settings
from app.db.models import Base

engine = create_async_engine(
    normalize_async_database_url(settings.DATABASE_URL),
    pool_pre_ping=True,
    pool_recycle=240,
    pool_size=10,
    max_overflow=20,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# create_all never alters existing tables, so databases created before the
# ShasthoGrid critical-care merge are upgraded in place by these idempotent statements.
_UPGRADE_STATEMENTS = (
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS facility_id UUID "
    "REFERENCES facilities(id) ON DELETE SET NULL",
    "ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role",
    "ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN "
    "('dispenser','pharmacist','auditor','admin','dispatcher','hospital_admin','blood_bank_officer'))",
    "ALTER TABLE hospital_resources ADD COLUMN IF NOT EXISTS data_source VARCHAR(16) NOT NULL DEFAULT 'SEED_DEMO'",
    "ALTER TABLE blood_inventories ADD COLUMN IF NOT EXISTS data_source VARCHAR(16) NOT NULL DEFAULT 'SEED_DEMO'",
    "ALTER TABLE hospital_resources ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ",
    "ALTER TABLE blood_inventories ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ",
)


async def init_db() -> None:
    """Create missing tables, then apply in-place upgrades to older schemas."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for statement in _UPGRADE_STATEMENTS:
            await conn.execute(text(statement))


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async SQLAlchemy session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
