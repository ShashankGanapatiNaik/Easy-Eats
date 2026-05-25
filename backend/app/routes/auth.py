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
from app.utils.security import hash_password, verify_password, create_token, get_current_user
from app.services.sms_service import send_sms

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])

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

class VerifyOTPBody(BaseModel):
    phone: str
    code: str

class UpdateProfileBody(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    firebase_token: Optional[str] = None

def make_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9\s-]", "", name.lower().strip())
    slug = re.sub(r"\s+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-") or "stall"

@router.post("/register", status_code=201)
async def register(body: RegisterBody):
    if await User.find_one(User.email == body.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if body.role == UserRole.stall_owner and not body.stall_name:
        raise HTTPException(status_code=400, detail="Stall name is required")

    if body.role == UserRole.student:
        if not body.phone:
            raise HTTPException(status_code=400, detail="Phone number is required for student registration")
        
        clean_phone = body.phone.replace("+91", "").replace(" ", "").replace("-", "").strip()
        if not clean_phone.isdigit() or len(clean_phone) != 10 or not clean_phone.startswith(("6", "7", "8", "9")):
            raise HTTPException(status_code=400, detail="Invalid Indian phone number. Must be a 10-digit number.")
            
        # Verify using Firebase if token is provided, else standard OTP verification
        if body.firebase_token:
            from app.services.firebase_service import verify_firebase_token
            await verify_firebase_token(body.firebase_token, body.phone)
            # Create a verified OTPVerification record to satisfy any other internal checks
            verification = await OTPVerification.find_one(OTPVerification.phone == body.phone)
            if verification:
                verification.verified = True
                verification.expires_at = datetime.utcnow() + timedelta(minutes=15)
                await verification.save()
            else:
                verification = OTPVerification(
                    phone=body.phone,
                    code="FIREBASE",
                    verified=True,
                    expires_at=datetime.utcnow() + timedelta(minutes=15)
                )
                await verification.insert()
        else:
            verification = await OTPVerification.find_one(
                OTPVerification.phone == body.phone,
                OTPVerification.verified == True,
                OTPVerification.expires_at > datetime.utcnow()
            )
            if not verification:
                raise HTTPException(status_code=400, detail="Phone number not verified. Please verify using OTP first.")

    user = User(
        name=body.name, email=body.email,
        password=hash_password(body.password),
        role=body.role, phone=body.phone, stall_name=body.stall_name,
    )
    await user.insert()

    stall_id = None
    if body.role == UserRole.stall_owner:
        base_slug = make_slug(body.stall_name)
        slug, counter = base_slug, 1
        while await Stall.find_one(Stall.slug == slug):
            slug = f"{base_slug}-{counter}"; counter += 1

        stall = Stall(
            owner_id=user.id, name=body.stall_name, slug=slug,
            description=f"Welcome to {body.stall_name}!",
            cuisine_type=StallCategory.other,
            menu_categories=["Popular", "All"],
            is_open=False, location_label="Campus",
            estimated_pickup_min=10,
        )
        await stall.insert()
        stall_id = str(stall.id)
        await user.update({"$set": {"stall_id": stall_id, "stall_name": body.stall_name, "updated_at": datetime.utcnow()}})

    return {"message": "Registered successfully", "id": str(user.id), "stall_id": stall_id}

@router.post("/login")
async def login(body: LoginBody):
    user = await User.find_one(User.email == body.email)
    if not user or not verify_password(body.password, user.password):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    stall_id   = user.stall_id
    stall_name = user.stall_name

    # Always look up stall by owner_id for stall owners (handles missing stall_id)
    role_str = user.role.value if hasattr(user.role, 'value') else str(user.role)
    if role_str in ("stall_owner", "owner"):
        stall = await Stall.find_one(Stall.owner_id == user.id)
        if stall:
            stall_id   = str(stall.id)
            stall_name = stall.name
            if not user.stall_id:
                await user.update({"$set": {"stall_id": stall_id, "stall_name": stall_name, "updated_at": datetime.utcnow()}})

    token = create_token({"id": str(user.id), "role": role_str})
    return {
        "token": token,
        "user": {
            "id":         str(user.id),
            "name":       user.name,
            "email":      user.email,
            "phone":      user.phone,
            "role":       "stall_owner" if role_str in ("owner","stall_owner") else role_str,
            "stall_name": stall_name,
            "stall_id":   stall_id,
        },
    }

@router.post("/otp/send")
async def send_otp(body: SendOTPBody):
    phone = body.phone.strip()
    
    # Validate Indian phone number format
    clean_phone = phone.replace("+91", "").replace(" ", "").replace("-", "").strip()
    if not clean_phone.isdigit() or len(clean_phone) != 10 or not clean_phone.startswith(("6", "7", "8", "9")):
        raise HTTPException(status_code=400, detail="Invalid Indian phone number. Must be 10 digits starting with 6-9.")
    
    now = datetime.utcnow()
    
    # Cooldown check: 60 seconds
    recent_otp = await OTPVerification.find_one(
        OTPVerification.phone == phone,
        OTPVerification.created_at > now - timedelta(seconds=60)
    )
    if recent_otp:
        raise HTTPException(status_code=429, detail="Please wait 60 seconds before requesting another OTP.")
        
    # Rate limit check: max 5 requests per hour
    hourly_otps = await OTPVerification.find(
        OTPVerification.phone == phone,
        OTPVerification.created_at > now - timedelta(hours=1)
    ).count()
    if hourly_otps >= 5:
        raise HTTPException(status_code=429, detail="Maximum OTP requests exceeded. Please try again in an hour.")
        
    # Generate 6-digit code
    code = f"{random.randint(100000, 999999)}"
    
    expires_at = now + timedelta(minutes=5)
    verification = OTPVerification(
        phone=phone,
        code=code,
        verified=False,
        expires_at=expires_at
    )
    await verification.insert()
    
    # Trigger SMS
    sms_text = f"Easy Eats 🍔\n\nYour verification code is: {code}. Valid for 5 minutes."
    sms_success = await send_sms(phone, sms_text)
    
    # Dev Terminal fallback
    print(f"\n[SMS OTP] Sent OTP code {code} to {phone} (SMS Status: {'Sent' if sms_success else 'Skipped/Failed'})\n")
    logger.info(f"[SMS OTP] Sent OTP code {code} to {phone}")
    
    return {
        "message": "OTP sent successfully",
        "phone": phone,
        "dev_otp_logged": True if not sms_success else False
    }

@router.post("/otp/verify")
async def verify_otp(body: VerifyOTPBody):
    phone = body.phone.strip()
    code = body.code.strip()
    
    now = datetime.utcnow()
    # Find latest verification for this phone number
    verification = await OTPVerification.find(
        OTPVerification.phone == phone,
        OTPVerification.code == code,
        OTPVerification.expires_at > now,
        OTPVerification.verified == False
    ).sort(-OTPVerification.created_at).first_or_none()
    
    if not verification:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
        
    # Mark verified and extend window for registration/profile update
    verification.verified = True
    verification.expires_at = now + timedelta(minutes=15) # 15 minutes window
    await verification.save()
    
    return {"message": "OTP verified successfully", "phone": phone}

@router.put("/profile")
async def update_profile(
    body: UpdateProfileBody,
    current_user: User = Depends(get_current_user)
):
    update_data = {}
    
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty.")
        update_data["name"] = name
        
    if body.phone is not None:
        phone = body.phone.strip()
        if phone != current_user.phone:
            # Verify using Firebase if token is provided, else standard OTP verification
            if body.firebase_token:
                from app.services.firebase_service import verify_firebase_token
                await verify_firebase_token(body.firebase_token, phone)
                # Create a verified OTPVerification record to satisfy any other internal checks
                verification = await OTPVerification.find_one(OTPVerification.phone == phone)
                if verification:
                    verification.verified = True
                    verification.expires_at = datetime.utcnow() + timedelta(minutes=15)
                    await verification.save()
                else:
                    verification = OTPVerification(
                        phone=phone,
                        code="FIREBASE",
                        verified=True,
                        expires_at=datetime.utcnow() + timedelta(minutes=15)
                    )
                    await verification.insert()
            else:
                # Check if this phone number is verified via OTP
                verification = await OTPVerification.find_one(
                    OTPVerification.phone == phone,
                    OTPVerification.verified == True,
                    OTPVerification.expires_at > datetime.utcnow()
                )
                if not verification:
                    raise HTTPException(status_code=400, detail="New phone number must be verified via OTP first.")
            update_data["phone"] = phone
            
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await current_user.update({"$set": update_data})
        
    role_str = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    return {
        "message": "Profile updated successfully",
        "user": {
            "id":         str(current_user.id),
            "name":       current_user.name,
            "email":      current_user.email,
            "role":       "stall_owner" if role_str in ("owner","stall_owner") else role_str,
            "phone":      current_user.phone,
            "stall_name": current_user.stall_name,
            "stall_id":   current_user.stall_id,
        }
    }
