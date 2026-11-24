import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import Settings, validate_startup_config
from app.core.logging import mask_gstin, GSTINMaskingFilter
from app.core.database import check_db_connectivity
from app.core.rate_limit import InMemoryRateLimiter
from app.services.storage import TempStorageService

client = TestClient(app)

def test_health_endpoint_no_sensitive_info():
    """Verify /health returns status and DB status without leaking credentials."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data
    assert data["status"] in ("ok", "degraded")
    assert data["database"] in ("connected", "unreachable")
    # Guarantee no sensitive connection strings or passwords leaked
    content_str = response.text.lower()
    assert "password" not in content_str
    assert "postgres://" not in content_str
    assert "postgresql://" not in content_str
    assert "secret" not in content_str

def test_mask_gstin_utility_and_filter():
    """Verify GSTIN masking masks middle digits and retains first 2 and last 3."""
    assert mask_gstin("27AAAAA0000A1Z5") == "27**********1Z5"
    assert mask_gstin("07ABCDE1234F1Z9") == "07**********1Z9"
    assert mask_gstin("") == ""
    assert mask_gstin(None) == ""

    # Test GSTIN logging filter
    filt = GSTINMaskingFilter()
    record = MagicMock()
    record.msg = "Created party with GSTIN 27AAAAA0000A1Z5 successfully"
    filt.filter(record)
    assert "27**********1Z5" in record.msg
    assert "27AAAAA0000A1Z5" not in record.msg

def test_temp_storage_service():
    """Verify TempStorageService stores in temp memory and deletes cleanly."""
    storage = TempStorageService()
    test_bytes = b"sample_invoice_pdf_data"
    filename = "test_invoice_001.jpg"

    saved_key = storage.save_file(test_bytes, filename)
    assert storage.file_exists(saved_key) is True

    retrieved = storage.get_file(saved_key)
    assert retrieved == test_bytes

    deleted = storage.delete_file(saved_key)
    assert deleted is True
    assert storage.file_exists(saved_key) is False

def test_in_memory_rate_limiter():
    """Verify InMemoryRateLimiter triggers 429 when threshold is reached."""
    limiter = InMemoryRateLimiter(requests_limit=2, window_seconds=60, name="test_limit")
    mock_request = MagicMock()
    mock_request.client.host = "192.168.1.50"
    mock_request.headers.get.return_value = None

    # First 2 requests pass
    limiter.check(mock_request)
    limiter.check(mock_request)

    # 3rd request fails with 429
    with pytest.raises(Exception) as exc_info:
        limiter.check(mock_request)
    assert exc_info.value.status_code == 429
    assert exc_info.value.detail["code"] == "RATE_LIMIT_EXCEEDED"

def test_validate_startup_config_production_checks():
    """Verify fail-fast configuration checks in production environment."""
    with patch("app.core.config.settings.ENVIRONMENT", "production"), \
         patch("app.core.config.settings.JWT_SECRET", "khatagst-dev-secret-key-change-in-production"):
        with pytest.raises(ValueError, match="JWT_SECRET must be set"):
            validate_startup_config()

    with patch("app.core.config.settings.ENVIRONMENT", "production"), \
         patch("app.core.config.settings.JWT_SECRET", "very-strong-production-secret-123456"), \
         patch("app.core.config.settings.CORS_ORIGINS", ["*"]):
        with pytest.raises(ValueError, match="Wildcard '\*' in CORS origins is forbidden in production"):
            validate_startup_config()

    with patch("app.core.config.settings.ENVIRONMENT", "development"), \
         patch("app.core.config.settings.EXTRACTION_PROVIDER", "gemini"), \
         patch("app.core.config.settings.GEMINI_API_KEY", ""):
        with pytest.raises(ValueError, match="GEMINI_API_KEY is missing"):
            validate_startup_config()

