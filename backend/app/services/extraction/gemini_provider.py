import json
import re
import time
from typing import Optional
from app.core.config import settings
from app.core.logging import logger
from app.schemas.extraction import ExtractionResult, ExtractedEntryItem
from app.services.extraction.base import BaseExtractionProvider

EXTRACTION_SYSTEM_PROMPT = """
You are a deterministic, zero-hallucination OCR extraction system for Indian GST invoices and physical paper registers.
Your task is to extract structured line items from the provided image.

STRICT NON-NEGOTIABLE RULES:
1. AI is used ONLY for image reading. NEVER compute tax liabilities, decide rates, or calculate totals.
2. If any field (invoice number, date, GSTIN, rate, amount) is unclear, blurred, cut off, or absent, YOU MUST RETURN null.
3. NEVER GUESS, INVENT, OR FABRICATE ANY VALUES.
4. For every extracted field, include a realistic confidence score between 0.0 and 1.0 in `field_confidence`.
5. Return ONLY a valid JSON object matching this exact schema:
{
  "entries": [
    {
      "invoice_no": "string or null",
      "invoice_date": "YYYY-MM-DD or null",
      "party_name": "string or null",
      "party_gstin": "string or null",
      "hsn_or_category": "string or null",
      "description": "string or null",
      "taxable_value": 0.0 or null,
      "tax_rate": 0.0 or null,
      "cgst": 0.0 or null,
      "sgst": 0.0 or null,
      "igst": 0.0 or null,
      "total": 0.0 or null,
      "field_confidence": {
        "invoice_no": 0.95,
        "invoice_date": 0.90,
        "party_name": 0.85,
        "party_gstin": 0.90,
        "taxable_value": 0.95,
        "total": 0.95
      }
    }
  ],
  "page_notes": "concise physical observation notes or null"
}
"""

RETIRED_MODELS_MAP = {
    "gemini-2.5-flash": "gemini-3.5-flash",
    "gemini-2.5-flash-lite": "gemini-3.5-flash",
    "gemini-2.0-flash": "gemini-3.5-flash",
    "gemini-1.5-flash": "gemini-3.5-flash",
}

