import random
import string
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from bson import ObjectId
from datetime import datetime, timezone, timedelta

from app.models.group_session import GroupSession
from app.models.order import Order, OrderStatus
from app.models.stall import Stall
from app.models.menu_item import MenuItem
from app.models.user import User
from app.utils.security import get_current_user
from app.routes.wallet import get_wallet, WalletTransaction
from app.socket_manager import sio
from app.services.ai_predictor import predict_prep_time
from app.services.notification_service import notify_order_placed

router = APIRouter(prefix="/orders/group", tags=["Group Orders"])

class CreateGroupBody(BaseModel):
    stall_id: str

class JoinGroupBody(BaseModel):
    code: str

class UpdateGroupItemBody(BaseModel):
    menu_item_id: str
    qty: int
    customizations: List[dict] = []

class GroupCheckoutBody(BaseModel):
    payment_method: str  # "host" or "split"

class UpdatePaymentMethodBody(BaseModel):
    payment_method: str  # "host" or "split"


def generate_unique_code() -> str:
    # Generates a 6-character room code (e.g. ROOM12)
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=6))


async def get_group_session_or_404(session_id: str) -> GroupSession:
    try:
        session = await GroupSession.get(ObjectId(session_id))
        if not session:
            raise HTTPException(status_code=404, detail="Group session not found")
        return session
    except Exception:
        raise HTTPException(status_code=404, detail="Group session not found")


async def broadcast_group_update(session: GroupSession):
    # Fetch stall name for frontend context
    stall = await Stall.get(session.stall_id)
    payload = {
        "id": str(session.id),
        "code": session.code,
        "stall_id": str(session.stall_id),
        "stall_name": stall.name if stall else "Unknown Stall",
        "host_id": str(session.host_id),
        "status": session.status,
        "order_id": str(session.order_id) if session.order_id else None,
        "payment_method": session.payment_method,
        "members": [
            {
                "user_id": str(m["user_id"]),
                "name": m["name"],
                "joined_at": m["joined_at"].isoformat() if isinstance(m["joined_at"], datetime) else m["joined_at"]
            }
            for m in session.members
        ],
        "items": [
            {
                "id": i.get("id"),
                "menu_item_id": str(i["menu_item_id"]),
                "user_id": str(i["user_id"]),
                "user_name": i["user_name"],
                "name": i["name"],
                "qty": i["qty"],
                "price": i["price"],
                "customizations": i["customizations"],
                "image_url": i.get("image_url")
            }
            for i in session.items
        ]
    }
    try:
        await sio.emit("group_updated", payload, room=f"group_{str(session.id)}")
    except Exception:
        pass
    return payload


@router.post("/create", status_code=201)
async def create_group_session(body: CreateGroupBody, current_user: User = Depends(get_current_user)):
    stall = await Stall.get(ObjectId(body.stall_id))
    if not stall:
        raise HTTPException(status_code=404, detail="Stall not found")
    if not stall.is_open:
        raise HTTPException(status_code=400, detail="Stall is closed")

    # Generate unique code
    attempts = 0
    code = generate_unique_code()
    while await GroupSession.find_one(GroupSession.code == code, GroupSession.status == "open") and attempts < 10:
        code = generate_unique_code()
        attempts += 1

    session = GroupSession(
        code=code,
        stall_id=stall.id,
        host_id=current_user.id,
        status="open",
        members=[{"user_id": current_user.id, "name": current_user.name, "joined_at": datetime.utcnow()}],
        items=[]
    )
    await session.insert()
    return await broadcast_group_update(session)


@router.post("/join")
async def join_group_session(body: JoinGroupBody, current_user: User = Depends(get_current_user)):
    session = await GroupSession.find_one(
        GroupSession.code == body.code.upper(), 
        GroupSession.status == "open"
    )
    if not session:
        raise HTTPException(status_code=404, detail="Active group session with this code not found")

    # Add member if not already in session
    member_exists = any(str(m["user_id"]) == str(current_user.id) for m in session.members)
    if not member_exists:
        session.members.append({
            "user_id": current_user.id,
            "name": current_user.name,
            "joined_at": datetime.utcnow()
        })
        session.updated_at = datetime.utcnow()
        await session.save()
        await broadcast_group_update(session)

    return {"session_id": str(session.id), "code": session.code}


@router.get("/{session_id}")
async def get_group_session(session_id: str, current_user: User = Depends(get_current_user)):
    session = await get_group_session_or_404(session_id)
    # Ensure current user is a member
    if not any(str(m["user_id"]) == str(current_user.id) for m in session.members):
        raise HTTPException(status_code=403, detail="You are not a member of this group session")
    return await broadcast_group_update(session)


