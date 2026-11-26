"""Shastho Sathi voice endpoints (public, rate-limited, nothing stored)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from app.agents import sathi_voice
from app.core.errors import AppError, ValidationAppError

router = APIRouter(prefix="/sathi", tags=["sathi"])

ALLOWED_AUDIO = ("audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac")


class SpeakIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=sathi_voice.MAX_TEXT_CHARS)
    locale: Literal["en", "bn"] = "bn"


class VoiceStatusOut(BaseModel):
    server_voice: bool
    tts_model: str | None
    voice: str | None


class TranscriptOut(BaseModel):
    text: str


def _unavailable(detail: str) -> AppError:
    return AppError(
        status_code=503,
        error_code="SATHI_VOICE_UNAVAILABLE",
        message="Server voice is unavailable right now; the browser voice or text will be used.",
        details={"reason": detail},
    )


@router.get("/voice-status", response_model=VoiceStatusOut)
async def voice_status() -> VoiceStatusOut:
    on = sathi_voice.voice_enabled()
    return VoiceStatusOut(
        server_voice=on,
        tts_model=sathi_voice.TTS_MODEL if on else None,
        voice=sathi_voice.VOICE_NAME if on else None,
    )


@router.post("/speak", responses={200: {"content": {"audio/wav": {}}}})
async def speak(payload: SpeakIn) -> Response:
    try:
        audio, mime = await sathi_voice.synthesize(payload.text, payload.locale)
    except sathi_voice.VoiceUnavailable as exc:
        raise _unavailable(str(exc)) from exc
    # Answers come from a fixed knowledge base, so let the browser cache them too.
    return Response(content=audio, media_type=mime, headers={"Cache-Control": "private, max-age=86400"})


@router.post("/transcribe", response_model=TranscriptOut)
async def transcribe(request: Request, audio: UploadFile, locale: Literal["en", "bn"] = "bn") -> TranscriptOut:
    mime = (audio.content_type or "").split(";")[0].strip().lower()
    if mime not in ALLOWED_AUDIO:
        raise ValidationAppError("Unsupported audio type.", error_code="SATHI_AUDIO_TYPE", details={"type": mime})
    data = await audio.read(sathi_voice.MAX_AUDIO_BYTES + 1)
    if not data or len(data) > sathi_voice.MAX_AUDIO_BYTES:
        raise ValidationAppError("Audio must be under 2 MB (about 30 seconds).", error_code="SATHI_AUDIO_SIZE")
    try:
        text = await sathi_voice.transcribe(data, mime, locale)
    except sathi_voice.VoiceUnavailable as exc:
        raise _unavailable(str(exc)) from exc
    return TranscriptOut(text=text)
