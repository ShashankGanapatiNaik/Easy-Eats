from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
import re
import random
import logging

from app.models.user import User, UserRole
from app.models.stall import Stall, StallCategory
from app.models.otp_verification import OTPVerification

from app.utils.security import (
    hash_password,
    verify_password,
    create_token,
    get_current_user
)

from app.services.sms_service import send_sms
from app.services.email_service import send_email, get_otp_html

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Auth"]
)

# ─────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────

class RegisterBody(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.student
    phone: Optional[str] = None
    stall_name: Optional[str] = None
    firebase_token: Optional[str] = None


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class SendOTPBody(BaseModel):
    phone: str
    email: Optional[EmailStr] = None


class VerifyOTPBody(BaseModel):
    phone: str
    code: str
    email: Optional[EmailStr] = None


class UpdateProfileBody(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    firebase_token: Optional[str] = None


class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ResetPasswordBody(BaseModel):
    email: EmailStr
    otp: str
    new_password: str


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def make_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9\s-]", "", name.lower().strip())
    slug = re.sub(r"\s+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-") or "stall"


def validate_and_clean_phone(phone: str) -> str:
    # Remove spaces, dashes, parentheses
    cleaned = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "").strip()
    
    # Check if it has a country code prefix
    if cleaned.startswith("+91"):
        indian_part = cleaned[3:]
        if not indian_part.isdigit() or len(indian_part) != 10 or not indian_part.startswith(("6", "7", "8", "9")):
            raise HTTPException(status_code=400, detail="Invalid Indian phone number")
        return cleaned
    elif cleaned.startswith("91") and len(cleaned) == 12:
        indian_part = cleaned[2:]
        if not indian_part.isdigit() or not indian_part.startswith(("6", "7", "8", "9")):
            raise HTTPException(status_code=400, detail="Invalid Indian phone number")
        return "+" + cleaned
    
    # If it is a local 10-digit number without country code, assume India (+91)
    if len(cleaned) == 10 and cleaned.isdigit() and cleaned.startswith(("6", "7", "8", "9")):
        return "+91" + cleaned
        
    # Support other country codes allowed by frontend (+1, +44, +971, etc.)
    if cleaned.startswith("+"):
        digits_only = cleaned[1:]
        if digits_only.isdigit() and 7 <= len(digits_only) <= 15:
            return cleaned
            
    # Fallback/invalid
    raise HTTPException(status_code=400, detail="Invalid phone number format")


# ─────────────────────────────────────────────
# REGISTER
# ─────────────────────────────────────────────

@router.post("/register", status_code=201)
async def register(body: RegisterBody):

    if await User.find_one(User.email == body.email):
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    if body.role == UserRole.stall_owner and not body.stall_name:
        raise HTTPException(
            status_code=400,
            detail="Stall name is required"
        )

    if body.role == UserRole.student:

        if not body.phone:
            raise HTTPException(
                status_code=400,
                detail="Phone number is required"
            )

        body.phone = validate_and_clean_phone(body.phone)

        verification = await OTPVerification.find_one(
            OTPVerification.phone == body.phone,
            OTPVerification.verified == True,
            OTPVerification.expires_at > datetime.utcnow()
        )

        if not verification:
            raise HTTPException(
                status_code=400,
                detail="Phone number not verified"
            )

    user = User(
        name=body.name,
        email=body.email,
        password=hash_password(body.password),
        role=body.role,
        phone=body.phone,
        stall_name=body.stall_name,
    )

    await user.insert()

    stall_id = None

    if body.role == UserRole.stall_owner:

        base_slug = make_slug(body.stall_name)

        slug = base_slug
        counter = 1

        while await Stall.find_one(Stall.slug == slug):
            slug = f"{base_slug}-{counter}"
            counter += 1

        stall = Stall(
            owner_id=user.id,
            name=body.stall_name,
            slug=slug,
            description=f"Welcome to {body.stall_name}!",
            cuisine_type=StallCategory.other,
            menu_categories=["Popular", "All"],
            is_open=False,
            location_label="Campus",
            estimated_pickup_min=10,
        )

        await stall.insert()

        stall_id = str(stall.id)

        await user.update({
            "$set": {
                "stall_id": stall_id,
                "stall_name": body.stall_name,
                "updated_at": datetime.utcnow()
            }
        })

    return {
        "message": "Registered successfully",
        "id": str(user.id),
        "stall_id": stall_id
    }


# ─────────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginBody):

    user = await User.find_one(
        User.email == body.email
    )

    if not user or not verify_password(
        body.password,
        user.password
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid email or password"
        )

    role_str = (
        user.role.value
        if hasattr(user.role, "value")
        else str(user.role)
    )

    token = create_token({
        "id": str(user.id),
        "role": role_str
    })

    return {
        "token": token,
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "role": role_str,
            "stall_name": user.stall_name,
            "stall_id": user.stall_id,
        },
    }


