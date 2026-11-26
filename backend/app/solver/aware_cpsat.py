from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal
from uuid import UUID

from ortools.sat.python import cp_model

AwareCategory = Literal["ACCESS", "WATCH", "RESERVE"]
AwareVerdictCategory = Literal["ACCESS", "WATCH", "RESERVE", "NO_ANTIBIOTIC"]
Severity = Literal["MILD", "MODERATE", "SEVERE"]
Sex = Literal["M", "F", "O"]
SolverStatus = Literal["OPTIMAL", "INFEASIBLE", "NO_ANTIBIOTIC"]
RelaxationAction = Literal[
    "SWITCH_TO_SYMPTOMATIC_CARE",
    "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL",
    "REFER_UPAZILA_STOCK_TRANSFER",
]

TIER_RANK: dict[str, int] = {
    "ACCESS": 1,
    "WATCH": 2,
    "RESERVE": 3,
}

# IMPORTANT: PENICILLIN maps ONLY to PENICILLIN-class agents so that seeded
# patient ASH-MRN-004 (PENICILLIN allergy) remains eligible for CEPHALEXIN
# (CEPHALOSPORIN_1). BETA_LACTAM blocks all beta-lactam subclasses.
ALLERGY_EXPANSION_MAP: dict[str, tuple[str, ...]] = {
    "PENICILLIN": (
        "PENICILLIN",
        "AMOXICILLIN",
        "AMPICILLIN",
        "PHENOXYMETHYLPENICILLIN",
        "CLOXACILLIN",
        "PIPERACILLIN_TAZOBACTAM",
    ),
    "BETA_LACTAM": (
        "BETA_LACTAM",
        "PENICILLIN",
        "CEPHALOSPORIN",
        "CEPHALOSPORIN_1",
        "CEPHALOSPORIN_3",
        "CARBAPENEM",
        "AMOXICILLIN",
        "AMPICILLIN",
        "PHENOXYMETHYLPENICILLIN",
        "CLOXACILLIN",
        "CEPHALEXIN",
        "CEFIXIME",
        "CEFTRIAXONE",
        "PIPERACILLIN_TAZOBACTAM",
        "MEROPENEM",
    ),
    "CEPHALOSPORIN": (
        "CEPHALOSPORIN",
        "CEPHALOSPORIN_1",
        "CEPHALOSPORIN_3",
        "CEPHALEXIN",
        "CEFIXIME",
        "CEFTRIAXONE",
    ),
    "CEPHALOSPORIN_1": ("CEPHALOSPORIN_1", "CEPHALEXIN"),
    "CEPHALOSPORIN_3": ("CEPHALOSPORIN_3", "CEFIXIME", "CEFTRIAXONE"),
    "CARBAPENEM": ("CARBAPENEM", "MEROPENEM"),
    "SULFONAMIDE": ("SULFONAMIDE", "COTRIMOXAZOLE"),
    "FLUOROQUINOLONE": ("FLUOROQUINOLONE", "CIPROFLOXACIN", "LEVOFLOXACIN"),
    "MACROLIDE": ("MACROLIDE", "AZITHROMYCIN"),
    "TETRACYCLINE": ("TETRACYCLINE", "DOXYCYCLINE"),
    "AMINOGLYCOSIDE": ("AMINOGLYCOSIDE", "GENTAMICIN"),
    "GLYCOPEPTIDE": ("GLYCOPEPTIDE", "VANCOMYCIN"),
    "OXAZOLIDINONE": ("OXAZOLIDINONE", "LINEZOLID"),
    "POLYMYXIN": ("POLYMYXIN", "COLISTIN"),
    "NITROFURAN": ("NITROFURAN", "NITROFURANTOIN"),
    "NITROIMIDAZOLE": ("NITROIMIDAZOLE", "METRONIDAZOLE"),
}

