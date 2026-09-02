from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from typing import Optional
import uuid

from app.api import deps
from app.models.user import User, RoleEnum
from app.models.rfp_project import ProjectStatusEnum
from app.schemas.rfp_project import (
    RFPProjectCreate,
    RFPProjectUpdate,
    RFPProjectResponse,
    RFPProjectListResponse,
)
from app.services import rfp_project as project_service

router = APIRouter()

@router.post(
    "",
    response_model=RFPProjectResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def create_rfp_project(
    data: RFPProjectCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),

) -> RFPProjectResponse:
    """
    Create a new RFP Project.
    Requires PRODUCT_TEAM role.
    """
    return project_service.create_project(db, current_user, data)

@router.get(
    "",
    response_model=RFPProjectListResponse,
)
def list_rfp_projects(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[ProjectStatusEnum] = Query(None, description="Filter by status"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RFPProjectListResponse:
    """
    List RFP Projects for the user's organization.
    Accessible to all authenticated roles (PRODUCT_TEAM, VP, CTO, CEO).
    """
    items, total, pages = project_service.list_projects(
        db, current_user, page=page, page_size=page_size, status_filter=status
    )
    return RFPProjectListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages
    )

@router.get(
    "/{project_id}",
    response_model=RFPProjectResponse,
)
def get_rfp_project(
    project_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RFPProjectResponse:
    """
    Get specific RFP Project details.
    Accessible to all authenticated roles for their organization.
    """
    return project_service.get_project_by_id(db, current_user, project_id)

@router.patch(
    "/{project_id}",
    response_model=RFPProjectResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def update_rfp_project(
    project_id: uuid.UUID,
    data: RFPProjectUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RFPProjectResponse:
    """
    Update RFP Project details or status.
    Requires PRODUCT_TEAM role.
    """
    return project_service.update_project(db, current_user, project_id, data)

@router.post(
    "/{project_id}/archive",
    response_model=RFPProjectResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def archive_rfp_project(
    project_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RFPProjectResponse:
    """
    Archive an RFP Project.
    Requires PRODUCT_TEAM role.
    """
    return project_service.archive_project(db, current_user, project_id)
