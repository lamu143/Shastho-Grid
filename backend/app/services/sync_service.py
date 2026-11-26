from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Literal, cast
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationAppError,
)
from app.core.security import CurrentUser, enforce_clinic_scope
from app.db.models import (
    AntibioticCatalog,
    AuditLog,
    AwareGuideline,
    ConflictResolutionEvent,
    Dispense,
    InventoryBatch,
    Patient,
    SyncMutationLog,
)
from app.schemas.admin import AntibioticCatalogOut, GuidelineOut
from app.schemas.inventory import BatchOut
from app.schemas.patients import PatientCreate, PatientOut, PatientPatch
from app.schemas.sync import (
    ConflictEventOut,
    ConflictResolveIn,
    ConflictResolveOut,
    SyncBootstrapOut,
    SyncMutationIn,
    SyncMutationOut,
)
from app.services.analytics_service import get_stewardship_analytics
from app.services.dispense_service import (
    list_dispenses,
    load_dispense_out,
    serialize_dispense,
)
from app.solver.aware_cpsat import (
    AntibioticSpec,
    BatchSpec,
    GuidelineSpec,
    OptimizeRequestSpec,
    PatientClinicalProfile,
    Sex,
    solve_aware_regimen,
)


def utcnow() -> datetime:
    return datetime.now(UTC)


def build_batch_out(
    batch: InventoryBatch,
    abx: AntibioticCatalog,
    today: date | None = None,
) -> BatchOut:
    ref_today = today or date.today()
    days_to_expiry = (batch.expiry_date - ref_today).days
    aware_cat = cast(Literal["ACCESS", "WATCH", "RESERVE"], abx.aware_category)
    return BatchOut(
        id=batch.id,
        clinic_id=batch.clinic_id,
        antibiotic_id=batch.antibiotic_id,
        drug_code=abx.drug_code,
        generic_name=abx.generic_name,
        generic_name_bn=abx.generic_name_bn,
        drug_class=abx.drug_class,
        aware_category=aware_cat,
        aware_tier_cost=abx.aware_tier_cost,
        pregnancy_contraindicated=abx.pregnancy_contraindicated,
        renal_contraindicated_egfr_lt=(
            float(abx.renal_contraindicated_egfr_lt)
            if abx.renal_contraindicated_egfr_lt is not None
            else None
        ),
        min_age_years=abx.min_age_years,
        dose_regimen_en=abx.dose_regimen_en,
        dose_regimen_bn=abx.dose_regimen_bn,
        lot_number=batch.lot_number,
        qty_initial=batch.qty_initial,
        qty_remaining=batch.qty_remaining,
        expiry_date=batch.expiry_date,
        days_to_expiry=days_to_expiry,
        unit=batch.unit,
        version=batch.version,
        updated_at=batch.updated_at,
        antibiotic_code=abx.drug_code,
        antibiotic_name=abx.generic_name,
        aware_tier=aware_cat,
        batch_number=batch.lot_number,
    )


def serialize_conflict(event: ConflictResolutionEvent) -> ConflictEventOut:
    status = cast(
        Literal["OPEN", "RESOLVED_SERVER", "RESOLVED_CLIENT", "RESOLVED_MERGED"],
        event.resolution_status,
    )
    entity_type = cast(Literal["PATIENT", "DISPENSE", "INVENTORY"], event.entity_type)
    return ConflictEventOut(
        id=event.id,
        clinic_id=event.clinic_id,
        mutation_id=event.mutation_log_id,
        entity_type=entity_type,
        entity_id=event.entity_id,
        server_snapshot=dict(event.server_snapshot or {}),
        client_snapshot=dict(event.client_snapshot or {}),
        cpsat_verdict=dict(event.cpsat_verdict or {}),
        status=status,
        resolution_status=status,
        resolution_notes=event.resolution_notes,
        resolved_by=event.resolved_by,
        created_at=event.created_at,
        resolved_at=event.resolved_at,
    )


def _merge_allergies(first: list[str] | None, second: list[str] | None) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for source in (first or [], second or []):
        for item in source:
            cleaned = str(item).strip()
            if cleaned and cleaned.upper() not in seen:
                seen.add(cleaned.upper())
                merged.append(cleaned)
    return merged


