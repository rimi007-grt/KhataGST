import base64
import json
import re
import time
from typing import Optional
from app.core.config import settings
from app.core.logging import logger
from app.schemas.extraction import ExtractionResult, ExtractedEntryItem
from app.services.extraction.base import BaseExtractionProvider
from app.services.extraction.gemini_provider import EXTRACTION_SYSTEM_PROMPT

class GroqExtractionProvider(BaseExtractionProvider):
    """
    Multimodal Vision extraction provider using Groq Llama 3.2 Vision
    with high speed, structured JSON response format, and graceful fallback.
    """

    @property
    def name(self) -> str:
        return "groq"

    @property
    def model_version(self) -> str:
        return settings.GROQ_MODEL or "qwen/qwen3.8-27b"

    def extract(self, image_bytes: bytes, mime_type: str) -> ExtractionResult:
        if not settings.GROQ_API_KEY:
            logger.error("GroqExtractionProvider called but GROQ_API_KEY is not configured.")
            return ExtractionResult(
                entries=[],
                page_notes="Groq API key not configured. Please use manual entry or set GROQ_API_KEY.",
                provider=self.name,
                model_version=self.model_version,
                status="FAILED"
            )

        from groq import Groq

        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        image_url = f"data:{mime_type};base64,{b64_image}"

        client = Groq(api_key=settings.GROQ_API_KEY)

        # Retry logic with backoff
        max_retries = 3
        backoff = 1.0
        response_text = None

        for attempt in range(1, max_retries + 1):
            try:
                chat_completion = client.chat.completions.create(
                    model=self.model_version,
                    messages=[
                        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Extract all structured GST line items, amounts, taxes, GSTIN, and metadata from this invoice image in strict JSON."
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {"url": image_url}
                                }
                            ]
                        }
                    ],
                    response_format={"type": "json_object"},
                    max_tokens=850,
                    temperature=0.1,
                    timeout=20.0
                )
                response_text = chat_completion.choices[0].message.content
                break
            except Exception as e:
                logger.warning(f"Groq extraction attempt {attempt}/{max_retries} failed: {e}")
                if attempt == max_retries:
                    return ExtractionResult(
                        entries=[],
                        page_notes=f"Groq extraction timed out or failed: {str(e)}. Please proceed with manual entry.",
                        provider=self.name,
                        model_version=self.model_version,
                        status="FAILED"
                    )
                time.sleep(backoff)
                backoff *= 2.0

        if not response_text:
            return ExtractionResult(
                entries=[],
                page_notes="No response from Groq extraction. Please enter manually.",
                provider=self.name,
                model_version=self.model_version,
                status="FAILED"
            )

        # Clean markdown code block fences if present
        text_content = response_text.strip()
        if text_content.startswith("```"):
            text_content = re.sub(r"^```(?:json)?\n?", "", text_content)
            text_content = re.sub(r"\n?```$", "", text_content).strip()

        try:
            parsed = json.loads(text_content)
        except Exception as json_err:
            logger.warning(f"Groq output non-JSON text: {json_err}")
            return ExtractionResult(
                entries=[],
                page_notes="Could not parse OCR response format. Please enter details manually.",
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
                logger.debug(f"Skipping malformed extracted item from Groq: {val_err}")

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
