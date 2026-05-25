"""
Reviews Routes
POST /reviews/{stall_id}   → submit review (student, once per order)
GET  /reviews/{stall_id}   → list reviews for stall
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from bson import ObjectId
from datetime import datetime

from app.models.review import Review
from app.models.stall  import Stall
from app.models.order  import Order, OrderStatus
from app.models.user   import User
from app.utils.security import get_current_user
from app.database import get_client
from app.core.config import settings

router = APIRouter(prefix="/reviews", tags=["Reviews"])


class ReviewBody(BaseModel):
    rating:   int     = Field(ge=1, le=5)
    comment:  Optional[str] = None
    order_id: Optional[str] = None


@router.post("/{stall_id}", status_code=201)
async def add_review(
    stall_id: str,
    body: ReviewBody,
    current_user: User = Depends(get_current_user),
):
    stall = await Stall.get(ObjectId(stall_id))
    if not stall:
        raise HTTPException(status_code=404, detail="Stall not found")

    order_id_obj = None
    if body.order_id:
        order = await Order.get(ObjectId(body.order_id))
        if not order or order.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Invalid order")
        if order.status != OrderStatus.collected:
            raise HTTPException(status_code=400, detail="Can only review after order is collected")
        # Prevent double review for same order
        existing = await Review.find_one(
            Review.user_id == current_user.id,
            Review.stall_id == stall.id,
            Review.order_id == order.id,
        )
        if existing:
            raise HTTPException(status_code=400, detail="Already reviewed this order")
        order_id_obj = order.id

    review = Review(
        stall_id=stall.id,
        user_id=current_user.id,
        order_id=order_id_obj,
        rating=body.rating,
        comment=body.comment,
    )
    await review.insert()

    # Recalculate avg_rating on stall via aggregation pipeline
    db = get_client()[settings.MONGODB_DB_NAME]
    agg = await db.reviews.aggregate([
        {"$match": {"stall_id": stall.id}},
        {"$group": {
            "_id":   None,
            "avg":   {"$avg": "$rating"},
            "count": {"$sum": 1},
        }},
    ]).to_list(1)

    if agg:
        await stall.update({"$set": {
            "avg_rating":    round(agg[0]["avg"], 1),
            "total_ratings": agg[0]["count"],
            "updated_at":    datetime.utcnow(),
        }})

    return {"message": "Review submitted", "id": str(review.id)}


@router.get("/{stall_id}")
async def get_reviews(
    stall_id: str,
    skip: int = 0,
    limit: int = 20,
):
    reviews = await Review.find(
        Review.stall_id == ObjectId(stall_id),
    ).sort(-Review.created_at).skip(skip).limit(limit).to_list()

    return [
        {
            "id":         str(r.id),
            "user_id":    str(r.user_id),
            "rating":     r.rating,
            "comment":    r.comment,
            "created_at": r.created_at.isoformat(),
        }
        for r in reviews
    ]
