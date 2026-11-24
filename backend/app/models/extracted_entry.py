from sqlalchemy import Column, Integer, String, Date, Numeric, JSON, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base

class ExtractedEntry(Base):
    """DERIVED raw machine extraction"""
    __tablename__ = "extracted_entries"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    line_no = Column(Integer, default=1, nullable=False)
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
    field_confidence = Column(JSON, nullable=True)  # {"invoice_no": 0.95, ...}
    extraction_provider = Column(String(50), nullable=False)
    extraction_model_version = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    document = relationship("Document", back_populates="extracted_entries")