ALLERGY_SYNONYM_MAP: dict[str, str] = {
    "SULFA": "SULFONAMIDE",
    "SULPHA": "SULFONAMIDE",
    "SULFA_DRUG": "SULFONAMIDE",
    "SULFA_DRUGS": "SULFONAMIDE",
    "SULFONAMIDES": "SULFONAMIDE",
    "SULPHONAMIDE": "SULFONAMIDE",
    "SULPHONAMIDES": "SULFONAMIDE",
    "TMP_SMX": "COTRIMOXAZOLE",
    "SMX_TMP": "COTRIMOXAZOLE",
    "TRIMETHOPRIM_SULFAMETHOXAZOLE": "COTRIMOXAZOLE",
    "SULFAMETHOXAZOLE_TRIMETHOPRIM": "COTRIMOXAZOLE",
    "CO_TRIMOXAZOLE": "COTRIMOXAZOLE",
    "SULFAMETHOXAZOLE": "SULFONAMIDE",
    "TRIMETHOPRIM": "COTRIMOXAZOLE",
    "BACTRIM": "COTRIMOXAZOLE",
    "SEPTRA": "COTRIMOXAZOLE",
    "AUGMENTIN": "AMOXICILLIN",
    "CO_AMOXICLAV": "AMOXICILLIN",
    "AMOX": "AMOXICILLIN",
    "PENICILLINS": "PENICILLIN",
    "PENICILLIN_G": "PENICILLIN",
    "PENICILLIN_V": "PENICILLIN",
    "PENICILLIN_VK": "PENICILLIN",
    "BENZATHINE_PENICILLIN": "PENICILLIN",
    "PROCAINE_PENICILLIN": "PENICILLIN",
    "BETA_LACTAMS": "BETA_LACTAM",
    "BETALACTAM": "BETA_LACTAM",
    "BETALACTAMS": "BETA_LACTAM",
    "CEPHALOSPORINS": "CEPHALOSPORIN",
    "CEFALEXIN": "CEPHALEXIN",
    "CARBAPENEMS": "CARBAPENEM",
    "FLUOROQUINOLONES": "FLUOROQUINOLONE",
    "QUINOLONE": "FLUOROQUINOLONE",
    "QUINOLONES": "FLUOROQUINOLONE",
    "CIPRO": "CIPROFLOXACIN",
    "LEVO": "LEVOFLOXACIN",
    "MACROLIDES": "MACROLIDE",
    "AZITHRO": "AZITHROMYCIN",
    "TETRACYCLINES": "TETRACYCLINE",
    "DOXY": "DOXYCYCLINE",
    "AMINOGLYCOSIDES": "AMINOGLYCOSIDE",
    "GLYCOPEPTIDES": "GLYCOPEPTIDE",
    "OXAZOLIDINONES": "OXAZOLIDINONE",
    "POLYMYXINS": "POLYMYXIN",
    "POLYMYXIN_E": "COLISTIN",
    "NITROFURANS": "NITROFURAN",
    "NITROIMIDAZOLES": "NITROIMIDAZOLE",
    "PIP_TAZO": "PIPERACILLIN_TAZOBACTAM",
    "PIPERACILLIN": "PIPERACILLIN_TAZOBACTAM",
    "TAZOBACTAM": "PIPERACILLIN_TAZOBACTAM",
}

_DOSE_SUFFIX_RE = re.compile(r"_\d+(?:\.\d+)?_?(?:MG|G|GM|MCG|UG|ML|IU)?$")
_SALT_SUFFIX_RE = re.compile(
    r"_(?:SODIUM|POTASSIUM|SULFATE|SULPHATE|HYCLATE|HCL|HYDROCHLORIDE|"
    r"TRIHYDRATE|MONOHYDRATE|TABLET|TABLETS|CAPSULE|CAPSULES|IV|PO|ORAL|ALLERGY|G|V|VK)$"
)


def normalize_allergy_token(raw: str) -> str:
    normalized = re.sub(r"[^A-Z0-9]+", "_", raw.strip().upper())
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    prev = ""
    while normalized != prev:
        prev = normalized
        normalized = _DOSE_SUFFIX_RE.sub("", normalized)
        normalized = _SALT_SUFFIX_RE.sub("", normalized).strip("_")
    return normalized


