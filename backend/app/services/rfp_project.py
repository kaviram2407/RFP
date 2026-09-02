from typing import Optional, Tuple, List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status
from datetime import datetime, timezone
import uuid
import math

from app.models.rfp_project import RFPProject, ProjectStatusEnum
from app.models.user import User
from app.schemas.rfp_project import RFPProjectCreate, RFPProjectUpdate

ALLOWED_TRANSITIONS = {
    ProjectStatusEnum.DRAFT: {ProjectStatusEnum.ACTIVE, ProjectStatusEnum.ARCHIVED},
    ProjectStatusEnum.ACTIVE: {ProjectStatusEnum.SUBMITTED, ProjectStatusEnum.ARCHIVED},
    ProjectStatusEnum.SUBMITTED: {ProjectStatusEnum.AWARDED, ProjectStatusEnum.LOST, ProjectStatusEnum.ARCHIVED},
    ProjectStatusEnum.AWARDED: {ProjectStatusEnum.ARCHIVED},
    ProjectStatusEnum.LOST: {ProjectStatusEnum.ARCHIVED},
    ProjectStatusEnum.ARCHIVED: set(),  # Final state
}

def create_project(db: Session, current_user: User, data: RFPProjectCreate) -> RFPProject:
    # Check if reference_number already exists in organization
    existing = db.query(RFPProject).filter(
        RFPProject.organization_id == current_user.organization_id,
        RFPProject.reference_number == data.reference_number
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Project with reference number '{data.reference_number}' already exists in this organization."
        )

    project = RFPProject(
        organization_id=current_user.organization_id,
        created_by_id=current_user.id,
        name=data.name,
        reference_number=data.reference_number,
        description=data.description,
        customer_name=data.customer_name,
        customer_contact=data.customer_contact,
        submission_deadline=data.submission_deadline,
        status=ProjectStatusEnum.DRAFT
    )
    db.add(project)
    try:
        db.commit()
        db.refresh(project)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Database constraint violation on project creation."
        )
    return project

def list_projects(
    db: Session,
    current_user: User,
    page: int = 1,
    page_size: int = 20,
    status_filter: Optional[ProjectStatusEnum] = None
) -> Tuple[List[RFPProject], int, int]:
    query = db.query(RFPProject).filter(RFPProject.organization_id == current_user.organization_id)
    if status_filter:
        query = query.filter(RFPProject.status == status_filter)

    total = query.count()
    pages = math.ceil(total / page_size) if total > 0 else 1

    items = (
        query.order_by(RFPProject.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total, pages

def get_project_by_id(db: Session, current_user: User, project_id: uuid.UUID) -> RFPProject:
    project = db.query(RFPProject).filter(
        RFPProject.id == project_id,
        RFPProject.organization_id == current_user.organization_id
    ).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="RFP Project not found."
        )
    return project

def update_project(
    db: Session,
    current_user: User,
    project_id: uuid.UUID,
    data: RFPProjectUpdate
) -> RFPProject:
    project = get_project_by_id(db, current_user, project_id)

    # Check reference number uniqueness if changing it
    if data.reference_number and data.reference_number != project.reference_number:
        existing = db.query(RFPProject).filter(
            RFPProject.organization_id == current_user.organization_id,
            RFPProject.reference_number == data.reference_number,
            RFPProject.id != project_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Project with reference number '{data.reference_number}' already exists in this organization."
            )

    # Handle status transition validation if status is changing
    if data.status and data.status != project.status:
        validate_status_transition(project.status, data.status)
        project.status = data.status
        if data.status == ProjectStatusEnum.ARCHIVED:
            project.archived_at = datetime.now(timezone.utc)

    # Update other fields
    update_data = data.model_dump(exclude_unset=True, exclude={"status"})
    for field, value in update_data.items():
        setattr(project, field, value)

    project.updated_at = datetime.now(timezone.utc)
    try:
        db.commit()
        db.refresh(project)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Database integrity constraint violation."
        )
    return project

def archive_project(db: Session, current_user: User, project_id: uuid.UUID) -> RFPProject:
    project = get_project_by_id(db, current_user, project_id)
    if project.status == ProjectStatusEnum.ARCHIVED:
        # Idempotent archive
        return project

    validate_status_transition(project.status, ProjectStatusEnum.ARCHIVED)
    project.status = ProjectStatusEnum.ARCHIVED
    now = datetime.now(timezone.utc)
    project.archived_at = now
    project.updated_at = now

    db.commit()
    db.refresh(project)
    return project

def validate_status_transition(current_status: ProjectStatusEnum, new_status: ProjectStatusEnum):
    if new_status not in ALLOWED_TRANSITIONS.get(current_status, set()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status transition from '{current_status.value}' to '{new_status.value}'."
        )
