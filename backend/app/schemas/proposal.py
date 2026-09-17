from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

from app.models.proposal import (
    ProposalStatusEnum,
    GenerationStatusEnum,
    SectionReviewStatusEnum,
)

# Evidence Response Schema
class GeneratedContentEvidenceResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    proposal_section_id: uuid.UUID
    source_type: str
    source_id: Optional[uuid.UUID] = None
    source_title: str
    citation_reference: str
    evidence_text: str
    relevance_score: float = 1.0
    authority_level: str = "AUTHORITATIVE"
    is_conflicting: bool = False
    conflict_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Unsupported Claim Response Schema
class UnsupportedClaimResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    proposal_section_id: uuid.UUID
    claim: str
    reason: str
    severity: str = "HIGH"
    review_required: bool = True
    created_at: datetime

    class Config:
        from_attributes = True

# Proposal Section Requirement Mapping
class ProposalSectionRequirementResponse(BaseModel):
    id: uuid.UUID
    proposal_section_id: uuid.UUID
    requirement_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

# Proposal Section Schemas
class ProposalSectionBase(BaseModel):
    section_key: str
    section_title: str
    section_order: int = 1
    content: str = ""

class ProposalSectionCreate(ProposalSectionBase):
    requirement_ids: Optional[List[uuid.UUID]] = []

class ProposalSectionUpdate(BaseModel):
    section_title: Optional[str] = None
    section_order: Optional[int] = None
    content: Optional[str] = None
    review_status: Optional[SectionReviewStatusEnum] = None
    reviewer_comments: Optional[str] = None

class ProposalSectionResponse(ProposalSectionBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    proposal_id: uuid.UUID
    proposal_version_id: uuid.UUID
    ai_generated_content: Optional[str] = None
    status: ProposalStatusEnum = ProposalStatusEnum.DRAFT
    generation_status: GenerationStatusEnum = GenerationStatusEnum.PENDING
    review_status: SectionReviewStatusEnum = SectionReviewStatusEnum.PENDING_REVIEW
    confidence_score: float = 0.0
    review_required: bool = True
    reviewer_comments: Optional[str] = None
    reviewed_by_id: Optional[uuid.UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    evidence_list: List[GeneratedContentEvidenceResponse] = []
    unsupported_claims: List[UnsupportedClaimResponse] = []
    requirement_ids: List[uuid.UUID] = []

    class Config:
        from_attributes = True

# Proposal Version Schemas
class ProposalVersionBase(BaseModel):
    version_number: int = 1

class ProposalVersionCreate(BaseModel):
    copy_from_version_id: Optional[uuid.UUID] = None

class ProposalVersionResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    proposal_id: uuid.UUID
    version_number: int
    status: ProposalStatusEnum
    generation_status: GenerationStatusEnum
    generation_started_at: Optional[datetime] = None
    generation_completed_at: Optional[datetime] = None
    generation_error: Optional[str] = None
    created_by_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    sections: List[ProposalSectionResponse] = []

    class Config:
        from_attributes = True

# Proposal Schemas
class ProposalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    custom_sections: Optional[List[ProposalSectionCreate]] = None

class ProposalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProposalStatusEnum] = None

class ProposalResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    rfp_project_id: uuid.UUID
    title: str
    description: Optional[str] = None
    status: ProposalStatusEnum
    current_version_id: Optional[uuid.UUID] = None
    created_by_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    current_version: Optional[ProposalVersionResponse] = None

    class Config:
        from_attributes = True

# Structured LLM Output Validation Schemas
class LLMClaimSchema(BaseModel):
    claim: str
    support_status: str = Field(..., description="SUPPORTED | PARTIALLY_SUPPORTED | UNSUPPORTED")
    evidence_ids: List[str] = []
    requires_review: bool = True

class LLMEvidenceSchema(BaseModel):
    source_type: str = Field(..., description="COMPANY_KNOWLEDGE | PREVIOUS_PROPOSAL | RFP_DOCUMENT | REQUIREMENT")
    source_id: Optional[str] = None
    source_title: str = ""
    citation_reference: str = ""
    evidence_text: str = ""
    relevance_score: float = 1.0
    authority_level: str = "AUTHORITATIVE"
    is_conflicting: bool = False
    conflict_notes: Optional[str] = None

class LLMUnsupportedClaimSchema(BaseModel):
    claim: str
    reason: str
    severity: str = "HIGH"

class LLMSectionOutputSchema(BaseModel):
    section_title: str
    section_content: str
    confidence_score: float = Field(0.0, ge=0.0, le=1.0)
    review_required: bool = True
    key_claims: List[LLMClaimSchema] = []
    evidence: List[LLMEvidenceSchema] = []
    unsupported_claims: List[LLMUnsupportedClaimSchema] = []
    assumptions: List[str] = []
