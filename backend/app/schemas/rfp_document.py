from pydantic import BaseModel, ConfigDict, UUID4
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.rfp_document import DocumentTypeEnum, DocumentStatusEnum, ProcessingStatusEnum, SourceTypeEnum

class DocumentVersionResponse(BaseModel):
    id: UUID4
    organization_id: UUID4
    rfp_document_id: UUID4
    version_number: int
    original_filename: str
    content_type: str
    file_size_bytes: int
    checksum_sha256: str
    processing_status: ProcessingStatusEnum
    processing_started_at: Optional[datetime] = None
    processing_completed_at: Optional[datetime] = None
    processing_error: Optional[str] = None
    created_by_id: UUID4
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ProcessingStatusResponse(BaseModel):
    status: ProcessingStatusEnum
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None

class DocumentContentBlockResponse(BaseModel):
    id: UUID4
    sequence_number: int
    source_type: SourceTypeEnum
    source_index: int
    text: str
    metadata_json: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)

class DocumentContentResponse(BaseModel):
    id: UUID4
    document_version_id: UUID4
    full_text: str
    character_count: int
    source_unit_count: int
    created_at: datetime
    blocks: List[DocumentContentBlockResponse] = []

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
