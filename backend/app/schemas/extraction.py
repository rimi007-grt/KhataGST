from datetime import date, datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

class ExtractedEntryItem(BaseModel):
    """Single item extracted from raw image"""
    invoice_no: Optional[str] = None
    invoice_date: Optional[date] = None
    party_name: Optional[str] = None
    party_gstin: Optional[str] = None
    hsn_or_category: Optional[str] = None
    description: Optional[str] = None
    taxable_value: Optional[float] = None
    tax_rate: Optional[float] = None
    cgst: Optional[float] = None
    sgst: Optional[float] = None
    igst: Optional[float] = None
    total: Optional[float] = None
    field_confidence: Dict[str, Optional[float]] = Field(default_factory=dict)

class ExtractionResult(BaseModel):
    """Raw result returned by an ExtractionProvider"""
    entries: List[ExtractedEntryItem] = Field(default_factory=list)
    page_notes: Optional[str] = None
    provider: str
    model_version: str
    status: str = "OK"  # OK, PARTIAL, FAILED

class ExtractedEntryOut(BaseModel):
    """Persisted DERIVED row in extracted_entries"""
    id: int
    document_id: int
    line_no: int
    invoice_no: Optional[str] = None
    invoice_date: Optional[date] = None
    party_name: Optional[str] = None
    party_gstin: Optional[str] = None
    hsn_or_category: Optional[str] = None
    description: Optional[str] = None
    taxable_value: Optional[float] = None
    tax_rate: Optional[float] = None
    cgst: Optional[float] = None
    sgst: Optional[float] = None
    igst: Optional[float] = None
    total: Optional[float] = None
    field_confidence: Optional[Dict[str, float]] = None
    extraction_provider: str
    extraction_model_version: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ExtractDocumentResponse(BaseModel):
    """API response shape for POST /documents/{id}/extract"""
    status: str  # OK, PARTIAL, FAILED
    entries: List[ExtractedEntryOut] = Field(default_factory=list)
    page_notes: Optional[str] = None

