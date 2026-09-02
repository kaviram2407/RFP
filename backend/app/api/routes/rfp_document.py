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
    ProcessingStatusResponse,
    DocumentContentResponse,
)
from app.services import rfp_document as doc_service
from app.services import document_processing as processing_service
from app.models.rfp_document import DocumentVersion, DocumentContent
from fastapi import HTTPException


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

@router.get(
    "/{project_id}/documents/{document_id}/versions/{version_id}/processing",
    response_model=ProcessingStatusResponse,
)
def get_version_processing_status(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> ProcessingStatusResponse:
    """
    Get processing lifecycle status for a specific document version.
    Accessible to all authenticated roles.
    """
    doc_service.get_document(db, current_user, project_id, document_id)
    version = db.query(DocumentVersion).filter(
        DocumentVersion.id == version_id,
        DocumentVersion.rfp_document_id == document_id,
        DocumentVersion.organization_id == current_user.organization_id
    ).first()
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found.")

    return ProcessingStatusResponse(
        status=version.processing_status,
        started_at=version.processing_started_at,
        completed_at=version.processing_completed_at,
        error=version.processing_error
    )

@router.post(
    "/{project_id}/documents/{document_id}/versions/{version_id}/process",
    response_model=ProcessingStatusResponse,
    dependencies=[Depends(deps.require_role([RoleEnum.PRODUCT_TEAM]))]
)
def trigger_version_processing(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> ProcessingStatusResponse:
    """
    Manually trigger or retry document processing for a version.
    Requires PRODUCT_TEAM role.
    """
    doc_service.get_document(db, current_user, project_id, document_id)
    version = db.query(DocumentVersion).filter(
        DocumentVersion.id == version_id,
        DocumentVersion.rfp_document_id == document_id,
        DocumentVersion.organization_id == current_user.organization_id
    ).first()
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found.")

    updated_version = processing_service.process_document_version(db, version_id)
    return ProcessingStatusResponse(
        status=updated_version.processing_status,
        started_at=updated_version.processing_started_at,
        completed_at=updated_version.processing_completed_at,
        error=updated_version.processing_error
    )

@router.get(
    "/{project_id}/documents/{document_id}/versions/{version_id}/content",
    response_model=DocumentContentResponse,
)
def get_extracted_content(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> DocumentContentResponse:
    """
    Get extracted text content and structured source blocks for a document version.
    Accessible to all authenticated roles.
    """
    doc_service.get_document(db, current_user, project_id, document_id)
    content = db.query(DocumentContent).filter(
        DocumentContent.document_version_id == version_id,
        DocumentContent.organization_id == current_user.organization_id
    ).first()
    if not content:
        raise HTTPException(status_code=404, detail="Extracted content not found or processing not completed.")
    return content

