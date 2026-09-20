from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api import deps
import app.db.base
from app.api.routes import auth, rfp_project, rfp_document, requirement, company_knowledge, previous_proposal, storage, compliance, proposal, approval, dashboard
from app.core.config import settings

import redis
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware

from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, Response

app = FastAPI(title=settings.APP_NAME)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self' http://localhost:8000 ws://localhost:3000 http://localhost:3000; "
            "frame-ancestors 'none';"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(rfp_project.router, prefix="/api/v1/rfp-projects", tags=["rfp-projects"])
app.include_router(rfp_document.router, prefix="/api/v1/rfp-projects", tags=["rfp-documents"])
app.include_router(requirement.router, prefix="/api/v1/rfp-projects", tags=["rfp-requirements"])
app.include_router(company_knowledge.router, prefix="/api/v1", tags=["company-knowledge"])
app.include_router(previous_proposal.router, prefix="/api/v1", tags=["previous-proposals"])
app.include_router(compliance.router, prefix="/api/v1/rfp-projects", tags=["compliance"])
app.include_router(proposal.router, prefix="/api/v1", tags=["proposals"])
app.include_router(approval.router, prefix="/api/v1", tags=["approval"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(storage.router, prefix="/api/v1", tags=["storage"])

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
