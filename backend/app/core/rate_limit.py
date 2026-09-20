import logging
import time
from typing import Callable, Optional
from fastapi import Request, HTTPException, status
from app.core.config import settings
from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)

def parse_limit_spec(limit_spec: str) -> tuple[int, int]:
    """
    Parse a rate limit spec string like '10/minute', '100/hour', '5/second'.
    Returns (max_requests, window_seconds).
    """
    try:
        parts = limit_spec.strip().split('/')
        count = int(parts[0])
        unit = parts[1].lower() if len(parts) > 1 else 'minute'
        
        if unit.startswith('sec'):
            window = 1
        elif unit.startswith('min'):
            window = 60
        elif unit.startswith('hour'):
            window = 3600
        elif unit.startswith('day'):
            window = 86400
        else:
            window = 60
        return count, window
    except Exception as e:
        logger.error(f"Failed to parse rate limit spec '{limit_spec}': {e}. Defaulting to 100/60s.")
        return 100, 60

# In-memory rate limiting fallback for testing or when Redis is down
_in_memory_rate_limit_store: dict[str, list[float]] = {}

def check_rate_limit(key_prefix: str, identifier: str, limit_spec: str):
    """
    Check if a request exceeds rate limit spec.
    Raises HTTP 429 if rate limit is exceeded.
    """
    if not getattr(settings, "RATE_LIMIT_ENABLED", True) or settings.APP_ENV == "testing":
        return

    max_requests, window_seconds = parse_limit_spec(limit_spec)
    now = time.time()
    key = f"rate_limit:{key_prefix}:{identifier}"

    client = get_redis_client()
    if client is not None:
        try:
            # Fixed window counter in Redis
            window_key = f"{key}:{int(now // window_seconds)}"
            current_count = client.incr(window_key)
            if current_count == 1:
                client.expire(window_key, window_seconds + 5)

            if current_count > max_requests:
                retry_after = int(window_seconds - (now % window_seconds))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded. Please try again later.",
                    headers={"Retry-After": str(max(1, retry_after))}
                )
            return
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Redis rate limiting failed ({e}); using in-memory fallback.")

    # In-memory sliding window fallback
    global _in_memory_rate_limit_store
    timestamps = _in_memory_rate_limit_store.get(key, [])
    # Filter out old timestamps
    cutoff = now - window_seconds
    timestamps = [ts for ts in timestamps if ts > cutoff]

    if len(timestamps) >= max_requests:
        retry_after = int(window_seconds - (now - timestamps[0])) if timestamps else window_seconds
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later.",
            headers={"Retry-After": str(max(1, retry_after))}
        )

    timestamps.append(now)
    _in_memory_rate_limit_store[key] = timestamps

def rate_limit_dependency(key_prefix: str, limit_spec_attr: str):
    """
    FastAPI dependency wrapper for route level rate limiting.
    """
    async def dependency(request: Request):
        limit_spec = getattr(settings, limit_spec_attr, "60/minute")
        # Identify by IP address or Authorization header if available
        client_ip = request.client.host if request.client else "127.0.0.1"
        auth_header = request.headers.get("Authorization", "")
        identifier = f"{client_ip}:{auth_header[:30]}"
        check_rate_limit(key_prefix, identifier, limit_spec)
    return dependency
