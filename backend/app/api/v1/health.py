from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.database import check_db_connectivity
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])

@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check endpoint"
)
def health_check():
    """
    Returns API health and database connectivity.
    No sensitive database connection strings, credentials, or traces are exposed.
    """
    connected, db_status = check_db_connectivity()
    return HealthResponse(
        status="ok" if connected else "degraded",
        database=db_status,
        version="1.0.0",
        timestamp=datetime.now(timezone.utc).isoformat()
    )
