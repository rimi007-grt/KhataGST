from abc import ABC, abstractmethod
from app.schemas.extraction import ExtractionResult

class BaseExtractionProvider(ABC):
    """Pluggable multimodal extraction interface"""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier, e.g. 'mock' or 'gemini'"""
        pass

    @property
    @abstractmethod
    def model_version(self) -> str:
        """Specific model version used for extraction"""
        pass

    @abstractmethod
    def extract(self, image_bytes: bytes, mime_type: str) -> ExtractionResult:
        """
        Extract structured GST entries from an invoice/register image.
        Returns validated ExtractionResult or raises an Exception.
        """
        pass