@router.post("/{session_id}/item")
async def update_group_item(
    session_id: str, 
    body: UpdateGroupItemBody, 
    current_user: User = Depends(get_current_user)
):
    session = await get_group_session_or_404(session_id)
    if session.status != "open":
        raise HTTPException(status_code=400, detail="Group session is locked or completed")

    # Verify membership
    if not any(str(m["user_id"]) == str(current_user.id) for m in session.members):
        raise HTTPException(status_code=403, detail="You are not a member of this group session")

    menu_item = await MenuItem.get(ObjectId(body.menu_item_id))
    if not menu_item or menu_item.is_deleted:
        raise HTTPException(status_code=404, detail="Menu item not found")
    if not menu_item.is_available:
        raise HTTPException(status_code=400, detail="Item not available")
    if str(menu_item.stall_id) != str(session.stall_id):
        raise HTTPException(status_code=400, detail="Item belongs to a different stall")

    # Generate a unique key for item matching customizations
    custom_delta = sum(cg.get("price_delta", 0) for cg in body.customizations)
    unit_price = (menu_item.discounted_price or menu_item.price) + custom_delta

    # Find existing item added by this user with the same customizations
    item_idx = -1
    for idx, item in enumerate(session.items):
        if (
            str(item["menu_item_id"]) == str(body.menu_item_id)
            and str(item["user_id"]) == str(current_user.id)
            and item["customizations"] == body.customizations
        ):
            item_idx = idx
            break

    if body.qty <= 0:
        if item_idx != -1:
            session.items.pop(item_idx)
    else:
        new_item = {
            "id": f"{current_user.id}_{body.menu_item_id}_{datetime.utcnow().timestamp()}" if item_idx == -1 else session.items[item_idx].get("id"),
            "menu_item_id": menu_item.id,
            "user_id": current_user.id,
            "user_name": current_user.name,
            "name": menu_item.name,
            "qty": body.qty,
            "price": unit_price,
            "customizations": body.customizations,
            "image_url": menu_item.image_url
        }
        if item_idx != -1:
            session.items[item_idx] = new_item
        else:
            session.items.append(new_item)

    session.updated_at = datetime.utcnow()
    await session.save()
    return await broadcast_group_update(session)


