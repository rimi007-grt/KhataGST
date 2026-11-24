from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.entry_reviewed import EntryTypeEnum, EntrySourceEnum

class EntryBase(BaseModel):
    entry_type: EntryTypeEnum = EntryTypeEnum.SALES
    invoice_no: Optional[str] = None
    invoice_date: Optional[date] = None
    party_name: Optional[str] = None
    party_gstin: Optional[str] = None
    hsn_or_category: Optional[str] = None
    description: Optional[str] = None
    taxable_value: Optional[Decimal] = None
    tax_rate: Optional[Decimal] = None
    cgst: Optional[Decimal] = None
    sgst: Optional[Decimal] = None
    igst: Optional[Decimal] = None
    total: Optional[Decimal] = None

class EntryCreate(EntryBase):
    extracted_entry_id: Optional[int] = None
    source: EntrySourceEnum = EntrySourceEnum.MANUAL

class EntryUpdate(BaseModel):
    entry_type: Optional[EntryTypeEnum] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[date] = None
    party_name: Optional[str] = None
    party_gstin: Optional[str] = None
    hsn_or_category: Optional[str] = None
    description: Optional[str] = None
    taxable_value: Optional[Decimal] = None
    tax_rate: Optional[Decimal] = None
    cgst: Optional[Decimal] = None
    sgst: Optional[Decimal] = None
    igst: Optional[Decimal] = None
    total: Optional[Decimal] = None

class EntryOut(EntryBase):
    id: int
    user_id: int
    extracted_entry_id: Optional[int] = None
    source: EntrySourceEnum
    reviewed_at: datetime
    is_demo: bool = False
    field_confidence: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)

