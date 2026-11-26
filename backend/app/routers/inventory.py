from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
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
from app.db.models import AntibioticCatalog, AuditLog, InventoryBatch
from app.db.session import get_db
from app.schemas.inventory import BatchCreate, BatchOut, BatchPatch
from app.services.sync_service import build_batch_out

router = APIRouter(prefix="/inventory", tags=["inventory"])

ReadRoles = Annotated[
    CurrentUser,
    Depends(require_roles("dispenser", "pharmacist", "auditor", "admin")),
]
PharmacistRoles = Annotated[
    CurrentUser,
    Depends(require_roles("pharmacist", "admin")),
]
DbSession = Annotated[AsyncSession, Depends(get_db)]


def utcnow() -> datetime:
    return datetime.now(UTC)


@router.get("/batches", response_model=list[BatchOut])
async def list_inventory_batches(
    current_user: ReadRoles,
    db: DbSession,
    tier: Literal["ACCESS", "WATCH", "RESERVE"] | None = Query(default=None),
    in_stock: bool | None = Query(default=None),
    expiring_soon: bool | None = Query(default=None),
    q: str | None = Query(default=None),
) -> list[BatchOut]:
    stmt = (
        select(InventoryBatch, AntibioticCatalog)
        .join(AntibioticCatalog, InventoryBatch.antibiotic_id == AntibioticCatalog.id)
        .where(InventoryBatch.clinic_id == current_user.clinic_id)
        .order_by(InventoryBatch.expiry_date.asc(), InventoryBatch.lot_number.asc())
    )
    if tier is not None:
        stmt = stmt.where(AntibioticCatalog.aware_category == tier)
    if in_stock is True:
        stmt = stmt.where(InventoryBatch.qty_remaining > 0)
    elif in_stock is False:
        stmt = stmt.where(InventoryBatch.qty_remaining == 0)

    today = date.today()
    soon_cutoff = today + timedelta(days=30)
    if expiring_soon is True:
        stmt = stmt.where(
            InventoryBatch.qty_remaining > 0,
            InventoryBatch.expiry_date > today,
            InventoryBatch.expiry_date <= soon_cutoff,
        )
    elif expiring_soon is False:
        stmt = stmt.where(
            or_(
                InventoryBatch.qty_remaining == 0,
                InventoryBatch.expiry_date <= today,
                InventoryBatch.expiry_date > soon_cutoff,
            )
        )

    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                AntibioticCatalog.drug_code.ilike(pattern),
                AntibioticCatalog.generic_name.ilike(pattern),
                InventoryBatch.lot_number.ilike(pattern),
            )
        )

    rows = (await db.execute(stmt)).all()
    return [build_batch_out(batch, abx, today=today) for batch, abx in rows]


@router.post("/batches", response_model=BatchOut, status_code=201)
async def create_inventory_batch(
    payload: BatchCreate,
    request: Request,
    current_user: PharmacistRoles,
    db: DbSession,
) -> BatchOut | JSONResponse:
    guard = IdempotencyGuard()
    replay = await guard.begin(
        db=db,
        request=request,
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
    )
    if replay is not None:
        return replay

    abx = (
        await db.execute(
            select(AntibioticCatalog).where(AntibioticCatalog.id == payload.antibiotic_id)
        )
    ).scalar_one_or_none()
    if abx is None:
        raise NotFoundError(
            message="Antibiotic catalog entry not found.",
            error_code="ANTIBIOTIC_NOT_FOUND",
            details={"antibiotic_id": str(payload.antibiotic_id)},
        )

    assert payload.lot_number is not None
    existing_lot = (
        await db.execute(
            select(InventoryBatch.id).where(
                InventoryBatch.clinic_id == current_user.clinic_id,
                InventoryBatch.antibiotic_id == payload.antibiotic_id,
                InventoryBatch.lot_number == payload.lot_number,
            )
        )
    ).scalar_one_or_none()
    if existing_lot is not None:
        raise ConflictError(
            message="An inventory batch with this antibiotic and lot_number already exists.",
            error_code="BATCH_LOT_EXISTS",
            details={"lot_number": payload.lot_number},
        )

    batch = InventoryBatch(
        clinic_id=current_user.clinic_id,
        antibiotic_id=payload.antibiotic_id,
        lot_number=payload.lot_number,
        qty_initial=payload.qty_initial,
        qty_remaining=(
            payload.qty_remaining
            if payload.qty_remaining is not None
            else payload.qty_initial
        ),
        expiry_date=payload.expiry_date,
        unit=payload.unit,
        version=1,
    )
    db.add(batch)
    await db.flush()

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="INVENTORY_BATCH_CREATE",
            resource_type="inventory_batch",
            resource_id=str(batch.id),
            trace_id=get_trace_id(request),
            details={
                "drug_code": abx.drug_code,
                "lot_number": batch.lot_number,
                "qty_initial": batch.qty_initial,
                "expiry_date": batch.expiry_date.isoformat(),
            },
        )
    )

    out = build_batch_out(batch, abx)
    await guard.commit_response(db=db, status_code=201, body=jsonable_encoder(out))
    await db.commit()
    return out


@router.patch("/batches/{batch_id}", response_model=BatchOut)
async def patch_inventory_batch(
    batch_id: UUID,
    payload: BatchPatch,
    request: Request,
    current_user: PharmacistRoles,
    db: DbSession,
) -> BatchOut:
    row = (
        await db.execute(
            select(InventoryBatch, AntibioticCatalog)
            .join(AntibioticCatalog, InventoryBatch.antibiotic_id == AntibioticCatalog.id)
            .where(InventoryBatch.id == batch_id)
        )
    ).first()
    if row is None:
        raise NotFoundError(
            message="Inventory batch not found.",
            error_code="BATCH_NOT_FOUND",
            details={"batch_id": str(batch_id)},
        )
    batch, abx = row
    enforce_clinic_scope(current_user, batch.clinic_id)

    if payload.qty_remaining is not None:
        if payload.qty_remaining > batch.qty_initial:
            raise ValidationAppError(
                message="qty_remaining cannot exceed qty_initial.",
                error_code="VALIDATION_ERROR",
                details={
                    "qty_remaining": payload.qty_remaining,
                    "qty_initial": batch.qty_initial,
                },
            )
        batch.qty_remaining = payload.qty_remaining

    if payload.lot_number is not None and payload.lot_number != batch.lot_number:
        dup_lot = (
            await db.execute(
                select(InventoryBatch.id).where(
                    InventoryBatch.clinic_id == current_user.clinic_id,
                    InventoryBatch.antibiotic_id == batch.antibiotic_id,
                    InventoryBatch.lot_number == payload.lot_number,
                    InventoryBatch.id != batch.id,
                )
            )
        ).scalar_one_or_none()
        if dup_lot is not None:
            raise ConflictError(
                message="An inventory batch with this lot_number already exists.",
                error_code="BATCH_LOT_EXISTS",
                details={"lot_number": payload.lot_number},
            )
        batch.lot_number = payload.lot_number

    if payload.expiry_date is not None:
        batch.expiry_date = payload.expiry_date
    if payload.unit is not None:
        batch.unit = payload.unit

    batch.version += 1
    batch.updated_at = utcnow()

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="INVENTORY_BATCH_UPDATE",
            resource_type="inventory_batch",
            resource_id=str(batch.id),
            trace_id=get_trace_id(request),
            details={"qty_remaining": batch.qty_remaining, "version": batch.version},
        )
    )
    await db.commit()
    await db.refresh(batch)
    return build_batch_out(batch, abx)
