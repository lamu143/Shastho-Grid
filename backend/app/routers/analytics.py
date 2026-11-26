from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import CurrentUser, require_roles
from app.db.models import AntibioticCatalog, AuditLog, Dispense
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


@router.get("/lakehouse-export")
async def export_lakehouse_ndjson(
    current_user: ReadRoles,
    db: DbSession,
) -> Response:
    """Export strictly de-identified stewardship dispense records as NDJSON for Databricks Lakehouse ingestion."""
    stmt = (
        select(Dispense, AntibioticCatalog.drug_code, AntibioticCatalog.drug_class)
        .outerjoin(AntibioticCatalog, Dispense.antibiotic_id == AntibioticCatalog.id)
        .where(Dispense.clinic_id == current_user.clinic_id)
        .order_by(Dispense.created_at.desc())
        .limit(500)
    )
    rows = (await db.execute(stmt)).all()
    lines = []
    for d, drug_code, drug_class in rows:
        lines.append(
            json.dumps(
                {
                    "record_type": "stewardship_dispense",
                    "clinic_id": str(d.clinic_id),
                    "dispense_id": str(d.id),
                    "aware_category": d.aware_category_snapshot,
                    "solver_status": d.solver_status,
                    "drug_code": drug_code,
                    "drug_class": drug_class,
                    "qty_dispensed": d.qty_dispensed,
                    "days_supply": d.days_supply,
                    "status": d.status,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                },
                separators=(",", ":"),
            )
        )
    body = ("\n".join(lines) + "\n") if lines else ""
    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="LAKEHOUSE_EXPORT",
            resource_type="analytics",
            resource_id=str(current_user.clinic_id),
            trace_id="lakehouse-export",
            details={"row_count": len(lines)},
        )
    )
    await db.commit()
    return Response(
        content=body,
        media_type="application/x-ndjson",
        headers={"Content-Disposition": 'attachment; filename="shasthogrid-stewardship-lakehouse.ndjson"'},
    )


@router.get("/teamwork-graph")
async def get_teamwork_graph(
    current_user: ReadRoles,
    db: DbSession,
    days: Annotated[int, Query(ge=1, le=30)] = 7,
) -> dict:
    """De-identified cross-role collaboration graph over clinic audit events."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = (
        select(
            AuditLog.actor_role,
            AuditLog.action,
            AuditLog.resource_type,
            func.count(AuditLog.id).label("event_count"),
            func.max(AuditLog.created_at).label("last_seen_at"),
        )
        .where(
            AuditLog.clinic_id == current_user.clinic_id,
            AuditLog.created_at >= since,
            AuditLog.actor_role.is_not(None),
        )
        .group_by(AuditLog.actor_role, AuditLog.action, AuditLog.resource_type)
        .order_by(func.count(AuditLog.id).desc())
        .limit(100)
    )
    rows = (await db.execute(stmt)).all()
    roles = sorted({r.actor_role for r in rows if r.actor_role})
    resources = sorted({r.resource_type for r in rows if r.resource_type})
    return {
        "clinic_id": str(current_user.clinic_id),
        "window_days": days,
        "roles": roles,
        "resource_types": resources,
        "edges": [
            {
                "actor_role": r.actor_role,
                "action": r.action,
                "resource_type": r.resource_type,
                "count": int(r.event_count),
                "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
            }
            for r in rows
        ],
    }
