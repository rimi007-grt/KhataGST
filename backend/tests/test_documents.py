import hashlib
import io
import pytest
from app.models.document import DocTypeEnum
from app.services.storage import LocalStorageService

# Sample valid magic byte sequences for images
VALID_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00" + (b"\x00" * 50)
VALID_PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01" + (b"\x00" * 50)
VALID_WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + (b"\x00" * 50)

def test_upload_valid_jpeg(client, auth_headers):
    headers, user = auth_headers()
    files = {"file": ("bill.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    data = {"doc_type": DocTypeEnum.SALES.value}

    response = client.post("/api/v1/documents", headers=headers, files=files, data=data)
    assert response.status_code == 201
    res_data = response.json()
    assert res_data["id"] is not None
    assert res_data["user_id"] == user.id
    assert res_data["mime"] == "image/jpeg"
    assert res_data["doc_type"] == "SALES"
    assert res_data["sha256"] == hashlib.sha256(VALID_JPEG).hexdigest()

def test_upload_valid_png(client, auth_headers):
    headers, user = auth_headers()
    files = {"file": ("invoice.png", io.BytesIO(VALID_PNG), "image/png")}
    data = {"doc_type": DocTypeEnum.PURCHASE.value}

    response = client.post("/api/v1/documents", headers=headers, files=files, data=data)
    assert response.status_code == 201
    res_data = response.json()
    assert res_data["mime"] == "image/png"
    assert res_data["doc_type"] == "PURCHASE"

def test_upload_valid_webp(client, auth_headers):
    headers, user = auth_headers()
    files = {"file": ("receipt.webp", io.BytesIO(VALID_WEBP), "image/webp")}
    data = {"doc_type": DocTypeEnum.REGISTER_PAGE.value}

    response = client.post("/api/v1/documents", headers=headers, files=files, data=data)
    assert response.status_code == 201
    res_data = response.json()
    assert res_data["mime"] == "image/webp"
    assert res_data["doc_type"] == "REGISTER_PAGE"

def test_upload_rejected_for_plain_text(client, auth_headers):
    headers, _ = auth_headers()
    text_content = b"This is a plain text file pretending to be an invoice."
    files = {"file": ("fake.txt", io.BytesIO(text_content), "text/plain")}

    response = client.post("/api/v1/documents", headers=headers, files=files)
    assert response.status_code == 400
    res_data = response.json()
    assert res_data["code"] == "INVALID_FILE_TYPE"
    assert "supported" in res_data["message"].lower()

def test_upload_rejected_for_spoofed_file(client, auth_headers):
    headers, _ = auth_headers()
    # File named .jpg but starting with PDF magic bytes
    pdf_content = b"%PDF-1.4 spoofed pdf inside jpg name"
    files = {"file": ("invoice.jpg", io.BytesIO(pdf_content), "image/jpeg")}

    response = client.post("/api/v1/documents", headers=headers, files=files)
    assert response.status_code == 400
    res_data = response.json()
    assert res_data["code"] == "INVALID_FILE_TYPE"

def test_upload_rejected_when_exceeding_size_limit(client, auth_headers):
    headers, _ = auth_headers()
    # 8 MB + 100 bytes
    large_payload = b"\xff\xd8\xff\xe0" + (b"A" * (8 * 1024 * 1024 + 100))
    files = {"file": ("huge.jpg", io.BytesIO(large_payload), "image/jpeg")}

    response = client.post("/api/v1/documents", headers=headers, files=files)
    assert response.status_code == 413
    res_data = response.json()
    assert res_data["code"] == "FILE_TOO_LARGE"
    assert "8 mb" in res_data["message"].lower()

def test_upload_unauthenticated_fails(client):
    files = {"file": ("bill.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    response = client.post("/api/v1/documents", files=files)
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"

def test_cross_user_document_isolation(client, auth_headers, create_user):
    # User 1 uploads a document
    headers_user1, user1 = auth_headers()
    files = {"file": ("user1_bill.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    upload_res = client.post("/api/v1/documents", headers=headers_user1, files=files)
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    # User 2 logs in and attempts to access User 1's document
    user2 = create_user(email="user2@khatagst.test")
    headers_user2, _ = auth_headers(user=user2)

    forbidden_res = client.get(f"/api/v1/documents/{doc_id}", headers=headers_user2)
    assert forbidden_res.status_code == 403
    assert forbidden_res.json()["code"] == "FORBIDDEN"

    # User 1 can access their own document
    ok_res = client.get(f"/api/v1/documents/{doc_id}", headers=headers_user1)
    assert ok_res.status_code == 200
    assert ok_res.json()["id"] == doc_id

def test_storage_service_path_traversal_hardening(tmp_path):
    storage = LocalStorageService(upload_dir=str(tmp_path))
    content = b"test content"
    
    # Path traversal filename should be sanitized to basename
    path = storage.save_file(content, "../../evil.jpg")
    assert ".." not in path
    assert storage.file_exists(path)
    assert storage.get_file(path) == content

