from __future__ import annotations

import asyncio
from datetime import date
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.steward_agent import (
    PiiDetectedError,
    detect_pii_reason,
    generate_counseling,
)
from app.core.errors import NotFoundError, ValidationAppError, get_trace_id
from app.core.security import CurrentUser, enforce_clinic_scope, require_roles
from app.db.models import (
    AntibioticCatalog,
    AuditLog,
    AwareGuideline,
    InventoryBatch,
    Patient,
)
from app.db.session import get_db
from app.schemas.optimize import (
    CounselingOut,
    MusConflictOut,
    OptimizeRequest,
    OptimizeResponse,
    RecommendedAntibioticOut,
    RecommendedBatchOut,
    SafeRelaxationOut,
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

router = APIRouter(tags=["optimize"])


@router.post("/optimize", response_model=OptimizeResponse)
async def optimize_regimen(
    payload: OptimizeRequest,
    request: Request,
    current_user: Annotated[
        CurrentUser,
        Depends(require_roles("dispenser", "pharmacist", "auditor", "admin")),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OptimizeResponse:
    patient_row: Patient | None = None
    if payload.patient_id is not None:
        patient_row = (
            await db.execute(select(Patient).where(Patient.id == payload.patient_id))
        ).scalar_one_or_none()
        if patient_row is None:
            raise NotFoundError(
                message="Patient not found.",
                error_code="PATIENT_NOT_FOUND",
                details={"patient_id": str(payload.patient_id)},
            )
        enforce_clinic_scope(current_user, patient_row.clinic_id)

    if payload.patient_profile is not None:
        allergy_source = "patient_profile.allergies"
        profile = PatientClinicalProfile(
            age_years=payload.patient_profile.age_years,
            weight_kg=payload.patient_profile.weight_kg,
            sex=payload.patient_profile.sex,
            is_pregnant=payload.patient_profile.is_pregnant,
            egfr=payload.patient_profile.egfr,
            allergies=list(payload.patient_profile.allergies),
        )
    else:
        assert patient_row is not None
        allergy_source = "patient.allergies"
        profile = PatientClinicalProfile(
            age_years=patient_row.age_years,
            weight_kg=float(patient_row.weight_kg),
            sex=cast(Sex, patient_row.sex),
            is_pregnant=patient_row.is_pregnant,
            egfr=float(patient_row.egfr) if patient_row.egfr is not None else None,
            allergies=list(patient_row.allergies or []),
        )

    for idx, allergy in enumerate(profile.allergies):
        pii_reason = detect_pii_reason(str(allergy))
        if pii_reason is not None:
            raise ValidationAppError(
                message="PII detected in patient allergies; clinical optimization requires de-identified allergy tokens only.",
                error_code="PII_DETECTED",
                details={"field": f"{allergy_source}[{idx}]", "reason": pii_reason},
            )

    syndrome_code = payload.syndrome_code.strip().upper()
    guideline_row = (
        await db.execute(
            select(AwareGuideline).where(AwareGuideline.syndrome_code == syndrome_code)
        )
    ).scalar_one_or_none()
    if guideline_row is None:
        raise NotFoundError(
            message=f"Unknown syndrome_code: {payload.syndrome_code}",
            error_code="SYNDROME_NOT_FOUND",
            details={"syndrome_code": payload.syndrome_code},
        )

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
            .where(InventoryBatch.clinic_id == current_user.clinic_id)
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

    solver_spec = OptimizeRequestSpec(
        patient=profile,
        guideline=guideline_spec,
        severity=payload.severity,
        catalog=catalog_specs,
        batches=batch_specs,
        max_aware_tier=payload.max_aware_tier,
        required_qty=1,
        reference_date=date.today(),
        language=payload.language,
    )
    result = await asyncio.to_thread(solve_aware_regimen, solver_spec)

    try:
        counseling = await generate_counseling(
            solver_result=result,
            syndrome_code=guideline_row.syndrome_code,
            severity=payload.severity,
            duration_days=guideline_row.default_duration_days,
            age_years=profile.age_years,
            weight_kg=profile.weight_kg,
            sex=profile.sex,
            is_pregnant=profile.is_pregnant,
            egfr=profile.egfr,
            allergies=profile.allergies,
            language=payload.language,
            catalog_drugs=catalog_specs,
        )
    except PiiDetectedError as exc:
        raise ValidationAppError(
            message="PII detected in clinical optimization payload; de-identified clinical tokens are required.",
            error_code="PII_DETECTED",
            details={"reason": "pii_detected"},
        ) from exc

    recommended_antibiotic_out: RecommendedAntibioticOut | None = None
    recommended_batch_out: RecommendedBatchOut | None = None
    if result.recommended_antibiotic is not None and result.recommended_batch is not None:
        abx_spec = result.recommended_antibiotic
        b_spec = result.recommended_batch
        assert abx_spec.id is not None
        recommended_antibiotic_out = RecommendedAntibioticOut(
            id=abx_spec.id if hasattr(abx_spec.id, "hex") else catalog_by_id[abx_spec.id].id,  # type: ignore[arg-type]
            drug_code=abx_spec.drug_code,
            generic_name=abx_spec.generic_name,
            generic_name_bn=abx_spec.generic_name_bn,
            drug_class=abx_spec.drug_class,
            aware_category=abx_spec.aware_category,
            aware_tier_cost=abx_spec.aware_tier_cost,
            dose_regimen_en=abx_spec.dose_regimen_en,
            dose_regimen_bn=abx_spec.dose_regimen_bn,
        )
        recommended_batch_out = RecommendedBatchOut(
            id=b_spec.id,  # type: ignore[arg-type]
            clinic_id=b_spec.clinic_id or current_user.clinic_id,  # type: ignore[arg-type]
            antibiotic_id=b_spec.antibiotic_id or abx_spec.id,  # type: ignore[arg-type]
            drug_code=abx_spec.drug_code,
            generic_name=abx_spec.generic_name,
            aware_category=abx_spec.aware_category,
            lot_number=b_spec.lot_number,
            qty_initial=b_spec.qty_initial,
            qty_remaining=b_spec.qty_remaining,
            expiry_date=b_spec.expiry_date,
            days_to_expiry=b_spec.days_to_expiry or 0,
            unit=b_spec.unit,
            version=b_spec.version,
        )

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="OPTIMIZE_REGIMEN",
            resource_type="guideline",
            resource_id=guideline_row.syndrome_code,
            trace_id=get_trace_id(request),
            details={
                "syndrome_code": guideline_row.syndrome_code,
                "severity": payload.severity,
                "solver_status": result.solver_status,
                "aware_category": result.aware_category,
                "recommended_drug_code": (
                    result.recommended_antibiotic.drug_code
                    if result.recommended_antibiotic
                    else None
                ),
                "model_used": counseling.model_used,
                "deidentified": counseling.deidentified,
            },
        )
    )
    await db.commit()

    return OptimizeResponse(
        solver_status=result.solver_status,
        recommended_antibiotic=recommended_antibiotic_out,
        recommended_batch=recommended_batch_out,
        aware_category=result.aware_category,
        mus_conflicts=[
            MusConflictOut(code=c.code, label=c.label, detail=c.detail)
            for c in result.mus_conflicts
        ],
        safe_relaxations=[
            SafeRelaxationOut(
                action=r.action,
                rationale=r.rationale,
                candidate_drug=r.candidate_drug,
            )
            for r in result.safe_relaxations
        ],
        counseling=CounselingOut(
            summary=counseling.summary,
            instructions=counseling.instructions,
            red_flags=counseling.red_flags,
            model_used=counseling.model_used,
            deidentified=counseling.deidentified,
            hallucination_guard_passed=counseling.hallucination_guard_passed,
        ),
    )