def _add_allergy_key(expanded: set[str], candidate: str) -> None:
    if not candidate:
        return
    canonical = ALLERGY_SYNONYM_MAP.get(candidate, candidate)
    expanded.add(candidate)
    expanded.add(canonical)

    keys = {candidate, canonical}
    if len(canonical) > 4 and canonical.endswith("S"):
        singular = canonical[:-1]
        singular_canonical = ALLERGY_SYNONYM_MAP.get(singular, singular)
        expanded.add(singular)
        expanded.add(singular_canonical)
        keys.update({singular, singular_canonical})

    for key in keys:
        mapped = ALLERGY_EXPANSION_MAP.get(key)
        if mapped:
            expanded.update(mapped)


def expand_allergies(allergies: list[str]) -> set[str]:
    expanded: set[str] = set()
    for raw in allergies:
        if not raw or not raw.strip():
            continue
        raw_upper = re.sub(r"[^A-Z0-9]+", "_", raw.strip().upper())
        raw_upper = re.sub(r"_+", "_", raw_upper).strip("_")
        if not raw_upper:
            continue

        normalized = normalize_allergy_token(raw)
        _add_allergy_key(expanded, raw_upper)
        _add_allergy_key(expanded, normalized)

        parts = [p for p in (normalized or raw_upper).split("_") if p]
        for idx, part in enumerate(parts):
            if len(part) >= 4:
                _add_allergy_key(expanded, part)
            if idx + 1 < len(parts):
                _add_allergy_key(expanded, f"{part}_{parts[idx + 1]}")
    return expanded


@dataclass(frozen=True, slots=True)
class PatientClinicalProfile:
    age_years: int
    weight_kg: float
    sex: Sex
    is_pregnant: bool = False
    egfr: float | None = None
    allergies: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class GuidelineSpec:
    syndrome_code: str
    viral_no_antibiotic_if_mild: bool = False
    first_line_drug_codes: list[str] = field(default_factory=list)
    second_line_drug_codes: list[str] = field(default_factory=list)
    default_duration_days: int = 5


@dataclass(frozen=True, slots=True)
class AntibioticSpec:
    id: UUID | str | None
    drug_code: str
    generic_name: str
    generic_name_bn: str = ""
    drug_class: str = ""
    aware_category: AwareCategory = "ACCESS"
    aware_tier_cost: int = 1
    pregnancy_contraindicated: bool = False
    renal_contraindicated_egfr_lt: float | None = None
    min_age_years: int = 0
    dose_regimen_en: str = ""
    dose_regimen_bn: str = ""
    is_active: bool = True


@dataclass(frozen=True, slots=True)
class BatchSpec:
    id: UUID | str
    drug_code: str
    lot_number: str
    qty_remaining: int
    expiry_date: date
    unit: str = "tablets"
    antibiotic_id: UUID | str | None = None
    clinic_id: UUID | str | None = None
    qty_initial: int = 0
    version: int = 1
    days_to_expiry: int | None = None


@dataclass(frozen=True, slots=True)
class OptimizeRequestSpec:
    patient: PatientClinicalProfile
    guideline: GuidelineSpec
    severity: Severity
    catalog: list[AntibioticSpec]
    batches: list[BatchSpec]
    max_aware_tier: AwareCategory | None = None
    required_qty: int = 1
    reference_date: date | None = None
    forced_drug_code: str | None = None
    language: Literal["en", "bn"] = "en"


@dataclass(frozen=True, slots=True)
class MusConflict:
    code: str
    label: str
    detail: str

    def to_dict(self) -> dict[str, str]:
        return {
            "code": self.code,
            "label": self.label,
            "detail": self.detail,
        }


@dataclass(frozen=True, slots=True)
class SafeRelaxation:
    action: RelaxationAction
    rationale: str
    candidate_drug: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "rationale": self.rationale,
            "candidate_drug": self.candidate_drug,
        }