class GeminiExtractionProvider(BaseExtractionProvider):
    """
    Multimodal LLM extraction provider using Google Gemini with timeout,
    exponential backoff retry, and graceful fallback to FAILED/PARTIAL.
    """

    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        self.api_key = api_key or settings.GEMINI_API_KEY
        requested = model_name or settings.GEMINI_MODEL or "gemini-3.5-flash"
        if requested in RETIRED_MODELS_MAP:
            active = RETIRED_MODELS_MAP[requested]
            logger.warning(
                f"Model '{requested}' is retired by Google API v1beta. "
                f"Using active equivalent '{active}'."
            )
            self._model_name = active
        else:
            self._model_name = requested

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def model_version(self) -> str:
        return self._model_name

    def extract(self, image_bytes: bytes, mime_type: str) -> ExtractionResult:
        if not self.api_key or self.api_key in ("your_api_key_here", "your_gemini_api_key_here", ""):
            raise ValueError("GEMINI_API_KEY is not configured or invalid.")

        try:
            import google.generativeai as genai
        except ImportError:
            logger.error("google-generativeai package missing.")
            return ExtractionResult(
                entries=[],
                page_notes="google-generativeai package not available. Please enter invoice details manually.",
                provider=self.name,
                model_version=self.model_version,
                status="FAILED"
            )

        genai.configure(api_key=self.api_key, transport="rest")

        # Optimize image for OCR if oversized (reduces upload payload and prevents timeout)
        processed_bytes = image_bytes
        processed_mime = mime_type
        try:
            from PIL import Image
            import io
            im = Image.open(io.BytesIO(image_bytes))
            max_dimension = 2048
            if max(im.size) > max_dimension or len(image_bytes) > 1.5 * 1024 * 1024:
                im.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                if im.mode in ("RGBA", "P"):
                    im = im.convert("RGB")
                im.save(buf, format="JPEG", quality=88, optimize=True)
                processed_bytes = buf.getvalue()
                processed_mime = "image/jpeg"
        except Exception as opt_err:
            logger.debug(f"Image optimization skipped: {opt_err}")

        image_part = {
            "mime_type": processed_mime,
            "data": processed_bytes
        }
        prompt = (
            "Extract all invoice line items from this register/receipt according to the system instructions. "
            "Return null for unreadable fields."
        )

        response = None
        max_retries = 3
        backoff_delay = 2.0

        for attempt in range(1, max_retries + 1):
            try:
                model = genai.GenerativeModel(
                    model_name=self._model_name,
                    system_instruction=EXTRACTION_SYSTEM_PROMPT,
                    generation_config={"response_mime_type": "application/json"}
                )
                response = model.generate_content(
                    [image_part, prompt],
                    request_options={"timeout": 35.0}
                )
                break
            except Exception as e:
                err_str = str(e).lower()
                is_rate_limit = "429" in err_str or "quota" in err_str or "resource_exhausted" in err_str
                is_transient = "503" in err_str or "timeout" in err_str or "unavailable" in err_str or "deadline" in err_str

                if attempt < max_retries and (is_rate_limit or is_transient):
                    logger.warning(
                        f"Gemini API attempt {attempt}/{max_retries} failed ({type(e).__name__}). "
                        f"Retrying with backoff in {backoff_delay:.1f}s..."
                    )
                    time.sleep(backoff_delay)
                    backoff_delay *= 2.0
                    continue

                # Final failure on quota exhaustion or network timeout -> return friendly FAILED status
                logger.warning(f"Gemini extraction call failed after {attempt} attempts: {type(e).__name__}")
                user_msg = (
                    "Extraction rate limit or daily quota reached. Please proceed with manual entry below."
                    if is_rate_limit
                    else "Extraction service timed out or was temporarily unavailable. Please proceed with manual entry below."
                )
                return ExtractionResult(
                    entries=[],
                    page_notes=user_msg,
                    provider=self.name,
                    model_version=self.model_version,
                    status="FAILED"
                )

        if not response or not response.text:
            return ExtractionResult(
                entries=[],
                page_notes="No content returned by extraction model. Please proceed with manual entry.",
                provider=self.name,
                model_version=self.model_version,
                status="FAILED"
            )

        text_content = response.text.strip()
        if text_content.startswith("```"):
            text_content = re.sub(r"^```(?:json)?\n?", "", text_content)
            text_content = re.sub(r"\n?```$", "", text_content).strip()

        try:
            parsed = json.loads(text_content)
        except Exception as json_err:
            logger.warning(f"Model output non-JSON text: {json_err}")
            return ExtractionResult(
                entries=[],
                page_notes="Could not parse OCR response format. You can fill in the invoice details below.",
                provider=self.name,
                model_version=self.model_version,
                status="FAILED"
            )

        if isinstance(parsed, list):
            raw_entries = parsed
            page_notes = None
        else:
            raw_entries = parsed.get("entries", [])
            page_notes = parsed.get("page_notes")

        for e in raw_entries:
            if isinstance(e.get("field_confidence"), dict):
                e["field_confidence"] = {
                    k: (float(v) if v is not None else 0.0)
                    for k, v in e["field_confidence"].items()
                }

        validated_entries = []
        for e in raw_entries:
            try:
                validated_entries.append(ExtractedEntryItem.model_validate(e))
            except Exception as val_err:
                logger.debug(f"Skipping malformed extracted item: {val_err}")

        status_result = "OK" if validated_entries else "FAILED"
        if not validated_entries:
            page_notes = page_notes or "No valid invoice entries could be extracted from image. Please enter manually."

        return ExtractionResult(
            entries=validated_entries,
            page_notes=page_notes,
            provider=self.name,
            model_version=self.model_version,
            status=status_result
        )
