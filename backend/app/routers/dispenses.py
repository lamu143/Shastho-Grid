from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import get_trace_id
from app.core.idempotency import IdempotencyGuard
from app.core.security import CurrentUser, require_roles
from app.db.session import get_db
from app.schemas.dispenses import DispenseActionNote, DispenseCreate, DispenseOut
from app.services import dispense_service

router = APIRouter(prefix="/dispenses", tags=["dispenses"])

ReadRoles = Annotated[
    CurrentUser,
    Depends(require_roles("dispenser", "pharmacist", "auditor", "admin")),
]
WriteRoles = Annotated[
    CurrentUser,
    Depends(require_roles("dispenser", "pharmacist", "admin")),
]
ApproverRoles = Annotated[
    CurrentUser,
    Depends(require_roles("pharmacist", "admin")),
]
DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[DispenseOut])
async def list_dispenses(
    current_user: ReadRoles,
    db: DbSession,
    status: Literal[
        "DRAFT", "PENDING_APPROVAL", "DISPENSED", "REJECTED", "VOIDED"
    ]
    | None = Query(default=None),
    aware_category: Literal[
        "ACCESS", "WATCH", "RESERVE", "NO_ANTIBIOTIC"
    ]
    | None = Query(default=None),
) -> list[DispenseOut]:
    return await dispense_service.list_dispenses(
        db=db,
        clinic_id=current_user.clinic_id,
        status=status,
        aware_category=aware_category,
    )


@router.post("", response_model=DispenseOut, status_code=201)
async def create_dispense(
    payload: DispenseCreate,
    request: Request,
    current_user: WriteRoles,
    db: DbSession,
) -> DispenseOut | JSONResponse:
    guard = IdempotencyGuard()
    replay = await guard.begin(
        db=db,
        request=request,
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
    )
    if replay is not None:
        return replay

    out = await dispense_service.create_dispense_draft(
        db=db,
        current_user=current_user,
        payload=payload,
        trace_id=get_trace_id(request),
    )
    await guard.commit_response(db=db, status_code=201, body=jsonable_encoder(out))
    await db.commit()
    return out


@router.post("/{dispense_id}/submit", response_model=DispenseOut)
async def submit_dispense(
    dispense_id: UUID,
    request: Request,
    current_user: WriteRoles,
    db: DbSession,
) -> DispenseOut | JSONResponse:
    guard = IdempotencyGuard()
    replay = await guard.begin(
        db=db,
        request=request,
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
    )
    if replay is not None:
        return replay

    out = await dispense_service.submit_dispense(
        db=db,
        current_user=current_user,
        dispense_id=dispense_id,
        trace_id=get_trace_id(request),
    )
    await guard.commit_response(db=db, status_code=200, body=jsonable_encoder(out))
    await db.commit()
    return out


@router.post("/{dispense_id}/approve", response_model=DispenseOut)
async def approve_dispense(
    dispense_id: UUID,
    request: Request,
    current_user: ApproverRoles,
    db: DbSession,
) -> DispenseOut | JSONResponse:
    guard = IdempotencyGuard()
    replay = await guard.begin(
        db=db,
        request=request,
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
    )
    if replay is not None:
        return replay

    out = await dispense_service.approve_dispense(
        db=db,
        current_user=current_user,
        dispense_id=dispense_id,
        trace_id=get_trace_id(request),
    )
    await guard.commit_response(db=db, status_code=200, body=jsonable_encoder(out))
    await db.commit()
    return out


@router.post("/{dispense_id}/reject", response_model=DispenseOut)
async def reject_dispense(
    dispense_id: UUID,
    request: Request,
    current_user: ApproverRoles,
    db: DbSession,
    payload: Annotated[DispenseActionNote | None, Body()] = None,
) -> DispenseOut | JSONResponse:
    guard = IdempotencyGuard()
    replay = await guard.begin(
        db=db,
        request=request,
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
    )
    if replay is not None:
        return replay

    reason = payload.resolved_reason() if payload is not None else None
    out = await dispense_service.reject_dispense(
        db=db,
        current_user=current_user,
        dispense_id=dispense_id,
        reason=reason,
        trace_id=get_trace_id(request),
    )
    await guard.commit_response(db=db, status_code=200, body=jsonable_encoder(out))
    await db.commit()
    return out


@router.post("/{dispense_id}/void", response_model=DispenseOut)
async def void_dispense(
    dispense_id: UUID,
    request: Request,
    current_user: ApproverRoles,
    db: DbSession,
    payload: Annotated[DispenseActionNote | None, Body()] = None,
) -> DispenseOut | JSONResponse:
    guard = IdempotencyGuard()
    replay = await guard.begin(
        db=db,
        request=request,
        clinic_id=current_user.clinic_id,
        user_id=current_user.id,
    )
    if replay is not None:
        return replay

    reason = payload.resolved_reason() if payload is not None else None
    out = await dispense_service.void_dispense(
        db=db,
        current_user=current_user,
        dispense_id=dispense_id,
        reason=reason,
        trace_id=get_trace_id(request),
    )
    await guard.commit_response(db=db, status_code=200, body=jsonable_encoder(out))
    await db.commit()
    return out
