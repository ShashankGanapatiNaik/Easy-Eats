# Easy Eats — MongoDB Migration Guide & Architecture Reference

## What Changed (SQLite → MongoDB Atlas)

| Old (SQLite + SQLAlchemy) | New (MongoDB Atlas + Beanie) |
|---|---|
| `database.py` using `create_engine` | `database.py` using `AsyncIOMotorClient` |
| `Base = declarative_base()` | Beanie `Document` base class |
| `Session.query(Restaurant).all()` | `Stall.find().to_list()` |
| FK `restaurant_id` join to `menu_items` | Embedded `stall_id` ref + aggregation |
| Flat `items` column (JSON string!) | Proper embedded `items: List[dict]` |
| `order_items` table | Embedded snapshot in `Order.items` |
| Manual `ALTER TABLE` patches in main.py | Schema-less: just add fields |
| Sync routes with `db: Session = Depends` | Async routes with `await` everywhere |

---

## Folder Structure

```
easy-eats-mongodb/
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   └── app/
│       ├── main.py                  # FastAPI app + lifespan
│       ├── database.py              # Motor + Beanie init
│       ├── core/
│       │   └── config.py            # Pydantic Settings
│       ├── models/                  # Beanie Document models
│       │   ├── user.py              # users collection
│       │   ├── stall.py             # stalls collection (was restaurants)
│       │   ├── menu_item.py         # menu_items collection
│       │   ├── order.py             # orders collection (embeds items)
│       │   └── review.py            # reviews collection
│       ├── routes/
│       │   ├── auth.py              # /auth/register, /auth/login
│       │   ├── stalls.py            # /stalls/ CRUD + toggle + categories
│       │   ├── menu.py              # /menu/ per-stall CRUD + availability
│       │   └── orders.py            # /orders/ place, track, status, analytics
│       ├── services/
│       │   └── ai_predictor.py      # prep-time heuristic (same logic)
│       └── utils/
│           └── security.py          # JWT, bcrypt, role dependencies
└── frontend/
    └── src/
        ├── api.js                   # all API calls (updated endpoints)
        ├── context/
        │   └── CartContext.jsx      # single-stall cart enforcement
        └── pages/
            ├── Home.jsx             # live stall list from MongoDB
            ├── Restaurant.jsx       # per-stall menu with DB categories
            └── OwnerPortal.jsx      # stall mgmt, categories, availability
```

---

## MongoDB Collections & Schema Design

### 1. `users`
```json
{
  "_id": ObjectId,
  "name": "Arjun Kumar",
  "email": "arjun@college.edu",
  "password": "$2b$12$...",
  "role": "student | owner | kitchen | admin",
  "phone": "+91 9876543210",
  "is_active": true,
  "created_at": ISODate,
  "updated_at": ISODate
}
```
**Indexes:** `email (unique)`, `role`

---

### 2. `stalls`  ← replaces `restaurants`
```json
{
  "_id": ObjectId,
  "owner_id": ObjectId,
  "name": "Campus Cafe",
  "slug": "campus-cafe",
  "description": "Quick bites and drinks",
  "cuisine_type": "Snacks",

  // Per-stall menu categories (owner-defined)
  "menu_categories": ["Popular", "Snacks", "Drinks", "Combos"],

  // Per-stall availability
  "is_open": true,
  "operating_hours": {
    "monday":    { "open": "08:00", "close": "21:00", "closed": false },
    "tuesday":   { "open": "08:00", "close": "21:00", "closed": false },
    "saturday":  { "open": "10:00", "close": "18:00", "closed": false },
    "sunday":    { "open": "00:00", "close": "00:00", "closed": true }
  },
  "estimated_pickup_min": 5,

  "hero_image_url": "https://...",
  "logo_url": "https://...",
  "location_label": "Main Block, Ground Floor",

  // Denormalised stats (updated on every review/order write)
  "avg_rating": 4.8,
  "total_ratings": 42,
  "total_orders": 318,

  "created_at": ISODate,
  "updated_at": ISODate
}
```
**Indexes:** `owner_id`, `slug (unique)`, `is_open`, `cuisine_type`

---

### 3. `menu_items`  ← replaces `menu_items` (extended)
```json
{
  "_id": ObjectId,
  "stall_id": ObjectId,

  "name": "Chicken Burger",
  "description": "Juicy grilled chicken in a brioche bun",
  "image_url": "https://...",

  // Per-stall category (must match one of Stall.menu_categories)
  "category": "Burgers",

  // Per-stall / per-item pricing
  "price": 149,
  "discounted_price": 129,    // null = no discount

  // Per-item availability toggle
  "is_available": true,        // false = Sold Out
  "available_quantity": null,  // null = unlimited

  "prep_time_min": 8,
  "is_popular": true,
  "is_veg": false,
  "tags": ["bestseller", "spicy"],

  // Customisation options
  "customization_groups": [
    {
      "name": "Size",
      "required": true,
      "max_choices": 1,
      "choices": [
        { "label": "Regular", "price_delta": 0 },
        { "label": "Large",   "price_delta": 30 }
      ]
    },
    {
      "name": "Add-ons",
      "required": false,
      "max_choices": 3,
      "choices": [
        { "label": "Extra Cheese", "price_delta": 20 },
        { "label": "Extra Sauce",  "price_delta": 10 }
      ]
    }
  ],

  "is_deleted": false,
  "created_at": ISODate,
  "updated_at": ISODate
}
```
**Indexes:** `stall_id`, `category`, `is_available`, `is_popular`,
`(stall_id, category)` compound, `(stall_id, is_available)` compound

---

