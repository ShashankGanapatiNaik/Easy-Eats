from bson import ObjectId
from app.models.order import Order, OrderStatus
from app.models.stall import Stall
from app.socket_manager import sio
from beanie.operators import NotIn

async def get_queue_density(stall: Stall) -> dict:
    """
    Calculate crowd level and wait times based on the number of active orders
    (Placed, Accepted, Preparing, Almost Ready, Ready).
    """
    # Active orders = any order that has not been Collected or Cancelled
    active_count = await Order.find(
        Order.stall_id == stall.id,
        NotIn(Order.status, [OrderStatus.collected, OrderStatus.cancelled])
    ).count()

    # Determine crowd level
    # 0–5 active orders → Low
    # 6–12 active orders → Medium
    # 13+ active orders → High
    if active_count <= 5:
        crowd_level = "Low"
    elif active_count <= 12:
        crowd_level = "Medium"
    else:
        crowd_level = "High"

    # Wait time calculation:
    # Low: baseline_wait_time
    # Medium: baseline_wait_time + 5
    # High: baseline_wait_time + 13
    baseline = stall.estimated_pickup_min or 5
    if crowd_level == "Low":
        wait_min = baseline
    elif crowd_level == "Medium":
        wait_min = baseline + 5
    else:
        wait_min = baseline + 13

    # Dynamic metrics / intelligence layer
    if crowd_level == "Low":
        best_time = "Now (Fastest)"
        is_rush_hour = False
        fast_pickup = True
    elif crowd_level == "Medium":
        best_time = "In 20-30 mins"
        is_rush_hour = False
        fast_pickup = False
    else:
        best_time = "After rush hour (in 1 hr)"
        is_rush_hour = True
        fast_pickup = False

    return {
        "active_orders_count": active_count,
        "crowd_level": crowd_level,
        "estimated_wait_min": wait_min,
        "best_time_to_order": best_time,
        "is_rush_hour": is_rush_hour,
        "fast_pickup": fast_pickup
    }

async def broadcast_queue_density(stall_id: ObjectId):
    """
    Fetch updated queue density and broadcast it to all connected clients.
    """
    stall = await Stall.get(stall_id)
    if not stall:
        return
    density = await get_queue_density(stall)
    await sio.emit("queue_update", {
        "stall_id": str(stall_id),
        "queue_density": density
    })
