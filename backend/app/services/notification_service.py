# backend/app/services/notification_service.py
"""
Notification service — formats and sends SMS for:
1. Order placed confirmation
2. Food ready for pickup
Saves to notifications collection and prevents duplicate notifications.
"""
import logging
from bson import ObjectId
from app.models.notification import Notification
from app.services.sms_service import send_sms

logger = logging.getLogger(__name__)


def _pickup_code(order_id: str) -> str:
    return order_id[-4:].upper()


async def send_order_notification(
    user_id: ObjectId,
    order_id: ObjectId,
    notification_type: str,
    phone: str,
    message: str
) -> bool:
    """
    Checks if a notification of notification_type was already sent for order_id.
    If not, creates a Notification document in DB, sends SMS, and returns success status.
    """
    if not phone:
        logger.warning(f"Skipping notification {notification_type} — no phone number provided")
        return False

    # Check for duplicate
    existing = await Notification.find_one(
        Notification.order_id == order_id,
        Notification.type == notification_type
    )
    if existing:
        logger.info(f"Skipped duplicate notification {notification_type} for order {order_id}")
        return False

    # Save to database
    notification = Notification(
        user_id=user_id,
        order_id=order_id,
        type=notification_type,
        phone=phone,
        message=message,
        is_read=False
    )
    await notification.insert()

    # Trigger SMS
    success = await send_sms(phone, message)
    
    # Dev Terminal fallback
    print(f"\n[SMS NOTIFICATION] Sent {notification_type} SMS to {phone} (Status: {'Sent' if success else 'Skipped/Failed'})\nMsg: {message}\n")
    logger.info(f"[SMS NOTIFICATION] Sent {notification_type} SMS to {phone}")
    
    return success


async def notify_order_placed(
    user_id:    ObjectId,
    phone:      str,
    order_id:   str,
    stall_name: str,
    prep_min:   int,
) -> bool:
    """Send SMS when student places an order successfully."""
    code = _pickup_code(order_id)
    msg  = (
        f"Easy Eats 🍔\n\n"
        f"Your order has been placed successfully at {stall_name}.\n\n"
        f"Order ID: #{code}\n"
        f"Pickup Code: {code}\n"
        f"ETA: {prep_min} mins"
    )
    return await send_order_notification(
        user_id=user_id,
        order_id=ObjectId(order_id),
        notification_type="order_placed",
        phone=phone,
        message=msg
    )


async def notify_order_ready(
    user_id:    ObjectId,
    phone:      str,
    order_id:   str,
    stall_name: str,
) -> bool:
    """Send SMS when kitchen marks order as Ready."""
    code = _pickup_code(order_id)
    msg  = (
        f"Easy Eats 🍔\n\n"
        f"Your order from {stall_name} is READY for pickup.\n\n"
        f"Pickup Code: {code}\n\n"
        f"Please collect your order from the counter."
    )
    return await send_order_notification(
        user_id=user_id,
        order_id=ObjectId(order_id),
        notification_type="order_ready",
        phone=phone,
        message=msg
    )