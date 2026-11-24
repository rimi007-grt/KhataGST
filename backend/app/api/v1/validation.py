from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.validation import (
    ValidateRequest,
    ValidationResponse,
    ValidationSummaryOut,
    ValidationCountsOut
)
from app.services.validation.engine import (
    validate_user_entries,
    get_validation_summary,
    get_validation_counts
)
from app.services.cache import invalidate_dashboard_cache

router = APIRouter(prefix="", tags=["validation"])

@router.post("/validate", response_model=ValidationResponse, status_code=status.HTTP_200_OK)
def validate_entries_endpoint(
    req: ValidateRequest = ValidateRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/v1/validate {period}: Runs rules engine on reviewed entries for period.
    Persists results and returns findings grouped by entry and severity.
    """
    invalidate_dashboard_cache(current_user.id)
    return validate_user_entries(db=db, user=current_user, period=req.period)


@router.get("/validation/summary", response_model=ValidationSummaryOut, status_code=status.HTTP_200_OK)
def validation_summary_endpoint(
    period: Optional[str] = Query(None, description="Return period in YYYY-MM format"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/v1/validation/summary?period=: Returns summary of validation counts for period.
    """
    return get_validation_summary(db=db, user=current_user, period=period)


@router.get("/validation/counts", response_model=ValidationCountsOut, status_code=status.HTTP_200_OK)
def validation_counts_endpoint(
    period: Optional[str] = Query(None, description="Return period in YYYY-MM format"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/v1/validation/counts?period=:
    Single canonical backend function returning {blocking, warning, info} validation counts.
    """
    return get_validation_counts(db=db, user=current_user, period=period)
