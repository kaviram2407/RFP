import uuid
from typing import List, Optional, Any, Dict
from pydantic import BaseModel
from datetime import datetime

class KpiMetrics(BaseModel):
    active_rfps_count: int
    total_requirements_count: int
    accepted_requirements_count: int
    compliant_items_count: int
    non_compliant_items_count: int
    open_gaps_count: int
    high_severity_gaps_count: int
    total_risks_count: int
    critical_high_risks_count: int
    proposals_in_progress_count: int
    proposals_awaiting_my_review_count: int
    approved_proposals_count: int

class DistributionItem(BaseModel):
    label: str
    count: int

class PendingApprovalItem(BaseModel):
    proposal_id: uuid.UUID
    version_id: uuid.UUID
    proposal_title: str
    rfp_project_id: uuid.UUID
    rfp_project_name: str
    version_number: int
    current_stage: str
    status: str
    submitted_at: Optional[datetime] = None
    created_by_name: Optional[str] = None

class ApprovalHistoryItem(BaseModel):
    id: uuid.UUID
    proposal_id: uuid.UUID
    version_id: uuid.UUID
    proposal_title: str
    reviewer_name: str
    reviewer_role: str
    stage: str
    decision: str
    comment: Optional[str] = None
    created_at: datetime

class DashboardSummaryResponse(BaseModel):
    user_role: str
    organization_id: uuid.UUID
    kpis: KpiMetrics
    rfp_status_distribution: List[DistributionItem]
    requirement_priority_distribution: List[DistributionItem]
    requirement_category_distribution: List[DistributionItem]
    compliance_status_distribution: List[DistributionItem]
    gap_severity_distribution: List[DistributionItem]
    risk_severity_distribution: List[DistributionItem]
    proposal_stage_distribution: List[DistributionItem]
    approval_queue: List[PendingApprovalItem]
    recent_decisions: List[ApprovalHistoryItem]
