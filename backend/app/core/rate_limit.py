from __future__ import annotations

import asyncio
import logging
import time
import weakref
from typing import Any

import redis.asyncio as redis_async
from fastapi import Request
from fastapi.responses import JSONResponse
from jose import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from upstash_redis.asyncio import Redis as UpstashAsyncRedis

from app.core.config import settings
from app.core.errors import build_error_payload, get_trace_id

logger = logging.getLogger(__name__)

_tcp_clients_by_loop: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, redis_async.Redis] = (
    weakref.WeakKeyDictionary()
)
_upstash_clients_by_loop: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, UpstashAsyncRedis] = (
    weakref.WeakKeyDictionary()
)

_SKIP_PATHS = frozenset({"/healthz", "/docs", "/redoc", "/openapi.json"})


def is_upstash_configured() -> bool:
    return bool(settings.UPSTASH_REDIS_REST_URL and settings.UPSTASH_REDIS_REST_TOKEN)


async def get_redis_client() -> Any:
    """Return an event-loop-local Redis client (Upstash REST if configured, else TCP Redis)."""
    loop = asyncio.get_running_loop()

    if is_upstash_configured():
        client = _upstash_clients_by_loop.get(loop)
        if client is None:
            client = UpstashAsyncRedis(
                url=settings.UPSTASH_REDIS_REST_URL or "",
                token=settings.UPSTASH_REDIS_REST_TOKEN or "",
            )
            _upstash_clients_by_loop[loop] = client
        return client

    client = _tcp_clients_by_loop.get(loop)
    if client is None:
        client = redis_async.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        _tcp_clients_by_loop[loop] = client
    return client


async def check_rate_limit(
    identifier: str,
    limit: int | None = None,
    window_seconds: int | None = None,
) -> tuple[bool, int, int]:
    """Fixed-window counter rate limiter returning (allowed, remaining, window_seconds)."""
    max_requests = limit if limit is not None else settings.RATE_LIMIT_REQUESTS
    window = max(1, window_seconds if window_seconds is not None else settings.RATE_LIMIT_WINDOW_SECONDS)
    bucket = int(time.time() // window)
    key = f"awaregrid:rl:{identifier}:{bucket}"

    client = await get_redis_client()
    count = int(await client.incr(key))
    if count == 1:
        await client.expire(key, window)

    remaining = max(0, max_requests - count)
    return (count <= max_requests, remaining, window)


async def check_redis_health() -> bool:
    """Ping the active Redis backend (Upstash REST or local TCP Redis)."""
    try:
        client = await get_redis_client()
        result = await client.ping()
        return bool(result)
    except Exception as exc:
        logger.warning("Redis health check failed: %s", exc)
        return False


async def close_redis_clients() -> None:
    """Close any Redis clients associated with the active or cached loops."""
    for client in list(_tcp_clients_by_loop.values()):
        try:
            await client.aclose()
        except Exception:
            pass
    _tcp_clients_by_loop.clear()

    for client in list(_upstash_clients_by_loop.values()):
        try:
            await client.close()
        except Exception:
            pass
    _upstash_clients_by_loop.clear()


def _extract_rate_limit_identifier(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token:
            try:
                payload = jwt.decode(
                    token,
                    settings.JWT_SECRET_KEY,
                    algorithms=[settings.JWT_ALGORITHM],
                )
                sub = payload.get("sub")
                if sub:
                    return f"user:{sub}"
            except Exception:
                pass

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
        if ip:
            return f"ip:{ip}"

    client_host = request.client.host if request.client else "unknown"
    return f"ip:{client_host}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Any:
        if request.method == "OPTIONS" or request.url.path in _SKIP_PATHS:
            return await call_next(request)

        identifier = _extract_rate_limit_identifier(request)
        limit = settings.RATE_LIMIT_REQUESTS
        window = settings.RATE_LIMIT_WINDOW_SECONDS

        try:
            allowed, remaining, window_secs = await check_rate_limit(
                identifier=identifier,
                limit=limit,
                window_seconds=window,
            )
        except Exception as exc:
            logger.warning("Rate limiter skipped due to Redis error: %s", exc)
            return await call_next(request)

        if not allowed:
            trace_id = get_trace_id(request)
            return JSONResponse(
                status_code=429,
                content=build_error_payload(
                    error_code="RATE_LIMIT_EXCEEDED",
                    message="Rate limit exceeded. Please retry after the cooldown window.",
                    details={"limit": limit, "window_seconds": window_secs},
                    trace_id=trace_id,
                ),
                headers={
                    "Retry-After": str(window_secs),
                    "X-Trace-Id": trace_id,
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers.setdefault("X-RateLimit-Limit", str(limit))
        response.headers.setdefault("X-RateLimit-Remaining", str(remaining))
        return response
