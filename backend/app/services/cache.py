import time
from typing import Dict, Optional, Tuple, Any

# In-memory TTL cache for dashboard responses: (user_id, period) -> (timestamp, data)
_dashboard_cache: Dict[Tuple[int, str], Tuple[float, Any]] = {}
CACHE_TTL_SECONDS = 30.0

def get_dashboard_cache(user_id: int, period: str) -> Optional[Any]:
    """Retrieve cached dashboard response if within 30-second TTL."""
    key = (user_id, period)
    if key in _dashboard_cache:
        cached_time, data = _dashboard_cache[key]
        if time.time() - cached_time < CACHE_TTL_SECONDS:
            return data
        else:
            del _dashboard_cache[key]
    return None

def set_dashboard_cache(user_id: int, period: str, data: Any) -> None:
    """Store dashboard response in cache with current timestamp."""
    key = (user_id, period)
    _dashboard_cache[key] = (time.time(), data)

def invalidate_dashboard_cache(user_id: Optional[int] = None) -> None:
    """
    Invalidate dashboard cache for a specific user or completely.
    Must be called on any entry edit/create/delete, document upload/extract, or validation run.
    """
    global _dashboard_cache
    if user_id is None:
        _dashboard_cache.clear()
    else:
        keys_to_remove = [k for k in _dashboard_cache if k[0] == user_id]
        for k in keys_to_remove:
            _dashboard_cache.pop(k, None)
