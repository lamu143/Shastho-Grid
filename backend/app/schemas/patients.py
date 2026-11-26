from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PatientCreate(BaseModel):
    id: UUID | None = None
    mrn: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=160)
    age_years: int = Field(ge=0, le=130)
    weight_kg: float = Field(gt=0, le=500)
    sex: Literal["M", "F", "O"]
    is_pregnant: bool = False
    egfr: float | None = Field(default=None, ge=0, le=300)
    allergies: list[str] = Field(default_factory=list)

    @field_validator("mrn", "full_name")
    @classmethod
    def _strip_non_empty(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field must not be empty or whitespace-only.")
        return cleaned

    @field_validator("allergies")
    @classmethod
    def _normalize_allergies(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in value:
            cleaned = item.strip()
            if cleaned and cleaned.upper() not in seen:
                seen.add(cleaned.upper())
                result.append(cleaned)
        return result

    @model_validator(mode="after")
    def _validate_pregnancy_sex(self) -> PatientCreate:
        if self.is_pregnant and self.sex != "F":
            raise ValueError("is_pregnant cannot be true when sex is not 'F'.")
        return self


class PatientPatch(BaseModel):
    mrn: str | None = Field(default=None, min_length=1, max_length=64)
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    age_years: int | None = Field(default=None, ge=0, le=130)
    weight_kg: float | None = Field(default=None, gt=0, le=500)
    sex: Literal["M", "F", "O"] | None = None
    is_pregnant: bool | None = None
    egfr: float | None = Field(default=None, ge=0, le=300)
    allergies: list[str] | None = None
    base_version: int | None = Field(default=None, ge=1)

    @field_validator("mrn", "full_name")
    @classmethod
    def _strip_optional_non_empty(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field must not be empty or whitespace-only.")
        return cleaned

    @field_validator("allergies")
    @classmethod
    def _normalize_optional_allergies(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        seen: set[str] = set()
        result: list[str] = []
        for item in value:
            cleaned = item.strip()
            if cleaned and cleaned.upper() not in seen:
                seen.add(cleaned.upper())
                result.append(cleaned)
        return result


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    clinic_id: UUID
    mrn: str
    full_name: str
    age_years: int
    weight_kg: float
    sex: Literal["M", "F", "O"]
    is_pregnant: bool
    egfr: float | None = None
    allergies: list[str] = Field(default_factory=list)
    version: int
    created_at: datetime
    updated_at: datetime
