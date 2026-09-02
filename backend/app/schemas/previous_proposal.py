from pydantic import BaseModel, ConfigDict, Field, UUID4
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.previous_proposal import ProposalOutcomeEnum, ProposalStatusEnum
from app.models.rfp_document import ProcessingStatusEnum

class PreviousProposalCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    proposal_reference: str = Field(..., min_length=1, max_length=100)
    customer_name: Optional[str] = None
    description: Optional[str] = None
    proposal_date: Optional[datetime] = None
    outcome: ProposalOutcomeEnum = ProposalOutcomeEnum.UNKNOWN
    status: ProposalStatusEnum = ProposalStatusEnum.DRAFT
    raw_content: Optional[str] = None

class PreviousProposalUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    proposal_reference: Optional[str] = Field(None, min_length=1, max_length=100)
    customer_name: Optional[str] = None
    description: Optional[str] = None
    proposal_date: Optional[datetime] = None
    outcome: Optional[ProposalOutcomeEnum] = None
    status: Optional[ProposalStatusEnum] = None

class PreviousProposalVersionCreate(BaseModel):
    raw_content: str = Field(..., min_length=1)
    original_filename: Optional[str] = None

class PreviousProposalVersionResponse(BaseModel):
    id: UUID4
    previous_proposal_id: UUID4
    version_number: int
    original_filename: Optional[str] = None
    processing_status: ProcessingStatusEnum
    processing_started_at: Optional[datetime] = None
    processing_completed_at: Optional[datetime] = None
    processing_error: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class PreviousProposalResponse(BaseModel):
    id: UUID4
    organization_id: UUID4
    created_by_id: UUID4
    title: str
    proposal_reference: str
    customer_name: Optional[str] = None
    description: Optional[str] = None
    proposal_date: Optional[datetime] = None
    outcome: ProposalOutcomeEnum
    status: ProposalStatusEnum
    created_at: datetime
    updated_at: datetime
    versions: List[PreviousProposalVersionResponse] = []

    model_config = ConfigDict(from_attributes=True)

class HistoricalProposalSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(10, ge=1, le=50)
    outcome: Optional[ProposalOutcomeEnum] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None

class ProposalRetrievalResultResponse(BaseModel):
    section_id: UUID4
    proposal_id: UUID4
    proposal_version_id: UUID4
    proposal_title: str
    proposal_reference: str
    customer_name: Optional[str] = None
    proposal_date: Optional[str] = None
    outcome: str
    status: str
    section_title: Optional[str] = None
    content: str
    final_score: float
    semantic_score: float
    lexical_score: float
    recency_score: float
    source_metadata: Optional[Dict[str, Any]] = None
    source_class: str = "HISTORICAL PROPOSAL"

class HistoricalProposalSearchResponse(BaseModel):
    query: str
    total: int
    results: List[ProposalRetrievalResultResponse]
