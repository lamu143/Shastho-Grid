from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, get_trace_id
from app.core.security import (
    CurrentUser,
    create_access_token,
    get_current_user,
    verify_secret,
)
from app.db.models import AuditLog, Clinic, User
from app.db.session import get_db
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    UserPublic,
    VerifyPinRequest,
    VerifyPinResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    email = payload.email.strip().lower()
    trace_id = get_trace_id(request)

    stmt = (
        select(User, Clinic.name)
        .join(Clinic, User.clinic_id == Clinic.id)
        .where(User.email == email)
    )
    row = (await db.execute(stmt)).first()

    if row is None or not row[0].is_active or not verify_secret(payload.password, row[0].password_hash):
        db.add(
            AuditLog(
                clinic_id=row[0].clinic_id if row else None,
                actor_user_id=row[0].id if row else None,
                actor_role=row[0].role if row else None,
                action="AUTH_LOGIN_FAILED",
                resource_type="user",
                resource_id=str(row[0].id) if row else None,
                trace_id=trace_id,
                details={"email": email},
            )
        )
        await db.commit()
        raise AppError(
            status_code=401,
            error_code="INVALID_CREDENTIALS",
            message="Invalid email or password.",
        )

    user, clinic_name = row
    token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
        clinic_id=user.clinic_id,
        clinic_name=clinic_name,
    )

    db.add(
        AuditLog(
            clinic_id=user.clinic_id,
            actor_user_id=user.id,
            actor_role=user.role,
            action="AUTH_LOGIN",
            resource_type="user",
            resource_id=str(user.id),
            trace_id=trace_id,
            details={"email": user.email, "role": user.role},
        )
    )
    await db.commit()

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=UserPublic(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            clinic_id=user.clinic_id,
            clinic_name=clinic_name,
            facility_id=user.facility_id,
        ),
    )


@router.post("/verify-pin", response_model=VerifyPinResponse)
async def verify_pin(
    payload: VerifyPinRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> VerifyPinResponse:
    email = payload.email.strip().lower()
    trace_id = get_trace_id(request)

    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None or not user.is_active or not verify_secret(payload.pin, user.pin_hash):
        db.add(
            AuditLog(
                clinic_id=user.clinic_id if user else None,
                actor_user_id=user.id if user else None,
                actor_role=user.role if user else None,
                action="AUTH_VERIFY_PIN_FAILED",
                resource_type="user",
                resource_id=str(user.id) if user else None,
                trace_id=trace_id,
                details={"email": email},
            )
        )
        await db.commit()
        raise AppError(
            status_code=401,
            error_code="INVALID_PIN",
            message="Invalid offline unlock PIN.",
        )

    db.add(
        AuditLog(
            clinic_id=user.clinic_id,
            actor_user_id=user.id,
            actor_role=user.role,
            action="AUTH_VERIFY_PIN",
            resource_type="user",
            resource_id=str(user.id),
            trace_id=trace_id,
            details={"email": user.email},
        )
    )
    await db.commit()

    return VerifyPinResponse(verified=True)


@router.get("/me", response_model=UserPublic)
async def get_me(current_user: CurrentUser = Depends(get_current_user)) -> UserPublic:
    return UserPublic(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        clinic_id=current_user.clinic_id,
        clinic_name=current_user.clinic_name,
        facility_id=current_user.facility_id,
    )
