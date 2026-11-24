from sqlalchemy import Column, Integer, String, Date, Boolean
from app.core.database import Base

class Deadline(Base):
    """Statutory filing deadlines seeded from official or draft notices"""
    __tablename__ = "deadlines"

    id = Column(Integer, primary_key=True, index=True)
    return_type = Column(String(50), nullable=False, index=True)
    due_date = Column(Date, nullable=False)
    period = Column(String(7), nullable=True, index=True)  # e.g. "2026-11"
    scheme = Column(String(50), nullable=True)  # Optional scheme filter: REGULAR, COMPOSITION, QRMP
    source_ref = Column(String(255), nullable=False)
    verified = Column(Boolean, default=False, nullable=False)
