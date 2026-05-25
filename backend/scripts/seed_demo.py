"""
seed_demo.py — Easy Eats complete demo seed
3 hotel owners each with their own stall + menu + orders
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime, timedelta
from pathlib import Path
import bcrypt, random, os

# Load .env automatically
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())

MONGODB_URI     = os.getenv("MONGODB_URI", "")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "easy_eats")

if not MONGODB_URI or "CHANGE_ME" in MONGODB_URI:
    print("\n❌  MONGODB_URI not set in backend/.env")
    print("   Add: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/...\n")
    exit(1)

print(f"🔗  Connecting to: {MONGODB_URI[:50]}...")

def hash_pw(pw): return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

async def seed():
    client = AsyncIOMotorClient(MONGODB_URI)
    db     = client[MONGODB_DB_NAME]

    for col in ["users","stalls","menu_items","orders","reviews","wallet_balances","wallet_transactions"]:
        await db[col].drop()
    print("🗑   Cleared old data")

    now = datetime.utcnow()
    pw  = hash_pw("demo1234")

    # All IDs defined upfront
    student_id = ObjectId(); admin_id = ObjectId()
    owner1_id  = ObjectId(); owner2_id = ObjectId(); owner3_id = ObjectId()
    cafe_id    = ObjectId(); burger_id = ObjectId(); coffee_id = ObjectId()

    # ── Users ─────────────────────────────────────────────────────────────────
    await db.users.insert_many([
        {"_id": student_id, "name": "Arjun Kumar",   "email": "student@demo.com",
         "password": pw, "role": "student", "is_active": True, "created_at": now, "updated_at": now},
        {"_id": owner1_id,  "name": "Priya Sharma",  "email": "cafe@demo.com",
         "password": pw, "role": "stall_owner", "stall_name": "Campus Cafe",
         "stall_id": str(cafe_id), "is_active": True, "created_at": now, "updated_at": now},
        {"_id": owner2_id,  "name": "Rahul Mehta",   "email": "burger@demo.com",
         "password": pw, "role": "stall_owner", "stall_name": "Burger Hub",
         "stall_id": str(burger_id), "is_active": True, "created_at": now, "updated_at": now},
        {"_id": owner3_id,  "name": "Sneha Patel",   "email": "coffee@demo.com",
         "password": pw, "role": "stall_owner", "stall_name": "Coffee Corner",
         "stall_id": str(coffee_id), "is_active": True, "created_at": now, "updated_at": now},
        {"_id": admin_id,   "name": "Admin User",    "email": "admin@demo.com",
         "password": pw, "role": "admin", "is_active": True, "created_at": now, "updated_at": now},
    ])
    print("✅  Users (5)")

    # ── Stalls ────────────────────────────────────────────────────────────────
    def hours(o="08:00", c="22:00"):
        return {d: {"open":o,"close":c,"closed":False}
                for d in ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}

    await db.stalls.insert_many([
        {"_id": cafe_id,   "owner_id": owner1_id, "name": "Campus Cafe",   "slug": "campus-cafe",
         "description": "Quick bites and refreshing drinks.",
         "cuisine_type": "Snacks", "menu_categories": ["Popular","Snacks","Drinks","Combos"],
         "is_open": True, "operating_hours": hours(), "estimated_pickup_min": 5,
         "hero_image_url": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80",
         "location_label": "Main Block, Ground Floor",
         "avg_rating": 4.6, "total_ratings": 38, "total_orders": 214, "created_at": now, "updated_at": now},
        {"_id": burger_id, "owner_id": owner2_id, "name": "Burger Hub",    "slug": "burger-hub",
         "description": "Juicy burgers made fresh every order.",
         "cuisine_type": "Burgers", "menu_categories": ["Popular","Burgers","Fries","Drinks"],
         "is_open": True, "operating_hours": hours("10:00","21:00"), "estimated_pickup_min": 8,
         "hero_image_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
         "location_label": "Canteen Block B",
         "avg_rating": 4.8, "total_ratings": 62, "total_orders": 389, "created_at": now, "updated_at": now},
        {"_id": coffee_id, "owner_id": owner3_id, "name": "Coffee Corner", "slug": "coffee-corner",
         "description": "Premium coffee and freshly baked goods.",
         "cuisine_type": "Coffee", "menu_categories": ["Popular","Hot Drinks","Cold Drinks","Bakery"],
         "is_open": True, "operating_hours": hours("07:30","20:00"), "estimated_pickup_min": 3,
         "hero_image_url": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80",
         "location_label": "Library Annex",
         "avg_rating": 4.5, "total_ratings": 29, "total_orders": 156, "created_at": now, "updated_at": now},
    ])
    print("✅  Stalls (3) — each with separate owner")

    # ── Menu Items ────────────────────────────────────────────────────────────
    def item(sid, name, cat, price, veg=True, popular=False, prep=5, disc=None, tags=None, img=None, desc=None):
        return {"_id": ObjectId(), "stall_id": sid, "name": name, "category": cat,
                "price": price, "discounted_price": disc, "description": desc, "image_url": img,
                "is_available": True, "available_quantity": None, "prep_time_min": prep,
                "is_popular": popular, "is_veg": veg, "tags": tags or [],
                "customization_groups": [], "is_deleted": False, "created_at": now, "updated_at": now}

    items = [
        item(cafe_id,   "Veg Sandwich",   "Snacks",     60,  popular=True,  prep=5, img="https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80", desc="Freshly toasted with veggies"),
        item(cafe_id,   "Samosa (2 pcs)", "Snacks",     20,  popular=True,  prep=3, img="https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80"),
        item(cafe_id,   "Masala Tea",     "Drinks",     15,  popular=True,  prep=2, img="https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?auto=format&fit=crop&w=800&q=80"),
        item(cafe_id,   "Cold Coffee",    "Drinks",     65,  popular=True,  prep=3, disc=55, tags=["bestseller"], img="https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=80"),
        item(cafe_id,   "Snack Combo",    "Combos",     70,  prep=5, tags=["value"], desc="Sandwich+Tea+Samosa", img="https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80"),
        item(burger_id, "Chicken Burger", "Burgers",   149,  veg=False, popular=True, prep=8, tags=["bestseller","spicy"], img="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80", desc="Grilled chicken with jalapeños"),
        item(burger_id, "Veg Burger",     "Burgers",    99,  popular=True,  prep=7, tags=["fresh"], img="https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80"),
        item(burger_id, "Double Patty",   "Burgers",   199,  veg=False, prep=10, tags=["new"], img="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80"),
        item(burger_id, "French Fries",   "Fries",      89,  popular=True, prep=4, tags=["crispy"], img="https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=800&q=80"),
        item(burger_id, "Lemon Soda",     "Drinks",     49,  prep=2, img="https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=800&q=80"),
        item(coffee_id, "Espresso",       "Hot Drinks", 60,  popular=True, prep=2, img="https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80"),
        item(coffee_id, "Latte",          "Hot Drinks", 80,  popular=True, prep=4, tags=["creamy"], img="https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=80"),
        item(coffee_id, "Cold Brew",      "Cold Drinks",90,  popular=True, prep=2, tags=["bestseller"], img="https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=80"),
        item(coffee_id, "Iced Matcha",    "Cold Drinks",100, prep=3, tags=["new"], img="https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=80"),
        item(coffee_id, "Choc Muffin",    "Bakery",     55,  popular=True, prep=1, img="https://images.unsplash.com/photo-1583241800698-e8ab01830a6b?auto=format&fit=crop&w=800&q=80"),
    ]
    await db.menu_items.insert_many(items)
    print(f"✅  Menu items ({len(items)})")

    # ── Sample Orders ─────────────────────────────────────────────────────────
    def order(sid, item_name, price, qty, status, mins_ago):
        placed  = datetime.utcnow() - timedelta(minutes=mins_ago)
        sub     = price * qty
        eta_dt  = placed + timedelta(minutes=8)
        return {"_id": ObjectId(), "user_id": student_id, "stall_id": sid,
                "items": [{"menu_item_id": str(ObjectId()), "name": item_name,
                           "category": "Popular", "price": price, "qty": qty,
                           "customizations": [], "subtotal": sub, "image_url": None}],
                "subtotal": sub, "discount": 0.0, "total": sub, "status": status,
                "predicted_prep_min": random.randint(5,12),
                "estimated_ready_time": eta_dt.strftime("%H:%M"),
                "estimated_ready_iso":  eta_dt.isoformat(),
                "pickup_slot": "12:30 – 12:35",
                "active_orders_at_placement": random.randint(0,5),
                "special_instructions": None,
                "placed_at": placed, "updated_at": placed, "collected_at": None}

    await db.orders.insert_many([
        order(cafe_id,   "Veg Sandwich",  60,  2, "Preparing",   3),
        order(cafe_id,   "Cold Coffee",   55,  1, "Ready",        8),
        order(burger_id, "Chicken Burger",149, 1, "Placed",       1),
        order(burger_id, "French Fries",  89,  2, "Accepted",     5),
        order(coffee_id, "Latte",         80,  1, "Almost Ready", 6),
        order(coffee_id, "Cold Brew",     90,  2, "Collected",   45),
    ])
    print("✅  Sample orders (6)")

    # ── Wallet ────────────────────────────────────────────────────────────────
    await db.wallet_balances.insert_one(
        {"_id": ObjectId(), "user_id": str(student_id), "balance": 500.0, "updated_at": now}
    )
    print("✅  Wallet — student ₹500")

    client.close()
    print("""
╔══════════════════════════════════════════════════════╗
║         🍔  Easy Eats Demo Data Ready!               ║
╠══════════════════════════════════════════════════════╣
║  Password for all accounts: demo1234                 ║
║                                                      ║
║  student@demo.com   → /home   (browse & order)       ║
║  cafe@demo.com      → /admin  (Campus Cafe)          ║
║  burger@demo.com    → /admin  (Burger Hub)           ║
║  coffee@demo.com    → /admin  (Coffee Corner)        ║
║  admin@demo.com     → /admin  (full access)          ║
╚══════════════════════════════════════════════════════╝
""")

if __name__ == "__main__":
    asyncio.run(seed())
