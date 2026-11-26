from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    ConflictError,
    NotFoundError,
    ValidationAppError,
    get_trace_id,
)
from app.core.idempotency import IdempotencyGuard
from app.core.security import CurrentUser, enforce_clinic_scope, require_roles
from app.db.models import AuditLog, Patient
from app.db.session import get_db
from app.schemas.patients import PatientCreate, PatientOut, PatientPatch

router = APIRouter(prefix="/patients", tags=["patients"])

ReadRoles = Annotated[
    CurrentUser,
    Depends(require_roles("dispenser", "pharmacist", "auditor", "admin")),
]
WriteRoles = Annotated[
    CurrentUser,
    Depends(require_roles("dispenser", "pharmacist", "admin")),
]
DbSession = Annotated[AsyncSession, Depends(get_db)]


def utcnow() -> datetime:
    return datetime.now(UTC)


@router.get("", response_model=list[PatientOut])
async def list_patients(
    current_user: ReadRoles,
    db: DbSession,
    q: str | None = Query(default=None),
) -> list[PatientOut]:
    stmt = (
        select(Patient)
        .where(Patient.clinic_id == current_user.clinic_id)
        .order_by(Patient.created_at.desc(), Patient.mrn.asc())
    )
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(Patient.mrn.ilike(pattern), Patient.full_name.ilike(pattern))
        )
    rows = (await db.execute(stmt)).scalars().all()
    return [PatientOut.model_validate(row) for row in rows]


@router.post("", response_model=PatientOut, status_code=201)
async def create_patient(
    payload: PatientCreate,
    request: Request,
    current_user: WriteRoles,
    db: DbSession,
) -> PatientOut | JSONResponse:
    guard = IdempotencyGuard()
    replay = await guard.begin(
        db=db,
        request=request,
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
    )
    if replay is not None:
        return replay

    if payload.id is not None:
        existing_id = (
            await db.execute(select(Patient).where(Patient.id == payload.id))
        ).scalar_one_or_none()
        if existing_id is not None:
            enforce_clinic_scope(current_user, existing_id.clinic_id)
            raise ConflictError(
                message="A patient with this ID already exists.",
                error_code="PATIENT_ALREADY_EXISTS",
                details={"patient_id": str(payload.id)},
            )

    existing_mrn = (
        await db.execute(
            select(Patient.id).where(
                Patient.clinic_id == current_user.clinic_id,
                Patient.mrn == payload.mrn,
            )
        )
    ).scalar_one_or_none()
    if existing_mrn is not None:
        raise ConflictError(
            message="A patient with this MRN already exists in the clinic.",
            error_code="PATIENT_MRN_EXISTS",
            details={"mrn": payload.mrn},
        )

    patient_kwargs: dict[str, Any] = {
        "clinic_id": current_user.clinic_id,
        "mrn": payload.mrn,
        "full_name": payload.full_name,
        "age_years": payload.age_years,
        "weight_kg": Decimal(str(payload.weight_kg)),
        "sex": payload.sex,
        "is_pregnant": payload.is_pregnant,
        "egfr": Decimal(str(payload.egfr)) if payload.egfr is not None else None,
        "allergies": list(payload.allergies),
        "version": 1,
    }
    if payload.id is not None:
        patient_kwargs["id"] = payload.id

    patient = Patient(**patient_kwargs)
    db.add(patient)
    await db.flush()

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="PATIENT_CREATE",
            resource_type="patient",
            resource_id=str(patient.id),
            trace_id=get_trace_id(request),
            details={"mrn": patient.mrn, "version": patient.version},
        )
    )

    out = PatientOut.model_validate(patient)
    await guard.commit_response(db=db, status_code=201, body=jsonable_encoder(out))
    await db.commit()
    return out


@router.get("/{patient_id}", response_model=PatientOut)
async def get_patient(
    patient_id: UUID,
    current_user: ReadRoles,
    db: DbSession,
) -> PatientOut:
    patient = (
        await db.execute(select(Patient).where(Patient.id == patient_id))
    ).scalar_one_or_none()
    if patient is None:
        raise NotFoundError(
            message="Patient not found.",
            error_code="PATIENT_NOT_FOUND",
            details={"patient_id": str(patient_id)},
        )
    enforce_clinic_scope(current_user, patient.clinic_id)
    return PatientOut.model_validate(patient)


@router.patch("/{patient_id}", response_model=PatientOut)
async def patch_patient(
    patient_id: UUID,
    payload: PatientPatch,
    request: Request,
    current_user: WriteRoles,
    db: DbSession,
) -> PatientOut:
    patient = (
        await db.execute(select(Patient).where(Patient.id == patient_id))
    ).scalar_one_or_none()
    if patient is None:
        raise NotFoundError(
            message="Patient not found.",
            error_code="PATIENT_NOT_FOUND",
            details={"patient_id": str(patient_id)},
        )
    enforce_clinic_scope(current_user, patient.clinic_id)

    if payload.base_version is not None and payload.base_version != patient.version:
        raise ConflictError(
            message="Patient version mismatch.",
            error_code="PATIENT_VERSION_CONFLICT",
            details={
                "patient_id": str(patient.id),
                "expected_version": patient.version,
                "base_version": payload.base_version,
            },
        )

    new_sex = payload.sex if payload.sex is not None else patient.sex
    new_pregnant = (
        payload.is_pregnant if payload.is_pregnant is not None else patient.is_pregnant
    )
    if new_pregnant and new_sex != "F":
        raise ValidationAppError(
            message="is_pregnant cannot be true when sex is not 'F'.",
            error_code="VALIDATION_ERROR",
            details={"sex": new_sex, "is_pregnant": new_pregnant},
        )

    if payload.mrn is not None and payload.mrn != patient.mrn:
        dup_mrn = (
            await db.execute(
                select(Patient.id).where(
                    Patient.clinic_id == current_user.clinic_id,
                    Patient.mrn == payload.mrn,
                    Patient.id != patient.id,
                )
            )
        ).scalar_one_or_none()
        if dup_mrn is not None:
            raise ConflictError(
                message="A patient with this MRN already exists in the clinic.",
                error_code="PATIENT_MRN_EXISTS",
                details={"mrn": payload.mrn},
            )
        patient.mrn = payload.mrn

    if payload.full_name is not None:
        patient.full_name = payload.full_name
    if payload.age_years is not None:
        patient.age_years = payload.age_years
    if payload.weight_kg is not None:
        patient.weight_kg = Decimal(str(payload.weight_kg))
    if payload.sex is not None:
        patient.sex = payload.sex
    if payload.is_pregnant is not None:
        patient.is_pregnant = payload.is_pregnant
    if "egfr" in payload.model_fields_set:
        patient.egfr = Decimal(str(payload.egfr)) if payload.egfr is not None else None
    if payload.allergies is not None:
        patient.allergies = list(payload.allergies)

    patient.version += 1
    patient.updated_at = utcnow()

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="PATIENT_UPDATE",
            resource_type="patient",
            resource_id=str(patient.id),
            trace_id=get_trace_id(request),
            details={"version": patient.version},
        )
    )
    await db.commit()
    await db.refresh(patient)
    return PatientOut.model_validate(patient)
