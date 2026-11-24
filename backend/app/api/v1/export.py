from typing import Optional
from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.services.export.exporter import export_data

router = APIRouter(prefix="", tags=["export"])

@router.get("/export")
def export_endpoint(
    period: Optional[str] = Query(None, description="Return period in YYYY-MM format"),
    format: str = Query("xlsx", description="Export format: 'xlsx' or 'json'"),
    delete_source_images: bool = Query(False, description="Whether to delete source images after export"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/v1/export?period=&format=xlsx|json:
    - Blocks with HTTP 409 if any BLOCKING validation errors remain for the period.
    - Exports scheme-aware Excel workbook or JSON.
    - Optionally deletes source images based on retention choice.
    - Writes export event to audit_log.
    """
    content, media_type, filename = export_data(
        db=db,
        user=current_user,
        period=period,
        format=format,
        delete_source_images=delete_source_images
    )

    if format.lower() == "xlsx":
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    else:
        return JSONResponse(content=content)

