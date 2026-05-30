"""
RecommendationAnalytics Collection
───────────────────────────────────
Tracks every time a recommendation is clicked or purchased.

Fields:
  user_id   – who clicked/bought
  stall_id  – which stall's recommendation
  item_id   – the recommended item
  action    – "click" | "purchase"
  order_id  – (purchase only) the order that contained the item
  timestamp – UTC time of the event
"""
from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional, Literal
from bson import ObjectId


class RecommendationAnalytics(Document):
    user_id:   ObjectId
    stall_id:  ObjectId
    item_id:   ObjectId
    action:    Literal["click", "purchase"]
    order_id:  Optional[ObjectId] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recommendation_analytics"
        indexes = [
            "user_id",
            "stall_id",
            "item_id",
            "action",
            "timestamp",
            [("stall_id", 1), ("action", 1)],
            [("stall_id", 1), ("item_id", 1)],
        ]

    class Config:
        arbitrary_types_allowed = True
