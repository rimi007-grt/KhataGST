import pytest
from datetime import date, datetime
from decimal import Decimal
from app.models.entry_reviewed import EntryReviewed, EntryTypeEnum, EntrySourceEnum
from app.models.document import Document, DocTypeEnum
from app.models.extracted_entry import ExtractedEntry
from app.services.cache import invalidate_dashboard_cache

def test_dashboard_empty_period_returns_zeros_and_scan_first_bill(client, db_session, auth_headers):
    """
    Empty period must return zeros for counts and totals, readiness_pct=0,
    and next_action 'scan_first_bill'.
    """
    headers, user = auth_headers()
    invalidate_dashboard_cache()

    resp = client.get("/api/v1/dashboard?period=2026-11", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["period"] == "2026-11"
    assert data["scheme"] in ["Regular", "Composition", "QRMP"]
    assert data["readiness_pct"] == 0
    assert data["entries_total"] == 0
    assert data["entries_reviewed"] == 0
    assert data["errors"] == {"blocking": 0, "warning": 0, "info": 0}
    assert data["totals"]["sales"] == 0.0
    assert data["totals"]["tax_collected"] == 0.0
    assert data["totals"]["purchases_itc"] == 0.0
    assert data["totals"]["excluded_entries"] == 0
    assert data["top_issues"] == []
    assert data["next_action"]["key"] == "scan_first_bill"
    assert "deadlines" in data
    assert "rate_table" in data

def test_dashboard_counts_match_validation_summary(client, db_session, auth_headers):
    """
    All counts (blocking/warning/info) and entries must match /validation/summary exactly.
    """
    headers, user = auth_headers()
    invalidate_dashboard_cache()
    period = "2026-11"

    # Add 1 valid entry and 1 entry with blocking checksum error
    e1 = EntryReviewed(
        user_id=user.id,
        invoice_no="INV-VALID-001",
        invoice_date=date(2026, 11, 5),
        party_name="Clean Buyer",
        party_gstin="27AAPFU0939F1ZV",  # Valid checksum
        taxable_value=Decimal("10000.00"),
        tax_rate=Decimal("18.00"),
        cgst=Decimal("900.00"),
        sgst=Decimal("900.00"),
        igst=Decimal("0.00"),
        total=Decimal("11800.00"),
        entry_type=EntryTypeEnum.SALES,
        source=EntrySourceEnum.MANUAL
    )
    e2 = EntryReviewed(
        user_id=user.id,
        invoice_no="INV-BAD-002",
        invoice_date=date(2026, 11, 10),
        party_name="Bad GSTIN Vendor",
        party_gstin="27AABCG1234F1Z8",  # Invalid checksum -> R01 BLOCKING
        taxable_value=Decimal("5000.00"),
        tax_rate=Decimal("18.00"),
        cgst=Decimal("450.00"),
        sgst=Decimal("450.00"),
        igst=Decimal("0.00"),
        total=Decimal("5900.00"),
        entry_type=EntryTypeEnum.SALES,
        source=EntrySourceEnum.MANUAL
    )
    db_session.add(e1)
    db_session.add(e2)
    db_session.commit()

    # Query validation summary
    summary_resp = client.get(f"/api/v1/validation/summary?period={period}", headers=headers)
    assert summary_resp.status_code == 200
    summary = summary_resp.json()

    # Query dashboard
    dash_resp = client.get(f"/api/v1/dashboard?period={period}", headers=headers)
    assert dash_resp.status_code == 200
    dash = dash_resp.json()

    # Assert exact match between dashboard and validation summary
    assert dash["entries_reviewed"] == summary["total_entries"]
    assert dash["errors"]["blocking"] == summary["blocking_count"]
    assert dash["errors"]["warning"] == summary["warning_count"]
    assert dash["errors"]["info"] == summary["info_count"]

    # Excluded totals check: sales total must exclude e2 (which has blocking error)
    # Only e1 total (11800) and tax (1800)
    assert dash["totals"]["sales"] == 11800.0
    assert dash["totals"]["tax_collected"] == 1800.0
    assert dash["totals"]["excluded_entries"] == 1

def test_dashboard_deterministic_next_action_states(client, db_session, auth_headers):
    """
    Test deterministic next_action priority:
    1. no entries -> scan_first_bill
    2. unreviewed entries > 0 -> review_entries
    3. blocking errors > 0 -> fix_blocking_errors
    4. otherwise -> export_return
    """
    headers, user = auth_headers()
    invalidate_dashboard_cache()
    period = "2026-11"

    # State 1: No entries
    r1 = client.get(f"/api/v1/dashboard?period={period}", headers=headers).json()
    assert r1["next_action"]["key"] == "scan_first_bill"

    # State 2: Upload a document with extracted entries not yet reviewed
    doc = Document(
        user_id=user.id,
        file_path="/tmp/test.jpg",
        mime="image/jpeg",
        sha256="abc123sha256",
        doc_type=DocTypeEnum.SALES
    )
    db_session.add(doc)
    db_session.commit()

    ext = ExtractedEntry(
        document_id=doc.id,
        line_no=1,
        invoice_no="EXT-001",
        invoice_date=date(2026, 11, 2),
        party_name="Raw Party",
        taxable_value=Decimal("100.00"),
        extraction_provider="mock",
        extraction_model_version="1.0"
    )
    db_session.add(ext)
    db_session.commit()
    invalidate_dashboard_cache()

    r2 = client.get(f"/api/v1/dashboard?period={period}", headers=headers).json()
    assert r2["next_action"]["key"] == "review_entries"
    assert r2["next_action"]["params"]["count"] >= 1

    # State 3: Entry reviewed, but has BLOCKING error
    e_bad = EntryReviewed(
        user_id=user.id,
        extracted_entry_id=ext.id,  # reviewed the extracted entry
        invoice_no="INV-BAD-BLOCKING",
        invoice_date=date(2026, 11, 2),
        party_name="Party with Bad GSTIN",
        party_gstin="27AABCG1234F1Z8",  # Invalid checksum
        taxable_value=Decimal("100.00"),
        tax_rate=Decimal("18.00"),
        cgst=Decimal("9.00"),
        sgst=Decimal("9.00"),
        total=Decimal("118.00"),
        entry_type=EntryTypeEnum.SALES,
        source=EntrySourceEnum.EXTRACTED_EDITED
    )
    db_session.add(e_bad)
    db_session.commit()
    invalidate_dashboard_cache()

    r3 = client.get(f"/api/v1/dashboard?period={period}", headers=headers).json()
    assert r3["next_action"]["key"] == "fix_blocking_errors"
    assert r3["next_action"]["params"]["count"] >= 1

    # State 4: Fix the blocking error -> export_return
    e_bad.party_gstin = "27AAPFU0939F1ZV"  # Valid checksum
    db_session.commit()
    invalidate_dashboard_cache()

    r4 = client.get(f"/api/v1/dashboard?period={period}", headers=headers).json()
    assert r4["next_action"]["key"] == "export_return"
    assert r4["readiness_pct"] == 100

def test_dashboard_user_authorization_isolation(client, db_session, auth_headers, create_user):
    """
    Ensure user A cannot see user B's dashboard metrics or documents.
    """
    headers_a, user_a = auth_headers()
    user_b = create_user(email="user_b@example.com")
    invalidate_dashboard_cache()

    # User A has 1 entry
    e_a = EntryReviewed(
        user_id=user_a.id,
        invoice_no="INV-A-1",
        invoice_date=date(2026, 11, 1),
        party_name="User A Party",
        party_gstin="27AAPFU0939F1ZV",
        taxable_value=Decimal("50000.00"),
        tax_rate=Decimal("18.00"),
        cgst=Decimal("4500.00"),
        sgst=Decimal("4500.00"),
        total=Decimal("59000.00"),
        entry_type=EntryTypeEnum.SALES,
        source=EntrySourceEnum.MANUAL
    )
    db_session.add(e_a)
    db_session.commit()

    # User B token
    from app.core.security import create_access_token
    token_b = create_access_token(user_b.id)
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Query dashboard for User B
    resp_b = client.get("/api/v1/dashboard?period=2026-11", headers=headers_b)
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["entries_total"] == 0
    assert data_b["totals"]["sales"] == 0.0

    # Query dashboard for User A
    resp_a = client.get("/api/v1/dashboard?period=2026-11", headers=headers_a)
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert data_a["entries_total"] == 1
    assert data_a["totals"]["sales"] == 59000.0

def test_dashboard_caching_and_invalidation(client, db_session, auth_headers):
    """
    Verify 30s caching and invalidation on entry mutations.
    """
    headers, user = auth_headers()
    invalidate_dashboard_cache()

    # First call: empty
    r1 = client.get("/api/v1/dashboard?period=2026-11", headers=headers).json()
    assert r1["entries_total"] == 0

    # Seed demo entries through API (triggers invalidation)
    seed_resp = client.post("/api/v1/entries/seed-demo?period=2026-11", headers=headers)
    assert seed_resp.status_code == 201

    # Second call should immediately show updated entries (cache was invalidated)
    r2 = client.get("/api/v1/dashboard?period=2026-11", headers=headers).json()
    assert r2["entries_total"] >= 2
