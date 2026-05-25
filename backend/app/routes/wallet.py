# backend/app/routes/wallet.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from beanie import Document
from datetime import datetime
from typing import Optional
from bson import ObjectId

from app.utils.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/wallet", tags=["Wallet"])


# ── Beanie Documents ──────────────────────────────────────────────────────────

class WalletBalance(Document):
    user_id:    str          # store as string to avoid ObjectId schema issues
    balance:    float = 0.0
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name    = "wallet_balances"
        indexes = ["user_id"]


class WalletTransaction(Document):
    user_id:       str
    amount:        float        # positive = credit, negative = debit
    type:          str          # "topup" | "order" | "refund"
    description:   str
    balance_after: float
    order_id:      Optional[str] = None
    created_at:    datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name    = "wallet_transactions"
        indexes = ["user_id", [("user_id", 1), ("created_at", -1)]]


# ── Request schemas ───────────────────────────────────────────────────────────

class TopUpBody(BaseModel):
    amount: float

class DeductBody(BaseModel):
    amount:      float
    description: str
    order_id:    Optional[str] = None


# ── Helper ────────────────────────────────────────────────────────────────────

async def get_wallet(user_id: str) -> WalletBalance:
    wallet = await WalletBalance.find_one(WalletBalance.user_id == user_id)
    if not wallet:
        wallet = WalletBalance(user_id=user_id, balance=0.0)
        await wallet.insert()
    return wallet


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/balance")
async def get_balance(current_user: User = Depends(get_current_user)):
    uid    = str(current_user.id)
    wallet = await get_wallet(uid)
    return {"balance": wallet.balance, "user_id": uid, "user_name": current_user.name}


@router.post("/topup")
async def top_up(body: TopUpBody, current_user: User = Depends(get_current_user)):
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    if body.amount > 10000:
        raise HTTPException(400, "Max top-up is ₹10,000")

    uid    = str(current_user.id)
    wallet = await get_wallet(uid)
    new_bal = wallet.balance + body.amount
    await wallet.update({"$set": {"balance": new_bal, "updated_at": datetime.utcnow()}})

    txn = WalletTransaction(
        user_id       = uid,
        amount        = body.amount,
        type          = "topup",
        description   = f"Wallet top-up ₹{body.amount:.0f}",
        balance_after = new_bal,
    )
    await txn.insert()
    return {"message": f"₹{body.amount:.0f} added", "balance": new_bal}


@router.post("/deduct")
async def deduct(body: DeductBody, current_user: User = Depends(get_current_user)):
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be positive")

    uid    = str(current_user.id)
    wallet = await get_wallet(uid)
    if wallet.balance < body.amount:
        raise HTTPException(
            400,
            f"Insufficient balance. Have ₹{wallet.balance:.0f}, need ₹{body.amount:.0f}"
        )

    new_bal = wallet.balance - body.amount
    await wallet.update({"$set": {"balance": new_bal, "updated_at": datetime.utcnow()}})

    txn = WalletTransaction(
        user_id       = uid,
        amount        = -body.amount,
        type          = "order",
        description   = body.description,
        balance_after = new_bal,
        order_id      = body.order_id,
    )
    await txn.insert()
    return {"message": "Payment successful", "deducted": body.amount, "balance": new_bal}


@router.get("/transactions")
async def get_transactions(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
):
    uid  = str(current_user.id)
    txns = await WalletTransaction.find(
        WalletTransaction.user_id == uid
    ).sort(-WalletTransaction.created_at).limit(limit).to_list()

    return [
        {
            "id":            str(t.id),
            "amount":        t.amount,
            "type":          t.type,
            "description":   t.description,
            "balance_after": t.balance_after,
            "order_id":      t.order_id,
            "created_at":    t.created_at.isoformat(),
        }
        for t in txns
    ]