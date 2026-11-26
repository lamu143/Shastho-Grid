from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient
from ortools.sat.python import cp_model
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Patient
from app.db.seed import ANTIBIOTICS_DATA, GUIDELINES_DATA
from app.solver import aware_cpsat
from app.solver.aware_cpsat import (
    AntibioticSpec,
    BatchSpec,
    GuidelineSpec,
    OptimizeRequestSpec,
    PatientClinicalProfile,
    solve_aware_regimen,
)


def _seed_catalog() -> list[AntibioticSpec]:
    items: list[AntibioticSpec] = []
    for row in ANTIBIOTICS_DATA:
        items.append(
            AntibioticSpec(
                id=uuid4(),
                drug_code=row["drug_code"],
                generic_name=row["generic_name"],
                generic_name_bn=row["generic_name_bn"],
                drug_class=row["drug_class"],
                aware_category=row["aware_category"],
                aware_tier_cost=row["aware_tier_cost"],
                pregnancy_contraindicated=row["pregnancy_contraindicated"],
                renal_contraindicated_egfr_lt=(
                    float(row["renal_contraindicated_egfr_lt"])
                    if row["renal_contraindicated_egfr_lt"] is not None
                    else None
                ),
                min_age_years=row["min_age_years"],
                dose_regimen_en=row["dose_regimen_en"],
                dose_regimen_bn=row["dose_regimen_bn"],
                is_active=True,
            )
        )
    return items


def _guideline(code: str) -> GuidelineSpec:
    for g in GUIDELINES_DATA:
        if g["syndrome_code"] == code:
            return GuidelineSpec(
                syndrome_code=g["syndrome_code"],
                viral_no_antibiotic_if_mild=g["viral_no_antibiotic_if_mild"],
                first_line_drug_codes=list(g["first_line_drug_codes"]),
                second_line_drug_codes=list(g["second_line_drug_codes"]),
                default_duration_days=g["default_duration_days"],
            )
    raise AssertionError(f"Unknown guideline in seed data: {code}")


def _batch(
    drug_code: str,
    *,
    lot: str = "LOT-01",
    qty: int = 50,
    days_offset: int = 90,
    ref_date: date | None = None,
) -> BatchSpec:
    base = ref_date or date(2026, 6, 1)
    return BatchSpec(
        id=uuid4(),
        drug_code=drug_code,
        lot_number=lot,
        qty_remaining=qty,
        qty_initial=max(qty, 50),
        expiry_date=base + timedelta(days=days_offset),
        unit="tablets",
    )


def test_access_first_and_fefo_earliest_valid_expiry() -> None:
    ref = date(2026, 6, 1)
    catalog = _seed_catalog()
    batches = [
        _batch("AMOXICILLIN", lot="AMX-EXP", qty=50, days_offset=-2, ref_date=ref),
        _batch("AMOXICILLIN", lot="AMX-LATE", qty=100, days_offset=180, ref_date=ref),
        _batch("AMOXICILLIN", lot="AMX-FEFO", qty=40, days_offset=7, ref_date=ref),
        _batch("AZITHROMYCIN", lot="AZM-01", qty=50, days_offset=5, ref_date=ref),
    ]
    res = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=PatientClinicalProfile(age_years=32, weight_kg=62.0, sex="F"),
            guideline=_guideline("CAP_MILD"),
            severity="MILD",
            catalog=catalog,
            batches=batches,
            reference_date=ref,
        )
    )
    assert res.solver_status == "OPTIMAL"
    assert res.aware_category == "ACCESS"
    assert res.recommended_antibiotic is not None
    assert res.recommended_antibiotic.drug_code == "AMOXICILLIN"
    assert res.recommended_batch is not None
    assert res.recommended_batch.lot_number == "AMX-FEFO"
    assert res.recommended_batch.days_to_expiry == 7


