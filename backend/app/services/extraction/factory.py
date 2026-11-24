from typing import Optional
from app.core.config import settings
from app.services.extraction.base import BaseExtractionProvider
from app.services.extraction.mock_provider import MockExtractionProvider
from app.services.extraction.gemini_provider import GeminiExtractionProvider
from app.services.extraction.groq_provider import GroqExtractionProvider

def get_extraction_provider(provider_type: Optional[str] = None) -> BaseExtractionProvider:
    """
    Factory resolving the active ExtractionProvider.
    Defaults to EXTRACTION_PROVIDER environment variable.
    """
    chosen = (provider_type or settings.EXTRACTION_PROVIDER).lower().strip()
    if chosen == "gemini":
        return GeminiExtractionProvider()
    if chosen == "groq":
        return GroqExtractionProvider()
    return MockExtractionProvider()

