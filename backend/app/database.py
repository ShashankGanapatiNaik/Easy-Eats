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
    from app.models.recommendation_analytics import RecommendationAnalytics
    from app.models.group_session import GroupSession
    from app.routes.wallet    import WalletBalance, WalletTransaction

    await init_beanie(
        database=_client[settings.MONGODB_DB_NAME],
        document_models=[User, Stall, MenuItem, Order, Review, OTPVerification, Notification, WalletBalance, WalletTransaction, RecommendationAnalytics, GroupSession],
    )
    logger.info(f"✅ Connected to MongoDB: {settings.MONGODB_DB_NAME}")

    # Auto-seed if database is empty or incomplete
    if not await Stall.find_one() or not await MenuItem.find_one():
        logger.info("⚡ Database is empty or incomplete. Triggering auto-seed...")
        from app.routes.stalls import seed_stalls
        try:
            # Clear stalls and items if partially seeded to prevent duplicates
            await Stall.find().delete()
            await MenuItem.find().delete()
            await seed_stalls()
            logger.info("✅ Auto-seed completed successfully!")
        except Exception as e:
            logger.error(f"❌ Auto-seed failed: {e}")

async def close_db():
    global _client
    if _client:
        _client.close()

def get_client():
    return _client
