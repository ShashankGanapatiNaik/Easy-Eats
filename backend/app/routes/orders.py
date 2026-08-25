# app/routes/orders.py
# UPDATED ORDER ROUTES WITH TRACKING SUPPORT + REAL-TIME SOCKET.IO

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from bson import ObjectId
from datetime import datetime, timedelta, timezone
from beanie.operators import NotIn, Or

from app.models.order import Order, OrderStatus
from app.models.stall import Stall
from app.models.menu_item import MenuItem
from app.models.user import User
from app.utils.security import get_current_user
from app.services.ai_predictor import predict_prep_time
from app.services.notification_service import (
    notify_order_placed,
    notify_order_ready,
    notify_order_status_update,
)
from app.socket_manager import sio

# ── Status-aware ETA (minutes added from NOW when status changes) ────────────
ETA_BY_STATUS = {
    OrderStatus.accepted:    12,
    OrderStatus.preparing:    6,
    OrderStatus.almost_ready: 2,
    OrderStatus.ready:         0,
}

router = APIRouter(
    prefix="/orders",
    tags=["Orders"]
)

# ─────────────────────────────────────────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────────────────────────────────────────
class CartItemBody(BaseModel):

    menu_item_id: str

    qty: int

    customizations: List[dict] = []

    is_recommended: bool = False


