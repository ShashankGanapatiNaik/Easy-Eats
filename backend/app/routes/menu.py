"""
Menu Item Routes  (per-stall, per-category, per-item availability)
──────────────────────────────────────────────────────────────────
GET  /menu/{stall_id}                  → full menu for stall (grouped)
GET  /menu/{stall_id}/category/{cat}   → items in one category
GET  /menu/{stall_id}/available        → only available items
POST /menu/{stall_id}                  → add item [owner]
PUT  /menu/item/{item_id}              → update item [owner]
PUT  /menu/item/{item_id}/toggle       → toggle is_available [owner/kitchen]
DELETE /menu/item/{item_id}            → soft delete [owner]
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime

from app.models.menu_item import MenuItem
from app.models.stall import Stall
from app.utils.security import require_role, get_current_user

router = APIRouter(prefix="/menu", tags=["Menu"])


class MenuItemBody(BaseModel):
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    category: str = "All"
    price: float
    discounted_price: Optional[float] = None
    is_available: bool = True
    available_quantity: Optional[int] = None
    prep_time_min: int = 5
    is_popular: bool = False
    is_veg: bool = True
    tags: List[str] = []
    customization_groups: List[dict] = []


class MenuItemUpdateBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    discounted_price: Optional[float] = None
    is_available: Optional[bool] = None
    available_quantity: Optional[int] = None
    prep_time_min: Optional[int] = None
    is_popular: Optional[bool] = None
    is_veg: Optional[bool] = None
    tags: Optional[List[str]] = None
    customization_groups: Optional[List[dict]] = None


# ─── Public read endpoints ────────────────────────────────────────────────────

@router.get("/{stall_id}")
async def get_menu(stall_id: str):
    """All non-deleted items grouped by category (includes unavailable)."""
    items = await MenuItem.find(
        MenuItem.stall_id == ObjectId(stall_id),
        MenuItem.is_deleted == False,
    ).to_list()

    return _group_by_category(items)


@router.get("/{stall_id}/available")
async def get_available_menu(stall_id: str):
    """Only available items — used by student ordering view."""
    items = await MenuItem.find(
        MenuItem.stall_id == ObjectId(stall_id),
        MenuItem.is_deleted == False,
        MenuItem.is_available == True,
    ).to_list()

    return _group_by_category(items)


@router.get("/{stall_id}/category/{category}")
async def get_category_items(
    stall_id: str,
    category: str,
    available_only: bool = True,
):
    """Items in a specific category tab."""
    query_filter = [
        MenuItem.stall_id == ObjectId(stall_id),
        MenuItem.is_deleted == False,
    ]
    if category.lower() == "popular":
        query_filter.append(MenuItem.is_popular == True)
    else:
        query_filter.append(MenuItem.category == category)
    if available_only:
        query_filter.append(MenuItem.is_available == True)

    items = await MenuItem.find(*query_filter).to_list()
    return [_item_dict(i) for i in items]


# ─── Owner-only write endpoints ───────────────────────────────────────────────

@router.post("/{stall_id}", status_code=201)
async def add_item(
    stall_id: str,
    body: MenuItemBody,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    stall = await Stall.get(ObjectId(stall_id))
    if not stall:
        raise HTTPException(status_code=404, detail="Stall not found")
    if current_user.role not in ("admin", "stall_owner") and stall.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your stall")

    item = MenuItem(stall_id=stall.id, **body.model_dump())
    await item.insert()
    return {"message": "Item added", "id": str(item.id)}


@router.put("/item/{item_id}")
async def update_item(
    item_id: str,
    body: MenuItemUpdateBody,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    item = await _get_item(item_id, current_user)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.utcnow()
    await item.update({"$set": updates})
    return {"message": "Item updated"}


@router.put("/item/{item_id}/toggle")
async def toggle_availability(
    item_id: str,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    """
    Flip is_available on a specific item.
    Kitchen staff can mark items as sold-out in real time.
    """
    item = await MenuItem.get(ObjectId(item_id))
    if not item or item.is_deleted:
        raise HTTPException(status_code=404, detail="Item not found")

    new_state = not item.is_available
    await item.update({"$set": {"is_available": new_state, "updated_at": datetime.utcnow()}})
    return {"id": item_id, "is_available": new_state}


@router.delete("/item/{item_id}")
async def delete_item(
    item_id: str,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    item = await _get_item(item_id, current_user)
    await item.update({"$set": {"is_deleted": True, "updated_at": datetime.utcnow()}})
    return {"message": "Item removed"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_item(item_id: str, current_user) -> MenuItem:
    item = await MenuItem.get(ObjectId(item_id))
    if not item or item.is_deleted:
        raise HTTPException(status_code=404, detail="Item not found")
    stall = await Stall.get(item.stall_id)
    if current_user.role not in ("admin", "stall_owner") and stall.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your stall")
    return item


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


def _group_by_category(items: list) -> dict:
    grouped: dict = {}
    for item in items:
        cat = item.category or "Other"
        grouped.setdefault(cat, []).append(_item_dict(item))
    return grouped