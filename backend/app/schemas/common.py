from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ErrorEnvelope(BaseModel):
    error_code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    trace_id: str


class HealthResponse(BaseModel):
    status: str
    db: str
    redis: str
