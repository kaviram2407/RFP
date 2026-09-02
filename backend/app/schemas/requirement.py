from pydantic import BaseModel, ConfigDict, Field, UUID4
from typing import Optional, List
from datetime import datetime
from app.models.requirement import (
    RequirementCategoryEnum,
    RequirementTypeEnum,
    RequirementPriorityEnum,
    RequirementStatusEnum,
    ExtractionStatusEnum,
)

class RequirementEvidenceResponse(BaseModel):
    id: UUID4
    requirement_id: UUID4
    document_version_id: UUID4
    content_block_id: UUID4
    evidence_text: str
    source_type: str
    source_reference: str
    relevance_score: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class RequirementResponse(BaseModel):
    id: UUID4
    organization_id: UUID4
    rfp_project_id: UUID4
    document_version_id: UUID4
    requirement_code: str
    title: str
    description: str
    category: RequirementCategoryEnum
    requirement_type: RequirementTypeEnum
    priority: RequirementPriorityEnum
    mandatory: bool
    confidence_score: float
    status: RequirementStatusEnum
    review_required: bool
    created_at: datetime
    updated_at: datetime
    evidence_list: List[RequirementEvidenceResponse] = []

    model_config = ConfigDict(from_attributes=True)

class RequirementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, min_length=1)
    category: Optional[RequirementCategoryEnum] = None
    requirement_type: Optional[RequirementTypeEnum] = None
    priority: Optional[RequirementPriorityEnum] = None
    mandatory: Optional[bool] = None
    status: Optional[RequirementStatusEnum] = None
    review_required: Optional[bool] = None

class RequirementListResponse(BaseModel):
    items: List[RequirementResponse]
    total: int
    page: int
    page_size: int
    pages: int

class RequirementExtractionStatusResponse(BaseModel):
    status: ExtractionStatusEnum
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
