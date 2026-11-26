from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.admin import AntibioticCatalogOut, GuidelineOut
from app.schemas.analytics import StewardshipAnalyticsOut
from app.schemas.dispenses import DispenseOut
from app.schemas.inventory import BatchOut
from app.schemas.patients import PatientOut


class SyncMutationIn(BaseModel):
    client_mutation_id: UUID
    entity_type: Literal["PATIENT", "DISPENSE", "INVENTORY"]
    entity_id: UUID
    base_version: int = Field(ge=0)
    payload: dict[str, Any] = Field(default_factory=dict)


class SyncMutationOut(BaseModel):
    status: Literal["SYNCED", "APPLIED", "DUPLICATE"] = "SYNCED"
    client_mutation_id: UUID
    entity_type: Literal["PATIENT", "DISPENSE", "INVENTORY"]
    entity_id: UUID
    new_version: int
    entity_snapshot: dict[str, Any]


class ConflictEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    clinic_id: UUID
    mutation_id: UUID
    entity_type: Literal["PATIENT", "DISPENSE", "INVENTORY"]
    entity_id: UUID
    server_snapshot: dict[str, Any]
    client_snapshot: dict[str, Any]
    cpsat_verdict: dict[str, Any]
    status: Literal["OPEN", "RESOLVED_SERVER", "RESOLVED_CLIENT", "RESOLVED_MERGED"]
    resolution_status: Literal["OPEN", "RESOLVED_SERVER", "RESOLVED_CLIENT", "RESOLVED_MERGED"]
    resolution_notes: str | None = None
    resolved_by: UUID | None = None
    created_at: datetime
    resolved_at: datetime | None = None


class ConflictResolveIn(BaseModel):
    resolution: Literal["RESOLVED_SERVER", "RESOLVED_CLIENT", "RESOLVED_MERGED"]
    notes: str | None = None
    merged_payload: dict[str, Any] = Field(default_factory=dict)


class ConflictResolveOut(BaseModel):
    id: UUID
    status: Literal["RESOLVED_SERVER", "RESOLVED_CLIENT", "RESOLVED_MERGED"]
    entity_snapshot: dict[str, Any]
    cpsat_verdict: dict[str, Any]


class SyncBootstrapOut(BaseModel):
    patients: list[PatientOut]
    batches: list[BatchOut]
    guidelines: list[GuidelineOut]
    catalog: list[AntibioticCatalogOut]
    dispenses: list[DispenseOut]
    conflicts: list[ConflictEventOut]
    analytics: StewardshipAnalyticsOut
