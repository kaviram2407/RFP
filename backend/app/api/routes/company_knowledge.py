from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.api import deps
from app.models.user import User, RoleEnum
from app.models.rfp_project import RFPProject
from app.models.requirement import Requirement
from app.models.company_knowledge import (
    CompanyKnowledgeDocument,
    KnowledgeDocumentVersion,
    KnowledgeChunk,
    KnowledgeTypeEnum,
    KnowledgeStatusEnum,
    AuthorityLevelEnum,
)
from app.models.rfp_document import ProcessingStatusEnum
from app.schemas.company_knowledge import (
    KnowledgeDocumentCreate,
    KnowledgeDocumentUpdate,
    KnowledgeVersionCreate,
    CompanyKnowledgeDocumentResponse,
    KnowledgeVersionResponse,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    HybridRetrievalResultResponse,
)
from app.services import knowledge_service
from app.services.hybrid_retrieval import hybrid_retrieval_service

router = APIRouter()

@router.post(
    "/company-knowledge",
    response_model=CompanyKnowledgeDocumentResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def create_knowledge_document(
    data: KnowledgeDocumentCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> CompanyKnowledgeDocumentResponse:
    """
    Create a new Company Knowledge Document.
    Requires PRODUCT_TEAM role.
    """
    initial_status = KnowledgeStatusEnum.ACTIVE if data.raw_content else KnowledgeStatusEnum.DRAFT

    doc = CompanyKnowledgeDocument(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        created_by_id=current_user.id,
        title=data.title,
        description=data.description,
        knowledge_type=data.knowledge_type,
        source_name=data.source_name,
        source_reference=data.source_reference,
        status=initial_status,
        authority_level=data.authority_level,
    )

    db.add(doc)
    db.commit()

    # Create Version 1 if raw_content was provided
    if data.raw_content:
        ver = KnowledgeDocumentVersion(
            id=uuid.uuid4(),
            organization_id=current_user.organization_id,
            knowledge_document_id=doc.id,
            version_number=1,
            raw_content=data.raw_content,
            processing_status=ProcessingStatusEnum.PENDING,
        )
        db.add(ver)
        db.commit()
        # Ingest Version 1 synchronously for immediate availability
        knowledge_service.process_knowledge_version(db, ver.id)

    db.refresh(doc)
    return doc

@router.get(
    "/company-knowledge",
    response_model=List[CompanyKnowledgeDocumentResponse],
)
def list_knowledge_documents(
    knowledge_type: Optional[KnowledgeTypeEnum] = Query(None),
    status: Optional[KnowledgeStatusEnum] = Query(None),
    authority_level: Optional[AuthorityLevelEnum] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> List[CompanyKnowledgeDocumentResponse]:
    """
    List company knowledge documents for the user's organization with optional filters.
    Accessible to all authenticated roles.
    """
    query = db.query(CompanyKnowledgeDocument).filter(
        CompanyKnowledgeDocument.organization_id == current_user.organization_id
    )

    if knowledge_type:
        query = query.filter(CompanyKnowledgeDocument.knowledge_type == knowledge_type)
    if status:
        query = query.filter(CompanyKnowledgeDocument.status == status)
    if authority_level:
        query = query.filter(CompanyKnowledgeDocument.authority_level == authority_level)

    docs = query.order_by(CompanyKnowledgeDocument.created_at.desc()).all()
    return docs

@router.get(
    "/company-knowledge/{document_id}",
    response_model=CompanyKnowledgeDocumentResponse,
)
def get_knowledge_document(
    document_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> CompanyKnowledgeDocumentResponse:
    """
    Get single company knowledge document details & version history.
    Accessible to all authenticated roles.
    """
    doc = db.query(CompanyKnowledgeDocument).filter(
        CompanyKnowledgeDocument.id == document_id,
        CompanyKnowledgeDocument.organization_id == current_user.organization_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Knowledge document not found.")
    return doc

@router.patch(
    "/company-knowledge/{document_id}",
    response_model=CompanyKnowledgeDocumentResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def update_knowledge_document(
    document_id: uuid.UUID,
    data: KnowledgeDocumentUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> CompanyKnowledgeDocumentResponse:
    """
    Update knowledge document metadata or lifecycle status (DRAFT, ACTIVE, ARCHIVED).
    Requires PRODUCT_TEAM role.
    """
    doc = db.query(CompanyKnowledgeDocument).filter(
        CompanyKnowledgeDocument.id == document_id,
        CompanyKnowledgeDocument.organization_id == current_user.organization_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Knowledge document not found.")

    update_data = data.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(doc, field, val)

    if data.status == KnowledgeStatusEnum.ARCHIVED:
        doc.archived_at = datetime.now(timezone.utc)

    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return doc

@router.post(
    "/company-knowledge/{document_id}/versions",
    response_model=KnowledgeVersionResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def add_knowledge_version(
    document_id: uuid.UUID,
    data: KnowledgeVersionCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> KnowledgeVersionResponse:
    """
    Add a new version to an existing knowledge document.
    Requires PRODUCT_TEAM role.
    """
    doc = db.query(CompanyKnowledgeDocument).filter(
        CompanyKnowledgeDocument.id == document_id,
        CompanyKnowledgeDocument.organization_id == current_user.organization_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Knowledge document not found.")

    next_ver_num = len(doc.versions) + 1

    ver = KnowledgeDocumentVersion(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        knowledge_document_id=doc.id,
        version_number=next_ver_num,
        original_filename=data.original_filename,
        raw_content=data.raw_content,
        processing_status=ProcessingStatusEnum.PENDING,
    )
    db.add(ver)
    db.commit()

    # Trigger processing
    knowledge_service.process_knowledge_version(db, ver.id)
    db.refresh(ver)
    return ver

@router.post(
    "/knowledge/search",
    response_model=KnowledgeSearchResponse,
)
def search_company_knowledge(
    data: KnowledgeSearchRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> KnowledgeSearchResponse:
    """
    Perform hybrid semantic + lexical search over active company knowledge.
    Accessible to all authenticated roles.
    """
    results = hybrid_retrieval_service.search_knowledge(
        db=db,
        organization_id=current_user.organization_id,
        query_text=data.query,
        top_k=data.top_k,
        knowledge_types=data.knowledge_types,
        authority_levels=data.authority_levels,
    )

    res_items = [
        HybridRetrievalResultResponse(
            chunk_id=r.chunk_id,
            knowledge_document_id=r.knowledge_document_id,
            knowledge_version_id=r.knowledge_version_id,
            title=r.title,
            content=r.content,
            final_score=r.final_score,
            semantic_score=r.semantic_score,
            lexical_score=r.lexical_score,
            authority_level=r.authority_level,
            knowledge_type=r.knowledge_type,
            source_metadata=r.source_metadata,
            created_at=r.created_at,
        )
        for r in results
    ]

    return KnowledgeSearchResponse(
        query=data.query,
        total=len(res_items),
        results=res_items
    )

@router.post(
    "/rfp-projects/{project_id}/requirements/{requirement_id}/find-evidence",
    response_model=KnowledgeSearchResponse,
)
def find_evidence_for_requirement(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    top_k: int = Query(5, ge=1, le=20),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> KnowledgeSearchResponse:
    """
    Find relevant company knowledge evidence for a specific RFP requirement.
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
    results = hybrid_retrieval_service.search_knowledge(
        db=db,
        organization_id=current_user.organization_id,
        query_text=query_text,
        top_k=top_k,
    )

    res_items = [
        HybridRetrievalResultResponse(
            chunk_id=r.chunk_id,
            knowledge_document_id=r.knowledge_document_id,
            knowledge_version_id=r.knowledge_version_id,
            title=r.title,
            content=r.content,
            final_score=r.final_score,
            semantic_score=r.semantic_score,
            lexical_score=r.lexical_score,
            authority_level=r.authority_level,
            knowledge_type=r.knowledge_type,
            source_metadata=r.source_metadata,
            created_at=r.created_at,
        )
        for r in results
    ]

    return KnowledgeSearchResponse(
        query=query_text,
        total=len(res_items),
        results=res_items
    )
