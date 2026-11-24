import enum
from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class DocTypeEnum(str, enum.Enum):
    SALES = "SALES"
    PURCHASE = "PURCHASE"
    REGISTER_PAGE = "REGISTER_PAGE"

class Document(Base):
    """RAW uploaded document"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    mime = Column(String(100), nullable=False)
    sha256 = Column(String(64), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    doc_type = Column(Enum(DocTypeEnum), default=DocTypeEnum.SALES, nullable=False)

    user = relationship("User", back_populates="documents")
    extracted_entries = relationship("ExtractedEntry", back_populates="document", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_documents_user_id_uploaded_at", "user_id", "uploaded_at"),
    )

