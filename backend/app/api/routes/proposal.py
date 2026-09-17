import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.api import deps
from app.models.user import User, RoleEnum
from app.models.rfp_project import RFPProject
from app.models.proposal import (
    Proposal,
    ProposalVersion,
    ProposalSection,
    ProposalSectionRequirement,
    GeneratedContentEvidence,
    UnsupportedClaim,
    ProposalStatusEnum,
    GenerationStatusEnum,
    SectionReviewStatusEnum,
)
from app.schemas.proposal import (
    ProposalCreate,
    ProposalUpdate,
    ProposalResponse,
    ProposalVersionCreate,
    ProposalVersionResponse,
    ProposalSectionCreate,
    ProposalSectionUpdate,
    ProposalSectionResponse,
    GeneratedContentEvidenceResponse,
    UnsupportedClaimResponse,
)
from app.services.proposal_generation import proposal_generation_service

router = APIRouter()

DEFAULT_PROPOSAL_SECTIONS = [
    {"key": "executive_summary", "title": "1. Executive Summary", "order": 1},
    {"key": "understanding_requirements", "title": "2. Understanding of Requirements", "order": 2},
    {"key": "proposed_solution", "title": "3. Proposed Solution", "order": 3},
    {"key": "technical_architecture", "title": "4. Technical Architecture", "order": 4},
    {"key": "implementation_approach", "title": "5. Implementation Approach", "order": 5},
    {"key": "security_compliance", "title": "6. Security & Compliance", "order": 6},
    {"key": "support_operations", "title": "7. Support & Operations", "order": 7},
    {"key": "conclusion", "title": "8. Conclusion & Next Steps", "order": 8},
]

# Helper to construct ProposalResponse
def _build_proposal_response(proposal: Proposal, db: Session) -> ProposalResponse:
    resp = ProposalResponse.model_validate(proposal)
    if proposal.current_version_id:
        v = db.query(ProposalVersion).filter(ProposalVersion.id == proposal.current_version_id).first()
        if v:
            resp.current_version = _build_version_response(v, db)
    return resp

def _build_version_response(version: ProposalVersion, db: Session) -> ProposalVersionResponse:
    v_resp = ProposalVersionResponse.model_validate(version)
    sections = db.query(ProposalSection).filter(
        ProposalSection.proposal_version_id == version.id
    ).order_by(ProposalSection.section_order.asc()).all()

    v_resp.sections = [_build_section_response(sec, db) for sec in sections]
    return v_resp

def _build_section_response(section: ProposalSection, db: Session) -> ProposalSectionResponse:
    sec_resp = ProposalSectionResponse.model_validate(section)

    ev_list = db.query(GeneratedContentEvidence).filter(
        GeneratedContentEvidence.proposal_section_id == section.id
    ).all()
    sec_resp.evidence_list = [GeneratedContentEvidenceResponse.model_validate(ev) for ev in ev_list]

    claims = db.query(UnsupportedClaim).filter(
        UnsupportedClaim.proposal_section_id == section.id
    ).all()
    sec_resp.unsupported_claims = [UnsupportedClaimResponse.model_validate(c) for c in claims]

    req_mappings = db.query(ProposalSectionRequirement).filter(
        ProposalSectionRequirement.proposal_section_id == section.id
    ).all()
    sec_resp.requirement_ids = [m.requirement_id for m in req_mappings]

    return sec_resp


