import io
import pytest
from openpyxl import load_workbook
from app.core.config import settings

def test_full_compliance_workflow_e2e(client, monkeypatch):
    """
    Complete End-to-End Test:
    1. Register & Login (JWT Auth)
    2. Upload sample invoice image with magic bytes
    3. Extract entries via Mock Provider (seeded offline fixtures)
    4. Promote entry & modify a field introducing a BLOCKING statutory violation (R01 / R02)
    5. Run validate -> verify BLOCKING error detected
    6. Attempt export -> verify HTTP 409 CONFLICT blocks export
    7. Human correction (PATCH) to fix the violation
    8. Re-validate -> verify 0 blocking errors
    9. Export valid Excel (.xlsx) workbook -> verify sheets & draft notice
    """
    # Force mock provider for deterministic offline execution
    monkeypatch.setattr(settings, "EXTRACTION_PROVIDER", "mock")

    # ---------------------------------------------------------
    # Step 1: Register & Login
    # ---------------------------------------------------------
    register_payload = {
        "email": "e2e_trader@example.com",
        "password": "Password123!",
        "business_name": "M/S E2E Kirana",
        "gstin": "07AAAAA0000A1Z5",
        "state_code": "07",
        "scheme": "REGULAR",
        "language": "en"
    }
    reg_res = client.post("/api/v1/auth/register", json=register_payload)
    assert reg_res.status_code == 201
    auth_data = reg_res.json()
    assert "access_token" in auth_data
    token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify login with registered credentials
    login_res = client.post("/api/v1/auth/login", json={
        "email": "e2e_trader@example.com",
        "password": "Password123!"
    })
    assert login_res.status_code == 200
    assert login_res.json()["access_token"] is not None

    # Verify profile via /me
    me_res = client.get("/api/v1/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["gstin"] == "07AAAAA0000A1Z5"

    # ---------------------------------------------------------
    # Step 2: Upload sample receipt image
    # ---------------------------------------------------------
    # Valid PNG 8-byte magic header
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 256
    upload_res = client.post(
        "/api/v1/documents",
        headers=headers,
        data={"doc_type": "SALES"},
        files={"file": ("invoice_sample.png", png_bytes, "image/png")}
    )
    assert upload_res.status_code == 201
    doc_data = upload_res.json()
    doc_id = doc_data["id"]
    assert doc_id is not None
    assert doc_data["doc_type"] == "SALES"

    # ---------------------------------------------------------
    # Step 3: Extract entries via Mock Provider
    # ---------------------------------------------------------
    extract_res = client.post(f"/api/v1/documents/{doc_id}/extract", headers=headers)
    assert extract_res.status_code == 200
    extract_data = extract_res.json()
    assert extract_data["status"] == "OK"
    assert len(extract_data["entries"]) >= 1

    extracted_item = extract_data["entries"][0]
    assert extracted_item["invoice_no"] is not None

    # Promote extracted entry to human-verified review table
    create_entry_payload = {
        "extracted_entry_id": extracted_item["id"],
        "source": "EXTRACTED_EDITED",
        "entry_type": "SALES",
        "invoice_no": extracted_item["invoice_no"],
        "invoice_date": extracted_item["invoice_date"] or "2026-11-05",
        "party_name": extracted_item["party_name"],
        "party_gstin": extracted_item["party_gstin"],
        "hsn_or_category": extracted_item["hsn_or_category"],
        "description": extracted_item["description"],
        "taxable_value": float(extracted_item["taxable_value"]),
        "tax_rate": float(extracted_item["tax_rate"]),
        "cgst": float(extracted_item["cgst"]),
        "sgst": float(extracted_item["sgst"]),
        "igst": float(extracted_item["igst"]),
        "total": float(extracted_item["total"])
    }
    entry_res = client.post("/api/v1/entries", headers=headers, json=create_entry_payload)
    assert entry_res.status_code == 201
    entry_id = entry_res.json()["id"]

    # ---------------------------------------------------------
    # Step 4: Edit a field introducing a BLOCKING error (R01 invalid GSTIN checksum)
    # ---------------------------------------------------------
    corrupt_patch = {
        "party_gstin": "07AAAAA0000A1Z9",  # Invalid checksum digit
        "total": 5250.00
    }
    patch_res = client.patch(f"/api/v1/entries/{entry_id}", headers=headers, json=corrupt_patch)
    assert patch_res.status_code == 200
    assert patch_res.json()["party_gstin"] == "07AAAAA0000A1Z9"

    # ---------------------------------------------------------
    # Step 5: Run validation & verify BLOCKING error detected
    # ---------------------------------------------------------
    val_res = client.post("/api/v1/validate", headers=headers, json={"period": "2026-11"})
    assert val_res.status_code == 200
    val_data = val_res.json()
    assert val_data["has_blocking_errors"] is True
    assert val_data["blocking_count"] >= 1
    # Check that finding mentions R01
    entry_group = val_data["entries"][0]
    rule_ids = [f["rule_id"] for f in entry_group["results"]]
    assert "R01" in rule_ids

    # ---------------------------------------------------------
    # Step 6: Verify Export is BLOCKED with HTTP 409
    # ---------------------------------------------------------
    export_fail = client.get("/api/v1/export?period=2026-11&format=xlsx", headers=headers)
    assert export_fail.status_code == 409
    err_body = export_fail.json()
    detail = err_body.get("detail", err_body)
    assert "blocking" in detail.get("message", "").lower() or "409" in str(detail)

    # ---------------------------------------------------------
    # Step 7: Human fixes error (PATCH with valid GSTIN & clean arithmetic)
    # ---------------------------------------------------------
    fix_patch = {
        "party_gstin": "07AAAAA0000A1Z4",  # Valid checksum is 4
        "taxable_value": 5000.00,
        "tax_rate": 5.0,
        "cgst": 125.00,
        "sgst": 125.00,
        "igst": 0.00,
        "total": 5250.00
    }
    fix_res = client.patch(f"/api/v1/entries/{entry_id}", headers=headers, json=fix_patch)
    assert fix_res.status_code == 200
    assert fix_res.json()["party_gstin"] == "07AAAAA0000A1Z4"

    # ---------------------------------------------------------
    # Step 8: Re-validate -> verify 0 blocking errors
    # ---------------------------------------------------------
    reval_res = client.post("/api/v1/validate", headers=headers, json={"period": "2026-11"})
    assert reval_res.status_code == 200
    reval_data = reval_res.json()
    assert reval_data["has_blocking_errors"] is False
    assert reval_data["blocking_count"] == 0

    # ---------------------------------------------------------
    # Step 9: Export valid Excel workbook & inspect sheets
    # ---------------------------------------------------------
    export_ok = client.get(
        "/api/v1/export?period=2026-11&format=xlsx&delete_source_images=true",
        headers=headers
    )
    assert export_ok.status_code == 200
    assert "application/vnd.openxmlformats" in export_ok.headers["content-type"]
    assert "attachment" in export_ok.headers.get("content-disposition", "")

    # Load workbook from bytes
    wb = load_workbook(io.BytesIO(export_ok.content))
    sheet_names = wb.sheetnames
    assert "Header" in sheet_names
    assert "B2B" in sheet_names
    assert "B2C Summary" in sheet_names
    assert "Purchases" in sheet_names
    assert "Tax Summary" in sheet_names

    # Verify Header contents
    header_sheet = wb["Header"]
    header_text = [cell.value for row in header_sheet.iter_rows() for cell in row if cell.value]
    assert any("DRAFT: review before filing" in str(val) for val in header_text)

    # Verify JSON export format also works
    export_json = client.get("/api/v1/export?period=2026-11&format=json", headers=headers)
    assert export_json.status_code == 200
    json_data = export_json.json()
    assert json_data["header"]["status"] == "DRAFT: review before filing"
    assert "b2b" in json_data
