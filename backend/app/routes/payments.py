import hmac
import hashlib
import razorpay
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.core.config import settings
from app.utils.security import get_current_user

router = APIRouter(prefix="/payments", tags=["Payments"])

rzp_client = razorpay.Client(
    auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
)


class CreateOrderBody(BaseModel):
    amount: int   # in ₹


class VerifyBody(BaseModel):
    razorpay_order_id:   str
    razorpay_payment_id: str
    razorpay_signature:  str


@router.post("/create-order")
async def create_order(
    body: CreateOrderBody,
    current_user=Depends(get_current_user),
):
    try:
        order = rzp_client.order.create({
            "amount":          body.amount * 100,   # ₹ → paise
            "currency":        "INR",
            "payment_capture": 1,
        })
        return {
            "razorpay_order_id": order["id"],
            "amount":            order["amount"],
            "key":               settings.RAZORPAY_KEY_ID,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Razorpay error: {str(e)}")


@router.post("/verify")
async def verify_payment(
    body: VerifyBody,
    current_user=Depends(get_current_user),
):
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if expected != body.razorpay_signature:
        raise HTTPException(
            status_code=400,
            detail="Payment verification failed. Invalid signature."
        )

    return {"verified": True, "payment_id": body.razorpay_payment_id}