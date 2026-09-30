import asyncio
import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_script")

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.database import connect_db, close_db
from app.models.user import User, UserRole
from app.models.stall import Stall
from app.models.college import College
from app.routes.stalls import seed_stalls
from app.utils.security import hash_password

async def seed():
    logger.info("Connecting to DB...")
    await connect_db()
    
    # 1. Seed Stalls if missing
    stalls = await Stall.find().to_list()
    if not stalls:
        logger.info("Seeding stalls...")
        await seed_stalls()
        stalls = await Stall.find().to_list()
    
    # 2. Seed Admin user
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
        logger.info("Created Admin User: admin@easyeats.com / adminpass")
    else:
        logger.info(f"Admin User exists: {admin_user.email}")

    # 3. Seed Demo Student user
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
        logger.info("Created Demo Student: student@reva.edu.in / studentpass")
    else:
        logger.info(f"Student User exists: {demo_student.email}")

    # 4. Seed Hotel Stall Owners with linked stall_id and stall_name
    for s in stalls:
        stall_id_str = str(s.id)
        owner_email = f"owner.{s.slug}@easyeats.com"
        
        # Check if owner already exists by ID or email
        owner_user = None
        if s.owner_id:
            owner_user = await User.get(s.owner_id)
        if not owner_user:
            owner_user = await User.find_one(User.email == owner_email)
            
        if not owner_user:
            owner_user = User(
                name=f"{s.name} Owner",
                email=owner_email,
                password=hash_password("ownerpass"),
                role=UserRole.stall_owner,
                stall_id=stall_id_str,
                stall_name=s.name,
                college_name="REVA University"
            )
            await owner_user.insert()
            s.owner_id = owner_user.id
            await s.save()
            logger.info(f"Created Hotel Stall Owner for '{s.name}': {owner_email} / ownerpass")
        else:
            owner_user.stall_id = stall_id_str
            owner_user.stall_name = s.name
            await owner_user.save()
            if not s.owner_id:
                s.owner_id = owner_user.id
                await s.save()
            logger.info(f"Updated Hotel Stall Owner for '{s.name}': {owner_user.email}")

    # 5. Seed REVA University college
    reva_college = await College.find_one(College.name == "REVA University")
    stall_ids = [str(s.id) for s in stalls]
    if not reva_college:
        reva_college = College(
            name="REVA University",
            domain="@reva.edu.in",
            hotel_ids=stall_ids,
            latitude=13.1169,
            longitude=77.6346
        )
        await reva_college.insert()
        logger.info(f"Created REVA University with hotels: {stall_ids}")
    else:
        reva_college.hotel_ids = stall_ids
        reva_college.latitude = 13.1169
        reva_college.longitude = 77.6346
        await reva_college.save()
        logger.info(f"Updated REVA University hotel_ids: {stall_ids}")

    logger.info("✅ Database seeding complete with Hotel Owners linked!")
    await close_db()

if __name__ == "__main__":
    asyncio.run(seed())
