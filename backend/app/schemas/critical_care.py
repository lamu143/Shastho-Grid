from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

FacilityTier = Literal["PUBLIC", "PRIVATE", "BLOOD_HUB"]
ResourceType = Literal["ICU_BED", "VENTILATOR", "HDU_BED", "NICU_BED"]
BloodGroup = Literal["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]
Specialty = Literal["TRAUMA", "OBSTETRIC", "NEURO", "CARDIAC", "PEDIATRIC"]
FacilitySort = Literal["eta", "available_icu", "occupancy", "name"]


class HospitalResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resource_type: ResourceType
    total_physical_count: int
    staffed_capacity_count: int
    available_count: int
    data_source: Literal["SEED_DEMO", "STAFF", "FEED"] = "SEED_DEMO"
    reported_at: datetime | None = None
    version: int
    updated_at: datetime


class BloodInventoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    blood_type: BloodGroup
    units_available: int
    units_reserved: int
    nearest_expiry_date: date | None
    data_source: Literal["SEED_DEMO", "STAFF", "FEED"] = "SEED_DEMO"
    reported_at: datetime | None = None
    version: int
    updated_at: datetime


class FacilityOut(BaseModel):
    id: UUID
    code: str
    name: str
    tier: FacilityTier
    division: str
    district: str
    lat: float
    lon: float
    coords_verified: bool
    specialties: list[Specialty]
    resources: list[HospitalResourceOut]
    blood: list[BloodInventoryOut]
    distance_km: float | None = None
    eta_minutes: float | None = None
    icu_available: int = 0
    icu_staffed: int = 0
    icu_occupancy_pct: float | None = None
    compatible_blood_units: int | None = None
    data_freshness: Literal["DEMO", "LIVE", "STALE"] = "DEMO"
    last_updated_at: datetime | None = None
    data_is_simulated: bool = True


class FacilityListOut(BaseModel):
    items: list[FacilityOut]
    total: int
    routing_source: Literal["haversine_urban"] = "haversine_urban"


class ResourceUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_physical_count: int | None = Field(default=None, ge=0, le=10_000)
    staffed_capacity_count: int | None = Field(default=None, ge=0, le=10_000)
    available_count: int | None = Field(default=None, ge=0, le=10_000)
    expected_version: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _at_least_one(self) -> "ResourceUpdateIn":
        if (
            self.total_physical_count is None
            and self.staffed_capacity_count is None
            and self.available_count is None
        ):
            raise ValueError("Provide at least one count to update.")
        return self


class BloodUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    units_available: int = Field(ge=0, le=10_000)
    nearest_expiry_date: date | None = None
    expected_version: int | None = Field(default=None, ge=1)


class News2In(BaseModel):
    model_config = ConfigDict(extra="forbid")

    respiration_rate: int = Field(ge=0, le=80)
    spo2: int = Field(ge=50, le=100)
    on_oxygen: bool
    systolic_bp: int = Field(ge=30, le=300)
    pulse: int = Field(ge=0, le=300)
    consciousness: Literal["A", "C", "V", "P", "U"]
    temperature_c: float = Field(ge=25.0, le=45.0)
    spo2_scale2: bool = False


class News2Out(BaseModel):
    score: int
    acuity: Literal["RED_CRITICAL", "ORANGE_URGENT", "YELLOW_ELEVATED", "GREEN_STABLE"]
    clinical_risk: Literal["LOW", "LOW_MEDIUM", "MEDIUM", "HIGH"]
    response: str
    breakdown: dict[str, int]
    red_flags: list[str]


class BloodCompatibilityOut(BaseModel):
    recipient: BloodGroup
    compatible_donors: list[BloodGroup]
    preferred_order: list[BloodGroup]


class CriticalCareSummaryOut(BaseModel):
    facilities: int
    icu_physical: int
    icu_staffed: int
    icu_available: int
    icu_idle_unstaffed: int
    icu_idle_unstaffed_pct: float
    ventilators_available: int
    blood_units_by_group: dict[str, int]
    scarce_blood_groups: list[str]
    data_is_simulated: bool = True


class InsightCapacity(BaseModel):
    physical: int = 0
    staffed: int = 0
    available: int = 0


class InsightBloodCell(BaseModel):
    units: int
    reserved: int
    nearest_expiry_date: date | None
    expiring_soon: bool


class InsightFacility(BaseModel):
    id: UUID
    code: str
    name: str
    tier: FacilityTier
    data_freshness: Literal["DEMO", "LIVE", "STALE"]
    last_updated_at: datetime | None
    icu: InsightCapacity
    ventilator: InsightCapacity
    blood: dict[str, InsightBloodCell]


class CriticalCareInsightsOut(BaseModel):
    window_days: int
    generated_at: datetime
    facilities: list[InsightFacility]
    icu_occupancy_pct: float
    icu_idle_unstaffed: int
    ventilators_available: int
    live_coverage_pct: float
    blood_units_by_group: dict[str, int]
    scarce_blood_groups: list[str]
    expiring_soon_units: int
    holds_by_status: dict[str, int]
    hold_expiry_rate_pct: float | None
    carematch_runs: int
    carematch_infeasible: int
    carematch_median_ms: float | None
    news2_mean: float | None


# ------------------------------------------------------------------ CareMatch


class CareMatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    incident_lat: float = Field(ge=20.5, le=26.7, description="Bangladesh latitude range")
    incident_lon: float = Field(ge=88.0, le=92.7, description="Bangladesh longitude range")
    vitals: News2In | None = None
    needs_icu: bool = True
    needs_vent: bool = False
    specialty: Specialty | None = None
    blood_type: BloodGroup | None = None
    blood_units: int = Field(default=0, ge=0, le=10)
    public_only: bool = False
    max_eta_minutes: float | None = Field(default=None, gt=0, le=240)

    @model_validator(mode="after")
    def _blood_pairing(self) -> "CareMatchIn":
        if self.blood_units > 0 and self.blood_type is None:
            raise ValueError("blood_type is required when blood_units > 0.")
        return self


class HospitalOptionOut(BaseModel):
    facility_id: UUID
    code: str
    name: str
    tier: FacilityTier
    eta_minutes: float
    distance_km: float
    icu_available: int
    vent_available: int
    blood_plan: list[tuple[BloodGroup, int]] | None
    cost: int


class BloodSourceOut(BaseModel):
    facility_id: UUID
    code: str
    name: str
    tier: FacilityTier
    blood_type: BloodGroup
    units: int
    plan: list[tuple[BloodGroup, int]] | None
    courier_distance_km: float
    courier_eta_minutes: float


class RepairOut(BaseModel):
    repair_type: Literal["SPLIT_RESOURCE_CO_DISPATCH", "RELAX_PUBLIC_ONLY", "RELAX_MAX_ETA"]
    title: str
    relaxed: list[str]
    clinical_compromise: bool
    hospital: HospitalOptionOut
    blood_source: BloodSourceOut | None = None
    note: str


class ConflictProofOut(BaseModel):
    """ConflictProof: why no single hospital works, and verified ways out."""

    mus_cores: list[list[str]]
    solver_core: list[str]
    labels: dict[str, str]
    repairs: list[RepairOut]


class CareMatchOut(BaseModel):
    triage_request_id: UUID
    status: Literal["OPTIMAL", "INFEASIBLE"]
    news2: News2Out | None
    active_constraints: list[str]
    recommendation: HospitalOptionOut | None
    alternatives: list[HospitalOptionOut]
    conflict_proof: ConflictProofOut | None
    wall_time_ms: float
    routing_source: Literal["haversine_urban", "osrm", "mixed"]
    requires_human_approval: bool = True
    stale_facilities: list[str] = []
    data_is_simulated: bool = True
