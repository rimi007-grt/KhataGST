import enum
from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, Index, JSON, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class SeverityEnum(str, enum.Enum):
    BLOCKING = "BLOCKING"
    WARNING = "WARNING"
    INFO = "INFO"

class ValidationResult(Base):
    __tablename__ = "validation_results"

    id = Column(Integer, primary_key=True, index=True)
    entry_id = Column(Integer, ForeignKey("entries_reviewed.id", ondelete="CASCADE"), nullable=False)
    rule_id = Column(String(10), nullable=False)  # R01 .. R10
    severity = Column(Enum(SeverityEnum), nullable=False)
    message_key = Column(String(100), nullable=False)
    message_params = Column(JSON, nullable=True)
    rule_version = Column(String(20), default="1.0", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    entry = relationship("EntryReviewed", back_populates="validation_results")

    __table_args__ = (
        Index("ix_validation_results_entry_id", "entry_id"),
    )
