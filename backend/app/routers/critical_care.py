"""Critical-care registry (facilities, staffed beds, blood) and PulseScore endpoints."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.errors import AppError, NotFoundError, ValidationAppError, get_trace_id
from app.core.security import (
    CurrentUser,
    enforce_facility_scope,
    get_current_user,
    require_roles,
)
from app.db.models import AuditLog, BloodInventory, Facility, HospitalResource, TriageRequest
from app.db.session import get_db
from app.schemas.critical_care import (
    BloodCompatibilityOut,
    BloodGroup,
    BloodInventoryOut,
    BloodUpdateIn,
    CareMatchIn,
    CareMatchOut,
    ConflictProofOut,
    CriticalCareSummaryOut,
    FacilityListOut,
    FacilityOut,
    FacilitySort,
    FacilityTier,
    HospitalOptionOut,
    HospitalResourceOut,
    News2In,
    News2Out,
    ResourceType,
    RepairOut,
    ResourceUpdateIn,
    Specialty,
)
from app.services.blood_compat import RBC_DONORS, compatible_units, donor_cost
from app.services.carematch import CONSTRAINT_LABELS, CareRequest, FacilitySnapshot, solve_carematch
from app.services.news2 import News2Input, compute_news2
from app.services.routing import estimate_route, route

router = APIRouter(tags=["critical-care"])

SCARCE_UNITS_THRESHOLD = 10


def facility_freshness(facility: Facility) -> tuple[str, datetime | None, bool]:
    """(DEMO|LIVE|STALE, last real update, any simulated rows).

    DEMO: every count is still seeded demo data. LIVE: real updates (staff or hospital
    feed) newer than CAPACITY_STALE_MINUTES. STALE: real data that has not been refreshed.
    """
    rows = [*facility.resources, *facility.blood]
    real = [r.reported_at or r.updated_at for r in rows if r.data_source != "SEED_DEMO"]
    simulated = any(r.data_source == "SEED_DEMO" for r in rows)
    if not real:
        return "DEMO", None, True
    last = max(real)
    stale_after = timedelta(minutes=settings.CAPACITY_STALE_MINUTES)
    status = "STALE" if datetime.now(timezone.utc) - last > stale_after else "LIVE"
    return status, last, simulated


def _facility_out(
    facility: Facility,
    lat: float | None,
    lon: float | None,
    blood_type: str | None,
) -> FacilityOut:
    icu = next((r for r in facility.resources if r.resource_type == "ICU_BED"), None)
    stock = {b.blood_type: b.units_available for b in facility.blood}
    out = FacilityOut(
        id=facility.id,
        code=facility.code,
        name=facility.name,
        tier=facility.tier,
        division=facility.division,
        district=facility.district,
        lat=float(facility.lat),
        lon=float(facility.lon),
        coords_verified=facility.coords_verified,
        specialties=facility.specialties,
        resources=[HospitalResourceOut.model_validate(r) for r in facility.resources],
        blood=[BloodInventoryOut.model_validate(b) for b in facility.blood],
        icu_available=icu.available_count if icu else 0,
        icu_staffed=icu.staffed_capacity_count if icu else 0,
        icu_occupancy_pct=(
            round(100 * (1 - icu.available_count / icu.staffed_capacity_count), 1)
            if icu and icu.staffed_capacity_count
            else None
        ),
        compatible_blood_units=compatible_units(stock, blood_type) if blood_type else None,
    )
    out.data_freshness, out.last_updated_at, out.data_is_simulated = facility_freshness(facility)
    if lat is not None and lon is not None:
        est = estimate_route(lat, lon, float(facility.lat), float(facility.lon))
        out.distance_km, out.eta_minutes = est.distance_km, est.eta_minutes
    return out


async def _load_facility(db: AsyncSession, facility_id: UUID) -> Facility:
    facility = (
        await db.execute(
            select(Facility)
            .options(selectinload(Facility.resources), selectinload(Facility.blood))
            .where(Facility.id == facility_id)
        )
    ).scalar_one_or_none()
    if facility is None:
        raise NotFoundError("Facility not found.", error_code="FACILITY_NOT_FOUND")
    return facility


async def _guard_facility(
    db: AsyncSession, request: Request, user: CurrentUser, facility_id: UUID, action: str
) -> None:
    """Facility-scope check; a denied attempt is written to the audit log before the 403."""
    try:
        enforce_facility_scope(user, facility_id)
    except AppError:
        db.add(
            AuditLog(
                clinic_id=user.clinic_id,
                actor_user_id=user.id,
                actor_role=user.role,
                action=f"{action}_DENIED",
                resource_type="facility",
                resource_id=str(facility_id),
                trace_id=get_trace_id(request),
                details={"reason": "FACILITY_SCOPE_VIOLATION"},
            )
        )
        await db.commit()
        raise


@router.get("/facilities", response_model=FacilityListOut)
async def list_facilities(
    _: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Annotated[str | None, Query(max_length=80)] = None,
    tier: FacilityTier | None = None,
    specialty: Specialty | None = None,
    blood_type: BloodGroup | None = None,
    min_blood_units: Annotated[int, Query(ge=0, le=100)] = 0,
    min_icu: Annotated[int, Query(ge=0, le=500)] = 0,
    min_vent: Annotated[int, Query(ge=0, le=500)] = 0,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lon: Annotated[float | None, Query(ge=-180, le=180)] = None,
    max_eta_minutes: Annotated[float | None, Query(gt=0, le=600)] = None,
    sort: FacilitySort = "eta",
) -> FacilityListOut:
    if (lat is None) != (lon is None):
        raise ValidationAppError("Provide both lat and lon, or neither.")

    stmt = (
        select(Facility)
        .options(selectinload(Facility.resources), selectinload(Facility.blood))
        .where(Facility.is_active.is_(True))
    )
    if tier:
        stmt = stmt.where(Facility.tier == tier)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Facility.name.ilike(like) | Facility.code.ilike(like))
    facilities = (await db.execute(stmt)).scalars().all()

    items: list[FacilityOut] = []
    for f in facilities:
        if specialty and specialty not in f.specialties:
            continue
        out = _facility_out(f, lat, lon, blood_type)
        vent = next((r.available_count for r in f.resources if r.resource_type == "VENTILATOR"), 0)
        if out.icu_available < min_icu or vent < min_vent:
            continue
        if blood_type and (out.compatible_blood_units or 0) < min_blood_units:
            continue
        if max_eta_minutes is not None and out.eta_minutes is not None and out.eta_minutes > max_eta_minutes:
            continue
        items.append(out)

    if sort == "eta" and lat is not None:
        items.sort(key=lambda o: (o.eta_minutes or 0, o.name))
    elif sort == "available_icu":
        items.sort(key=lambda o: (-o.icu_available, o.name))
    elif sort == "occupancy":
        items.sort(key=lambda o: (o.icu_occupancy_pct if o.icu_occupancy_pct is not None else 101, o.name))
    else:
        items.sort(key=lambda o: o.name)

    return FacilityListOut(items=items, total=len(items))


@router.get("/facilities/{facility_id}", response_model=FacilityOut)
async def get_facility(
    facility_id: UUID,
    _: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FacilityOut:
    return _facility_out(await _load_facility(db, facility_id), None, None, None)


@router.patch("/facilities/{facility_id}/resources/{resource_type}", response_model=HospitalResourceOut)
async def update_resource(
    facility_id: UUID,
    resource_type: ResourceType,
    payload: ResourceUpdateIn,
    request: Request,
    user: Annotated[CurrentUser, Depends(require_roles("hospital_admin", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HospitalResourceOut:
    await _guard_facility(db, request, user, facility_id, "RESOURCE_UPDATE")

    resource = (
        await db.execute(
            select(HospitalResource)
            .where(
                HospitalResource.facility_id == facility_id,
                HospitalResource.resource_type == resource_type,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if resource is None:
        raise NotFoundError("Resource not found for this facility.", error_code="RESOURCE_NOT_FOUND")
    if payload.expected_version is not None and payload.expected_version != resource.version:
        raise AppError(
            status_code=409,
            error_code="VERSION_CONFLICT",
            message="This resource was changed by someone else. Reload and try again.",
            details={"expected_version": payload.expected_version, "server_version": resource.version},
        )

    physical = payload.total_physical_count if payload.total_physical_count is not None else resource.total_physical_count
    staffed = payload.staffed_capacity_count if payload.staffed_capacity_count is not None else resource.staffed_capacity_count
    available = payload.available_count if payload.available_count is not None else resource.available_count
    if not 0 <= available <= staffed <= physical:
        raise ValidationAppError(
            "Counts must satisfy 0 ≤ available ≤ staffed ≤ physical.",
            error_code="CAPACITY_INVARIANT_VIOLATION",
            details={"physical": physical, "staffed": staffed, "available": available},
        )

    before = {
        "physical": resource.total_physical_count,
        "staffed": resource.staffed_capacity_count,
        "available": resource.available_count,
    }
    resource.total_physical_count, resource.staffed_capacity_count, resource.available_count = (
        physical,
        staffed,
        available,
    )
    resource.version += 1
    resource.data_source = "STAFF"
    resource.reported_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            clinic_id=user.clinic_id,
            actor_user_id=user.id,
            actor_role=user.role,
            action="RESOURCE_UPDATE",
            resource_type="hospital_resource",
            resource_id=str(resource.id),
            trace_id=get_trace_id(request),
            details={
                "facility_id": str(facility_id),
                "resource_type": resource_type,
                "before": before,
                "after": {"physical": physical, "staffed": staffed, "available": available},
            },
        )
    )
    await db.commit()
    await db.refresh(resource)
    return HospitalResourceOut.model_validate(resource)


@router.patch("/facilities/{facility_id}/blood/{blood_type}", response_model=BloodInventoryOut)
async def update_blood(
    facility_id: UUID,
    blood_type: BloodGroup,
    payload: BloodUpdateIn,
    request: Request,
    user: Annotated[CurrentUser, Depends(require_roles("blood_bank_officer", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloodInventoryOut:
    await _guard_facility(db, request, user, facility_id, "BLOOD_UPDATE")

    row = (
        await db.execute(
            select(BloodInventory)
            .where(BloodInventory.facility_id == facility_id, BloodInventory.blood_type == blood_type)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Blood group not stocked at this facility.", error_code="BLOOD_NOT_FOUND")
    if payload.expected_version is not None and payload.expected_version != row.version:
        raise AppError(
            status_code=409,
            error_code="VERSION_CONFLICT",
            message="This blood stock was changed by someone else. Reload and try again.",
            details={"expected_version": payload.expected_version, "server_version": row.version},
        )

    before = row.units_available
    row.units_available = payload.units_available
    if payload.nearest_expiry_date is not None:
        row.nearest_expiry_date = payload.nearest_expiry_date
    row.version += 1
    row.data_source = "STAFF"
    row.reported_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            clinic_id=user.clinic_id,
            actor_user_id=user.id,
            actor_role=user.role,
            action="BLOOD_UPDATE",
            resource_type="blood_inventory",
            resource_id=str(row.id),
            trace_id=get_trace_id(request),
            details={
                "facility_id": str(facility_id),
                "blood_type": blood_type,
                "before": before,
                "after": row.units_available,
            },
        )
    )
    await db.commit()
    await db.refresh(row)
    return BloodInventoryOut.model_validate(row)


@router.get("/critical-care/summary", response_model=CriticalCareSummaryOut)
async def critical_care_summary(
    _: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CriticalCareSummaryOut:
    facilities = (
        await db.execute(
            select(Facility)
            .options(selectinload(Facility.resources), selectinload(Facility.blood))
            .where(Facility.is_active.is_(True))
        )
    ).scalars().all()

    icu = [r for f in facilities for r in f.resources if r.resource_type == "ICU_BED"]
    vents = [r for f in facilities for r in f.resources if r.resource_type == "VENTILATOR"]
    physical = sum(r.total_physical_count for r in icu)
    staffed = sum(r.staffed_capacity_count for r in icu)
    blood: dict[str, int] = {g: 0 for g in RBC_DONORS}
    for f in facilities:
        for b in f.blood:
            blood[b.blood_type] += b.units_available

    return CriticalCareSummaryOut(
        facilities=len(facilities),
        icu_physical=physical,
        icu_staffed=staffed,
        icu_available=sum(r.available_count for r in icu),
        icu_idle_unstaffed=physical - staffed,
        icu_idle_unstaffed_pct=round(100 * (physical - staffed) / physical, 1) if physical else 0.0,
        ventilators_available=sum(r.available_count for r in vents),
        blood_units_by_group=blood,
        scarce_blood_groups=[g for g, units in blood.items() if units < SCARCE_UNITS_THRESHOLD],
    )


@router.post("/pulsescore/news2", response_model=News2Out)
async def pulsescore_news2(
    payload: News2In,
    _: Annotated[CurrentUser, Depends(get_current_user)],
) -> News2Out:
    result = compute_news2(News2Input(**payload.model_dump()))
    return News2Out(**result.to_dict())


@router.get("/pulsescore/blood-compatibility/{recipient}", response_model=BloodCompatibilityOut)
async def pulsescore_blood_compatibility(
    recipient: BloodGroup,
    _: Annotated[CurrentUser, Depends(get_current_user)],
) -> BloodCompatibilityOut:
    donors = list(RBC_DONORS[recipient])
    return BloodCompatibilityOut(
        recipient=recipient,
        compatible_donors=donors,
        preferred_order=sorted(donors, key=lambda d: donor_cost(recipient, d)),
    )


# ------------------------------------------------------------------ CareMatch


@router.post("/carematch/optimize", response_model=CareMatchOut)
async def carematch_optimize(
    payload: CareMatchIn,
    request: Request,
    user: Annotated[CurrentUser, Depends(require_roles("dispatcher", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CareMatchOut:
    out = await execute_carematch(db, user, payload, get_trace_id(request))
    await db.commit()
    return out


async def execute_carematch(
    db: AsyncSession, user: CurrentUser, payload: CareMatchIn, trace_id: str
) -> CareMatchOut:
    """Run PulseScore + CareMatch + ConflictProof and stage the triage record. Caller commits."""
    news2 = compute_news2(News2Input(**payload.vitals.model_dump())) if payload.vitals else None

    facilities = (
        await db.execute(
            select(Facility)
            .options(selectinload(Facility.resources), selectinload(Facility.blood))
            .where(Facility.is_active.is_(True))
        )
    ).scalars().all()

    snapshots: list[FacilitySnapshot] = []
    sources: set[str] = set()
    stale_codes: list[str] = []
    any_simulated = False
    for f in facilities:
        freshness, _, simulated = facility_freshness(f)
        any_simulated = any_simulated or simulated
        if freshness == "STALE":
            stale_codes.append(f.code)
        est = await route(payload.incident_lat, payload.incident_lon, float(f.lat), float(f.lon))
        sources.add(est.source)
        res = {r.resource_type: r for r in f.resources}
        snapshots.append(
            FacilitySnapshot(
                id=str(f.id),
                code=f.code,
                name=f.name,
                tier=f.tier,
                lat=float(f.lat),
                lon=float(f.lon),
                specialties=tuple(f.specialties),
                icu_available=res["ICU_BED"].available_count if "ICU_BED" in res else 0,
                icu_staffed=res["ICU_BED"].staffed_capacity_count if "ICU_BED" in res else 0,
                vent_available=res["VENTILATOR"].available_count if "VENTILATOR" in res else 0,
                blood={b.blood_type: b.units_available for b in f.blood},
                eta_minutes=est.eta_minutes,
                distance_km=est.distance_km,
                stale=freshness == "STALE",
            )
        )

    def courier(source: FacilitySnapshot, hospital: FacilitySnapshot) -> tuple[float, float]:
        e = estimate_route(source.lat, source.lon, hospital.lat, hospital.lon, settings.COURIER_SPEED_KMH)
        return e.distance_km, e.eta_minutes

    care_request = CareRequest(
        needs_icu=payload.needs_icu,
        needs_vent=payload.needs_vent,
        specialty=payload.specialty,
        blood_type=payload.blood_type,
        blood_units=payload.blood_units,
        public_only=payload.public_only,
        max_eta_minutes=payload.max_eta_minutes,
    )
    # CP-SAT is CPU-bound: keep the event loop free for concurrent requests.
    result = await asyncio.to_thread(solve_carematch, snapshots, care_request, courier)

    triage = TriageRequest(
        id=uuid.uuid4(),
        created_by_user_id=user.id,
        incident_lat=payload.incident_lat,
        incident_lon=payload.incident_lon,
        vitals=payload.vitals.model_dump() if payload.vitals else None,
        news2_score=news2.score if news2 else None,
        acuity=news2.acuity if news2 else None,
        constraints=payload.model_dump(exclude={"vitals"}),
        solver_status=result.status,
        result=result.to_dict(),
        solver_wall_time_ms=result.wall_time_ms,
    )
    db.add(triage)
    db.add(
        AuditLog(
            clinic_id=user.clinic_id,
            actor_user_id=user.id,
            actor_role=user.role,
            action="CAREMATCH_OPTIMIZE",
            resource_type="triage_request",
            resource_id=str(triage.id),
            trace_id=trace_id,
            details={"status": result.status, "mus_cores": result.mus_cores},
        )
    )
    await db.flush()
    out = _carematch_out(triage.id, result.to_dict(), news2.to_dict() if news2 else None, sources)
    out.stale_facilities = sorted(stale_codes)
    out.data_is_simulated = any_simulated
    return out


def _carematch_out(
    triage_id: UUID, result: dict, news2: dict | None, sources: set[str]
) -> CareMatchOut:
    conflict = None
    if result["status"] == "INFEASIBLE":
        conflict = ConflictProofOut(
            mus_cores=result["mus_cores"],
            solver_core=result["solver_core"],
            labels={c: CONSTRAINT_LABELS[c] for c in result["active_constraints"]},
            repairs=[RepairOut(**r) for r in result["repairs"]],
        )
    return CareMatchOut(
        triage_request_id=triage_id,
        status=result["status"],
        news2=News2Out(**news2) if news2 else None,
        active_constraints=result["active_constraints"],
        recommendation=HospitalOptionOut(**result["recommendation"]) if result["recommendation"] else None,
        alternatives=[HospitalOptionOut(**a) for a in result["alternatives"]],
        conflict_proof=conflict,
        wall_time_ms=result["wall_time_ms"],
        routing_source=next(iter(sources)) if len(sources) == 1 else "mixed",
    )


@router.get("/carematch/{triage_request_id}", response_model=CareMatchOut)
async def carematch_get(
    triage_request_id: UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CareMatchOut:
    triage = await db.get(TriageRequest, triage_request_id)
    if triage is None or (user.role not in ("admin", "auditor") and triage.created_by_user_id != user.id):
        raise NotFoundError("Triage request not found.", error_code="TRIAGE_NOT_FOUND")
    news2 = None
    if triage.vitals:
        news2 = compute_news2(News2Input(**triage.vitals)).to_dict()
    return _carematch_out(triage.id, triage.result, news2, {"haversine_urban"})