def test_penicillin_allergy_allows_cephalexin_while_beta_lactam_blocks_it() -> None:
    ref = date(2026, 6, 1)
    catalog = _seed_catalog()
    # CELLULITIS first-line: CLOXACILLIN (PENICILLIN), CEPHALEXIN (CEPHALOSPORIN_1)
    batches = [
        _batch("CLOXACILLIN", lot="CLX-01", qty=30, days_offset=30, ref_date=ref),
        _batch("CEPHALEXIN", lot="CEPH-01", qty=30, days_offset=60, ref_date=ref),
        _batch("AMOXICILLIN", lot="AMX-01", qty=30, days_offset=20, ref_date=ref),
    ]

    # Seeded ASH-MRN-004 pattern: PENICILLIN allergy MUST allow CEPHALEXIN
    res_pen = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=PatientClinicalProfile(
                age_years=64, weight_kg=68.0, sex="M", egfr=22.0, allergies=["PENICILLIN"]
            ),
            guideline=_guideline("CELLULITIS"),
            severity="MODERATE",
            catalog=catalog,
            batches=batches,
            reference_date=ref,
        )
    )
    assert res_pen.solver_status == "OPTIMAL"
    assert res_pen.recommended_antibiotic is not None
    assert res_pen.recommended_antibiotic.drug_code == "CEPHALEXIN"

    # BETA_LACTAM allergy MUST block both CLOXACILLIN and CEPHALEXIN
    res_beta = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=PatientClinicalProfile(
                age_years=64, weight_kg=68.0, sex="M", egfr=22.0, allergies=["BETA_LACTAM"]
            ),
            guideline=_guideline("CELLULITIS"),
            severity="MODERATE",
            catalog=catalog,
            batches=batches,
            reference_date=ref,
        )
    )
    assert res_beta.solver_status == "INFEASIBLE"
    codes = {c.code for c in res_beta.mus_conflicts}
    assert any(c.startswith("ALLERGY_") for c in codes)


def test_allergy_synonym_sulfa_bactrim_blocks_cotrimoxazole() -> None:
    ref = date(2026, 6, 1)
    catalog = _seed_catalog()
    batches = [
        _batch("COTRIMOXAZOLE", lot="COT-01", qty=40, days_offset=10, ref_date=ref),
        _batch("NITROFURANTOIN", lot="NIT-01", qty=40, days_offset=45, ref_date=ref),
    ]
    for allergy_alias in ("Sulfa", "Bactrim", "TMP-SMX"):
        res = solve_aware_regimen(
            OptimizeRequestSpec(
                patient=PatientClinicalProfile(
                    age_years=29, weight_kg=55.0, sex="F", egfr=95.0, allergies=[allergy_alias]
                ),
                guideline=_guideline("UNCOMPLICATED_UTI"),
                severity="MODERATE",
                catalog=catalog,
                batches=batches,
                reference_date=ref,
            )
        )
        assert res.solver_status == "OPTIMAL"
        assert res.recommended_antibiotic is not None
        assert res.recommended_antibiotic.drug_code == "NITROFURANTOIN"


def test_pregnancy_renal_and_min_age_hard_constraints() -> None:
    ref = date(2026, 6, 1)
    catalog = _seed_catalog()

    # Pregnancy blocks DOXYCYCLINE on CHOLERA_WATERY_DIARRHEA -> selects AZITHROMYCIN (WATCH)
    res_preg = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=PatientClinicalProfile(
                age_years=26, weight_kg=58.0, sex="F", is_pregnant=True, egfr=95.0
            ),
            guideline=_guideline("CHOLERA_WATERY_DIARRHEA"),
            severity="MODERATE",
            catalog=catalog,
            batches=[
                _batch("DOXYCYCLINE", lot="DOX-01", qty=50, days_offset=20, ref_date=ref),
                _batch("AZITHROMYCIN", lot="AZM-01", qty=50, days_offset=30, ref_date=ref),
            ],
            reference_date=ref,
        )
    )
    assert res_preg.solver_status == "OPTIMAL"
    assert res_preg.recommended_antibiotic is not None
    assert res_preg.recommended_antibiotic.drug_code == "AZITHROMYCIN"

    # Renal eGFR=20 blocks NITROFURANTOIN (<30) & CIPROFLOXACIN (<30), picks COTRIMOXAZOLE (<15)
    res_renal = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=PatientClinicalProfile(age_years=60, weight_kg=65.0, sex="M", egfr=20.0),
            guideline=_guideline("UNCOMPLICATED_UTI"),
            severity="MODERATE",
            catalog=catalog,
            batches=[
                _batch("NITROFURANTOIN", lot="NIT-01", qty=30, days_offset=15, ref_date=ref),
                _batch("COTRIMOXAZOLE", lot="COT-01", qty=30, days_offset=30, ref_date=ref),
                _batch("CIPROFLOXACIN", lot="CIP-01", qty=30, days_offset=20, ref_date=ref),
            ],
            reference_date=ref,
        )
    )
    assert res_renal.solver_status == "OPTIMAL"
    assert res_renal.recommended_antibiotic is not None
    assert res_renal.recommended_antibiotic.drug_code == "COTRIMOXAZOLE"

    # Pediatric age=5 blocks DOXYCYCLINE (min_age=8) and CIPROFLOXACIN (min_age=18)
    res_child = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=PatientClinicalProfile(age_years=5, weight_kg=18.0, sex="F", egfr=105.0),
            guideline=_guideline("CHOLERA_WATERY_DIARRHEA"),
            severity="MODERATE",
            catalog=catalog,
            batches=[
                _batch("DOXYCYCLINE", lot="DOX-01", qty=30, days_offset=15, ref_date=ref),
                _batch("CIPROFLOXACIN", lot="CIP-01", qty=30, days_offset=15, ref_date=ref),
            ],
            max_aware_tier="WATCH",
            reference_date=ref,
        )
    )
    assert res_child.solver_status == "INFEASIBLE"
    assert any(c.code == "BELOW_MIN_AGE" for c in res_child.mus_conflicts)


