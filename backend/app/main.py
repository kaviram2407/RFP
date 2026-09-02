from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api import deps
from app.api.routes import auth
from app.core.config import settings
import redis
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.APP_NAME)

app.include_router(auth.router, prefix="/auth", tags=["auth"])


@app.get("/health")
def health_check(db: Session = Depends(deps.get_db)):
    status = {
        "status": "ok",
        "services": {
            "api": "ok",
            "database": "unknown",
            "redis": "unknown"
        }
    }
    
    # Check Database
    try:
        db.execute(text("SELECT 1"))
        status["services"]["database"] = "ok"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        status["services"]["database"] = "error"
        status["status"] = "error"
        
    # Check Redis
    try:
        r = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
        if r.ping():
            status["services"]["redis"] = "ok"
        else:
            status["services"]["redis"] = "error"
            status["status"] = "error"
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        status["services"]["redis"] = "error"
        status["status"] = "error"

    return status
