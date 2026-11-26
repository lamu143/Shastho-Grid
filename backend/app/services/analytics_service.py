from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.db.models import Clinic, Dispense, InventoryBatch
from app.schemas.analytics import StewardshipAnalyticsOut


async def get_stewardship_analytics(
    db: AsyncSession,
    clinic_id: UUID,
) -> StewardshipAnalyticsOut:
    clinic = (
        await db.execute(select(Clinic).where(Clinic.id == clinic_id))
    ).scalar_one_or_none()
    if clinic is None:
        raise NotFoundError(
            message="Clinic not found.",
            error_code="CLINIC_NOT_FOUND",
            details={"clinic_id": str(clinic_id)},
        )

    counts_stmt = (
        select(Dispense.aware_category_snapshot, func.count(Dispense.id))
        .where(
            Dispense.clinic_id == clinic_id,
            Dispense.status == "DISPENSED",
        )
        .group_by(Dispense.aware_category_snapshot)
    )
    rows = (await db.execute(counts_stmt)).all()
    counts_by_cat: dict[str, int] = {str(cat): int(cnt) for cat, cnt in rows}

    access_count = counts_by_cat.get("ACCESS", 0)
    watch_count = counts_by_cat.get("WATCH", 0)
    reserve_count = counts_by_cat.get("RESERVE", 0)
    no_antibiotic_count = counts_by_cat.get("NO_ANTIBIOTIC", 0)

    antibiotic_dispensed = access_count + watch_count + reserve_count
    total_dispensed = antibiotic_dispensed + no_antibiotic_count
    access_ratio_pct = (
        round((access_count / antibiotic_dispensed) * 100.0, 2)
        if antibiotic_dispensed > 0
        else 0.0
    )
    target_access_pct = float(clinic.target_access_pct)
    meets_who_target = (antibiotic_dispensed > 0) and (
        access_ratio_pct >= target_access_pct
    )

    today = date.today()
    soon_cutoff = today + timedelta(days=30)
    expiring_soon_count = int(
        (
            await db.execute(
                select(func.count(InventoryBatch.id)).where(
                    InventoryBatch.clinic_id == clinic_id,
                    InventoryBatch.qty_remaining > 0,
                    InventoryBatch.expiry_date > today,
                    InventoryBatch.expiry_date <= soon_cutoff,
                )
            )
        ).scalar_one()
    )
    stocked_out_count = int(
        (
            await db.execute(
                select(func.count(InventoryBatch.id)).where(
                    InventoryBatch.clinic_id == clinic_id,
                    InventoryBatch.qty_remaining == 0,
                )
            )
        ).scalar_one()
    )

    return StewardshipAnalyticsOut(
        clinic_id=clinic.id,
        clinic_name=clinic.name,
        total_dispensed=total_dispensed,
        antibiotic_dispensed=antibiotic_dispensed,
        access_count=access_count,
        watch_count=watch_count,
        reserve_count=reserve_count,
        no_antibiotic_count=no_antibiotic_count,
        access_ratio_pct=access_ratio_pct,
        target_access_pct=target_access_pct,
        meets_who_target=meets_who_target,
        expiring_soon_count=expiring_soon_count,
        stocked_out_count=stocked_out_count,
    )
