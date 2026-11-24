from sqlalchemy import Column, Integer, String, Numeric, Boolean
from app.core.database import Base

class SystemSetting(Base):
    """System limits and thresholds seeded from official notifications"""
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Numeric(15, 2), nullable=False)
    source_ref = Column(String(255), nullable=False)
    verified = Column(Boolean, default=False, nullable=False)

