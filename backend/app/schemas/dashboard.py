from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.schemas.validation import ValidationCountsOut

class TopIssueOut(BaseModel):
    rule_id: str
    count: int
    message_key: str
    first_entry_id: Optional[int] = None

class RecentDocumentOut(BaseModel):
    id: int
    doc_type: str
    uploaded_at: datetime
    status: str

class NextActionOut(BaseModel):
    key: str
    params: Dict[str, Any] = Field(default_factory=dict)

class DeadlineOut(BaseModel):
    return_type: str
    due_date: date
    verified: bool
    source_ref: str

class RateTableStatusOut(BaseModel):
    version: str
    has_unverified: bool

class DashboardTotalsOut(BaseModel):
    sales: float
    tax_collected: float
    purchases_itc: float
    excluded_entries: int

class DashboardResponse(BaseModel):
    period: str
    scheme: str
    readiness_pct: int
    entries_total: int
    entries_reviewed: int
    errors: ValidationCountsOut
    totals: DashboardTotalsOut
    top_issues: List[TopIssueOut] = Field(default_factory=list)
    recent_documents: List[RecentDocumentOut] = Field(default_factory=list)
    next_action: NextActionOut
    deadlines: List[DeadlineOut] = Field(default_factory=list)
    rate_table: RateTableStatusOut
