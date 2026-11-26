from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ClinicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    upazila: str
    district: str
    target_access_pct: Decimal


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    role: Literal["dispenser", "pharmacist", "auditor", "admin"]
    password: str = Field(min_length=8, max_length=128)
    pin: str | None = Field(default=None, min_length=4, max_length=12)
    clinic_id: UUID | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    clinic_id: UUID
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    created_at: datetime


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    clinic_id: UUID | None
    actor_user_id: UUID | None
    actor_role: str | None
    action: str
    resource_type: str
    resource_id: str | None
    trace_id: str
    details: dict[str, Any]
    created_at: datetime


class GuidelineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    syndrome_code: str
    syndrome_name_en: str
    syndrome_name_bn: str
    severity: str
    viral_no_antibiotic_if_mild: bool
    first_line_drug_codes: list[str]
    second_line_drug_codes: list[str]
    default_duration_days: int
    guidance_en: str
    guidance_bn: str


class AntibioticCatalogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    drug_code: str
    generic_name: str
    generic_name_bn: str
    drug_class: str
    aware_category: str
    aware_tier_cost: int
    pregnancy_contraindicated: bool
    renal_contraindicated_egfr_lt: Decimal | None
    min_age_years: int
    dose_regimen_en: str
    dose_regimen_bn: str
    is_active: bool
