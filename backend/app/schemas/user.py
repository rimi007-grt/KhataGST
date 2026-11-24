from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.user import SchemeEnum, LanguageEnum

class UserBase(BaseModel):
    email: str
    business_name: Optional[str] = None
    gstin: Optional[str] = None
    state_code: Optional[str] = None
    scheme: SchemeEnum = SchemeEnum.REGULAR
    language: LanguageEnum = LanguageEnum.en

class UserOut(UserBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    business_name: Optional[str] = None
    gstin: Optional[str] = None
    state_code: Optional[str] = None
    scheme: Optional[SchemeEnum] = None
    language: Optional[LanguageEnum] = None