def test_viral_no_antibiotic_gate_and_moderate_bronchitis() -> None:
    ref = date(2026, 6, 1)
    catalog = _seed_catalog()
    batches = [_batch("AMOXICILLIN", lot="AMX-01", qty=40, days_offset=30, ref_date=ref)]
    patient = PatientClinicalProfile(age_years=30, weight_kg=60.0, sex="M")

    for viral_code in ("ACUTE_BRONCHITIS", "COMMON_COLD", "VIRAL_URI"):
        res_mild = solve_aware_regimen(
            OptimizeRequestSpec(
                patient=patient,
                guideline=_guideline(viral_code),
                severity="MILD",
                catalog=catalog,
                batches=batches,
                reference_date=ref,
            )
        )
        assert res_mild.solver_status == "NO_ANTIBIOTIC"
        assert res_mild.aware_category == "NO_ANTIBIOTIC"
        assert res_mild.recommended_antibiotic is None
        assert res_mild.recommended_batch is None

    # ACUTE_BRONCHITIS when MODERATE evaluates second-line candidates via CP-SAT
    res_mod = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=patient,
            guideline=_guideline("ACUTE_BRONCHITIS"),
            severity="MODERATE",
            catalog=catalog,
            batches=batches,
            reference_date=ref,
        )
    )
    assert res_mod.solver_status == "OPTIMAL"
    assert res_mod.recommended_antibiotic is not None
    assert res_mod.recommended_antibiotic.drug_code == "AMOXICILLIN"


def test_pass2_mus_uses_presolve_false_single_worker_no_objective(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ref = date(2026, 6, 1)
    catalog = _seed_catalog()
    recorded_solves: list[dict[str, Any]] = []
    orig_solve = cp_model.CpSolver.solve

    def _spy_solve(self: cp_model.CpSolver, model: cp_model.CpModel, *args: Any, **kwargs: Any) -> Any:
        recorded_solves.append(
            {
                "has_objective": model.has_objective(),
                "cp_model_presolve": self.parameters.cp_model_presolve,
                "num_workers": self.parameters.num_workers,
            }
        )
        return orig_solve(self, model, *args, **kwargs)

    monkeypatch.setattr(aware_cpsat.cp_model.CpSolver, "solve", _spy_solve)

    # CAP_MILD: AMOXICILLIN/PHENOXYMETHYLPENICILLIN (penicillin allergy),
    # DOXYCYCLINE/LEVOFLOXACIN (pregnancy), AZITHROMYCIN/CEFIXIME (blocked ONLY by TIER_CAP_ACCESS)
    res = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=PatientClinicalProfile(
                age_years=28,
                weight_kg=58.0,
                sex="F",
                is_pregnant=True,
                egfr=95.0,
                allergies=["PENICILLIN"],
            ),
            guideline=_guideline("CAP_MILD"),
            severity="MODERATE",
            catalog=catalog,
            batches=[
                _batch("AMOXICILLIN", lot="AMX-01", qty=30, days_offset=20, ref_date=ref),
                _batch("DOXYCYCLINE", lot="DOX-01", qty=30, days_offset=20, ref_date=ref),
                _batch("AZITHROMYCIN", lot="AZM-01", qty=30, days_offset=20, ref_date=ref),
            ],
            max_aware_tier="ACCESS",
            reference_date=ref,
        )
    )
    assert res.solver_status == "INFEASIBLE"
    mus_codes = {c.code for c in res.mus_conflicts}
    assert {"ALLERGY_PENICILLIN", "PREGNANCY_CONTRAINDICATED", "TIER_CAP_ACCESS"} <= mus_codes

    # Pass 1 had objective; Pass 2 had NO objective, presolve=False, num_workers=1
    assert any(
        not item["has_objective"]
        and item["cp_model_presolve"] is False
        and item["num_workers"] == 1
        for item in recorded_solves
    )


