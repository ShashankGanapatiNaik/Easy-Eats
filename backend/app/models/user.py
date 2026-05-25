from beanie import Document, Indexed
from pydantic import EmailStr, Field
from datetime import datetime
from typing import Optional
from enum import Enum

class UserRole(str, Enum):
    student     = "student"
    stall_owner = "stall_owner"
    admin       = "admin"

class User(Document):
    name:       str
    email:      Indexed(EmailStr, unique=True)  # type: ignore
    password:   str
    role:       UserRole = UserRole.student
    phone:      Optional[str] = None
    stall_name: Optional[str] = None
    stall_id:   Optional[str] = None
    avatar_url: Optional[str] = None
    is_active:  bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name    = "users"
        indexes = ["email", "role"]
