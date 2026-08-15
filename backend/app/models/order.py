"""
Order Collection  (replaces 'orders' + 'order_items' tables)
─────────────────────────────────────────────────────────────
Key design decisions:
  • Order items are EMBEDDED (not referenced) — they are a snapshot of price/
    name at time of order. Even if the menu item changes later, old orders
    remain correct.
  • status uses a strict state machine enforced in the route layer.
  • AI prep-time prediction result is stored for analytics.
"""
from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional, List
from bson import ObjectId
from enum import Enum


class OrderStatus(str, Enum):
    placed       = "Placed"
    accepted     = "Accepted"
    preparing    = "Preparing"
    almost_ready = "Almost Ready"
    ready        = "Ready"
    collected    = "Collected"
    cancelled    = "Cancelled"


class OrderItemSnapshot(dict):
    """
    Embedded snapshot — copied from MenuItem at order time.
    {
      menu_item_id: ObjectId,
      name: str,
      category: str,
      price: float,
      qty: int,
      customizations: list,
      subtotal: float,
    }
    """
    pass


class Order(Document):
    # ── Parties ────────────────────────────────────────────────
    user_id: ObjectId
    stall_id: ObjectId
    phone: Optional[str] = None
    group_member_ids: List[ObjectId] = Field(default_factory=list)
    group_session_id: Optional[ObjectId] = None

    # ── Order items ────────────────────────────────────────────
    items: List[dict] = Field(default_factory=list)

    # ── Financials ─────────────────────────────────────────────
    subtotal: float
    discount: float = 0.0
    total: float

    # ── Status ─────────────────────────────────────────────────
    status: OrderStatus = OrderStatus.placed

    # ── AI Prediction ──────────────────────────────────────────
    predicted_prep_min: int = 0
    estimated_ready_time: Optional[str] = None
    estimated_ready_iso: Optional[str] = None
    pickup_slot: Optional[str] = None
    active_orders_at_placement: int = 0

    # ── Customer notes ─────────────────────────────────────────
    special_instructions: Optional[str] = None

    # ── Timestamps ─────────────────────────────────────────────
    placed_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    collected_at: Optional[datetime] = None

    class Settings:
        name = "orders"

        indexes = [
            "user_id",
            "stall_id",
            "status",
            "placed_at",
            "group_member_ids",
            [("stall_id", 1), ("status", 1)],
            [("user_id", 1), ("placed_at", -1)],
        ]

    class Config:
        arbitrary_types_allowed = True