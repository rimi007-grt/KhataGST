from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.models.document import DocTypeEnum

class DocumentOut(BaseModel):
    id: int
    user_id: int
    file_path: str
    mime: str
    sha256: str
    doc_type: DocTypeEnum
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)