@router.put("/{session_id}/payment_method")
async def update_payment_method(
    session_id: str,
    body: UpdatePaymentMethodBody,
    current_user: User = Depends(get_current_user)
):
    session = await get_group_session_or_404(session_id)
    if session.status != "open":
        raise HTTPException(status_code=400, detail="Group session is not open")
    
    # Only host can change payment method
    if str(session.host_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the host can change the payment method")
        
    if body.payment_method not in ("host", "split"):
        raise HTTPException(status_code=400, detail="Invalid payment method")
        
    session.payment_method = body.payment_method
    session.updated_at = datetime.utcnow()
    await session.save()
    return await broadcast_group_update(session)


@router.post("/{session_id}/checkout")
async def checkout_group(
    session_id: str, 
    body: GroupCheckoutBody, 
    current_user: User = Depends(get_current_user)
):
    session = await get_group_session_or_404(session_id)
    if session.status != "open":
        raise HTTPException(status_code=400, detail="Group session is already closed/completed")

    # Only host can trigger checkout
    if str(session.host_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only the host can check out this group session")

    if not session.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    stall = await Stall.get(session.stall_id)
    if not stall or not stall.is_open:
        raise HTTPException(status_code=400, detail="Stall is closed or not found")

    # Calculate individual subtotals
    member_totals = {}
    group_subtotal = 0.0

    for item in session.items:
        user_id_str = str(item["user_id"])
        item_total = item["price"] * item["qty"]
        member_totals[user_id_str] = member_totals.get(user_id_str, 0.0) + item_total
        group_subtotal += item_total

    # ── WALLET BALANCE VERIFICATION ───────────────────────────────────────────
    if body.payment_method == "host":
        # Host pays the entire total
        host_uid = str(session.host_id)
        host_wallet = await get_wallet(host_uid)
        if host_wallet.balance < group_subtotal:
            raise HTTPException(
                status_code=400, 
                detail=f"Host wallet has insufficient balance. Need ₹{group_subtotal:.2f}, has ₹{host_wallet.balance:.2f}"
            )
    elif body.payment_method == "split":
        # Verify all members have enough balance for their respective share
        insufficient_members = []
        for user_id_str, total_owed in member_totals.items():
            wallet = await get_wallet(user_id_str)
            if wallet.balance < total_owed:
                # Find member name
                member_name = next((m["name"] for m in session.members if str(m["user_id"]) == user_id_str), "Unknown")
                insufficient_members.append(f"{member_name} (needs ₹{total_owed - wallet.balance:.2f} more)")
        
        if insufficient_members:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance for members: {', '.join(insufficient_members)}"
            )
    else:
        raise HTTPException(status_code=400, detail="Invalid payment method. Use 'host' or 'split'")

    # ── PLACE ORDER ───────────────────────────────────────────────────────────
    # We construct order_items from the group session items, mapping extra fields (added_by, user_id)
    order_items = []
    for item in session.items:
        order_items.append({
            "menu_item_id": str(item["menu_item_id"]),
            "name": item["name"],
            "price": item["price"],
            "qty": item["qty"],
            "customizations": item["customizations"],
            "subtotal": item["price"] * item["qty"],
            "image_url": item.get("image_url"),
            "added_by": item["user_name"],
            "user_id": str(item["user_id"])
        })

    active_orders = await Order.find(
        Order.stall_id == stall.id,
        Order.status == OrderStatus.placed
    ).count()

    prep_min = min(predict_prep_time(group_subtotal, active_orders), 15)
    now_utc = datetime.utcnow()
    now_local = datetime.now()

    ready_time_utc = now_utc + timedelta(minutes=prep_min)
    ready_time_local = now_local + timedelta(minutes=prep_min)

    slot_start_local = now_local + timedelta(minutes=(active_orders // 10) * 5)
    slot_end_local = slot_start_local + timedelta(minutes=5)

    order = Order(
        user_id=session.host_id,  # Hosted under host's user ID
        stall_id=stall.id,
        phone=current_user.phone,
        items=order_items,
        subtotal=group_subtotal,
        discount=0.0,
        total=group_subtotal,
        status=OrderStatus.placed,
        placed_at=now_utc,
        updated_at=now_utc,
        predicted_prep_min=prep_min,
        estimated_ready_time=ready_time_local.strftime("%H:%M"),
        estimated_ready_iso=ready_time_utc.replace(tzinfo=timezone.utc).isoformat(),
        pickup_slot=f"{slot_start_local.strftime('%H:%M')} – {slot_end_local.strftime('%H:%M')}",
        active_orders_at_placement=active_orders,
        special_instructions=f"Group Order ({session.code}) - {body.payment_method.capitalize()} Pay"
    )
    await order.insert()

    # ── WALLET DEBUCTIONS & TRANSACTIONS ──────────────────────────────────────
    if body.payment_method == "host":
        host_uid = str(session.host_id)
        host_wallet = await get_wallet(host_uid)
        new_bal = host_wallet.balance - group_subtotal
        await host_wallet.update({"$set": {"balance": new_bal, "updated_at": datetime.utcnow()}})
        
        txn = WalletTransaction(
            user_id=host_uid,
            amount=-group_subtotal,
            type="order",
            description=f"Group Order Host Payment ({session.code})",
            balance_after=new_bal,
            order_id=str(order.id)
        )
        await txn.insert()
    else:
        # Split pay: deduct each member's share
        for user_id_str, total_owed in member_totals.items():
            wallet = await get_wallet(user_id_str)
            new_bal = wallet.balance - total_owed
            await wallet.update({"$set": {"balance": new_bal, "updated_at": datetime.utcnow()}})
            
            txn = WalletTransaction(
                user_id=user_id_str,
                amount=-total_owed,
                type="order",
                description=f"Group Order Split share ({session.code})",
                balance_after=new_bal,
                order_id=str(order.id)
            )
            await txn.insert()

    # Complete group session
    session.status = "completed"
    session.order_id = order.id
    session.updated_at = datetime.utcnow()
    await session.save()

    # Notify members via socket
    try:
        await sio.emit("group_checked_out", {"order_id": str(order.id)}, room=f"group_{str(session.id)}")
    except Exception:
        pass

    # Send notifications & trigger metrics
    await stall.update({"$inc": {"total_orders": 1}})
    await notify_order_placed(
        user_id=session.host_id,
        phone=current_user.phone or "",
        order_id=str(order.id),
        stall_name=stall.name,
        prep_min=prep_min
    )

    return {
        "success": True,
        "order_id": str(order.id),
        "tracking_url": f"/track/{order.id}",
        "total": group_subtotal,
        "payment_method": body.payment_method
    }
