import io
import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from app.models.document import DocTypeEnum
from app.models.extracted_entry import ExtractedEntry
from app.services.extraction.base import BaseExtractionProvider
from app.services.extraction.factory import get_extraction_provider
from app.services.extraction.gemini_provider import GeminiExtractionProvider, EXTRACTION_SYSTEM_PROMPT
from app.services.extraction.groq_provider import GroqExtractionProvider
from app.services.extraction.mock_provider import MockExtractionProvider

VALID_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00" + (b"\x00" * 50)

@pytest.fixture(autouse=True)
def default_mock_provider(monkeypatch):
    """Ensure automated test runs use the offline MockExtractionProvider by default."""
    monkeypatch.setattr("app.core.config.settings.EXTRACTION_PROVIDER", "mock")

def test_mock_extraction_provider():
    provider = MockExtractionProvider()
    assert provider.name == "mock"
    assert "mock" in provider.model_version
    
    result = provider.extract(VALID_JPEG, "image/jpeg")
    assert result.status == "OK"
    assert len(result.entries) >= 2
    first_entry = result.entries[0]
    assert first_entry.invoice_no is not None
    assert "DEMO" in (first_entry.party_name or "")
    assert isinstance(first_entry.field_confidence, dict)
    assert len(first_entry.field_confidence) > 0

def test_gemini_extraction_provider_requires_api_key():
    provider = GeminiExtractionProvider(api_key="your_api_key_here")
    with pytest.raises(ValueError, match="GEMINI_API_KEY is not configured or invalid"):
        provider.extract(VALID_JPEG, "image/jpeg")

def test_gemini_extraction_system_prompt_rules():
    assert "NEVER GUESS" in EXTRACTION_SYSTEM_PROMPT
    assert "null" in EXTRACTION_SYSTEM_PROMPT
    assert "AI is used ONLY for image reading" in EXTRACTION_SYSTEM_PROMPT

def test_gemini_extraction_parses_json_response():
    provider = GeminiExtractionProvider(api_key="dummy-key-for-test")
    with patch("google.generativeai.GenerativeModel") as mock_model_cls:
        mock_instance = MagicMock()
        mock_model_cls.return_value = mock_instance
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "entries": [{
                "invoice_no": "INV-100",
                "invoice_date": "2026-11-20",
                "party_name": "Sharma Stores",
                "party_gstin": "27ABCDE1234F1Z5",
                "taxable_value": 500.0,
                "tax_rate": 5.0,
                "cgst": 12.5,
                "sgst": 12.5,
                "igst": 0.0,
                "total": 525.0,
                "field_confidence": {"invoice_no": 0.95, "total": 0.98}
            }],
            "page_notes": "Single receipt extracted"
        })
        mock_instance.generate_content.return_value = mock_response

        res = provider.extract(VALID_JPEG, "image/jpeg")
        assert res.status == "OK"
        assert res.provider == "gemini"
        assert len(res.entries) == 1
        assert res.entries[0].invoice_no == "INV-100"
        assert res.entries[0].taxable_value == 500.0

def test_extraction_factory():
    mock_p = get_extraction_provider("mock")
    assert isinstance(mock_p, MockExtractionProvider)
    
    gemini_p = get_extraction_provider("gemini")
    assert isinstance(gemini_p, GeminiExtractionProvider)

    groq_p = get_extraction_provider("groq")
    assert isinstance(groq_p, GroqExtractionProvider)


