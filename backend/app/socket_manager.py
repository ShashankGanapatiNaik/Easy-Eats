# app/socket_manager.py
# Singleton Socket.IO AsyncServer — import `sio` everywhere you need to emit events

import socketio

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",   # FastAPI CORS middleware handles REST; socket needs its own
    logger=False,
    engineio_logger=False,
)


# ─────────────────────────────────────────────────────────────────────────────
# ROOM MANAGEMENT
# Students join "order_{order_id}" to receive status updates for their order.
# Kitchen dashboard joins "stall_{stall_id}" to receive new order alerts.
# ─────────────────────────────────────────────────────────────────────────────

@sio.event
async def connect(sid, environ, auth=None):
    """Client connected."""
    pass


@sio.event
async def join_order(sid, data):
    """
    Student tracking page emits this to subscribe to a specific order's updates.
    data = { "order_id": "<order_id>" }
    """
    order_id = data.get("order_id")
    if order_id:
        await sio.enter_room(sid, f"order_{order_id}")


@sio.event
async def leave_order(sid, data):
    """Student unsubscribes from an order room."""
    order_id = data.get("order_id")
    if order_id:
        await sio.leave_room(sid, f"order_{order_id}")


@sio.event
async def join_stall(sid, data):
    """
    Kitchen dashboard subscribes to receive updates for their stall.
    data = { "stall_id": "<stall_id>" }
    """
    stall_id = data.get("stall_id")
    if stall_id:
        await sio.enter_room(sid, f"stall_{stall_id}")


@sio.event
async def leave_stall(sid, data):
    stall_id = data.get("stall_id")
    if stall_id:
        await sio.leave_room(sid, f"stall_{stall_id}")


@sio.event
async def disconnect(sid):
    """Client disconnected — rooms are cleaned up automatically by python-socketio."""
    pass
