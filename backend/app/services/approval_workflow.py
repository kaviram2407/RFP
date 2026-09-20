import uuid
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.proposal import (
    Proposal,
    ProposalVersion,
    ProposalSection,
    ProposalSectionRequirement,
    ProposalApproval,
    ProposalStatusEnum,
    GenerationStatusEnum,
    ApprovalStageEnum,
    ApprovalDecisionEnum,
)
from app.models.user import User, RoleEnum
from app.models.audit import AuditLog

logger = logging.getLogger(__name__)

def _normalize_uuid(val: Any) -> str:
    if val is None:
        return ""
    try:
        return str(uuid.UUID(str(val)))
    except ValueError:
        return str(val)

class ApprovalWorkflowService:
    def submit_for_review(
        self,
        db: Session,
        proposal_id: uuid.UUID,
        version_id: uuid.UUID,
        user: User
    ) -> ProposalVersion:
        # 1. Permission check
        if user.role != RoleEnum.PRODUCT_TEAM:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Product Team members can submit proposals for review."
            )

        # 2. Fetch proposal & version
        proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
        if not proposal or _normalize_uuid(proposal.organization_id) != _normalize_uuid(user.organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

        version = db.query(ProposalVersion).filter(
            ProposalVersion.id == version_id,
            ProposalVersion.proposal_id == proposal_id
        ).first()

        if not version or _normalize_uuid(version.organization_id) != _normalize_uuid(user.organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal version not found.")

        # 3. Check current state pre-conditions
        if version.is_immutable and version.status in (
            ProposalStatusEnum.VP_REVIEW,
            ProposalStatusEnum.CTO_REVIEW,
            ProposalStatusEnum.CEO_REVIEW,
            ProposalStatusEnum.APPROVED
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Proposal version is already submitted or approved and cannot be resubmitted."
            )

        sections = db.query(ProposalSection).filter(
            ProposalSection.proposal_version_id == version_id
        ).all()

        if not sections:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Proposal version cannot be submitted without content sections."
            )

        # 4. Transition to VP_REVIEW
        now = datetime.now(timezone.utc)
        version.current_stage = ApprovalStageEnum.VP.value
        version.status = ProposalStatusEnum.VP_REVIEW
        version.submitted_at = now
        version.is_immutable = True

        proposal.status = ProposalStatusEnum.VP_REVIEW
        proposal.current_version_id = version.id
        proposal.updated_at = now

        # 5. Create Audit Log
        audit_entry = AuditLog(
            id=uuid.uuid4(),
            organization_id=user.organization_id,
            actor_id=user.id,
            action="PROPOSAL_SUBMITTED",
            entity_type="PROPOSAL_VERSION",
            entity_id=version.id,
            metadata_json=json.dumps({
                "proposal_id": str(proposal.id),
                "version_number": version.version_number,
                "submitted_by": user.email,
                "initial_stage": ApprovalStageEnum.VP.value
            }),
            created_at=now
        )
        db.add(audit_entry)

        db.commit()
        db.refresh(version)
        db.refresh(proposal)
        logger.info(f"Proposal version {version.id} submitted for VP review by {user.email}.")
        return version

    def review_proposal_version(
        self,
        db: Session,
        proposal_id: uuid.UUID,
        version_id: uuid.UUID,
        decision_str: str,
        comment: Optional[str],
        user: User
    ) -> ProposalApproval:
        # 1. Fetch proposal & version
        proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
        if not proposal or _normalize_uuid(proposal.organization_id) != _normalize_uuid(user.organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

        version = db.query(ProposalVersion).filter(
            ProposalVersion.id == version_id,
            ProposalVersion.proposal_id == proposal_id
        ).first()

        if not version or _normalize_uuid(version.organization_id) != _normalize_uuid(user.organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal version not found.")

        if not version.current_stage or version.status not in (
            ProposalStatusEnum.VP_REVIEW,
            ProposalStatusEnum.CTO_REVIEW,
            ProposalStatusEnum.CEO_REVIEW
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Proposal version is in status '{version.status.value if hasattr(version.status, 'value') else version.status}' and cannot be reviewed at this time."
            )

        # 2. Idempotency Check (if user already submitted an approval for their stage on this version)
        reviewer_role = str(user.role.value if hasattr(user.role, 'value') else user.role)
        user_stage = None
        if user.role == RoleEnum.VP:
            user_stage = ApprovalStageEnum.VP.value
        elif user.role == RoleEnum.CTO:
            user_stage = ApprovalStageEnum.CTO.value
        elif user.role == RoleEnum.CEO:
            user_stage = ApprovalStageEnum.CEO.value

        if user_stage:
            existing_approval = db.query(ProposalApproval).filter(
                ProposalApproval.proposal_version_id == version.id,
                ProposalApproval.stage == user_stage,
                ProposalApproval.reviewer_id == user.id
            ).first()

            if existing_approval:
                logger.info(f"Duplicate approval decision by user {user.id} returned for version {version.id}.")
                return existing_approval

        # 3. Stage Authorization Check
        current_stage = str(version.current_stage)

        if current_stage == ApprovalStageEnum.VP.value and user.role != RoleEnum.VP:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only users with VP role can review proposals at VP stage. Current user role: '{reviewer_role}'."
            )
        elif current_stage == ApprovalStageEnum.CTO.value and user.role != RoleEnum.CTO:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only users with CTO role can review proposals at CTO stage. Current user role: '{reviewer_role}'."
            )
        elif current_stage == ApprovalStageEnum.CEO.value and user.role != RoleEnum.CEO:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only users with CEO role can review proposals at CEO stage. Current user role: '{reviewer_role}'."
            )

        # 4. Validate Decision string
        decision_upper = decision_str.upper()
        if decision_upper not in [d.value for d in ApprovalDecisionEnum]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid decision '{decision_str}'. Must be one of APPROVED, REJECTED, REQUEST_CHANGES."
            )

        # 5. Record Approval
        now = datetime.now(timezone.utc)
        approval_obj = ProposalApproval(
            id=uuid.uuid4(),
            organization_id=user.organization_id,
            proposal_id=proposal.id,
            proposal_version_id=version.id,
            reviewer_id=user.id,
            reviewer_role=reviewer_role,
            stage=current_stage,
            decision=decision_upper,
            comment=comment,
            created_at=now,
            updated_at=now
        )
        db.add(approval_obj)

        # 6. Apply State Transitions
        if decision_upper == ApprovalDecisionEnum.APPROVED.value:
            if current_stage == ApprovalStageEnum.VP.value:
                version.current_stage = ApprovalStageEnum.CTO.value
                version.status = ProposalStatusEnum.CTO_REVIEW
                proposal.status = ProposalStatusEnum.CTO_REVIEW
            elif current_stage == ApprovalStageEnum.CTO.value:
                version.current_stage = ApprovalStageEnum.CEO.value
                version.status = ProposalStatusEnum.CEO_REVIEW
                proposal.status = ProposalStatusEnum.CEO_REVIEW
            elif current_stage == ApprovalStageEnum.CEO.value:
                version.current_stage = "COMPLETED"
                version.status = ProposalStatusEnum.APPROVED
                version.completed_at = now
                version.is_immutable = True
                proposal.status = ProposalStatusEnum.APPROVED

        elif decision_upper == ApprovalDecisionEnum.REQUEST_CHANGES.value:
            version.status = ProposalStatusEnum.CHANGES_REQUESTED
            version.is_immutable = True
            proposal.status = ProposalStatusEnum.CHANGES_REQUESTED

        elif decision_upper == ApprovalDecisionEnum.REJECTED.value:
            version.status = ProposalStatusEnum.REJECTED
            version.completed_at = now
            version.is_immutable = True
            proposal.status = ProposalStatusEnum.REJECTED

        version.updated_at = now
        proposal.updated_at = now

        # 7. Audit Logging
        action_name = f"PROPOSAL_{decision_upper}"
        audit_entry = AuditLog(
            id=uuid.uuid4(),
            organization_id=user.organization_id,
            actor_id=user.id,
            action=action_name,
            entity_type="PROPOSAL_VERSION",
            entity_id=version.id,
            metadata_json=json.dumps({
                "proposal_id": str(proposal.id),
                "version_number": version.version_number,
                "stage": current_stage,
                "reviewer_role": reviewer_role,
                "decision": decision_upper,
                "comment": comment
            }),
            created_at=now
        )
        db.add(audit_entry)

        db.commit()
        db.refresh(approval_obj)
        db.refresh(version)
        db.refresh(proposal)

        logger.info(f"Review recorded: Stage {current_stage}, Decision {decision_upper}, Version {version.id} by {user.email}.")
        return approval_obj

    def create_revision(
        self,
        db: Session,
        proposal_id: uuid.UUID,
        source_version_id: uuid.UUID,
        user: User
    ) -> ProposalVersion:
        # 1. Permission check
        if user.role != RoleEnum.PRODUCT_TEAM:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Product Team members can create proposal revisions."
            )

        # 2. Fetch proposal & source version
        proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
        if not proposal or _normalize_uuid(proposal.organization_id) != _normalize_uuid(user.organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

        source_version = db.query(ProposalVersion).filter(
            ProposalVersion.id == source_version_id,
            ProposalVersion.proposal_id == proposal_id
        ).first()

        if not source_version or _normalize_uuid(source_version.organization_id) != _normalize_uuid(user.organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source proposal version not found.")

        # 3. Next version number
        latest_ver = db.query(ProposalVersion).filter(
            ProposalVersion.proposal_id == proposal_id
        ).order_by(ProposalVersion.version_number.desc()).first()

        next_ver_num = (latest_ver.version_number + 1) if latest_ver else 1

        now = datetime.now(timezone.utc)
        new_version = ProposalVersion(
            id=uuid.uuid4(),
            organization_id=user.organization_id,
            proposal_id=proposal.id,
            version_number=next_ver_num,
            status=ProposalStatusEnum.DRAFT,
            generation_status=GenerationStatusEnum.PENDING,
            current_stage=None,
            submitted_at=None,
            completed_at=None,
            is_immutable=False,
            created_by_id=user.id,
            created_at=now,
            updated_at=now
        )
        db.add(new_version)
        db.flush()

        # 4. Copy sections from source version
        src_sections = db.query(ProposalSection).filter(
            ProposalSection.proposal_version_id == source_version.id
        ).order_by(ProposalSection.section_order.asc()).all()

        for sec in src_sections:
            new_sec = ProposalSection(
                id=uuid.uuid4(),
                organization_id=user.organization_id,
                proposal_id=proposal.id,
                proposal_version_id=new_version.id,
                section_key=sec.section_key,
                section_title=sec.section_title,
                section_order=sec.section_order,
                content=sec.content,
                ai_generated_content=sec.ai_generated_content,
                status=ProposalStatusEnum.DRAFT,
                generation_status=sec.generation_status,
                review_status=sec.review_status,
                confidence_score=sec.confidence_score,
                review_required=sec.review_required,
                created_at=now,
                updated_at=now
            )
            db.add(new_sec)
            db.flush()

            req_mappings = db.query(ProposalSectionRequirement).filter(
                ProposalSectionRequirement.proposal_section_id == sec.id
            ).all()

            for m in req_mappings:
                db.add(ProposalSectionRequirement(
                    id=uuid.uuid4(),
                    organization_id=user.organization_id,
                    proposal_section_id=new_sec.id,
                    requirement_id=m.requirement_id,
                    created_at=now
                ))

        # 5. Update proposal pointer
        proposal.current_version_id = new_version.id
        proposal.status = ProposalStatusEnum.DRAFT
        proposal.updated_at = now

        # 6. Audit Logging
        audit_entry = AuditLog(
            id=uuid.uuid4(),
            organization_id=user.organization_id,
            actor_id=user.id,
            action="PROPOSAL_REVISION_CREATED",
            entity_type="PROPOSAL_VERSION",
            entity_id=new_version.id,
            metadata_json=json.dumps({
                "proposal_id": str(proposal.id),
                "source_version_id": str(source_version.id),
                "new_version_number": new_version.version_number,
                "created_by": user.email
            }),
            created_at=now
        )
        db.add(audit_entry)

        db.commit()
        db.refresh(new_version)
        db.refresh(proposal)

        logger.info(f"Created proposal revision v{new_version.version_number} ({new_version.id}) from source v{source_version.version_number}.")
        return new_version

    def get_approval_status(
        self,
        db: Session,
        proposal_id: uuid.UUID,
        version_id: uuid.UUID,
        user: User
    ) -> Dict[str, Any]:
        proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
        if not proposal or _normalize_uuid(proposal.organization_id) != _normalize_uuid(user.organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

        version = db.query(ProposalVersion).filter(
            ProposalVersion.id == version_id,
            ProposalVersion.proposal_id == proposal_id
        ).first()

        if not version or _normalize_uuid(version.organization_id) != _normalize_uuid(user.organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal version not found.")

        can_approve = False
        allowed_actions = []

        ver_status_val = version.status.value if hasattr(version.status, 'value') else version.status

        if user.role == RoleEnum.PRODUCT_TEAM:
            if not version.is_immutable and ver_status_val in (ProposalStatusEnum.DRAFT.value, ProposalStatusEnum.GENERATED.value):
                allowed_actions.append("SUBMIT_FOR_REVIEW")
            if ver_status_val in (ProposalStatusEnum.CHANGES_REQUESTED.value, ProposalStatusEnum.REJECTED.value):
                allowed_actions.append("CREATE_REVISION")
        elif user.role == RoleEnum.VP:
            if version.current_stage == ApprovalStageEnum.VP.value and ver_status_val == ProposalStatusEnum.VP_REVIEW.value:
                can_approve = True
                allowed_actions.extend(["APPROVE", "REQUEST_CHANGES", "REJECT"])
        elif user.role == RoleEnum.CTO:
            if version.current_stage == ApprovalStageEnum.CTO.value and ver_status_val == ProposalStatusEnum.CTO_REVIEW.value:
                can_approve = True
                allowed_actions.extend(["APPROVE", "REQUEST_CHANGES", "REJECT"])
        elif user.role == RoleEnum.CEO:
            if version.current_stage == ApprovalStageEnum.CEO.value and ver_status_val == ProposalStatusEnum.CEO_REVIEW.value:
                can_approve = True
                allowed_actions.extend(["APPROVE", "REQUEST_CHANGES", "REJECT"])

        return {
            "proposal_id": proposal.id,
            "version_id": version.id,
            "version_number": version.version_number,
            "current_stage": version.current_stage,
            "current_status": version.status,
            "submitted_at": version.submitted_at,
            "completed_at": version.completed_at,
            "is_immutable": version.is_immutable,
            "can_user_approve": can_approve,
            "user_role": user.role.value if hasattr(user.role, 'value') else user.role,
            "allowed_actions": allowed_actions
        }

    def get_approval_history(
        self,
        db: Session,
        proposal_id: uuid.UUID,
        version_id: uuid.UUID,
        user: User
    ) -> List[ProposalApproval]:
        proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
        if not proposal or _normalize_uuid(proposal.organization_id) != _normalize_uuid(user.organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

        version = db.query(ProposalVersion).filter(
            ProposalVersion.id == version_id,
            ProposalVersion.proposal_id == proposal_id
        ).first()

        if not version or _normalize_uuid(version.organization_id) != _normalize_uuid(user.organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal version not found.")

        approvals = db.query(ProposalApproval).filter(
            ProposalApproval.proposal_version_id == version_id
        ).order_by(ProposalApproval.created_at.asc()).all()

        return approvals

approval_workflow_service = ApprovalWorkflowService()
