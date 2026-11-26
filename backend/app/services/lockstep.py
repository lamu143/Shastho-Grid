"""LockStep (A05): race-proof reservation of ICU beds, ventilators and blood.

Guarantees
- Atomicity: bed, ventilator and blood are held in ONE transaction, or nothing is.
- No double booking: rows are locked with SELECT ... FOR UPDATE and re-checked
  under the lock; CHECK (available_count >= 0) / (units_available >= 0) in the
  database is the last line of defence.
- No deadlocks: every transaction locks in one global order:
  hospital_resources (sorted by id) -> blood_inventories (sorted by id),
  so no two transactions can wait on each other in a cycle.
- Holds expire: HELD reservations past hold_expires_at are released by a sweeper
  that uses FOR UPDATE SKIP LOCKED, so it never blocks or fights a live request.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, NotFoundError, ValidationAppError
from app.db.models import (
    AuditLog,
    BloodDispatch,
    BloodInventory,
    Facility,
    HospitalResource,
    Reservation,
)
from app.db.seed_critical_care import RACELAB_FACILITY_CODE
from app.services.blood_compat import RBC_DONORS, allocation_plan
from app.services.routing import estimate_route

Target = Literal["CONFIRMED", "EN_ROUTE", "ADMITTED", "CANCELLED"]

# Allowed lifecycle moves. EXPIRED is set only by the sweeper.
TRANSITIONS: dict[str, frozenset[str]] = {
    "HELD": frozenset({"CONFIRMED", "CANCELLED"}),
    "CONFIRMED": frozenset({"EN_ROUTE", "CANCELLED"}),
    "EN_ROUTE": frozenset({"ADMITTED", "CANCELLED"}),
    "ADMITTED": frozenset(),
    "EXPIRED": frozenset(),
    "CANCELLED": frozenset(),
}
RELEASING_STATES = frozenset({"CANCELLED", "EXPIRED"})


@dataclass(frozen=True)
class BloodRequest:
    source_facility_id: uuid.UUID
    recipient_blood_type: str
    units: int


@dataclass(frozen=True)
class ReservationRequest:
    hospital_id: uuid.UUID
    needs_icu: bool = True
    needs_vent: bool = False
    blood: BloodRequest | None = None
    triage_request_id: uuid.UUID | None = None


def reservation_body(r: Reservation) -> dict[str, Any]:
    return {
        "reservation_id": str(r.id),
        "status": r.status,
        "hospital_id": str(r.hospital_id),
        "icu_resource_id": str(r.icu_resource_id) if r.icu_resource_id else None,
        "vent_resource_id": str(r.vent_resource_id) if r.vent_resource_id else None,
        "is_split_dispatch": r.is_split_dispatch,
        "hold_expires_at": r.hold_expires_at.isoformat(),
        "triage_request_id": str(r.triage_request_id) if r.triage_request_id else None,
        "version": r.version,
        "blood": [
            {
                "dispatch_id": str(b.id),
                "source_facility_id": str(b.source_facility_id),
                "donor_blood_type": b.donor_blood_type,
                "recipient_blood_type": b.recipient_blood_type,
                "units": b.units,
                "courier_eta_minutes": float(b.courier_eta_minutes) if b.courier_eta_minutes is not None else None,
                "status": b.status,
            }
            for b in r.blood_dispatches
        ],
    }


async def _hospital(db: AsyncSession, hospital_id: uuid.UUID) -> Facility:
    hospital = await db.get(Facility, hospital_id)
    if hospital is None or (not hospital.is_active and hospital.code != RACELAB_FACILITY_CODE):
        raise NotFoundError("Hospital not found.", error_code="FACILITY_NOT_FOUND")
    if hospital.tier == "BLOOD_HUB":
        raise ValidationAppError("A blood hub cannot admit patients.", error_code="NOT_A_HOSPITAL")
    return hospital


async def create_reservation(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    clinic_id: uuid.UUID,
    role: str,
    trace_id: str,
    req: ReservationRequest,
) -> Reservation:
    """Hold bed (+ventilator) (+blood) atomically. Caller commits; raises 409 on exhaustion."""
    if not req.needs_icu and not req.needs_vent:
        raise ValidationAppError("Request at least an ICU bed or a ventilator.", error_code="NOTHING_TO_RESERVE")
    hospital = await _hospital(db, req.hospital_id)

    wanted = [t for t, need in (("ICU_BED", req.needs_icu), ("VENTILATOR", req.needs_vent)) if need]

    # ---- Lock phase 1: hospital_resources, sorted by id -------------------------
    resources = (
        await db.execute(
            select(HospitalResource)
            .where(
                HospitalResource.facility_id == hospital.id,
                HospitalResource.resource_type.in_(wanted),
            )
            .order_by(HospitalResource.id)
            .with_for_update()
        )
    ).scalars().all()
    by_type = {r.resource_type: r for r in resources}
    for rtype in wanted:
        if rtype not in by_type:
            raise NotFoundError(f"{hospital.name} has no {rtype}.", error_code="RESOURCE_NOT_FOUND")
        if by_type[rtype].available_count < 1:
            raise AppError(
                status_code=409,
                error_code="RESOURCE_EXHAUSTED",
                message=f"No {rtype.replace('_', ' ').lower()} left at {hospital.name}. Re-run CareMatch.",
                details={"resource_type": rtype, "facility_id": str(hospital.id)},
            )

    # ---- Lock phase 2: blood_inventories, sorted by id --------------------------
    plan: list[tuple[str, int]] = []
    blood_rows: dict[str, BloodInventory] = {}
    courier_eta: float | None = None
    source: Facility | None = None
    if req.blood and req.blood.units > 0:
        source = await db.get(Facility, req.blood.source_facility_id)
        if source is None:
            raise NotFoundError("Blood source not found.", error_code="FACILITY_NOT_FOUND")
        rows = (
            await db.execute(
                select(BloodInventory)
                .where(
                    BloodInventory.facility_id == source.id,
                    BloodInventory.blood_type.in_(RBC_DONORS[req.blood.recipient_blood_type]),
                )
                .order_by(BloodInventory.id)
                .with_for_update()
            )
        ).scalars().all()
        blood_rows = {b.blood_type: b for b in rows}
        stock = {g: b.units_available for g, b in blood_rows.items()}
        chosen = allocation_plan(stock, req.blood.recipient_blood_type, req.blood.units)
        if chosen is None:
            raise AppError(
                status_code=409,
                error_code="BLOOD_EXHAUSTED",
                message=f"Not enough {req.blood.recipient_blood_type}-compatible blood at {source.name}.",
                details={"source_facility_id": str(source.id), "units_needed": req.blood.units},
            )
        plan = chosen
        if source.id != hospital.id:
            courier_eta = estimate_route(
                float(source.lat), float(source.lon), float(hospital.lat), float(hospital.lon),
                settings.COURIER_SPEED_KMH,
            ).eta_minutes

    # ---- Mutate under the locks -------------------------------------------------
    for r in resources:
        r.available_count -= 1
        r.version += 1
    for donor, units in plan:
        row = blood_rows[donor]
        row.units_available -= units
        row.units_reserved += units
        row.version += 1

    now = datetime.now(timezone.utc)
    reservation = Reservation(
        id=uuid.uuid4(),
        triage_request_id=req.triage_request_id,
        hospital_id=hospital.id,
        icu_resource_id=by_type["ICU_BED"].id if "ICU_BED" in by_type else None,
        vent_resource_id=by_type["VENTILATOR"].id if "VENTILATOR" in by_type else None,
        created_by_user_id=user_id,
        status="HELD",
        is_split_dispatch=bool(source and source.id != hospital.id),
        hold_expires_at=now + timedelta(seconds=settings.HOLD_TTL_SECONDS),
        blood_dispatches=[
            BloodDispatch(
                id=uuid.uuid4(),
                source_facility_id=source.id,
                blood_inventory_id=blood_rows[donor].id,
                recipient_blood_type=req.blood.recipient_blood_type,
                donor_blood_type=donor,
                units=units,
                courier_eta_minutes=courier_eta,
            )
            for donor, units in plan
        ]
        if source and req.blood
        else [],
    )
    db.add(reservation)
    db.add(
        AuditLog(
            clinic_id=clinic_id,
            actor_user_id=user_id,
            actor_role=role,
            action="RESERVATION_HELD",
            resource_type="reservation",
            resource_id=str(reservation.id),
            trace_id=trace_id,
            details={
                "hospital": hospital.code,
                "resources": wanted,
                "blood_plan": plan,
                "is_split_dispatch": reservation.is_split_dispatch,
            },
        )
    )
    await db.flush()
    return reservation


async def _release(db: AsyncSession, reservation: Reservation) -> None:
    """Return held stock. Locks follow the same global order as create_reservation."""
    resource_ids = sorted(i for i in (reservation.icu_resource_id, reservation.vent_resource_id) if i)
    if resource_ids:
        rows = (
            await db.execute(
                select(HospitalResource)
                .where(HospitalResource.id.in_(resource_ids))
                .order_by(HospitalResource.id)
                .with_for_update()
            )
        ).scalars().all()
        for r in rows:
            # Never exceed staffed capacity (it may have been lowered meanwhile).
            r.available_count = min(r.available_count + 1, r.staffed_capacity_count)
            r.version += 1

    active = [b for b in reservation.blood_dispatches if b.status == "RESERVED"]
    if active:
        rows = {
            b.id: b
            for b in (
                await db.execute(
                    select(BloodInventory)
                    .where(BloodInventory.id.in_(sorted(d.blood_inventory_id for d in active)))
                    .order_by(BloodInventory.id)
                    .with_for_update()
                )
            ).scalars().all()
        }
        for d in active:
            row = rows[d.blood_inventory_id]
            row.units_available += d.units
            row.units_reserved = max(0, row.units_reserved - d.units)
            row.version += 1
            d.status = "RELEASED"


async def _consume_blood(db: AsyncSession, reservation: Reservation) -> None:
    active = [b for b in reservation.blood_dispatches if b.status == "RESERVED"]
    if not active:
        return
    rows = {
        b.id: b
        for b in (
            await db.execute(
                select(BloodInventory)
                .where(BloodInventory.id.in_(sorted(d.blood_inventory_id for d in active)))
                .order_by(BloodInventory.id)
                .with_for_update()
            )
        ).scalars().all()
    }
    for d in active:
        row = rows[d.blood_inventory_id]
        row.units_reserved = max(0, row.units_reserved - d.units)
        row.version += 1
        d.status = "DELIVERED"


async def load_reservation(db: AsyncSession, reservation_id: uuid.UUID, *, lock: bool = False) -> Reservation:
    from sqlalchemy.orm import selectinload

    stmt = (
        select(Reservation)
        .options(selectinload(Reservation.blood_dispatches))
        .where(Reservation.id == reservation_id)
    )
    if lock:
        stmt = stmt.with_for_update(of=Reservation)
    reservation = (await db.execute(stmt)).scalar_one_or_none()
    if reservation is None:
        raise NotFoundError("Reservation not found.", error_code="RESERVATION_NOT_FOUND")
    return reservation


async def transition(
    db: AsyncSession,
    reservation: Reservation,
    target: Target,
    *,
    user_id: uuid.UUID,
    clinic_id: uuid.UUID,
    role: str,
    trace_id: str,
) -> Reservation:
    """Move a (row-locked) reservation through its lifecycle. Caller commits."""
    current = reservation.status
    if current == "HELD" and reservation.hold_expires_at <= datetime.now(timezone.utc):
        raise AppError(
            status_code=409,
            error_code="HOLD_EXPIRED",
            message="This hold has expired and its stock is being released. Re-run CareMatch.",
        )
    if target not in TRANSITIONS[current]:
        raise AppError(
            status_code=409,
            error_code="INVALID_TRANSITION",
            message=f"Cannot move a reservation from {current} to {target}.",
            details={"from": current, "to": target, "allowed": sorted(TRANSITIONS[current])},
        )

    if target in RELEASING_STATES:
        await _release(db, reservation)
    elif target == "ADMITTED":
        await _consume_blood(db, reservation)

    reservation.status = target
    reservation.version += 1
    db.add(
        AuditLog(
            clinic_id=clinic_id,
            actor_user_id=user_id,
            actor_role=role,
            action=f"RESERVATION_{target}",
            resource_type="reservation",
            resource_id=str(reservation.id),
            trace_id=trace_id,
            details={"from": current, "to": target},
        )
    )
    await db.flush()
    return reservation


async def sweep_expired_holds(db: AsyncSession, *, limit: int = 100) -> int:
    """Expire overdue HELD reservations and return their stock. Commits; returns count.

    FOR UPDATE SKIP LOCKED means rows that a live request is confirming or
    cancelling right now are skipped and picked up on the next sweep.
    """
    from sqlalchemy.orm import selectinload

    now = datetime.now(timezone.utc)
    overdue = (
        await db.execute(
            select(Reservation)
            .options(selectinload(Reservation.blood_dispatches))
            .where(Reservation.status == "HELD", Reservation.hold_expires_at <= now)
            .order_by(Reservation.hold_expires_at)
            .limit(limit)
            .with_for_update(of=Reservation, skip_locked=True)
        )
    ).scalars().all()
    for reservation in overdue:
        await _release(db, reservation)
        reservation.status = "EXPIRED"
        reservation.version += 1
        db.add(
            AuditLog(
                action="RESERVATION_EXPIRED",
                resource_type="reservation",
                resource_id=str(reservation.id),
                trace_id="lockstep-sweeper",
                details={"hold_expires_at": reservation.hold_expires_at.isoformat()},
            )
        )
    await db.commit()
    return len(overdue)


async def count_reservations(db: AsyncSession, resource_id: uuid.UUID, status: str) -> int:
    return int(
        (
            await db.execute(
                select(func.count(Reservation.id)).where(
                    Reservation.icu_resource_id == resource_id, Reservation.status == status
                )
            )
        ).scalar_one()
    )
