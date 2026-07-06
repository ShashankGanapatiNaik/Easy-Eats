from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import List, Optional
from bson import ObjectId

class GroupSession(Document):
    code: str  # Unique 6-character room code (e.g. ROOM12)
    stall_id: ObjectId
    host_id: ObjectId
    status: str = "open"  # "open", "locked", "completed"
    order_id: Optional[ObjectId] = None
    payment_method: str = "split"  # "split" or "host"
    
    # List of members: [{"user_id": ObjectId, "name": str, "joined_at": datetime}]
    members: List[dict] = Field(default_factory=list)
    
    # List of items in shared cart: 
    # [{"id": str, "menu_item_id": ObjectId, "user_id": ObjectId, "user_name": str, "name": str, "qty": int, "price": float, "customizations": list, "image_url": str}]
    items: List[dict] = Field(default_factory=list)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "group_sessions"
        indexes = [
            "code",
            "stall_id",
            "host_id",
            "status",
        ]

    class Config:
        arbitrary_types_allowed = True
