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
    from app.models.college   import College
    from app.routes.wallet    import WalletBalance, WalletTransaction

    await init_beanie(
        database=_client[settings.MONGODB_DB_NAME],
        document_models=[User, Stall, MenuItem, Order, Review, OTPVerification, Notification, WalletBalance, WalletTransaction, RecommendationAnalytics, GroupSession, College],
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

    # Ensure default Admin user and Student user exist
    try:
        from app.models.user import User, UserRole
        from app.utils.security import hash_password

        admin_user = await User.find_one(User.role == UserRole.admin)
        if not admin_user:
            admin_user = User(
                name="System Admin",
                email="admin@easyeats.com",
                password=hash_password("adminpass"),
                role=UserRole.admin,
                phone="9999999999",
                college_name="REVA University"
            )
            await admin_user.insert()
            logger.info("✅ Auto-seeded Admin user: admin@easyeats.com / adminpass")

        demo_student = await User.find_one(User.email == "student@reva.edu.in")
        if not demo_student:
            demo_student = User(
                name="Demo Student",
                email="student@reva.edu.in",
                password=hash_password("studentpass"),
                role=UserRole.student,
                phone="9876543210",
                college_name="REVA University"
            )
            await demo_student.insert()
            logger.info("✅ Auto-seeded Student user: student@reva.edu.in / studentpass")

    except Exception as e:
        logger.error(f"❌ Failed to seed users: {e}")

    # Ensure REVA University exists & holds all existing 4 hotels
    try:
        reva_college = await College.find_one(College.name == "REVA University")
        all_stalls = await Stall.find().to_list()
        all_stall_ids = [str(s.id) for s in all_stalls]

        if not reva_college:
            reva_college = College(
                name="REVA University",
                domain="@reva.edu.in",
                hotel_ids=all_stall_ids
            )
            await reva_college.insert()
            logger.info(f"✅ Auto-created REVA University college with {len(all_stall_ids)} existing hotels")
        else:
            # Update hotel_ids if empty
            if not reva_college.hotel_ids and all_stall_ids:
                reva_college.hotel_ids = all_stall_ids
                await reva_college.save()
                logger.info(f"✅ Updated REVA University with existing hotel IDs: {all_stall_ids}")
    except Exception as e:
        logger.error(f"❌ Failed to check/seed REVA University college: {e}")

async def close_db():
    global _client
    if _client:
        _client.close()

def get_client():
    return _client