@dataclass(frozen=True, slots=True)
class SolverResult:
    solver_status: SolverStatus
    aware_category: AwareVerdictCategory
    recommended_antibiotic: AntibioticSpec | None
    recommended_batch: BatchSpec | None
    mus_conflicts: list[MusConflict] = field(default_factory=list)
    safe_relaxations: list[SafeRelaxation] = field(default_factory=list)

    def to_cpsat_verdict(self) -> dict[str, Any]:
        return {
            "solver_status": self.solver_status,
            "aware_category": self.aware_category,
            "recommended_drug_code": (
                self.recommended_antibiotic.drug_code if self.recommended_antibiotic else None
            ),
            "recommended_batch_id": (
                str(self.recommended_batch.id) if self.recommended_batch else None
            ),
            "mus_conflicts": [c.to_dict() for c in self.mus_conflicts],
            "safe_relaxations": [r.to_dict() for r in self.safe_relaxations],
        }


def is_drug_allergic(drug: AntibioticSpec, expanded_allergies: set[str]) -> bool:
    if not expanded_allergies:
        return False
    drug_code_up = drug.drug_code.strip().upper()
    drug_class_up = drug.drug_class.strip().upper()
    if drug_code_up in expanded_allergies or drug_class_up in expanded_allergies:
        return True

    generic_cleaned = re.sub(r"\([^)]*\)", " ", drug.generic_name)
    generic_norm = normalize_allergy_token(generic_cleaned)
    if generic_norm and generic_norm in expanded_allergies:
        return True

    for part in generic_norm.split("_"):
        if len(part) >= 4 and part in expanded_allergies:
            return True
    return False


def _days_to_expiry(batch: BatchSpec, ref_date: date) -> int:
    return (batch.expiry_date - ref_date).days


def _select_candidates(
    guideline: GuidelineSpec,
    catalog: list[AntibioticSpec],
    forced_drug_code: str | None,
) -> list[tuple[AntibioticSpec, int]]:
    active_by_code = {
        drug.drug_code.strip().upper(): drug
        for drug in catalog
        if drug.is_active
    }
    candidates: list[tuple[AntibioticSpec, int]] = []
    seen: set[str] = set()

    if forced_drug_code:
        code = forced_drug_code.strip().upper()
        drug = active_by_code.get(code)
        if drug is not None:
            candidates.append((drug, 0))
        return candidates

    for code_raw in guideline.first_line_drug_codes:
        code = code_raw.strip().upper()
        if code in seen:
            continue
        drug = active_by_code.get(code)
        if drug is not None:
            seen.add(code)
            candidates.append((drug, 0))

    for code_raw in guideline.second_line_drug_codes:
        code = code_raw.strip().upper()
        if code in seen:
            continue
        drug = active_by_code.get(code)
        if drug is not None:
            seen.add(code)
            candidates.append((drug, 1))

    return candidates


def _index_batches(
    candidates: list[tuple[AntibioticSpec, int]],
    batches: list[BatchSpec],
) -> dict[str, list[BatchSpec]]:
    by_code: dict[str, list[BatchSpec]] = {drug.drug_code.strip().upper(): [] for drug, _ in candidates}
    id_to_code = {
        str(drug.id): drug.drug_code.strip().upper()
        for drug, _ in candidates
        if drug.id is not None
    }
    for batch in batches:
        code = batch.drug_code.strip().upper()
        if code not in by_code and batch.antibiotic_id is not None:
            mapped = id_to_code.get(str(batch.antibiotic_id))
            if mapped:
                code = mapped
        if code in by_code:
            by_code[code].append(batch)
    return by_code