def _patient_snapshot(patient: Patient, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    snap = cast(dict[str, Any], jsonable_encoder(PatientOut.model_validate(patient)))
    if extra:
        snap.update(jsonable_encoder(extra))
    return snap


async def _run_cpsat_for_clinic(
    db: AsyncSession,
    clinic_id: UUID,
    profile: PatientClinicalProfile,
    guideline_row: AwareGuideline | None,
    forced_drug_code: str | None = None,
    severity: Literal["MILD", "MODERATE", "SEVERE"] = "MODERATE",
) -> dict[str, Any]:
    if guideline_row is None:
        guideline_row = (
            await db.execute(
                select(AwareGuideline).where(
                    AwareGuideline.syndrome_code == "UNCOMPLICATED_UTI"
                )
            )
        ).scalar_one_or_none()
    if guideline_row is None:
        guideline_row = (
            await db.execute(
                select(AwareGuideline).order_by(AwareGuideline.syndrome_code.asc()).limit(1)
            )
        ).scalar_one_or_none()

    if guideline_row is None:
        return {
            "solver_status": "INFEASIBLE",
            "aware_category": "NO_ANTIBIOTIC",
            "recommended_drug_code": None,
            "recommended_batch_id": None,
            "mus_conflicts": [],
            "safe_relaxations": [],
        }

    catalog_rows = (
        await db.execute(
            select(AntibioticCatalog)
            .where(AntibioticCatalog.is_active.is_(True))
            .order_by(AntibioticCatalog.aware_tier_cost.asc(), AntibioticCatalog.drug_code.asc())
        )
    ).scalars().all()
    catalog_by_id = {row.id: row for row in catalog_rows}

    batch_rows = (
        await db.execute(
            select(InventoryBatch)
            .where(InventoryBatch.clinic_id == clinic_id)
            .order_by(InventoryBatch.expiry_date.asc(), InventoryBatch.lot_number.asc())
        )
    ).scalars().all()

    catalog_specs = [
        AntibioticSpec(
            id=row.id,
            drug_code=row.drug_code,
            generic_name=row.generic_name,
            generic_name_bn=row.generic_name_bn,
            drug_class=row.drug_class,
            aware_category=cast(Literal["ACCESS", "WATCH", "RESERVE"], row.aware_category),
            aware_tier_cost=row.aware_tier_cost,
            pregnancy_contraindicated=row.pregnancy_contraindicated,
            renal_contraindicated_egfr_lt=(
                float(row.renal_contraindicated_egfr_lt)
                if row.renal_contraindicated_egfr_lt is not None
                else None
            ),
            min_age_years=row.min_age_years,
            dose_regimen_en=row.dose_regimen_en,
            dose_regimen_bn=row.dose_regimen_bn,
            is_active=row.is_active,
        )
        for row in catalog_rows
    ]

    batch_specs: list[BatchSpec] = []
    for b in batch_rows:
        abx = catalog_by_id.get(b.antibiotic_id)
        if abx is None:
            continue
        batch_specs.append(
            BatchSpec(
                id=b.id,
                drug_code=abx.drug_code,
                lot_number=b.lot_number,
                qty_remaining=b.qty_remaining,
                expiry_date=b.expiry_date,
                unit=b.unit,
                antibiotic_id=b.antibiotic_id,
                clinic_id=b.clinic_id,
                qty_initial=b.qty_initial,
                version=b.version,
            )
        )

    guideline_spec = GuidelineSpec(
        syndrome_code=guideline_row.syndrome_code,
        viral_no_antibiotic_if_mild=guideline_row.viral_no_antibiotic_if_mild,
        first_line_drug_codes=list(guideline_row.first_line_drug_codes or []),
        second_line_drug_codes=list(guideline_row.second_line_drug_codes or []),
        default_duration_days=guideline_row.default_duration_days,
    )

    spec = OptimizeRequestSpec(
        patient=profile,
        guideline=guideline_spec,
        severity=severity,
        catalog=catalog_specs,
        batches=batch_specs,
        required_qty=1,
        reference_date=date.today(),
        forced_drug_code=forced_drug_code,
        language="en",
    )
    return solve_aware_regimen(spec).to_cpsat_verdict()


async def _find_recent_patient_dispense_context(
    db: AsyncSession,
    clinic_id: UUID,
    patient_id: UUID,
) -> tuple[str | None, AwareGuideline | None]:
    status_rank = case(
        (Dispense.status == "DISPENSED", 0),
        (Dispense.status == "PENDING_APPROVAL", 1),
        else_=2,
    )
    stmt = (
        select(Dispense, AntibioticCatalog, AwareGuideline)
        .outerjoin(AntibioticCatalog, Dispense.antibiotic_id == AntibioticCatalog.id)
        .outerjoin(AwareGuideline, Dispense.guideline_id == AwareGuideline.id)
        .where(
            Dispense.clinic_id == clinic_id,
            Dispense.patient_id == patient_id,
            Dispense.status.in_(["DISPENSED", "PENDING_APPROVAL", "DRAFT"]),
        )
        .order_by(status_rank.asc(), Dispense.created_at.desc())
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return None, None
    dispense, abx, guideline = row
    drug_code = abx.drug_code if abx is not None else None
    if drug_code is None and isinstance(dispense.solver_verdict, dict):
        raw = dispense.solver_verdict.get("drug_code")
        drug_code = str(raw) if raw else None
    if guideline is None and isinstance(dispense.solver_verdict, dict):
        syn = dispense.solver_verdict.get("syndrome_code")
        if syn:
            guideline = (
                await db.execute(
                    select(AwareGuideline).where(AwareGuideline.syndrome_code == str(syn))
                )
            ).scalar_one_or_none()
    return drug_code, guideline


async def get_bootstrap(db: AsyncSession, clinic_id: UUID) -> SyncBootstrapOut:
    patients = (
        await db.execute(
            select(Patient)
            .where(Patient.clinic_id == clinic_id)
            .order_by(Patient.created_at.desc(), Patient.mrn.asc())
        )
    ).scalars().all()

    today = date.today()
    batch_rows = (
        await db.execute(
            select(InventoryBatch, AntibioticCatalog)
            .join(AntibioticCatalog, InventoryBatch.antibiotic_id == AntibioticCatalog.id)
            .where(InventoryBatch.clinic_id == clinic_id)
            .order_by(InventoryBatch.expiry_date.asc(), InventoryBatch.lot_number.asc())
        )
    ).all()

    guidelines = (
        await db.execute(
            select(AwareGuideline).order_by(AwareGuideline.syndrome_code.asc())
        )
    ).scalars().all()

    catalog = (
        await db.execute(
            select(AntibioticCatalog).order_by(
                AntibioticCatalog.aware_tier_cost.asc(),
                AntibioticCatalog.drug_code.asc(),
            )
        )
    ).scalars().all()

    dispenses = await list_dispenses(db=db, clinic_id=clinic_id)

    conflict_rows = (
        await db.execute(
            select(ConflictResolutionEvent)
            .where(ConflictResolutionEvent.clinic_id == clinic_id)
            .order_by(ConflictResolutionEvent.created_at.desc())
        )
    ).scalars().all()

    analytics = await get_stewardship_analytics(db=db, clinic_id=clinic_id)

    return SyncBootstrapOut(
        patients=[PatientOut.model_validate(p) for p in patients],
        batches=[build_batch_out(b, abx, today=today) for b, abx in batch_rows],
        guidelines=[GuidelineOut.model_validate(g) for g in guidelines],
        catalog=[AntibioticCatalogOut.model_validate(c) for c in catalog],
        dispenses=dispenses,
        conflicts=[serialize_conflict(c) for c in conflict_rows],
        analytics=analytics,
    )


async def list_conflicts(db: AsyncSession, clinic_id: UUID) -> list[ConflictEventOut]:
    rows = (
        await db.execute(
            select(ConflictResolutionEvent)
            .where(ConflictResolutionEvent.clinic_id == clinic_id)
            .order_by(ConflictResolutionEvent.created_at.desc())
        )
    ).scalars().all()
    return [serialize_conflict(row) for row in rows]


def _raise_sync_conflict_409(
    conflict_id: UUID,
    server_snapshot: dict[str, Any],
    client_snapshot: dict[str, Any],
    cpsat_verdict: dict[str, Any],
) -> None:
    payload = {
        "conflict_id": str(conflict_id),
        "server_snapshot": server_snapshot,
        "client_snapshot": client_snapshot,
        "cpsat_verdict": cpsat_verdict,
    }
    raise ConflictError(
        message="Version skew detected; CP-SAT safety review required.",
        error_code="SYNC_VERSION_CONFLICT",
        details=payload,
        extra_top_level=payload,
    )


async def _get_entity_snapshot(
    db: AsyncSession,
    clinic_id: UUID,
    entity_type: str,
    entity_id: UUID,
) -> tuple[int, dict[str, Any]]:
    if entity_type == "PATIENT":
        patient = (
            await db.execute(
                select(Patient).where(Patient.id == entity_id, Patient.clinic_id == clinic_id)
            )
        ).scalar_one_or_none()
        if patient is not None:
            return patient.version, _patient_snapshot(patient)
    elif entity_type == "DISPENSE":
        dispense = (
            await db.execute(
                select(Dispense).where(Dispense.id == entity_id, Dispense.clinic_id == clinic_id)
            )
        ).scalar_one_or_none()
        if dispense is not None:
            out = await load_dispense_out(db, dispense.id)
            return dispense.version, cast(dict[str, Any], jsonable_encoder(out))
    elif entity_type == "INVENTORY":
        row = (
            await db.execute(
                select(InventoryBatch, AntibioticCatalog)
                .join(AntibioticCatalog, InventoryBatch.antibiotic_id == AntibioticCatalog.id)
                .where(InventoryBatch.id == entity_id, InventoryBatch.clinic_id == clinic_id)
            )
        ).first()
        if row is not None:
            batch, abx = row
            return batch.version, cast(dict[str, Any], jsonable_encoder(build_batch_out(batch, abx)))
    return 1, {"id": str(entity_id)}


async def process_mutation(
    db: AsyncSession,
    current_user: CurrentUser,
    req: SyncMutationIn,
    trace_id: str,
) -> SyncMutationOut:
    existing_mut = (
        await db.execute(
            select(SyncMutationLog).where(
                SyncMutationLog.clinic_id == current_user.clinic_id,
                SyncMutationLog.client_mutation_id == req.client_mutation_id,
            )
        )
    ).scalar_one_or_none()

    if existing_mut is not None:
        if existing_mut.status == "CONFLICT":
            existing_event = (
                await db.execute(
                    select(ConflictResolutionEvent).where(
                        ConflictResolutionEvent.mutation_log_id == existing_mut.id
                    )
                )
            ).scalar_one_or_none()
            if existing_event is not None:
                _raise_sync_conflict_409(
                    conflict_id=existing_event.id,
                    server_snapshot=dict(existing_event.server_snapshot or {}),
                    client_snapshot=dict(existing_event.client_snapshot or {}),
                    cpsat_verdict=dict(existing_event.cpsat_verdict or {}),
                )
        version, snap = await _get_entity_snapshot(
            db, current_user.clinic_id, req.entity_type, req.entity_id
        )
        return SyncMutationOut(
            status="SYNCED",
            client_mutation_id=req.client_mutation_id,
            entity_type=req.entity_type,
            entity_id=req.entity_id,
            new_version=version,
            entity_snapshot=snap,
        )

    if req.entity_type == "PATIENT":
        return await _process_patient_mutation(db, current_user, req, trace_id)
    if req.entity_type == "DISPENSE":
        return await _process_dispense_mutation(db, current_user, req, trace_id)
    return await _process_inventory_mutation(db, current_user, req, trace_id)


async def _process_patient_mutation(
    db: AsyncSession,
    current_user: CurrentUser,
    req: SyncMutationIn,
    trace_id: str,
) -> SyncMutationOut:
    patient = (
        await db.execute(select(Patient).where(Patient.id == req.entity_id))
    ).scalar_one_or_none()

    if patient is None:
        if req.base_version != 0:
            raise NotFoundError(
                message="Patient not found for sync mutation.",
                error_code="PATIENT_NOT_FOUND",
                details={"entity_id": str(req.entity_id), "base_version": req.base_version},
            )
        try:
            create_model = PatientCreate(
                id=req.entity_id,
                mrn=str(req.payload.get("mrn") or f"OFF-{str(req.entity_id)[:8].upper()}"),
                full_name=str(req.payload.get("full_name") or ""),
                age_years=int(req.payload["age_years"]),
                weight_kg=float(req.payload["weight_kg"]),
                sex=cast(Literal["M", "F", "O"], req.payload["sex"]),
                is_pregnant=bool(req.payload.get("is_pregnant", False)),
                egfr=(
                    float(req.payload["egfr"])
                    if req.payload.get("egfr") is not None
                    else None
                ),
                allergies=list(req.payload.get("allergies") or []),
            )
        except Exception as exc:
            raise ValidationAppError(
                message=f"Invalid offline patient creation payload: {exc}",
                error_code="VALIDATION_ERROR",
                details={"entity_id": str(req.entity_id)},
            ) from exc

        dup_mrn = (
            await db.execute(
                select(Patient.id).where(
                    Patient.clinic_id == current_user.clinic_id,
                    Patient.mrn == create_model.mrn,
                )
            )
        ).scalar_one_or_none()
        if dup_mrn is not None:
            raise ConflictError(
                message="A patient with this MRN already exists in the clinic.",
                error_code="PATIENT_MRN_EXISTS",
                details={"mrn": create_model.mrn},
            )

        patient = Patient(
            id=req.entity_id,
            clinic_id=current_user.clinic_id,
            mrn=create_model.mrn,
            full_name=create_model.full_name,
            age_years=create_model.age_years,
            weight_kg=Decimal(str(create_model.weight_kg)),
            sex=create_model.sex,
            is_pregnant=create_model.is_pregnant,
            egfr=Decimal(str(create_model.egfr)) if create_model.egfr is not None else None,
            allergies=list(create_model.allergies),
            version=1,
        )
        db.add(patient)
        db.add(
            SyncMutationLog(
                clinic_id=current_user.clinic_id,
                user_id=current_user.id,
                client_mutation_id=req.client_mutation_id,
                entity_type="PATIENT",
                entity_id=patient.id,
                base_version=0,
                server_version_at_receipt=0,
                payload=req.payload,
                status="APPLIED",
            )
        )
        db.add(
            AuditLog(
                clinic_id=current_user.clinic_id,
                actor_user_id=current_user.id,
                actor_role=current_user.role,
                action="SYNC_PATIENT_CREATE",
                resource_type="patient",
                resource_id=str(patient.id),
                trace_id=trace_id,
                details={"client_mutation_id": str(req.client_mutation_id), "version": 1},
            )
        )
        await db.flush()
        return SyncMutationOut(
            status="SYNCED",
            client_mutation_id=req.client_mutation_id,
            entity_type="PATIENT",
            entity_id=patient.id,
            new_version=1,
            entity_snapshot=_patient_snapshot(patient),
        )

    enforce_clinic_scope(current_user, patient.clinic_id)

    if req.base_version == patient.version:
        patch_data = {
            k: v
            for k, v in req.payload.items()
            if k in {"mrn", "full_name", "age_years", "weight_kg", "sex", "is_pregnant", "egfr", "allergies"}
        }
        try:
            patch = PatientPatch(**patch_data)
        except Exception as exc:
            raise ValidationAppError(
                message=f"Invalid patient update payload: {exc}",
                error_code="VALIDATION_ERROR",
                details={"entity_id": str(patient.id)},
            ) from exc

        new_sex = patch.sex if patch.sex is not None else patient.sex
        new_pregnant = (
            patch.is_pregnant if patch.is_pregnant is not None else patient.is_pregnant
        )
        if new_pregnant and new_sex != "F":
            raise ValidationAppError(
                message="is_pregnant cannot be true when sex is not 'F'.",
                error_code="VALIDATION_ERROR",
                details={"sex": new_sex, "is_pregnant": new_pregnant},
            )

        if patch.mrn is not None:
            patient.mrn = patch.mrn
        if patch.full_name is not None:
            patient.full_name = patch.full_name
        if patch.age_years is not None:
            patient.age_years = patch.age_years
        if patch.weight_kg is not None:
            patient.weight_kg = Decimal(str(patch.weight_kg))
        if patch.sex is not None:
            patient.sex = patch.sex
        if patch.is_pregnant is not None:
            patient.is_pregnant = patch.is_pregnant
        if "egfr" in req.payload:
            patient.egfr = Decimal(str(patch.egfr)) if patch.egfr is not None else None
        if patch.allergies is not None:
            patient.allergies = list(patch.allergies)

        patient.version += 1
        patient.updated_at = utcnow()

        db.add(
            SyncMutationLog(
                clinic_id=current_user.clinic_id,
                user_id=current_user.id,
                client_mutation_id=req.client_mutation_id,
                entity_type="PATIENT",
                entity_id=patient.id,
                base_version=req.base_version,
                server_version_at_receipt=req.base_version,
                payload=req.payload,
                status="APPLIED",
            )
        )
        db.add(
            AuditLog(
                clinic_id=current_user.clinic_id,
                actor_user_id=current_user.id,
                actor_role=current_user.role,
                action="SYNC_PATIENT_UPDATE",
                resource_type="patient",
                resource_id=str(patient.id),
                trace_id=trace_id,
                details={
                    "client_mutation_id": str(req.client_mutation_id),
                    "new_version": patient.version,
                },
            )
        )
        await db.flush()
        return SyncMutationOut(
            status="SYNCED",
            client_mutation_id=req.client_mutation_id,
            entity_type="PATIENT",
            entity_id=patient.id,
            new_version=patient.version,
            entity_snapshot=_patient_snapshot(patient),
        )

    # Version skew detected: NEVER apply LWW; run CP-SAT on merged state and return 409
    recent_drug_code, recent_guideline = await _find_recent_patient_dispense_context(
        db=db,
        clinic_id=current_user.clinic_id,
        patient_id=patient.id,
    )
    requested_abx_raw = req.payload.get("requested_antibiotic")
    requested_abx = (
        str(requested_abx_raw).strip().upper()
        if isinstance(requested_abx_raw, str) and requested_abx_raw.strip()
        else None
    )
    forced_drug_code = requested_abx or recent_drug_code

    payload_syndrome = req.payload.get("syndrome_code")
    guideline_row = recent_guideline
    if isinstance(payload_syndrome, str) and payload_syndrome.strip():
        found_g = (
            await db.execute(
                select(AwareGuideline).where(
                    AwareGuideline.syndrome_code == payload_syndrome.strip().upper()
                )
            )
        ).scalar_one_or_none()
        if found_g is not None:
            guideline_row = found_g

    client_allergies = (
        [str(x).strip() for x in req.payload["allergies"] if str(x).strip()]
        if isinstance(req.payload.get("allergies"), list)
        else list(patient.allergies or [])
    )
    merged_allergies = _merge_allergies(patient.allergies, client_allergies)

    merged_age = int(req.payload.get("age_years", patient.age_years))
    merged_weight = float(req.payload.get("weight_kg", float(patient.weight_kg)))
    merged_sex_raw = str(req.payload.get("sex", patient.sex))
    merged_sex = cast(Sex, merged_sex_raw if merged_sex_raw in ("M", "F", "O") else patient.sex)
    merged_pregnant = bool(req.payload.get("is_pregnant", patient.is_pregnant))
    if merged_pregnant and merged_sex != "F":
        merged_pregnant = False
    merged_egfr = (
        float(req.payload["egfr"])
        if "egfr" in req.payload and req.payload["egfr"] is not None
        else (None if "egfr" in req.payload else (float(patient.egfr) if patient.egfr is not None else None))
    )

    merged_profile = PatientClinicalProfile(
        age_years=merged_age,
        weight_kg=merged_weight if merged_weight > 0 else float(patient.weight_kg),
        sex=merged_sex,
        is_pregnant=merged_pregnant,
        egfr=merged_egfr,
        allergies=merged_allergies,
    )

    cpsat_verdict = await _run_cpsat_for_clinic(
        db=db,
        clinic_id=current_user.clinic_id,
        profile=merged_profile,
        guideline_row=guideline_row,
        forced_drug_code=forced_drug_code,
    )

    server_snapshot = _patient_snapshot(
        patient,
        extra={"recent_dispense_drug": recent_drug_code} if recent_drug_code else None,
    )
    client_snapshot = _patient_snapshot(
        patient,
        extra={
            **{
                k: v
                for k, v in req.payload.items()
                if k in {"mrn", "full_name", "age_years", "weight_kg", "sex", "is_pregnant", "egfr"}
            },
            "allergies": merged_allergies,
            "base_version": req.base_version,
            **({"requested_antibiotic": requested_abx} if requested_abx else {}),
        },
    )

    mut_log = SyncMutationLog(
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
        client_mutation_id=req.client_mutation_id,
        entity_type="PATIENT",
        entity_id=patient.id,
        base_version=req.base_version,
        server_version_at_receipt=patient.version,
        payload=req.payload,
        status="CONFLICT",
    )
    db.add(mut_log)
    await db.flush()

    conflict_event = ConflictResolutionEvent(
        clinic_id=current_user.clinic_id,
        mutation_log_id=mut_log.id,
        entity_type="PATIENT",
        entity_id=patient.id,
        server_snapshot=server_snapshot,
        client_snapshot=client_snapshot,
        cpsat_verdict=cpsat_verdict,
        resolution_status="OPEN",
    )
    db.add(conflict_event)
    await db.flush()

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="SYNC_CONFLICT_DETECTED",
            resource_type="conflict",
            resource_id=str(conflict_event.id),
            trace_id=trace_id,
            details={
                "entity_type": "PATIENT",
                "entity_id": str(patient.id),
                "base_version": req.base_version,
                "server_version": patient.version,
                "solver_status": cpsat_verdict.get("solver_status"),
            },
        )
    )
    await db.commit()

    _raise_sync_conflict_409(
        conflict_id=conflict_event.id,
        server_snapshot=server_snapshot,
        client_snapshot=client_snapshot,
        cpsat_verdict=cpsat_verdict,
    )
    raise AssertionError("unreachable")


