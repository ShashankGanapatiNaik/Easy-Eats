import os
import sys
import resend

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings

# Initialize Resend
resend.api_key = settings.RESEND_API_KEY


def test_email(recipient: str):
    print("------ RESEND TEST ------")
    print(f"Recipient: {recipient}")
    print(f"Sender: {settings.MAIL_FROM}")

    try:
        response = resend.Emails.send(
            {
                "from": settings.MAIL_FROM,
                "to": [recipient],
                "subject": "Easy Eats Resend Test",
                "html": """
                <h1>🍔 Easy Eats</h1>
                <p>If you received this email, Resend is working correctly.</p>
                """
            }
        )

        print("✅ Email sent successfully")
        print(response)

    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_email = sys.argv[1]
    else:
        target_email = input("Enter recipient email: ")

    test_email(target_email)