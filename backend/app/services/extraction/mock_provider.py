import json
from pathlib import Path
from app.core.config import ROOT_DIR, BACKEND_DIR
from app.core.logging import logger
from app.schemas.extraction import ExtractionResult, ExtractedEntryItem
from app.services.extraction.base import BaseExtractionProvider

class MockExtractionProvider(BaseExtractionProvider):
    """
    Offline fixture extraction provider reading /seed/demo_data.json.
    All data is clearly labeled DEMO per NON-NEGOTIABLE PRINCIPLES.
    """

    @property
    def name(self) -> str:
        return "mock"

    @property
    def model_version(self) -> str:
        return "mock-fixture-v1"

    def extract(self, image_bytes: bytes, mime_type: str) -> ExtractionResult:
        logger.info("MockExtractionProvider: loading demo fixtures for offline mode")
        
        seed_dir = ROOT_DIR / "seed"
        if not seed_dir.exists():
            seed_dir = BACKEND_DIR.parent / "seed"

        demo_file = seed_dir / "demo_data.json"
        if not demo_file.exists():
            raise FileNotFoundError(f"Mock demo fixtures file not found at {demo_file}")

        with open(demo_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        raw_entries = data.get("entries", [])
        validated_entries = [ExtractedEntryItem.model_validate(e) for e in raw_entries]

        return ExtractionResult(
            entries=validated_entries,
            page_notes=data.get("page_notes", "DEMO: Offline mock extraction fixtures"),
            provider=self.name,
            model_version=self.model_version,
            status="OK"
        )

