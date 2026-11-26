"""Live capacity feed: hospitals and blood banks push their own counts (no DGHS feed exists).

Two parts:

* Key management (JWT): an admin, or a facility's own hospital_admin / blood_bank_officer,
  issues per-facility API keys. Only a SHA-256 hash is stored; the plaintext is shown once.
* Ingestion (API key): ``POST /feed/v1/capacity`` with header ``X-Facility-Key``. The
  hospital system reports what *its own* census shows; ShasthoGrid subtracts the beds and
  blood it is currently holding for dispatches so pending holds are never double-sold.

Lock order follows LockStep: reservations -> hospital_resources -> blood_inventories,
each sorted by id.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError, ValidationAppError, get_trace_id
from app.core.security import CurrentUser, enforce_facility_scope, require_roles
from app.db.models import AuditLog, BloodInventory, Facility, FacilityFeedKey, HospitalResource, Reservation
from app.db.session import get_db
from app.schemas.critical_care import BloodGroup, ResourceType

router = APIRouter(tags=["feed"])

KEY_PREFIX = "sgf_"
# Statuses whose bed / ventilator is still occupied by a ShasthoGrid hold.
PENDING_STATUSES = ("HELD", "CONFIRMED", "EN_ROUTE")
MAX_CLOCK_SKEW = timedelta(minutes=5)
MAX_REPORT_AGE = timedelta(hours=24)


def hash_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- schemas


class FeedKeyCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=2, max_length=80)


class FeedKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    facility_id: UUID
    label: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class FeedKeyCreatedOut(FeedKeyOut):
    api_key: str  # plaintext, returned exactly once


class FeedKeyListOut(BaseModel):
    items: list[FeedKeyOut]


class FeedResourceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resource_type: ResourceType
    total_physical_count: int = Field(ge=0, le=10_000)
    staffed_capacity_count: int = Field(ge=0, le=10_000)
    available_count: int = Field(ge=0, le=10_000)

    @model_validator(mode="after")
    def _invariant(self) -> "FeedResourceIn":
        if not self.available_count <= self.staffed_capacity_count <= self.total_physical_count:
            raise ValueError("Counts must satisfy available ≤ staffed ≤ physical.")
        return self


class FeedBloodIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    blood_type: BloodGroup
    units_in_stock: int = Field(ge=0, le=10_000)
    nearest_expiry_date: date | None = None


class CapacityReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reported_at: datetime | None = None
    resources: list[FeedResourceIn] = Field(default_factory=list, max_length=8)
    blood: list[FeedBloodIn] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def _shape(self) -> "CapacityReportIn":
        if not self.resources and not self.blood:
            raise ValueError("Send at least one resource or blood row.")
        if len({r.resource_type for r in self.resources}) != len(self.resources):
            raise ValueError("Each resource_type may appear only once.")
        if len({b.blood_type for b in self.blood}) != len(self.blood):
            raise ValueError("Each blood_type may appear only once.")
        return self


class AppliedRow(BaseModel):
    kind: str  # resource | blood
    code: str
    status: str  # APPLIED | SKIPPED_OLDER | NOT_STOCKED
    reported: int
    held_by_shasthogrid: int = 0
    available_now: int | None = None


class CapacityReportOut(BaseModel):
    facility_id: UUID
    facility_code: str
    reported_at: datetime
    applied: list[AppliedRow]


# ------------------------------------------------------------------ key management


async def _facility_or_404(db: AsyncSession, facility_id: UUID) -> Facility:
    facility = await db.get(Facility, facility_id)
    if facility is None:
        raise NotFoundError("Facility not found.", error_code="FACILITY_NOT_FOUND")
    return facility


def _audit(user: CurrentUser | None, request: Request, action: str, resource_id: str, details: dict) -> AuditLog:
    return AuditLog(
        clinic_id=user.clinic_id if user else None,
        actor_user_id=user.id if user else None,
        actor_role=user.role if user else "facility_feed",
        action=action,
        resource_type="facility_feed",
        resource_id=resource_id,
        trace_id=get_trace_id(request),
        details=details,
    )


async def _scoped(db: AsyncSession, request: Request, user: CurrentUser, facility_id: UUID, action: str) -> None:
    try:
        enforce_facility_scope(user, facility_id)
    except AppError:
        db.add(_audit(user, request, f"{action}_DENIED", str(facility_id), {"reason": "FACILITY_SCOPE_VIOLATION"}))
        await db.commit()
        raise


FeedAdmin = Annotated[CurrentUser, Depends(require_roles("admin", "hospital_admin", "blood_bank_officer"))]


@router.post("/facilities/{facility_id}/feed-keys", response_model=FeedKeyCreatedOut, status_code=201)
async def create_feed_key(
    facility_id: UUID,
    payload: FeedKeyCreateIn,
    request: Request,
    user: FeedAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FeedKeyCreatedOut:
    await _scoped(db, request, user, facility_id, "FEED_KEY_CREATE")
    facility = await _facility_or_404(db, facility_id)
    plaintext = KEY_PREFIX + secrets.token_urlsafe(32)
    key = FacilityFeedKey(
        facility_id=facility.id,
        label=payload.label.strip(),
        key_prefix=plaintext[:12],
        key_hash=hash_key(plaintext),
        created_by_user_id=user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(key)
    await db.flush()
    db.add(_audit(user, request, "FEED_KEY_CREATE", str(key.id), {"facility_id": str(facility.id), "label": key.label}))
    await db.commit()
    await db.refresh(key)
    return FeedKeyCreatedOut(**FeedKeyOut.model_validate(key).model_dump(), api_key=plaintext)


@router.get("/facilities/{facility_id}/feed-keys", response_model=FeedKeyListOut)
async def list_feed_keys(
    facility_id: UUID,
    request: Request,
    user: FeedAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FeedKeyListOut:
    await _scoped(db, request, user, facility_id, "FEED_KEY_LIST")
    await _facility_or_404(db, facility_id)
    keys = (
        await db.execute(
            select(FacilityFeedKey)
            .where(FacilityFeedKey.facility_id == facility_id)
            .order_by(FacilityFeedKey.created_at.desc())
        )
    ).scalars().all()
    return FeedKeyListOut(items=[FeedKeyOut.model_validate(k) for k in keys])


@router.delete("/facilities/{facility_id}/feed-keys/{key_id}", response_model=FeedKeyOut)
async def revoke_feed_key(
    facility_id: UUID,
    key_id: UUID,
    request: Request,
    user: FeedAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FeedKeyOut:
    await _scoped(db, request, user, facility_id, "FEED_KEY_REVOKE")
    key = await db.get(FacilityFeedKey, key_id)
    if key is None or key.facility_id != facility_id:
        raise NotFoundError("Feed key not found.", error_code="FEED_KEY_NOT_FOUND")
    if key.revoked_at is None:
        key.revoked_at = datetime.now(timezone.utc)
        db.add(_audit(user, request, "FEED_KEY_REVOKE", str(key.id), {"facility_id": str(facility_id)}))
        await db.commit()
        await db.refresh(key)
    return FeedKeyOut.model_validate(key)


# ----------------------------------------------------------------------- ingestion


def _invalid_key() -> AppError:
    return AppError(status_code=401, error_code="FEED_KEY_INVALID", message="Missing, unknown or revoked X-Facility-Key.")


@router.post("/feed/v1/capacity", response_model=CapacityReportOut)
async def push_capacity(
    payload: CapacityReportIn,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_facility_key: Annotated[str | None, Header(alias="X-Facility-Key")] = None,
) -> CapacityReportOut:
    if not x_facility_key or not x_facility_key.startswith(KEY_PREFIX) or len(x_facility_key) > 128:
        raise _invalid_key()
    key = (
        await db.execute(
            select(FacilityFeedKey).where(FacilityFeedKey.key_hash == hash_key(x_facility_key)).with_for_update()
        )
    ).scalar_one_or_none()
    if key is None or key.revoked_at is not None:
        raise _invalid_key()
    facility = await _facility_or_404(db, key.facility_id)

    now = datetime.now(timezone.utc)
    reported_at = payload.reported_at or now
    if reported_at.tzinfo is None:
        raise ValidationAppError("reported_at must include a timezone offset.", error_code="FEED_TIMESTAMP_NAIVE")
    if reported_at > now + MAX_CLOCK_SKEW:
        raise ValidationAppError("reported_at is in the future.", error_code="FEED_TIMESTAMP_FUTURE")
    if reported_at < now - MAX_REPORT_AGE:
        raise ValidationAppError("reported_at is older than 24 hours.", error_code="FEED_TIMESTAMP_TOO_OLD")

    # ---- Lock 1: pending reservations at this hospital, sorted by id --------------
    pending = (
        await db.execute(
            select(Reservation)
            .where(Reservation.hospital_id == facility.id, Reservation.status.in_(PENDING_STATUSES))
            .order_by(Reservation.id)
            .with_for_update()
        )
    ).scalars().all()

    # ---- Lock 2: hospital_resources, sorted by id --------------------------------
    wanted_types = [r.resource_type for r in payload.resources]
    resources = (
        await db.execute(
            select(HospitalResource)
            .where(HospitalResource.facility_id == facility.id, HospitalResource.resource_type.in_(wanted_types))
            .order_by(HospitalResource.id)
            .with_for_update()
        )
    ).scalars().all() if wanted_types else []

    # ---- Lock 3: blood_inventories, sorted by id ---------------------------------
    wanted_groups = [b.blood_type for b in payload.blood]
    blood_rows = (
        await db.execute(
            select(BloodInventory)
            .where(BloodInventory.facility_id == facility.id, BloodInventory.blood_type.in_(wanted_groups))
            .order_by(BloodInventory.id)
            .with_for_update()
        )
    ).scalars().all() if wanted_groups else []

    by_type = {r.resource_type: r for r in resources}
    by_group = {b.blood_type: b for b in blood_rows}
    applied: list[AppliedRow] = []

    def is_older(row) -> bool:
        return row.data_source == "FEED" and row.reported_at is not None and reported_at < row.reported_at

    for item in payload.resources:
        row = by_type.get(item.resource_type)
        if row is None:
            applied.append(AppliedRow(kind="resource", code=item.resource_type, status="NOT_STOCKED", reported=item.available_count))
            continue
        held = sum(1 for r in pending if row.id in (r.icu_resource_id, r.vent_resource_id))
        if is_older(row):
            applied.append(AppliedRow(kind="resource", code=item.resource_type, status="SKIPPED_OLDER",
                                      reported=item.available_count, held_by_shasthogrid=held, available_now=row.available_count))
            continue
        row.total_physical_count = item.total_physical_count
        row.staffed_capacity_count = item.staffed_capacity_count
        row.available_count = max(0, item.available_count - held)
        row.data_source = "FEED"
        row.reported_at = reported_at
        row.version += 1
        applied.append(AppliedRow(kind="resource", code=item.resource_type, status="APPLIED",
                                  reported=item.available_count, held_by_shasthogrid=held, available_now=row.available_count))

    for item in payload.blood:
        row = by_group.get(item.blood_type)
        if row is None:
            applied.append(AppliedRow(kind="blood", code=item.blood_type, status="NOT_STOCKED", reported=item.units_in_stock))
            continue
        if is_older(row):
            applied.append(AppliedRow(kind="blood", code=item.blood_type, status="SKIPPED_OLDER",
                                      reported=item.units_in_stock, held_by_shasthogrid=row.units_reserved,
                                      available_now=row.units_available))
            continue
        # Reserved units are still physically on the shelf until the courier leaves.
        row.units_available = max(0, item.units_in_stock - row.units_reserved)
        if item.nearest_expiry_date is not None:
            row.nearest_expiry_date = item.nearest_expiry_date
        row.data_source = "FEED"
        row.reported_at = reported_at
        row.version += 1
        applied.append(AppliedRow(kind="blood", code=item.blood_type, status="APPLIED", reported=item.units_in_stock,
                                  held_by_shasthogrid=row.units_reserved, available_now=row.units_available))

    key.last_used_at = now
    db.add(
        _audit(
            None, request, "FEED_CAPACITY_PUSH", str(facility.id),
            {
                "facility_code": facility.code,
                "key_prefix": key.key_prefix,
                "reported_at": reported_at.isoformat(),
                "rows": [a.model_dump() for a in applied],
            },
        )
    )
    await db.commit()
    return CapacityReportOut(facility_id=facility.id, facility_code=facility.code, reported_at=reported_at, applied=applied)
