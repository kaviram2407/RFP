from sqlalchemy import Column, String, Text, Integer, Float, Boolean, DateTime, ForeignKey, Enum, UniqueConstraint, Index, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB, TSVECTOR
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from datetime import datetime, timezone
import uuid
import enum

from app.db.base_class import Base
from app.models.rfp_document import ProcessingStatusEnum

class KnowledgeTypeEnum(str, enum.Enum):
    COMPANY_PROFILE = "COMPANY_PROFILE"
    PRODUCT = "PRODUCT"
    SERVICE = "SERVICE"
    TECHNICAL_CAPABILITY = "TECHNICAL_CAPABILITY"
    SECURITY = "SECURITY"
    COMPLIANCE = "COMPLIANCE"
    CERTIFICATION = "CERTIFICATION"
    IMPLEMENTATION = "IMPLEMENTATION"
    SUPPORT = "SUPPORT"
    CASE_STUDY = "CASE_STUDY"
    POLICY = "POLICY"
    STANDARD = "STANDARD"
    OTHER = "OTHER"

class KnowledgeStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"

class AuthorityLevelEnum(str, enum.Enum):
    AUTHORITATIVE = "AUTHORITATIVE"
    APPROVED = "APPROVED"
    INTERNAL = "INTERNAL"
    REFERENCE = "REFERENCE"

class CompanyKnowledgeDocument(Base):
    __tablename__ = "company_knowledge_document"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    knowledge_type = Column(Enum(KnowledgeTypeEnum), nullable=False, index=True)
    source_name = Column(String, nullable=True)
    source_reference = Column(String, nullable=True)
    status = Column(Enum(KnowledgeStatusEnum), nullable=False, default=KnowledgeStatusEnum.DRAFT, index=True)
    authority_level = Column(Enum(AuthorityLevelEnum), nullable=False, default=AuthorityLevelEnum.APPROVED, index=True)

    effective_from = Column(DateTime(timezone=True), nullable=True)
    effective_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    archived_at = Column(DateTime(timezone=True), nullable=True)

    versions = relationship(
        "KnowledgeDocumentVersion",
        back_populates="knowledge_document",
        cascade="all, delete-orphan",
        order_by="KnowledgeDocumentVersion.version_number.desc()"
    )
    chunks = relationship(
        "KnowledgeChunk",
        back_populates="knowledge_document",
        cascade="all, delete-orphan"
    )

class KnowledgeDocumentVersion(Base):
    __tablename__ = "knowledge_document_version"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    knowledge_document_id = Column(UUID(as_uuid=True), ForeignKey("company_knowledge_document.id"), nullable=False, index=True)

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

    effective_from = Column(DateTime(timezone=True), nullable=True)
    effective_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("knowledge_document_id", "version_number", name="uq_knowledge_doc_version"),
    )

    knowledge_document = relationship("CompanyKnowledgeDocument", back_populates="versions")
    chunks = relationship("KnowledgeChunk", back_populates="version", cascade="all, delete-orphan")

class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunk"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    knowledge_document_id = Column(UUID(as_uuid=True), ForeignKey("company_knowledge_document.id"), nullable=False, index=True)
    knowledge_version_id = Column(UUID(as_uuid=True), ForeignKey("knowledge_document_version.id"), nullable=False, index=True)

    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    token_count = Column(Integer, nullable=True)
    character_count = Column(Integer, nullable=False)
    source_metadata = Column(JSON, nullable=True)
    content_hash = Column(String, nullable=False, index=True)

    embedding = Column(Vector(2048).with_variant(JSON, "sqlite"), nullable=True)
    embedding_model = Column(String, nullable=False, default="nvidia/nemotron-3-embed-1b")
    embedding_dimensions = Column(Integer, nullable=False, default=2048)
    search_vector = Column(TSVECTOR().with_variant(Text, "sqlite"), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    knowledge_document = relationship("CompanyKnowledgeDocument", back_populates="chunks")
    version = relationship("KnowledgeDocumentVersion", back_populates="chunks")
