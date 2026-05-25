# backend/app/services/sms_service.py
"""
SMS service — supports MSG91 (preferred), Twilio, Fast2SMS, and local console fallback.
"""
import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_sms(phone: str, message: str) -> bool:
    """
    Send SMS to a phone number.
    Tries MSG91, Twilio, Fast2SMS, then falls back to printing to terminal.
    Returns True if sent successfully (or simulated successfully), False otherwise.
    Never raises — failures are logged silently so orders still work.
    """
    if not phone:
        logger.warning("SMS skipped — no phone number")
        return False

    # Clean phone number (remove +, spaces, dashes)
    clean_phone = phone.replace("+", "").replace(" ", "").replace("-", "").strip()

    # 1. MSG91 Flow/SMS API (Preferred)
    if settings.MSG91_API_KEY and settings.MSG91_API_KEY != "CHANGE_ME" and len(settings.MSG91_API_KEY) > 10:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                # If a Template ID is configured, use the Flow API
                if settings.MSG91_TEMPLATE_ID and settings.MSG91_TEMPLATE_ID != "CHANGE_ME":
                    payload = {
                        "template_id": settings.MSG91_TEMPLATE_ID,
                        "sender": settings.MSG91_SENDER_ID or "EASYET",
                        "short_url": "1",
                        "mobiles": clean_phone,
                        "message": message,
                        "var": message,
                    }
                    response = await client.post(
                        "https://control.msg91.com/api/v5/flow/",
                        headers={
                            "authkey": settings.MSG91_API_KEY,
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                    data = response.json()
                    if response.status_code == 200 and (data.get("type") == "success" or data.get("status") == "success"):
                        logger.info(f"✅ MSG91 Flow SMS sent to {clean_phone}")
                        return True
                
                # Transactional fallback direct SMS sending
                tx_payload = {
                    "route": "4",  # Transactional
                    "sender": settings.MSG91_SENDER_ID or "EASYET",
                    "sms": [
                        {
                            "message": message,
                            "to": [clean_phone]
                        }
                    ]
                }
                tx_response = await client.post(
                    "https://control.msg91.com/api/v5/sms/send",
                    headers={
                        "authkey": settings.MSG91_API_KEY,
                        "Content-Type": "application/json",
                    },
                    json=tx_payload,
                )
                tx_data = tx_response.json()
                if tx_response.status_code == 200 and tx_data.get("type") == "success":
                    logger.info(f"✅ MSG91 Transactional SMS sent to {clean_phone}")
                    return True
                else:
                    logger.warning(f"MSG91 API error: {tx_data}")
        except Exception as e:
            logger.error(f"MSG91 SMS error: {e}")

    # 2. Twilio SMS API
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_ACCOUNT_SID != "CHANGE_ME" and len(settings.TWILIO_ACCOUNT_SID) > 10:
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
            to_phone = phone if phone.startswith("+") else f"+{phone}"
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    url,
                    auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
                    data={
                        "To": to_phone,
                        "From": settings.TWILIO_FROM_NUMBER,
                        "Body": message
                    }
                )
                data = response.json()
                if response.status_code in (200, 201):
                    logger.info(f"✅ Twilio SMS sent to {to_phone}")
                    return True
                else:
                    logger.warning(f"Twilio SMS failed: {data}")
        except Exception as e:
            logger.error(f"Twilio SMS error: {e}")

    # 3. Fast2SMS Fallback
    if settings.FAST2SMS_API_KEY and settings.FAST2SMS_API_KEY != "CHANGE_ME" and len(settings.FAST2SMS_API_KEY) > 20:
        ten_digit_phone = clean_phone[-10:]
        if len(ten_digit_phone) == 10:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    response = await client.post(
                        "https://www.fast2sms.com/dev/bulkV2",
                        headers={
                            "authorization": settings.FAST2SMS_API_KEY,
                            "Content-Type":  "application/json",
                        },
                        json={
                            "route":   "q",
                            "message": message,
                            "numbers": ten_digit_phone,
                            "flash":   0,
                        },
                    )
                    data = response.json()
                    if data.get("return") is True:
                        logger.info(f"✅ Fast2SMS sent to {ten_digit_phone}")
                        return True
                    else:
                        logger.warning(f"Fast2SMS failed: {data}")
            except Exception as e:
                logger.error(f"Fast2SMS error: {e}")

    # 4. Developer Terminal Fallback (Always prints when no keys are defined)
    print(f"\n[SMS NOTIFICATION (DEV MODE)] Simulated SMS to {phone}")
    print(f"==================================================")
    print(message)
    print(f"==================================================\n")
    logger.info(f"Simulated SMS to {phone}")
    return True