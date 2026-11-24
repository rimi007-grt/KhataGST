import enum
from sqlalchemy import Column, Integer, String, Date, Numeric, Enum, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class EntryTypeEnum(str, enum.Enum):
    SALES = "SALES"
    PURCHASE = "PURCHASE"

class EntrySourceEnum(str, enum.Enum):
    EXTRACTED_EDITED = "EXTRACTED_EDITED"
    MANUAL = "MANUAL"

class EntryReviewed(Base):
    """HUMAN-VERIFIED entries used for validation and export"""
    __tablename__ = "entries_reviewed"

    id = Column(Integer, primary_key=True, index=True)
    extracted_entry_id = Column(Integer, ForeignKey("extracted_entries.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    invoice_no = Column(String(100), nullable=True)
    invoice_date = Column(Date, nullable=True)
    party_name = Column(String(255), nullable=True)
    party_gstin = Column(String(15), nullable=True)
    hsn_or_category = Column(String(50), nullable=True)
    description = Column(String(500), nullable=True)
    taxable_value = Column(Numeric(12, 2), nullable=True)
    tax_rate = Column(Numeric(5, 2), nullable=True)
    cgst = Column(Numeric(12, 2), nullable=True)
    sgst = Column(Numeric(12, 2), nullable=True)
    igst = Column(Numeric(12, 2), nullable=True)
    total = Column(Numeric(12, 2), nullable=True)
    
    entry_type = Column(Enum(EntryTypeEnum), default=EntryTypeEnum.SALES, nullable=False)
    source = Column(Enum(EntrySourceEnum), default=EntrySourceEnum.MANUAL, nullable=False)
    reviewed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="reviewed_entries")
    extracted_entry = relationship("ExtractedEntry")
    validation_results = relationship("ValidationResult", back_populates="entry", cascade="all, delete-orphan")

    @property
    def is_demo(self) -> bool:
        if self.extracted_entry and getattr(self.extracted_entry, "extraction_provider", None) == "mock":
            return True
        if self.invoice_no and "DEMO" in self.invoice_no.upper():
            return True
        if self.party_name and "DEMO" in self.party_name.upper():
            return True
        return False

    @property
    def field_confidence(self):
        if self.extracted_entry and getattr(self.extracted_entry, "field_confidence", None):
            return self.extracted_entry.field_confidence
        return None

    __table_args__ = (
        Index("ix_entries_reviewed_user_id", "user_id"),
        Index("ix_entries_reviewed_user_date", "user_id", "invoice_date"),
        Index("ix_entries_reviewed_dup_check", "user_id", "party_gstin", "invoice_no"),
    )
