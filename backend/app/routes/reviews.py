from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from bson import ObjectId
from datetime import datetime

from app.models.review import Review
from app.models.stall import Stall
from app.models.order import Order, OrderStatus
from app.models.user import User

from app.utils.security import get_current_user

from app.database import get_client
from app.core.config import settings

router = APIRouter(
    prefix="/reviews",
    tags=["Reviews"]
)

# =========================================================
# REVIEW BODY
# =========================================================

class ReviewBody(BaseModel):

    rating: int = Field(
        ge=1,
        le=5
    )

    comment: Optional[str] = None

    order_id: Optional[str] = None


# =========================================================
# ADD REVIEW
# =========================================================

@router.post("/{stall_id}", status_code=201)
async def add_review(

    stall_id: str,

    body: ReviewBody,

    current_user: User = Depends(
        get_current_user
    ),

):

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
    # VALIDATE ORDER
    # =====================================================

    order_id_obj = None

    if body.order_id:

        order = await Order.get(
            ObjectId(body.order_id)
        )

        if not order:

            raise HTTPException(
                status_code=404,
                detail="Order not found"
            )

        # CHECK USER

        if order.user_id != current_user.id:

            raise HTTPException(
                status_code=403,
                detail="Invalid order"
            )

        # CHECK STATUS

        if order.status != OrderStatus.collected:

            raise HTTPException(
                status_code=400,
                detail="You can review only after order is collected"
            )

        # PREVENT DOUBLE REVIEW

        existing_review = await Review.find_one(

            Review.user_id == current_user.id,

            Review.stall_id == stall.id,

            Review.order_id == order.id,

        )

        if existing_review:

            raise HTTPException(
                status_code=400,
                detail="Already reviewed this order"
            )

        order_id_obj = order.id

    # =====================================================
    # CREATE REVIEW
    # =====================================================

    review = Review(

        stall_id=stall.id,

        user_id=current_user.id,

        order_id=order_id_obj,

        rating=body.rating,

        comment=body.comment,

        created_at=datetime.utcnow()

    )

    await review.insert()

    # =====================================================
    # FETCH ALL REVIEWS
    # =====================================================

    reviews = await Review.find(

        Review.stall_id == stall.id

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
    # UPDATE STALL
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
    # MARK ORDER REVIEWED
    # =====================================================

    if body.order_id:

        await order.update({

            "$set": {

                "review_submitted": True

            }

        })

    # =====================================================
    # RESPONSE
    # =====================================================

    from app.services.redis_service import invalidate_cache
    await invalidate_cache(f"stall:menu:{stall_id}")

    return {

        "message":
            "Review submitted successfully",

        "review_id":
            str(review.id),

        "avg_rating":
            avg_rating,

        "total_ratings":
            total_reviews

    }


# =========================================================
# GET REVIEWS
# =========================================================

@router.get("/{stall_id}")
async def get_reviews(

    stall_id: str,

    skip: int = 0,

    limit: int = 20,

):

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
    # FETCH REVIEWS FROM MONGODB
    # =====================================================

    reviews = await Review.find(

        Review.stall_id == ObjectId(stall_id)

    ).sort(

        -Review.created_at

    ).skip(

        skip

    ).limit(

        limit

    ).to_list()

    # =====================================================
    # FORMAT REVIEWS
    # =====================================================

    response = []

    for review in reviews:

        user = await User.get(
            review.user_id
        )

        response.append({

            "id":
                str(review.id),

            "user_id":
                str(review.user_id),

            "user_name":

                user.full_name
                if user else "User",

            "rating":
                review.rating,

            "comment":
                review.comment,

            "created_at":

                review.created_at.isoformat()

        })

    # =====================================================
    # RETURN RESPONSE
    # =====================================================

    return {

        "stall_id":
            stall_id,

        "stall_name":
            stall.name,

        "avg_rating":
            stall.avg_rating,

        "total_ratings":
            stall.total_ratings,

        "reviews":
            response

    }