# ─────────────────────────────────────────────
# PHONE OTP
# ─────────────────────────────────────────────

@router.post("/otp/send")
async def send_otp(body: SendOTPBody):

    phone = validate_and_clean_phone(body.phone)
    body.phone = phone

    code = str(random.randint(100000, 999999))

    verification = OTPVerification(
        phone=phone,
        code=code,
        verified=False,
        expires_at=datetime.utcnow() + timedelta(minutes=5)
    )

    await verification.insert()

    # Send via Email if provided
    if body.email:
        print(f"OTP GENERATED: {code}")
        print(f"EMAIL: {body.email}")

        success = await send_email(
            to_email=body.email,
            subject="Easy Eats OTP Verification",
            body=f"Hello from Easy Eats 🍔\n\nYour verification OTP is:\n\n{code}\n\nThis OTP expires in 5 minutes.",
            html_body=get_otp_html(code)
        )

        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to send OTP email"
            )
    else:
        # Fallback to SMS if no email is provided
        sms_text = f"Easy Eats OTP: {code}"
        await send_sms(phone, sms_text)

    return {
        "message": "OTP sent successfully",
        "phone": phone
    }


@router.post("/otp/verify")
async def verify_otp(body: VerifyOTPBody):

    phone = body.phone.strip()
    code = body.code.strip()

    verification = await OTPVerification.find_one(
        OTPVerification.phone == phone,
        OTPVerification.code == code,
        OTPVerification.verified == False,
        OTPVerification.expires_at > datetime.utcnow()
    )

    if not verification:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OTP"
        )

    verification.verified = True

    verification.expires_at = (
        datetime.utcnow() + timedelta(minutes=15)
    )

    await verification.save()

    return {
        "message": "OTP verified successfully",
        "phone": phone
    }


# ─────────────────────────────────────────────
# FORGOT PASSWORD
# ─────────────────────────────────────────────

@router.post("/forgot-password/send")
async def forgot_password_send(
    body: ForgotPasswordBody
):

    user = await User.find_one(
        User.email == body.email
    )

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Email not registered"
        )

    otp = str(random.randint(100000, 999999))

    verification = OTPVerification(
        phone=body.email,
        code=otp,
        verified=False,
        expires_at=datetime.utcnow() + timedelta(minutes=5)
    )

    await verification.insert()

    # Send reset OTP code via Email
    print(f"PASSWORD RESET OTP: {otp}")
    print(f"EMAIL: {body.email}")

    success = await send_email(
        to_email=body.email,
        subject="Easy Eats OTP Verification",
        body=f"Hello from Easy Eats 🍔\n\nYour verification OTP is:\n\n{otp}\n\nThis OTP expires in 5 minutes.",
        html_body=get_otp_html(otp)
    )

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to send reset password email"
        )

    return {
        "message": "OTP generated successfully"
    }


@router.post("/forgot-password/verify")
async def forgot_password_verify(
    body: ResetPasswordBody
):

    verification = await OTPVerification.find_one(
        OTPVerification.phone == body.email,
        OTPVerification.code == body.otp,
        OTPVerification.verified == False,
        OTPVerification.expires_at > datetime.utcnow()
    )

    if not verification:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OTP"
        )

    user = await User.find_one(
        User.email == body.email
    )

    if not user:
        raise HTTPException(
            status_code=400,
            detail="User not found"
        )

    user.password = hash_password(
        body.new_password
    )

    await user.save()

    verification.verified = True

    await verification.save()

    return {
        "message": "Password reset successful"
    }


# ─────────────────────────────────────────────
# PROFILE
# ─────────────────────────────────────────────

@router.put("/profile")
async def update_profile(
    body: UpdateProfileBody,
    current_user: User = Depends(get_current_user)
):

    update_data = {}

    if body.name is not None:

        name = body.name.strip()

        if not name:
            raise HTTPException(
                status_code=400,
                detail="Name cannot be empty"
            )

        update_data["name"] = name

    if body.phone is not None:

        phone = body.phone.strip()

        if phone != current_user.phone:

            update_data["phone"] = phone

    if update_data:

        update_data["updated_at"] = datetime.utcnow()

        await current_user.update({
            "$set": update_data
        })

    role_str = (
        current_user.role.value
        if hasattr(current_user.role, "value")
        else str(current_user.role)
    )

    return {
        "message": "Profile updated successfully",
        "user": {
            "id": str(current_user.id),
            "name": current_user.name,
            "email": current_user.email,
            "role": role_str,
            "phone": current_user.phone,
            "stall_name": current_user.stall_name,
            "stall_id": current_user.stall_id,
        }
    }