def _drug_clinical_blocks(
    drug: AntibioticSpec,
    patient: PatientClinicalProfile,
    expanded_allergies: set[str],
) -> list[tuple[str, str, str]]:
    blocks: list[tuple[str, str, str]] = []
    drug_class_up = drug.drug_class.strip().upper() or drug.drug_code.strip().upper()

    if is_drug_allergic(drug, expanded_allergies):
        blocks.append(
            (
                f"ALLERGY_{drug_class_up}",
                f"{drug_class_up} Allergy Exclusion",
                f"{drug.generic_name} ({drug_class_up}) conflicts with documented patient allergies.",
            )
        )

    if patient.is_pregnant and drug.pregnancy_contraindicated:
        blocks.append(
            (
                "PREGNANCY_CONTRAINDICATED",
                "Pregnancy Contraindication",
                f"{drug.generic_name} is contraindicated during pregnancy.",
            )
        )

    if (
        patient.egfr is not None
        and drug.renal_contraindicated_egfr_lt is not None
        and float(patient.egfr) < float(drug.renal_contraindicated_egfr_lt)
    ):
        blocks.append(
            (
                "RENAL_EGFR_BELOW_THRESHOLD",
                "Renal Impairment Exclusion",
                (
                    f"{drug.generic_name} requires eGFR >= {drug.renal_contraindicated_egfr_lt:g} "
                    f"(patient eGFR: {patient.egfr:g})."
                ),
            )
        )

    if patient.age_years < drug.min_age_years:
        blocks.append(
            (
                "BELOW_MIN_AGE",
                "Minimum Age Contraindication",
                (
                    f"{drug.generic_name} requires age >= {drug.min_age_years} years "
                    f"(patient age: {patient.age_years})."
                ),
            )
        )

    return blocks


def _run_pass1_optimization(
    candidates: list[tuple[AntibioticSpec, int]],
    batches_by_code: dict[str, list[BatchSpec]],
    patient: PatientClinicalProfile,
    expanded_allergies: set[str],
    max_aware_tier: AwareCategory | None,
    required_qty: int,
    ref_date: date,
) -> tuple[AntibioticSpec, BatchSpec] | None:
    model = cp_model.CpModel()
    decision_vars: list[tuple[cp_model.IntVar, AntibioticSpec, BatchSpec, int]] = []
    objective_terms: list[cp_model.LinearExpr] = []

    max_tier_rank = TIER_RANK[max_aware_tier] if max_aware_tier else None

    for drug, line_rank in candidates:
        drug_code_up = drug.drug_code.strip().upper()
        clinical_blocks = _drug_clinical_blocks(drug, patient, expanded_allergies)
        tier_blocked = (
            max_tier_rank is not None
            and TIER_RANK[drug.aware_category] > max_tier_rank
        )
        drug_batches = batches_by_code.get(drug_code_up, [])
        for idx, batch in enumerate(drug_batches):
            days_left = _days_to_expiry(batch, ref_date)
            var = model.new_bool_var(f"x_{drug_code_up}_{idx}")
            decision_vars.append((var, drug, batch, days_left))

            if (
                clinical_blocks
                or tier_blocked
                or batch.qty_remaining < required_qty
                or days_left <= 0
            ):
                model.add(var == 0)

            clamped_days = min(max(days_left, 1), 9_999)
            cost = drug.aware_tier_cost * 100_000 + line_rank * 10_000 + clamped_days
            objective_terms.append(var * cost)

    if not decision_vars:
        return None

    model.add(sum(item[0] for item in decision_vars) == 1)
    model.minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    for var, drug, batch, days_left in decision_vars:
        if solver.value(var) == 1:
            selected_batch = BatchSpec(
                id=batch.id,
                drug_code=batch.drug_code,
                lot_number=batch.lot_number,
                qty_remaining=batch.qty_remaining,
                expiry_date=batch.expiry_date,
                unit=batch.unit,
                antibiotic_id=batch.antibiotic_id or drug.id,
                clinic_id=batch.clinic_id,
                qty_initial=batch.qty_initial,
                version=batch.version,
                days_to_expiry=days_left,
            )
            return drug, selected_batch

    return None


