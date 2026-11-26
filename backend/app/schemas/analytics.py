from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class StewardshipAnalyticsOut(BaseModel):
    clinic_id: UUID
    clinic_name: str
    total_dispensed: int
    antibiotic_dispensed: int
    access_count: int
    watch_count: int
    reserve_count: int
    no_antibiotic_count: int
    access_ratio_pct: float
    target_access_pct: float
    meets_who_target: bool
    expiring_soon_count: int
    stocked_out_count: int