class PlaceOrderBody(BaseModel):

    stall_id: str

    items: List[CartItemBody]

    special_instructions: Optional[str] = None

    payment_method: Optional[str] = None

    payment_status: Optional[str] = None

    express_slot: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# PLACE ORDER
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/place", status_code=201)
async def place_order(

    body: PlaceOrderBody,

    current_user: User = Depends(
        get_current_user
    ),
):

    # stall check
    stall = await Stall.get(
        ObjectId(body.stall_id)
    )

    if not stall:

        raise HTTPException(
            status_code=404,
            detail="Stall not found"
        )

    if not stall.is_open:

        raise HTTPException(
            status_code=400,
            detail="Stall closed"
        )

    order_items = []

    subtotal = 0.0

    # ─────────────────────────────────────────────────────────
    # BUILD ITEMS
    # ─────────────────────────────────────────────────────────
    for cart_item in body.items:

        menu_item = await MenuItem.get(
            ObjectId(
                cart_item.menu_item_id
            )
        )

        if (
            not menu_item or
            menu_item.is_deleted
        ):

            raise HTTPException(
                status_code=404,
                detail="Item not found"
            )

        if not menu_item.is_available:

            raise HTTPException(
                status_code=400,
                detail=f"{menu_item.name} unavailable"
            )

        custom_delta = sum(
            cg.get(
                "price_delta",
                0
            )
            for cg in cart_item.customizations
        )

        unit_price = (
            menu_item.discounted_price
            or menu_item.price
        ) + custom_delta

        item_subtotal = (
            unit_price *
            cart_item.qty
        )

        order_items.append({

            "menu_item_id":
                str(menu_item.id),

            "name":
                menu_item.name,

            "category":
                menu_item.category,

            "price":
                unit_price,

            "qty":
                cart_item.qty,

            "customizations":
                cart_item.customizations,

            "subtotal":
                item_subtotal,

            "image_url":
                menu_item.image_url,
        })

        subtotal += item_subtotal

    # ─────────────────────────────────────────────────────────
    # ACTIVE ORDERS
    # ─────────────────────────────────────────────────────────
    active_orders = await Order.find(

        Order.stall_id == stall.id,

        NotIn(
            Order.status,
            [
                OrderStatus.ready,
                OrderStatus.collected,
                OrderStatus.cancelled,
            ]
        ),

    ).count()

    # ─────────────────────────────────────────────────────────
    # ETA
    # ─────────────────────────────────────────────────────────
    prep_min = min(
        predict_prep_time(
            subtotal,
            active_orders
        ),
        15
    )

    now_utc = datetime.utcnow()
    now_local = datetime.now()

    ready_time_utc = now_utc + timedelta(minutes=prep_min)
    ready_time_local = now_local + timedelta(minutes=prep_min)

    slot_start_local = (
        now_local +
        timedelta(
            minutes=(active_orders // 10) * 5
        )
    )

    slot_end_local = (
        slot_start_local +
        timedelta(minutes=5)
    )

    # ─────────────────────────────────────────────────────────
    # CREATE ORDER
    # ─────────────────────────────────────────────────────────
    order = Order(

        user_id=current_user.id,

        stall_id=stall.id,

        phone=current_user.phone,

        items=order_items,

        subtotal=subtotal,

        discount=0.0,

        total=subtotal,

        status=OrderStatus.placed,

        placed_at=now_utc,

        updated_at=now_utc,

        predicted_prep_min=prep_min,

        estimated_ready_time=
            ready_time_local.strftime("%H:%M"),

        estimated_ready_iso=
            ready_time_utc.replace(tzinfo=timezone.utc).isoformat(),

        pickup_slot=
            body.express_slot or
            (f"{slot_start_local.strftime('%H:%M')} – "
             f"{slot_end_local.strftime('%H:%M')}"),

        active_orders_at_placement=
            active_orders,

        special_instructions=
            body.special_instructions,
    )

    await order.insert()

    await stall.update({
        "$inc": {
            "total_orders": 1
        }
    })

    # ── Record purchase analytics for recommended items ───────────────────
    from app.models.recommendation_analytics import RecommendationAnalytics
    for cart_item in body.items:
        if cart_item.is_recommended:
            try:
                analytics = RecommendationAnalytics(
                    user_id=current_user.id,
                    stall_id=stall.id,
                    item_id=ObjectId(cart_item.menu_item_id),
                    action="purchase",
                    order_id=order.id,
                )
                await analytics.insert()
            except Exception:
                pass  # Never block order placement for analytics

    from app.services.queue_service import broadcast_queue_density
    await broadcast_queue_density(stall.id)

    # ─────────────────────────────────────────────────────────
    # NOTIFICATIONS — always trigger (email + in-app bell)
    # SMS is sent internally only if phone exists
    # ─────────────────────────────────────────────────────────
    sms_sent = await notify_order_placed(
        user_id=current_user.id,
        phone=current_user.phone or "",
        order_id=str(order.id),
        stall_name=stall.name,
        prep_min=prep_min,
    )

    # Notify the kitchen dashboard room via Socket.IO of the new order
    try:
        await sio.emit("order_status_updated", {
            "order_id": str(order.id),
            "status": order.status,
            "stall_id": str(stall.id),
        }, room=f"stall_{str(stall.id)}")
    except Exception as e:
        logger.error(f"Failed to emit new order socket event: {e}")

    # ─────────────────────────────────────────────────────────
    # RESPONSE
    # ─────────────────────────────────────────────────────────
    return {

        "success": True,

        "message":
            "Order placed successfully",

        "order_id":
            str(order.id),

        # IMPORTANT
        "tracking_url":
            f"/track/{order.id}",

        "predicted_prep_min":
            prep_min,

        "estimated_ready_time":
            order.estimated_ready_time,

        "pickup_slot":
            order.pickup_slot,

        "total":
            order.total,

        "sms_sent":
            sms_sent,
    }


# ─────────────────────────────────────────────────────────────────────────────
# STUDENT ORDER HISTORY
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/my")
async def get_my_orders(current_user: User = Depends(get_current_user)):
    orders = await Order.find(
        Or(Order.user_id == current_user.id, Order.group_member_ids == current_user.id)
    ).sort(-Order.placed_at).to_list()
    res = []
    for o in orders:
        stall = await Stall.get(o.stall_id)
        res.append({
            "id": str(o.id),
            "stall_id": str(o.stall_id),
            "stall_name": stall.name if stall else "Unknown Stall",
            "restaurant_name": stall.name if stall else "Unknown Stall",
            "stall_is_open": stall.is_open if stall else False,
            "placed_at": o.placed_at.replace(tzinfo=timezone.utc).isoformat(),
            "status": o.status,
            "items": o.items,
            "total": o.total,
            "review_submitted": getattr(o, "review_submitted", False)
        })
    return res


@router.get("/history")
async def get_order_history(current_user: User = Depends(get_current_user)):
    return await get_my_orders(current_user)


# ─────────────────────────────────────────────────────────────────────────────
# KITCHEN DASHBOARD ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/stall/{stall_id}")
async def get_stall_orders(stall_id: str, current_user: User = Depends(get_current_user)):
    stall = await Stall.get(ObjectId(stall_id))
    if not stall:
        raise HTTPException(status_code=404, detail="Stall not found")
    if stall.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view this stall's orders")
    
    orders = await Order.find(Order.stall_id == ObjectId(stall_id)).sort(-Order.placed_at).to_list()
    res = []
    for o in orders:
        user = await User.get(o.user_id)
        prediction = await predict_dynamic_remaining_time(o)
        res.append({
            "id": str(o.id),
            "user_id": str(o.user_id),
            "customer_name": user.name if user else "Customer",
            "phone": o.phone,
            "items": o.items,
            "subtotal": o.subtotal,
            "total": o.total,
            "status": o.status,
            "placed_at": o.placed_at.replace(tzinfo=timezone.utc).isoformat(),
            "estimated_ready_iso": prediction["estimated_ready_iso"],
            "predicted_prep_min": o.predicted_prep_min,
            "estimated_ready_time": prediction["eta_ready_time"],
            "pickup_slot": o.pickup_slot,
            "special_instructions": o.special_instructions,
            "ai_prediction": {
                "remaining_min": prediction["remaining_min"],
                "confidence_range": prediction["confidence_range"],
                "status_label": prediction["status_label"],
                "status_color": prediction["status_color"],
                "delay_risk": prediction["delay_risk"],
                "avg_completion_speed": prediction["avg_completion_speed"]
            }
        })
    return res


# ─────────────────────────────────────────────────────────────────────────────
# TRACK ORDER
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/{id}/track")
async def get_order_tracking(id: str, current_user: User = Depends(get_current_user)):
    order = await Order.get(ObjectId(id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    prediction = await predict_dynamic_remaining_time(order)
    stall = await Stall.get(order.stall_id)
    
    return {
        "id": str(order.id),
        "status": order.status,
        "remaining_min": prediction["remaining_min"],
        "estimated_ready_time": prediction["eta_ready_time"],
        "pickup_slot": order.pickup_slot,
        "total": order.total,
        "items": order.items,
        "stall_name": stall.name if stall else "Unknown Stall",
        "estimated_ready_iso": prediction["estimated_ready_iso"],
        "predicted_prep_min": order.predicted_prep_min,
        "ai_prediction": {
            "confidence_range": prediction["confidence_range"],
            "status_label": prediction["status_label"],
            "status_color": prediction["status_color"],
            "delay_risk": prediction["delay_risk"],
            "avg_completion_speed": prediction["avg_completion_speed"],
            "queue_time_min": prediction["queue_time_min"],
            "walking_time_min": prediction["walking_time_min"],
            "leave_recommendation": prediction["leave_recommendation"],
            "leave_label": prediction["leave_label"],
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# ADVANCE STATUS  (with real-time Socket.IO notification)
# ─────────────────────────────────────────────────────────────────────────────
@router.put("/{id}/status")
async def update_order_status(id: str, status: OrderStatus, prep_time: Optional[int] = None, current_user: User = Depends(get_current_user)):
    order = await Order.get(ObjectId(id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    stall = await Stall.get(order.stall_id)
    if not stall:
        raise HTTPException(status_code=404, detail="Stall not found")

    # Authorize stall owner/kitchen or admin
    if stall.owner_id != current_user.id and current_user.role not in ("admin", "stall_owner"):
        raise HTTPException(status_code=403, detail="Not authorized to update this order's status")

    order.status = status
    order.updated_at = datetime.utcnow()
    if status == OrderStatus.collected:
        order.collected_at = datetime.utcnow()

    # ── ETA calculation ──────────────────────────────────────────────────────
    # If the kitchen sends a prep_time (minutes), use it directly.
    # Otherwise fall back to the order's predicted prep min or the hardcoded ETA_BY_STATUS table.
    remaining_min = 0
    if prep_time and prep_time > 0:
        local_ready = datetime.now() + timedelta(minutes=prep_time)
        utc_ready = datetime.utcnow() + timedelta(minutes=prep_time)
        order.estimated_ready_time = local_ready.strftime("%H:%M")
        order.estimated_ready_iso  = utc_ready.replace(tzinfo=timezone.utc).isoformat()
        order.predicted_prep_min   = prep_time
        remaining_min = prep_time
    elif status == OrderStatus.preparing and order.predicted_prep_min and order.predicted_prep_min > 0:
        local_ready = datetime.now() + timedelta(minutes=order.predicted_prep_min)
        utc_ready = datetime.utcnow() + timedelta(minutes=order.predicted_prep_min)
        order.estimated_ready_time = local_ready.strftime("%H:%M")
        order.estimated_ready_iso  = utc_ready.replace(tzinfo=timezone.utc).isoformat()
        remaining_min = order.predicted_prep_min
    elif status in ETA_BY_STATUS:
        mins = ETA_BY_STATUS[status]
        if mins > 0:
            local_ready = datetime.now() + timedelta(minutes=mins)
            utc_ready = datetime.utcnow() + timedelta(minutes=mins)
            order.estimated_ready_time = local_ready.strftime("%H:%M")
            order.estimated_ready_iso  = utc_ready.replace(tzinfo=timezone.utc).isoformat()
            remaining_min = mins
        else:
            # Ready or terminal — clear countdown
            remaining_min = 0

    await order.save()

    from app.services.queue_service import broadcast_queue_density
    await broadcast_queue_density(stall.id)

    # ── Notifications for user & group members on status changes ──────────
    target_user_ids = list(set([order.user_id] + list(getattr(order, "group_member_ids", []) or [])))
    for uid in target_user_ids:
        u_phone = order.phone if uid == order.user_id else ""
        if status == OrderStatus.ready:
            await notify_order_ready(
                user_id=uid,
                phone=u_phone,
                order_id=str(order.id),
                stall_name=stall.name
            )
        elif status in (OrderStatus.accepted, OrderStatus.preparing, OrderStatus.almost_ready, OrderStatus.cancelled):
            await notify_order_status_update(
                user_id=uid,
                phone=u_phone,
                order_id=str(order.id),
                stall_name=stall.name,
                status_label=status.value
            )

    prediction = await predict_dynamic_remaining_time(order)

    # ── Socket.IO — broadcast to student tracking page ───────────────────────
    socket_payload = {
        "order_id":             str(order.id),
        "status":               order.status,
        "estimated_ready_time": prediction["eta_ready_time"],
        "estimated_ready_iso":  prediction["estimated_ready_iso"],
        "remaining_min":        prediction["remaining_min"],
        "stall_name":           stall.name,
        "ai_prediction": {
            "confidence_range": prediction["confidence_range"],
            "status_label": prediction["status_label"],
            "status_color": prediction["status_color"],
            "delay_risk": prediction["delay_risk"],
            "avg_completion_speed": prediction["avg_completion_speed"]
        }
    }
    # Notify the specific order room (student tracking page)
    await sio.emit("order_status_updated", socket_payload, room=f"order_{id}")
    # Also notify the stall room (kitchen dashboard on other devices)
    await sio.emit("order_status_updated", socket_payload, room=f"stall_{str(stall.id)}")

    return {
        "id":                   str(order.id),
        "status":               order.status,
        "estimated_ready_time": prediction["eta_ready_time"],
        "estimated_ready_iso":  prediction["estimated_ready_iso"],
        "remaining_min":        prediction["remaining_min"],
        "ai_prediction":        socket_payload["ai_prediction"]
    }


# ─────────────────────────────────────────────────────────────────────────────
# CANCEL ORDER
# ─────────────────────────────────────────────────────────────────────────────
@router.delete("/{id}")
async def cancel_order(id: str, current_user: User = Depends(get_current_user)):
    order = await Order.get(ObjectId(id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Verify owner (student who placed it, stall owner, or admin)
    if order.user_id != current_user.id and current_user.role != "admin":
        stall = await Stall.get(order.stall_id)
        if not stall or stall.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to cancel this order")
            
    order.status = OrderStatus.cancelled
    order.updated_at = datetime.utcnow()
    await order.save()
    from app.services.queue_service import broadcast_queue_density
    await broadcast_queue_density(order.stall_id)
    return {"message": "Order cancelled successfully"}


# ─────────────────────────────────────────────────────────────────────────────
# ANALYTICS
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/analytics/{stall_id}")
async def get_stall_analytics(stall_id: str, current_user: User = Depends(get_current_user)):
    stall = await Stall.get(ObjectId(stall_id))
    if not stall:
        raise HTTPException(status_code=404, detail="Stall not found")
    if stall.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view analytics")
        
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    
    # 1. Daily revenue pipeline
    daily_pipeline = [
        {"$match": {"stall_id": ObjectId(stall_id), "placed_at": {"$gte": seven_days_ago}, "status": {"$ne": "Cancelled"}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$placed_at"}},
            "revenue": {"$sum": "$total"},
            "orders": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_stats = await Order.find().aggregate(daily_pipeline).to_list()
    
    # 2. Top items pipeline
    items_pipeline = [
        {"$match": {"stall_id": ObjectId(stall_id), "status": {"$ne": "Cancelled"}}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.name",
            "qty_sold": {"$sum": "$items.qty"},
            "revenue": {"$sum": "$items.subtotal"}
        }},
        {"$sort": {"qty_sold": -1}},
        {"$limit": 5}
    ]
    top_items = await Order.find().aggregate(items_pipeline).to_list()
    
    # 3. Status breakdown pipeline
    status_pipeline = [
        {"$match": {"stall_id": ObjectId(stall_id), "status": {"$ne": "Cancelled"}}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1}
        }}
    ]
    status_breakdown = await Order.find().aggregate(status_pipeline).to_list()
    
    return {
        "daily_revenue": daily_stats,
        "status_breakdown": status_breakdown,
        "top_items": top_items
    }


async def predict_dynamic_remaining_time(order: Order) -> dict:
    if order.status == OrderStatus.ready:
        return {
            "remaining_min": 0,
            "confidence_range": "0 min",
            "status_label": "Ready",
            "status_color": "green",
            "delay_risk": "None",
            "avg_completion_speed": "0 min",
            "eta_ready_time": order.estimated_ready_time,
            "estimated_ready_iso": order.estimated_ready_iso or (datetime.utcnow()).replace(tzinfo=timezone.utc).isoformat(),
            "queue_time_min": 0,
            "walking_time_min": 3,
            "leave_recommendation": "Food Ready - Please Collect",
            "leave_label": "ready",
        }
    if order.status in (OrderStatus.collected, OrderStatus.cancelled):
        return {
            "remaining_min": 0,
            "confidence_range": "0 min",
            "status_label": "Completed" if order.status == OrderStatus.collected else "Cancelled",
            "status_color": "gray",
            "delay_risk": "None",
            "avg_completion_speed": "0 min",
            "eta_ready_time": "--:--",
            "estimated_ready_iso": order.estimated_ready_iso,
            "queue_time_min": 0,
            "walking_time_min": 3,
            "leave_recommendation": "--",
            "leave_label": "done",
        }
        
    stall = await Stall.get(order.stall_id)
    baseline_pickup_min = stall.estimated_pickup_min if stall else 5
    
    # Get current active orders in this kitchen
    active_now = await Order.find(
        Order.stall_id == order.stall_id,
        NotIn(Order.status, [OrderStatus.collected, OrderStatus.cancelled])
    ).count()
    
    # Calculate kitchen load factor: current active vs active at placement
    active_at_placement = getattr(order, "active_orders_at_placement", 1) or 1
    if active_at_placement == 0:
        active_at_placement = 1
        
    load_ratio = active_now / active_at_placement
    
    # Item preparation times factor
    item_prep_times = [item.get("prep_time_min", 5) for item in order.items]
    max_item_prep = max(item_prep_times) if item_prep_times else 5
    
    # Base remaining time calculation
    elapsed_mins = (datetime.utcnow() - order.placed_at).total_seconds() / 60.0
    initial_estimate = order.predicted_prep_min or max_item_prep
    
    # Adjust remaining time dynamically based on status and load ratio
    status_factor = 1.0
    if order.status == OrderStatus.almost_ready:
        status_factor = 0.2
    elif order.status == OrderStatus.preparing:
        status_factor = 0.5
    elif order.status == OrderStatus.accepted:
        status_factor = 0.8
        
    # Scale remaining time based on load ratio:
    load_multiplier = max(0.5, min(2.5, load_ratio))
    
    raw_remaining = (initial_estimate - elapsed_mins) * status_factor * load_multiplier
    
    # Add a buffer for rush hour (12-14 and 17-19)
    now = datetime.now()
    is_rush = (12 <= now.hour <= 14) or (17 <= now.hour <= 19)
    if is_rush and order.status != OrderStatus.almost_ready:
        raw_remaining += 2.0
        
    remaining_min = max(1, int(round(raw_remaining)))
    
    # If explicit estimated_ready_iso exists (e.g. set by kitchen), use exact remaining mins from target time
    if order.estimated_ready_iso:
        try:
            target_dt = datetime.fromisoformat(order.estimated_ready_iso.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
            now_dt = datetime.utcnow().replace(tzinfo=timezone.utc)
            calc_rem = max(0, int(round((target_dt - now_dt).total_seconds() / 60.0)))
            remaining_min = calc_rem
        except Exception:
            pass

    # If status is almost ready, remaining time shouldn't exceed 3 mins
    if order.status == OrderStatus.almost_ready:
        remaining_min = min(remaining_min, 3)
    # If status is preparing, remaining time shouldn't exceed initial prep time
    if order.status == OrderStatus.preparing:
        remaining_min = min(remaining_min, max(3, initial_estimate - 2))
        
    # Calculate confidence range
    lower_bound = max(1, remaining_min - 2)
    upper_bound = remaining_min + 2
    
    if order.status == OrderStatus.almost_ready:
        lower_bound = max(1, remaining_min - 1)
        upper_bound = remaining_min + 1
        
    confidence_range = f"{lower_bound}\u2013{upper_bound} min"
    
    # Determine Delay Risk and Status labels
    if load_ratio > 1.5:
        delay_risk = "High"
        status_label = "Kitchen Busy"
        status_color = "red"
    elif load_ratio > 1.1:
        delay_risk = "Medium"
        status_label = "Slight Delay"
        status_color = "yellow"
    else:
        delay_risk = "Low"
        status_label = "On Time"
        status_color = "green"
        
    # Historical completion speed helper (last 10 orders)
    completed_orders = await Order.find(
        Order.stall_id == order.stall_id,
        Order.status == OrderStatus.collected
    ).sort(-Order.placed_at).limit(10).to_list()
    
    if completed_orders:
        avg_speed = sum((o.collected_at - o.placed_at).total_seconds() / 60.0 for o in completed_orders) / len(completed_orders)
        avg_speed_str = f"{avg_speed:.1f} min"
    else:
        avg_speed_str = f"{baseline_pickup_min:.1f} min"
        
    # Local time ready time
    eta_ready_time = (datetime.now() + timedelta(minutes=remaining_min)).strftime("%H:%M")

    # ── Smart Pickup Prediction ───────────────────────────────────────────
    # Queue time at counter: scales with active orders (2 min base + 0.5 per active order beyond 3)
    queue_time_min = max(1, int(round(2 + max(0, active_now - 3) * 0.5)))
    queue_time_min = min(queue_time_min, 8)  # cap at 8 min

    # Walking time: default 3 min (campus walk)
    walking_time_min = 3

    # Optimal leave time = ready time minus queue and walk time
    leave_offset_min = remaining_min - queue_time_min - walking_time_min
    leave_time_abs = (datetime.now() + timedelta(minutes=max(0, leave_offset_min))).strftime("%H:%M")

    if remaining_min <= 0:
        leave_recommendation = "Food Ready - Please Collect"
        leave_label = "ready"
    elif leave_offset_min <= 0:
        leave_recommendation = "Leave Now"
        leave_label = "now"
    elif leave_offset_min <= 3:
        leave_recommendation = f"Leave in {int(leave_offset_min)} min ({leave_time_abs})"
        leave_label = "soon"
    else:
        leave_recommendation = f"Leave at {leave_time_abs}"
        leave_label = "later"

    return {
        "remaining_min": remaining_min,
        "confidence_range": confidence_range,
        "status_label": status_label,
        "status_color": status_color,
        "delay_risk": delay_risk,
        "avg_completion_speed": avg_speed_str,
        "eta_ready_time": eta_ready_time,
        "estimated_ready_iso": order.estimated_ready_iso or (datetime.utcnow() + timedelta(minutes=remaining_min)).replace(tzinfo=timezone.utc).isoformat(),
        # Smart Pickup fields
        "queue_time_min": queue_time_min,
        "walking_time_min": walking_time_min,
        "leave_recommendation": leave_recommendation,
        "leave_label": leave_label,
    }
