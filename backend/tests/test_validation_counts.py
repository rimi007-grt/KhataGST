import pytest
from datetime import date
from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from app.models.user import User, SchemeEnum, LanguageEnum
from app.models.entry_reviewed import EntryReviewed, EntryTypeEnum, EntrySourceEnum
from app.services.validation.engine import (
    validate_user_entries,
    get_validation_summary,
    get_validation_counts
)

def test_unified_validation_counts_consistency(client, db_session, auth_headers):
    """
    Test P0.1: Ensure validate_user_entries, get_validation_summary,
    and get_validation_counts return identical {blocking, warning, info} counts.
    """
    headers, user = auth_headers()
    period = "2026-11"

    # Add sample reviewed entries for period
    entry1 = EntryReviewed(
        user_id=user.id,
        invoice_no="INV-COUNTS-001",
        invoice_date=date(2026, 11, 5),
        party_name="Vendor A",
        party_gstin="27AABCG1234F1Z8",  # Invalid checksum -> R01 BLOCKING
        taxable_value=Decimal("1000.00"),
        tax_rate=Decimal("18.00"),
        cgst=Decimal("90.00"),
        sgst=Decimal("90.00"),
        igst=Decimal("0.00"),
        total=Decimal("1180.00"),
        entry_type=EntryTypeEnum.SALES,
        source=EntrySourceEnum.MANUAL
    )
    entry2 = EntryReviewed(
        user_id=user.id,
        invoice_no="INV-COUNTS-002",
        invoice_date=date(2026, 11, 10),
        party_name="Vendor B",
        party_gstin="27AABCG1234F1Z8",  # Invalid checksum -> R01 BLOCKING
        taxable_value=Decimal("2000.00"),
        tax_rate=Decimal("18.00"),
        cgst=Decimal("100.00"),  # Bad tax arithmetic -> R02 BLOCKING
        sgst=Decimal("100.00"),
        igst=Decimal("0.00"),
        total=Decimal("2200.00"),
        entry_type=EntryTypeEnum.SALES,
        source=EntrySourceEnum.MANUAL
    )
    db_session.add(entry1)
    db_session.add(entry2)
    db_session.commit()

    # Direct service function calls
    res_validate = validate_user_entries(db_session, user, period=period)
    res_summary = get_validation_summary(db_session, user, period=period)
    res_counts = get_validation_counts(db_session, user, period=period)

    # Assert service functions return identical counts
    assert res_validate.blocking_count == res_summary.blocking_count == res_counts.blocking
    assert res_validate.warning_count == res_summary.warning_count == res_counts.warning
    assert res_validate.info_count == res_summary.info_count == res_counts.info

    # API endpoint calls
    api_validate = client.post("/api/v1/validate", json={"period": period}, headers=headers).json()
    api_summary = client.get(f"/api/v1/validation/summary?period={period}", headers=headers).json()
    api_counts = client.get(f"/api/v1/validation/counts?period={period}", headers=headers).json()

    # Assert all endpoints return identical counts
    assert api_validate["blocking_count"] == api_summary["blocking_count"] == api_counts["blocking"]
    assert api_validate["warning_count"] == api_summary["warning_count"] == api_counts["warning"]
    assert api_validate["info_count"] == api_summary["info_count"] == api_counts["info"]
