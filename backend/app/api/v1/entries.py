from datetime import date
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.entry_reviewed import EntryReviewed, EntryTypeEnum, EntrySourceEnum
from app.models.audit_log import AuditLog
from app.schemas.entry_reviewed import EntryCreate, EntryUpdate, EntryOut
from app.services.cache import invalidate_dashboard_cache

router = APIRouter(prefix="/entries", tags=["entries"])

def serialize_for_json(data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not data:
        return None
    return json.loads(json.dumps(data, default=str))

@router.post("", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(
    entry_in: EntryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/v1/entries: Create a reviewed entry (manual or promoted from extracted).
    """
    entry_data = entry_in.model_dump()
    entry = EntryReviewed(
        user_id=current_user.id,
        **entry_data
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    # Log creation in audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="CREATE",
        entity="entry_reviewed",
        entity_id=entry.id,
        before=None,
        after=serialize_for_json(entry_in.model_dump(exclude_none=True))
    )
    db.add(audit)
    db.commit()

    invalidate_dashboard_cache(current_user.id)
    return entry


@router.get("", response_model=List[EntryOut])
def list_entries(
    period: Optional[str] = Query(None, description="Return period in YYYY-MM format"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/v1/entries: List reviewed entries for the current user.
    """
    query = db.query(EntryReviewed).filter(EntryReviewed.user_id == current_user.id)
    entries = query.all()

    if period:
        try:
            year, month = map(int, period.split("-"))
            entries = [
                e for e in entries
                if e.invoice_date and e.invoice_date.year == year and e.invoice_date.month == month
            ]
        except ValueError:
            pass

    return entries


@router.post("/seed-demo", response_model=List[EntryOut], status_code=status.HTTP_201_CREATED)
def seed_demo_entries(
    period: Optional[str] = Query(None, description="Return period in YYYY-MM format, defaults to current month"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /api/v1/entries/seed-demo:
    Seeds demo sales entries for the given period for testing/offline demo.
    """
    now = date.today()
    if not period or len(period) < 7:
        target_period = f"{now.year}-{now.month:02d}"
    else:
        target_period = period

    try:
        parts = target_period.split("-")
        year = int(parts[0])
        month = int(parts[1])
    except (ValueError, IndexError):
        year, month = now.year, now.month

    day1 = min(5, 28)
    day2 = min(10, 28)
    date1 = date(year, month, day1)
    date2 = date(year, month, day2)

    existing = db.query(EntryReviewed).filter(
        EntryReviewed.user_id == current_user.id
    ).all()
    existing_in_period = [
        e for e in existing
        if e.invoice_date and e.invoice_date.year == year and e.invoice_date.month == month
    ]
    if existing_in_period:
        return existing_in_period

    entry1 = EntryReviewed(
        user_id=current_user.id,
        invoice_no="DEMO-INV-001",
        invoice_date=date1,
        party_name="DEMO - Gupta Kirana Store",
        party_gstin="27AABCG1234F1Z8",
        hsn_or_category="1101",
        description="Wheat flour 50kg bags",
        taxable_value=5000.00,
        tax_rate=5.0,
        cgst=125.00,
        sgst=125.00,
        igst=0.00,
        total=5250.00,
        entry_type=EntryTypeEnum.SALES,
        source=EntrySourceEnum.MANUAL
    )

    entry2 = EntryReviewed(
        user_id=current_user.id,
        invoice_no="DEMO-INV-002",
        invoice_date=date2,
        party_name="DEMO - Rajasthan Bakery",
        party_gstin="08AABCR5678D1Z2",
        hsn_or_category="1905",
        description="Biscuits and cookies carton",
        taxable_value=10000.00,
        tax_rate=18.0,
        cgst=0.00,
        sgst=0.00,
        igst=1800.00,
        total=11800.00,
        entry_type=EntryTypeEnum.SALES,
        source=EntrySourceEnum.MANUAL
    )

    db.add(entry1)
    db.add(entry2)
    db.commit()
    db.refresh(entry1)
    db.refresh(entry2)

    invalidate_dashboard_cache(current_user.id)
    return [entry1, entry2]


@router.get("/{id}", response_model=EntryOut)
def get_entry(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /api/v1/entries/{id}: Get a specific reviewed entry with user ownership check.
    """
    entry = db.query(EntryReviewed).filter(
        EntryReviewed.id == id,
        EntryReviewed.user_id == current_user.id
    ).first()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ENTRY_NOT_FOUND", "message": f"Entry with id {id} not found."}
        )

    return entry


@router.patch("/{id}", response_model=EntryOut)
def update_entry(
    id: int,
    entry_update: EntryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    PATCH /api/v1/entries/{id}: Human correction/edit of an entry.
    Saves changes and writes before/after diff to audit_log.
    """
    entry = db.query(EntryReviewed).filter(
        EntryReviewed.id == id,
        EntryReviewed.user_id == current_user.id
    ).first()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ENTRY_NOT_FOUND", "message": f"Entry with id {id} not found."}
        )

    # Capture before state
    update_data = entry_update.model_dump(exclude_unset=True)
    before_state = {}
    after_state = {}

    for field, new_val in update_data.items():
        old_val = getattr(entry, field)
        # Format for json audit log
        old_val_fmt = str(old_val) if isinstance(old_val, date) else (float(old_val) if hasattr(old_val, "as_tuple") else old_val)
        new_val_fmt = str(new_val) if isinstance(new_val, date) else (float(new_val) if hasattr(new_val, "as_tuple") else new_val)
        if old_val_fmt != new_val_fmt:
            before_state[field] = old_val_fmt
            after_state[field] = new_val_fmt
            setattr(entry, field, new_val)

    if before_state or after_state:
        # Mark source as EXTRACTED_EDITED if it came from extracted
        if entry.extracted_entry_id:
            entry.source = EntrySourceEnum.EXTRACTED_EDITED

        # Record diff in audit_log
        audit = AuditLog(
            user_id=current_user.id,
            action="UPDATE",
            entity="entry_reviewed",
            entity_id=entry.id,
            before=serialize_for_json(before_state),
            after=serialize_for_json(after_state)
        )
        db.add(audit)
        db.commit()
        db.refresh(entry)
        invalidate_dashboard_cache(current_user.id)

    return entry
