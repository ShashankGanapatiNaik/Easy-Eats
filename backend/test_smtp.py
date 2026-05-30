import asyncio
import os
import sys

# Force selector event loop policy on Windows to avoid hangs during raw SMTP connections
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from pydantic_settings import BaseSettings

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings

async def test_mail(recipient: str):
    print("--- SMTP Diagnostic Tool ---")
    print(f"Loaded Username (Sender): {settings.MAIL_USERNAME}")
    password = settings.MAIL_PASSWORD
    masked_pw = password[:2] + "*" * (len(password) - 4) + password[-2:] if len(password) > 4 else "***"
    print(f"Loaded Password (Masked): {masked_pw} (Length: {len(password)})")
    print(f"Processed Password (No Spaces): {password.replace(' ', '')}")
    print(f"Mail Server: {settings.MAIL_SERVER}:{settings.MAIL_PORT}")
    print(f"TLS: STARTTLS={settings.MAIL_STARTTLS}, SSL/TLS={settings.MAIL_SSL_TLS}")
    print(f"\nSending test email TO: {recipient}")
    print("(FROM will always be the SMTP sender: " + settings.MAIL_FROM + ")")
    
    print("\nAttempting connection with fastapi-mail...")
    try:
        from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
        
        conf = ConnectionConfig(
            MAIL_USERNAME=settings.MAIL_USERNAME,
            MAIL_PASSWORD=settings.MAIL_PASSWORD.replace(" ", ""),
            MAIL_FROM=settings.MAIL_FROM,
            MAIL_PORT=settings.MAIL_PORT,
            MAIL_SERVER=settings.MAIL_SERVER,
            MAIL_STARTTLS=settings.MAIL_STARTTLS,
            MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True
        )
        
        # ✅ Send to the specified recipient — NOT to MAIL_FROM (sender)
        message = MessageSchema(
            subject="Easy Eats SMTP Test Connection",
            recipients=[recipient],   # ← dynamic recipient, not hardcoded MAIL_FROM
            body=f"If you receive this email at {recipient}, your Gmail SMTP connection is fully working! 🍔",
            subtype=MessageType.plain
        )
        
        fm = FastMail(conf)
        await fm.send_message(message)
        print(f"✅ Success! Test email sent to {recipient}")
    except Exception as e:
        print(f"❌ Connection Failed: {e}")

if __name__ == "__main__":
    # Usage: python test_smtp.py recipient@example.com
    # If no argument given, defaults to the SMTP sender (self-test)
    if len(sys.argv) > 1:
        target_email = sys.argv[1]
    else:
        target_email = settings.MAIL_FROM
        print(f"[INFO] No recipient argument given. Defaulting to sender ({target_email}) for self-test.")
        print(f"[TIP]  To send to a different email: python test_smtp.py other@example.com\n")
    
    asyncio.run(test_mail(target_email))
