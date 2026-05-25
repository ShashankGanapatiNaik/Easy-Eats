from beanie import Document, Indexed
from pydantic import Field
from datetime import datetime

class OTPVerification(Document):
    phone: Indexed(str)
    code: str
    verified: bool = False
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "otp_verifications"
        indexes = ["phone", "expires_at"]
