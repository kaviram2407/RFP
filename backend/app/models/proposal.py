from sqlalchemy import Column, String, Text, Float, Boolean, DateTime, ForeignKey, Enum, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum

from app.db.base_class import Base

class ProposalStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"
    GENERATING = "GENERATING"
    GENERATED = "GENERATED"
    IN_REVIEW = "IN_REVIEW"
    FINALIZED = "FINALIZED"

class GenerationStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class SectionReviewStatusEnum(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    NEEDS_REVISION = "NEEDS_REVISION"

class Proposal(Base):
    __tablename__ = "proposal"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    rfp_project_id = Column(UUID(as_uuid=True), ForeignKey("rfp_project.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ProposalStatusEnum), nullable=False, default=ProposalStatusEnum.DRAFT, index=True)
    current_version_id = Column(UUID(as_uuid=True), ForeignKey("proposal_version.id", use_alter=True, name="fk_proposal_current_version_id"), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    rfp_project = relationship("RFPProject", backref="proposals")
    created_by = relationship("User", foreign_keys=[created_by_id])
    versions = relationship("ProposalVersion", foreign_keys="ProposalVersion.proposal_id", back_populates="proposal", cascade="all, delete-orphan", order_by="ProposalVersion.version_number.desc()")
    current_version = relationship("ProposalVersion", foreign_keys=[current_version_id], post_update=True)

class ProposalVersion(Base):
    __tablename__ = "proposal_version"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    proposal_id = Column(UUID(as_uuid=True), ForeignKey("proposal.id"), nullable=False, index=True)

    version_number = Column(Integer, nullable=False, default=1)
    status = Column(Enum(ProposalStatusEnum), nullable=False, default=ProposalStatusEnum.DRAFT, index=True)
    generation_status = Column(Enum(GenerationStatusEnum), nullable=False, default=GenerationStatusEnum.PENDING, index=True)
    generation_started_at = Column(DateTime(timezone=True), nullable=True)
    generation_completed_at = Column(DateTime(timezone=True), nullable=True)
    generation_error = Column(Text, nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("proposal_id", "version_number", name="uq_proposal_version_number"),
    )

    proposal = relationship("Proposal", foreign_keys=[proposal_id], back_populates="versions")
    created_by = relationship("User", foreign_keys=[created_by_id])
    sections = relationship("ProposalSection", back_populates="version", cascade="all, delete-orphan", order_by="ProposalSection.section_order.asc()")

class ProposalSection(Base):
    __tablename__ = "proposal_section"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    proposal_id = Column(UUID(as_uuid=True), ForeignKey("proposal.id"), nullable=False, index=True)
    proposal_version_id = Column(UUID(as_uuid=True), ForeignKey("proposal_version.id"), nullable=False, index=True)

    section_key = Column(String, nullable=False, index=True)
    section_title = Column(String, nullable=False)
    section_order = Column(Integer, nullable=False, default=1)
    content = Column(Text, nullable=False, default="")
    ai_generated_content = Column(Text, nullable=True)

    status = Column(Enum(ProposalStatusEnum), nullable=False, default=ProposalStatusEnum.DRAFT, index=True)
    generation_status = Column(Enum(GenerationStatusEnum), nullable=False, default=GenerationStatusEnum.PENDING, index=True)
    review_status = Column(Enum(SectionReviewStatusEnum), nullable=False, default=SectionReviewStatusEnum.PENDING_REVIEW, index=True)
    confidence_score = Column(Float, nullable=False, default=0.0)
    review_required = Column(Boolean, nullable=False, default=True, index=True)
    reviewer_comments = Column(Text, nullable=True)
    reviewed_by_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    version = relationship("ProposalVersion", back_populates="sections")
    proposal = relationship("Proposal")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    section_requirements = relationship("ProposalSectionRequirement", back_populates="section", cascade="all, delete-orphan")
    evidence_list = relationship("GeneratedContentEvidence", back_populates="section", cascade="all, delete-orphan")
    unsupported_claims = relationship("UnsupportedClaim", back_populates="section", cascade="all, delete-orphan")

class ProposalSectionRequirement(Base):
    __tablename__ = "proposal_section_requirement"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    proposal_section_id = Column(UUID(as_uuid=True), ForeignKey("proposal_section.id"), nullable=False, index=True)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("requirement.id"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    section = relationship("ProposalSection", back_populates="section_requirements")
    requirement = relationship("Requirement")

class GeneratedContentEvidence(Base):
    __tablename__ = "generated_content_evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    proposal_section_id = Column(UUID(as_uuid=True), ForeignKey("proposal_section.id"), nullable=False, index=True)

    source_type = Column(String, nullable=False)  # COMPANY_KNOWLEDGE, PREVIOUS_PROPOSAL, RFP_DOCUMENT, REQUIREMENT, INFERRED, UNSUPPORTED
    source_id = Column(UUID(as_uuid=True), nullable=True)
    source_title = Column(String, nullable=False, default="")
    citation_reference = Column(String, nullable=False, default="")
    evidence_text = Column(Text, nullable=False, default="")
    relevance_score = Column(Float, nullable=False, default=1.0)
    authority_level = Column(String, nullable=False, default="AUTHORITATIVE")  # AUTHORITATIVE, REFERENCE_HISTORICAL, CURRENT_RFP, INFERRED, UNSUPPORTED
    is_conflicting = Column(Boolean, nullable=False, default=False)
    conflict_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    section = relationship("ProposalSection", back_populates="evidence_list")

class UnsupportedClaim(Base):
    __tablename__ = "unsupported_claim"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    proposal_section_id = Column(UUID(as_uuid=True), ForeignKey("proposal_section.id"), nullable=False, index=True)

    claim = Column(Text, nullable=False)
    reason = Column(Text, nullable=False)
    severity = Column(String, nullable=False, default="HIGH")  # HIGH, MEDIUM, LOW
    review_required = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    section = relationship("ProposalSection", back_populates="unsupported_claims")
