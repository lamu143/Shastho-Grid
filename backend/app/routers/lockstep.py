"""LockStep reservations and RaceLab (A05: concurrency & transaction management)."""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Callable
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError, ValidationAppError, get_trace_id
from app.core.idempotency import IdempotencyGuard, save_idempotency_record
from app.core.security import CurrentUser, get_current_user, require_roles
from app.db.models import AuditLog, Facility, HospitalResource, Reservation
from app.db.seed_critical_care import RACELAB_FACILITY_CODE
from app.db.session import AsyncSessionLocal, get_db
from app.schemas.critical_care import BloodGroup
from app.services.lockstep import (
    BloodRequest,
    ReservationRequest,
    count_reservations,
    create_reservation,
    load_reservation,
    reservation_body,
    sweep_expired_holds,
    transition,
)

router = APIRouter(tags=["lockstep"])


def get_session_factory() -> Callable[[], AsyncSession]:
    """Session factory for work that needs several independent transactions (RaceLab)."""
    return AsyncSessionLocal


# --------------------------------------------------------------------- schemas


class BloodIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_facility_id: uuid.UUID
    blood_type: BloodGroup
    units: int = Field(ge=1, le=10)


class ReservationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hospital_id: uuid.UUID
    needs_icu: bool = True
    needs_vent: bool = False
    blood: BloodIn | None = None
    triage_request_id: uuid.UUID | None = None


class TransitionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_status: Literal["CONFIRMED", "EN_ROUTE", "ADMITTED", "CANCELLED"]


class RaceLabRunIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    concurrency: int = Field(default=25, ge=2, le=25)


# ---------------------------------------------------------------- reservations


def _error_body(exc: AppError, request: Request) -> dict:
    return {
        "error_code": exc.error_code,
        "message": exc.message,
        "details": exc.details,
        "trace_id": get_trace_id(request),
    }


