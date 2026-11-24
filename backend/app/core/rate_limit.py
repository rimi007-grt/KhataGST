import time
from typing import Dict, List, Tuple
from fastapi import Request, HTTPException, status
from app.core.logging import logger

class InMemoryRateLimiter:
    """
    Sliding window in-memory rate limiter for serverless / free-tier deployments.
    Tracks client IP request timestamps and purges expired entries automatically.
    """
    def __init__(self, requests_limit: int, window_seconds: int = 60, name: str = "default"):
        self.requests_limit = requests_limit
        self.window_seconds = window_seconds
        self.name = name
        self.records: Dict[str, List[float]] = {}
        self.last_cleanup = time.time()

    def _get_client_ip(self, request: Request) -> str:
        # Check X-Forwarded-For in proxy / cloud setups (Render, Cloudflare)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "127.0.0.1"

    def _cleanup(self, now: float):
        """Purge entries older than window to prevent unbounded memory growth."""
        if now - self.last_cleanup < 30:
            return
        cutoff = now - self.window_seconds
        keys_to_delete = []
        for key, timestamps in self.records.items():
            valid_ts = [t for t in timestamps if t > cutoff]
            if not valid_ts:
                keys_to_delete.append(key)
            else:
                self.records[key] = valid_ts
        for k in keys_to_delete:
            del self.records[k]
        self.last_cleanup = now

    def check(self, request: Request):
        now = time.time()
        self._cleanup(now)

        client_ip = self._get_client_ip(request)
        timestamps = self.records.get(client_ip, [])
        cutoff = now - self.window_seconds
        recent_timestamps = [t for t in timestamps if t > cutoff]

        if len(recent_timestamps) >= self.requests_limit:
            logger.warning(
                f"Rate limit exceeded for endpoint '{self.name}' by IP {client_ip} "
                f"({len(recent_timestamps)} requests in {self.window_seconds}s)"
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": f"Rate limit exceeded for {self.name}. Please wait a moment before retrying."
                }
            )

        recent_timestamps.append(now)
        self.records[client_ip] = recent_timestamps

# Rate limiter instances for auth and extraction
auth_rate_limiter = InMemoryRateLimiter(requests_limit=15, window_seconds=60, name="auth")
extract_rate_limiter = InMemoryRateLimiter(requests_limit=10, window_seconds=60, name="extract")

def rate_limit_auth(request: Request):
    auth_rate_limiter.check(request)

def rate_limit_extract(request: Request):
    extract_rate_limiter.check(request)

