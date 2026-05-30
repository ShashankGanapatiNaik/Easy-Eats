from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import socketio

from app.core.config import settings
from app.database import connect_db, close_db
from app.routes import auth, stalls, menu, orders, admin, reviews
from app.routes.payments import router as payments_router
from app.routes.wallet   import router as wallet_router
from app.routes.ai_order import router as ai_router
from app.routes.notifications import router as notifications_router
from app.socket_manager import sio

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()

app = FastAPI(title="Easy Eats API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(stalls.router)
app.include_router(menu.router)
app.include_router(orders.router)
app.include_router(admin.router)
app.include_router(reviews.router)
app.include_router(payments_router)
app.include_router(wallet_router)
app.include_router(ai_router)
app.include_router(notifications_router)

@app.get("/")
def root(): return {"message": "Easy Eats API v2.0 🍔"}

@app.get("/health")
async def health(): return {"status": "ok"}

# ── Socket.IO — wrap FastAPI app with the ASGI socket layer ──────────────────
# IMPORTANT: uvicorn must point to `app.main:socket_app` (not `app.main:app`)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