def test_pass2_expired_and_out_of_stock_and_pass3_safe_relaxations() -> None:
    ref = date(2026, 6, 1)
    catalog = _seed_catalog()

    # Scenario A: Tier cap ACCESS blocks AZITHROMYCIN -> ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL
    res_watch = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=PatientClinicalProfile(
                age_years=30, weight_kg=60.0, sex="M", allergies=["PENICILLIN"]
            ),
            guideline=_guideline("CAP_MILD"),
            severity="MODERATE",
            catalog=catalog,
            batches=[
                _batch("AMOXICILLIN", lot="AMX-01", qty=30, days_offset=30, ref_date=ref),
                _batch("AZITHROMYCIN", lot="AZM-01", qty=30, days_offset=30, ref_date=ref),
            ],
            max_aware_tier="ACCESS",
            reference_date=ref,
        )
    )
    assert res_watch.solver_status == "INFEASIBLE"
    actions_watch = {r.action: r for r in res_watch.safe_relaxations}
    assert "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL" in actions_watch
    assert actions_watch["ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL"].candidate_drug == "AZITHROMYCIN"
    assert "SWITCH_TO_SYMPTOMATIC_CARE" in actions_watch

    # Scenario B: Clinically safe AMOXICILLIN only has expired lot & 0-qty lot -> REFER_UPAZILA_STOCK_TRANSFER
    res_stock = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=PatientClinicalProfile(age_years=30, weight_kg=60.0, sex="M"),
            guideline=_guideline("STREP_PHARYNGITIS"),
            severity="MODERATE",
            catalog=catalog,
            batches=[
                _batch("AMOXICILLIN", lot="AMX-EXP", qty=20, days_offset=-1, ref_date=ref),
                _batch("PHENOXYMETHYLPENICILLIN", lot="PENV-0", qty=0, days_offset=60, ref_date=ref),
            ],
            reference_date=ref,
        )
    )
    assert res_stock.solver_status == "INFEASIBLE"
    mus_codes = {c.code for c in res_stock.mus_conflicts}
    assert "BATCH_EXPIRED" in mus_codes or "OUT_OF_STOCK" in mus_codes
    actions_stock = {r.action: r for r in res_stock.safe_relaxations}
    assert "REFER_UPAZILA_STOCK_TRANSFER" in actions_stock
    assert actions_stock["REFER_UPAZILA_STOCK_TRANSFER"].candidate_drug in (
        "PHENOXYMETHYLPENICILLIN",
        "AMOXICILLIN",
    )
    assert "SWITCH_TO_SYMPTOMATIC_CARE" in actions_stock

    # Scenario C: Forced drug code check for M3 sync conflict evaluation
    res_forced = solve_aware_regimen(
        OptimizeRequestSpec(
            patient=PatientClinicalProfile(
                age_years=30, weight_kg=60.0, sex="F", allergies=["SULFONAMIDE"]
            ),
            guideline=_guideline("UNCOMPLICATED_UTI"),
            severity="MODERATE",
            catalog=catalog,
            batches=[_batch("COTRIMOXAZOLE", lot="COT-01", qty=10, days_offset=30, ref_date=ref)],
            forced_drug_code="COTRIMOXAZOLE",
            reference_date=ref,
        )
    )
    verdict = res_forced.to_cpsat_verdict()
    assert verdict["solver_status"] == "INFEASIBLE"
    assert verdict["mus_conflicts"][0]["code"] == "ALLERGY_SULFONAMIDE"