async def _process_dispense_mutation(
    db: AsyncSession,
    current_user: CurrentUser,
    req: SyncMutationIn,
    trace_id: str,
) -> SyncMutationOut:
    dispense = (
        await db.execute(select(Dispense).where(Dispense.id == req.entity_id))
    ).scalar_one_or_none()

    if dispense is None:
        if req.base_version != 0:
            raise NotFoundError(
                message="Dispense record not found for sync mutation.",
                error_code="DISPENSE_NOT_FOUND",
                details={"entity_id": str(req.entity_id), "base_version": req.base_version},
            )
        raw_patient_id = req.payload.get("patient_id")
        if not raw_patient_id:
            raise ValidationAppError(
                message="patient_id is required to create a dispense via sync.",
                error_code="VALIDATION_ERROR",
                details={"entity_id": str(req.entity_id)},
            )
        patient_id = UUID(str(raw_patient_id))
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

        batch: InventoryBatch | None = None
        if req.payload.get("batch_id"):
            batch_id = UUID(str(req.payload["batch_id"]))
            batch = (
                await db.execute(select(InventoryBatch).where(InventoryBatch.id == batch_id))
            ).scalar_one_or_none()
            if batch is None:
                raise NotFoundError(
                    message="Inventory batch not found.",
                    error_code="BATCH_NOT_FOUND",
                    details={"batch_id": str(batch_id)},
                )
            enforce_clinic_scope(current_user, batch.clinic_id)

        abx: AntibioticCatalog | None = None
        abx_id_raw = req.payload.get("antibiotic_id") or (batch.antibiotic_id if batch else None)
        if abx_id_raw:
            abx = (
                await db.execute(
                    select(AntibioticCatalog).where(AntibioticCatalog.id == UUID(str(abx_id_raw)))
                )
            ).scalar_one_or_none()

        guideline: AwareGuideline | None = None
        syndrome_code = str(req.payload.get("syndrome_code") or "").strip().upper()
        if syndrome_code:
            guideline = (
                await db.execute(
                    select(AwareGuideline).where(AwareGuideline.syndrome_code == syndrome_code)
                )
            ).scalar_one_or_none()

        aware_cat = str(
            req.payload.get("aware_category")
            or req.payload.get("aware_category_snapshot")
            or (abx.aware_category if abx else "NO_ANTIBIOTIC")
        )
        qty = int(req.payload.get("qty_dispensed", req.payload.get("qty", 0 if aware_cat == "NO_ANTIBIOTIC" else 1)))
        days_supply = int(req.payload.get("days_supply", 5))
        notes = req.payload.get("decision_reason", req.payload.get("notes"))
        verdict = dict(req.payload.get("solver_verdict") or {})
        verdict.setdefault("syndrome_code", guideline.syndrome_code if guideline else syndrome_code)
        if abx is not None:
            verdict.setdefault("drug_code", abx.drug_code)

        dispense = Dispense(
            id=req.entity_id,
            clinic_id=current_user.clinic_id,
            patient_id=patient.id,
            guideline_id=guideline.id if guideline else None,
            antibiotic_id=abx.id if abx else None,
            batch_id=batch.id if batch else None,
            prescriber_id=current_user.id,
            status="DRAFT",
            aware_category_snapshot=aware_cat,
            qty_dispensed=qty,
            days_supply=days_supply,
            solver_status=str(req.payload.get("solver_status") or ("NO_ANTIBIOTIC" if aware_cat == "NO_ANTIBIOTIC" else "OFFLINE_FALLBACK")),
            solver_verdict=verdict,
            decision_reason=str(notes) if notes is not None else None,
            client_mutation_id=req.client_mutation_id,
            version=1,
        )
        db.add(dispense)
        db.add(
            SyncMutationLog(
                clinic_id=current_user.clinic_id,
                user_id=current_user.id,
                client_mutation_id=req.client_mutation_id,
                entity_type="DISPENSE",
                entity_id=dispense.id,
                base_version=0,
                server_version_at_receipt=0,
                payload=req.payload,
                status="APPLIED",
            )
        )
        db.add(
            AuditLog(
                clinic_id=current_user.clinic_id,
                actor_user_id=current_user.id,
                actor_role=current_user.role,
                action="SYNC_DISPENSE_CREATE",
                resource_type="dispense",
                resource_id=str(dispense.id),
                trace_id=trace_id,
                details={"client_mutation_id": str(req.client_mutation_id)},
            )
        )
        await db.flush()
        snap = cast(dict[str, Any], jsonable_encoder(serialize_dispense(dispense, abx, guideline, patient, batch)))
        return SyncMutationOut(
            status="SYNCED",
            client_mutation_id=req.client_mutation_id,
            entity_type="DISPENSE",
            entity_id=dispense.id,
            new_version=1,
            entity_snapshot=snap,
        )

    enforce_clinic_scope(current_user, dispense.clinic_id)

    if req.base_version == dispense.version:
        if "notes" in req.payload or "decision_reason" in req.payload:
            raw_reason = req.payload.get("decision_reason", req.payload.get("notes"))
            dispense.decision_reason = str(raw_reason) if raw_reason is not None else None
        if "days_supply" in req.payload and req.payload["days_supply"] is not None:
            dispense.days_supply = int(req.payload["days_supply"])
        dispense.version += 1
        dispense.updated_at = utcnow()
        db.add(
            SyncMutationLog(
                clinic_id=current_user.clinic_id,
                user_id=current_user.id,
                client_mutation_id=req.client_mutation_id,
                entity_type="DISPENSE",
                entity_id=dispense.id,
                base_version=req.base_version,
                server_version_at_receipt=req.base_version,
                payload=req.payload,
                status="APPLIED",
            )
        )
        await db.flush()
        out = await load_dispense_out(db, dispense.id)
        return SyncMutationOut(
            status="SYNCED",
            client_mutation_id=req.client_mutation_id,
            entity_type="DISPENSE",
            entity_id=dispense.id,
            new_version=dispense.version,
            entity_snapshot=cast(dict[str, Any], jsonable_encoder(out)),
        )

    patient = (
        await db.execute(select(Patient).where(Patient.id == dispense.patient_id))
    ).scalar_one()
    abx = (
        await db.execute(select(AntibioticCatalog).where(AntibioticCatalog.id == dispense.antibiotic_id))
    ).scalar_one_or_none() if dispense.antibiotic_id else None
    guideline = (
        await db.execute(select(AwareGuideline).where(AwareGuideline.id == dispense.guideline_id))
    ).scalar_one_or_none() if dispense.guideline_id else None

    profile = PatientClinicalProfile(
        age_years=patient.age_years,
        weight_kg=float(patient.weight_kg),
        sex=cast(Sex, patient.sex),
        is_pregnant=patient.is_pregnant,
        egfr=float(patient.egfr) if patient.egfr is not None else None,
        allergies=list(patient.allergies or []),
    )
    cpsat_verdict = await _run_cpsat_for_clinic(
        db=db,
        clinic_id=current_user.clinic_id,
        profile=profile,
        guideline_row=guideline,
        forced_drug_code=abx.drug_code if abx else None,
    )
    server_out = await load_dispense_out(db, dispense.id)
    server_snapshot = cast(dict[str, Any], jsonable_encoder(server_out))
    client_snapshot = {**server_snapshot, **jsonable_encoder(req.payload), "base_version": req.base_version}

    mut_log = SyncMutationLog(
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
        client_mutation_id=req.client_mutation_id,
        entity_type="DISPENSE",
        entity_id=dispense.id,
        base_version=req.base_version,
        server_version_at_receipt=dispense.version,
        payload=req.payload,
        status="CONFLICT",
    )
    db.add(mut_log)
    await db.flush()

    conflict_event = ConflictResolutionEvent(
        clinic_id=current_user.clinic_id,
        mutation_log_id=mut_log.id,
        entity_type="DISPENSE",
        entity_id=dispense.id,
        server_snapshot=server_snapshot,
        client_snapshot=client_snapshot,
        cpsat_verdict=cpsat_verdict,
        resolution_status="OPEN",
    )
    db.add(conflict_event)
    await db.flush()
    await db.commit()

    _raise_sync_conflict_409(
        conflict_id=conflict_event.id,
        server_snapshot=server_snapshot,
        client_snapshot=client_snapshot,
        cpsat_verdict=cpsat_verdict,
    )
    raise AssertionError("unreachable")


