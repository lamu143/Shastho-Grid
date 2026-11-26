from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal, cast
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.core.security import CurrentUser, enforce_clinic_scope
from app.db.models import (
    AntibioticCatalog,
    AuditLog,
    AwareGuideline,
    Dispense,
    InventoryBatch,
    Patient,
)
from app.schemas.dispenses import DispenseCreate, DispenseOut


def utcnow() -> datetime:
    return datetime.now(UTC)


def serialize_dispense(
    dispense: Dispense,
    abx: AntibioticCatalog | None = None,
    guideline: AwareGuideline | None = None,
    patient: Patient | None = None,
    batch: InventoryBatch | None = None,
) -> DispenseOut:
    verdict = dispense.solver_verdict if isinstance(dispense.solver_verdict, dict) else {}
    syndrome_code = (
        guideline.syndrome_code
        if guideline is not None
        else str(verdict.get("syndrome_code") or "")
    )
    drug_code = (
        abx.drug_code
        if abx is not None
        else (str(verdict["drug_code"]) if verdict.get("drug_code") else None)
    )
    severity_raw = verdict.get("severity")
    severity = str(severity_raw) if severity_raw is not None else None
    aware_cat = cast(
        Literal["ACCESS", "WATCH", "RESERVE", "NO_ANTIBIOTIC"],
        dispense.aware_category_snapshot,
    )
    status = cast(
        Literal["DRAFT", "PENDING_APPROVAL", "DISPENSED", "REJECTED", "VOIDED"],
        dispense.status,
    )
    return DispenseOut(
        id=dispense.id,
        clinic_id=dispense.clinic_id,
        patient_id=dispense.patient_id,
        guideline_id=dispense.guideline_id,
        antibiotic_id=dispense.antibiotic_id,
        batch_id=dispense.batch_id,
        prescriber_id=dispense.prescriber_id,
        approver_id=dispense.approver_id,
        drug_code=drug_code,
        antibiotic_code=drug_code,
        syndrome_code=syndrome_code,
        aware_category=aware_cat,
        aware_category_snapshot=aware_cat,
        qty=dispense.qty_dispensed,
        qty_dispensed=dispense.qty_dispensed,
        days_supply=dispense.days_supply,
        status=status,
        solver_status=dispense.solver_status,
        solver_verdict=dict(verdict),
        decision_reason=dispense.decision_reason,
        notes=dispense.decision_reason,
        severity=severity,
        patient_name=patient.full_name if patient is not None else None,
        generic_name=abx.generic_name if abx is not None else None,
        lot_number=batch.lot_number if batch is not None else None,
        client_mutation_id=dispense.client_mutation_id,
        version=dispense.version,
        created_at=dispense.created_at,
        dispensed_at=dispense.dispensed_at,
        updated_at=dispense.updated_at,
    )