def test_groq_extraction_provider_without_key(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.GROQ_API_KEY", None)
    provider = GroqExtractionProvider()
    result = provider.extract(VALID_JPEG, "image/jpeg")
    assert result.status == "FAILED"
    assert "not configured" in result.page_notes


def test_groq_extraction_parses_json_response(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.GROQ_API_KEY", "gsk_test123456789012345")
    provider = GroqExtractionProvider()
    
    with patch("groq.Groq") as mock_groq_cls:
        mock_client = MagicMock()
        mock_groq_cls.return_value = mock_client
        mock_completion = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps({
            "entries": [{
                "invoice_no": "GROQ-999",
                "invoice_date": "2026-11-24",
                "party_name": "Patel Enterprises",
                "party_gstin": "24ABCDE1234F1Z5",
                "taxable_value": 1000.0,
                "tax_rate": 18.0,
                "cgst": 90.0,
                "sgst": 90.0,
                "igst": 0.0,
                "total": 1180.0,
                "field_confidence": {"invoice_no": 0.96, "total": 0.99}
            }],
            "page_notes": "Groq vision extracted"
        })
        mock_completion.choices = [mock_choice]
        mock_client.chat.completions.create.return_value = mock_completion

        res = provider.extract(VALID_JPEG, "image/jpeg")
        assert res.status == "OK"
        assert res.provider == "groq"
        assert len(res.entries) == 1
        assert res.entries[0].invoice_no == "GROQ-999"
        assert res.entries[0].total == 1180.0

def test_post_extract_document_success(client, auth_headers, db_session):
    headers, user = auth_headers()
    # 1. Upload document
    files = {"file": ("bill.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    upload_res = client.post("/api/v1/documents", headers=headers, files=files)
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    # 2. Extract entries (uses default mock provider)
    extract_res = client.post(f"/api/v1/documents/{doc_id}/extract", headers=headers)
    assert extract_res.status_code == 200
    res_data = extract_res.json()
    assert res_data["status"] == "OK"
    assert len(res_data["entries"]) >= 2

    # Check entries in response
    first_item = res_data["entries"][0]
    assert first_item["document_id"] == doc_id
    assert first_item["extraction_provider"] == "mock"
    assert first_item["field_confidence"] is not None

    # Verify saved in extracted_entries table
    rows = db_session.query(ExtractedEntry).filter(ExtractedEntry.document_id == doc_id).all()
    assert len(rows) == len(res_data["entries"])

def test_get_document_entries(client, auth_headers):
    headers, user = auth_headers()
    # Upload and extract
    files = {"file": ("bill.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    upload_res = client.post("/api/v1/documents", headers=headers, files=files)
    doc_id = upload_res.json()["id"]

    client.post(f"/api/v1/documents/{doc_id}/extract", headers=headers)

    # Fetch entries
    get_res = client.get(f"/api/v1/documents/{doc_id}/entries", headers=headers)
    assert get_res.status_code == 200
    entries = get_res.json()
    assert len(entries) >= 2
    assert entries[0]["document_id"] == doc_id

def test_extract_cross_user_forbidden(client, auth_headers, create_user):
    headers_u1, u1 = auth_headers()
    files = {"file": ("u1.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    upload_res = client.post("/api/v1/documents", headers=headers_u1, files=files)
    doc_id = upload_res.json()["id"]

    # User 2 attempts extraction on User 1's doc
    u2 = create_user(email="user2_extractor@khatagst.test")
    headers_u2, _ = auth_headers(user=u2)

    res = client.post(f"/api/v1/documents/{doc_id}/extract", headers=headers_u2)
    assert res.status_code == 403
    assert res.json()["code"] == "FORBIDDEN"

    res_get = client.get(f"/api/v1/documents/{doc_id}/entries", headers=headers_u2)
    assert res_get.status_code == 403
    assert res_get.json()["code"] == "FORBIDDEN"

def test_extract_failure_fallback_to_manual_entry(client, auth_headers):
    headers, _ = auth_headers()
    files = {"file": ("corrupt.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    upload_res = client.post("/api/v1/documents", headers=headers, files=files)
    doc_id = upload_res.json()["id"]

    # Provider failure simulation
    with patch("app.api.v1.documents.get_extraction_provider") as mock_get_provider:
        mock_instance = MagicMock()
        mock_instance.extract.side_effect = TimeoutError("Extraction service timed out")
        mock_get_provider.return_value = mock_instance

        response = client.post(f"/api/v1/documents/{doc_id}/extract", headers=headers)
        # Spec non-negotiable: on FAILED return 200 with status=FAILED and empty list so UI falls back
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "FAILED"
        assert data["entries"] == []
        assert "timed out" in data["page_notes"].lower()

def test_eval_script_prints_no_validated_results_yet():
    repo_root = Path(__file__).resolve().parent.parent.parent
    eval_script = repo_root / "eval" / "eval_extraction.py"

    # Test split with no data prints NO VALIDATED RESULTS YET
    res_test = subprocess.run(
        [sys.executable, str(eval_script), "--split", "test"],
        capture_output=True,
        text=True,
        cwd=str(repo_root)
    )
    assert res_test.returncode == 0
    assert "NO VALIDATED RESULTS YET" in res_test.stdout
    assert "NO VALIDATED RESULTS YET" in res_test.stdout
