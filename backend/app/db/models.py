from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Clinic(Base):
    __tablename__ = "clinics"
    __table_args__ = (
        CheckConstraint(
            "target_access_pct >= 0 AND target_access_pct <= 100",
            name="ck_clinics_target_access_pct",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    upazila: Mapped[str] = mapped_column(String(100), nullable=False)
    district: Mapped[str] = mapped_column(String(100), nullable=False)
    target_access_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("60.00"), server_default="60.00"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=text("now()")
    )

    users: Mapped[list["User"]] = relationship(back_populates="clinic")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('dispenser','pharmacist','auditor','admin',"
            "'dispatcher','hospital_admin','blood_bank_officer')",
            name="ck_users_role",
        ),
        Index("ix_users_clinic_role", "clinic_id", "role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False
    )
    # Critical-care staff (hospital_admin / blood_bank_officer) are scoped to one facility.
    facility_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=text("now()")
    )

    clinic: Mapped["Clinic"] = relationship(back_populates="users")


class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = (
        UniqueConstraint("clinic_id", "mrn", name="uq_patients_clinic_mrn"),
        CheckConstraint("age_years >= 0 AND age_years <= 130", name="ck_patients_age_years"),
        CheckConstraint("weight_kg > 0", name="ck_patients_weight_kg"),
        CheckConstraint("sex IN ('M','F','O')", name="ck_patients_sex"),
        CheckConstraint("egfr IS NULL OR egfr >= 0", name="ck_patients_egfr"),
        CheckConstraint("NOT is_pregnant OR sex = 'F'", name="ck_patients_pregnant_female"),
        CheckConstraint("version >= 1", name="ck_patients_version"),
        Index("ix_patients_clinic_updated", "clinic_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False
    )
    mrn: Mapped[str] = mapped_column(String(64), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    age_years: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    sex: Mapped[str] = mapped_column(String(1), nullable=False)
    is_pregnant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    egfr: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    allergies: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=text("now()")
    )


class AwareGuideline(Base):
    __tablename__ = "aware_guidelines"
    __table_args__ = (
        CheckConstraint("severity IN ('MILD','MODERATE','SEVERE')", name="ck_aware_guidelines_severity"),
        CheckConstraint("default_duration_days > 0", name="ck_aware_guidelines_duration"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    syndrome_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    syndrome_name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    syndrome_name_bn: Mapped[str] = mapped_column(String(200), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="MILD", server_default="MILD")
    viral_no_antibiotic_if_mild: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    first_line_drug_codes: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    second_line_drug_codes: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    default_duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    guidance_en: Mapped[str] = mapped_column(Text, nullable=False)
    guidance_bn: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )


class AntibioticCatalog(Base):
    __tablename__ = "antibiotic_catalog"
    __table_args__ = (
        CheckConstraint("aware_category IN ('ACCESS','WATCH','RESERVE')", name="ck_antibiotic_catalog_category"),
        CheckConstraint(
            "(aware_category='ACCESS' AND aware_tier_cost=1) "
            "OR (aware_category='WATCH' AND aware_tier_cost=15) "
            "OR (aware_category='RESERVE' AND aware_tier_cost=120)",
            name="ck_antibiotic_catalog_tier_cost",
        ),
        CheckConstraint("min_age_years >= 0", name="ck_antibiotic_catalog_min_age"),
        CheckConstraint(
            "renal_contraindicated_egfr_lt IS NULL OR renal_contraindicated_egfr_lt >= 0",
            name="ck_antibiotic_catalog_renal_egfr",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    drug_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    generic_name: Mapped[str] = mapped_column(String(160), nullable=False)
    generic_name_bn: Mapped[str] = mapped_column(String(200), nullable=False)
    drug_class: Mapped[str] = mapped_column(String(64), nullable=False)
    aware_category: Mapped[str] = mapped_column(String(16), nullable=False)
    aware_tier_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    pregnancy_contraindicated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    renal_contraindicated_egfr_lt: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    min_age_years: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    dose_regimen_en: Mapped[str] = mapped_column(Text, nullable=False)
    dose_regimen_bn: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )


class InventoryBatch(Base):
    __tablename__ = "inventory_batches"
    __table_args__ = (
        UniqueConstraint(
            "clinic_id",
            "antibiotic_id",
            "lot_number",
            name="uq_inventory_batches_clinic_abx_lot",
        ),
        CheckConstraint("qty_initial >= 0", name="ck_inventory_batches_qty_initial"),
        CheckConstraint(
            "qty_remaining >= 0 AND qty_remaining <= qty_initial",
            name="ck_inventory_batches_qty_remaining",
        ),
        CheckConstraint("version >= 1", name="ck_inventory_batches_version"),
        Index("ix_inventory_batches_fefo", "clinic_id", "antibiotic_id", "expiry_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False
    )
    antibiotic_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("antibiotic_catalog.id", ondelete="RESTRICT"), nullable=False
    )
    lot_number: Mapped[str] = mapped_column(String(64), nullable=False)
    qty_initial: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_remaining: Mapped[int] = mapped_column(Integer, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False, default="tablets", server_default="tablets")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=text("now()")
    )


class Dispense(Base):
    __tablename__ = "dispenses"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT','PENDING_APPROVAL','DISPENSED','REJECTED','VOIDED')",
            name="ck_dispenses_status",
        ),
        CheckConstraint(
            "aware_category_snapshot IN ('ACCESS','WATCH','RESERVE','NO_ANTIBIOTIC')",
            name="ck_dispenses_aware_category",
        ),
        CheckConstraint(
            "solver_status IN ('OPTIMAL','INFEASIBLE','NO_ANTIBIOTIC','OFFLINE_FALLBACK')",
            name="ck_dispenses_solver_status",
        ),
        CheckConstraint("qty_dispensed >= 0", name="ck_dispenses_qty"),
        CheckConstraint("days_supply >= 0", name="ck_dispenses_days_supply"),
        CheckConstraint("version >= 1", name="ck_dispenses_version"),
        Index("ix_dispenses_clinic_status_created", "clinic_id", "status", "created_at"),
        Index("ix_dispenses_clinic_aware", "clinic_id", "aware_category_snapshot"),
        Index("ix_dispenses_patient", "patient_id"),
        Index("ix_dispenses_clinic_client_mut", "clinic_id", "client_mutation_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False
    )
    guideline_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("aware_guidelines.id", ondelete="RESTRICT"), nullable=True
    )
    antibiotic_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("antibiotic_catalog.id", ondelete="RESTRICT"), nullable=True
    )
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("inventory_batches.id", ondelete="RESTRICT"), nullable=True
    )
    prescriber_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    approver_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT", server_default="DRAFT")
    aware_category_snapshot: Mapped[str] = mapped_column(String(24), nullable=False)
    qty_dispensed: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    days_supply: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    solver_status: Mapped[str] = mapped_column(String(24), nullable=False, default="OPTIMAL", server_default="OPTIMAL")
    solver_verdict: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_mutation_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )
    dispensed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=text("now()")
    )