async def _process_inventory_mutation(
    db: AsyncSession,
    current_user: CurrentUser,
    req: SyncMutationIn,
    trace_id: str,
) -> SyncMutationOut:
    row = (
        await db.execute(
            select(InventoryBatch, AntibioticCatalog)
            .join(AntibioticCatalog, InventoryBatch.antibiotic_id == AntibioticCatalog.id)
            .where(InventoryBatch.id == req.entity_id)
        )
    ).first()
    if row is None:
        raise NotFoundError(
            message="Inventory batch not found.",
            error_code="BATCH_NOT_FOUND",
            details={"entity_id": str(req.entity_id)},
        )
    batch, abx = row
    enforce_clinic_scope(current_user, batch.clinic_id)

    if req.base_version == batch.version:
        if current_user.role not in ("pharmacist", "admin"):
            raise ForbiddenError(
                message="Only pharmacist or admin may update inventory via sync.",
                error_code="FORBIDDEN_ROLE",
                details={"role": current_user.role},
            )
        if "qty_remaining" in req.payload and req.payload["qty_remaining"] is not None:
            new_qty = int(req.payload["qty_remaining"])
            if new_qty < 0 or new_qty > batch.qty_initial:
                raise ValidationAppError(
                    message="qty_remaining must be between 0 and qty_initial.",
                    error_code="VALIDATION_ERROR",
                )
            batch.qty_remaining = new_qty
        if req.payload.get("unit"):
            batch.unit = str(req.payload["unit"]).strip()
        batch.version += 1
        batch.updated_at = utcnow()
        db.add(
            SyncMutationLog(
                clinic_id=current_user.clinic_id,
                user_id=current_user.id,
                client_mutation_id=req.client_mutation_id,
                entity_type="INVENTORY",
                entity_id=batch.id,
                base_version=req.base_version,
                server_version_at_receipt=req.base_version,
                payload=req.payload,
                status="APPLIED",
            )
        )
        await db.flush()
        return SyncMutationOut(
            status="SYNCED",
            client_mutation_id=req.client_mutation_id,
            entity_type="INVENTORY",
            entity_id=batch.id,
            new_version=batch.version,
            entity_snapshot=cast(dict[str, Any], jsonable_encoder(build_batch_out(batch, abx))),
        )

    server_snapshot = cast(dict[str, Any], jsonable_encoder(build_batch_out(batch, abx)))
    client_snapshot = {**server_snapshot, **jsonable_encoder(req.payload), "base_version": req.base_version}
    cpsat_verdict = {
        "solver_status": "INFEASIBLE" if batch.qty_remaining <= 0 else "OPTIMAL",
        "aware_category": abx.aware_category,
        "recommended_drug_code": abx.drug_code if batch.qty_remaining > 0 else None,
        "recommended_batch_id": str(batch.id) if batch.qty_remaining > 0 else None,
        "mus_conflicts": [],
        "safe_relaxations": [],
    }
    mut_log = SyncMutationLog(
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
        client_mutation_id=req.client_mutation_id,
        entity_type="INVENTORY",
        entity_id=batch.id,
        base_version=req.base_version,
        server_version_at_receipt=batch.version,
        payload=req.payload,
        status="CONFLICT",
    )
    db.add(mut_log)
    await db.flush()

    conflict_event = ConflictResolutionEvent(
        clinic_id=current_user.clinic_id,
        mutation_log_id=mut_log.id,
        entity_type="INVENTORY",
        entity_id=batch.id,
        server_snapshot=server_snapshot,
        client_snapshot=client_snapshot,
        cpsat_verdict=cpsat_verdict,
        resolution_status="OPEN",
    )
    db.add(conflict_event)
    await db.flush()
    await db.commit()

    _raise_sync_conflict_409(
        conflict_id=conflict_event.id,
        server_snapshot=server_snapshot,
        client_snapshot=client_snapshot,
        cpsat_verdict=cpsat_verdict,
    )
    raise AssertionError("unreachable")


