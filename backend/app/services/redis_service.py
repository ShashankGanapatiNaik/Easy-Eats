import json
import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)

# Defensive import for environments where Redis library is not installed yet
try:
    import redis.asyncio as aioredis
    REDIS_AVAILABLE = True
except ImportError:
    aioredis = None
    REDIS_AVAILABLE = False
    logger.warning("⚠️ 'redis' Python package is not installed. Caching will be disabled.")

from app.core.config import settings

# Global Redis client instance
redis_client: Optional[Any] = None

async def init_redis() -> None:
    """Initialises the async Redis client."""
    global redis_client
    if not REDIS_AVAILABLE:
        logger.info("ℹ️ Redis caching is disabled (library not installed).")
        return
    try:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=2.0
        )
        # Test connection
        await redis_client.ping()
        logger.info("✅ Connected to Redis successfully")
    except Exception as e:
        logger.error(f"❌ Failed to connect to Redis: {e}")
        redis_client = None

async def close_redis() -> None:
    """Closes the Redis client connection."""
    global redis_client
    if redis_client:
        try:
            await redis_client.close()
            logger.info("🔒 Redis connection closed")
        except Exception as e:
            logger.error(f"❌ Error closing Redis client: {e}")
        finally:
            redis_client = None

async def get_cache(key: str) -> Optional[Any]:
    """Retrieves and JSON-deserialises data from Redis cache."""
    global redis_client
    if not redis_client:
        return None
    try:
        cached_val = await redis_client.get(key)
        if cached_val:
            return json.loads(cached_val)
    except Exception as e:
        logger.warning(f"⚠️ Redis read error for key '{key}': {e}")
    return None

async def set_cache(key: str, data: Any, expire: int = 3600) -> bool:
    """Serialises and stores data in Redis cache with an expiration time (seconds)."""
    global redis_client
    if not redis_client:
        return False
    try:
        serialized = json.dumps(data)
        await redis_client.set(key, serialized, ex=expire)
        return True
    except Exception as e:
        logger.warning(f"⚠️ Redis write error for key '{key}': {e}")
        return False

async def invalidate_cache(key: str) -> bool:
    """Deletes a key from the Redis cache."""
    global redis_client
    if not redis_client:
        return False
    try:
        await redis_client.delete(key)
        return True
    except Exception as e:
        logger.warning(f"⚠️ Redis delete error for key '{key}': {e}")
        return False
