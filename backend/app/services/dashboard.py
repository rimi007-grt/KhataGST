from datetime import datetime, date
from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.document import Document
from app.models.extracted_entry import ExtractedEntry
from app.models.entry_reviewed import EntryReviewed, EntryTypeEnum
from app.models.validation_result import SeverityEnum
from app.models.deadline import Deadline
from app.models.rate_table import RateTable
from app.services.validation.engine import validate_user_entries
from app.schemas.validation import ValidationCountsOut
from app.schemas.dashboard import (
    DashboardResponse,
    DashboardTotalsOut,
    TopIssueOut,
    RecentDocumentOut,
    NextActionOut,
    DeadlineOut,
    RateTableStatusOut
)

def compute_dashboard_data(db: Session, user: User, period: Optional[str] = None) -> DashboardResponse:
    """
    Computes all dashboard metrics using real backend data.
    Single source of truth: delegates validation directly to validate_user_entries().
    """
    if not period:
        period = datetime.now().strftime("%Y-%m")

    try:
        year, month = map(int, period.split("-"))
    except ValueError:
        period = datetime.now().strftime("%Y-%m")
        year, month = map(int, period.split("-"))

    # 1. Scheme formatting
    raw_scheme = getattr(user.scheme, "value", user.scheme)
    scheme_str = str(raw_scheme).upper() if raw_scheme else "REGULAR"
    if "COMP" in scheme_str:
        scheme_formatted = "Composition"
    elif "QRMP" in scheme_str:
        scheme_formatted = "QRMP"
    else:
        scheme_formatted = "Regular"

    # 2. Entries: Reviewed vs Unreviewed for this period
    all_user_reviewed = db.query(EntryReviewed).filter(EntryReviewed.user_id == user.id).all()
    period_reviewed = [
        e for e in all_user_reviewed
        if e.invoice_date and e.invoice_date.year == year and e.invoice_date.month == month
    ]
    entries_reviewed = len(period_reviewed)

    # Find unreviewed extracted entries for this user and period
    reviewed_ext_ids = {e.extracted_entry_id for e in all_user_reviewed if e.extracted_entry_id is not None}
    unreviewed_query = (
        db.query(ExtractedEntry)
        .join(Document, ExtractedEntry.document_id == Document.id)
        .filter(Document.user_id == user.id)
    )
    if reviewed_ext_ids:
        unreviewed_query = unreviewed_query.filter(~ExtractedEntry.id.in_(reviewed_ext_ids))
    unreviewed_candidates = unreviewed_query.all()

    unreviewed_in_period = []
    for ext in unreviewed_candidates:
        if ext.invoice_date:
            if ext.invoice_date.year == year and ext.invoice_date.month == month:
                unreviewed_in_period.append(ext)
        elif ext.document and ext.document.uploaded_at:
            if ext.document.uploaded_at.year == year and ext.document.uploaded_at.month == month:
                unreviewed_in_period.append(ext)

    unreviewed_count = len(unreviewed_in_period)
    entries_total = entries_reviewed + unreviewed_count

    # 3. Validation results from single source of truth
    val_res = validate_user_entries(db, user, period=period)
    errors = ValidationCountsOut(
        blocking=val_res.blocking_count,
        warning=val_res.warning_count,
        info=val_res.info_count
    )

    entries_with_blocking = {grp.entry_id for grp in val_res.entries if grp.has_blocking}
    excluded_entries_count = len(entries_with_blocking)
    clean_reviewed = [e for e in period_reviewed if e.id not in entries_with_blocking]
    entries_without_blocking = len(clean_reviewed)

    # 4. Readiness percentage
    # Value = round(100 * entries with zero BLOCKING errors / total entries)
    # If 0 entries, readiness is 0 (empty period returns zeros)
    if entries_total == 0:
        readiness_pct = 0
    else:
        readiness_pct = max(0, min(100, round((100 * entries_without_blocking) / entries_total)))

    # 5. Totals: Sales, Tax collected, Purchases (ITC)
    # "Totals use only reviewed entries without BLOCKING errors"
    sales_sum = 0.0
    tax_sum = 0.0
    purchases_sum = 0.0

    for e in clean_reviewed:
        etype = getattr(e.entry_type, "value", e.entry_type)
        val = float(e.total) if e.total is not None else (
            float(e.taxable_value or 0) + float(e.cgst or 0) + float(e.sgst or 0) + float(e.igst or 0)
        )
        tax = float(e.cgst or 0) + float(e.sgst or 0) + float(e.igst or 0)
        if etype == EntryTypeEnum.SALES.value or etype == "SALES":
            sales_sum += val
            tax_sum += tax
        elif etype == EntryTypeEnum.PURCHASE.value or etype == "PURCHASE":
            purchases_sum += val

    totals = DashboardTotalsOut(
        sales=round(sales_sum, 2),
        tax_collected=round(tax_sum, 2),
        purchases_itc=round(purchases_sum, 2),
        excluded_entries=excluded_entries_count
    )

    # 6. Top issues (max 3)
    issue_counts = {}
    first_entry_map = {}
    message_key_map = {}
    severity_map = {}

    for grp in val_res.entries:
        for finding in grp.results:
            r_id = finding.rule_id
            issue_counts[r_id] = issue_counts.get(r_id, 0) + 1
            if r_id not in first_entry_map:
                first_entry_map[r_id] = grp.entry_id
                message_key_map[r_id] = finding.message_key
                severity_map[r_id] = finding.severity

    def issue_sort_key(r_id):
        sev = severity_map.get(r_id, SeverityEnum.INFO)
        sev_rank = 0 if sev == SeverityEnum.BLOCKING else (1 if sev == SeverityEnum.WARNING else 2)
        return (sev_rank, -issue_counts[r_id])

    sorted_rule_ids = sorted(issue_counts.keys(), key=issue_sort_key)
    top_issues = [
        TopIssueOut(
            rule_id=r_id,
            count=issue_counts[r_id],
            message_key=message_key_map[r_id],
            first_entry_id=first_entry_map[r_id]
        )
        for r_id in sorted_rule_ids[:3]
    ]

    # 7. Recent documents (max 5)
    docs = (
        db.query(Document)
        .filter(Document.user_id == user.id)
        .order_by(Document.uploaded_at.desc())
        .limit(5)
        .all()
    )
    recent_documents: List[RecentDocumentOut] = []
    for doc in docs:
        doc_exts = db.query(ExtractedEntry).filter(ExtractedEntry.document_id == doc.id).all()
        if not doc_exts:
            doc_status = "Needs review"
        else:
            all_reviewed = all(ext.id in reviewed_ext_ids for ext in doc_exts)
            doc_status = "Extracted" if all_reviewed else "Needs review"

        recent_documents.append(
            RecentDocumentOut(
                id=doc.id,
                doc_type=getattr(doc.doc_type, "value", str(doc.doc_type)),
                uploaded_at=doc.uploaded_at,
                status=doc_status
            )
        )

    # 8. Deterministic next_action
    # 1. no entries for the period -> "scan_first_bill"
    # 2. unreviewed entries > 0 -> "review_entries"
    # 3. blocking errors > 0 -> "fix_blocking_errors"
    # 4. otherwise -> "export_return"
    if entries_total == 0:
        next_action = NextActionOut(key="scan_first_bill", params={})
    elif unreviewed_count > 0:
        next_action = NextActionOut(key="review_entries", params={"count": unreviewed_count})
    elif errors.blocking > 0:
        next_action = NextActionOut(key="fix_blocking_errors", params={"count": errors.blocking})
    else:
        next_action = NextActionOut(key="export_return", params={})

    # 9. Deadlines table lookup
    dl_query = db.query(Deadline)
    period_deadlines = dl_query.filter((Deadline.period == period) | (Deadline.period == None)).all()
    if not period_deadlines:
        period_deadlines = dl_query.all()

    matching_deadlines: List[DeadlineOut] = []
    user_scheme_upper = str(getattr(user.scheme, "value", user.scheme)).upper()
    for d in period_deadlines:
        if d.scheme is None or d.scheme.upper() == user_scheme_upper:
            matching_deadlines.append(
                DeadlineOut(
                    return_type=d.return_type,
                    due_date=d.due_date,
                    verified=d.verified,
                    source_ref=d.source_ref
                )
            )
    matching_deadlines.sort(key=lambda x: x.due_date)

    # 10. Rate table status
    has_unverified = db.query(RateTable).filter(RateTable.verified == False).first() is not None
    rate_table = RateTableStatusOut(version="2023-10-01", has_unverified=has_unverified)

    return DashboardResponse(
        period=period,
        scheme=scheme_formatted,
        readiness_pct=readiness_pct,
        entries_total=entries_total,
        entries_reviewed=entries_reviewed,
        errors=errors,
        totals=totals,
        top_issues=top_issues,
        recent_documents=recent_documents,
        next_action=next_action,
        deadlines=matching_deadlines,
        rate_table=rate_table
    )
