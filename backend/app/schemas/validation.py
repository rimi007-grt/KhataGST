from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict
from app.models.validation_result import SeverityEnum

class ValidateRequest(BaseModel):
    period: Optional[str] = None  # Format YYYY-MM

class ValidationCountsOut(BaseModel):
    blocking: int
    warning: int
    info: int

class ValidationResultOut(BaseModel):
    id: Optional[int] = None
    rule_id: str
    severity: SeverityEnum
    message_key: str
    message_params: Optional[Dict[str, Any]] = None
    message: str
    rule_version: str = "1.0"

    model_config = ConfigDict(from_attributes=True)

class EntryValidationGroup(BaseModel):
    entry_id: int
    invoice_no: Optional[str] = None
    invoice_date: Optional[date] = None
    party_name: Optional[str] = None
    total: Optional[Decimal] = None
    has_blocking: bool = False
    results: List[ValidationResultOut] = []

class ValidationResponse(BaseModel):
    period: Optional[str] = None
    total_entries: int
    blocking_count: int
    warning_count: int
    info_count: int
    counts: Optional[ValidationCountsOut] = None
    has_blocking_errors: bool
    entries: List[EntryValidationGroup] = []

class ValidationSummaryOut(BaseModel):
    period: Optional[str] = None
    total_entries: int
    valid_entries: int
    blocking_count: int
    warning_count: int
    info_count: int
    counts: Optional[ValidationCountsOut] = None
    has_blocking_errors: bool
    rate_table_version: str = "2023-10-01"
    rates_verified: bool = False

