"""
MenuItem Collection  (replaces 'menu_items' table)
──────────────────────────────────────────────────
Each item belongs to exactly ONE stall.
Features added vs old SQLite schema:
  • category     — per-stall category string (matches Stall.menu_categories)
  • is_available — item-level availability toggle (e.g. sold out)
  • description  — optional item description
  • image_url    — item photo
  • is_popular   — flag for "Popular" tab
  • is_veg       — dietary tag
  • tags         — free-form labels ["bestseller", "spicy", "new"]
  • customization_options — size / add-ons per item
"""
from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional, List
from bson import ObjectId


class CustomizationChoice(dict):
    """{ label: "Extra Cheese", price_delta: 20 }"""
    pass


class CustomizationGroup(dict):
    """
    {
      name: "Size",
      required: true,
      max_choices: 1,
      choices: [ { label: "Regular", price_delta: 0 },
                 { label: "Large",   price_delta: 30 } ]
    }
    """
    pass


class MenuItem(Document):
    # ── Parent stall ───────────────────────────────────────────
    stall_id: ObjectId                          # ref → stalls._id

    # ── Core fields ────────────────────────────────────────────
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None

    # ── Per-stall category (must match one of Stall.menu_categories) ──
    category: str = "All"                       # e.g. "Burgers", "Drinks"

    # ── Pricing ────────────────────────────────────────────────
    price: float                                # base price in ₹
    discounted_price: Optional[float] = None    # if set, shown as sale price

    # ── Availability (per item) ─────────────────────────────────
    is_available: bool = True                   # sold out = False
    available_quantity: Optional[int] = None    # None = unlimited

    # ── Metadata / display ─────────────────────────────────────
    prep_time_min: int = 5                      # in minutes
    is_popular: bool = False
    is_veg: bool = True
    tags: List[str] = Field(default_factory=list)  # ["spicy","new","bestseller"]

    # ── Customisation ──────────────────────────────────────────
    customization_groups: List[dict] = Field(default_factory=list)

    # ── Soft delete ────────────────────────────────────────────
    is_deleted: bool = False

    # ── Timestamps ─────────────────────────────────────────────
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "menu_items"
        indexes = [
            "stall_id",
            "category",
            "is_available",
            "is_popular",
            [("stall_id", 1), ("category", 1)],
            [("stall_id", 1), ("is_available", 1)],
        ]

    class Config:
        arbitrary_types_allowed = True

        json_schema_extra = {
            "example": {
                "name": "Chicken Burger",
                "category": "Burgers",
                "price": 149,
                "is_available": True,
                "is_popular": True,
                "is_veg": False,
                "tags": ["bestseller", "spicy"],
                "prep_time_min": 8,
                "customization_groups": [
                    {
                        "name": "Size",
                        "required": True,
                        "max_choices": 1,
                        "choices": [
                            {"label": "Regular", "price_delta": 0},
                            {"label": "Large", "price_delta": 30},
                        ]
                    }
                ]
            }
        }