@router.post("/reservations", status_code=201)
async def create_reservation_endpoint(
    payload: ReservationIn,
    request: Request,
    user: Annotated[CurrentUser, Depends(require_roles("dispatcher", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JSONResponse:
    if not request.headers.get("Idempotency-Key", "").strip():
        raise ValidationAppError(
            "An Idempotency-Key header is required so retries can never double-book.",
            error_code="IDEMPOTENCY_KEY_REQUIRED",
        )

    guard = IdempotencyGuard()
    replay = await guard.begin(db, request, user.clinic_id, user.id)
    if replay is not None:
        await db.rollback()
        return replay

    try:
        reservation = await create_reservation(
            db,
            user_id=user.id,
            clinic_id=user.clinic_id,
            role=user.role,
            trace_id=get_trace_id(request),
            req=ReservationRequest(
                hospital_id=payload.hospital_id,
                needs_icu=payload.needs_icu,
                needs_vent=payload.needs_vent,
                blood=BloodRequest(
                    source_facility_id=payload.blood.source_facility_id,
                    recipient_blood_type=payload.blood.blood_type,
                    units=payload.blood.units,
                )
                if payload.blood
                else None,
                triage_request_id=payload.triage_request_id,
            ),
        )
    except AppError as exc:
        await db.rollback()
        if exc.status_code == 409:
            # Remember the rejection so a retry with the same key gets the same answer,
            # and audit the lost race.
            body = _error_body(exc, request)
            try:
                await save_idempotency_record(
                    db, user.clinic_id, user.id, guard.method, guard.path,
                    guard.key or "", guard.request_hash or "", 409, body,
                )
                db.add(
                    AuditLog(
                        clinic_id=user.clinic_id,
                        actor_user_id=user.id,
                        actor_role=user.role,
                        action="RESERVATION_RACE_REJECTED",
                        resource_type="facility",
                        resource_id=str(payload.hospital_id),
                        trace_id=get_trace_id(request),
                        details={"error_code": exc.error_code},
                    )
                )
                await db.commit()
            except IntegrityError:
                await db.rollback()
        raise

    body = reservation_body(reservation)
    await guard.commit_response(db, 201, body)
    await db.commit()
    return JSONResponse(status_code=201, content=jsonable_encoder(body))


def _visible(user: CurrentUser, r: Reservation) -> bool:
    if user.role in ("admin", "auditor"):
        return True
    if user.role == "hospital_admin":
        return r.hospital_id == user.facility_id
    return r.created_by_user_id == user.id


@router.get("/reservations")
async def list_reservations(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Annotated[str | None, Query(pattern="^(HELD|CONFIRMED|EN_ROUTE|ADMITTED|EXPIRED|CANCELLED)$")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict:
    stmt = (
        select(Reservation)
        .options(selectinload(Reservation.blood_dispatches))
        .order_by(Reservation.created_at.desc())
        .limit(limit)
    )
    if status:
        stmt = stmt.where(Reservation.status == status)
    if user.role == "hospital_admin":
        stmt = stmt.where(Reservation.hospital_id == user.facility_id)
    elif user.role not in ("admin", "auditor"):
        stmt = stmt.where(Reservation.created_by_user_id == user.id)
    rows = (await db.execute(stmt)).scalars().all()
    return {"items": [reservation_body(r) for r in rows], "total": len(rows)}


@router.get("/reservations/{reservation_id}")
async def get_reservation(
    reservation_id: uuid.UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    r = await load_reservation(db, reservation_id)
    if not _visible(user, r):
        raise AppError(404, "RESERVATION_NOT_FOUND", "Reservation not found.")
    return reservation_body(r)


@router.post("/reservations/{reservation_id}/transition")
async def transition_reservation(
    reservation_id: uuid.UUID,
    payload: TransitionIn,
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    r = await load_reservation(db, reservation_id, lock=True)
    target = payload.target_status
    is_hospital = user.role == "hospital_admin" and user.facility_id == r.hospital_id
    allowed = {
        "CONFIRMED": user.role == "admin" or is_hospital,
        "ADMITTED": user.role == "admin" or is_hospital,
        "EN_ROUTE": user.role == "admin" or (user.role == "dispatcher" and r.created_by_user_id == user.id),
        "CANCELLED": user.role == "admin"
        or is_hospital
        or (user.role == "dispatcher" and r.created_by_user_id == user.id),
    }[target]
    if not allowed:
        raise AppError(
            403,
            "TRANSITION_FORBIDDEN",
            f"Your role cannot move this reservation to {target}.",
            details={"role": user.role, "target_status": target},
        )
    await transition(
        db, r, target, user_id=user.id, clinic_id=user.clinic_id, role=user.role, trace_id=get_trace_id(request)
    )
    await db.commit()
    return reservation_body(await load_reservation(db, reservation_id))


@router.post("/reservations/sweep-expired")
async def sweep_expired(
    _: Annotated[CurrentUser, Depends(require_roles("admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    return {"expired": await sweep_expired_holds(db)}


# --------------------------------------------------------------------- RaceLab


async def _racelab_resource(db: AsyncSession) -> tuple[Facility, HospitalResource]:
    facility = (
        await db.execute(select(Facility).where(Facility.code == RACELAB_FACILITY_CODE))
    ).scalar_one_or_none()
    if facility is None:
        raise AppError(404, "RACELAB_NOT_SEEDED", "Run the seed script to create the RaceLab sandbox.")
    resource = (
        await db.execute(
            select(HospitalResource)
            .where(HospitalResource.facility_id == facility.id, HospitalResource.resource_type == "ICU_BED")
            .with_for_update()
        )
    ).scalar_one()
    return facility, resource


async def _reset(db: AsyncSession) -> tuple[Facility, HospitalResource]:
    facility, resource = await _racelab_resource(db)
    held = (
        await db.execute(
            select(Reservation).where(
                Reservation.hospital_id == facility.id,
                Reservation.status.in_(("HELD", "CONFIRMED", "EN_ROUTE")),
            )
        )
    ).scalars().all()
    for r in held:
        r.status = "CANCELLED"
        r.version += 1
    resource.total_physical_count = max(resource.total_physical_count, 1)
    resource.staffed_capacity_count = max(resource.staffed_capacity_count, 1)
    resource.available_count = 1
    resource.version += 1
    await db.commit()
    return facility, resource


@router.post("/racelab/reset")
async def racelab_reset(
    _: Annotated[CurrentUser, Depends(require_roles("dispatcher", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    facility, resource = await _reset(db)
    return {
        "facility_id": str(facility.id),
        "resource_id": str(resource.id),
        "available_count": resource.available_count,
    }


@router.post("/racelab/run")
async def racelab_run(
    payload: RaceLabRunIn,
    request: Request,
    user: Annotated[CurrentUser, Depends(require_roles("dispatcher", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
    session_factory: Annotated[Callable[[], AsyncSession], Depends(get_session_factory)],
) -> dict:
    """Reset the sandbox bed to 1, then race N independent transactions for it."""
    facility, resource = await _reset(db)
    trace = get_trace_id(request)
    barrier = asyncio.Event()

    async def attempt(n: int) -> dict:
        await barrier.wait()
        started = time.perf_counter()
        async with session_factory() as session:
            try:
                r = await create_reservation(
                    session,
                    user_id=user.id,
                    clinic_id=user.clinic_id,
                    role=user.role,
                    trace_id=f"{trace}-racelab-{n}",
                    req=ReservationRequest(hospital_id=facility.id),
                )
                await session.commit()
                code, detail = 201, str(r.id)
            except AppError as exc:
                await session.rollback()
                code, detail = exc.status_code, exc.error_code
        return {"attempt": n, "status": code, "detail": detail, "ms": round((time.perf_counter() - started) * 1000, 1)}

    tasks = [asyncio.create_task(attempt(i + 1)) for i in range(payload.concurrency)]
    await asyncio.sleep(0)
    barrier.set()  # release every attempt at the same moment
    results = sorted(await asyncio.gather(*tasks), key=lambda x: x["attempt"])

    await db.refresh(resource)
    held = await count_reservations(db, resource.id, "HELD")
    winners = sum(1 for r in results if r["status"] == 201)
    return {
        "concurrency": payload.concurrency,
        "winners": winners,
        "rejected": sum(1 for r in results if r["status"] == 409),
        "errors": sum(1 for r in results if r["status"] not in (201, 409)),
        "db_available_after": resource.available_count,
        "double_bookings": max(0, held - 1),
        "attempts": results,
    }