@pytest.mark.asyncio
async def test_optimize_endpoint_auth_scope_and_contracts(
    client: AsyncClient,
    login_as: Any,
    db_session: AsyncSession,
) -> None:
    # Unauthenticated -> 401 standard error envelope
    unauth = await client.post(
        "/api/v1/optimize",
        json={
            "patient_profile": {"age_years": 25, "weight_kg": 55, "sex": "F"},
            "syndrome_code": "UNCOMPLICATED_UTI",
            "severity": "MODERATE",
        },
    )
    assert unauth.status_code == 401
    assert unauth.json()["error_code"] == "AUTHENTICATION_REQUIRED"

    token, _ = await login_as("dispenser@awaregrid.org", "Dispenser#2026!")
    headers = {"Authorization": f"Bearer {token}"}

    # Unknown syndrome -> 404 standard error envelope
    bad_syn = await client.post(
        "/api/v1/optimize",
        headers=headers,
        json={
            "patient_profile": {"age_years": 25, "weight_kg": 55, "sex": "F"},
            "syndrome_code": "UNKNOWN_SYNDROME_XYZ",
            "severity": "MODERATE",
        },
    )
    assert bad_syn.status_code == 404
    assert bad_syn.json()["error_code"] == "SYNDROME_NOT_FOUND"

    # Cross-clinic patient_id -> 403 CROSS_TENANT_FORBIDDEN
    dhamrai_patient = (
        await db_session.execute(select(Patient).where(Patient.mrn == "DHM-MRN-001"))
    ).scalar_one()
    cross = await client.post(
        "/api/v1/optimize",
        headers=headers,
        json={
            "patient_id": str(dhamrai_patient.id),
            "syndrome_code": "UNCOMPLICATED_UTI",
            "severity": "MODERATE",
        },
    )
    assert cross.status_code == 403
    assert cross.json()["error_code"] == "CROSS_TENANT_FORBIDDEN"

    # Happy path bacterial ACCESS selection
    ok = await client.post(
        "/api/v1/optimize",
        headers=headers,
        json={
            "patient_profile": {
                "age_years": 28,
                "weight_kg": 58,
                "sex": "F",
                "is_pregnant": False,
                "egfr": 95,
                "allergies": [],
            },
            "syndrome_code": "UNCOMPLICATED_UTI",
            "severity": "MODERATE",
            "language": "en",
        },
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["solver_status"] == "OPTIMAL"
    assert body["aware_category"] == "ACCESS"
    assert body["recommended_batch"]["qty_remaining"] >= 1
    assert body["counseling"]["deidentified"] is True
    assert body["counseling"]["hallucination_guard_passed"] is True
    assert isinstance(body["counseling"]["instructions"], list)
    assert isinstance(body["counseling"]["red_flags"], list)

    # Viral mild -> NO_ANTIBIOTIC
    viral = await client.post(
        "/api/v1/optimize",
        headers=headers,
        json={
            "patient_profile": {"age_years": 30, "weight_kg": 60, "sex": "M"},
            "syndrome_code": "ACUTE_BRONCHITIS",
            "severity": "MILD",
            "language": "bn",
        },
    )
    assert viral.status_code == 200
    vbody = viral.json()
    assert vbody["solver_status"] == "NO_ANTIBIOTIC"
    assert vbody["aware_category"] == "NO_ANTIBIOTIC"
    assert vbody["recommended_antibiotic"] is None
    assert vbody["recommended_batch"] is None

    # Infeasible case -> Pass 2 MUS & Pass 3 relaxations
    # CAP_MILD: AMOXICILLIN/PENV (PENICILLIN allergy), DOXYCYCLINE (pregnant),
    # AZITHROMYCIN/CEFIXIME (blocked by max_aware_tier=ACCESS)
    inf = await client.post(
        "/api/v1/optimize",
        headers=headers,
        json={
            "patient_profile": {
                "age_years": 28,
                "weight_kg": 58,
                "sex": "F",
                "is_pregnant": True,
                "egfr": 95,
                "allergies": ["PENICILLIN"],
            },
            "syndrome_code": "CAP_MILD",
            "severity": "MODERATE",
            "max_aware_tier": "ACCESS",
            "language": "en",
        },
    )
    assert inf.status_code == 200
    ibody = inf.json()
    assert ibody["solver_status"] == "INFEASIBLE"
    mus_codes = {c["code"] for c in ibody["mus_conflicts"]}
    assert {"ALLERGY_PENICILLIN", "PREGNANCY_CONTRAINDICATED", "TIER_CAP_ACCESS"} <= mus_codes
    actions = {r["action"] for r in ibody["safe_relaxations"]}
    assert "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL" in actions
    assert "SWITCH_TO_SYMPTOMATIC_CARE" in actions
