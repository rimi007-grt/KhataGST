import logging
import re
from typing import Optional
from app.core.config import settings

# 15-character Indian GSTIN pattern: 2 digits state + 10 chars PAN + 1 entity + Z + 1 checksum
GSTIN_PATTERN = re.compile(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b')

def mask_gstin(gstin: Optional[str]) -> str:
    """
    Masks a GSTIN to first 2 and last 3 chars per security specification.
    Example: '27AAAAA0000A1Z5' -> '27**********1Z5'
    """
    if not gstin:
        return ""
    gstin_clean = gstin.strip()
    if len(gstin_clean) <= 5:
        return "*" * len(gstin_clean)
    return gstin_clean[:2] + ("*" * (len(gstin_clean) - 5)) + gstin_clean[-3:]

class GSTINMaskingFilter(logging.Filter):
    """
    Automatically redacts raw GSTIN occurrences in any log message before writing.
    """
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = GSTIN_PATTERN.sub(
                lambda m: mask_gstin(m.group(0)),
                record.msg
            )
        return True

log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

logger = logging.getLogger("khatagst")
logger.setLevel(log_level)

if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(log_level)
    ch.addFilter(GSTINMaskingFilter())
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    ch.setFormatter(formatter)
    logger.addHandler(ch)
