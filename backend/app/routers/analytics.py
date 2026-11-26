from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import CurrentUser, require_roles
from app.db.session import get_db
from app.schemas.analytics import StewardshipAnalyticsOut
from app.services.analytics_service import get_stewardship_analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])

ReadRoles = Annotated[
    CurrentUser,
    Depends(require_roles("dispenser", "pharmacist", "auditor", "admin")),
]
DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/stewardship", response_model=StewardshipAnalyticsOut)
async def get_stewardship_summary(
    current_user: ReadRoles,
    db: DbSession,
) -> StewardshipAnalyticsOut:
    return await get_stewardship_analytics(db=db, clinic_id=current_user.clinic_id)
