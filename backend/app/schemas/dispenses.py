from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DispenseCreate(BaseModel):
    id: UUID | None = None
    patient_id: UUID
    batch_id: UUID | None = None
    antibiotic_id: UUID | None = None
    guideline_id: UUID | None = None
    syndrome_code: str | None = Field(default=None, max_length=64)
    severity: Literal["MILD", "MODERATE", "SEVERE"] | None = None
    aware_category: Literal["ACCESS", "WATCH", "RESERVE", "NO_ANTIBIOTIC"] | None = None
    aware_category_snapshot: Literal["ACCESS", "WATCH", "RESERVE", "NO_ANTIBIOTIC"] | None = None
    qty: int | None = Field(default=None, ge=0)
    qty_dispensed: int | None = Field(default=None, ge=0)
    days_supply: int = Field(default=5, ge=0)
    notes: str | None = None
    decision_reason: str | None = None
    solver_status: Literal["OPTIMAL", "INFEASIBLE", "NO_ANTIBIOTIC", "OFFLINE_FALLBACK"] | None = None
    solver_verdict: dict[str, Any] = Field(default_factory=dict)
    client_mutation_id: UUID | None = None

    @model_validator(mode="after")
    def _normalize_aliases(self) -> DispenseCreate:
        if self.syndrome_code is not None:
            cleaned = self.syndrome_code.strip().upper()
            self.syndrome_code = cleaned or None
        resolved_aware = self.aware_category_snapshot or self.aware_category
        self.aware_category = resolved_aware
        self.aware_category_snapshot = resolved_aware

        if self.qty_dispensed is not None:
            resolved_qty = self.qty_dispensed
        elif self.qty is not None:
            resolved_qty = self.qty
        elif resolved_aware == "NO_ANTIBIOTIC":
            resolved_qty = 0
        else:
            resolved_qty = 1
        self.qty = resolved_qty
        self.qty_dispensed = resolved_qty

        resolved_reason = (
            self.decision_reason if self.decision_reason is not None else self.notes
        )
        self.decision_reason = resolved_reason
        self.notes = resolved_reason
        return self


class DispenseActionNote(BaseModel):
    reason: str | None = None
    notes: str | None = None

    def resolved_reason(self) -> str | None:
        raw = self.reason if self.reason is not None else self.notes
        if raw is None:
            return None
        cleaned = raw.strip()
        return cleaned or None


class DispenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    clinic_id: UUID
    patient_id: UUID
    guideline_id: UUID | None = None
    antibiotic_id: UUID | None = None
    batch_id: UUID | None = None
    prescriber_id: UUID
    approver_id: UUID | None = None
    drug_code: str | None = None
    antibiotic_code: str | None = None
    syndrome_code: str = ""
    aware_category: Literal["ACCESS", "WATCH", "RESERVE", "NO_ANTIBIOTIC"]
    aware_category_snapshot: Literal["ACCESS", "WATCH", "RESERVE", "NO_ANTIBIOTIC"]
    qty: int
    qty_dispensed: int
    days_supply: int
    status: Literal["DRAFT", "PENDING_APPROVAL", "DISPENSED", "REJECTED", "VOIDED"]
    solver_status: str
    solver_verdict: dict[str, Any] = Field(default_factory=dict)
    decision_reason: str | None = None
    notes: str | None = None
    severity: str | None = None
    patient_name: str | None = None
    generic_name: str | None = None
    lot_number: str | None = None
    client_mutation_id: UUID | None = None
    version: int
    created_at: datetime
    dispensed_at: datetime | None = None
    updated_at: datetime