async def resolve_conflict(
    db: AsyncSession,
    current_user: CurrentUser,
    conflict_id: UUID,
    req: ConflictResolveIn,
    trace_id: str,
) -> ConflictResolveOut:
    conflict = (
        await db.execute(
            select(ConflictResolutionEvent)
            .where(ConflictResolutionEvent.id == conflict_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if conflict is None:
        raise NotFoundError(
            message="Conflict resolution event not found.",
            error_code="CONFLICT_NOT_FOUND",
            details={"conflict_id": str(conflict_id)},
        )
    enforce_clinic_scope(current_user, conflict.clinic_id)

    if conflict.resolution_status != "OPEN":
        raise ConflictError(
            message="Conflict has already been resolved.",
            error_code="CONFLICT_ALREADY_RESOLVED",
            details={
                "conflict_id": str(conflict.id),
                "current_status": conflict.resolution_status,
            },
        )

    prior_status = str((conflict.cpsat_verdict or {}).get("solver_status") or "")
    if (
        req.resolution == "RESOLVED_CLIENT"
        and prior_status == "INFEASIBLE"
        and current_user.role not in ("pharmacist", "admin")
    ):
        raise ForbiddenError(
            message="Pharmacist or admin approval is required for RESOLVED_CLIENT override on an infeasible CP-SAT verdict.",
            error_code="UNSAFE_CLIENT_OVERRIDE_FORBIDDEN",
            details={"conflict_id": str(conflict.id), "role": current_user.role},
        )

    entity_snapshot: dict[str, Any] = {}
    new_verdict: dict[str, Any] = dict(conflict.cpsat_verdict or {})

    if conflict.entity_type == "PATIENT":
        patient = (
            await db.execute(
                select(Patient).where(Patient.id == conflict.entity_id).with_for_update()
            )
        ).scalar_one_or_none()
        if patient is None:
            raise NotFoundError(
                message="Target patient not found.",
                error_code="PATIENT_NOT_FOUND",
                details={"patient_id": str(conflict.entity_id)},
            )

        if req.resolution == "RESOLVED_SERVER":
            patient.version += 1
            patient.updated_at = utcnow()
        else:
            base_snap = (
                dict(conflict.client_snapshot or {})
                if req.resolution == "RESOLVED_CLIENT"
                else {
                    **dict(conflict.server_snapshot or {}),
                    **dict(conflict.client_snapshot or {}),
                    **dict(req.merged_payload or {}),
                }
            )
            if req.resolution == "RESOLVED_MERGED":
                merged_allergies = _merge_allergies(
                    _merge_allergies(
                        (conflict.server_snapshot or {}).get("allergies"),
                        (conflict.client_snapshot or {}).get("allergies"),
                    ),
                    (req.merged_payload or {}).get("allergies"),
                )
            else:
                merged_allergies = _merge_allergies([], base_snap.get("allergies"))

            if "full_name" in base_snap and str(base_snap["full_name"]).strip():
                patient.full_name = str(base_snap["full_name"]).strip()
            if "age_years" in base_snap and base_snap["age_years"] is not None:
                patient.age_years = int(base_snap["age_years"])
            if "weight_kg" in base_snap and base_snap["weight_kg"] is not None:
                patient.weight_kg = Decimal(str(base_snap["weight_kg"]))
            if "sex" in base_snap and base_snap["sex"] in ("M", "F", "O"):
                patient.sex = str(base_snap["sex"])
            if "is_pregnant" in base_snap and base_snap["is_pregnant"] is not None:
                cand_preg = bool(base_snap["is_pregnant"])
                if not cand_preg or patient.sex == "F":
                    patient.is_pregnant = cand_preg
            if "egfr" in base_snap:
                patient.egfr = (
                    Decimal(str(base_snap["egfr"])) if base_snap["egfr"] is not None else None
                )
            patient.allergies = merged_allergies
            patient.version += 1
            patient.updated_at = utcnow()

        _, recent_guideline = await _find_recent_patient_dispense_context(
            db=db,
            clinic_id=current_user.clinic_id,
            patient_id=patient.id,
        )
        resolved_profile = PatientClinicalProfile(
            age_years=patient.age_years,
            weight_kg=float(patient.weight_kg),
            sex=cast(Sex, patient.sex),
            is_pregnant=patient.is_pregnant,
            egfr=float(patient.egfr) if patient.egfr is not None else None,
            allergies=list(patient.allergies or []),
        )
        new_verdict = await _run_cpsat_for_clinic(
            db=db,
            clinic_id=current_user.clinic_id,
            profile=resolved_profile,
            guideline_row=recent_guideline,
            forced_drug_code=None,
        )
        entity_snapshot = _patient_snapshot(patient)

    elif conflict.entity_type == "DISPENSE":
        dispense = (
            await db.execute(
                select(Dispense).where(Dispense.id == conflict.entity_id).with_for_update()
            )
        ).scalar_one_or_none()
        if dispense is None:
            raise NotFoundError(
                message="Target dispense not found.",
                error_code="DISPENSE_NOT_FOUND",
                details={"dispense_id": str(conflict.entity_id)},
            )
        if req.resolution != "RESOLVED_SERVER":
            merged = {
                **dict(conflict.client_snapshot or {}),
                **dict(req.merged_payload or {}),
            }
            if "notes" in merged or "decision_reason" in merged:
                raw_reason = merged.get("decision_reason", merged.get("notes"))
                dispense.decision_reason = str(raw_reason) if raw_reason is not None else None
        dispense.version += 1
        dispense.updated_at = utcnow()
        await db.flush()
        entity_snapshot = cast(
            dict[str, Any], jsonable_encoder(await load_dispense_out(db, dispense.id))
        )

    else:
        row = (
            await db.execute(
                select(InventoryBatch, AntibioticCatalog)
                .join(AntibioticCatalog, InventoryBatch.antibiotic_id == AntibioticCatalog.id)
                .where(InventoryBatch.id == conflict.entity_id)
                .with_for_update()
            )
        ).first()
        if row is None:
            raise NotFoundError(
                message="Target inventory batch not found.",
                error_code="BATCH_NOT_FOUND",
                details={"batch_id": str(conflict.entity_id)},
            )
        batch, abx = row
        if req.resolution != "RESOLVED_SERVER":
            merged = {
                **dict(conflict.client_snapshot or {}),
                **dict(req.merged_payload or {}),
            }
            if "qty_remaining" in merged and merged["qty_remaining"] is not None:
                cand_qty = int(merged["qty_remaining"])
                if 0 <= cand_qty <= batch.qty_initial:
                    batch.qty_remaining = cand_qty
        batch.version += 1
        batch.updated_at = utcnow()
        entity_snapshot = cast(dict[str, Any], jsonable_encoder(build_batch_out(batch, abx)))

    now = utcnow()
    conflict.resolution_status = req.resolution
    conflict.resolved_by = current_user.id
    conflict.resolution_notes = req.notes
    conflict.cpsat_verdict = new_verdict
    conflict.resolved_at = now

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="SYNC_CONFLICT_RESOLVE",
            resource_type="conflict",
            resource_id=str(conflict.id),
            trace_id=trace_id,
            details={
                "resolution": req.resolution,
                "entity_type": conflict.entity_type,
                "entity_id": str(conflict.entity_id),
                "notes": req.notes,
                "cpsat_solver_status": new_verdict.get("solver_status"),
            },
        )
    )
    await db.flush()

    return ConflictResolveOut(
        id=conflict.id,
        status=req.resolution,
        entity_snapshot=entity_snapshot,
        cpsat_verdict=new_verdict,
    )
