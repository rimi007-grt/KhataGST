from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.models.user import User, SchemeEnum, LanguageEnum
from app.models.entry_reviewed import EntryReviewed
from app.models.audit_log import AuditLog


# ==============================================================================
# 1. Manual Entry Creation: POST /api/v1/entries
# ==============================================================================

def test_create_manual_entry_success(client: TestClient, auth_headers):
    headers, user = auth_headers()
    payload = {
        "entry_type": "SALES",
        "invoice_no": "INV-2025-001",
        "invoice_date": "2025-11-15",
        "party_name": "Cipla Ltd",
        "party_gstin": "08AKOCX6349P1ZL",
        "hsn_or_category": "1101",
        "description": "Wheat Flour Atta",
        "taxable_value": 1000.00,
        "tax_rate": 5.0,
        "cgst": 0.0,
        "sgst": 0.0,
        "igst": 50.0,
        "total": 1050.00
    }
    response = client.post(
        "/api/v1/entries",
        json=payload,
        headers=headers
    )
    assert response.status_code == 201
    data = response.json()
    assert data["invoice_no"] == "INV-2025-001"
    assert data["source"] == "MANUAL"
    assert float(data["total"]) == 1050.0


# ==============================================================================
# 2. Human Correction: PATCH /api/v1/entries/{id} & Audit Log Diff
# ==============================================================================

def test_patch_entry_writes_audit_log_diff(client: TestClient, auth_headers, db_session: Session):
    headers, user = auth_headers()
    # 1. Create entry
    create_res = client.post(
        "/api/v1/entries",
        json={
            "invoice_no": "INV-100",
            "invoice_date": "2025-11-10",
            "party_name": "Old Party",
            "taxable_value": 1000.00,
            "total": 1180.00
        },
        headers=headers
    )
    assert create_res.status_code == 201
    entry_id = create_res.json()["id"]

    # 2. Patch entry
    patch_res = client.patch(
        f"/api/v1/entries/{entry_id}",
        json={
            "party_name": "Corrected Party Name",
            "taxable_value": 1200.00,
            "total": 1416.00
        },
        headers=headers
    )
    assert patch_res.status_code == 200
    patched_data = patch_res.json()
    assert patched_data["party_name"] == "Corrected Party Name"

    # 3. Check audit log in DB
    audit_records = db_session.query(AuditLog).filter(
        AuditLog.action == "UPDATE",
        AuditLog.entity == "entry_reviewed",
        AuditLog.entity_id == entry_id
    ).all()
    assert len(audit_records) >= 1
    last_audit = audit_records[-1]
    assert last_audit.before["party_name"] == "Old Party"
    assert last_audit.after["party_name"] == "Corrected Party Name"
    assert float(last_audit.before["taxable_value"]) == 1000.0
    assert float(last_audit.after["taxable_value"]) == 1200.0


def test_patch_entry_cross_user_forbidden(client: TestClient, auth_headers, create_user):
    headers1, user1 = auth_headers()
    user2 = create_user(email="user2@example.com")
    headers2, _ = auth_headers(user2)

    # User 1 creates entry
    create_res = client.post(
        "/api/v1/entries",
        json={"invoice_no": "PRIVATE-INV"},
        headers=headers1
    )
    entry_id = create_res.json()["id"]

    # User 2 tries to PATCH User 1's entry
    patch_res = client.patch(
        f"/api/v1/entries/{entry_id}",
        json={"invoice_no": "HACKED"},
        headers=headers2
    )
    assert patch_res.status_code == 404


# ==============================================================================
# 3. POST /api/v1/validate and GET /api/v1/validation/summary
# ==============================================================================

def test_validate_and_summary_workflow(client: TestClient, auth_headers):
    headers, user = auth_headers()

    # Create valid entry
    client.post(
        "/api/v1/entries",
        json={
            "invoice_no": "VALID-001",
            "invoice_date": "2025-11-05",
            "party_name": "LAKSHMI NARAYAN BHANDER",
            "party_gstin": "27ABCDE1234F1Z0",  # Valid state 27 matching user state 27, valid checksum 0
            "taxable_value": 1000.00,
            "tax_rate": 5.0,
            "cgst": 25.0,
            "sgst": 25.0,
            "igst": 0.0,
            "total": 1050.00
        },
        headers=headers
    )

    # Create invalid entry (tax arithmetic mismatch and bad GSTIN checksum)
    client.post(
        "/api/v1/entries",
        json={
            "invoice_no": "INVALID-002",
            "invoice_date": "2025-11-10",
            "party_name": "Bad Party",
            "party_gstin": "19CPQPS9464F1Z1",  # Invalid checksum
            "taxable_value": 1000.00,
            "tax_rate": 18.0,
            "cgst": 100.0,
            "sgst": 100.0,  # 200 instead of 180
            "igst": 0.0,
            "total": 1500.00  # Total mismatch
        },
        headers=headers
    )

    # Trigger validation
    val_res = client.post(
        "/api/v1/validate",
        json={"period": "2025-11"},
        headers=headers
    )
    assert val_res.status_code == 200
    val_data = val_res.json()
    assert val_data["total_entries"] == 2
    assert val_data["blocking_count"] >= 1
    assert val_data["has_blocking_errors"] is True

    # Check summary
    summary_res = client.get(
        "/api/v1/validation/summary?period=2025-11",
        headers=headers
    )
    assert summary_res.status_code == 200
    summary_data = summary_res.json()
    assert summary_data["total_entries"] == 2
    assert summary_data["valid_entries"] == 1
    assert summary_data["blocking_count"] >= 1
    assert summary_data["has_blocking_errors"] is True