def _run_pass2_mus(
    candidates: list[tuple[AntibioticSpec, int]],
    batches_by_code: dict[str, list[BatchSpec]],
    patient: PatientClinicalProfile,
    expanded_allergies: set[str],
    max_aware_tier: AwareCategory | None,
    required_qty: int,
    ref_date: date,
    syndrome_code: str,
) -> list[MusConflict]:
    if not candidates:
        return [
            MusConflict(
                code="NO_GUIDELINE_CANDIDATES",
                label="No Active Guideline Candidates",
                detail=f"No active catalog antibiotics are mapped for syndrome {syndrome_code}.",
            )
        ]

    # Pass 2 MUST build a fresh CpModel with NO objective, cp_model_presolve=False,
    # num_workers=1, AddAssumption, and sufficient_assumptions_for_infeasibility().
    model = cp_model.CpModel()
    all_vars: list[cp_model.IntVar] = []

    assumptions: dict[str, cp_model.IntVar] = {}
    conflict_meta: dict[str, tuple[str, str, list[str]]] = {}
    max_tier_rank = TIER_RANK[max_aware_tier] if max_aware_tier else None

    def get_assumption(code: str, label: str, detail: str) -> cp_model.IntVar:
        if code not in assumptions:
            lit = model.new_bool_var(f"assume_{code}")
            model.add_assumption(lit)
            assumptions[code] = lit
            conflict_meta[code] = (label, detail, [])
        else:
            existing_label, existing_detail, details_list = conflict_meta[code]
            if detail not in details_list and detail != existing_detail:
                details_list.append(detail)
                conflict_meta[code] = (existing_label, existing_detail, details_list)
        return assumptions[code]

    for drug, _ in candidates:
        drug_code_up = drug.drug_code.strip().upper()
        clinical_blocks = _drug_clinical_blocks(drug, patient, expanded_allergies)
        tier_blocked = (
            max_tier_rank is not None
            and TIER_RANK[drug.aware_category] > max_tier_rank
        )
        drug_batches = batches_by_code.get(drug_code_up, [])

        if not drug_batches:
            # Virtual lot variable represents the candidate drug needing clinic stock.
            v_var = model.new_bool_var(f"mus_{drug_code_up}_NO_LOT")
            all_vars.append(v_var)

            for blk_code, blk_label, blk_detail in clinical_blocks:
                lit = get_assumption(blk_code, blk_label, blk_detail)
                model.add(v_var == 0).only_enforce_if(lit)

            if tier_blocked and max_aware_tier is not None:
                lit = get_assumption(
                    f"TIER_CAP_{max_aware_tier}",
                    f"AWaRe Tier Cap ({max_aware_tier})",
                    f"{drug.generic_name} ({drug.aware_category}) exceeds max_aware_tier={max_aware_tier}.",
                )
                model.add(v_var == 0).only_enforce_if(lit)

            lit_stock = get_assumption(
                "OUT_OF_STOCK",
                "Out of Clinic Stock",
                f"No active inventory lot exists in clinic for {drug.generic_name}.",
            )
            model.add(v_var == 0).only_enforce_if(lit_stock)
            continue

        for idx, batch in enumerate(drug_batches):
            b_var = model.new_bool_var(f"mus_{drug_code_up}_{idx}")
            all_vars.append(b_var)
            days_left = _days_to_expiry(batch, ref_date)

            for blk_code, blk_label, blk_detail in clinical_blocks:
                lit = get_assumption(blk_code, blk_label, blk_detail)
                model.add(b_var == 0).only_enforce_if(lit)

            if tier_blocked and max_aware_tier is not None:
                lit = get_assumption(
                    f"TIER_CAP_{max_aware_tier}",
                    f"AWaRe Tier Cap ({max_aware_tier})",
                    f"{drug.generic_name} ({drug.aware_category}) exceeds max_aware_tier={max_aware_tier}.",
                )
                model.add(b_var == 0).only_enforce_if(lit)

            if batch.qty_remaining < required_qty:
                lit_stock = get_assumption(
                    "OUT_OF_STOCK",
                    "Out of Clinic Stock",
                    f"Lot {batch.lot_number} of {drug.generic_name} has insufficient stock ({batch.qty_remaining} < {required_qty}).",
                )
                model.add(b_var == 0).only_enforce_if(lit_stock)

            if days_left <= 0:
                lit_exp = get_assumption(
                    "BATCH_EXPIRED",
                    "FEFO Batch Expired",
                    f"Lot {batch.lot_number} of {drug.generic_name} expired on {batch.expiry_date.isoformat()}.",
                )
                model.add(b_var == 0).only_enforce_if(lit_exp)

    model.add(sum(all_vars) == 1)

    solver = cp_model.CpSolver()
    solver.parameters.cp_model_presolve = False
    solver.parameters.num_workers = 1

    status = solver.solve(model)
    if status != cp_model.INFEASIBLE:
        return []

    by_index = {lit.index: code for code, lit in assumptions.items()}
    sufficient_indices = list(solver.sufficient_assumptions_for_infeasibility())

    conflicts: list[MusConflict] = []
    seen_codes: set[str] = set()
    for idx in sufficient_indices:
        code = by_index.get(idx)
        if not code or code in seen_codes:
            continue
        seen_codes.add(code)
        label, first_detail, extra_details = conflict_meta[code]
        combined_detail = " ".join([first_detail, *extra_details]).strip()
        conflicts.append(MusConflict(code=code, label=label, detail=combined_detail))

    if not conflicts:
        # Fallback defensive invariant if solver returned empty indices
        for code, (label, first_detail, extra_details) in conflict_meta.items():
            conflicts.append(
                MusConflict(
                    code=code,
                    label=label,
                    detail=" ".join([first_detail, *extra_details]).strip(),
                )
            )
    return conflicts


