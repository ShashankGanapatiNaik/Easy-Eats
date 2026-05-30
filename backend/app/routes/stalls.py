"""
Stall (Restaurant/Hotel/Food-Stall) Routes
─────────────────────────────────────────
GET  /stalls/                    → list all stalls (with filters)
GET  /stalls/{stall_id}          → stall detail + full menu (grouped by category)
POST /stalls/                    → create stall [owner]
PUT  /stalls/{stall_id}          → update stall info [owner]
PUT  /stalls/{stall_id}/toggle   → open/close stall [owner]
PUT  /stalls/{stall_id}/categories → manage menu categories [owner]
POST /stalls/seed                → seed demo data
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime
from app.models.review import Review
from app.models.user import User
from app.models.stall import Stall, StallCategory
from app.models.menu_item import MenuItem
from app.utils.security import get_current_user, require_role

router = APIRouter(prefix="/stalls", tags=["Stalls"])


# ─── Pydantic schemas ────────────────────────────────────────────────────────

class StallCreateBody(BaseModel):
    name: str
    description: Optional[str] = None
    slug: str
    cuisine_type: StallCategory = StallCategory.other
    menu_categories: List[str] = ["Popular", "All"]
    hero_image_url: Optional[str] = None
    logo_url: Optional[str] = None
    location_label: Optional[str] = None
    estimated_pickup_min: int = 5
    owner_email: Optional[str] = None
    owner_password: Optional[str] = None


class StallUpdateBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cuisine_type: Optional[StallCategory] = None
    hero_image_url: Optional[str] = None
    logo_url: Optional[str] = None
    location_label: Optional[str] = None
    estimated_pickup_min: Optional[int] = None
    owner_email: Optional[str] = None
    owner_password: Optional[str] = None


class CategoriesBody(BaseModel):
    categories: List[str]  # full replacement list


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/")
async def list_stalls(
    cuisine: Optional[StallCategory] = None,
    open_only: bool = False,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """List stalls with optional filters. No auth required (public browse)."""
    query = {}
    if cuisine:
        query["cuisine_type"] = cuisine
    if open_only:
        query["is_open"] = True

    stalls = Stall.find(query)

    if search:
        # Text search on name/description
        stalls = Stall.find(
            {"$text": {"$search": search}, **query}
        )

    results = await stalls.skip(skip).limit(limit).to_list()

    import asyncio
    from app.services.queue_service import get_queue_density
    densities = await asyncio.gather(*(get_queue_density(s) for s in results))

    return [
        {
            "id": str(s.id),
            "name": s.name,
            "slug": s.slug,
            "cuisine_type": s.cuisine_type,
            "is_open": s.is_open,
            "avg_rating": s.avg_rating,
            "total_ratings": s.total_ratings,
            "hero_image_url": s.hero_image_url,
            "logo_url": s.logo_url,
            "location_label": s.location_label,
            "estimated_pickup_min": s.estimated_pickup_min,
            "menu_categories": s.menu_categories,
            "queue_density": densities[i],
        }
        for i, s in enumerate(results)
    ]


@router.get("/my_stalls")
async def my_stalls_list(current_user=Depends(require_role("stall_owner", "admin"))):
    """Returns a list of all stalls owned by the current user (or all stalls if admin)."""
    # Compare enum value or string representation safely
    role_str = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    if role_str == "admin":
        stalls = await Stall.find().to_list()
    else:
        stalls = await Stall.find(Stall.owner_id == current_user.id).to_list()
    from app.models.user import User
    
    result = []
    for s in stalls:
        owner_email = ""
        if s.owner_id:
            owner = await User.get(s.owner_id)
            if owner:
                owner_email = owner.email
                
        result.append({
            "id": str(s.id),
            "name": s.name,
            "slug": s.slug,
            "is_open": s.is_open,
            "hero_image_url": s.hero_image_url,
            "location_label": s.location_label,
            "description": s.description,
            "owner_email": owner_email,
        })
    return result

@router.get("/{stall_id}")
async def get_stall(stall_id: str):

    """
    Return stall details + menu + reviews from MongoDB
    """

    # =====================================================
    # FIND STALL
    # =====================================================

    stall = await Stall.get(
        ObjectId(stall_id)
    )

    if not stall:

        raise HTTPException(
            status_code=404,
            detail="Stall not found"
        )

    # =====================================================
    # FETCH MENU ITEMS
    # =====================================================

    raw_items = await MenuItem.find(

        MenuItem.stall_id == stall.id,

        MenuItem.is_deleted == False,

    ).to_list()

    # =====================================================
    # GROUP MENU ITEMS
    # =====================================================

    cat_order = stall.menu_categories

    grouped = {
        cat: []
        for cat in cat_order
    }

    grouped.setdefault("Other", [])

    for item in raw_items:

        cat = (
            item.category
            if item.category in grouped
            else "Other"
        )

        grouped[cat].append(
            _item_dict(item)
        )

        # ADD POPULAR ITEMS

        if (
            "Popular" in grouped
            and item.is_popular
            and cat != "Popular"
        ):

            grouped["Popular"].append(
                _item_dict(item)
            )

    # REMOVE EMPTY CATEGORY

    menu_sections = [

        {
            "category": cat,
            "items": grouped[cat]
        }

        for cat in cat_order

        if grouped.get(cat)

    ]

    # =====================================================
    # FETCH REVIEWS FROM MONGODB
    # =====================================================

    reviews = await Review.find(

        Review.stall_id == stall.id

    ).sort(

        -Review.created_at

    ).to_list()

    # =====================================================
    # CALCULATE AVG RATING
    # =====================================================

    total_reviews = len(reviews)

    avg_rating = 0

    if total_reviews > 0:

        avg_rating = round(

            sum(
                review.rating
                for review in reviews
            ) / total_reviews,

            1

        )

    # =====================================================
    # FORMAT REVIEWS
    # =====================================================

    review_data = []

    for review in reviews:

        user = await User.get(
            review.user_id
        )

        review_data.append({

            "id":
                str(review.id),

            "user_id":
                str(review.user_id),

            "user_name":

                user.name
                if user else "User",

            "rating":
                review.rating,

            "comment":
                review.comment,

            "created_at":

                review.created_at.isoformat()

        })

    # =====================================================
    # UPDATE STALL RATING
    # =====================================================

    await stall.update({

        "$set": {

            "avg_rating":
                avg_rating,

            "total_ratings":
                total_reviews,

            "updated_at":
                datetime.utcnow()

        }

    })

    # =====================================================
    # RETURN RESPONSE
    # =====================================================

    from app.services.queue_service import get_queue_density
    density = await get_queue_density(stall)

    return {

        "id":
            str(stall.id),

        "name":
            stall.name,

        "description":
            stall.description,

        "slug":
            stall.slug,

        "cuisine_type":
            stall.cuisine_type,

        "is_open":
            stall.is_open,

        "avg_rating":
            avg_rating,

        "total_ratings":
            total_reviews,

        "total_orders":
            stall.total_orders,

        "hero_image_url":
            stall.hero_image_url,

        "logo_url":
            stall.logo_url,

        "location_label":
            stall.location_label,

        "estimated_pickup_min":
            stall.estimated_pickup_min,

        "operating_hours":
            stall.operating_hours,

        "menu_categories":
            stall.menu_categories,

        "menu":
            menu_sections,

        # =================================================
        # REVIEWS FROM MONGODB
        # =================================================

        "reviews":
            review_data,

        "queue_density":
            density

    }


@router.post("/", status_code=201)
async def create_stall(
    body: StallCreateBody,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    from app.models.user import User, UserRole
    from app.utils.security import hash_password
    existing = await Stall.find_one(Stall.slug == body.slug)
    if existing:
        raise HTTPException(status_code=400, detail="Slug already taken")

    owner_id_to_use = current_user.id
    if body.owner_email and body.owner_password:
        existing_user = await User.find_one(User.email == body.owner_email)
        if existing_user:
            raise HTTPException(status_code=400, detail="User with that email already exists")
        
        new_owner = User(
            name=body.name + " Owner",
            email=body.owner_email,
            password=hash_password(body.owner_password),
            role=UserRole.stall_owner,
        )
        await new_owner.insert()
        owner_id_to_use = new_owner.id

    stall_data = body.model_dump(exclude={"owner_email", "owner_password"})
    stall = Stall(
        owner_id=owner_id_to_use,
        **stall_data,
    )
    await stall.insert()
    return {"message": "Stall created", "id": str(stall.id)}


@router.put("/{stall_id}")
async def update_stall(
    stall_id: str,
    body: StallUpdateBody,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    from app.models.user import User
    from app.utils.security import hash_password

    stall = await _owned_stall(stall_id, current_user)
    update_data = {k: v for k, v in body.model_dump(exclude={"owner_email", "owner_password"}).items() if v is not None}
    
    if body.owner_email or body.owner_password:
        if stall.owner_id:
            owner = await User.get(stall.owner_id)
            if owner:
                owner_updates = {}
                if body.owner_email:
                    existing = await User.find_one(User.email == body.owner_email, User.id != owner.id)
                    if existing:
                        raise HTTPException(status_code=400, detail="Email already taken")
                    owner_updates["email"] = body.owner_email
                if body.owner_password:
                    owner_updates["password"] = hash_password(body.owner_password)
                if owner_updates:
                    await owner.update({"$set": owner_updates})

    update_data["updated_at"] = datetime.utcnow()
    if update_data:
        await stall.update({"$set": update_data})
    return {"message": "Stall updated"}


@router.put("/{stall_id}/toggle")
async def toggle_stall(
    stall_id: str,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    """Flip is_open. Returns new state."""
    stall = await _owned_stall(stall_id, current_user)
    new_state = not stall.is_open
    await stall.update({"$set": {"is_open": new_state, "updated_at": datetime.utcnow()}})
    return {"is_open": new_state}


@router.put("/{stall_id}/categories")
async def update_categories(
    stall_id: str,
    body: CategoriesBody,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    """
    Replace the stall's menu_categories list.
    'Popular' is always prepended if not already present.
    """
    cats = body.categories
    if "Popular" not in cats:
        cats = ["Popular"] + cats
    stall = await _owned_stall(stall_id, current_user)
    await stall.update({"$set": {"menu_categories": cats, "updated_at": datetime.utcnow()}})
    return {"menu_categories": cats}


# ─── My stall (owner) ────────────────────────────────────────────────────────

@router.get("/mine")
async def my_stall(current_user=Depends(get_current_user)):
    """Returns the stall owned by the currently logged-in stall_owner."""
    stall = await Stall.find_one(Stall.owner_id == current_user.id)
    if not stall:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No stall found for this account")
    from app.services.queue_service import get_queue_density
    density = await get_queue_density(stall)
    return {
        "id":                str(stall.id),
        "name":              stall.name,
        "slug":              stall.slug,
        "is_open":           stall.is_open,
        "cuisine_type":      stall.cuisine_type,
        "menu_categories":   stall.menu_categories,
        "location_label":    stall.location_label,
        "estimated_pickup_min": stall.estimated_pickup_min,
        "hero_image_url":    stall.hero_image_url,
        "avg_rating":        stall.avg_rating,
        "total_orders":      stall.total_orders,
        "operating_hours":   stall.operating_hours,
        "queue_density":     density,
    }


@router.delete("/{stall_id}")
async def delete_stall(
    stall_id: str,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    stall = await _owned_stall(stall_id, current_user)
    await stall.delete()
    # Optionally delete menu items (or mark them deleted)
    await MenuItem.find(MenuItem.stall_id == stall.id).update({"$set": {"is_deleted": True}})
    return {"message": "Stall deleted"}


# ─── Seed ────────────────────────────────────────────────────────────────────

@router.post("/seed")
async def seed_stalls():
    """One-time seed for demo. Idempotent."""
    if await Stall.find_one():
        return {"message": "Data already exists"}

    stalls_data = [
        {
            "name": "Campus Cafe",
            "slug": "campus-cafe",
            "cuisine_type": StallCategory.snacks,
            "menu_categories": ["Popular", "Snacks", "Drinks", "Combos"],
            "hero_image_url": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80",
            "description": "Quick bites and refreshing drinks for the campus crowd.",
            "location_label": "Main Block, Ground Floor",
            "estimated_pickup_min": 5,
        },
        {
            "name": "Burger Hub",
            "slug": "burger-hub",
            "cuisine_type": StallCategory.burgers,
            "menu_categories": ["Popular", "Burgers", "Fries", "Drinks"],
            "hero_image_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
            "description": "Juicy burgers made fresh every order.",
            "location_label": "Canteen Block B",
            "estimated_pickup_min": 8,
        },
        {
            "name": "Coffee Corner",
            "slug": "coffee-corner",
            "cuisine_type": StallCategory.coffee,
            "menu_categories": ["Popular", "Hot Drinks", "Cold Drinks", "Bakery"],
            "hero_image_url": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80",
            "description": "Premium coffee and freshly baked goods.",
            "location_label": "Library Annex",
            "estimated_pickup_min": 3,
        },
    ]

    # Create a placeholder owner
    from app.models.user import User, UserRole
    from app.utils.security import hash_password

    owner = await User.find_one(User.role == UserRole.stall_owner)
    if not owner:
        owner = User(
            name="Demo Owner",
            email="owner@demo.com",
            password=hash_password("demo1234"),
            role=UserRole.stall_owner,
        )
        await owner.insert()

    inserted_stalls = []
    for sd in stalls_data:
        s = Stall(owner_id=owner.id, **sd)
        await s.insert()
        inserted_stalls.append(s)

    # Seed menu items per stall
    items_per_stall = {
        "campus-cafe": [
            {"name": "Veg Sandwich",  "category": "Snacks",  "price": 60,  "prep_time_min": 5,  "is_popular": True,  "is_veg": True,  "image_url": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80"},
            {"name": "Samosa (2 pcs)","category": "Snacks",  "price": 20,  "prep_time_min": 3,  "is_popular": True,  "is_veg": True,  "image_url": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80"},
            {"name": "Masala Tea",    "category": "Drinks",  "price": 15,  "prep_time_min": 2,  "is_popular": True,  "is_veg": True,  "image_url": "https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?auto=format&fit=crop&w=800&q=80"},
            {"name": "Cold Coffee",   "category": "Drinks",  "price": 60,  "prep_time_min": 3,  "is_popular": True,  "is_veg": True,  "image_url": "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=80"},
            {"name": "Snack Combo",   "category": "Combos",  "price": 70,  "prep_time_min": 5,  "is_popular": False, "is_veg": True,  "image_url": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80"},
        ],
        "burger-hub": [
            {"name": "Chicken Burger","category": "Burgers", "price": 149, "prep_time_min": 8,  "is_popular": True,  "is_veg": False, "image_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80"},
            {"name": "Veg Burger",    "category": "Burgers", "price": 99,  "prep_time_min": 7,  "is_popular": True,  "is_veg": True,  "image_url": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80"},
            {"name": "French Fries",  "category": "Fries",   "price": 89,  "prep_time_min": 4,  "is_popular": True,  "is_veg": True,  "image_url": "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=800&q=80"},
            {"name": "Lemon Soda",    "category": "Drinks",  "price": 59,  "prep_time_min": 2,  "is_popular": False, "is_veg": True,  "image_url": "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=800&q=80"},
        ],
        "coffee-corner": [
            {"name": "Espresso",      "category": "Hot Drinks",  "price": 60,  "prep_time_min": 2,  "is_popular": True,  "is_veg": True, "image_url": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80"},
            {"name": "Latte",         "category": "Hot Drinks",  "price": 80,  "prep_time_min": 4,  "is_popular": True,  "is_veg": True, "image_url": "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=80"},
            {"name": "Cold Brew",     "category": "Cold Drinks", "price": 90,  "prep_time_min": 3,  "is_popular": True,  "is_veg": True, "image_url": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80"},
            {"name": "Chocolate Muffin","category": "Bakery",    "price": 55,  "prep_time_min": 1,  "is_popular": True,  "is_veg": True, "image_url": "https://images.unsplash.com/photo-1583241800698-e8ab01830a6b?auto=format&fit=crop&w=800&q=80"},
        ],
    }

    for stall in inserted_stalls:
        for item_data in items_per_stall.get(stall.slug, []):
            item = MenuItem(stall_id=stall.id, **item_data)
            await item.insert()

    return {"message": f"Seeded {len(inserted_stalls)} stalls with menu items"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _owned_stall(stall_id: str, current_user) -> Stall:
    stall = await Stall.get(ObjectId(stall_id))
    if not stall:
        raise HTTPException(status_code=404, detail="Stall not found")
    role_str = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    if role_str != "admin" and stall.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You don't own this stall")
    return stall


def _item_dict(item: MenuItem) -> dict:
    return {
        "id": str(item.id),
        "name": item.name,
        "description": item.description,
        "category": item.category,
        "price": item.price,
        "discounted_price": item.discounted_price,
        "is_available": item.is_available,
        "is_popular": item.is_popular,
        "is_veg": item.is_veg,
        "tags": item.tags,
        "image_url": item.image_url,
        "prep_time_min": item.prep_time_min,
        "customization_groups": item.customization_groups,
    }