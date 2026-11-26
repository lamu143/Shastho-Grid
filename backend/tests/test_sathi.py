"""Shastho Sathi voice endpoints. The provider is always mocked; tests never call real AI."""

from __future__ import annotations

import struct

import pytest
from httpx import AsyncClient

from app.agents import sathi_voice
from app.core.config import settings


async def test_voice_status_reports_off_without_key(client: AsyncClient) -> None:
    r = await client.get("/api/v1/sathi/voice-status")
    assert r.status_code == 200 and r.json() == {"server_voice": False, "tts_model": None, "voice": None}


async def test_speak_without_key_is_a_clean_503(client: AsyncClient) -> None:
    r = await client.post("/api/v1/sathi/speak", json={"text": "আসসালামু আলাইকুম", "locale": "bn"})
    assert r.status_code == 503 and r.json()["error_code"] == "SATHI_VOICE_UNAVAILABLE"


async def test_speak_returns_cached_wav(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    sathi_voice._cache.clear()
    calls = []

    class FakeResp:
        status_code = 200

        def raise_for_status(self) -> None: ...

        def json(self):
            import base64
            return {"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "audio/L16;codec=pcm;rate=24000",
                                                                         "data": base64.b64encode(b"\x00\x01" * 2400).decode()}}]}}]}

    class FakeClient:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, json, headers):
            calls.append((url, json))
            return FakeResp()

    monkeypatch.setattr(sathi_voice.httpx, "AsyncClient", FakeClient)
    for _ in range(2):
        r = await client.post("/api/v1/sathi/speak", json={"text": "CareMatch কী করে?", "locale": "bn"})
        assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
        assert r.content[:4] == b"RIFF" and r.content[8:12] == b"WAVE"
    assert len(calls) == 1, "second identical answer must come from the cache"
    body = calls[0][1]
    assert body["generationConfig"]["responseModalities"] == ["AUDIO"]
    assert "Bangla" in body["contents"][0]["parts"][0]["text"]


async def test_speak_rejects_overlong_text(client: AsyncClient) -> None:
    r = await client.post("/api/v1/sathi/speak", json={"text": "x" * 701, "locale": "en"})
    assert r.status_code == 422


async def test_transcribe_validates_type_and_size(client: AsyncClient) -> None:
    bad = await client.post("/api/v1/sathi/transcribe", files={"audio": ("a.txt", b"hello", "text/plain")})
    assert bad.status_code == 422 and bad.json()["error_code"] == "SATHI_AUDIO_TYPE"
    no_key = await client.post("/api/v1/sathi/transcribe", files={"audio": ("a.webm", b"\x1aE\xdf\xa3", "audio/webm")})
    assert no_key.status_code == 503


def test_pcm_is_wrapped_in_a_valid_wav_header() -> None:
    wav = sathi_voice.pcm16_to_wav(b"\x00\x00" * 100, rate=24000)
    assert wav[:4] == b"RIFF" and wav[8:16] == b"WAVEfmt "
    channels, rate = struct.unpack("<HI", wav[22:28])
    assert (channels, rate) == (1, 24000) and len(wav) == 44 + 200


async def test_speak_rotates_to_next_key_on_quota(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import base64

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "key-a")
    monkeypatch.setattr(settings, "GEMINI_API_KEYS", ["key-b"])
    monkeypatch.setattr(sathi_voice, "_next_key", 0)
    sathi_voice._cache.clear()
    used = []

    class Resp:
        def __init__(self, status): self.status_code = status
        def raise_for_status(self) -> None: ...
        def json(self):
            return {"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "audio/wav",
                    "data": base64.b64encode(sathi_voice.pcm16_to_wav(b"\x00\x00" * 10)).decode()}}]}}]}

    class FakeClient:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, json, headers):
            used.append(headers["x-goog-api-key"])
            return Resp(429 if headers["x-goog-api-key"] == "key-a" else 200)

    monkeypatch.setattr(sathi_voice.httpx, "AsyncClient", FakeClient)
    r = await client.post("/api/v1/sathi/speak", json={"text": "Rotation check.", "locale": "en"})
    assert r.status_code == 200 and used == ["key-a", "key-b"]
