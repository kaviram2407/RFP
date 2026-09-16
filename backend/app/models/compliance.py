from sqlalchemy import Column, String, Text, Float, Boolean, DateTime, ForeignKey, Enum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum

from app.db.base_class import Base

class ComplianceStatusEnum(str, enum.Enum):
    COMPLIANT = "COMPLIANT"
    PARTIALLY_COMPLIANT = "PARTIALLY_COMPLIANT"
    NON_COMPLIANT = "NON_COMPLIANT"
    UNKNOWN = "UNKNOWN"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"

class ReviewStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class RiskCategoryEnum(str, enum.Enum):
    TECHNICAL = "TECHNICAL"
    COMPLIANCE = "COMPLIANCE"
    DELIVERY = "DELIVERY"
    COMMERCIAL = "COMMERCIAL"
    OPERATIONAL = "OPERATIONAL"
    INFORMATION = "INFORMATION"
    UNKNOWN = "UNKNOWN"

class RiskSeverityEnum(str, enum.Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class GapSeverityEnum(str, enum.Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class ComplianceAssessment(Base):
    __tablename__ = "compliance_assessment"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    rfp_project_id = Column(UUID(as_uuid=True), ForeignKey("rfp_project.id"), nullable=False, index=True)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("requirement.id"), nullable=False, unique=True, index=True)

    status = Column(Enum(ComplianceStatusEnum), nullable=False, default=ComplianceStatusEnum.UNKNOWN, index=True)
    confidence_score = Column(Float, nullable=False, default=0.0)
    rationale = Column(Text, nullable=False)
    unsupported_claims = Column(Text, nullable=True)

    review_required = Column(Boolean, nullable=False, default=True, index=True)
    review_status = Column(Enum(ReviewStatusEnum), nullable=False, default=ReviewStatusEnum.PENDING, index=True)
    reviewer_comments = Column(Text, nullable=True)
    reviewed_by_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    requirement = relationship("Requirement", backref="compliance_assessment")
    evidence_list = relationship("ComplianceEvidence", back_populates="assessment", cascade="all, delete-orphan")
    gap_analysis = relationship("GapAnalysis", back_populates="assessment", uselist=False, cascade="all, delete-orphan")
    risk_analysis = relationship("RiskAnalysis", back_populates="assessment", uselist=False, cascade="all, delete-orphan")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])

class ComplianceEvidence(Base):
    __tablename__ = "compliance_evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("compliance_assessment.id"), nullable=False, index=True)

    source_type = Column(String, nullable=False)  # CURRENT_RFP, COMPANY_KNOWLEDGE, PREVIOUS_PROPOSAL
    authority_level = Column(String, nullable=False, default="AUTHORITATIVE")  # AUTHORITATIVE, REFERENCE_HISTORICAL, INFERRED, UNSUPPORTED
    source_id = Column(UUID(as_uuid=True), nullable=True)  # FK/ID of chunk, section, or content block
    source_title = Column(String, nullable=False)
    source_reference = Column(String, nullable=False)
    evidence_text = Column(Text, nullable=False)
    relevance_score = Column(Float, nullable=False, default=1.0)
    is_conflicting = Column(Boolean, nullable=False, default=False)
    conflict_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    assessment = relationship("ComplianceAssessment", back_populates="evidence_list")

class GapAnalysis(Base):
    __tablename__ = "gap_analysis"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("compliance_assessment.id"), nullable=False, unique=True, index=True)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("requirement.id"), nullable=False, index=True)

    missing_capability = Column(Text, nullable=False)
    gap_severity = Column(Enum(GapSeverityEnum), nullable=False, default=GapSeverityEnum.MEDIUM, index=True)
    suggested_action = Column(Text, nullable=False)
    review_required = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    assessment = relationship("ComplianceAssessment", back_populates="gap_analysis")
    requirement = relationship("Requirement")

class RiskAnalysis(Base):
    __tablename__ = "risk_analysis"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("compliance_assessment.id"), nullable=False, unique=True, index=True)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("requirement.id"), nullable=False, index=True)

    risk_category = Column(Enum(RiskCategoryEnum), nullable=False, default=RiskCategoryEnum.UNKNOWN, index=True)
    severity = Column(Enum(RiskSeverityEnum), nullable=False, default=RiskSeverityEnum.MEDIUM, index=True)
    likelihood = Column(String, nullable=False, default="MEDIUM")  # HIGH, MEDIUM, LOW
    impact = Column(String, nullable=False, default="MEDIUM")  # HIGH, MEDIUM, LOW
    rationale = Column(Text, nullable=False)
    mitigation_action = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    assessment = relationship("ComplianceAssessment", back_populates="risk_analysis")
    requirement = relationship("Requirement")
