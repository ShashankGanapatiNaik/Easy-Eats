"""
Admin Routes — platform-wide management
GET  /admin/users                 → list all users
PUT  /admin/users/{id}/deactivate → deactivate user
PUT  /admin/users/{id}/role       → change user role
GET  /admin/stats                 → platform statistics
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime

from app.models.user import User, UserRole
from app.models.stall import Stall
from app.models.order import Order
from app.utils.security import require_role

router = APIRouter(prefix="/admin", tags=["Admin"])


class RoleBody(BaseModel):
    role: UserRole


@router.get("/users")
async def list_users(
    skip: int = 0,
    limit: int = 100,
    _=Depends(require_role("admin")),
):
    users = await User.find_all().skip(skip).limit(limit).to_list()
    return [
        {
            "id":        str(u.id),
            "name":      u.name,
            "email":     u.email,
            "role":      u.role,
            "phone":     u.phone,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@router.put("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    _=Depends(require_role("admin")),
):
    user = await User.get(ObjectId(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await user.update({"$set": {"is_active": False, "updated_at": datetime.utcnow()}})
    return {"message": "User deactivated"}


@router.put("/users/{user_id}/role")
async def change_role(
    user_id: str,
    body: RoleBody,
    _=Depends(require_role("admin")),
):
    user = await User.get(ObjectId(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await user.update({"$set": {"role": body.role, "updated_at": datetime.utcnow()}})
    return {"message": f"Role updated to {body.role}"}


@router.get("/stats")
async def platform_stats(_=Depends(require_role("admin"))):
    """Aggregated platform statistics."""
    total_users  = await User.count()
    total_stalls = await Stall.count()
    open_stalls  = await Stall.find(Stall.is_open == True).count()
    total_orders = await Order.count()

    # Revenue from all non-cancelled orders
    from app.database import get_client
    from app.core.config import settings
    db = get_client()[settings.MONGODB_DB_NAME]

    revenue_result = await db.orders.aggregate([
        {"$match": {"status": {"$ne": "Cancelled"}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]).to_list(1)

    total_revenue = revenue_result[0]["total"] if revenue_result else 0

    return {
        "total_users":   total_users,
        "total_stalls":  total_stalls,
        "open_stalls":   open_stalls,
        "total_orders":  total_orders,
        "total_revenue": total_revenue,
    }
