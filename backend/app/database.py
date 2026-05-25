from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)
_client = None

async def connect_db():
    global _client
    _client = AsyncIOMotorClient(settings.MONGODB_URI, maxPoolSize=20, minPoolSize=2, serverSelectionTimeoutMS=5000)

    from app.models.user      import User
    from app.models.stall     import Stall
    from app.models.menu_item import MenuItem
    from app.models.order     import Order
    from app.models.review    import Review
    from app.models.otp_verification import OTPVerification
    from app.models.notification import Notification
    from app.routes.wallet    import WalletBalance, WalletTransaction

    await init_beanie(
        database=_client[settings.MONGODB_DB_NAME],
        document_models=[User, Stall, MenuItem, Order, Review, OTPVerification, Notification, WalletBalance, WalletTransaction],
    )
    logger.info(f"✅ Connected to MongoDB: {settings.MONGODB_DB_NAME}")

async def close_db():
    global _client
    if _client:
        _client.close()

def get_client():
    return _client
