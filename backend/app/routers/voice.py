from __future__ import annotations

import json
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.steward_agent import process_voice_intake
from app.core.errors import ValidationAppError, get_trace_id
from app.core.security import CurrentUser, require_roles
from app.db.models import AuditLog
from app.db.session import get_db
from app.schemas.voice import VoiceIntakeJsonRequest, VoiceIntakeResponse

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/intake", response_model=VoiceIntakeResponse)
async def voice_intake(
    request: Request,
    current_user: Annotated[
        CurrentUser,
        Depends(require_roles("dispenser", "pharmacist", "auditor", "admin")),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VoiceIntakeResponse | JSONResponse:
    content_type = request.headers.get("content-type", "").lower()

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw_lang = str(form.get("language") or "en").strip().lower()
        if raw_lang not in ("en", "bn"):
            raise ValidationAppError(
                message="language must be 'en' or 'bn'.",
                error_code="INVALID_LANGUAGE",
                details={"language": raw_lang},
            )
        language = cast(Literal["en", "bn"], raw_lang)

        upload = form.get("file") or form.get("audio")
        if upload is None or not hasattr(upload, "read"):
            raise ValidationAppError(
                message="Audio upload ('file' or 'audio') is required for multipart voice intake.",
                error_code="MISSING_AUDIO_FILE",
            )
        audio_bytes = await upload.read()  # type: ignore[union-attr]
        audio_filename = getattr(upload, "filename", None) or "audio.webm"
        result = await process_voice_intake(
            audio_bytes=audio_bytes,
            audio_filename=audio_filename,
            language=language,
        )
    else:
        try:
            raw_json = await request.json()
        except (json.JSONDecodeError, ValueError) as exc:
            raise ValidationAppError(
                message="Invalid JSON request body.",
                error_code="INVALID_JSON",
            ) from exc

        if not isinstance(raw_json, dict):
            raise ValidationAppError(
                message="Request body must be a JSON object.",
                error_code="INVALID_JSON",
            )

        try:
            parsed = VoiceIntakeJsonRequest.model_validate(raw_json)
        except ValidationError as exc:
            raise ValidationAppError(
                message="Invalid voice intake request.",
                error_code="VALIDATION_ERROR",
                details={"errors": exc.errors()},
            ) from exc

        result = await process_voice_intake(
            transcript=parsed.transcript,
            language=parsed.language,
        )

    db.add(
        AuditLog(
            clinic_id=current_user.clinic_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            action="VOICE_INTAKE",
            resource_type="voice_intake",
            resource_id=None,
            trace_id=get_trace_id(request),
            details={
                "prompt_guard_safe": result.prompt_guard_safe,
                "syndrome_code": result.syndrome_code,
                "severity": result.severity,
                "model_used": result.model_used,
            },
        )
    )
    await db.commit()

    response_model = VoiceIntakeResponse(
        syndrome_code=result.syndrome_code,
        severity=result.severity,
        allergies=result.allergies,
        is_pregnant=result.is_pregnant,
        age_years=result.age_years,
        prompt_guard_safe=result.prompt_guard_safe,
        model_used=result.model_used,
        transcript=result.transcript,
    )
    if response_model.transcript is None:
        return JSONResponse(
            status_code=200,
            content=response_model.model_dump(exclude={"transcript"}),
        )
    return response_model
