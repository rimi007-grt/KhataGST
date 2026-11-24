import os
import json
import logging
from typing import List, Optional, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

# Base dir is /backend, project root is parent
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_DIR = BACKEND_DIR.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "KhataGST"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"  # "development", "production", "test"
    LOG_LEVEL: str = "INFO"

    # Security & JWT
    JWT_SECRET: str = "khatagst-dev-secret-key-change-in-production"
    JWT_SECRET_KEY: Optional[str] = None  # Backward compatibility alias
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database (SQLite default for local dev, Postgres supported)
    DATABASE_URL: str = "sqlite:///./khatagst.db"

    # CORS - allow only ALLOWED_ORIGIN in production
    ALLOWED_ORIGIN: Optional[str] = None
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://khatagst-ui.onrender.com"
    ]

    # Extraction settings
    EXTRACTION_PROVIDER: str = "mock"  # "mock", "gemini", or "groq"
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-3.5-flash"
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "qwen/qwen3.8-27b"

    # Storage settings ("temp", "local", "s3", "supabase")
    STORAGE_MODE: str = "temp"
    UPLOAD_DIR: str = str(ROOT_DIR / "uploads")
    MAX_UPLOAD_SIZE_BYTES: int = 8 * 1024 * 1024  # 8 MB

    # S3 / Supabase Storage credentials (when STORAGE_MODE is "s3" or "supabase")
    S3_BUCKET: Optional[str] = None
    S3_REGION: str = "us-east-1"
    S3_ENDPOINT_URL: Optional[str] = None
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            # Render/Supabase often provides postgres:// which SQLAlchemy deprecated in favor of postgresql://
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+psycopg2://", 1)
            elif v.startswith("postgresql://") and not v.startswith("postgresql+psycopg2://"):
                return v.replace("postgresql://", "postgresql+psycopg2://", 1)
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]], info) -> List[str]:
        # If ALLOWED_ORIGIN env var is set, prioritize it
        allowed = os.getenv("ALLOWED_ORIGIN")
        if allowed:
            res = [o.strip() for o in allowed.split(",") if o.strip()]
            if "https://khatagst-ui.onrender.com" not in res:
                res.append("https://khatagst-ui.onrender.com")
            return res

        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            res = [i.strip() for i in v.split(",") if i.strip()]
            if "https://khatagst-ui.onrender.com" not in res:
                res.append("https://khatagst-ui.onrender.com")
            return res
        elif isinstance(v, list):
            res = list(v)
            if "https://khatagst-ui.onrender.com" not in res:
                res.append("https://khatagst-ui.onrender.com")
            return res
        return ["http://localhost:5173", "http://localhost:3000", "https://khatagst-ui.onrender.com"]

    def get_jwt_secret(self) -> str:
        """Returns JWT_SECRET or fallback JWT_SECRET_KEY."""
        return self.JWT_SECRET_KEY or self.JWT_SECRET

    model_config = SettingsConfigDict(
        env_file=[str(ROOT_DIR / ".env"), str(BACKEND_DIR / ".env")],
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

def validate_startup_config():
    """
    Validates required environment configuration at startup.
    Fails fast with clear descriptive error messages if required variables are missing.
    Never prints or logs secret values.
    """
    errors = []

    # 1. JWT Secret Validation
    jwt_secret = settings.get_jwt_secret()
    if settings.ENVIRONMENT == "production":
        if not jwt_secret or jwt_secret == "khatagst-dev-secret-key-change-in-production":
            errors.append("JWT_SECRET must be set to a secure, random string in production.")
        if len(jwt_secret) < 16:
            errors.append("JWT_SECRET must be at least 16 characters long.")

    # 2. CORS Wildcard Validation in Production
    origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]
    if settings.ENVIRONMENT == "production":
        if "*" in origins:
            errors.append("Wildcard '*' in CORS origins is forbidden in production. Set ALLOWED_ORIGIN to your frontend URL.")

    # 3. Extraction Provider Validation
    provider = settings.EXTRACTION_PROVIDER.lower()
    if provider not in ("mock", "gemini", "groq"):
        errors.append(f"Invalid EXTRACTION_PROVIDER '{provider}'. Must be 'mock', 'gemini', or 'groq'.")

    if provider == "gemini":
        key = settings.GEMINI_API_KEY
        if not key or key.strip() in ("", "your_api_key_here", "your_gemini_api_key_here") or len(key) < 10:
            errors.append(
                "EXTRACTION_PROVIDER is 'gemini' but GEMINI_API_KEY is missing or contains placeholder. "
                "Set GEMINI_API_KEY in environment or use EXTRACTION_PROVIDER=mock for offline demo mode."
            )

    if provider == "groq":
        key = settings.GROQ_API_KEY
        if not key or key.strip() in ("", "your_groq_api_key_here") or len(key) < 10:
            errors.append(
                "EXTRACTION_PROVIDER is 'groq' but GROQ_API_KEY is missing or contains placeholder. "
                "Set GROQ_API_KEY in environment or use EXTRACTION_PROVIDER=mock for offline demo mode."
            )

    # 4. Storage Mode Validation
    storage_mode = settings.STORAGE_MODE.lower()
    if storage_mode not in ("temp", "memory", "local", "s3", "supabase"):
        errors.append(f"Invalid STORAGE_MODE '{storage_mode}'. Must be 'temp', 'local', 's3', or 'supabase'.")

    if storage_mode in ("s3", "supabase"):
        if not settings.S3_BUCKET:
            errors.append("STORAGE_MODE is 's3'/'supabase' but S3_BUCKET is not set.")
        if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
            errors.append("STORAGE_MODE is 's3'/'supabase' but AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is missing.")

    if errors:
        error_msg = "\n  - ".join(errors)
        raise ValueError(
            f"\n[FATAL CONFIGURATION ERROR] KhataGST failed to start due to invalid configuration:\n  - {error_msg}\n"
        )
