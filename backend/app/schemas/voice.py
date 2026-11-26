from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class VoiceIntakeJsonRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=4000)
    language: Literal["en", "bn"] = "en"

    @field_validator("transcript")
    @classmethod
    def _strip_non_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("transcript cannot be empty or whitespace only.")
        return stripped


class VoiceIntakeResponse(BaseModel):
    syndrome_code: str | None = None
    severity: Literal["MILD", "MODERATE", "SEVERE"] | None = None
    allergies: list[str] = Field(default_factory=list)
    is_pregnant: bool | None = None
    age_years: int | None = None
    prompt_guard_safe: bool
    model_used: str
    transcript: str | None = None
