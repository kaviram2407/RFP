from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import math


from app.api import deps
from app.models.user import User, RoleEnum
from app.models.rfp_project import RFPProject
from app.models.rfp_document import RFPDocument, DocumentVersion
from app.models.requirement import (
    Requirement,
    RequirementEvidence,
    RequirementCategoryEnum,
    RequirementTypeEnum,
    RequirementPriorityEnum,
    RequirementStatusEnum,
    ExtractionStatusEnum,
)
from app.schemas.requirement import (
    RequirementResponse,
    RequirementEvidenceResponse,
    RequirementListResponse,
    RequirementUpdate,
    RequirementExtractionStatusResponse,
)
from app.services import requirement_extraction as extraction_service

router = APIRouter()

def verify_project(db: Session, current_user: User, project_id: uuid.UUID) -> RFPProject:
    project = db.query(RFPProject).filter(
        RFPProject.id == project_id,
        RFPProject.organization_id == current_user.organization_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="RFP Project not found.")
    return project

@router.post(
    "/{project_id}/requirement-extraction",
    response_model=RequirementExtractionStatusResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def trigger_requirement_extraction(
    project_id: uuid.UUID,
    version_id: Optional[uuid.UUID] = Query(None, description="Optional specific version ID to extract from"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RequirementExtractionStatusResponse:
    """
    Trigger requirement extraction for a project document version.
    Requires PRODUCT_TEAM role.
    """
    verify_project(db, current_user, project_id)

    if version_id:
        target_version = db.query(DocumentVersion).filter(
            DocumentVersion.id == version_id,
            DocumentVersion.organization_id == current_user.organization_id
        ).first()
        if not target_version:
            raise HTTPException(status_code=404, detail="Document version not found.")
    else:
        # Find latest completed document version in project
        target_version = (
            db.query(DocumentVersion)
            .join(RFPDocument, DocumentVersion.rfp_document_id == RFPDocument.id)
            .filter(
                RFPDocument.rfp_project_id == project_id,
                DocumentVersion.organization_id == current_user.organization_id
            )
            .order_by(DocumentVersion.created_at.desc())
            .first()
        )
        if not target_version:
            raise HTTPException(status_code=404, detail="No active document versions found for this RFP Project.")

    updated_ver = extraction_service.extract_requirements_for_version(db, target_version.id)
    return RequirementExtractionStatusResponse(
        status=ExtractionStatusEnum(updated_ver.extraction_status),
        started_at=updated_ver.extraction_started_at,
        completed_at=updated_ver.extraction_completed_at,
        error=updated_ver.extraction_error
    )

@router.get(
    "/{project_id}/requirement-extraction",
    response_model=RequirementExtractionStatusResponse,
)
def get_requirement_extraction_status(
    project_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RequirementExtractionStatusResponse:
    """
    Get requirement extraction status for an RFP project's latest document version.
    Accessible to all authenticated roles.
    """
    verify_project(db, current_user, project_id)

    target_version = (
        db.query(DocumentVersion)
        .join(RFPDocument, DocumentVersion.rfp_document_id == RFPDocument.id)
        .filter(
            RFPDocument.rfp_project_id == project_id,
            DocumentVersion.organization_id == current_user.organization_id
        )
        .order_by(DocumentVersion.created_at.desc())
        .first()
    )
    if not target_version:
        return RequirementExtractionStatusResponse(status=ExtractionStatusEnum.PENDING)

    return RequirementExtractionStatusResponse(
        status=ExtractionStatusEnum(target_version.extraction_status or "PENDING"),
        started_at=target_version.extraction_started_at,
        completed_at=target_version.extraction_completed_at,
        error=target_version.extraction_error
    )

@router.get(
    "/{project_id}/requirements",
    response_model=RequirementListResponse,
)
def list_requirements(
    project_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: Optional[RequirementCategoryEnum] = Query(None),
    requirement_type: Optional[RequirementTypeEnum] = Query(None),
    priority: Optional[RequirementPriorityEnum] = Query(None),
    status: Optional[RequirementStatusEnum] = Query(None),
    review_required: Optional[bool] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RequirementListResponse:
    """
    List extracted requirements for an RFP project with pagination & filters.
    Accessible to all authenticated roles.
    """
    verify_project(db, current_user, project_id)

    query = db.query(Requirement).filter(
        Requirement.rfp_project_id == project_id,
        Requirement.organization_id == current_user.organization_id
    )

    if category:
        query = query.filter(Requirement.category == category)
    if requirement_type:
        query = query.filter(Requirement.requirement_type == requirement_type)
    if priority:
        query = query.filter(Requirement.priority == priority)
    if status:
        query = query.filter(Requirement.status == status)
    if review_required is not None:
        query = query.filter(Requirement.review_required == review_required)

    total = query.count()
    pages = math.ceil(total / page_size) if total > 0 else 1

    items = (
        query.order_by(Requirement.requirement_code.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return RequirementListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages
    )

@router.get(
    "/{project_id}/requirements/{requirement_id}",
    response_model=RequirementResponse,
)
def get_requirement_details(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RequirementResponse:
    """
    Get specific requirement details with linked evidence list.
    Accessible to all authenticated roles.
    """
    verify_project(db, current_user, project_id)

    req = db.query(Requirement).filter(
        Requirement.id == requirement_id,
        Requirement.rfp_project_id == project_id,
        Requirement.organization_id == current_user.organization_id
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found.")
    return req

@router.get(
    "/{project_id}/requirements/{requirement_id}/evidence",
    response_model=List[RequirementEvidenceResponse],
)
def get_requirement_evidence(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> List[RequirementEvidenceResponse]:
    """
    Get linked source evidence for a specific requirement.
    Accessible to all authenticated roles.
    """
    verify_project(db, current_user, project_id)

    evidence = db.query(RequirementEvidence).filter(
        RequirementEvidence.requirement_id == requirement_id,
        RequirementEvidence.organization_id == current_user.organization_id
    ).all()
    return evidence

@router.patch(
    "/{project_id}/requirements/{requirement_id}",
    response_model=RequirementResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def update_requirement_review(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    data: RequirementUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RequirementResponse:
    """
    Update requirement status or fields (Human-in-the-loop review).
    Requires PRODUCT_TEAM role.
    """
    verify_project(db, current_user, project_id)

    req = db.query(Requirement).filter(
        Requirement.id == requirement_id,
        Requirement.rfp_project_id == project_id,
        Requirement.organization_id == current_user.organization_id
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found.")

    update_data = data.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(req, field, val)

    req.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return req