def _run_pass3_relaxations(
    candidates: list[tuple[AntibioticSpec, int]],
    batches_by_code: dict[str, list[BatchSpec]],
    patient: PatientClinicalProfile,
    expanded_allergies: set[str],
    max_aware_tier: AwareCategory | None,
    required_qty: int,
    ref_date: date,
    mus_conflicts: list[MusConflict],
    language: Literal["en", "bn"],
) -> list[SafeRelaxation]:
    relaxations: list[SafeRelaxation] = []

    # 1. Safe WATCH escalation (never bypasses clinical safety contraindications or expired/empty stock)
    if max_aware_tier == "ACCESS":
        watch_probe = _run_pass1_optimization(
            candidates=candidates,
            batches_by_code=batches_by_code,
            patient=patient,
            expanded_allergies=expanded_allergies,
            max_aware_tier="WATCH",
            required_qty=required_qty,
            ref_date=ref_date,
        )
        if watch_probe is not None:
            escalated_drug, escalated_batch = watch_probe
            rationale = (
                f"No feasible ACCESS regimen exists; escalate to {escalated_drug.aware_category} agent "
                f"{escalated_drug.generic_name} (lot {escalated_batch.lot_number}) with pharmacist approval."
                if language == "en"
                else (
                    f"নিরাপদ ACCESS বিকল্প না থাকায় ফার্মাসিস্ট অনুমোদনে {escalated_drug.aware_category} শ্রেণির "
                    f"{escalated_drug.generic_name_bn or escalated_drug.generic_name} বিবেচনা করা যায়।"
                )
            )
            relaxations.append(
                SafeRelaxation(
                    action="ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL",
                    rationale=rationale,
                    candidate_drug=escalated_drug.drug_code,
                )
            )

    # 2. Upazila stock transfer for clinically safe, tier-allowed candidates lacking local valid stock
    max_tier_rank = TIER_RANK[max_aware_tier] if max_aware_tier else None
    stock_transfer_candidates: list[tuple[int, int, AntibioticSpec]] = []

    for drug, line_rank in candidates:
        if _drug_clinical_blocks(drug, patient, expanded_allergies):
            continue
        if max_tier_rank is not None and TIER_RANK[drug.aware_category] > max_tier_rank:
            continue
        drug_batches = batches_by_code.get(drug.drug_code.strip().upper(), [])
        has_valid_stock = any(
            b.qty_remaining >= required_qty and _days_to_expiry(b, ref_date) > 0
            for b in drug_batches
        )
        if not has_valid_stock:
            stock_transfer_candidates.append((drug.aware_tier_cost, line_rank, drug))

    if stock_transfer_candidates:
        stock_transfer_candidates.sort(key=lambda item: (item[0], item[1]))
        best_transfer_drug = stock_transfer_candidates[0][2]
        rationale = (
            f"Clinically safe guideline option {best_transfer_drug.generic_name} lacks valid local FEFO stock; "
            "request emergency Upazila health complex stock transfer or refer patient."
            if language == "en"
            else (
                f"নিরাপদ নির্দেশিত অ্যান্টিবায়োটিক {best_transfer_drug.generic_name_bn or best_transfer_drug.generic_name} "
                "ক্লিনিকে বৈধ মজুদে নেই; উপজেলা স্বাস্থ্য কমপ্লেক্স থেকে জরুরি স্টক স্থানান্তর বা রেফারেল করুন।"
            )
        )
        relaxations.append(
            SafeRelaxation(
                action="REFER_UPAZILA_STOCK_TRANSFER",
                rationale=rationale,
                candidate_drug=best_transfer_drug.drug_code,
            )
        )

    # 3. Safe conservative fallback when no antibiotic can be safely dispensed locally
    symptomatic_rationale = (
        "Provide safe symptomatic supportive care and close clinical reassessment or physician referral "
        "without dispensing contraindicated, expired, or out-of-stock antibiotics."
        if language == "en"
        else (
            "নিষিদ্ধ বা মেয়াদোত্তীর্ণ অ্যান্টিবায়োটিক না দিয়ে নিরাপদ উপসর্গভিত্তিক পরিচর্যা এবং "
            "প্রয়োজনে চিকিৎসক/হাসপাতালে রেফার করুন।"
        )
    )
    relaxations.append(
        SafeRelaxation(
            action="SWITCH_TO_SYMPTOMATIC_CARE",
            rationale=symptomatic_rationale,
            candidate_drug=None,
        )
    )

    return relaxations


