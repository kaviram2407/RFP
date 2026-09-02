from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.api import deps
from app.models.user import User, RoleEnum
from app.models.rfp_project import RFPProject
from app.models.requirement import Requirement
from app.models.previous_proposal import (
    PreviousProposal,
    PreviousProposalVersion,
    PreviousProposalSection,
    ProposalOutcomeEnum,
    ProposalStatusEnum,
)
from app.models.rfp_document import ProcessingStatusEnum
from app.schemas.previous_proposal import (
    PreviousProposalCreate,
    PreviousProposalUpdate,
    PreviousProposalVersionCreate,
    PreviousProposalResponse,
    PreviousProposalVersionResponse,
    HistoricalProposalSearchRequest,
    HistoricalProposalSearchResponse,
    ProposalRetrievalResultResponse,
)
from app.services import proposal_service
from app.services.proposal_retrieval import previous_proposal_retrieval_service

router = APIRouter()

@router.post(
    "/previous-proposals",
    response_model=PreviousProposalResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def create_previous_proposal(
    data: PreviousProposalCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> PreviousProposalResponse:
    """
    Create a new Previous Proposal record.
    Requires PRODUCT_TEAM role.
    """
    initial_status = data.status
    if data.raw_content and data.status == ProposalStatusEnum.DRAFT:
        initial_status = ProposalStatusEnum.APPROVED

    prop = PreviousProposal(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        created_by_id=current_user.id,
        title=data.title,
        proposal_reference=data.proposal_reference,
        customer_name=data.customer_name,
        description=data.description,
        proposal_date=data.proposal_date or datetime.now(timezone.utc),
        outcome=data.outcome,
        status=initial_status,
    )
    db.add(prop)
    db.commit()

    if data.raw_content:
        ver = PreviousProposalVersion(
            id=uuid.uuid4(),
            organization_id=current_user.organization_id,
            previous_proposal_id=prop.id,
            version_number=1,
            raw_content=data.raw_content,
            processing_status=ProcessingStatusEnum.PENDING,
        )
        db.add(ver)
        db.commit()
        proposal_service.process_proposal_version(db, ver.id)

    db.refresh(prop)
    return prop

@router.get(
    "/previous-proposals",
    response_model=List[PreviousProposalResponse],
)
def list_previous_proposals(
    outcome: Optional[ProposalOutcomeEnum] = Query(None),
    status: Optional[ProposalStatusEnum] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> List[PreviousProposalResponse]:
    """
    List previous proposals for the organization with optional outcome and status filters.
    Accessible to all authenticated roles.
    """
    query = db.query(PreviousProposal).filter(
        PreviousProposal.organization_id == current_user.organization_id
    )

    if outcome:
        query = query.filter(PreviousProposal.outcome == outcome)
    if status:
        query = query.filter(PreviousProposal.status == status)

    props = query.order_by(PreviousProposal.created_at.desc()).all()
    return props

@router.get(
    "/previous-proposals/{proposal_id}",
    response_model=PreviousProposalResponse,
)
def get_previous_proposal(
    proposal_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> PreviousProposalResponse:
    """
    Get single previous proposal details & version history.
    Accessible to all authenticated roles.
    """
    prop = db.query(PreviousProposal).filter(
        PreviousProposal.id == proposal_id,
        PreviousProposal.organization_id == current_user.organization_id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Previous proposal not found.")
    return prop

@router.patch(
    "/previous-proposals/{proposal_id}",
    response_model=PreviousProposalResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def update_previous_proposal(
    proposal_id: uuid.UUID,
    data: PreviousProposalUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> PreviousProposalResponse:
    """
    Update previous proposal metadata or lifecycle status (DRAFT, APPROVED, ARCHIVED).
    Requires PRODUCT_TEAM role.
    """
    prop = db.query(PreviousProposal).filter(
        PreviousProposal.id == proposal_id,
        PreviousProposal.organization_id == current_user.organization_id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Previous proposal not found.")

    update_data = data.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(prop, field, val)

    if data.status == ProposalStatusEnum.ARCHIVED:
        prop.archived_at = datetime.now(timezone.utc)

    prop.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(prop)
    return prop

@router.post(
    "/previous-proposals/{proposal_id}/versions",
    response_model=PreviousProposalVersionResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def add_proposal_version(
    proposal_id: uuid.UUID,
    data: PreviousProposalVersionCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> PreviousProposalVersionResponse:
    """
    Add a new version to an existing previous proposal.
    Requires PRODUCT_TEAM role.
    """
    prop = db.query(PreviousProposal).filter(
        PreviousProposal.id == proposal_id,
        PreviousProposal.organization_id == current_user.organization_id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Previous proposal not found.")

    next_ver_num = len(prop.versions) + 1

    ver = PreviousProposalVersion(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        previous_proposal_id=prop.id,
        version_number=next_ver_num,
        original_filename=data.original_filename,
        raw_content=data.raw_content,
        processing_status=ProcessingStatusEnum.PENDING,
    )
    db.add(ver)
    db.commit()

    proposal_service.process_proposal_version(db, ver.id)
    db.refresh(ver)
    return ver

@router.post(
    "/previous-proposals/search",
    response_model=HistoricalProposalSearchResponse,
)
def search_previous_proposals(
    data: HistoricalProposalSearchRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> HistoricalProposalSearchResponse:
    """
    Perform hybrid semantic + lexical search over APPROVED historical proposals.
    Accessible to all authenticated roles.
    """
    results = previous_proposal_retrieval_service.search_proposals(
        db=db,
        organization_id=current_user.organization_id,
        query_text=data.query,
        top_k=data.top_k,
        outcome=data.outcome,
        date_from=data.date_from,
        date_to=data.date_to,
    )

    res_items = [
        ProposalRetrievalResultResponse(
            section_id=r.section_id,
            proposal_id=r.proposal_id,
            proposal_version_id=r.proposal_version_id,
            proposal_title=r.proposal_title,
            proposal_reference=r.proposal_reference,
            customer_name=r.customer_name,
            proposal_date=r.proposal_date,
            outcome=r.outcome,
            status=r.status,
            section_title=r.section_title,
            content=r.content,
            final_score=r.final_score,
            semantic_score=r.semantic_score,
            lexical_score=r.lexical_score,
            recency_score=r.recency_score,
            source_metadata=r.source_metadata,
            source_class=r.source_class,
        )
        for r in results
    ]

    return HistoricalProposalSearchResponse(
        query=data.query,
        total=len(res_items),
        results=res_items
    )

@router.post(
    "/rfp-projects/{project_id}/requirements/{requirement_id}/find-previous-proposals",
    response_model=HistoricalProposalSearchResponse,
)
def find_previous_proposals_for_requirement(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    top_k: int = Query(5, ge=1, le=20),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> HistoricalProposalSearchResponse:
    """
    Find historical proposal evidence for a specific RFP requirement.
    Accessible to all authenticated roles.
    """
    req = db.query(Requirement).filter(
        Requirement.id == requirement_id,
        Requirement.rfp_project_id == project_id,
        Requirement.organization_id == current_user.organization_id
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found.")

    query_text = f"{req.title} {req.description}"
    results = previous_proposal_retrieval_service.search_proposals(
        db=db,
        organization_id=current_user.organization_id,
        query_text=query_text,
        top_k=top_k,
    )

    res_items = [
        ProposalRetrievalResultResponse(
            section_id=r.section_id,
            proposal_id=r.proposal_id,
            proposal_version_id=r.proposal_version_id,
            proposal_title=r.proposal_title,
            proposal_reference=r.proposal_reference,
            customer_name=r.customer_name,
            proposal_date=r.proposal_date,
            outcome=r.outcome,
            status=r.status,
            section_title=r.section_title,
            content=r.content,
            final_score=r.final_score,
            semantic_score=r.semantic_score,
            lexical_score=r.lexical_score,
            recency_score=r.recency_score,
            source_metadata=r.source_metadata,
            source_class=r.source_class,
        )
        for r in results
    ]

    return HistoricalProposalSearchResponse(
        query=query_text,
        total=len(res_items),
        results=res_items
    )
