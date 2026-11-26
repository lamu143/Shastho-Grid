from __future__ import annotations

from collections.abc import AsyncGenerator, Callable, Coroutine
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import normalize_async_database_url, settings
from app.core.rate_limit import close_redis_clients, get_redis_client
from app.db.models import Base
from app.db.seed import seed_database
from app.db.session import get_db
from app.main import app
from app.routers.lockstep import get_session_factory

test_engine = create_async_engine(
    normalize_async_database_url(settings.DATABASE_URL),
    poolclass=NullPool,
    future=True,
)

TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database() -> AsyncGenerator[None, None]:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        await seed_database(session)

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with TestSessionLocal() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_session_factory] = lambda: TestSessionLocal
    try:
        yield
    finally:
        app.dependency_overrides.clear()
        await close_redis_clients()
        await test_engine.dispose()


async def _cleanup_redis_rate_limits() -> None:
    client = await get_redis_client()
    keys = await client.keys("awaregrid:rl:*")
    if keys:
        await client.delete(*keys)


@pytest.fixture(autouse=True)
def no_real_ai_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """Never call real AI providers from tests, even if backend/.env holds real keys.

    Tests that exercise a provider path set a fake key and mock the client themselves.
    """
    monkeypatch.setattr(settings, "GROQ_API_KEY", None)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)
    monkeypatch.setattr(settings, "GEMINI_API_KEYS", [])


@pytest_asyncio.fixture(autouse=True)
async def clear_rate_limit_keys() -> AsyncGenerator[None, None]:
    await _cleanup_redis_rate_limits()
    yield
    await _cleanup_redis_rate_limits()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        try:
            yield session
        finally:
            await session.rollback()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client


@pytest.fixture
def login_as(
    client: AsyncClient,
) -> Callable[[str, str], Coroutine[Any, Any, tuple[str, dict[str, Any]]]]:
    async def _login(email: str, password: str) -> tuple[str, dict[str, Any]]:
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        assert response.status_code == 200, f"Login failed for {email}: {response.text}"
        data = response.json()
        return data["access_token"], data["user"]

    return _login
