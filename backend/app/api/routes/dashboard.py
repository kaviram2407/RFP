import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.schemas.dashboard import DashboardSummaryResponse
from app.services.dashboard import dashboard_service

router = APIRouter()

@router.get(
    "/summary",
    response_model=DashboardSummaryResponse,
    summary="Get role-aware dashboard metrics & distributions"
)
def get_dashboard_summary(
    rfp_project_id: Optional[uuid.UUID] = Query(None, description="Optional RFP Project ID filter"),
    status: Optional[str] = Query(None, description="Optional RFP status filter"),
    priority: Optional[str] = Query(None, description="Optional Requirement priority filter"),
    category: Optional[str] = Query(None, description="Optional Requirement category filter"),
    risk_severity: Optional[str] = Query(None, description="Optional Risk severity filter"),
    gap_severity: Optional[str] = Query(None, description="Optional Gap severity filter"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Retrieves role-aware, tenant-isolated operational analytics and KPIs.
    All data is computed server-side directly from PostgreSQL.
    """
    return dashboard_service.get_dashboard_summary(
        db=db,
        user=current_user,
        rfp_project_id=rfp_project_id,
        status_filter=status,
        priority_filter=priority,
        category_filter=category,
        risk_severity_filter=risk_severity,
        gap_severity_filter=gap_severity,
    )
