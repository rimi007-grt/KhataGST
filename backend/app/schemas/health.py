from typing import Optional
from pydantic import BaseModel

class HealthResponse(BaseModel):
    status: str
    database: str
    version: str = "1.0.0"
    timestamp: Optional[str] = None
