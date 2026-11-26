from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, get_trace_id
from app.core.idempotency import IdempotencyGuard
from app.core.security import (
    CurrentUser,
    enforce_clinic_scope,
    hash_secret,
    require_roles,
)
from app.db.models import AntibioticCatalog, AuditLog, AwareGuideline, Clinic, User
from app.db.session import get_db
from app.schemas.admin import (
    AntibioticCatalogOut,
    AuditLogOut,
    ClinicOut,
    GuidelineOut,
    UserCreateRequest,
    UserOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/clinics", response_model=list[ClinicOut])
async def list_clinics(
    clinic_id: UUID | None = Query(default=None),
    current_user: CurrentUser = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> list[ClinicOut]:
    scoped_clinic_id = enforce_clinic_scope(current_user, clinic_id)
    stmt = (
        select(Clinic)
        .where(Clinic.id == scoped_clinic_id)
        .order_by(Clinic.code.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [ClinicOut.model_validate(row) for row in rows]


@router.get("/users", response_model=list[UserOut])
async def list_users(
    clinic_id: UUID | None = Query(default=None),
    current_user: CurrentUser = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> list[UserOut]:
    scoped_clinic_id = enforce_clinic_scope(current_user, clinic_id)
    stmt = (
        select(User)
        .where(User.clinic_id == scoped_clinic_id)
        .order_by(User.created_at.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [UserOut.model_validate(row) for row in rows]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    payload: UserCreateRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> UserOut | JSONResponse:
    target_clinic_id = enforce_clinic_scope(current_user, payload.clinic_id)

    guard = IdempotencyGuard()
    replay = await guard.begin(
        db=db,
        request=request,
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
    )
    if replay is not None:
        return replay

    normalized_email = payload.email.strip().lower()
    existing = (
        await db.execute(select(User.id).where(User.email == normalized_email))
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError(
            status_code=409,
            error_code="EMAIL_ALREADY_EXISTS",
            message="A user with this email address already exists.",
            details={"email": normalized_email},
        )

    user = User(
        clinic_id=target_clinic_id,
        email=normalized_email,
        full_name=payload.full_name.strip(),
        role=payload.role,
        password_hash=hash_secret(payload.password),
        pin_hash=hash_secret(payload.pin) if payload.pin else None,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    trace_id = get_trace_id(request)
    db.add(
        AuditLog(
            clinic_id=target_clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="ADMIN_CREATE_USER",
            resource_type="user",
            resource_id=str(user.id),
            trace_id=trace_id,
            details={"email": user.email, "role": user.role},
        )
    )

    out = UserOut.model_validate(user)
    await guard.commit_response(db=db, status_code=201, body=jsonable_encoder(out))
    await db.commit()
    return out


@router.get("/audit-logs", response_model=list[AuditLogOut])
async def list_audit_logs(
    clinic_id: UUID | None = Query(default=None),
    action: str | None = Query(default=None),
    trace_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(require_roles("admin", "auditor")),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLogOut]:
    scoped_clinic_id = enforce_clinic_scope(current_user, clinic_id)
    stmt = (
        select(AuditLog)
        .where(AuditLog.clinic_id == scoped_clinic_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if trace_id:
        stmt = stmt.where(AuditLog.trace_id == trace_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [AuditLogOut.model_validate(row) for row in rows]


@router.get("/guidelines", response_model=list[GuidelineOut])
async def list_guidelines(
    current_user: CurrentUser = Depends(require_roles("dispenser", "pharmacist", "auditor", "admin")),
    db: AsyncSession = Depends(get_db),
) -> list[GuidelineOut]:
    stmt = select(AwareGuideline).order_by(AwareGuideline.syndrome_code.asc())
    rows = (await db.execute(stmt)).scalars().all()
    return [GuidelineOut.model_validate(row) for row in rows]


@router.get("/catalog", response_model=list[AntibioticCatalogOut])
async def list_catalog(
    current_user: CurrentUser = Depends(require_roles("dispenser", "pharmacist", "auditor", "admin")),
    db: AsyncSession = Depends(get_db),
) -> list[AntibioticCatalogOut]:
    stmt = select(AntibioticCatalog).order_by(
        AntibioticCatalog.aware_tier_cost.asc(),
        AntibioticCatalog.drug_code.asc(),
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [AntibioticCatalogOut.model_validate(row) for row in rows]
