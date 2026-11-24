import os
import io
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Optional
from app.core.config import settings
from app.core.logging import logger

class BaseStorageService(ABC):
    """Abstract storage interface swappable between temp/memory, S3, and local."""

    @abstractmethod
    def save_file(self, file_bytes: bytes, filename: str) -> str:
        """Save file bytes and return storage identifier / path."""
        pass

    @abstractmethod
    def get_file(self, file_path: str) -> bytes:
        """Read file bytes from storage."""
        pass

    @abstractmethod
    def delete_file(self, file_path: str) -> bool:
        """Delete file from storage."""
        pass

    @abstractmethod
    def file_exists(self, file_path: str) -> bool:
        """Check if file exists in storage."""
        pass


class TempStorageService(BaseStorageService):
    """
    In-memory and OS temporary directory storage.
    Default for free-tier and hackathon demos.
    Files are ephemeral and deleted after export. Never relies on persistent local disk.
    """

    def __init__(self):
        self.temp_dir = Path(tempfile.gettempdir()) / "khatagst_temp"
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self._memory_cache: Dict[str, bytes] = {}

    def _clean_key(self, filename_or_path: str) -> str:
        return os.path.basename(filename_or_path)

    def save_file(self, file_bytes: bytes, filename: str) -> str:
        clean_name = self._clean_key(filename)
        # Store in memory cache
        self._memory_cache[clean_name] = file_bytes

        # Also write to OS temp dir for standard filesystem access if needed
        temp_file = self.temp_dir / clean_name
        try:
            with open(temp_file, "wb") as f:
                f.write(file_bytes)
        except Exception as e:
            logger.warning(f"Temp disk write skipped, stored in memory: {e}")

        return clean_name

    def get_file(self, file_path: str) -> bytes:
        clean_name = self._clean_key(file_path)
        # Check in-memory cache first
        if clean_name in self._memory_cache:
            return self._memory_cache[clean_name]

        temp_file = self.temp_dir / clean_name
        if temp_file.exists():
            with open(temp_file, "rb") as f:
                content = f.read()
                self._memory_cache[clean_name] = content
                return content

        raise FileNotFoundError(f"File not found in temp storage: {file_path}")

    def delete_file(self, file_path: str) -> bool:
        clean_name = self._clean_key(file_path)
        deleted = False
        if clean_name in self._memory_cache:
            del self._memory_cache[clean_name]
            deleted = True

        temp_file = self.temp_dir / clean_name
        if temp_file.exists():
            try:
                temp_file.unlink()
                deleted = True
            except Exception as e:
                logger.warning(f"Failed to delete temp file {temp_file}: {e}")

        return deleted

    def file_exists(self, file_path: str) -> bool:
        clean_name = self._clean_key(file_path)
        if clean_name in self._memory_cache:
            return True
        return (self.temp_dir / clean_name).exists()


class S3StorageService(BaseStorageService):
    """
    S3-compatible object storage service (AWS S3, Supabase Storage S3 endpoint, Cloudflare R2).
    Reads credentials strictly from environment variables.
    """

    def __init__(self):
        self.bucket = settings.S3_BUCKET
        self.endpoint_url = settings.S3_ENDPOINT_URL
        self.region = settings.S3_REGION
        self.access_key = settings.AWS_ACCESS_KEY_ID
        self.secret_key = settings.AWS_SECRET_ACCESS_KEY
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                import boto3
                kwargs = {
                    "service_name": "s3",
                    "region_name": self.region,
                    "aws_access_key_id": self.access_key,
                    "aws_secret_access_key": self.secret_key,
                }
                if self.endpoint_url:
                    kwargs["endpoint_url"] = self.endpoint_url
                self._client = boto3.client(**kwargs)
            except ImportError:
                raise ImportError(
                    "boto3 package is required for S3 storage mode. Run: pip install boto3"
                )
        return self._client

    def _clean_key(self, filename_or_path: str) -> str:
        return os.path.basename(filename_or_path)

    def save_file(self, file_bytes: bytes, filename: str) -> str:
        key = self._clean_key(filename)
        client = self._get_client()
        client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=file_bytes
        )
        return key

    def get_file(self, file_path: str) -> bytes:
        key = self._clean_key(file_path)
        client = self._get_client()
        try:
            response = client.get_object(Bucket=self.bucket, Key=key)
            return response["Body"].read()
        except Exception as e:
            raise FileNotFoundError(f"S3 object '{key}' not found in bucket '{self.bucket}': {e}")

    def delete_file(self, file_path: str) -> bool:
        key = self._clean_key(file_path)
        client = self._get_client()
        try:
            client.delete_object(Bucket=self.bucket, Key=key)
            return True
        except Exception as e:
            logger.warning(f"Failed to delete S3 object {key}: {e}")
            return False

    def file_exists(self, file_path: str) -> bool:
        key = self._clean_key(file_path)
        client = self._get_client()
        try:
            client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False


class LocalStorageService(BaseStorageService):
    """Local disk storage outside web root for local dev with path traversal hardening."""

    def __init__(self, upload_dir: str = settings.UPLOAD_DIR):
        self.upload_dir = Path(upload_dir).resolve()
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_safe_path(self, filename_or_path: str) -> Path:
        clean_name = os.path.basename(filename_or_path)
        safe_path = (self.upload_dir / clean_name).resolve()
        if not str(safe_path).startswith(str(self.upload_dir)):
            raise ValueError("Path traversal attempt detected")
        return safe_path

    def save_file(self, file_bytes: bytes, filename: str) -> str:
        target_path = self._resolve_safe_path(filename)
        with open(target_path, "wb") as f:
            f.write(file_bytes)
        return str(target_path)

    def get_file(self, file_path: str) -> bytes:
        target_path = self._resolve_safe_path(file_path)
        if not target_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        with open(target_path, "rb") as f:
            return f.read()

    def delete_file(self, file_path: str) -> bool:
        try:
            target_path = self._resolve_safe_path(file_path)
            if target_path.exists():
                target_path.unlink()
                return True
            return False
        except Exception:
            return False

    def file_exists(self, file_path: str) -> bool:
        try:
            target_path = self._resolve_safe_path(file_path)
            return target_path.exists()
        except Exception:
            return False


# Singleton instances
_temp_storage_instance: Optional[TempStorageService] = None
_local_storage_instance: Optional[LocalStorageService] = None
_s3_storage_instance: Optional[S3StorageService] = None

def get_storage_service() -> BaseStorageService:
    """
    Dependency injector / factory for storage provider based on STORAGE_MODE.
    Defaults to TempStorageService (in-memory/temp with post-export deletion).
    """
    global _temp_storage_instance, _local_storage_instance, _s3_storage_instance

    mode = settings.STORAGE_MODE.lower()
    if mode in ("s3", "supabase"):
        if _s3_storage_instance is None:
            _s3_storage_instance = S3StorageService()
        return _s3_storage_instance
    elif mode == "local":
        if _local_storage_instance is None:
            _local_storage_instance = LocalStorageService()
        return _local_storage_instance
    else:
        # Default: temp / in-memory
        if _temp_storage_instance is None:
            _temp_storage_instance = TempStorageService()
        return _temp_storage_instance
