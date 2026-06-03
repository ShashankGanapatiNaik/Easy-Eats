# backend/app/services/notification_service.py
"""
Notification service — formats and sends email + SMS for:
1. Order placed confirmation
2. Food ready for pickup
Saves to notifications collection and prevents duplicate notifications.
"""
import logging
from bson import ObjectId
from app.models.notification import Notification
from app.models.user import User
from app.services.sms_service import send_sms
from app.services.email_service import (
    send_email,
    get_order_placed_html,
    get_food_ready_html,
)

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
    Saves a Notification document to DB (always).
    Sends SMS only if phone is provided.
    Prevents duplicate notifications.
    """
    # Check for duplicate
    existing = await Notification.find_one(
        Notification.order_id == order_id,
        Notification.type == notification_type
    )
    if existing:
        logger.info(f"Skipped duplicate notification {notification_type} for order {order_id}")
        return False

    # Always save to database (populates the in-app notification bell)
    notification = Notification(
        user_id=user_id,
        order_id=order_id,
        type=notification_type,
        phone=phone or None,
        message=message,
        is_read=False
    )
    await notification.insert()
    logger.info(f"Saved {notification_type} notification to DB for order {order_id}")

    # Send SMS only if phone exists
    if not phone:
        logger.info(f"No phone for {notification_type} — skipping SMS, in-app notification saved")
        return True  # Return True — notification was saved successfully

    success = await send_sms(phone, message)
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
    """Send in-app notification + SMS + Email when student places an order."""
    code = _pickup_code(order_id)
    msg  = (
        f"Easy Eats 🍔\n\n"
        f"Your order has been placed successfully at {stall_name}.\n\n"
        f"Order ID: #{code}\n"
        f"Pickup Code: {code}\n"
        f"ETA: {prep_min} mins"
    )
    success = await send_order_notification(
        user_id=user_id,
        order_id=ObjectId(order_id),
        notification_type="order_placed",
        phone=phone,
        message=msg
    )

    # ── Always send Order Confirmation Email (independent of phone) ──────────
    try:
        user = await User.get(user_id)
        if user and user.email:
            email_body = (
                f"Hello {user.name},\n\n"
                f"Your order has been placed successfully.\n\n"
                f"Restaurant: {stall_name}\n"
                f"Order ID: #{order_id}\n"
                f"Pickup Code: {code}\n"
                f"Estimated Ready Time: {prep_min} mins\n\n"
                f"Track your order in Easy Eats."
            )
            await send_email(
                to_email=user.email,
                subject="Your Easy Eats Order is Confirmed 🍔",
                body=email_body,
                html_body=get_order_placed_html(user.name, stall_name, order_id, prep_min)
            )
            logger.info(f"Order placed email sent to {user.email}")
    except Exception as e:
        logger.error(f"Failed to send order placed email: {e}")

    return success


async def notify_order_ready(
    user_id:    ObjectId,
    phone:      str,
    order_id:   str,
    stall_name: str,
) -> bool:
    """Send in-app notification + SMS + Email when kitchen marks order as Ready."""
    code = _pickup_code(order_id)
    msg  = (
        f"Easy Eats 🍔\n\n"
        f"Your order from {stall_name} is READY for pickup.\n\n"
        f"Pickup Code: {code}\n\n"
        f"Please collect your order from the counter."
    )
    success = await send_order_notification(
        user_id=user_id,
        order_id=ObjectId(order_id),
        notification_type="order_ready",
        phone=phone,
        message=msg
    )

    # ── Always send Food Ready Email (independent of phone) ──────────────────
    try:
        user = await User.get(user_id)
        if user and user.email:
            email_body = (
                f"Your order from {stall_name} is READY.\n\n"
                f"Pickup Code: {code}\n\n"
                f"Please show this code at the counter."
            )
            await send_email(
                to_email=user.email,
                subject="Your Food is Ready for Pickup 🍟",
                body=email_body,
                html_body=get_food_ready_html(stall_name, order_id)
            )
            logger.info(f"Food ready email sent to {user.email}")
    except Exception as e:
        logger.error(f"Failed to send food ready email: {e}")

    return success