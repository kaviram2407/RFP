import logging
import time
from typing import Optional
import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: Optional[redis.Redis] = None

def get_redis_client() -> Optional[redis.Redis]:
    """
    Get or initialize Redis client singleton with safe timeout.
    Returns None if Redis is unreachable.
    """
    global _redis_client
    if _redis_client is not None:
        try:
            # Quick ping check if active
            _redis_client.ping()
            return _redis_client
        except Exception:
            _redis_client = None

    try:
        client = redis.Redis.from_url(
            settings.REDIS_URL,
            socket_timeout=2,
            socket_connect_timeout=2,
            decode_responses=True
        )
        client.ping()
        _redis_client = client
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis connection unavailable: {e}")
        return None

def revoke_jti(jti: str, ttl_seconds: int) -> bool:
    """
    Revoke a JWT token by storing its JTI in Redis with TTL.
    Returns True if successfully stored, False if Redis unavailable.
    """
    if not jti or ttl_seconds <= 0:
        return False

    client = get_redis_client()
    if not client:
        logger.warning(f"Could not revoke JTI {jti}: Redis unavailable")
        return False

    key = f"jwt:revoked:{jti}"
    try:
        client.set(key, "1", ex=ttl_seconds)
        return True
    except Exception as e:
        logger.warning(f"Failed to revoke JTI in Redis: {e}")
        return False

def is_jti_revoked(jti: str) -> bool:
    """
    Check if a JTI is present in the Redis revocation list.
    If Redis is unavailable, returns False to avoid knocking out valid sessions,
    while logging a security warning.
    """
    if not jti:
        return False

    client = get_redis_client()
    if not client:
        logger.warning("Redis unavailable during token revocation check; allowing token.")
        return False

    key = f"jwt:revoked:{jti}"
    try:
        return bool(client.exists(key))
    except Exception as e:
        logger.warning(f"Error checking JTI revocation state in Redis: {e}")
        return False
