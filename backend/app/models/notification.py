from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional
from bson import ObjectId

class Notification(Document):
    user_id: ObjectId
    order_id: ObjectId
    type: str  # "order_placed" | "order_ready"
    phone: Optional[str] = None   # optional — users without phone still get in-app notifications
    message: str
    is_read: bool = False
    sent_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "notifications"
        indexes = [
            "user_id",
            "order_id",
            [("order_id", 1), ("type", 1)],
        ]

    class Config:
        arbitrary_types_allowed = True
