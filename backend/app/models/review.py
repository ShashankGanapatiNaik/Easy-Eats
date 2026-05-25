"""Review Collection — linked to stall, optional per order."""
from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional
from bson import ObjectId


class Review(Document):
    stall_id: ObjectId
    user_id: ObjectId
    order_id: Optional[ObjectId] = None
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "reviews"
        indexes = [
            "stall_id",
            "user_id",
            [("stall_id", 1), ("created_at", -1)],
        ]

    class Config:
        arbitrary_types_allowed = True