@router.post("/rfp-projects/{project_id}/proposals", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
def create_proposal(
    project_id: uuid.UUID,
    payload: ProposalCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if current_user.role != RoleEnum.PRODUCT_TEAM:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Product Team users can create proposals.")

    project = db.query(RFPProject).filter(
        RFPProject.id == project_id,
        RFPProject.organization_id == current_user.organization_id
    ).first()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RFP project not found.")

    proposal = Proposal(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        rfp_project_id=project_id,
        title=payload.title,
        description=payload.description,
        status=ProposalStatusEnum.DRAFT,
        created_by_id=current_user.id,
    )
    db.add(proposal)
    db.flush()

    # Create Initial Version 1
    version = ProposalVersion(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        proposal_id=proposal.id,
        version_number=1,
        status=ProposalStatusEnum.DRAFT,
        generation_status=GenerationStatusEnum.PENDING,
        created_by_id=current_user.id,
    )
    db.add(version)
    db.flush()

    proposal.current_version_id = version.id

    # Populate sections
    sections_input = payload.custom_sections if payload.custom_sections else [
        ProposalSectionCreate(
            section_key=item["key"],
            section_title=item["title"],
            section_order=item["order"],
            content=""
        )
        for item in DEFAULT_PROPOSAL_SECTIONS
    ]

    for sec_data in sections_input:
        sec_obj = ProposalSection(
            id=uuid.uuid4(),
            organization_id=current_user.organization_id,
            proposal_id=proposal.id,
            proposal_version_id=version.id,
            section_key=sec_data.section_key,
            section_title=sec_data.section_title,
            section_order=sec_data.section_order,
            content=sec_data.content or "",
            status=ProposalStatusEnum.DRAFT,
            generation_status=GenerationStatusEnum.PENDING,
            review_status=SectionReviewStatusEnum.PENDING_REVIEW,
        )
        db.add(sec_obj)
        db.flush()

        if sec_data.requirement_ids:
            for req_id in sec_data.requirement_ids:
                mapping = ProposalSectionRequirement(
                    id=uuid.uuid4(),
                    organization_id=current_user.organization_id,
                    proposal_section_id=sec_obj.id,
                    requirement_id=req_id,
                )
                db.add(mapping)

    db.commit()
    db.refresh(proposal)
    return _build_proposal_response(proposal, db)


@router.get("/rfp-projects/{project_id}/proposals", response_model=List[ProposalResponse])
def list_proposals(
    project_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    project = db.query(RFPProject).filter(
        RFPProject.id == project_id,
        RFPProject.organization_id == current_user.organization_id
    ).first()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RFP project not found.")

    proposals = db.query(Proposal).filter(
        Proposal.rfp_project_id == project_id,
        Proposal.organization_id == current_user.organization_id
    ).order_by(Proposal.created_at.desc()).all()

    return [_build_proposal_response(p, db) for p in proposals]


@router.get("/proposals/{proposal_id}", response_model=ProposalResponse)
def get_proposal(
    proposal_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.organization_id == current_user.organization_id
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    return _build_proposal_response(proposal, db)


@router.post("/proposals/{proposal_id}/versions", response_model=ProposalVersionResponse, status_code=status.HTTP_201_CREATED)
def create_proposal_version(
    proposal_id: uuid.UUID,
    payload: ProposalVersionCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if current_user.role != RoleEnum.PRODUCT_TEAM:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Product Team users can create proposal versions.")

    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.organization_id == current_user.organization_id
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    latest_ver = db.query(ProposalVersion).filter(
        ProposalVersion.proposal_id == proposal_id
    ).order_by(ProposalVersion.version_number.desc()).first()

    next_ver_num = (latest_ver.version_number + 1) if latest_ver else 1

    new_version = ProposalVersion(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        proposal_id=proposal.id,
        version_number=next_ver_num,
        status=ProposalStatusEnum.DRAFT,
        generation_status=GenerationStatusEnum.PENDING,
        created_by_id=current_user.id,
    )
    db.add(new_version)
    db.flush()

    source_ver_id = payload.copy_from_version_id or (latest_ver.id if latest_ver else None)

    if source_ver_id:
        src_sections = db.query(ProposalSection).filter(
            ProposalSection.proposal_version_id == source_ver_id
        ).order_by(ProposalSection.section_order.asc()).all()

        for sec in src_sections:
            new_sec = ProposalSection(
                id=uuid.uuid4(),
                organization_id=current_user.organization_id,
                proposal_id=proposal.id,
                proposal_version_id=new_version.id,
                section_key=sec.section_key,
                section_title=sec.section_title,
                section_order=sec.section_order,
                content=sec.content,
                ai_generated_content=sec.ai_generated_content,
                status=sec.status,
                generation_status=GenerationStatusEnum.PENDING,
                review_status=SectionReviewStatusEnum.PENDING_REVIEW,
                confidence_score=sec.confidence_score,
                review_required=sec.review_required,
            )
            db.add(new_sec)
            db.flush()

            req_mappings = db.query(ProposalSectionRequirement).filter(
                ProposalSectionRequirement.proposal_section_id == sec.id
            ).all()

            for m in req_mappings:
                db.add(ProposalSectionRequirement(
                    id=uuid.uuid4(),
                    organization_id=current_user.organization_id,
                    proposal_section_id=new_sec.id,
                    requirement_id=m.requirement_id
                ))

    proposal.current_version_id = new_version.id
    db.commit()
    db.refresh(new_version)

    return _build_version_response(new_version, db)


@router.get("/proposals/{proposal_id}/versions", response_model=List[ProposalVersionResponse])
def list_proposal_versions(
    proposal_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.organization_id == current_user.organization_id
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    versions = db.query(ProposalVersion).filter(
        ProposalVersion.proposal_id == proposal_id,
        ProposalVersion.organization_id == current_user.organization_id
    ).order_by(ProposalVersion.version_number.desc()).all()

    return [_build_version_response(v, db) for v in versions]


@router.post("/proposals/{proposal_id}/versions/{version_id}/generate", response_model=ProposalVersionResponse)
def generate_proposal_version(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if current_user.role != RoleEnum.PRODUCT_TEAM:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Product Team users can generate proposal versions.")

    version = db.query(ProposalVersion).filter(
        ProposalVersion.id == version_id,
        ProposalVersion.proposal_id == proposal_id,
        ProposalVersion.organization_id == current_user.organization_id
    ).first()

    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal version not found.")

    background_tasks.add_task(
        proposal_generation_service.generate_proposal_version,
        db, version_id, current_user.organization_id
    )

    version.generation_status = GenerationStatusEnum.PROCESSING
    db.commit()
    db.refresh(version)

    return _build_version_response(version, db)


@router.post("/proposals/{proposal_id}/versions/{version_id}/sections/{section_id}/generate", response_model=ProposalSectionResponse)
def generate_proposal_section(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    section_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if current_user.role != RoleEnum.PRODUCT_TEAM:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Product Team users can generate sections.")

    section = db.query(ProposalSection).filter(
        ProposalSection.id == section_id,
        ProposalSection.proposal_version_id == version_id,
        ProposalSection.proposal_id == proposal_id,
        ProposalSection.organization_id == current_user.organization_id
    ).first()

    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal section not found.")

    sec_updated = proposal_generation_service.generate_section(db, section_id, current_user.organization_id)
    return _build_section_response(sec_updated, db)


@router.post("/proposals/{proposal_id}/versions/{version_id}/sections/{section_id}/regenerate", response_model=ProposalSectionResponse)
def regenerate_proposal_section(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    section_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if current_user.role != RoleEnum.PRODUCT_TEAM:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Product Team users can regenerate sections.")

    return generate_proposal_section(proposal_id, version_id, section_id, db, current_user)


@router.get("/proposals/{proposal_id}/versions/{version_id}/sections/{section_id}", response_model=ProposalSectionResponse)
def get_proposal_section(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    section_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    section = db.query(ProposalSection).filter(
        ProposalSection.id == section_id,
        ProposalSection.proposal_version_id == version_id,
        ProposalSection.proposal_id == proposal_id,
        ProposalSection.organization_id == current_user.organization_id
    ).first()

    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal section not found.")

    return _build_section_response(section, db)


@router.patch("/proposals/{proposal_id}/versions/{version_id}/sections/{section_id}", response_model=ProposalSectionResponse)
def update_proposal_section(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: ProposalSectionUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    section = db.query(ProposalSection).filter(
        ProposalSection.id == section_id,
        ProposalSection.proposal_version_id == version_id,
        ProposalSection.proposal_id == proposal_id,
        ProposalSection.organization_id == current_user.organization_id
    ).first()

    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal section not found.")

    now = datetime.now(timezone.utc)
    if payload.content is not None:
        section.content = payload.content

    if payload.section_title is not None:
        section.section_title = payload.section_title

    if payload.section_order is not None:
        section.section_order = payload.section_order

    if payload.review_status is not None:
        section.review_status = payload.review_status
        section.reviewed_by_id = current_user.id
        section.reviewed_at = now

    if payload.reviewer_comments is not None:
        section.reviewer_comments = payload.reviewer_comments

    section.updated_at = now
    db.commit()
    db.refresh(section)

    return _build_section_response(section, db)


@router.get("/proposals/{proposal_id}/versions/{version_id}/sections/{section_id}/evidence", response_model=List[GeneratedContentEvidenceResponse])
def get_proposal_section_evidence(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    section_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    section = db.query(ProposalSection).filter(
        ProposalSection.id == section_id,
        ProposalSection.proposal_version_id == version_id,
        ProposalSection.proposal_id == proposal_id,
        ProposalSection.organization_id == current_user.organization_id
    ).first()

    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal section not found.")

    ev_list = db.query(GeneratedContentEvidence).filter(
        GeneratedContentEvidence.proposal_section_id == section_id,
        GeneratedContentEvidence.organization_id == current_user.organization_id
    ).all()

    return [GeneratedContentEvidenceResponse.model_validate(ev) for ev in ev_list]


@router.get("/proposals/{proposal_id}/versions/{version_id}/sections/{section_id}/claims", response_model=List[UnsupportedClaimResponse])
def get_proposal_section_claims(
    proposal_id: uuid.UUID,
    version_id: uuid.UUID,
    section_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    section = db.query(ProposalSection).filter(
        ProposalSection.id == section_id,
        ProposalSection.proposal_version_id == version_id,
        ProposalSection.proposal_id == proposal_id,
        ProposalSection.organization_id == current_user.organization_id
    ).first()

    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal section not found.")

    claims = db.query(UnsupportedClaim).filter(
        UnsupportedClaim.proposal_section_id == section_id,
        UnsupportedClaim.organization_id == current_user.organization_id
    ).all()

    return [UnsupportedClaimResponse.model_validate(c) for c in claims]
