from sqlalchemy import Column, Integer, String, Date, Numeric, Boolean
from app.core.database import Base

class RateTable(Base):
    """Versioned GST rates seeded from official CBIC/GSTN sources"""
    __tablename__ = "rate_table"

    id = Column(Integer, primary_key=True, index=True)
    hsn_or_category = Column(String(50), nullable=False, index=True)
    description = Column(String(255), nullable=True)
    rate = Column(Numeric(5, 2), nullable=False)
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)
    source_ref = Column(String(255), nullable=False)
    verified = Column(Boolean, default=False, nullable=False)