async def load_dispense_out(db: AsyncSession, dispense_id: UUID) -> DispenseOut:
    stmt = (
        select(Dispense, AntibioticCatalog, AwareGuideline, Patient, InventoryBatch)
        .outerjoin(AntibioticCatalog, Dispense.antibiotic_id == AntibioticCatalog.id)
        .outerjoin(AwareGuideline, Dispense.guideline_id == AwareGuideline.id)
        .outerjoin(Patient, Dispense.patient_id == Patient.id)
        .outerjoin(InventoryBatch, Dispense.batch_id == InventoryBatch.id)
        .where(Dispense.id == dispense_id)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise NotFoundError(
            message="Dispense record not found.",
            error_code="DISPENSE_NOT_FOUND",
            details={"dispense_id": str(dispense_id)},
        )
    dispense, abx, guideline, patient, batch = row
    return serialize_dispense(dispense, abx, guideline, patient, batch)


async def list_dispenses(
    db: AsyncSession,
    clinic_id: UUID,
    status: str | None = None,
    aware_category: str | None = None,
) -> list[DispenseOut]:
    stmt = (
        select(Dispense, AntibioticCatalog, AwareGuideline, Patient, InventoryBatch)
        .outerjoin(AntibioticCatalog, Dispense.antibiotic_id == AntibioticCatalog.id)
        .outerjoin(AwareGuideline, Dispense.guideline_id == AwareGuideline.id)
        .outerjoin(Patient, Dispense.patient_id == Patient.id)
        .outerjoin(InventoryBatch, Dispense.batch_id == InventoryBatch.id)
        .where(Dispense.clinic_id == clinic_id)
        .order_by(Dispense.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(Dispense.status == status)
    if aware_category is not None:
        stmt = stmt.where(Dispense.aware_category_snapshot == aware_category)
    rows = (await db.execute(stmt)).all()
    return [serialize_dispense(d, abx, g, p, b) for d, abx, g, p, b in rows]


async def create_dispense_draft(
    db: AsyncSession,
    current_user: CurrentUser,
    payload: DispenseCreate,
    trace_id: str,
) -> DispenseOut:
    if payload.id is not None:
        existing = (
            await db.execute(select(Dispense).where(Dispense.id == payload.id))
        ).scalar_one_or_none()
        if existing is not None:
            enforce_clinic_scope(current_user, existing.clinic_id)
            raise ConflictError(
                message="Dispense with this ID already exists.",
                error_code="DISPENSE_ALREADY_EXISTS",
                details={"dispense_id": str(payload.id)},
            )

    patient = (
        await db.execute(select(Patient).where(Patient.id == payload.patient_id))
    ).scalar_one_or_none()
    if patient is None:
        raise NotFoundError(
            message="Patient not found.",
            error_code="PATIENT_NOT_FOUND",
            details={"patient_id": str(payload.patient_id)},
        )
    enforce_clinic_scope(current_user, patient.clinic_id)

    batch: InventoryBatch | None = None
    if payload.batch_id is not None:
        batch = (
            await db.execute(select(InventoryBatch).where(InventoryBatch.id == payload.batch_id))
        ).scalar_one_or_none()
        if batch is None:
            raise NotFoundError(
                message="Inventory batch not found.",
                error_code="BATCH_NOT_FOUND",
                details={"batch_id": str(payload.batch_id)},
            )
        enforce_clinic_scope(current_user, batch.clinic_id)

    resolved_antibiotic_id = payload.antibiotic_id
    if batch is not None:
        if resolved_antibiotic_id is None:
            resolved_antibiotic_id = batch.antibiotic_id
        elif resolved_antibiotic_id != batch.antibiotic_id:
            raise ValidationAppError(
                message="antibiotic_id does not match the selected inventory batch.",
                error_code="BATCH_ANTIBIOTIC_MISMATCH",
                details={
                    "batch_id": str(batch.id),
                    "batch_antibiotic_id": str(batch.antibiotic_id),
                    "requested_antibiotic_id": str(resolved_antibiotic_id),
                },
            )

    abx: AntibioticCatalog | None = None
    if resolved_antibiotic_id is not None:
        abx = (
            await db.execute(
                select(AntibioticCatalog).where(AntibioticCatalog.id == resolved_antibiotic_id)
            )
        ).scalar_one_or_none()
        if abx is None:
            raise NotFoundError(
                message="Antibiotic catalog entry not found.",
                error_code="ANTIBIOTIC_NOT_FOUND",
                details={"antibiotic_id": str(resolved_antibiotic_id)},
            )

    guideline: AwareGuideline | None = None
    if payload.guideline_id is not None:
        guideline = (
            await db.execute(
                select(AwareGuideline).where(AwareGuideline.id == payload.guideline_id)
            )
        ).scalar_one_or_none()
        if guideline is None:
            raise NotFoundError(
                message="Guideline not found.",
                error_code="GUIDELINE_NOT_FOUND",
                details={"guideline_id": str(payload.guideline_id)},
            )
    elif payload.syndrome_code is not None:
        guideline = (
            await db.execute(
                select(AwareGuideline).where(
                    AwareGuideline.syndrome_code == payload.syndrome_code
                )
            )
        ).scalar_one_or_none()

    aware_snapshot = (
        payload.aware_category_snapshot
        or (abx.aware_category if abx is not None else "NO_ANTIBIOTIC")
    )
    qty_dispensed = payload.qty_dispensed if payload.qty_dispensed is not None else 0
    if aware_snapshot == "NO_ANTIBIOTIC" and payload.batch_id is None and payload.antibiotic_id is None:
        qty_dispensed = payload.qty_dispensed if payload.qty_dispensed is not None else 0

    solver_status = payload.solver_status or (
        "NO_ANTIBIOTIC" if aware_snapshot == "NO_ANTIBIOTIC" else "OPTIMAL"
    )
    verdict: dict[str, Any] = dict(payload.solver_verdict or {})
    if guideline is not None:
        verdict.setdefault("syndrome_code", guideline.syndrome_code)
    elif payload.syndrome_code is not None:
        verdict.setdefault("syndrome_code", payload.syndrome_code)
    else:
        verdict.setdefault("syndrome_code", "")
    if abx is not None:
        verdict.setdefault("drug_code", abx.drug_code)
    if payload.severity is not None:
        verdict["severity"] = payload.severity

    dispense_kwargs: dict[str, Any] = {
        "clinic_id": current_user.clinic_id,
        "patient_id": patient.id,
        "guideline_id": guideline.id if guideline is not None else None,
        "antibiotic_id": abx.id if abx is not None else None,
        "batch_id": batch.id if batch is not None else None,
        "prescriber_id": current_user.id,
        "approver_id": None,
        "status": "DRAFT",
        "aware_category_snapshot": aware_snapshot,
        "qty_dispensed": qty_dispensed,
        "days_supply": payload.days_supply,
        "solver_status": solver_status,
        "solver_verdict": verdict,
        "decision_reason": payload.decision_reason,
        "client_mutation_id": payload.client_mutation_id,
        "version": 1,
    }
    if payload.id is not None:
        dispense_kwargs["id"] = payload.id

    dispense = Dispense(**dispense_kwargs)
    db.add(dispense)
    await db.flush()

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="DISPENSE_CREATE",
            resource_type="dispense",
            resource_id=str(dispense.id),
            trace_id=trace_id,
            details={
                "patient_id": str(dispense.patient_id),
                "batch_id": str(dispense.batch_id) if dispense.batch_id else None,
                "aware_category": dispense.aware_category_snapshot,
                "qty_dispensed": dispense.qty_dispensed,
                "syndrome_code": verdict.get("syndrome_code", ""),
            },
        )
    )
    await db.flush()
    return serialize_dispense(dispense, abx, guideline, patient, batch)


async def submit_dispense(
    db: AsyncSession,
    current_user: CurrentUser,
    dispense_id: UUID,
    trace_id: str,
) -> DispenseOut:
    dispense = (
        await db.execute(
            select(Dispense).where(Dispense.id == dispense_id).with_for_update()
        )
    ).scalar_one_or_none()
    if dispense is None:
        raise NotFoundError(
            message="Dispense record not found.",
            error_code="DISPENSE_NOT_FOUND",
            details={"dispense_id": str(dispense_id)},
        )
    enforce_clinic_scope(current_user, dispense.clinic_id)

    if dispense.status != "DRAFT":
        raise ConflictError(
            message=f"Cannot submit dispense from status '{dispense.status}'.",
            error_code="INVALID_STATE_TRANSITION",
            details={"current_status": dispense.status, "target_status": "PENDING_APPROVAL"},
        )

    dispense.status = "PENDING_APPROVAL"
    dispense.version += 1
    dispense.updated_at = utcnow()

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="DISPENSE_SUBMIT",
            resource_type="dispense",
            resource_id=str(dispense.id),
            trace_id=trace_id,
            details={"from_status": "DRAFT", "to_status": "PENDING_APPROVAL", "version": dispense.version},
        )
    )
    await db.flush()
    return await load_dispense_out(db, dispense.id)


