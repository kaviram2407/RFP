from sqlalchemy import Column, String, Text, Integer, Float, Boolean, DateTime, ForeignKey, Enum, UniqueConstraint, Index, JSON
from sqlalchemy.dialects.postgresql import UUID, TSVECTOR
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from datetime import datetime, timezone
import uuid
import enum

from app.db.base_class import Base
from app.models.rfp_document import ProcessingStatusEnum

class ProposalOutcomeEnum(str, enum.Enum):
    WON = "WON"
    LOST = "LOST"
    NO_DECISION = "NO_DECISION"
    UNKNOWN = "UNKNOWN"

class ProposalStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    ARCHIVED = "ARCHIVED"

class PreviousProposal(Base):
    __tablename__ = "previous_proposal"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    proposal_reference = Column(String, nullable=False, index=True)
    customer_name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    proposal_date = Column(DateTime(timezone=True), nullable=True)
    submission_date = Column(DateTime(timezone=True), nullable=True)

    outcome = Column(Enum(ProposalOutcomeEnum), nullable=False, default=ProposalOutcomeEnum.UNKNOWN, index=True)
    status = Column(Enum(ProposalStatusEnum), nullable=False, default=ProposalStatusEnum.DRAFT, index=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    archived_at = Column(DateTime(timezone=True), nullable=True)

    versions = relationship(
        "PreviousProposalVersion",
        back_populates="proposal",
        cascade="all, delete-orphan",
        order_by="PreviousProposalVersion.version_number.desc()"
    )
    sections = relationship(
        "PreviousProposalSection",
        back_populates="proposal",
        cascade="all, delete-orphan"
    )

class PreviousProposalVersion(Base):
    __tablename__ = "previous_proposal_version"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    previous_proposal_id = Column(UUID(as_uuid=True), ForeignKey("previous_proposal.id"), nullable=False, index=True)

    version_number = Column(Integer, nullable=False)
    original_filename = Column(String, nullable=True)
    content_type = Column(String, nullable=True)
    storage_key = Column(String, nullable=True)
    checksum_sha256 = Column(String, nullable=True)
    raw_content = Column(Text, nullable=True)

    processing_status = Column(Enum(ProcessingStatusEnum), nullable=False, default=ProcessingStatusEnum.PENDING, index=True)
    processing_started_at = Column(DateTime(timezone=True), nullable=True)
    processing_completed_at = Column(DateTime(timezone=True), nullable=True)
    processing_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("previous_proposal_id", "version_number", name="uq_previous_proposal_version"),
    )

    proposal = relationship("PreviousProposal", back_populates="versions")
    sections = relationship("PreviousProposalSection", back_populates="version", cascade="all, delete-orphan")

class PreviousProposalSection(Base):
    __tablename__ = "previous_proposal_section"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    proposal_id = Column(UUID(as_uuid=True), ForeignKey("previous_proposal.id"), nullable=False, index=True)
    proposal_version_id = Column(UUID(as_uuid=True), ForeignKey("previous_proposal_version.id"), nullable=False, index=True)

    section_index = Column(Integer, nullable=False)
    section_title = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    character_count = Column(Integer, nullable=True)
    source_metadata = Column(JSON, nullable=True)
    content_hash = Column(String, nullable=False, index=True)


    embedding = Column(Vector(2048).with_variant(JSON, "sqlite"), nullable=True)
    embedding_model = Column(String, nullable=False, default="nvidia/nemotron-3-embed-1b")
    embedding_dimensions = Column(Integer, nullable=False, default=2048)
    search_vector = Column(TSVECTOR().with_variant(Text, "sqlite"), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    proposal = relationship("PreviousProposal", back_populates="sections")
    version = relationship("PreviousProposalVersion", back_populates="sections")
