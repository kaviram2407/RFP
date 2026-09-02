from pydantic import BaseModel, ConfigDict, Field, UUID4
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.company_knowledge import KnowledgeTypeEnum, KnowledgeStatusEnum, AuthorityLevelEnum
from app.models.rfp_document import ProcessingStatusEnum

class KnowledgeDocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    knowledge_type: KnowledgeTypeEnum
    source_name: Optional[str] = None
    source_reference: Optional[str] = None
    authority_level: AuthorityLevelEnum = AuthorityLevelEnum.APPROVED
    raw_content: Optional[str] = None  # Initial content for v1

class KnowledgeDocumentUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    knowledge_type: Optional[KnowledgeTypeEnum] = None
    source_name: Optional[str] = None
    source_reference: Optional[str] = None
    status: Optional[KnowledgeStatusEnum] = None
    authority_level: Optional[AuthorityLevelEnum] = None

class KnowledgeVersionCreate(BaseModel):
    raw_content: str = Field(..., min_length=1)
    original_filename: Optional[str] = None

class KnowledgeVersionResponse(BaseModel):
    id: UUID4
    knowledge_document_id: UUID4
    version_number: int
    original_filename: Optional[str] = None
    processing_status: ProcessingStatusEnum
    processing_started_at: Optional[datetime] = None
    processing_completed_at: Optional[datetime] = None
    processing_error: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CompanyKnowledgeDocumentResponse(BaseModel):
    id: UUID4
    organization_id: UUID4
    created_by_id: UUID4
    title: str
    description: Optional[str] = None
    knowledge_type: KnowledgeTypeEnum
    source_name: Optional[str] = None
    source_reference: Optional[str] = None
    status: KnowledgeStatusEnum
    authority_level: AuthorityLevelEnum
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    versions: List[KnowledgeVersionResponse] = []

    model_config = ConfigDict(from_attributes=True)

class KnowledgeSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(10, ge=1, le=50)
    knowledge_types: Optional[List[KnowledgeTypeEnum]] = None
    authority_levels: Optional[List[AuthorityLevelEnum]] = None

class HybridRetrievalResultResponse(BaseModel):
    chunk_id: UUID4
    knowledge_document_id: UUID4
    knowledge_version_id: UUID4
    title: str
    content: str
    final_score: float
    semantic_score: float
    lexical_score: float
    authority_level: str
    knowledge_type: str
    source_metadata: Optional[Dict[str, Any]] = None
    created_at: str

class KnowledgeSearchResponse(BaseModel):
    query: str
    total: int
    results: List[HybridRetrievalResultResponse]
