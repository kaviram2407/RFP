import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.models.user import User, RoleEnum
from app.models.rfp_project import RFPProject, ProjectStatusEnum
from app.models.requirement import Requirement, RequirementPriorityEnum, RequirementCategoryEnum, RequirementStatusEnum
from app.models.compliance import ComplianceAssessment, ComplianceStatusEnum, GapAnalysis, GapSeverityEnum, RiskAnalysis, RiskSeverityEnum
from app.models.proposal import Proposal, ProposalVersion, ProposalStatusEnum, ProposalApproval
from app.schemas.dashboard import (
    DashboardSummaryResponse,
    KpiMetrics,
    DistributionItem,
    PendingApprovalItem,
    ApprovalHistoryItem,
)

def _normalize_uuid(val: Any) -> str:
    if val is None:
        return ""
    return str(val).replace("-", "").lower()

class DashboardService:
    def get_dashboard_summary(
        self,
        db: Session,
        user: User,
        rfp_project_id: Optional[uuid.UUID] = None,
        status_filter: Optional[str] = None,
        priority_filter: Optional[str] = None,
        category_filter: Optional[str] = None,
        risk_severity_filter: Optional[str] = None,
        gap_severity_filter: Optional[str] = None,
    ) -> DashboardSummaryResponse:
        org_id = user.organization_id
        user_role_str = str(user.role.value if hasattr(user.role, "value") else user.role)

        # ---------------------------------------------------------------------
        # 1. RFP Projects Metrics & Distribution
        # ---------------------------------------------------------------------
        rfp_query = db.query(RFPProject).filter(RFPProject.organization_id == org_id)
        if rfp_project_id:
            rfp_query = rfp_query.filter(RFPProject.id == rfp_project_id)
        if status_filter:
            rfp_query = rfp_query.filter(RFPProject.status == status_filter)

        active_rfps_count = rfp_query.filter(RFPProject.status != ProjectStatusEnum.ARCHIVED).count()

        rfp_dist_raw = (
            db.query(RFPProject.status, func.count(RFPProject.id))
            .filter(RFPProject.organization_id == org_id)
            .group_by(RFPProject.status)
            .all()
        )
        rfp_status_distribution = [
            DistributionItem(label=str(st.value if hasattr(st, "value") else st), count=cnt)
            for st, cnt in rfp_dist_raw
        ]

        # ---------------------------------------------------------------------
        # 2. Requirements Metrics & Distributions
        # ---------------------------------------------------------------------
        req_query = db.query(Requirement).filter(Requirement.organization_id == org_id)
        if rfp_project_id:
            req_query = req_query.filter(Requirement.rfp_project_id == rfp_project_id)
        if category_filter:
            req_query = req_query.filter(Requirement.category == category_filter)
        if priority_filter:
            req_query = req_query.filter(Requirement.priority == priority_filter)

        total_requirements_count = req_query.count()
        accepted_requirements_count = req_query.filter(Requirement.status == RequirementStatusEnum.ACCEPTED).count()

        # Priority Distribution
        req_prio_raw = (
            db.query(Requirement.priority, func.count(Requirement.id))
            .filter(Requirement.organization_id == org_id)
            .group_by(Requirement.priority)
            .all()
        )
        req_priority_distribution = [
            DistributionItem(label=str(p.value if hasattr(p, "value") else p), count=cnt)
            for p, cnt in req_prio_raw
        ]

        # Category Distribution
        req_cat_raw = (
            db.query(Requirement.category, func.count(Requirement.id))
            .filter(Requirement.organization_id == org_id)
            .group_by(Requirement.category)
            .all()
        )
        req_category_distribution = [
            DistributionItem(label=str(c.value if hasattr(c, "value") else c), count=cnt)
            for c, cnt in req_cat_raw
        ]

        # ---------------------------------------------------------------------
        # 3. Compliance Metrics & Distribution
        # ---------------------------------------------------------------------
        comp_query = db.query(ComplianceAssessment).filter(ComplianceAssessment.organization_id == org_id)
        if rfp_project_id:
            comp_query = comp_query.filter(ComplianceAssessment.rfp_project_id == rfp_project_id)

        compliant_items_count = comp_query.filter(ComplianceAssessment.status == ComplianceStatusEnum.COMPLIANT).count()
        non_compliant_items_count = comp_query.filter(ComplianceAssessment.status == ComplianceStatusEnum.NON_COMPLIANT).count()

        comp_dist_raw = (
            db.query(ComplianceAssessment.status, func.count(ComplianceAssessment.id))
            .filter(ComplianceAssessment.organization_id == org_id)
            .group_by(ComplianceAssessment.status)
            .all()
        )
        compliance_status_distribution = [
            DistributionItem(label=str(st.value if hasattr(st, "value") else st), count=cnt)
            for st, cnt in comp_dist_raw
        ]

        # ---------------------------------------------------------------------
        # 4. Gaps Metrics & Distribution
        # ---------------------------------------------------------------------
        gap_query = db.query(GapAnalysis).filter(GapAnalysis.organization_id == org_id)
        if rfp_project_id:
            gap_query = gap_query.join(ComplianceAssessment).filter(ComplianceAssessment.rfp_project_id == rfp_project_id)
        if gap_severity_filter:
            gap_query = gap_query.filter(GapAnalysis.gap_severity == gap_severity_filter)

        open_gaps_count = gap_query.count()
        high_severity_gaps_count = gap_query.filter(GapAnalysis.gap_severity == GapSeverityEnum.HIGH).count()

        gap_dist_raw = (
            db.query(GapAnalysis.gap_severity, func.count(GapAnalysis.id))
            .filter(GapAnalysis.organization_id == org_id)
            .group_by(GapAnalysis.gap_severity)
            .all()
        )
        gap_severity_distribution = [
            DistributionItem(label=str(sev.value if hasattr(sev, "value") else sev), count=cnt)
            for sev, cnt in gap_dist_raw
        ]

        # ---------------------------------------------------------------------
        # 5. Risks Metrics & Distribution
        # ---------------------------------------------------------------------
        risk_query = db.query(RiskAnalysis).filter(RiskAnalysis.organization_id == org_id)
        if rfp_project_id:
            risk_query = risk_query.join(ComplianceAssessment).filter(ComplianceAssessment.rfp_project_id == rfp_project_id)
        if risk_severity_filter:
            risk_query = risk_query.filter(RiskAnalysis.severity == risk_severity_filter)

        total_risks_count = risk_query.count()
        critical_high_risks_count = risk_query.filter(
            RiskAnalysis.severity.in_([RiskSeverityEnum.CRITICAL, RiskSeverityEnum.HIGH])
        ).count()

        risk_dist_raw = (
            db.query(RiskAnalysis.severity, func.count(RiskAnalysis.id))
            .filter(RiskAnalysis.organization_id == org_id)
            .group_by(RiskAnalysis.severity)
            .all()
        )
        risk_severity_distribution = [
            DistributionItem(label=str(sev.value if hasattr(sev, "value") else sev), count=cnt)
            for sev, cnt in risk_dist_raw
        ]

        # ---------------------------------------------------------------------
        # 6. Proposal & Approval Stage Distribution
        # ---------------------------------------------------------------------
        proposal_ver_query = db.query(ProposalVersion).filter(ProposalVersion.organization_id == org_id)
        if rfp_project_id:
            proposal_ver_query = proposal_ver_query.join(Proposal, ProposalVersion.proposal_id == Proposal.id).filter(Proposal.rfp_project_id == rfp_project_id)

        proposals_in_progress_count = proposal_ver_query.filter(
            ProposalVersion.status.in_([
                ProposalStatusEnum.DRAFT,
                ProposalStatusEnum.VP_REVIEW,
                ProposalStatusEnum.CTO_REVIEW,
                ProposalStatusEnum.CEO_REVIEW,
                ProposalStatusEnum.CHANGES_REQUESTED,
            ])
        ).count()

        approved_proposals_count = proposal_ver_query.filter(
            ProposalVersion.status == ProposalStatusEnum.APPROVED
        ).count()

        prop_dist_raw = (
            db.query(ProposalVersion.status, func.count(ProposalVersion.id))
            .filter(ProposalVersion.organization_id == org_id)
            .group_by(ProposalVersion.status)
            .all()
        )
        proposal_stage_distribution = [
            DistributionItem(label=str(st.value if hasattr(st, "value") else st), count=cnt)
            for st, cnt in prop_dist_raw
        ]

        # ---------------------------------------------------------------------
        # 7. Role-Aware Pending Approval Queue
        # ---------------------------------------------------------------------
        approval_queue_query = db.query(ProposalVersion).filter(ProposalVersion.organization_id == org_id)
        if rfp_project_id:
            approval_queue_query = approval_queue_query.join(Proposal, ProposalVersion.proposal_id == Proposal.id).filter(Proposal.rfp_project_id == rfp_project_id)

        if user_role_str == RoleEnum.PRODUCT_TEAM.value:
            approval_queue_query = approval_queue_query.filter(
                ProposalVersion.status.in_([
                    ProposalStatusEnum.DRAFT,
                    ProposalStatusEnum.CHANGES_REQUESTED,
                    ProposalStatusEnum.REJECTED,
                ])
            )
        elif user_role_str == RoleEnum.VP.value:
            approval_queue_query = approval_queue_query.filter(
                ProposalVersion.current_stage == "VP",
                ProposalVersion.status == ProposalStatusEnum.VP_REVIEW
            )
        elif user_role_str == RoleEnum.CTO.value:
            approval_queue_query = approval_queue_query.filter(
                ProposalVersion.current_stage == "CTO",
                ProposalVersion.status == ProposalStatusEnum.CTO_REVIEW
            )
        elif user_role_str == RoleEnum.CEO.value:
            approval_queue_query = approval_queue_query.filter(
                ProposalVersion.current_stage == "CEO",
                ProposalVersion.status == ProposalStatusEnum.CEO_REVIEW
            )

        proposals_awaiting_my_review_count = approval_queue_query.count()

        pending_versions = approval_queue_query.order_by(ProposalVersion.updated_at.desc()).limit(10).all()
        approval_queue_items: List[PendingApprovalItem] = []
        for ver in pending_versions:
            prop = ver.proposal
            rfp = prop.rfp_project if prop else None
            creator = ver.created_by
            approval_queue_items.append(
                PendingApprovalItem(
                    proposal_id=ver.proposal_id,
                    version_id=ver.id,
                    proposal_title=prop.title if prop else "Proposal",
                    rfp_project_id=prop.rfp_project_id if prop else uuid.uuid4(),
                    rfp_project_name=rfp.name if rfp else "RFP Project",
                    version_number=ver.version_number,
                    current_stage=ver.current_stage or "N/A",
                    status=str(ver.status.value if hasattr(ver.status, "value") else ver.status),
                    submitted_at=ver.submitted_at or ver.created_at,
                    created_by_name=creator.full_name or creator.email if creator else "Product Team",
                )
            )

        # ---------------------------------------------------------------------
        # 8. Recent Decisions Audit Trail
        # ---------------------------------------------------------------------
        history_query = db.query(ProposalApproval).filter(ProposalApproval.organization_id == org_id)
        if user_role_str in [RoleEnum.VP.value, RoleEnum.CTO.value, RoleEnum.CEO.value]:
            # Prioritize approvals relevant to executive role or overall org
            pass

        recent_approvals = history_query.order_by(ProposalApproval.created_at.desc()).limit(10).all()
        recent_decisions_items: List[ApprovalHistoryItem] = []
        for appr in recent_approvals:
            prop = db.query(Proposal).filter(Proposal.id == appr.proposal_id).first()
            reviewer = db.query(User).filter(User.id == appr.reviewer_id).first()
            recent_decisions_items.append(
                ApprovalHistoryItem(
                    id=appr.id,
                    proposal_id=appr.proposal_id,
                    version_id=appr.proposal_version_id,
                    proposal_title=prop.title if prop else "Proposal",
                    reviewer_name=reviewer.full_name or reviewer.email if reviewer else "Reviewer",
                    reviewer_role=appr.reviewer_role,
                    stage=appr.stage,
                    decision=appr.decision,
                    comment=appr.comment,
                    created_at=appr.created_at,
                )
            )

        # Build KPIs
        kpis = KpiMetrics(
            active_rfps_count=active_rfps_count,
            total_requirements_count=total_requirements_count,
            accepted_requirements_count=accepted_requirements_count,
            compliant_items_count=compliant_items_count,
            non_compliant_items_count=non_compliant_items_count,
            open_gaps_count=open_gaps_count,
            high_severity_gaps_count=high_severity_gaps_count,
            total_risks_count=total_risks_count,
            critical_high_risks_count=critical_high_risks_count,
            proposals_in_progress_count=proposals_in_progress_count,
            proposals_awaiting_my_review_count=proposals_awaiting_my_review_count,
            approved_proposals_count=approved_proposals_count,
        )

        return DashboardSummaryResponse(
            user_role=user_role_str,
            organization_id=org_id,
            kpis=kpis,
            rfp_status_distribution=rfp_status_distribution,
            requirement_priority_distribution=req_priority_distribution,
            requirement_category_distribution=req_category_distribution,
            compliance_status_distribution=compliance_status_distribution,
            gap_severity_distribution=gap_severity_distribution,
            risk_severity_distribution=risk_severity_distribution,
            proposal_stage_distribution=proposal_stage_distribution,
            approval_queue=approval_queue_items,
            recent_decisions=recent_decisions_items,
        )

dashboard_service = DashboardService()
