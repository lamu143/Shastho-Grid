"""Shastho Sathi voice: natural Bangla/English speech (Gemini TTS) and a transcription fallback.

Browsers rarely ship a Bangla speech voice, so Sathi's spoken answers come from Gemini TTS.
Answers are cached (they come from a fixed knowledge base, so they repeat a lot). When no
GEMINI_API_KEY is configured every call raises VoiceUnavailable and the client falls back
to the browser voice or text only. Nothing here is persisted.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
from collections import OrderedDict
from typing import Literal

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types

from app.agents.steward_agent import strip_pii_from_text
from app.core.config import settings

logger = logging.getLogger(__name__)

_API = "https://generativelanguage.googleapis.com/v1beta"
TTS_MODEL = "gemini-3.8-flash-tts"
STT_MODEL = "gemini-3.5-flash-lite"
VOICE_NAME = "Puck"  # fewest dead pauses in Bangla among tested voices
MAX_TEXT_CHARS = 700
MAX_AUDIO_BYTES = 2 * 1024 * 1024
_CACHE_SIZE = 120

# Natural-language style direction understood by Gemini TTS (not read aloud).
_STYLE = {
    "bn": "Say this in warm, friendly, natural Bangladeshi Bangla at a normal conversational speed, without long pauses:",
    "en": "Say this in a warm, friendly voice at a normal conversational speed, without long pauses:",
}

_cache: OrderedDict[str, tuple[bytes, str]] = OrderedDict()


class VoiceUnavailable(Exception):
    """Server voice is not configured or the provider failed; the client should fall back."""


def voice_enabled() -> bool:
    return bool(settings.gemini_key_pool)


_next_key = 0


def _keys_in_turn() -> list[str]:
    """Every configured key once, starting from a rotating offset (spreads load across keys)."""
    global _next_key
    pool = settings.gemini_key_pool
    if not pool:
        raise VoiceUnavailable("no Gemini API key is configured")
    start = _next_key % len(pool)
    _next_key += 1
    return pool[start:] + pool[:start]


_RETRY_STATUS = {429, 403, 500, 503}


async def synthesize(text: str, locale: Literal["en", "bn"]) -> tuple[bytes, str]:
    """Return (audio bytes, mime type) for a short Sathi answer."""
    clean = strip_pii_from_text(" ".join(text.split())[:MAX_TEXT_CHARS])
    key = hashlib.sha256(f"{TTS_MODEL}|{VOICE_NAME}|{locale}|{clean}".encode()).hexdigest()
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]

    # Plain REST on v1beta: the speechConfig field is only accepted there (verified live).
    body = {
        "contents": [{"parts": [{"text": f"{_STYLE[locale]}\n{clean}"}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE_NAME}}},
        },
    }
    audio, mime, last_error = b"", "audio/wav", "no attempt"
    async with httpx.AsyncClient(timeout=25.0) as http:
        for api_key in _keys_in_turn():
            try:
                r = await http.post(
                    f"{_API}/models/{TTS_MODEL}:generateContent",
                    json=body,
                    headers={"x-goog-api-key": api_key},
                )
                if r.status_code in _RETRY_STATUS:
                    last_error = f"HTTP {r.status_code}"
                    continue  # quota or transient: try the next key
                r.raise_for_status()
                part = r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]
                audio, mime = base64.b64decode(part["data"]), part.get("mimeType") or "audio/wav"
                break
            except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
                last_error = type(exc).__name__
                continue
    if not audio:
        logger.warning("Sathi TTS failed on every key: %s", last_error)
        raise VoiceUnavailable("speech synthesis failed")
    if not audio:
        raise VoiceUnavailable("empty audio")
    if mime.startswith("audio/L16") or "pcm" in mime:
        audio, mime = pcm16_to_wav(audio, _rate(mime)), "audio/wav"

    _cache[key] = (audio, mime)
    if len(_cache) > _CACHE_SIZE:
        _cache.popitem(last=False)
    return audio, mime


async def transcribe(audio: bytes, mime_type: str, locale: Literal["en", "bn"]) -> str:
    """Verbatim transcript of a short question (fallback when the browser has no Bangla STT)."""
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise ValueError("audio must be between 1 byte and 2 MB")
    lang = "Bangla (Bengali script)" if locale == "bn" else "English"
    resp = None
    for api_key in _keys_in_turn():
        try:
            resp = await asyncio.wait_for(
                genai.Client(api_key=api_key).aio.models.generate_content(
                    model=STT_MODEL,
                    contents=[
                        genai_types.Part.from_bytes(data=audio, mime_type=mime_type),
                        f"Transcribe this short spoken question verbatim. Expected language: {lang}; "
                        "keep any English product names (e.g. CareMatch) in Latin script. "
                        "Return only the transcript text, nothing else.",
                    ],
                    config=genai_types.GenerateContentConfig(temperature=0),
                ),
                timeout=20.0,
            )
            break
        except (genai_errors.APIError, httpx.HTTPError, TimeoutError, OSError, ValueError, AttributeError) as exc:
            logger.warning("Sathi transcription failed on one key: %s", type(exc).__name__)
            continue
    if resp is None:
        raise VoiceUnavailable("transcription failed")
    return strip_pii_from_text(" ".join((getattr(resp, "text", "") or "").split())[:500])


def _rate(mime: str) -> int:
    for piece in mime.split(";"):
        piece = piece.strip()
        if piece.startswith("rate="):
            try:
                return int(piece[5:])
            except ValueError:
                break
    return 24000


def pcm16_to_wav(pcm: bytes, rate: int = 24000, channels: int = 1) -> bytes:
    """Wrap raw 16-bit little-endian PCM in a WAV header so every browser can play it."""
    import struct

    byte_rate = rate * channels * 2
    header = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, channels, rate, byte_rate, channels * 2, 16
    ) + b"data" + struct.pack("<I", len(pcm))
    return header + pcm