class SyncMutationLog(Base):
    __tablename__ = "sync_mutations_log"
    __table_args__ = (
        UniqueConstraint("clinic_id", "client_mutation_id", name="uq_sync_mutations_clinic_client_mut"),
        CheckConstraint("entity_type IN ('PATIENT','DISPENSE','INVENTORY')", name="ck_sync_mutations_entity_type"),
        CheckConstraint("status IN ('APPLIED','CONFLICT','REJECTED','DUPLICATE')", name="ck_sync_mutations_status"),
        CheckConstraint("base_version >= 0", name="ck_sync_mutations_base_version"),
        CheckConstraint("server_version_at_receipt >= 0", name="ck_sync_mutations_server_version"),
        Index("ix_sync_mutations_entity", "clinic_id", "entity_type", "entity_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    client_mutation_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(24), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    base_version: Mapped[int] = mapped_column(Integer, nullable=False)
    server_version_at_receipt: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )


class ConflictResolutionEvent(Base):
    __tablename__ = "conflict_resolution_events"
    __table_args__ = (
        CheckConstraint("entity_type IN ('PATIENT','DISPENSE','INVENTORY')", name="ck_conflict_events_entity_type"),
        CheckConstraint(
            "resolution_status IN ('OPEN','RESOLVED_SERVER','RESOLVED_CLIENT','RESOLVED_MERGED')",
            name="ck_conflict_events_status",
        ),
        Index("ix_conflict_events_clinic_status", "clinic_id", "resolution_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False
    )
    mutation_log_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("sync_mutations_log.id", ondelete="RESTRICT"), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String(24), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    server_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    client_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    cpsat_verdict: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    resolution_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="OPEN", server_default="OPEN"
    )
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint(
            "clinic_id",
            "user_id",
            "method",
            "path",
            "idempotency_key",
            name="uq_idempotency_scope_key",
            postgresql_nulls_not_distinct=True,
        ),
        Index("ix_idempotency_expires_at", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    method: Mapped[str] = mapped_column(String(16), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[Any] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_clinic_created", "clinic_id", "created_at"),
        Index("ix_audit_logs_trace_id", "trace_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=True
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    actor_role: Mapped[str | None] = mapped_column(String(24), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )


# ---------------------------------------------------------------------------
# Critical care (CareMatch / LockStep): facilities, staffed beds, blood stock.
# Operational counts in seed data are simulated demo values.
# ---------------------------------------------------------------------------

FACILITY_TIERS = ("PUBLIC", "PRIVATE", "BLOOD_HUB")
RESOURCE_TYPES = ("ICU_BED", "VENTILATOR", "HDU_BED", "NICU_BED")
BLOOD_TYPES = ("O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+")
SPECIALTIES = ("TRAUMA", "OBSTETRIC", "NEURO", "CARDIAC", "PEDIATRIC")


class Facility(Base):
    __tablename__ = "facilities"
    __table_args__ = (
        CheckConstraint("tier IN ('PUBLIC','PRIVATE','BLOOD_HUB')", name="ck_facilities_tier"),
        CheckConstraint("lat BETWEEN -90 AND 90", name="ck_facilities_lat"),
        CheckConstraint("lon BETWEEN -180 AND 180", name="ck_facilities_lon"),
        Index("ix_facilities_tier_division", "tier", "division"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    tier: Mapped[str] = mapped_column(String(16), nullable=False)
    division: Mapped[str] = mapped_column(String(64), nullable=False, default="Dhaka", server_default="Dhaka")
    district: Mapped[str] = mapped_column(String(64), nullable=False, default="Dhaka", server_default="Dhaka")
    lat: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    lon: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    specialties: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    coords_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=text("now()")
    )

    resources: Mapped[list["HospitalResource"]] = relationship(
        back_populates="facility", cascade="all, delete-orphan", order_by="HospitalResource.resource_type"
    )
    blood: Mapped[list["BloodInventory"]] = relationship(
        back_populates="facility", cascade="all, delete-orphan", order_by="BloodInventory.blood_type"
    )


class HospitalResource(Base):
    """Physical vs staffed vs available capacity. The DB enforces 0 <= available <= staffed <= physical."""

    __tablename__ = "hospital_resources"
    __table_args__ = (
        UniqueConstraint("facility_id", "resource_type", name="uq_hospital_resources_facility_type"),
        CheckConstraint(
            "resource_type IN ('ICU_BED','VENTILATOR','HDU_BED','NICU_BED')",
            name="ck_hospital_resources_type",
        ),
        CheckConstraint("total_physical_count >= 0", name="ck_hospital_resources_physical"),
        CheckConstraint(
            "staffed_capacity_count >= 0 AND staffed_capacity_count <= total_physical_count",
            name="ck_hospital_resources_staffed",
        ),
        CheckConstraint(
            "available_count >= 0 AND available_count <= staffed_capacity_count",
            name="ck_hospital_resources_available",
        ),
        CheckConstraint("version >= 1", name="ck_hospital_resources_version"),
        Index("ix_hospital_resources_avail", "facility_id", "resource_type", "available_count"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    facility_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False
    )
    resource_type: Mapped[str] = mapped_column(String(24), nullable=False)
    total_physical_count: Mapped[int] = mapped_column(Integer, nullable=False)
    staffed_capacity_count: Mapped[int] = mapped_column(Integer, nullable=False)
    available_count: Mapped[int] = mapped_column(Integer, nullable=False)
    # Provenance: SEED_DEMO (simulated), STAFF (entered in the app), FEED (hospital system API).
    data_source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="SEED_DEMO", server_default="SEED_DEMO"
    )
    # When a human (STAFF) or hospital system (FEED) last vouched for these counts.
    # Reservation holds also touch updated_at, so freshness must use this instead.
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=text("now()")
    )

    facility: Mapped["Facility"] = relationship(back_populates="resources")


class BloodInventory(Base):
    __tablename__ = "blood_inventories"
    __table_args__ = (
        UniqueConstraint("facility_id", "blood_type", name="uq_blood_inventories_facility_type"),
        CheckConstraint(
            "blood_type IN ('O-','O+','A-','A+','B-','B+','AB-','AB+')",
            name="ck_blood_inventories_type",
        ),
        CheckConstraint("units_available >= 0", name="ck_blood_inventories_available"),
        CheckConstraint("units_reserved >= 0", name="ck_blood_inventories_reserved"),
        CheckConstraint("version >= 1", name="ck_blood_inventories_version"),
        Index("ix_blood_inventories_type_avail", "blood_type", "units_available"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    facility_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False
    )
    blood_type: Mapped[str] = mapped_column(String(4), nullable=False)
    units_available: Mapped[int] = mapped_column(Integer, nullable=False)
    units_reserved: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    nearest_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="SEED_DEMO", server_default="SEED_DEMO"
    )
    # When a human (STAFF) or hospital system (FEED) last vouched for these counts.
    # Reservation holds also touch updated_at, so freshness must use this instead.
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=text("now()")
    )

    facility: Mapped["Facility"] = relationship(back_populates="blood")


class TriageRequest(Base):
    """One CareMatch run: inputs, PulseScore, solver outcome and ConflictProof evidence."""

    __tablename__ = "triage_requests"
    __table_args__ = (
        CheckConstraint("solver_status IN ('OPTIMAL','INFEASIBLE')", name="ck_triage_requests_status"),
        CheckConstraint("news2_score IS NULL OR (news2_score BETWEEN 0 AND 20)", name="ck_triage_requests_news2"),
        Index("ix_triage_requests_user_created", "created_by_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    incident_lat: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    incident_lon: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    vitals: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    news2_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    acuity: Mapped[str | None] = mapped_column(String(24), nullable=True)
    constraints: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    solver_status: Mapped[str] = mapped_column(String(16), nullable=False)
    result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    solver_wall_time_ms: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )


RESERVATION_STATUSES = ("HELD", "CONFIRMED", "EN_ROUTE", "ADMITTED", "EXPIRED", "CANCELLED")


class Reservation(Base):
    """LockStep hold on a hospital's ICU bed / ventilator, optionally with co-dispatched blood."""

    __tablename__ = "reservations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('HELD','CONFIRMED','EN_ROUTE','ADMITTED','EXPIRED','CANCELLED')",
            name="ck_reservations_status",
        ),
        CheckConstraint("icu_resource_id IS NOT NULL OR vent_resource_id IS NOT NULL", name="ck_reservations_any_resource"),
        CheckConstraint("version >= 1", name="ck_reservations_version"),
        Index("ix_reservations_sweeper", "status", "hold_expires_at"),
        Index("ix_reservations_hospital_status", "hospital_id", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    triage_request_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("triage_requests.id", ondelete="SET NULL"), nullable=True
    )
    hospital_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="RESTRICT"), nullable=False
    )
    icu_resource_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("hospital_resources.id", ondelete="RESTRICT"), nullable=True
    )
    vent_resource_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("hospital_resources.id", ondelete="RESTRICT"), nullable=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="HELD")
    is_split_dispatch: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    hold_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow, server_default=text("now()")
    )

    blood_dispatches: Mapped[list["BloodDispatch"]] = relationship(
        back_populates="reservation", cascade="all, delete-orphan"
    )


