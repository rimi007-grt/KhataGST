import re
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from app.models.user import SchemeEnum, LanguageEnum
from app.schemas.user import UserOut

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

class RegisterRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    business_name: Optional[str] = None
    gstin: Optional[str] = Field(None, max_length=15)
    state_code: Optional[str] = Field(None, max_length=2)
    scheme: Optional[SchemeEnum] = SchemeEnum.REGULAR
    language: Optional[LanguageEnum] = LanguageEnum.en

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v_clean = v.strip().lower()
        if not EMAIL_REGEX.match(v_clean):
            raise ValueError("Invalid email format")
        return v_clean

class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v_clean = v.strip().lower()
        if not EMAIL_REGEX.match(v_clean):
            raise ValueError("Invalid email format")
        return v_clean

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None
