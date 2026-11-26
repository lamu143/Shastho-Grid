from __future__ import annotations

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class PatientProfileIn(BaseModel):
    age_years: int = Field(ge=0, le=130)
    weight_kg: float = Field(gt=0, le=500)
    sex: Literal["M", "F", "O"]
    is_pregnant: bool = False
    egfr: float | None = Field(default=None, ge=0, le=300)
    allergies: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_pregnancy_sex(self) -> PatientProfileIn:
        if self.is_pregnant and self.sex != "F":
            raise ValueError("is_pregnant cannot be true when sex is not 'F'.")
        return self


class OptimizeRequest(BaseModel):
    patient_id: UUID | None = None
    patient_profile: PatientProfileIn | None = None
    syndrome_code: str = Field(min_length=1, max_length=64)
    severity: Literal["MILD", "MODERATE", "SEVERE"] = "MODERATE"
    max_aware_tier: Literal["ACCESS", "WATCH", "RESERVE"] | None = None
    language: Literal["en", "bn"] = "en"

    @model_validator(mode="after")
    def _validate_patient_source(self) -> OptimizeRequest:
        if self.patient_id is None and self.patient_profile is None:
            raise ValueError("Either patient_id or patient_profile must be provided.")
        return self


class RecommendedAntibioticOut(BaseModel):
    id: UUID
    drug_code: str
    generic_name: str
    generic_name_bn: str
    drug_class: str
    aware_category: Literal["ACCESS", "WATCH", "RESERVE"]
    aware_tier_cost: int
    dose_regimen_en: str
    dose_regimen_bn: str


class RecommendedBatchOut(BaseModel):
    id: UUID
    clinic_id: UUID
    antibiotic_id: UUID
    drug_code: str
    generic_name: str
    aware_category: Literal["ACCESS", "WATCH", "RESERVE"]
    lot_number: str
    qty_initial: int
    qty_remaining: int
    expiry_date: date
    days_to_expiry: int
    unit: str
    version: int


class MusConflictOut(BaseModel):
    code: str
    label: str
    detail: str


class SafeRelaxationOut(BaseModel):
    action: Literal[
        "SWITCH_TO_SYMPTOMATIC_CARE",
        "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL",
        "REFER_UPAZILA_STOCK_TRANSFER",
    ]
    rationale: str
    candidate_drug: str | None = None


class CounselingOut(BaseModel):
    summary: str
    instructions: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    model_used: str
    deidentified: bool = True
    hallucination_guard_passed: bool = True


class OptimizeResponse(BaseModel):
    solver_status: Literal["OPTIMAL", "INFEASIBLE", "NO_ANTIBIOTIC"]
    recommended_antibiotic: RecommendedAntibioticOut | None = None
    recommended_batch: RecommendedBatchOut | None = None
    aware_category: Literal["ACCESS", "WATCH", "RESERVE", "NO_ANTIBIOTIC"]
    mus_conflicts: list[MusConflictOut] = Field(default_factory=list)
    safe_relaxations: list[SafeRelaxationOut] = Field(default_factory=list)
    counseling: CounselingOut
