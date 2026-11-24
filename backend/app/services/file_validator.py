import hashlib
from typing import Optional, Tuple

# Supported mime types and their extensions
MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

def detect_mime_type(content: bytes) -> Optional[str]:
    """
    Validate and detect MIME type by inspecting magic bytes.
    Accepts ONLY image/jpeg, image/png, and image/webp.
    """
    if len(content) < 12:
        return None

    # JPEG magic bytes: FF D8 FF
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"

    # PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"

    # WEBP magic bytes: RIFF....WEBP
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"

    return None

def compute_sha256(content: bytes) -> str:
    """Compute SHA-256 hex digest of file contents."""
    return hashlib.sha256(content).hexdigest()

