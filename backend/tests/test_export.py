import io
import openpyxl
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.models.user import User, SchemeEnum
from app.models.entry_reviewed import EntryReviewed, EntryTypeEnum
from app.models.document import Document, DocTypeEnum
from app.models.extracted_entry import ExtractedEntry
from app.models.audit_log import AuditLog
from app.services.storage import LocalStorageService


# ==============================================================================
# 1. Test 409 Blocking Behavior when BLOCKING Validation Errors Exist
# ==============================================================================

def test_export_blocked_with_409_when_blocking_errors_exist(client: TestClient, auth_headers):
    headers, user = auth_headers()

    # Create entry with BLOCKING error (bad GSTIN checksum: 19CPQPS9464F1Z1 instead of X)
    client.post(
        "/api/v1/entries",
        json={
            "invoice_no": "BLOCKING-001",
            "invoice_date": "2025-11-10",
            "party_name": "Invalid Customer",
            "party_gstin": "19CPQPS9464F1Z1",
            "taxable_value": 1000.00,
            "tax_rate": 18.0,
            "cgst": 90.0,
            "sgst": 90.0,
            "igst": 0.0,
            "total": 1180.00
        },
        headers=headers
    )

    # Attempt to export XLSX -> Must return 409 Conflict
    res_xlsx = client.get("/api/v1/export?period=2025-11&format=xlsx", headers=headers)
    assert res_xlsx.status_code == 409
    data_xlsx = res_xlsx.json()
    assert data_xlsx["code"] == "EXPORT_BLOCKED"
    assert data_xlsx["details"]["blocking_count"] >= 1

    # Attempt to export JSON -> Must return 409 Conflict
    res_json = client.get("/api/v1/export?period=2025-11&format=json", headers=headers)
    assert res_json.status_code == 409
    data_json = res_json.json()
    assert data_json["code"] == "EXPORT_BLOCKED"


# ==============================================================================
# 2. Test REGULAR / QRMP Scheme Export (XLSX and JSON)
# ==============================================================================

def test_export_regular_scheme_xlsx_and_json(client: TestClient, auth_headers):
    # User state is 27 (from conftest create_user)
    headers, user = auth_headers()

    # 1. B2B Sales Entry (party in state 27)
    client.post(
        "/api/v1/entries",
        json={
            "entry_type": "SALES",
            "invoice_no": "B2B-101",
            "invoice_date": "2025-11-05",
            "party_name": "Maharashtra Enterprises",
            "party_gstin": "27ABCDE1234F1Z0",
            "hsn_or_category": "1101",
            "description": "Wheat Flour Atta",
            "taxable_value": 10000.00,
            "tax_rate": 5.0,
            "cgst": 250.00,
            "sgst": 250.00,
            "igst": 0.0,
            "total": 10500.00
        },
        headers=headers
    )

    # 2. B2C Sales Entry (no GSTIN)
    client.post(
        "/api/v1/entries",
        json={
            "entry_type": "SALES",
            "invoice_no": "B2C-201",
            "invoice_date": "2025-11-06",
            "party_name": "Retail Shopper",
            "party_gstin": None,
            "hsn_or_category": "1905",
            "description": "Biscuits",
            "taxable_value": 2000.00,
            "tax_rate": 18.0,
            "cgst": 180.00,
            "sgst": 180.00,
            "igst": 0.0,
            "total": 2360.00
        },
        headers=headers
    )

    # 3. Purchase Entry (ITC)
    client.post(
        "/api/v1/entries",
        json={
            "entry_type": "PURCHASE",
            "invoice_no": "PUR-301",
            "invoice_date": "2025-11-04",
            "party_name": "Raw Material Supplier",
            "party_gstin": "27ABCDE1234F1Z0",
            "hsn_or_category": "1101",
            "description": "Raw Wheat",
            "taxable_value": 5000.00,
            "tax_rate": 5.0,
            "cgst": 125.00,
            "sgst": 125.00,
            "igst": 0.0,
            "total": 5250.00
        },
        headers=headers
    )

    # Export XLSX
    res_xlsx = client.get("/api/v1/export?period=2025-11&format=xlsx", headers=headers)
    assert res_xlsx.status_code == 200
    assert "application/vnd.openxmlformats" in res_xlsx.headers["content-type"]
    assert "attachment; filename=" in res_xlsx.headers["content-disposition"]

    # Load workbook and inspect sheets
    wb = openpyxl.load_workbook(io.BytesIO(res_xlsx.content))
    assert set(wb.sheetnames) == {"Header", "B2B", "B2C Summary", "Purchases", "Tax Summary"}

    # Verify Header contents
    ws_header = wb["Header"]
    assert ws_header["A1"].value == "DRAFT: review before filing"

    # Verify B2B sheet has data
    ws_b2b = wb["B2B"]
    assert ws_b2b["A2"].value == "B2B-101"
    assert ws_b2b["C2"].value == "27ABCDE1234F1Z0"

    # Verify B2C Summary sheet
    ws_b2c = wb["B2C Summary"]
    assert ws_b2c["A2"].value == 18.0

    # Verify Purchases sheet
    ws_purch = wb["Purchases"]
    assert ws_purch["A2"].value == "PUR-301"

    # Export JSON
    res_json = client.get("/api/v1/export?period=2025-11&format=json", headers=headers)
    assert res_json.status_code == 200
    json_data = res_json.json()
    assert json_data["header"]["status"] == "DRAFT: review before filing"
    assert json_data["header"]["scheme"] == "REGULAR"
    assert len(json_data["b2b"]) == 1
    assert len(json_data["b2c_summary"]) == 1
    assert len(json_data["purchases"]) == 1
    assert json_data["tax_summary"]["total_outward_tax"] == 860.0  # (250+250) + (180+180)
    assert json_data["tax_summary"]["total_itc"] == 250.0  # 125 + 125


