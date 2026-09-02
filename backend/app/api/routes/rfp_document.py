from fastapi import APIRouter, Depends, Query, File, UploadFile, status
from sqlalchemy.orm import Session
from typing import Optional, List
import uuid

from app.api import deps
from app.models.user import User, RoleEnum
from app.schemas.rfp_document import (
    RFPDocumentResponse,
    RFPDocumentListResponse,
    DocumentVersionResponse,
    PresignedUrlResponse,
)
from app.services import rfp_document as doc_service

router = APIRouter()

@router.post(
    "/{project_id}/documents",
    response_model=RFPDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def upload_rfp_document(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RFPDocumentResponse:
    """
    Upload a new RFP Document (Creates Version 1).
    Requires PRODUCT_TEAM role.
    Supported types: .pdf, .docx, .xlsx, .pptx
    """
    return doc_service.upload_document(db, current_user, project_id, file)

@router.post(
    "/{project_id}/documents/{document_id}/versions",
    response_model=RFPDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def upload_new_document_version(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RFPDocumentResponse:
    """
    Upload a new version for an existing RFP Document.
    Requires PRODUCT_TEAM role.
    """
    return doc_service.upload_new_version(db, current_user, project_id, document_id, file)

@router.get(
    "/{project_id}/documents",
    response_model=RFPDocumentListResponse,
)
def list_rfp_documents(
    project_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RFPDocumentListResponse:
    """
    List all documents for an RFP Project.
    Accessible to all authenticated roles.
    """
    items, total, pages = doc_service.list_documents(
        db, current_user, project_id, page=page, page_size=page_size
    )
    return RFPDocumentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages
    )

@router.get(
    "/{project_id}/documents/{document_id}",
    response_model=RFPDocumentResponse,
)
def get_rfp_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RFPDocumentResponse:
    """
    Get RFP Document details including current version metadata.
    Accessible to all authenticated roles.
    """
    return doc_service.get_document(db, current_user, project_id, document_id)

@router.get(
    "/{project_id}/documents/{document_id}/versions",
    response_model=List[DocumentVersionResponse],
)
def get_rfp_document_versions(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> List[DocumentVersionResponse]:
    """
    Get full version history for an RFP Document.
    Accessible to all authenticated roles.
    """
    return doc_service.get_document_versions(db, current_user, project_id, document_id)

@router.get(
    "/{project_id}/documents/{document_id}/download",
    response_model=PresignedUrlResponse,
)
def download_rfp_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    version_id: Optional[uuid.UUID] = Query(None, description="Optional specific version ID to download"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> PresignedUrlResponse:
    """
    Generate a short-lived presigned download URL for a document version.
    Accessible to all authenticated roles.
    """
    url, expires_in = doc_service.generate_download_url(
        db, current_user, project_id, document_id, version_id=version_id
    )
    return PresignedUrlResponse(download_url=url, expires_in_seconds=expires_in)

@router.post(
    "/{project_id}/documents/{document_id}/archive",
    response_model=RFPDocumentResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def archive_rfp_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> RFPDocumentResponse:
    """
    Soft archive an RFP Document.
    Requires PRODUCT_TEAM role.
    """
    return doc_service.archive_document(db, current_user, project_id, document_id)
