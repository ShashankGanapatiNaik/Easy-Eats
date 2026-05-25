"""
Order Routes — with SMS notifications
POST /orders/place           → place order + SMS confirmation
GET  /orders/history         → full order history with stall info + review status
PUT  /orders/{id}/status     → update status + SMS when Ready
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from bson import ObjectId
from datetime import datetime, timedelta
from beanie.operators import NotIn

from app.models.order import Order, OrderStatus
from app.models.stall import Stall
from app.models.menu_item import MenuItem
from app.models.user import User
from app.models.review import Review
from app.utils.security import get_current_user, require_role
from app.services.ai_predictor import predict_prep_time
from app.services.notification_service import notify_order_placed, notify_order_ready

router = APIRouter(prefix="/orders", tags=["Orders"])


class CartItemBody(BaseModel):
    menu_item_id: str
    qty: int
    customizations: List[dict] = []


class PlaceOrderBody(BaseModel):
    stall_id: str
    items: List[CartItemBody]
    special_instructions: Optional[str] = None


# ─── Place Order ─────────────────────────────────────────────────────────────

@router.post("/place", status_code=201)
async def place_order(
    body: PlaceOrderBody,
    current_user: User = Depends(get_current_user),
):
    stall = await Stall.get(ObjectId(body.stall_id))
    if not stall:
        raise HTTPException(status_code=404, detail="Stall not found")
    if not stall.is_open:
        raise HTTPException(status_code=400, detail="Stall is currently closed")

    order_items = []
    subtotal = 0.0

    for cart_item in body.items:
        menu_item = await MenuItem.get(ObjectId(cart_item.menu_item_id))
        if not menu_item or menu_item.is_deleted:
            raise HTTPException(status_code=404, detail=f"Item {cart_item.menu_item_id} not found")
        if not menu_item.is_available:
            raise HTTPException(status_code=400, detail=f"'{menu_item.name}' is currently unavailable")

        custom_delta  = sum(cg.get("price_delta", 0) for cg in cart_item.customizations)
        unit_price    = (menu_item.discounted_price or menu_item.price) + custom_delta
        item_subtotal = unit_price * cart_item.qty

        order_items.append({
            "menu_item_id": str(menu_item.id),
            "name":         menu_item.name,
            "category":     menu_item.category,
            "price":        unit_price,
            "qty":          cart_item.qty,
            "customizations": cart_item.customizations,
            "subtotal":     item_subtotal,
            "image_url":    menu_item.image_url,
        })
        subtotal += item_subtotal

    active_orders = await Order.find(
        Order.stall_id == stall.id,
        NotIn(Order.status, [OrderStatus.ready, OrderStatus.collected, OrderStatus.cancelled]),
    ).count()

    prep_min   = min(predict_prep_time(subtotal, active_orders), 15)
    now        = datetime.now()
    ready_time = now + timedelta(minutes=prep_min)
    slot_start = now + timedelta(minutes=(active_orders // 10) * 5)
    slot_end   = slot_start + timedelta(minutes=5)

    order = Order(
        user_id=current_user.id,
        stall_id=stall.id,
        phone=current_user.phone,
        items=order_items,
        subtotal=subtotal,
        discount=0.0,
        total=subtotal,
        status=OrderStatus.placed,
        predicted_prep_min=prep_min,
        estimated_ready_time=ready_time.strftime("%H:%M"),
        pickup_slot=f"{slot_start.strftime('%H:%M')} – {slot_end.strftime('%H:%M')}",
        active_orders_at_placement=active_orders,
        special_instructions=body.special_instructions,
    )
    await order.insert()
    await stall.update({"$inc": {"total_orders": 1}})

    # ── SMS: Order placed ─────────────────────────────────────────────────────
    sms_sent = False
    if current_user.phone:
        sms_sent = await notify_order_placed(
            user_id     = current_user.id,
            phone       = current_user.phone,
            order_id    = str(order.id),
            stall_name  = stall.name,
            prep_min    = prep_min,
        )

    return {
        "message":              "Order placed",
        "order_id":             str(order.id),
        "predicted_prep_min":   prep_min,
        "estimated_ready_time": order.estimated_ready_time,
        "pickup_slot":          order.pickup_slot,
        "total":                order.total,
        "sms_sent":             sms_sent,
    }


# ─── Student: own orders ─────────────────────────────────────────────────────

@router.get("/my")
async def my_orders(
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
):
    orders = await Order.find(
        Order.user_id == current_user.id,
    ).sort(-Order.placed_at).skip(skip).limit(limit).to_list()
    return [_order_dict(o) for o in orders]


# ─── Student: full order history with stall info + review status ─────────────

@router.get("/history")
async def order_history(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """
    Rich order history endpoint.
    Joins stall name/logo and checks if user already reviewed each order.
    Supports optional ?status=Collected and ?search=burger filtering.
    """
    orders = await Order.find(
        Order.user_id == current_user.id,
    ).sort(-Order.placed_at).skip(skip).limit(limit).to_list()

    # Pre-fetch all unique stalls in one batch
    stall_ids = list({o.stall_id for o in orders})
    stalls = await Stall.find({"_id": {"$in": stall_ids}}).to_list()
    stall_map = {s.id: s for s in stalls}

    # Pre-fetch existing reviews by this user for these orders
    order_ids = [o.id for o in orders]
    reviews = await Review.find(
        Review.user_id == current_user.id,
        {"order_id": {"$in": order_ids}},
    ).to_list()
    reviewed_order_ids = {r.order_id for r in reviews if r.order_id}

    results = []
    for o in orders:
        stall = stall_map.get(o.stall_id)
        stall_name = stall.name if stall else "Unknown Stall"
        stall_logo = stall.logo_url if stall else None

        # Apply server-side status filter
        if status and o.status.value != status:
            continue

        # Apply server-side search filter (match stall name or item names)
        if search:
            q = search.lower()
            name_match = q in stall_name.lower()
            item_match = any(q in (it.get("name", "")).lower() for it in o.items)
            if not name_match and not item_match:
                continue

        base = _order_dict(o)
        base["restaurant_name"] = stall_name
        base["restaurant_logo_url"] = stall_logo
        base["pickup_code"] = str(o.id)[-4:].upper()
        base["is_reviewed"] = o.id in reviewed_order_ids
        results.append(base)

    return results


# ─── Kitchen/Owner: stall orders ─────────────────────────────────────────────

@router.get("/stall/{stall_id}")
async def stall_orders(
    stall_id: str,
    status: Optional[OrderStatus] = None,
    skip: int = 0,
    limit: int = 50,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    query = [Order.stall_id == ObjectId(stall_id)]
    if status:
        query.append(Order.status == status)
    orders = await Order.find(*query).sort(-Order.placed_at).skip(skip).limit(limit).to_list()
    return [_order_dict(o) for o in orders]


# ─── Track order ─────────────────────────────────────────────────────────────

@router.get("/{order_id}/track")
async def track_order(order_id: str):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    now      = datetime.now()
    ready_dt = datetime.strptime(order.estimated_ready_time, "%H:%M").replace(
        year=now.year, month=now.month, day=now.day
    )
    remaining = max(0, int((ready_dt - now).total_seconds() / 60))

    if remaining > 8:   auto_status = OrderStatus.placed
    elif remaining > 6: auto_status = OrderStatus.accepted
    elif remaining > 4: auto_status = OrderStatus.preparing
    elif remaining > 2: auto_status = OrderStatus.almost_ready
    else:               auto_status = OrderStatus.ready

    if order.status != auto_status and order.status not in (
        OrderStatus.collected, OrderStatus.cancelled
    ):
        await order.update({"$set": {"status": auto_status, "updated_at": datetime.utcnow()}})
        order.status = auto_status

    return {**_order_dict(order), "remaining_min": remaining}


# ─── Update status ────────────────────────────────────────────────────────────

@router.put("/{order_id}/status")
async def update_status(
    order_id: str,
    status: OrderStatus,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    update_data = {"status": status, "updated_at": datetime.utcnow()}
    if status == OrderStatus.collected:
        update_data["collected_at"] = datetime.utcnow()
    await order.update({"$set": update_data})

    # ── SMS: Food ready ───────────────────────────────────────────────────────
    if status == OrderStatus.ready:
        student = await User.get(order.user_id)
        stall   = await Stall.get(order.stall_id)
        if student and student.phone and stall:
            await notify_order_ready(
                user_id    = student.id,
                phone      = student.phone,
                order_id   = str(order.id),
                stall_name = stall.name,
            )

    return {"message": "Status updated", "order_id": order_id, "status": status}


# ─── Cancel order ────────────────────────────────────────────────────────────

@router.delete("/{order_id}")
async def cancel_order(
    order_id: str,
    current_user=Depends(get_current_user),
):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.role == "student" and order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your order")
    if order.status in (OrderStatus.ready, OrderStatus.collected):
        raise HTTPException(status_code=400, detail="Cannot cancel a ready/collected order")
    await order.update({"$set": {"status": OrderStatus.cancelled, "updated_at": datetime.utcnow()}})
    return {"message": "Order cancelled"}


# ─── Analytics ───────────────────────────────────────────────────────────────

@router.get("/analytics/{stall_id}")
async def stall_analytics(
    stall_id: str,
    current_user=Depends(require_role("stall_owner", "admin")),
):
    from app.database import get_client
    from app.core.config import settings

    db  = get_client()[settings.MONGODB_DB_NAME]
    oid = ObjectId(stall_id)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)

    daily    = await db.orders.aggregate([
        {"$match": {"stall_id": oid, "status": {"$ne": "Cancelled"}, "placed_at": {"$gte": seven_days_ago}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$placed_at"}}, "revenue": {"$sum": "$total"}, "orders": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]).to_list(30)
    statuses = await db.orders.aggregate([
        {"$match": {"stall_id": oid}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]).to_list(20)
    top_items = await db.orders.aggregate([
        {"$match": {"stall_id": oid, "status": {"$ne": "Cancelled"}}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.name", "qty_sold": {"$sum": "$items.qty"}, "revenue": {"$sum": "$items.subtotal"}}},
        {"$sort": {"qty_sold": -1}},
        {"$limit": 5},
    ]).to_list(5)

    return {"daily_revenue": daily, "status_breakdown": statuses, "top_items": top_items}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _order_dict(order: Order) -> dict:
    ready_iso = None
    if order.estimated_ready_time:
        try:
            now = datetime.now()
            t   = datetime.strptime(order.estimated_ready_time, "%H:%M")
            ready_iso = now.replace(hour=t.hour, minute=t.minute, second=0, microsecond=0).isoformat()
        except Exception:
            pass
    return {
        "id":                   str(order.id),
        "stall_id":             str(order.stall_id),
        "user_id":              str(order.user_id),
        "items":                order.items,
        "subtotal":             order.subtotal,
        "discount":             order.discount,
        "total":                order.total,
        "status":               order.status,
        "predicted_prep_min":   order.predicted_prep_min,
        "estimated_ready_time": order.estimated_ready_time,
        "estimated_ready_iso":  ready_iso,
        "pickup_slot":          order.pickup_slot,
        "special_instructions": order.special_instructions,
        "placed_at":            order.placed_at.isoformat(),
    }