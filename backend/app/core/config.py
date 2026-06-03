from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    # MongoDB
    MONGODB_URI: str
    MONGODB_DB_NAME: str = "easy_eats"

    # JWT
    JWT_SECRET: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7

    # AI Provider (Groq is 100% Free and extremely fast)
    GROQ_API_KEY: str | None = None
    
    # Legacy keys (kept so pydantic doesn't crash if they are in .env)
    GEMINI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None

    # Razorpay
    RAZORPAY_KEY_ID: str
    RAZORPAY_KEY_SECRET: str
    # SMS — Fast2SMS (free for India)
    # 1. Go to https://fast2sms.com
    # 2. Sign up free → Dev API → copy your API key
    # 3. Paste below or in backend/.env as FAST2SMS_API_KEY=your_key
    FAST2SMS_API_KEY: str = "3wxlpMXgnetIYNmZJDfEh96CsR0oq7iz8WUjrOTAPVLyQaSkdcoLjczROmTWluGQ4f8H19gPF273etYw"
    
    # MSG91 SMS Settings
    MSG91_API_KEY: str | None = None
    MSG91_SENDER_ID: str | None = None
    MSG91_TEMPLATE_ID: str | None = None

    # Twilio SMS Settings
    TWILIO_ACCOUNT_SID: str | None = None
    TWILIO_AUTH_TOKEN: str | None = None
    TWILIO_FROM_NUMBER: str | None = None

    # Firebase Settings
    FIREBASE_PROJECT_ID: str | None = None

    # Gmail SMTP Settings
    MAIL_USERNAME: str = "easyeatsproject@gmail.com"
    MAIL_PASSWORD: str = "CHANGE_ME"
    MAIL_FROM: str = "easyeatsproject@gmail.com"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False

    # App
    APP_NAME: str = "Easy Eats API"
    DEBUG: bool = False
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://easy-eats-sigma.vercel.app",
    ]

    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()