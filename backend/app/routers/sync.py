from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import get_trace_id
from app.core.idempotency import IdempotencyGuard
from app.core.security import CurrentUser, require_roles
from app.db.session import get_db
from app.schemas.sync import (
    ConflictEventOut,
    ConflictResolveIn,
    ConflictResolveOut,
    SyncBootstrapOut,
    SyncMutationIn,
    SyncMutationOut,
)
from app.services import sync_service

router = APIRouter(prefix="/sync", tags=["sync"])

ReadRoles = Annotated[
    CurrentUser,
    Depends(require_roles("dispenser", "pharmacist", "auditor", "admin")),
]
WriteRoles = Annotated[
    CurrentUser,
    Depends(require_roles("dispenser", "pharmacist", "admin")),
]
DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/bootstrap", response_model=SyncBootstrapOut)
async def sync_bootstrap(
    current_user: ReadRoles,
    db: DbSession,
) -> SyncBootstrapOut:
    return await sync_service.get_bootstrap(db=db, clinic_id=current_user.clinic_id)


@router.post("/mutations", response_model=SyncMutationOut)
async def sync_mutations(
    payload: SyncMutationIn,
    request: Request,
    current_user: WriteRoles,
    db: DbSession,
) -> SyncMutationOut | JSONResponse:
    guard = IdempotencyGuard()
    replay = await guard.begin(
        db=db,
        request=request,
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
    )
    if replay is not None:
        return replay

    out = await sync_service.process_mutation(
        db=db,
        current_user=current_user,
        req=payload,
        trace_id=get_trace_id(request),
    )
    await guard.commit_response(db=db, status_code=200, body=jsonable_encoder(out))
    await db.commit()
    return out


@router.get("/conflicts", response_model=list[ConflictEventOut])
async def list_sync_conflicts(
    current_user: ReadRoles,
    db: DbSession,
) -> list[ConflictEventOut]:
    return await sync_service.list_conflicts(db=db, clinic_id=current_user.clinic_id)


@router.post("/conflicts/{conflict_id}/resolve", response_model=ConflictResolveOut)
async def resolve_sync_conflict(
    conflict_id: UUID,
    payload: ConflictResolveIn,
    request: Request,
    current_user: WriteRoles,
    db: DbSession,
) -> ConflictResolveOut | JSONResponse:
    guard = IdempotencyGuard()
    replay = await guard.begin(
        db=db,
        request=request,
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
    )
    if replay is not None:
        return replay

    out = await sync_service.resolve_conflict(
        db=db,
        current_user=current_user,
        conflict_id=conflict_id,
        req=payload,
        trace_id=get_trace_id(request),
    )
    await guard.commit_response(db=db, status_code=200, body=jsonable_encoder(out))
    await db.commit()
    return out
