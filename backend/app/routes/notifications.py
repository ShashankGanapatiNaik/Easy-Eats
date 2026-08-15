from fastapi import APIRouter, Depends, HTTPException
from typing import List
from bson import ObjectId
from datetime import datetime

from app.models.notification import Notification
from app.models.user import User
from app.utils.security import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("")
async def get_notifications(
    current_user: User = Depends(get_current_user),
    limit: int = 20,
    unread_only: bool = False,
):
    """Get active notifications for the current student."""
    query = [Notification.user_id == current_user.id]
    if unread_only:
        query.append(Notification.is_read == False)
        
    notifications = await Notification.find(*query).sort(-Notification.sent_at).limit(limit).to_list()
    
    return [
        {
            "id": str(n.id),
            "order_id": str(n.order_id),
            "type": n.type,
            "phone": n.phone,
            "message": n.message,
            "is_read": n.is_read,
            "sent_at": n.sent_at.isoformat(),
        }
        for n in notifications
    ]

@router.put("/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
):
    """Mark all notifications of current user as read."""
    await Notification.find(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"$set": {"is_read": True}})
    
    return {"message": "All notifications marked as read"}

@router.put("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    """Mark a notification as read."""
    notification = await Notification.get(ObjectId(notification_id))
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    notification.is_read = True
    await notification.save()
    return {"message": "Notification marked as read"}
