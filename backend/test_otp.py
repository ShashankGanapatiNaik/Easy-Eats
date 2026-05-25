import asyncio
import os
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import connect_db
from app.models.otp_verification import OTPVerification
from app.routes.auth import send_otp, SendOTPBody, verify_otp, VerifyOTPBody

async def main():
    print("Initializing Database Connection...")
    await connect_db()
    
    test_phone = "+919876543210"
    
    # Clean previous test entries
    print(f"Cleaning previous records for {test_phone}...")
    await OTPVerification.find(OTPVerification.phone == test_phone).delete()
    
    # Send OTP
    print("1. Testing OTP Sending...")
    try:
        body_send = SendOTPBody(phone=test_phone)
        res_send = await send_otp(body_send)
        print("   Send Response:", res_send)
    except Exception as e:
        print("   Send OTP failed:", e)
        return
        
    # Retrieve from DB
    otp_record = await OTPVerification.find_one(OTPVerification.phone == test_phone)
    if not otp_record:
        print("   Error: OTP record not found in database!")
        return
    print(f"   Found OTP in DB: {otp_record.code}, Verified: {otp_record.verified}, Expires At: {otp_record.expires_at}")
    
    # Verify OTP
    print("2. Testing OTP Verification...")
    try:
        body_verify = VerifyOTPBody(phone=test_phone, code=otp_record.code)
        res_verify = await verify_otp(body_verify)
        print("   Verify Response:", res_verify)
    except Exception as e:
        print("   Verification failed:", e)
        return
        
    # Check if marked verified in DB
    updated_record = await OTPVerification.find_one(OTPVerification.phone == test_phone)
    print(f"   Updated OTP status: Verified = {updated_record.verified}, Expires At = {updated_record.expires_at}")
    print("\n✅ OTP verification backend logic tested successfully!")

if __name__ == "__main__":
    asyncio.run(main())
