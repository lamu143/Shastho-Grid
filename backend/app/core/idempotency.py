from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import BigInteger, and_, bindparam, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, ValidationAppError
from app.db.models import IdempotencyKey


def compute_request_hash(raw_body: bytes) -> str:
    """Compute a deterministic SHA-256 hash of canonical JSON or raw request bytes."""
    if not raw_body:
        return hashlib.sha256(b"").hexdigest()
    try:
        parsed = json.loads(raw_body.decode("utf-8"))
        canonical = json.dumps(parsed, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    except (UnicodeDecodeError, json.JSONDecodeError):
        return hashlib.sha256(raw_body).hexdigest()


def _scope_filter(
    clinic_id: UUID | None,
    user_id: UUID | None,
    method: str,
    path: str,
    key: str,
) -> Any:
    clinic_cond = IdempotencyKey.clinic_id.is_(None) if clinic_id is None else IdempotencyKey.clinic_id == clinic_id
    user_cond = IdempotencyKey.user_id.is_(None) if user_id is None else IdempotencyKey.user_id == user_id
    return and_(
        clinic_cond,
        user_cond,
        IdempotencyKey.method == method,
        IdempotencyKey.path == path,
        IdempotencyKey.idempotency_key == key,
    )


def _advisory_lock_key(
    clinic_id: UUID | None,
    user_id: UUID | None,
    method: str,
    path: str,
    key: str,
) -> int:
    scope_payload = json.dumps(
        [
            str(clinic_id) if clinic_id is not None else None,
            str(user_id) if user_id is not None else None,
            method,
            path,
            key,
        ],
        separators=(",", ":"),
        ensure_ascii=False,
    )
    digest = hashlib.sha256(scope_payload.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=True)


_ADVISORY_LOCK_STMT = text("SELECT pg_advisory_xact_lock(:lock_key)").bindparams(
    bindparam("lock_key", type_=BigInteger)
)


async def check_or_replay_idempotency(
    db: AsyncSession,
    clinic_id: UUID | None,
    user_id: UUID | None,
    method: str,
    path: str,
    idempotency_key: str | None,
    raw_body: bytes,
) -> tuple[JSONResponse | None, str | None]:
    """Check idempotency_keys for replay or 409 payload mismatch."""
    if not idempotency_key or not idempotency_key.strip():
        return None, None

    key = idempotency_key.strip()
    if len(key) > 128:
        raise ValidationAppError(
            message="Idempotency-Key header must not exceed 128 characters.",
            details={"header": "Idempotency-Key"},
        )

    req_hash = compute_request_hash(raw_body)
    lock_key = _advisory_lock_key(clinic_id, user_id, method, path, key)
    await db.execute(_ADVISORY_LOCK_STMT, {"lock_key": lock_key})

    stmt = select(IdempotencyKey).where(_scope_filter(clinic_id, user_id, method, path, key))
    existing = (await db.execute(stmt)).scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if existing is not None:
        if existing.expires_at <= now:
            await db.delete(existing)
            await db.flush()
        elif existing.request_hash != req_hash:
            raise AppError(
                status_code=409,
                error_code="IDEMPOTENCY_KEY_CONFLICT",
                message="Idempotency-Key was already used with a different request payload.",
                details={
                    "idempotency_key": key,
                    "method": method,
                    "path": path,
                },
            )
        else:
            return (
                JSONResponse(
                    status_code=existing.response_status,
                    content=existing.response_body,
                    headers={"X-Idempotent-Replay": "true"},
                ),
                req_hash,
            )

    return None, req_hash


async def save_idempotency_record(
    db: AsyncSession,
    clinic_id: UUID | None,
    user_id: UUID | None,
    method: str,
    path: str,
    idempotency_key: str,
    request_hash: str,
    response_status: int,
    response_body: Any,
) -> None:
    """Persist an idempotency record inside the active DB transaction."""
    now = datetime.now(timezone.utc)
    record = IdempotencyKey(
        clinic_id=clinic_id,
        user_id=user_id,
        idempotency_key=idempotency_key.strip(),
        method=method,
        path=path,
        request_hash=request_hash,
        response_status=response_status,
        response_body=jsonable_encoder(response_body),
        created_at=now,
        expires_at=now + timedelta(hours=settings.IDEMPOTENCY_TTL_HOURS),
    )
    db.add(record)
    await db.flush()


class IdempotencyGuard:
    """Transaction-scoped Idempotency-Key guard for M1 and M3 mutating endpoints."""

    def __init__(self) -> None:
        self.active: bool = False
        self.key: str | None = None
        self.request_hash: str | None = None
        self.clinic_id: UUID | None = None
        self.user_id: UUID | None = None
        self.method: str = ""
        self.path: str = ""

    async def begin(
        self,
        db: AsyncSession,
        request: Request,
        clinic_id: UUID | None,
        user_id: UUID | None,
        raw_body: bytes | None = None,
    ) -> JSONResponse | None:
        header_key = request.headers.get("Idempotency-Key")
        if not header_key or not header_key.strip():
            self.active = False
            return None

        body_bytes = raw_body if raw_body is not None else await request.body()
        replay, req_hash = await check_or_replay_idempotency(
            db=db,
            clinic_id=clinic_id,
            user_id=user_id,
            method=request.method,
            path=request.url.path,
            idempotency_key=header_key,
            raw_body=body_bytes,
        )
        if replay is not None:
            self.active = False
            return replay

        self.active = True
        self.key = header_key.strip()
        self.request_hash = req_hash
        self.clinic_id = clinic_id
        self.user_id = user_id
        self.method = request.method
        self.path = request.url.path
        return None

    async def commit_response(self, db: AsyncSession, status_code: int, body: Any) -> None:
        if not self.active or not self.key or not self.request_hash:
            return
        await save_idempotency_record(
            db=db,
            clinic_id=self.clinic_id,
            user_id=self.user_id,
            method=self.method,
            path=self.path,
            idempotency_key=self.key,
            request_hash=self.request_hash,
            response_status=status_code,
            response_body=body,
        )
        self.active = False
