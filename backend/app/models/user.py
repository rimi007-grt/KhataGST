import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Enum, DateTime, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class SchemeEnum(str, enum.Enum):
    REGULAR = "REGULAR"
    QRMP = "QRMP"
    COMPOSITION = "COMPOSITION"

class LanguageEnum(str, enum.Enum):
    en = "en"
    hi = "hi"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    business_name = Column(String(255), nullable=True)
    gstin = Column(String(15), nullable=True)
    state_code = Column(String(2), nullable=True)
    scheme = Column(Enum(SchemeEnum), default=SchemeEnum.REGULAR, nullable=False)
    language = Column(Enum(LanguageEnum), default=LanguageEnum.en, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    reviewed_entries = relationship("EntryReviewed", back_populates="user", cascade="all, delete-orphan")

