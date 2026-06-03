# backend/app/services/email_service.py
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

async def send_email(to_email: str, subject: str, body: str, html_body: str = None) -> bool:
    """
    Sends an email to the specified recipient using Gmail SMTP.
    Falls back to logging/terminal simulation if credentials are not configured (contains "CHANGE_ME").
    """
    if "CHANGE_ME" in settings.MAIL_PASSWORD or "your_google_app_password" in settings.MAIL_PASSWORD:
        print(f"\n[EMAIL SIMULATION] To: {to_email}\nSubject: {subject}\nBody:\n{body}\n")
        logger.warning(f"Skipped real email to {to_email} — Gmail SMTP password is not configured.")
        return True

    try:
        # Lazy import so app boots successfully even if fastapi-mail isn't installed yet
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
        
        message = MessageSchema(
            subject=subject,
            recipients=[to_email],
            body=html_body or body,
            subtype=MessageType.html if html_body else MessageType.plain
        )
        fm = FastMail(conf)
        await fm.send_message(message)
        logger.info(f"Successfully sent email to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        # Return True in dev so app flow doesn't crash on invalid SMTP setup
        return False

# ─────────────────────────────────────────────────────────────────────────────
# HTML EMAIL TEMPLATES
# ─────────────────────────────────────────────────────────────────────────────

def get_otp_html(code: str) -> str:
    """Returns HTML for OTP Verification."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Easy Eats OTP Verification</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: #f4f4f5;
                margin: 0;
                padding: 20px;
            }}
            .card {{
                max-width: 500px;
                margin: 20px auto;
                background: #ffffff;
                border-radius: 24px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                border: 1px solid #e4e4e7;
            }}
            .header {{
                background-color: #18181b;
                padding: 30px 20px;
                text-align: center;
            }}
            .header h1 {{
                color: #84cc16;
                margin: 0;
                font-size: 28px;
                font-weight: 800;
            }}
            .content {{
                padding: 40px 30px;
                color: #27272a;
                text-align: center;
            }}
            .tagline {{
                font-size: 16px;
                color: #71717a;
                margin-top: -10px;
                margin-bottom: 30px;
            }}
            .otp-box {{
                font-size: 42px;
                font-weight: 900;
                color: #18181b;
                letter-spacing: 6px;
                margin: 25px auto;
                padding: 18px;
                background-color: #f4f4f5;
                border-radius: 16px;
                border: 1px dashed #d4d4d8;
                width: 240px;
                text-align: center;
            }}
            .footer {{
                background-color: #f4f4f5;
                padding: 20px;
                text-align: center;
                font-size: 12px;
                color: #a1a1aa;
                border-top: 1px solid #e4e4e7;
            }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                <h1>🍔 Easy Eats</h1>
            </div>
            <div class="content">
                <h2 style="margin-top:0;font-size:22px;font-weight:800;">Verify Your Email</h2>
                <p class="tagline">Hello from Easy Eats 🍔</p>
                <p style="font-size:15px;line-height:1.5;color:#52525b;">Your verification OTP code is listed below. Please enter this code in the app to proceed.</p>
                
                <div class="otp-box">{code}</div>
                
                <p style="font-size:13px;color:#ef4444;font-weight:600;margin-top:25px;">⚠️ This OTP expires in 5 minutes.</p>
            </div>
            <div class="footer">
                <p>© {settings.APP_NAME}. All rights reserved.<br>Skip the queue, eat fresh on campus.</p>
            </div>
        </div>
    </body>
    </html>
    """

def get_order_placed_html(customer_name: str, stall_name: str, order_id: str, prep_min: int) -> str:
    """Returns HTML for Order Placed confirmation."""
    code = order_id[-4:].upper()
    track_url = f"{settings.FRONTEND_URL.rstrip('/')}/track/{order_id}"
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Your Easy Eats Order is Confirmed</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: #f4f4f5;
                margin: 0;
                padding: 20px;
            }}
            .card {{
                max-width: 550px;
                margin: 20px auto;
                background: #ffffff;
                border-radius: 24px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                border: 1px solid #e4e4e7;
            }}
            .header {{
                background-color: #18181b;
                padding: 30px 20px;
                text-align: center;
            }}
            .header h1 {{
                color: #84cc16;
                margin: 0;
                font-size: 28px;
                font-weight: 800;
            }}
            .content {{
                padding: 35px 30px;
                color: #27272a;
            }}
            .badge {{
                display: inline-block;
                background-color: #f0fdf4;
                border: 1px solid #bbf7d0;
                color: #166534;
                padding: 6px 14px;
                border-radius: 9999px;
                font-size: 13px;
                font-weight: 700;
                margin-bottom: 20px;
            }}
            .details-table {{
                width: 100%;
                background-color: #f4f4f5;
                border-radius: 16px;
                padding: 20px;
                margin: 20px 0;
                border-collapse: collapse;
            }}
            .details-table td {{
                padding: 8px 0;
                font-size: 14px;
            }}
            .label {{
                color: #71717a;
                font-weight: 500;
            }}
            .value {{
                color: #18181b;
                font-weight: 700;
                text-align: right;
            }}
            .btn-container {{
                text-align: center;
                margin: 25px 0 10px 0;
            }}
            .btn {{
                display: inline-block;
                background-color: #84cc16;
                color: #18181b;
                text-decoration: none;
                padding: 14px 28px;
                border-radius: 12px;
                font-weight: 700;
                font-size: 15px;
                box-shadow: 0 4px 6px -1px rgba(132, 204, 22, 0.2);
            }}
            .footer {{
                background-color: #f4f4f5;
                padding: 20px;
                text-align: center;
                font-size: 12px;
                color: #a1a1aa;
                border-top: 1px solid #e4e4e7;
            }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                <h1>🍔 Easy Eats</h1>
            </div>
            <div class="content">
                <span class="badge">✅ ORDER CONFIRMED</span>
                <h2 style="margin:0 0 10px 0;font-size:22px;font-weight:800;">Hello {customer_name},</h2>
                <p style="font-size:15px;line-height:1.5;color:#52525b;margin:0;">Your order has been placed successfully. You will receive another notification when it's ready for pickup.</p>
                
                <table class="details-table">
                    <tr>
                        <td class="label">Restaurant</td>
                        <td class="value">{stall_name}</td>
                    </tr>
                    <tr>
                        <td class="label">Order ID</td>
                        <td class="value">#{order_id}</td>
                    </tr>
                    <tr>
                        <td class="label">Pickup Code</td>
                        <td class="value" style="color:#84cc16;font-size:16px;">{code}</td>
                    </tr>
                    <tr>
                        <td class="label">Estimated Ready Time</td>
                        <td class="value">{prep_min} mins</td>
                    </tr>
                </table>
                
                <div class="btn-container">
                    <a href="{track_url}" class="btn">Track Your Order 📍</a>
                </div>
            </div>
            <div class="footer">
                <p>© {settings.APP_NAME}. All rights reserved.<br>Skip the queue, eat fresh on campus.</p>
            </div>
        </div>
    </body>
    </html>
    """

def get_food_ready_html(stall_name: str, order_id: str) -> str:
    """Returns HTML for Food Ready for pickup (contains QR code)."""
    code = order_id[-4:].upper()
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=150x150&data={code}"
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Your Food is Ready for Pickup</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: #f4f4f5;
                margin: 0;
                padding: 20px;
            }}
            .card {{
                max-width: 550px;
                margin: 20px auto;
                background: #ffffff;
                border-radius: 24px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                border: 1px solid #e4e4e7;
            }}
            .header {{
                background-color: #18181b;
                padding: 30px 20px;
                text-align: center;
            }}
            .header h1 {{
                color: #84cc16;
                margin: 0;
                font-size: 28px;
                font-weight: 800;
            }}
            .content {{
                padding: 35px 30px;
                color: #27272a;
                text-align: center;
            }}
            .badge {{
                display: inline-block;
                background-color: #ecfdf5;
                border: 1px solid #a7f3d0;
                color: #047857;
                padding: 6px 14px;
                border-radius: 9999px;
                font-size: 13px;
                font-weight: 700;
                margin-bottom: 20px;
            }}
            .pickup-box {{
                font-size: 48px;
                font-weight: 900;
                color: #18181b;
                letter-spacing: 4px;
                margin: 15px auto;
                padding: 10px;
                background-color: #f0fdf4;
                border-radius: 16px;
                border: 2px solid #84cc16;
                width: 200px;
            }}
            .qr-code {{
                display: block;
                margin: 25px auto;
                border: 4px solid #18181b;
                border-radius: 16px;
            }}
            .footer {{
                background-color: #f4f4f5;
                padding: 20px;
                text-align: center;
                font-size: 12px;
                color: #a1a1aa;
                border-top: 1px solid #e4e4e7;
            }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                <h1>🍟 Easy Eats</h1>
            </div>
            <div class="content">
                <span class="badge">🍟 FOOD READY FOR PICKUP</span>
                <h2 style="margin:0 0 10px 0;font-size:22px;font-weight:800;">Your order from {stall_name} is READY!</h2>
                <p style="font-size:15px;color:#52525b;margin:0 0 25px 0;">Please proceed to the stall counter and show this pickup pass to collect your food.</p>
                
                <p style="font-size:12px;color:#71717a;font-weight:700;margin-bottom:5px;text-transform:uppercase;">Show at counter</p>
                <div class="pickup-box">{code}</div>
                
                <img class="qr-code" src="{qr_url}" width="150" height="150" alt="Pickup QR Code">
                
                <p style="font-size:13px;color:#71717a;margin-top:20px;">Or show the QR code above for quick scanning.</p>
            </div>
            <div class="footer">
                <p>© {settings.APP_NAME}. All rights reserved.<br>Skip the queue, eat fresh on campus.</p>
            </div>
        </div>
    </body>
    </html>
    """