### 4. `orders`  ← replaces `orders` + `order_items` tables
```json
{
  "_id": ObjectId,
  "user_id": ObjectId,
  "stall_id": ObjectId,

  // Embedded snapshot — price is LOCKED at order time
  "items": [
    {
      "menu_item_id": "...",
      "name": "Chicken Burger",
      "category": "Burgers",
      "price": 149,
      "qty": 2,
      "customizations": [{ "label": "Large", "price_delta": 30 }],
      "subtotal": 358,
      "image_url": "https://..."
    }
  ],

  "subtotal": 358,
  "discount": 0,
  "total": 358,

  "status": "Placed | Accepted | Preparing | Almost Ready | Ready | Collected | Cancelled",

  // AI prediction
  "predicted_prep_min": 8,
  "estimated_ready_time": "13:45",
  "pickup_slot": "13:45 – 13:50",
  "active_orders_at_placement": 3,

  "special_instructions": "No onions please",

  "placed_at": ISODate,
  "updated_at": ISODate,
  "collected_at": null
}
```
**Indexes:** `user_id`, `stall_id`, `status`, `placed_at`,
`(stall_id, status)` compound, `(user_id, placed_at desc)` compound

---

### 5. `reviews`
```json
{
  "_id": ObjectId,
  "stall_id": ObjectId,
  "user_id": ObjectId,
  "order_id": ObjectId,
  "rating": 5,
  "comment": "Amazing burger, very fast!",
  "created_at": ISODate
}
```

---

## Key Design Decisions

### Why embed order items instead of referencing?
- Menu prices can change any time. Embedding takes a **snapshot** at order time, so your order history always shows what you actually paid.
- One fewer DB round-trip on every order read.

### Why denormalise `avg_rating` and `total_orders` on `stalls`?
- Home page lists all stalls — you don't want to run an aggregation for every card render.
- Update via `$inc` on every review/order write: cheap and consistent.

### Per-stall menu categories
- Stored in `Stall.menu_categories: List[str]`.
- Owner can add/remove via `PUT /stalls/{id}/categories`.
- `MenuItem.category` must match one of these strings.
- Frontend reads `stall.menu_categories` to render the correct tabs — no hardcoded tab lists anywhere.

### Per-item availability
- `MenuItem.is_available: bool` — toggled by kitchen via `PUT /menu/item/{id}/toggle`.
- Frontend shows "Sold Out" overlay and disables ADD button.
- Stall-level `is_open` and item-level `is_available` are separate concerns.

---

## API Endpoint Summary

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login, get JWT |

### Stalls
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stalls/` | Public | List stalls (filter by cuisine, open_only) |
| GET | `/stalls/{id}` | Public | Stall detail + menu grouped by category |
| POST | `/stalls/` | owner/admin | Create stall |
| PUT | `/stalls/{id}` | owner/admin | Update stall info |
| PUT | `/stalls/{id}/toggle` | owner/kitchen/admin | Flip is_open |
| PUT | `/stalls/{id}/categories` | owner/admin | Replace category list |

### Menu Items
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/menu/{stall_id}` | Public | All items grouped by category |
| GET | `/menu/{stall_id}/available` | Public | Only available items |
| GET | `/menu/{stall_id}/category/{cat}` | Public | Items in one category |
| POST | `/menu/{stall_id}` | owner/admin | Add item to stall |
| PUT | `/menu/item/{id}` | owner/admin | Update item |
| PUT | `/menu/item/{id}/toggle` | owner/kitchen/admin | Toggle is_available |
| DELETE | `/menu/item/{id}` | owner/admin | Soft delete item |

### Orders
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/orders/place` | student | Place order |
| GET | `/orders/my` | student | My order history |
| GET | `/orders/stall/{id}` | owner/kitchen | Stall's orders (filterable by status) |
| GET | `/orders/{id}/track` | any | Live tracking with remaining time |
| PUT | `/orders/{id}/status` | owner/kitchen | Update status |
| DELETE | `/orders/{id}` | student/admin | Cancel order |
| GET | `/orders/analytics/{id}` | owner/admin | Aggregation analytics |

---

## Aggregation Pipeline: Analytics
```python
# Daily revenue for last 7 days
[
  { "$match": { "stall_id": oid, "placed_at": { "$gte": seven_days_ago } } },
  { "$group": {
      "_id": { "$dateToString": { "format": "%Y-%m-%d", "date": "$placed_at" } },
      "revenue": { "$sum": "$total" },
      "orders":  { "$sum": 1 }
  }},
  { "$sort": { "_id": 1 } }
]

# Top items by qty sold
[
  { "$match": { "stall_id": oid } },
  { "$unwind": "$items" },
  { "$group": {
      "_id": "$items.name",
      "qty_sold": { "$sum": "$items.qty" },
      "revenue":  { "$sum": "$items.subtotal" }
  }},
  { "$sort": { "qty_sold": -1 } },
  { "$limit": 5 }
]
```

---

## Running Locally

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # fill in MONGODB_URI and JWT_SECRET
uvicorn app.main:app --reload

# Seed demo data
curl -X POST http://localhost:8000/stalls/seed

# Frontend (unchanged)
cd frontend
npm install
npm run dev
```

---

## MongoDB Atlas Setup Checklist

1. Create a free M0 cluster at cloud.mongodb.com
2. Add your IP to Network Access (or `0.0.0.0/0` for dev)
3. Create a DB user with read/write on `easy_eats`
4. Copy the connection string into `.env` as `MONGODB_URI`
5. Indexes are created automatically by Beanie on startup via `Settings.indexes`

---

## Security Practices
- Passwords hashed with `bcrypt` (passlib)
- JWT signed with HS256, 7-day expiry
- Role-based access: `student | owner | kitchen | admin`
- `owner_id` check on every stall mutation (owners can't edit other stalls)
- Soft-delete on menu items (never hard-delete, preserves order history)
- `.env` file never committed; `.env.example` committed instead
