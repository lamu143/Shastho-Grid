from __future__ import annotations

import asyncio
import contextlib
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.telemetry import telemetry
from app.core.rate_limit import (
    RateLimitMiddleware,
    check_redis_health,
    close_redis_clients,
)
from app.db.session import AsyncSessionLocal, engine, get_db
from app.routers.admin import router as admin_router
from app.routers.analytics import router as analytics_router
from app.routers.auth import router as auth_router
from app.routers.critical_care import router as critical_care_router
from app.routers.copilot import router as copilot_router
from app.routers.feed import router as feed_router
from app.routers.sathi import router as sathi_router
from app.routers.lockstep import router as lockstep_router
from app.services.lockstep import sweep_expired_holds
from app.routers.dispenses import router as dispenses_router
from app.routers.inventory import router as inventory_router
from app.routers.optimize import router as optimize_router
from app.routers.patients import router as patients_router
from app.routers.sync import router as sync_router
from app.routers.voice import router as voice_router
from app.schemas.common import HealthResponse

logger = logging.getLogger(__name__)


_TRACE_ID_RE = re.compile(r"[A-Za-z0-9-]{8,64}")


class TraceIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Any:
        # Accept a caller trace id only if it is short and safe (audit column is 64 chars).
        supplied = request.headers.get("X-Trace-Id", "")
        trace_id = supplied if _TRACE_ID_RE.fullmatch(supplied) else str(uuid.uuid4())
        request.state.trace_id = trace_id
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started) * 1000.0
        response.headers.setdefault("X-Trace-Id", trace_id)
        response.headers.setdefault("X-Response-Time-Ms", f"{duration_ms:.2f}")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        telemetry.record(
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            trace_id=trace_id,
        )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("Startup DB check failed: %s", exc)

    await check_redis_health()

    sweeper: asyncio.Task | None = None
    if settings.LOCKSTEP_SWEEPER_ENABLED:
        sweeper = asyncio.create_task(_lockstep_sweeper_loop())

    yield

    if sweeper is not None:
        sweeper.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sweeper
    await close_redis_clients()
    await engine.dispose()


async def _lockstep_sweeper_loop() -> None:
    """Release expired LockStep holds every HOLD_SWEEP_INTERVAL_SECONDS (SKIP LOCKED)."""
    while True:
        await asyncio.sleep(settings.HOLD_SWEEP_INTERVAL_SECONDS)
        try:
            total_expired = 0
            async with AsyncSessionLocal() as session:
                while True:
                    expired = await sweep_expired_holds(session)
                    total_expired += expired
                    if expired < 100:
                        break
            if total_expired:
                logger.info("LockStep sweeper released %d expired hold(s)", total_expired)
        except Exception as exc:  # keep the loop alive through transient DB errors
            logger.warning("LockStep sweeper failed: %s", exc)


_is_dev_like = settings.ENVIRONMENT.strip().lower() in {"development", "dev", "local", "test"}

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if _is_dev_like else None,
    redoc_url="/redoc" if _is_dev_like else None,
    openapi_url="/openapi.json" if _is_dev_like else None,
)

# Register middleware in reverse execution order (LIFO):
# TraceIdMiddleware (outermost) -> CORSMiddleware -> RateLimitMiddleware (innermost)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Trace-Id", "X-Response-Time-Ms", "X-Idempotent-Replay", "Retry-After"],
)
app.add_middleware(TraceIdMiddleware)

register_exception_handlers(app)


@app.get("/healthz", response_model=HealthResponse, tags=["health"])
async def healthz(db: AsyncSession = Depends(get_db)) -> HealthResponse | JSONResponse:
    db_ok = False
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        logger.warning("Healthz DB check failed: %s", exc)

    redis_ok = await check_redis_health()

    payload = HealthResponse(
        status="ok" if (db_ok and redis_ok) else "degraded",
        db="ok" if db_ok else "error",
        redis="ok" if redis_ok else "error",
    )
    if not (db_ok and redis_ok):
        return JSONResponse(status_code=503, content=payload.model_dump())
    return payload


app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(patients_router, prefix="/api/v1")
app.include_router(inventory_router, prefix="/api/v1")
app.include_router(optimize_router, prefix="/api/v1")
app.include_router(dispenses_router, prefix="/api/v1")
app.include_router(sync_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(voice_router, prefix="/api/v1")
app.include_router(critical_care_router, prefix="/api/v1")
app.include_router(lockstep_router, prefix="/api/v1")
app.include_router(copilot_router, prefix="/api/v1")
app.include_router(feed_router, prefix="/api/v1")
app.include_router(sathi_router, prefix="/api/v1")
