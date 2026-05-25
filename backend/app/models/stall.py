"""
Stall Collection  (replaces 'restaurants' table)
────────────────────────────────────────────────
Each stall owns:
  • its own menu categories   (e.g. ["Burgers", "Drinks", "Snacks"])
  • its own operating hours   (per day of week)
  • its own is_open toggle    (live on/off)
  • its own banner / logo images
  • aggregate rating cached here (recalculated on every review write)
"""

from beanie import Document, Link
from pydantic import Field
from datetime import datetime, time
from typing import Optional, List, Dict
from bson import ObjectId
from enum import Enum


class StallCategory(str, Enum):
    """Top-level cuisine category for Home page filtering."""
    snacks   = "Snacks"
    burgers  = "Burgers"
    coffee   = "Coffee"
    meals    = "Meals"
    desserts = "Desserts"
    drinks   = "Drinks"
    other    = "Other"


class OperatingHour(dict):
    """{ open: "08:00", close: "21:00", closed: false }"""
    pass


class Stall(Document):
    # ── Identity ───────────────────────────────────────────────
    owner_id: ObjectId                          # ref → users._id
    name: str
    description: Optional[str] = None
    slug: str                                   # url-safe name, unique

    # ── Classification ─────────────────────────────────────────
    cuisine_type: StallCategory = StallCategory.other

    # Per-stall menu category labels (owner can add/remove freely)
    # e.g. ["Popular", "Breakfast", "Lunch", "Combos", "Drinks"]
    menu_categories: List[str] = Field(default_factory=lambda: ["Popular", "All"])

    # ── Availability ───────────────────────────────────────────
    is_open: bool = True                        # master on/off switch
    # day → { open, close, closed }
    # Keys: "monday".."sunday"
    operating_hours: Dict[str, dict] = Field(
        default_factory=lambda: {
            day: {"open": "08:00", "close": "22:00", "closed": False}
            for day in ["monday", "tuesday", "wednesday", "thursday",
                        "friday", "saturday", "sunday"]
        }
    )
    estimated_pickup_min: int = 5               # baseline pickup ETA (minutes)

    # ── Media ──────────────────────────────────────────────────
    hero_image_url: Optional[str] = None
    logo_url: Optional[str] = None

    # ── Location (campus building / stall number) ───────────────
    location_label: Optional[str] = None        # e.g. "Block A, Ground Floor"

    # ── Aggregated Stats (denormalised for fast reads) ──────────
    avg_rating: float = 0.0
    total_ratings: int = 0
    total_orders: int = 0

    # ── Timestamps ─────────────────────────────────────────────
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "stalls"
        indexes = [
            "owner_id",
            "slug",
            "is_open",
            "cuisine_type",
        ]

    class Config:
        arbitrary_types_allowed = True

        json_schema_extra = {
            "example": {
                "name": "Campus Cafe",
                "slug": "campus-cafe",
                "cuisine_type": "Snacks",
                "menu_categories": ["Popular", "Snacks", "Drinks", "Combos"],
                "is_open": True,
                "estimated_pickup_min": 5,
                "location_label": "Main Block, Ground Floor",
            }
        }