class BloodDispatch(Base):
    """Blood units reserved for a reservation: one row per donor group drawn."""

    __tablename__ = "blood_dispatches"
    __table_args__ = (
        CheckConstraint("units > 0", name="ck_blood_dispatches_units"),
        CheckConstraint(
            "status IN ('RESERVED','DELIVERED','RELEASED')", name="ck_blood_dispatches_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reservation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False
    )
    source_facility_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="RESTRICT"), nullable=False
    )
    blood_inventory_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("blood_inventories.id", ondelete="RESTRICT"), nullable=False
    )
    recipient_blood_type: Mapped[str] = mapped_column(String(4), nullable=False)
    donor_blood_type: Mapped[str] = mapped_column(String(4), nullable=False)
    units: Mapped[int] = mapped_column(Integer, nullable=False)
    courier_eta_minutes: Mapped[float | None] = mapped_column(Numeric(6, 1), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="RESERVED")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )

    reservation: Mapped["Reservation"] = relationship(back_populates="blood_dispatches")


class AgentSession(Base):
    """One Shastho Copilot run. Stores only the redacted note, never raw identifiers."""

    __tablename__ = "agent_sessions"
    __table_args__ = (Index("ix_agent_sessions_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    triage_request_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("triage_requests.id", ondelete="SET NULL"), nullable=True
    )
    redacted_note: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(8), nullable=False)
    provider_used: Mapped[str] = mapped_column(String(64), nullable=False)
    extraction: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    tool_trace: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    brief: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )


DATA_SOURCES = ("SEED_DEMO", "STAFF", "FEED")


class FacilityFeedKey(Base):
    """API key a hospital / blood-bank system uses to push live capacity (only a hash is stored)."""

    __tablename__ = "facility_feed_keys"
    __table_args__ = (Index("ix_facility_feed_keys_prefix", "key_prefix"),)

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    facility_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=text("now()")
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
