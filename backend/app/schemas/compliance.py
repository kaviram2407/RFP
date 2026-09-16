from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

from app.models.compliance import (
    ComplianceStatusEnum,
    ReviewStatusEnum,
    RiskCategoryEnum,
    RiskSeverityEnum,
    GapSeverityEnum,
)

class ComplianceEvidenceBase(BaseModel):
    source_type: str  # CURRENT_RFP, COMPANY_KNOWLEDGE, PREVIOUS_PROPOSAL
    authority_level: str  # AUTHORITATIVE, REFERENCE_HISTORICAL, INFERRED, UNSUPPORTED
    source_id: Optional[uuid.UUID] = None
    source_title: str
    source_reference: str
    evidence_text: str
    relevance_score: float = 1.0
    is_conflicting: bool = False
    conflict_notes: Optional[str] = None

class ComplianceEvidenceResponse(ComplianceEvidenceBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    assessment_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

class GapAnalysisBase(BaseModel):
    missing_capability: str
    gap_severity: GapSeverityEnum = GapSeverityEnum.MEDIUM
    suggested_action: str
    review_required: bool = True

class GapAnalysisResponse(GapAnalysisBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    assessment_id: uuid.UUID
    requirement_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

class RiskAnalysisBase(BaseModel):
    risk_category: RiskCategoryEnum = RiskCategoryEnum.UNKNOWN
    severity: RiskSeverityEnum = RiskSeverityEnum.MEDIUM
    likelihood: str = "MEDIUM"
    impact: str = "MEDIUM"
    rationale: str
    mitigation_action: str

class RiskAnalysisResponse(RiskAnalysisBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    assessment_id: uuid.UUID
    requirement_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

class ComplianceAssessmentBase(BaseModel):
    status: ComplianceStatusEnum = ComplianceStatusEnum.UNKNOWN
    confidence_score: float = 0.0
    rationale: str
    unsupported_claims: Optional[str] = None
    review_required: bool = True
    review_status: ReviewStatusEnum = ReviewStatusEnum.PENDING
    reviewer_comments: Optional[str] = None

class ComplianceAssessmentResponse(ComplianceAssessmentBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    rfp_project_id: uuid.UUID
    requirement_id: uuid.UUID
    reviewed_by_id: Optional[uuid.UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    evidence_list: List[ComplianceEvidenceResponse] = []
    gap_analysis: Optional[GapAnalysisResponse] = None
    risk_analysis: Optional[RiskAnalysisResponse] = None

    class Config:
        from_attributes = True

class ComplianceAssessmentUpdate(BaseModel):
    status: Optional[ComplianceStatusEnum] = None
    review_status: Optional[ReviewStatusEnum] = None
    reviewer_comments: Optional[str] = None

class ComplianceAssessmentStatusResponse(BaseModel):
    status: str  # PENDING, PROCESSING, COMPLETED, FAILED
    total_requirements: int = 0
    processed_requirements: int = 0
    error: Optional[str] = None