def solve_aware_regimen(spec: OptimizeRequestSpec) -> SolverResult:
    """Solve WHO AWaRe antibiotic selection using 3-pass OR-Tools CP-SAT."""
    ref_date = spec.reference_date or date.today()
    severity_up = spec.severity.strip().upper()

    # Viral Mild No-Antibiotic Gate (unless explicitly probing a forced drug in conflict checks)
    if (
        spec.forced_drug_code is None
        and spec.guideline.viral_no_antibiotic_if_mild
        and severity_up == "MILD"
    ):
        return SolverResult(
            solver_status="NO_ANTIBIOTIC",
            aware_category="NO_ANTIBIOTIC",
            recommended_antibiotic=None,
            recommended_batch=None,
            mus_conflicts=[],
            safe_relaxations=[],
        )

    candidates = _select_candidates(spec.guideline, spec.catalog, spec.forced_drug_code)
    batches_by_code = _index_batches(candidates, spec.batches)
    expanded_allergies = expand_allergies(spec.patient.allergies)

    # Pass 1: Constrained optimization
    winner = _run_pass1_optimization(
        candidates=candidates,
        batches_by_code=batches_by_code,
        patient=spec.patient,
        expanded_allergies=expanded_allergies,
        max_aware_tier=spec.max_aware_tier,
        required_qty=spec.required_qty,
        ref_date=ref_date,
    )
    if winner is not None:
        drug, batch = winner
        return SolverResult(
            solver_status="OPTIMAL",
            aware_category=drug.aware_category,
            recommended_antibiotic=drug,
            recommended_batch=batch,
            mus_conflicts=[],
            safe_relaxations=[],
        )

    # Pass 2: Objective-free MUS extraction
    mus_conflicts = _run_pass2_mus(
        candidates=candidates,
        batches_by_code=batches_by_code,
        patient=spec.patient,
        expanded_allergies=expanded_allergies,
        max_aware_tier=spec.max_aware_tier,
        required_qty=spec.required_qty,
        ref_date=ref_date,
        syndrome_code=spec.guideline.syndrome_code,
    )

    # Pass 3: Safe relaxations
    safe_relaxations = _run_pass3_relaxations(
        candidates=candidates,
        batches_by_code=batches_by_code,
        patient=spec.patient,
        expanded_allergies=expanded_allergies,
        max_aware_tier=spec.max_aware_tier,
        required_qty=spec.required_qty,
        ref_date=ref_date,
        mus_conflicts=mus_conflicts,
        language=spec.language,
    )

    return SolverResult(
        solver_status="INFEASIBLE",
        aware_category="NO_ANTIBIOTIC",
        recommended_antibiotic=None,
        recommended_batch=None,
        mus_conflicts=mus_conflicts,
        safe_relaxations=safe_relaxations,
    )
