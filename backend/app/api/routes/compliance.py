from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.api import deps
from app.models.user import User, RoleEnum
from app.models.rfp_project import RFPProject
from app.models.requirement import Requirement
from app.models.compliance import (
    ComplianceAssessment,
    ComplianceStatusEnum,
    ReviewStatusEnum,
    RiskSeverityEnum,
)
from app.schemas.compliance import (
    ComplianceAssessmentResponse,
    ComplianceAssessmentUpdate,
    ComplianceAssessmentStatusResponse,
)
from app.services.compliance_service import compliance_service

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
    "/{project_id}/compliance-assessment",
    response_model=ComplianceAssessmentStatusResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def trigger_compliance_assessment(
    project_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> ComplianceAssessmentStatusResponse:
    """
    Trigger bulk compliance, gap, and risk assessment for all requirements in an RFP project.
    Requires PRODUCT_TEAM role.
    """
    verify_project(db, current_user, project_id)

    requirements = db.query(Requirement).filter(
        Requirement.rfp_project_id == project_id,
        Requirement.organization_id == current_user.organization_id
    ).all()

    if not requirements:
        return ComplianceAssessmentStatusResponse(
            status="COMPLETED",
            total_requirements=0,
            processed_requirements=0
        )

    # Evaluate requirements synchronously or process batch
    assessments = compliance_service.evaluate_project_compliance(
        db=db,
        rfp_project_id=project_id,
        organization_id=current_user.organization_id
    )

    return ComplianceAssessmentStatusResponse(
        status="COMPLETED",
        total_requirements=len(requirements),
        processed_requirements=len(assessments)
    )

@router.get(
    "/{project_id}/compliance-assessment/status",
    response_model=ComplianceAssessmentStatusResponse,
)
def get_compliance_assessment_status(
    project_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> ComplianceAssessmentStatusResponse:
    """
    Get current compliance assessment progress and stats for an RFP project.
    """
    verify_project(db, current_user, project_id)

    total = db.query(Requirement).filter(
        Requirement.rfp_project_id == project_id,
        Requirement.organization_id == current_user.organization_id
    ).count()

    assessed = db.query(ComplianceAssessment).filter(
        ComplianceAssessment.rfp_project_id == project_id,
        ComplianceAssessment.organization_id == current_user.organization_id
    ).count()

    status_str = "COMPLETED" if total > 0 and assessed >= total else ("PROCESSING" if assessed > 0 else "PENDING")

    return ComplianceAssessmentStatusResponse(
        status=status_str,
        total_requirements=total,
        processed_requirements=assessed
    )

@router.get(
    "/{project_id}/compliance-assessments",
    response_model=List[ComplianceAssessmentResponse],
)
def list_compliance_assessments(
    project_id: uuid.UUID,
    status: Optional[ComplianceStatusEnum] = Query(None),
    review_required: Optional[bool] = Query(None),
    review_status: Optional[ReviewStatusEnum] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> List[ComplianceAssessmentResponse]:
    """
    List requirement compliance assessments for an RFP project with filters.
    Accessible to all authenticated users.
    """
    verify_project(db, current_user, project_id)

    query = db.query(ComplianceAssessment).filter(
        ComplianceAssessment.rfp_project_id == project_id,
        ComplianceAssessment.organization_id == current_user.organization_id
    )

    if status:
        query = query.filter(ComplianceAssessment.status == status)
    if review_required is not None:
        query = query.filter(ComplianceAssessment.review_required == review_required)
    if review_status:
        query = query.filter(ComplianceAssessment.review_status == review_status)

    assessments = query.order_by(ComplianceAssessment.created_at.desc()).all()
    return assessments

@router.get(
    "/{project_id}/requirements/{requirement_id}/compliance",
    response_model=ComplianceAssessmentResponse,
)
def get_requirement_compliance(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> ComplianceAssessmentResponse:
    """
    Get detailed compliance assessment, evidence, gap analysis, and risk analysis for a single requirement.
    """
    verify_project(db, current_user, project_id)

    assessment = db.query(ComplianceAssessment).filter(
        ComplianceAssessment.requirement_id == requirement_id,
        ComplianceAssessment.rfp_project_id == project_id,
        ComplianceAssessment.organization_id == current_user.organization_id
    ).first()

    if not assessment:
        # If not evaluated yet, trigger evaluation on the fly for single requirement
        assessment = compliance_service.evaluate_requirement_compliance(
            db=db,
            requirement_id=requirement_id,
            organization_id=current_user.organization_id
        )

    return assessment

@router.patch(
    "/{project_id}/requirements/{requirement_id}/compliance",
    response_model=ComplianceAssessmentResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM, RoleEnum.VP]))]
)
def update_requirement_compliance_review(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    data: ComplianceAssessmentUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> ComplianceAssessmentResponse:
    """
    Perform human review update on compliance assessment (change status, review_status, reviewer comments).
    Requires PRODUCT_TEAM or VP role.
    """
    verify_project(db, current_user, project_id)

    assessment = db.query(ComplianceAssessment).filter(
        ComplianceAssessment.requirement_id == requirement_id,
        ComplianceAssessment.rfp_project_id == project_id,
        ComplianceAssessment.organization_id == current_user.organization_id
    ).first()

    if not assessment:
        raise HTTPException(status_code=404, detail="Compliance assessment not found for requirement.")

    update_data = data.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(assessment, field, val)

    assessment.reviewed_by_id = current_user.id
    assessment.reviewed_at = datetime.now(timezone.utc)
    assessment.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(assessment)
    return assessment
