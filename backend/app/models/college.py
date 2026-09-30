from beanie import Document
from pydantic import Field
from typing import List, Optional
from datetime import datetime

class College(Document):
    name: str                              # e.g. "REVA University"
    domain: str                            # e.g. "@reva.edu.in"
    hotel_ids: List[str] = Field(default_factory=list)  # list of stall ID strings
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "colleges"
        indexes = ["name", "domain"]