async def approve_dispense(
    db: AsyncSession,
    current_user: CurrentUser,
    dispense_id: UUID,
    trace_id: str,
) -> DispenseOut:
    dispense = (
        await db.execute(
            select(Dispense).where(Dispense.id == dispense_id).with_for_update()
        )
    ).scalar_one_or_none()
    if dispense is None:
        raise NotFoundError(
            message="Dispense record not found.",
            error_code="DISPENSE_NOT_FOUND",
            details={"dispense_id": str(dispense_id)},
        )
    enforce_clinic_scope(current_user, dispense.clinic_id)

    if dispense.status != "PENDING_APPROVAL":
        raise ConflictError(
            message=f"Cannot approve dispense from status '{dispense.status}'.",
            error_code="INVALID_STATE_TRANSITION",
            details={"current_status": dispense.status, "target_status": "DISPENSED"},
        )

    if (
        dispense.aware_category_snapshot != "NO_ANTIBIOTIC"
        and dispense.batch_id is not None
        and dispense.qty_dispensed > 0
    ):
        atomic_decrement = text(
            """
            UPDATE inventory_batches
            SET qty_remaining = qty_remaining - :qty,
                version = version + 1,
                updated_at = NOW()
            WHERE id = :batch_id
              AND clinic_id = :clinic_id
              AND qty_remaining >= :qty
              AND expiry_date > CURRENT_DATE
            RETURNING id
            """
        )
        updated_row = (
            await db.execute(
                atomic_decrement,
                {
                    "qty": dispense.qty_dispensed,
                    "batch_id": dispense.batch_id,
                    "clinic_id": current_user.clinic_id,
                },
            )
        ).first()
        if updated_row is None:
            err_details = {
                "dispense_id": str(dispense.id),
                "batch_id": str(dispense.batch_id),
                "qty_requested": dispense.qty_dispensed,
            }
            await db.rollback()
            raise ConflictError(
                message="Batch has insufficient remaining stock or is expired.",
                error_code="INSUFFICIENT_OR_EXPIRED_STOCK",
                details=err_details,
            )

    now = utcnow()
    dispense.status = "DISPENSED"
    dispense.approver_id = current_user.id
    dispense.dispensed_at = now
    dispense.version += 1
    dispense.updated_at = now

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="DISPENSE_APPROVE",
            resource_type="dispense",
            resource_id=str(dispense.id),
            trace_id=trace_id,
            details={
                "from_status": "PENDING_APPROVAL",
                "to_status": "DISPENSED",
                "batch_id": str(dispense.batch_id) if dispense.batch_id else None,
                "qty_dispensed": dispense.qty_dispensed,
                "version": dispense.version,
            },
        )
    )
    await db.flush()
    return await load_dispense_out(db, dispense.id)