# ==============================================================================
# 3. Test COMPOSITION Scheme Export (XLSX and JSON)
# ==============================================================================

def test_export_composition_scheme_xlsx_and_json(client: TestClient, auth_headers, create_user):
    comp_user = create_user(
        email="comp_dealer@example.com",
        scheme=SchemeEnum.COMPOSITION,
        state_code="19"
    )
    headers, user = auth_headers(comp_user)

    # Composition dealers do not charge separate tax: cgst=0, sgst=0, igst=0
    client.post(
        "/api/v1/entries",
        json={
            "entry_type": "SALES",
            "invoice_no": "COMP-001",
            "invoice_date": "2025-11-05",
            "party_name": "Retail Buyer",
            "party_gstin": None,
            "taxable_value": 50000.00,
            "tax_rate": 0.0,
            "cgst": 0.0,
            "sgst": 0.0,
            "igst": 0.0,
            "total": 50000.00
        },
        headers=headers
    )

    # Export XLSX for Composition
    res_xlsx = client.get("/api/v1/export?period=2025-11&format=xlsx", headers=headers)
    assert res_xlsx.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(res_xlsx.content))
    assert set(wb.sheetnames) == {"Header", "Turnover Summary", "Tax Payable"}

    # Export JSON for Composition
    res_json = client.get("/api/v1/export?period=2025-11&format=json", headers=headers)
    assert res_json.status_code == 200
    json_data = res_json.json()
    assert json_data["header"]["scheme"] == "COMPOSITION"
    assert json_data["turnover_summary"]["total_sales_turnover"] == 50000.0
    assert json_data["composition_tax_payable"]["composition_rate_percent"] == 1.0
    assert json_data["composition_tax_payable"]["tax_payable_total"] == 500.0  # 1.0% of 50000


# ==============================================================================
# 4. Test Optional Source-Image Deletion and Audit Log Recording
# ==============================================================================

def test_export_source_image_deletion_and_audit_log(
    client: TestClient,
    auth_headers,
    db_session: Session,
    tmp_path
):
    headers, user = auth_headers()

    # 1. Create a dummy stored document file
    storage = LocalStorageService(upload_dir=str(tmp_path))
    dummy_file = storage.save_file(b"\xff\xd8\xff\xe0" + b"\x00" * 20, "test_invoice.jpg")

    doc = Document(
        user_id=user.id,
        file_path=dummy_file,
        mime="image/jpeg",
        sha256="fakehash",
        doc_type=DocTypeEnum.SALES
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)

    ext = ExtractedEntry(
        document_id=doc.id,
        line_no=1,
        invoice_no="DEL-001",
        extraction_provider="mock",
        extraction_model_version="1.0"
    )
    db_session.add(ext)
    db_session.commit()
    db_session.refresh(ext)

    # 2. Create entry linked to extracted_entry_id
    client.post(
        "/api/v1/entries",
        json={
            "extracted_entry_id": ext.id,
            "invoice_no": "DEL-001",
            "invoice_date": "2025-11-05",
            "party_name": "Cash Sale",
            "party_gstin": None,
            "taxable_value": 1000.00,
            "tax_rate": 5.0,
            "cgst": 25.0,
            "sgst": 25.0,
            "igst": 0.0,
            "total": 1050.00
        },
        headers=headers
    )

    assert storage.file_exists(dummy_file) is True

    # 3. Export with delete_source_images=true
    res = client.get(
        "/api/v1/export?period=2025-11&format=json&delete_source_images=true",
        headers=headers
    )
    assert res.status_code == 200

    # 4. Verify audit_log entry was created
    audit = db_session.query(AuditLog).filter(
        AuditLog.user_id == user.id,
        AuditLog.action == "EXPORT"
    ).order_by(AuditLog.id.desc()).first()
    assert audit is not None
    assert audit.after["format"] == "json"
    assert audit.after["delete_source_images"] is True
