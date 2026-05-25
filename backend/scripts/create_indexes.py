"""
scripts/create_indexes.py
─────────────────────────
Run once after deploying to create all MongoDB indexes.
Beanie creates indexes declared in Settings.indexes automatically on startup.
This script adds the remaining compound and text indexes that Beanie
doesn't support natively.

Usage:
  python scripts/create_indexes.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGODB_URI     = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "easy_eats")


async def create_indexes():
    client = AsyncIOMotorClient(MONGODB_URI)
    db     = client[MONGODB_DB_NAME]

    print("Creating indexes…")

    # ── users ────────────────────────────────────────────────────
    await db.users.create_index("email",  unique=True)
    await db.users.create_index("role")
    print("  ✅ users")

    # ── stalls ───────────────────────────────────────────────────
    await db.stalls.create_index("slug",         unique=True)
    await db.stalls.create_index("owner_id")
    await db.stalls.create_index("is_open")
    await db.stalls.create_index("cuisine_type")
    # Text search on name + description
    await db.stalls.create_index(
        [("name", "text"), ("description", "text")],
        name="stalls_text_search",
    )
    print("  ✅ stalls")

    # ── menu_items ───────────────────────────────────────────────
    await db.menu_items.create_index("stall_id")
    await db.menu_items.create_index("category")
    await db.menu_items.create_index("is_available")
    await db.menu_items.create_index("is_popular")
    await db.menu_items.create_index(
        [("stall_id", 1), ("category", 1)],
        name="menu_stall_category",
    )
    await db.menu_items.create_index(
        [("stall_id", 1), ("is_available", 1)],
        name="menu_stall_available",
    )
    await db.menu_items.create_index(
        [("stall_id", 1), ("is_popular", 1)],
        name="menu_stall_popular",
    )
    print("  ✅ menu_items")

    # ── orders ───────────────────────────────────────────────────
    await db.orders.create_index("user_id")
    await db.orders.create_index("stall_id")
    await db.orders.create_index("status")
    await db.orders.create_index("placed_at")
    await db.orders.create_index(
        [("stall_id", 1), ("status", 1)],
        name="orders_stall_status",
    )
    await db.orders.create_index(
        [("user_id", 1), ("placed_at", -1)],
        name="orders_user_history",
    )
    # TTL index: auto-delete cancelled orders after 30 days
    await db.orders.create_index(
        "placed_at",
        expireAfterSeconds=30 * 24 * 3600,
        partialFilterExpression={"status": "Cancelled"},
        name="ttl_cancelled_orders",
    )
    print("  ✅ orders")

    # ── reviews ──────────────────────────────────────────────────
    await db.reviews.create_index("stall_id")
    await db.reviews.create_index("user_id")
    await db.reviews.create_index(
        [("stall_id", 1), ("created_at", -1)],
        name="reviews_stall_recent",
    )
    print("  ✅ reviews")

    client.close()
    print("\n🎉 All indexes created successfully!")


if __name__ == "__main__":
    asyncio.run(create_indexes())
