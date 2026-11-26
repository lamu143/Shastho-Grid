from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.db.models import Clinic, User
from app.db.session import get_db

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_secret(plain: str) -> str:
    """Hash a password or offline PIN using Argon2id."""
    return pwd_context.hash(plain)


def verify_secret(plain: str, hashed: str | None) -> bool:
    """Verify a plaintext password or PIN against an Argon2id hash."""
    if not hashed:
        return False
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


class TokenPayload(BaseModel):
    sub: UUID
    email: str
    role: str
    clinic_id: UUID
    clinic_name: str
    iat: int
    exp: int


@dataclass(frozen=True, slots=True)
class CurrentUser:
    id: UUID
    email: str
    full_name: str
    role: str
    clinic_id: UUID
    clinic_name: str
    is_active: bool
    facility_id: UUID | None = None


def create_access_token(
    user_id: UUID,
    email: str,
    role: str,
    clinic_id: UUID,
    clinic_name: str,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "clinic_id": str(clinic_id),
        "clinic_name": clinic_name,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> TokenPayload:
    try:
        raw_payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return TokenPayload.model_validate(raw_payload)
    except (JWTError, ValueError) as exc:
        raise AppError(
            status_code=401,
            error_code="INVALID_OR_EXPIRED_TOKEN",
            message="Authentication token is invalid or expired.",
        ) from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    if credentials is None or not credentials.credentials:
        raise AppError(
            status_code=401,
            error_code="AUTHENTICATION_REQUIRED",
            message="Bearer authentication token is required.",
        )

    token_data = decode_access_token(credentials.credentials)

    stmt = (
        select(User, Clinic.name)
        .join(Clinic, User.clinic_id == Clinic.id)
        .where(User.id == token_data.sub)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise AppError(
            status_code=401,
            error_code="INVALID_OR_EXPIRED_TOKEN",
            message="Authenticated user account no longer exists.",
        )

    user, clinic_name = row
    if not user.is_active:
        raise AppError(
            status_code=401,
            error_code="ACCOUNT_INACTIVE",
            message="User account is deactivated.",
        )

    return CurrentUser(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        facility_id=user.facility_id,
        clinic_id=user.clinic_id,
        clinic_name=clinic_name,
        is_active=user.is_active,
    )


def require_roles(*allowed_roles: str) -> Callable[..., CurrentUser]:
    allowed = frozenset(allowed_roles)

    async def _role_dependency(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.role not in allowed:
            raise AppError(
                status_code=403,
                error_code="FORBIDDEN_ROLE",
                message=f"Role '{current_user.role}' is not authorized for this resource.",
                details={"required_roles": sorted(allowed), "actual_role": current_user.role},
            )
        return current_user

    return _role_dependency


def enforce_clinic_scope(current_user: CurrentUser, target_clinic_id: UUID | None) -> UUID:
    if target_clinic_id is not None and target_clinic_id != current_user.clinic_id:
        raise AppError(
            status_code=403,
            error_code="CROSS_TENANT_FORBIDDEN",
            message="Cross-clinic access is forbidden.",
            details={
                "user_clinic_id": str(current_user.clinic_id),
                "requested_clinic_id": str(target_clinic_id),
            },
        )
    return current_user.clinic_id


# Roles that manage a single facility's critical-care stock.
FACILITY_SCOPED_ROLES = frozenset({"hospital_admin", "blood_bank_officer"})


def enforce_facility_scope(current_user: CurrentUser, target_facility_id: UUID) -> None:
    """Block facility officers from mutating another facility (OWASP API1 / BOLA).

    System admins may edit any facility; facility-scoped roles only their own.
    """
    if current_user.role == "admin":
        return
    if current_user.role in FACILITY_SCOPED_ROLES and current_user.facility_id == target_facility_id:
        return
    raise AppError(
        status_code=403,
        error_code="FACILITY_SCOPE_VIOLATION",
        message="You may only modify resources of your assigned facility.",
        details={
            "user_facility_id": str(current_user.facility_id) if current_user.facility_id else None,
            "requested_facility_id": str(target_facility_id),
        },
    )
