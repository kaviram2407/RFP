import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.schemas.proposal import (
    ProposalVersionResponse,
    ProposalApprovalRequest,
    ProposalApprovalResponse,
    ProposalApprovalStatusResponse,
)
from app.services.approval_workflow import approval_workflow_service
from app.api.routes.proposal import _build_version_response

router = APIRouter()

def _build_approval_response(approval, db: Session) -> ProposalApprovalResponse:
    resp = ProposalApprovalResponse.model_validate(approval)
    if approval.reviewer:
        resp.reviewer_name = approval.reviewer.full_name or approval.reviewer.email
    return resp

@router.post(
    "/proposals/{proposal_id}/versions/{version_id}/submit",
    response_model=ProposalVersionResponse
)
def submit_proposal_version_for_review(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    version = approval_workflow_service.submit_for_review(
        db=db,
        proposal_id=proposal_id,
        version_id=version_id,
        user=current_user
    )
    return _build_version_response(version, db)

@router.post(
    "/proposals/{proposal_id}/versions/{version_id}/review",
    response_model=ProposalApprovalResponse
)
def review_proposal_version(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    payload: ProposalApprovalRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    approval_obj = approval_workflow_service.review_proposal_version(
        db=db,
        proposal_id=proposal_id,
        version_id=version_id,
        decision_str=payload.decision,
        comment=payload.comment,
        user=current_user
    )
    return _build_approval_response(approval_obj, db)

@router.get(
    "/proposals/{proposal_id}/versions/{version_id}/approval-status",
    response_model=ProposalApprovalStatusResponse
)
def get_proposal_approval_status(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    status_dict = approval_workflow_service.get_approval_status(
        db=db,
        proposal_id=proposal_id,
        version_id=version_id,
        user=current_user
    )
    return ProposalApprovalStatusResponse(**status_dict)

@router.get(
    "/proposals/{proposal_id}/versions/{version_id}/approval-history",
    response_model=List[ProposalApprovalResponse]
)
def get_proposal_approval_history(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    approvals = approval_workflow_service.get_approval_history(
        db=db,
        proposal_id=proposal_id,
        version_id=version_id,
        user=current_user
    )
    return [_build_approval_response(a, db) for a in approvals]

@router.post(
    "/proposals/{proposal_id}/versions/{version_id}/revisions",
    response_model=ProposalVersionResponse,
    status_code=status.HTTP_201_CREATED
)
def create_proposal_revision(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    new_version = approval_workflow_service.create_revision(
        db=db,
        proposal_id=proposal_id,
        source_version_id=version_id,
        user=current_user
    )
    return _build_version_response(new_version, db)
