"""Shastho Copilot endpoints: note -> PulseScore -> CareMatch -> ConflictProof -> brief."""

from __future__ import annotations

import time
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.copilot import (
    MAX_TOOL_STEPS,
    VITAL_FIELDS,
    compose_brief,
    extract_intake,
)
from app.agents.steward_agent import check_prompt_injection, strip_pii_from_text
from app.core.errors import AppError, NotFoundError, get_trace_id
from app.core.security import CurrentUser, get_current_user, require_roles
from app.db.models import AgentSession, AuditLog, User
from app.db.session import get_db
from app.routers.critical_care import execute_carematch
from app.schemas.critical_care import CareMatchIn, News2In

router = APIRouter(tags=["copilot"])


class CopilotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str = Field(min_length=5, max_length=2000)
    incident_lat: float = Field(ge=20.5, le=26.7)
    incident_lon: float = Field(ge=88.0, le=92.7)


class ToolStep(BaseModel):
    step: int
    tool: str
    summary: dict[str, Any]
    duration_ms: float


def _step(trace: list[ToolStep], tool: str, started: float, summary: dict[str, Any]) -> None:
    if len(trace) >= MAX_TOOL_STEPS:
        raise AppError(500, "COPILOT_STEP_LIMIT", "Copilot exceeded its tool-step budget.")
    trace.append(
        ToolStep(
            step=len(trace) + 1,
            tool=tool,
            summary=summary,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
    )


@router.post("/copilot/triage-assist")
async def triage_assist(
    payload: CopilotIn,
    request: Request,
    user: Annotated[CurrentUser, Depends(require_roles("dispatcher", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    redacted_note = strip_pii_from_text(payload.note)
    safe, guard = await check_prompt_injection(redacted_note)
    if not safe:
        raise AppError(
            422,
            "PROMPT_INJECTION_BLOCKED",
            "The note contains instructions aimed at the AI and was not processed.",
            details={"guard": guard},
        )

    trace: list[ToolStep] = []

    t = time.perf_counter()
    outcome = await extract_intake(redacted_note)
    ex = outcome.extraction
    missing = ex.missing_vitals()
    _step(
        trace,
        "extract_intake",
        t,
        {
            "provider": outcome.provider,
            "language": outcome.language,
            "missing_vitals": missing,
            "guard_rejected_fields": outcome.guard_rejections,
        },
    )

    news2_in = None
    if not missing:
        t = time.perf_counter()
        news2_in = News2In(**{f: getattr(ex, f) for f in VITAL_FIELDS})
        _step(trace, "pulsescore_news2", t, {"vitals_complete": True})

    # ICU is needed when stated, when a ventilator is needed, or by default for a referral.
    needs_icu = True if ex.needs_icu is None else ex.needs_icu
    t = time.perf_counter()
    carematch = await execute_carematch(
        db,
        user,
        CareMatchIn(
            incident_lat=payload.incident_lat,
            incident_lon=payload.incident_lon,
            vitals=news2_in,
            needs_icu=needs_icu or ex.needs_vent,
            needs_vent=ex.needs_vent,
            specialty=ex.specialty,
            blood_type=ex.blood_type,
            blood_units=ex.blood_units if ex.blood_type else 0,
            public_only=ex.public_only,
            max_eta_minutes=ex.max_eta_minutes,
        ),
        get_trace_id(request),
    )
    cm = carematch.model_dump(mode="json")
    _step(
        trace,
        "carematch_optimize",
        t,
        {
            "status": cm["status"],
            "news2": cm["news2"]["score"] if cm["news2"] else None,
            "wall_time_ms": cm["wall_time_ms"],
        },
    )

    if cm["status"] == "INFEASIBLE":
        t = time.perf_counter()
        proof = cm["conflict_proof"]
        _step(
            trace,
            "conflictproof_explain",
            t,
            {"mus_cores": proof["mus_cores"], "repairs": [r["repair_type"] for r in proof["repairs"]]},
        )

    t = time.perf_counter()
    brief = compose_brief(cm["news2"], cm, missing)
    _step(trace, "compose_brief", t, {"languages": ["en", "bn"]})

    session = AgentSession(
        id=uuid.uuid4(),
        user_id=user.id,
        triage_request_id=carematch.triage_request_id,
        redacted_note=strip_pii_from_text(payload.note),
        language=outcome.language,
        provider_used=outcome.provider,
        extraction=ex.model_dump(),
        tool_trace=[s.model_dump() for s in trace],
        brief=brief,
    )
    db.add(session)
    db.add(
        AuditLog(
            clinic_id=user.clinic_id,
            actor_user_id=user.id,
            actor_role=user.role,
            action="COPILOT_TRIAGE_ASSIST",
            resource_type="agent_session",
            resource_id=str(session.id),
            trace_id=get_trace_id(request),
            details={"provider": outcome.provider, "status": cm["status"], "steps": len(trace)},
        )
    )
    await db.commit()

    return {
        "session_id": str(session.id),
        "provider_used": outcome.provider,
        "language": outcome.language,
        "extraction": ex.model_dump(),
        "missing_vitals": missing,
        "guard_rejected_fields": outcome.guard_rejections,
        "carematch": cm,
        "brief": brief,
        "tool_trace": [s.model_dump() for s in trace],
        "requires_human_approval": True,
        "next_action": "Review, then approve a hold with POST /api/v1/reservations (Idempotency-Key required).",
    }


@router.get("/copilot/sessions/{session_id}")
async def get_session(
    session_id: uuid.UUID,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    session = await db.get(AgentSession, session_id)
    if session is None:
        raise NotFoundError("Copilot session not found.", error_code="COPILOT_SESSION_NOT_FOUND")
    if user.role in ("admin", "auditor"):
        creator_clinic_id = (
            await db.execute(select(User.clinic_id).where(User.id == session.user_id))
        ).scalar_one_or_none()
        if creator_clinic_id != user.clinic_id:
            raise NotFoundError("Copilot session not found.", error_code="COPILOT_SESSION_NOT_FOUND")
    elif session.user_id != user.id:
        raise NotFoundError("Copilot session not found.", error_code="COPILOT_SESSION_NOT_FOUND")
    return {
        "session_id": str(session.id),
        "triage_request_id": str(session.triage_request_id) if session.triage_request_id else None,
        "redacted_note": session.redacted_note,
        "language": session.language,
        "provider_used": session.provider_used,
        "extraction": session.extraction,
        "tool_trace": session.tool_trace,
        "brief": session.brief,
        "created_at": session.created_at.isoformat(),
        "requires_human_approval": True,
    }
