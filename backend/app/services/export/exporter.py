import os
from typing import Any, Dict, List, Optional, Tuple, Union
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.entry_reviewed import EntryReviewed
from app.models.extracted_entry import ExtractedEntry
from app.models.document import Document
from app.models.audit_log import AuditLog
from app.services.storage import LocalStorageService
from app.services.validation.engine import validate_user_entries, get_validation_summary
from app.services.scheme.processor import get_scheme_processor
from app.services.export.excel_builder import build_excel_workbook
from app.services.export.json_builder import build_json_export

def export_data(
    db: Session,
    user: User,
    period: Optional[str] = None,
    format: str = "xlsx",
    delete_source_images: bool = False
) -> Tuple[Union[bytes, Dict[str, Any]], str, str]:
    """
    Executes scheme export.
    1. Validates user entries: Blocks export with HTTP 409 if any BLOCKING errors remain.
    2. Processes entries according to user's scheme.
    3. Builds requested format (xlsx or json).
    4. Handles optional source-image deletion based on user retention choice.
    5. Records export action in audit_log.
    Returns: (content, media_type, filename)
    """
    fmt = format.lower().strip()
    if fmt not in ["xlsx", "json"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_FORMAT", "message": "Format must be either 'xlsx' or 'json'."}
        )

    # 1. Validation check - BLOCKING errors must prevent export
    validation_res = validate_user_entries(db, user, period=period)
    if validation_res.has_blocking_errors:
        blocking_errors = []
        for grp in validation_res.entries:
            for r in grp.results:
                if r.severity.value == "BLOCKING":
                    blocking_errors.append({
                        "entry_id": grp.entry_id,
                        "invoice_no": grp.invoice_no,
                        "rule_id": r.rule_id,
                        "message": r.message
                    })

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "EXPORT_BLOCKED",
                "message": f"Export blocked: {validation_res.blocking_count} BLOCKING validation error(s) must be resolved before export.",
                "details": {
                    "period": period,
                    "blocking_count": validation_res.blocking_count,
                    "errors": blocking_errors
                }
            }
        )

    # 2. Fetch reviewed entries
    query = db.query(EntryReviewed).filter(EntryReviewed.user_id == user.id)
    all_entries = query.all()

    target_entries = all_entries
    if period:
        try:
            year, month = map(int, period.split("-"))
            target_entries = [
                e for e in all_entries
                if e.invoice_date and e.invoice_date.year == year and e.invoice_date.month == month
            ]
        except ValueError:
            pass

    # 3. Process via scheme processor
    processor = get_scheme_processor(user.scheme)
    processed_data = processor.process(db, user, target_entries, period)

    # 4. Handle optional source-image deletion
    deleted_images_count = 0
    if delete_source_images and target_entries:
        storage = LocalStorageService()
        doc_ids = set()
        for e in target_entries:
            if e.extracted_entry_id:
                ext = db.query(ExtractedEntry).filter(ExtractedEntry.id == e.extracted_entry_id).first()
                if ext and ext.document_id:
                    doc_ids.add(ext.document_id)

        for doc_id in doc_ids:
            doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == user.id).first()
            if doc and doc.file_path:
                try:
                    storage.delete_file(doc.file_path)
                    deleted_images_count += 1
                except Exception:
                    pass

    # 5. Log in audit_log
    audit = AuditLog(
        user_id=user.id,
        action="EXPORT",
        entity="export",
        entity_id=None,
        before=None,
        after={
            "period": period,
            "format": fmt,
            "scheme": processed_data.scheme,
            "entry_count": len(target_entries),
            "delete_source_images": delete_source_images,
            "deleted_images_count": deleted_images_count
        }
    )
    db.add(audit)
    db.commit()

    # 6. Generate payload
    clean_period = period or "all"
    clean_gstin = (user.gstin or "GST").replace(" ", "_")
    if fmt == "xlsx":
        content = build_excel_workbook(processed_data)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"KhataGST_{clean_gstin}_{clean_period}.xlsx"
        return content, media_type, filename
    else:
        json_data = build_json_export(processed_data)
        media_type = "application/json"
        filename = f"KhataGST_{clean_gstin}_{clean_period}.json"
        return json_data, media_type, filename

