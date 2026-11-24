from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardResponse
from app.services.dashboard import compute_dashboard_data
from app.services.cache import get_dashboard_cache, set_dashboard_cache

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("", response_model=DashboardResponse)
def get_dashboard(
    period: Optional[str] = Query(None, description="Filing period in YYYY-MM format"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/v1/dashboard: Returns status-and-action metrics for the Home screen.
    Single source of truth. Results cached for 30s per user+period.
    """
    if not period:
        period = datetime.now().strftime("%Y-%m")

    # 1. Check in-memory TTL cache (30s)
    cached = get_dashboard_cache(current_user.id, period)
    if cached is not None:
        return cached

    # 2. Compute fresh from real backend data
    data = compute_dashboard_data(db, current_user, period=period)

    # 3. Store in cache
    set_dashboard_cache(current_user.id, period, data)

    return data
