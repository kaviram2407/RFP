from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Enum, UniqueConstraint, Index, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
import enum

from app.db.base_class import Base

class DocumentTypeEnum(str, enum.Enum):
    PDF = "PDF"
    DOCX = "DOCX"
    XLSX = "XLSX"
    PPTX = "PPTX"

class DocumentStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"

class ProcessingStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class SourceTypeEnum(str, enum.Enum):
    PAGE = "PAGE"
    PARAGRAPH = "PARAGRAPH"
    SHEET = "SHEET"
    SLIDE = "SLIDE"

class RFPDocument(Base):
    __tablename__ = "rfp_document"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    rfp_project_id = Column(UUID(as_uuid=True), ForeignKey("rfp_project.id"), nullable=False, index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    name = Column(String, nullable=False)
    document_type = Column(Enum(DocumentTypeEnum), nullable=False)
    status = Column(Enum(DocumentStatusEnum), nullable=False, default=DocumentStatusEnum.ACTIVE)

    current_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("document_version.id", use_alter=True, name="fk_rfp_document_current_version_id"),
        nullable=True
    )

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    archived_at = Column(DateTime(timezone=True), nullable=True)

    versions = relationship(
        "DocumentVersion",
        back_populates="document",
        foreign_keys="DocumentVersion.rfp_document_id",
        cascade="all, delete-orphan",
        order_by="DocumentVersion.version_number.desc()"
    )

    current_version = relationship(
        "DocumentVersion",
        foreign_keys=[current_version_id],
        post_update=True
    )

class DocumentVersion(Base):
    __tablename__ = "document_version"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    rfp_document_id = Column(UUID(as_uuid=True), ForeignKey("rfp_document.id"), nullable=False, index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    version_number = Column(Integer, nullable=False)
    original_filename = Column(String, nullable=False)
    storage_key = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    checksum_sha256 = Column(String, nullable=False)

    # Processing lifecycle fields
    processing_status = Column(Enum(ProcessingStatusEnum), nullable=False, default=ProcessingStatusEnum.PENDING)
    processing_started_at = Column(DateTime(timezone=True), nullable=True)
    processing_completed_at = Column(DateTime(timezone=True), nullable=True)
    processing_error = Column(Text, nullable=True)

    # Requirement extraction lifecycle fields
    extraction_status = Column(String, nullable=False, default="PENDING")
    extraction_started_at = Column(DateTime(timezone=True), nullable=True)
    extraction_completed_at = Column(DateTime(timezone=True), nullable=True)
    extraction_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


    document = relationship(
        "RFPDocument",
        back_populates="versions",
        foreign_keys=[rfp_document_id]
    )

    extracted_content = relationship(
        "DocumentContent",
        uselist=False,
        back_populates="version",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("rfp_document_id", "version_number", name="uq_doc_version_number"),
    )

class DocumentContent(Base):
    __tablename__ = "document_content"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    document_version_id = Column(UUID(as_uuid=True), ForeignKey("document_version.id"), nullable=False, unique=True, index=True)

    full_text = Column(Text, nullable=False)
    character_count = Column(Integer, nullable=False)
    source_unit_count = Column(Integer, nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    version = relationship("DocumentVersion", back_populates="extracted_content")
    blocks = relationship("DocumentContentBlock", back_populates="content", cascade="all, delete-orphan", order_by="DocumentContentBlock.sequence_number.asc()")

class DocumentContentBlock(Base):
    __tablename__ = "document_content_block"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    document_content_id = Column(UUID(as_uuid=True), ForeignKey("document_content.id"), nullable=False, index=True)
    document_version_id = Column(UUID(as_uuid=True), ForeignKey("document_version.id"), nullable=False, index=True)

    sequence_number = Column(Integer, nullable=False)
    source_type = Column(Enum(SourceTypeEnum), nullable=False)
    source_index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    metadata_json = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    content = relationship("DocumentContent", back_populates="blocks")
