import uuid
from typing import List
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.core.config import settings
from app.core.logging import logger
from app.models.document import Document, DocTypeEnum
from app.models.extracted_entry import ExtractedEntry
from app.models.user import User
from app.schemas.document import DocumentOut
from app.schemas.extraction import ExtractDocumentResponse, ExtractedEntryOut
from app.services.file_validator import detect_mime_type, compute_sha256, MIME_EXTENSIONS
from app.services.storage import get_storage_service, BaseStorageService
from app.services.extraction import get_extraction_provider
from app.core.rate_limit import rate_limit_extract
from app.services.cache import invalidate_dashboard_cache

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post(
    "",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload invoice or register document"
)
async def upload_document(
    file: UploadFile = File(...),
    doc_type: DocTypeEnum = Form(DocTypeEnum.SALES),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: BaseStorageService = Depends(get_storage_service)
):
    # Read file content safely
    content = await file.read()
    
    # Check file size limit (8 MB)
    if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"code": "FILE_TOO_LARGE", "message": "File exceeds maximum size limit of 8 MB"}
        )

    # Magic-byte MIME validation (whitelist: jpg, png, webp)
    mime = detect_mime_type(content)
    if not mime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_FILE_TYPE", "message": "Only JPEG, PNG, and WebP images are supported"}
        )

    # SHA-256 computation
    sha256_hash = compute_sha256(content)

    # Generate safe random filename to prevent collisions and path traversal
    extension = MIME_EXTENSIONS[mime]
    safe_filename = f"{uuid.uuid4().hex}{extension}"

    # Store file outside web root via storage abstraction
    saved_path = storage.save_file(content, safe_filename)

    # Persist RAW document record
    document = Document(
        user_id=current_user.id,
        file_path=saved_path,
        mime=mime,
        sha256=sha256_hash,
        doc_type=doc_type
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    logger.info(
        f"User {current_user.id} uploaded document {document.id} (mime: {mime}, sha256: {sha256_hash[:12]}...)"
    )

    invalidate_dashboard_cache(current_user.id)
    return DocumentOut.model_validate(document)

@router.get(
    "/{document_id}",
    response_model=DocumentOut,
    summary="Get document details by ID"
)
def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": "Document not found"}
        )

    # Per-user authorization check
    if doc.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "You are not authorized to access this document"}
        )

    return DocumentOut.model_validate(doc)

@router.post(
    "/{document_id}/extract",
    response_model=ExtractDocumentResponse,
    summary="Extract structured entries from document via configured provider",
    dependencies=[Depends(rate_limit_extract)]
)
def extract_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: BaseStorageService = Depends(get_storage_service)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": "Document not found"}
        )

    if doc.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "You are not authorized to access this document"}
        )

    # Fetch file bytes from storage
    try:
        raw_bytes = storage.get_file(doc.file_path)
    except Exception as e:
        logger.error(f"Failed to read file from storage for document {doc.id}: {e}")
        return ExtractDocumentResponse(
            status="FAILED",
            entries=[],
            page_notes="Failed to retrieve document file from storage."
        )

    # Attempt extraction
    provider = get_extraction_provider()
    try:
        extraction_result = provider.extract(raw_bytes, doc.mime)
    except Exception as e:
        logger.error(f"Extraction failed or timed out for document {doc.id}: {e}")
        # PROJECT_SPEC: "on FAILED return 200 with status and empty list so UI falls back to manual entry"
        return ExtractDocumentResponse(
            status="FAILED",
            entries=[],
            page_notes=f"Extraction failed: {str(e)}. Please proceed with manual entry."
        )

    # Clear prior extractions for this document if re-extracting
    db.query(ExtractedEntry).filter(ExtractedEntry.document_id == doc.id).delete()

    saved_entries: List[ExtractedEntry] = []
    for idx, item in enumerate(extraction_result.entries, start=1):
        extracted_row = ExtractedEntry(
            document_id=doc.id,
            line_no=idx,
            invoice_no=item.invoice_no,
            invoice_date=item.invoice_date,
            party_name=item.party_name,
            party_gstin=item.party_gstin,
            hsn_or_category=item.hsn_or_category,
            description=item.description,
            taxable_value=item.taxable_value,
            tax_rate=item.tax_rate,
            cgst=item.cgst,
            sgst=item.sgst,
            igst=item.igst,
            total=item.total,
            field_confidence=item.field_confidence,
            extraction_provider=extraction_result.provider,
            extraction_model_version=extraction_result.model_version
        )
        db.add(extracted_row)
        saved_entries.append(extracted_row)

    db.commit()
    for entry in saved_entries:
        db.refresh(entry)

    logger.info(
        f"Successfully extracted {len(saved_entries)} entries for document {doc.id} using provider {extraction_result.provider}"
    )

    invalidate_dashboard_cache(current_user.id)
    return ExtractDocumentResponse(
        status=extraction_result.status,
        entries=[ExtractedEntryOut.model_validate(e) for e in saved_entries],
        page_notes=extraction_result.page_notes
    )

@router.get(
    "/{document_id}/entries",
    response_model=List[ExtractedEntryOut],
    summary="Get derived extracted entries for document"
)
def get_document_entries(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": "Document not found"}
        )

    if doc.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "You are not authorized to access this document"}
        )

    entries = (
        db.query(ExtractedEntry)
        .filter(ExtractedEntry.document_id == doc.id)
        .order_by(ExtractedEntry.line_no)
        .all()
    )
    return [ExtractedEntryOut.model_validate(e) for e in entries]
