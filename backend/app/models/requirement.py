from sqlalchemy import Column, String, Text, Float, Boolean, DateTime, ForeignKey, Enum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum

from app.db.base_class import Base

class RequirementCategoryEnum(str, enum.Enum):
    FUNCTIONAL = "FUNCTIONAL"
    TECHNICAL = "TECHNICAL"
    SECURITY = "SECURITY"
    COMPLIANCE = "COMPLIANCE"
    LEGAL = "LEGAL"
    COMMERCIAL = "COMMERCIAL"
    FINANCIAL = "FINANCIAL"
    OPERATIONAL = "OPERATIONAL"
    SUPPORT = "SUPPORT"
    IMPLEMENTATION = "IMPLEMENTATION"
    GENERAL = "GENERAL"

class RequirementTypeEnum(str, enum.Enum):
    MANDATORY = "MANDATORY"
    OPTIONAL = "OPTIONAL"
    INFORMATIONAL = "INFORMATIONAL"

class RequirementPriorityEnum(str, enum.Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class RequirementStatusEnum(str, enum.Enum):
    EXTRACTED = "EXTRACTED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"

class ExtractionStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class Requirement(Base):
    __tablename__ = "requirement"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    rfp_project_id = Column(UUID(as_uuid=True), ForeignKey("rfp_project.id"), nullable=False, index=True)
    document_version_id = Column(UUID(as_uuid=True), ForeignKey("document_version.id"), nullable=False, index=True)

    requirement_code = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(Enum(RequirementCategoryEnum), nullable=False, index=True)
    requirement_type = Column(Enum(RequirementTypeEnum), nullable=False, index=True)
    priority = Column(Enum(RequirementPriorityEnum), nullable=False, index=True)
    mandatory = Column(Boolean, nullable=False, default=True)
    confidence_score = Column(Float, nullable=False, default=1.0)
    status = Column(Enum(RequirementStatusEnum), nullable=False, default=RequirementStatusEnum.EXTRACTED, index=True)
    review_required = Column(Boolean, nullable=False, default=False, index=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    evidence_list = relationship(
        "RequirementEvidence",
        back_populates="requirement",
        cascade="all, delete-orphan"
    )

class RequirementEvidence(Base):
    __tablename__ = "requirement_evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("requirement.id"), nullable=False, index=True)
    document_version_id = Column(UUID(as_uuid=True), ForeignKey("document_version.id"), nullable=False, index=True)
    content_block_id = Column(UUID(as_uuid=True), ForeignKey("document_content_block.id"), nullable=False, index=True)

    evidence_text = Column(Text, nullable=False)
    source_type = Column(String, nullable=False, default="CURRENT_RFP")
    source_reference = Column(String, nullable=False)  # PAGE 17, SHEET: Matrix, etc.
    relevance_score = Column(Float, nullable=False, default=1.0)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    requirement = relationship("Requirement", back_populates="evidence_list")
