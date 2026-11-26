from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class VerifyPinRequest(BaseModel):
    email: EmailStr
    pin: str = Field(min_length=4, max_length=12)


class VerifyPinResponse(BaseModel):
    verified: bool


class UserPublic(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: str
    clinic_id: UUID
    clinic_name: str
    facility_id: UUID | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserPublic
