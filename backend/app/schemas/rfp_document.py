from pydantic import BaseModel, ConfigDict, UUID4
from typing import Optional, List
from datetime import datetime
from app.models.rfp_document import DocumentTypeEnum, DocumentStatusEnum

class DocumentVersionResponse(BaseModel):
    id: UUID4
    organization_id: UUID4
    rfp_document_id: UUID4
    version_number: int
    original_filename: str
    content_type: str
    file_size_bytes: int
    checksum_sha256: str
    created_by_id: UUID4
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class RFPDocumentResponse(BaseModel):
    id: UUID4
    organization_id: UUID4
    rfp_project_id: UUID4
    created_by_id: UUID4
    name: str
    document_type: DocumentTypeEnum
    status: DocumentStatusEnum
    current_version_id: Optional[UUID4] = None
    current_version: Optional[DocumentVersionResponse] = None
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class RFPDocumentListResponse(BaseModel):
    items: List[RFPDocumentResponse]
    total: int
    page: int
    page_size: int
    pages: int

class PresignedUrlResponse(BaseModel):
    download_url: str
    expires_in_seconds: int
