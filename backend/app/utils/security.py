#from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from app.core.config import settings
from bson import ObjectId
import bcrypt
#pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Legacy role aliases — handles old tokens with "owner"/"kitchen"
ROLE_ALIASES = { "owner": "stall_owner", "kitchen": "stall_owner" }

def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            hashed.encode("utf-8")
        )
    except Exception:
        return False

def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(days=settings.JWT_EXPIRE_DAYS)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    from app.models.user import User
    payload = decode_token(token)
    user_id = payload.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user id")
    user = await User.get(ObjectId(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    # Normalise legacy roles in memory
    raw_role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    normalised = ROLE_ALIASES.get(raw_role, raw_role)
    user.role = normalised
    return user

def require_role(*roles: str):
    """Accepts both new roles and legacy aliases."""
    expanded = set(roles)
    for alias, canonical in ROLE_ALIASES.items():
        if canonical in roles:
            expanded.add(alias)
    async def checker(current_user=Depends(get_current_user)):
        raw_role = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
        role = ROLE_ALIASES.get(raw_role, raw_role)
        if role not in roles and raw_role not in expanded:
            raise HTTPException(status_code=403, detail=f"Insufficient permissions. Role: {raw_role}")
        return current_user
    return checker