async def reject_dispense(
    db: AsyncSession,
    current_user: CurrentUser,
    dispense_id: UUID,
    reason: str | None,
    trace_id: str,
) -> DispenseOut:
    dispense = (
        await db.execute(
            select(Dispense).where(Dispense.id == dispense_id).with_for_update()
        )
    ).scalar_one_or_none()
    if dispense is None:
        raise NotFoundError(
            message="Dispense record not found.",
            error_code="DISPENSE_NOT_FOUND",
            details={"dispense_id": str(dispense_id)},
        )
    enforce_clinic_scope(current_user, dispense.clinic_id)

    if dispense.status != "PENDING_APPROVAL":
        raise ConflictError(
            message=f"Cannot reject dispense from status '{dispense.status}'.",
            error_code="INVALID_STATE_TRANSITION",
            details={"current_status": dispense.status, "target_status": "REJECTED"},
        )

    dispense.status = "REJECTED"
    dispense.approver_id = current_user.id
    if reason is not None:
        dispense.decision_reason = reason
    dispense.version += 1
    dispense.updated_at = utcnow()

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="DISPENSE_REJECT",
            resource_type="dispense",
            resource_id=str(dispense.id),
            trace_id=trace_id,
            details={
                "from_status": "PENDING_APPROVAL",
                "to_status": "REJECTED",
                "reason": reason,
                "version": dispense.version,
            },
        )
    )
    await db.flush()
    return await load_dispense_out(db, dispense.id)


async def void_dispense(
    db: AsyncSession,
    current_user: CurrentUser,
    dispense_id: UUID,
    reason: str | None,
    trace_id: str,
) -> DispenseOut:
    dispense = (
        await db.execute(
            select(Dispense).where(Dispense.id == dispense_id).with_for_update()
        )
    ).scalar_one_or_none()
    if dispense is None:
        raise NotFoundError(
            message="Dispense record not found.",
            error_code="DISPENSE_NOT_FOUND",
            details={"dispense_id": str(dispense_id)},
        )
    enforce_clinic_scope(current_user, dispense.clinic_id)

    old_status = dispense.status
    if old_status not in ("PENDING_APPROVAL", "DISPENSED"):
        raise ConflictError(
            message=f"Cannot void dispense from status '{old_status}'.",
            error_code="INVALID_STATE_TRANSITION",
            details={"current_status": old_status, "target_status": "VOIDED"},
        )

    stock_restored = False
    if (
        old_status == "DISPENSED"
        and dispense.aware_category_snapshot != "NO_ANTIBIOTIC"
        and dispense.batch_id is not None
        and dispense.qty_dispensed > 0
    ):
        restore_stmt = text(
            """
            UPDATE inventory_batches
            SET qty_remaining = qty_remaining + :qty,
                version = version + 1,
                updated_at = NOW()
            WHERE id = :batch_id
              AND clinic_id = :clinic_id
            RETURNING id
            """
        )
        restored = (
            await db.execute(
                restore_stmt,
                {
                    "qty": dispense.qty_dispensed,
                    "batch_id": dispense.batch_id,
                    "clinic_id": current_user.clinic_id,
                },
            )
        ).first()
        stock_restored = restored is not None

    dispense.status = "VOIDED"
    if reason is not None:
        dispense.decision_reason = reason
    dispense.version += 1
    dispense.updated_at = utcnow()

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="DISPENSE_VOID",
            resource_type="dispense",
            resource_id=str(dispense.id),
            trace_id=trace_id,
            details={
                "from_status": old_status,
                "to_status": "VOIDED",
                "stock_restored": stock_restored,
                "qty_restored": dispense.qty_dispensed if stock_restored else 0,
                "reason": reason,
                "version": dispense.version,
            },
        )
    )
    await db.flush()
    return await load_dispense_out(db, dispense.id)
