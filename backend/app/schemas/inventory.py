from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BatchCreate(BaseModel):
    antibiotic_id: UUID
    lot_number: str | None = Field(default=None, max_length=64)
    batch_number: str | None = Field(default=None, max_length=64)
    qty_initial: int = Field(ge=0)
    qty_remaining: int | None = Field(default=None, ge=0)
    expiry_date: date
    unit: str = Field(default="tablets", min_length=1, max_length=32)

    @model_validator(mode="after")
    def _normalize_lot_and_qty(self) -> BatchCreate:
        resolved_lot = (self.lot_number or self.batch_number or "").strip()
        if not resolved_lot:
            raise ValueError("lot_number or batch_number is required.")
        if len(resolved_lot) > 64:
            raise ValueError("lot_number must be at most 64 characters.")
        self.lot_number = resolved_lot
        self.unit = self.unit.strip() or "tablets"
        if self.qty_remaining is None:
            self.qty_remaining = self.qty_initial
        if self.qty_remaining > self.qty_initial:
            raise ValueError("qty_remaining cannot exceed qty_initial.")
        return self


class BatchPatch(BaseModel):
    qty_remaining: int | None = Field(default=None, ge=0)
    expiry_date: date | None = None
    lot_number: str | None = Field(default=None, max_length=64)
    batch_number: str | None = Field(default=None, max_length=64)
    unit: str | None = Field(default=None, min_length=1, max_length=32)

    @model_validator(mode="after")
    def _normalize_optional_lot(self) -> BatchPatch:
        candidate = self.lot_number if self.lot_number is not None else self.batch_number
        if candidate is not None:
            cleaned = candidate.strip()
            if not cleaned:
                raise ValueError("lot_number must not be empty.")
            self.lot_number = cleaned
        if self.unit is not None:
            cleaned_unit = self.unit.strip()
            if not cleaned_unit:
                raise ValueError("unit must not be empty.")
            self.unit = cleaned_unit
        return self


class BatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    clinic_id: UUID
    antibiotic_id: UUID
    drug_code: str
    generic_name: str
    generic_name_bn: str = ""
    drug_class: str
    aware_category: Literal["ACCESS", "WATCH", "RESERVE"]
    aware_tier_cost: int
    pregnancy_contraindicated: bool
    renal_contraindicated_egfr_lt: float | None = None
    min_age_years: int
    dose_regimen_en: str = ""
    dose_regimen_bn: str = ""
    lot_number: str
    qty_initial: int
    qty_remaining: int
    expiry_date: date
    days_to_expiry: int
    unit: str
    version: int
    updated_at: datetime
    antibiotic_code: str
    antibiotic_name: str
    aware_tier: Literal["ACCESS", "WATCH", "RESERVE"]
    batch_number: str
