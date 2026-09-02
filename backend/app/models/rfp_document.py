from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum, UniqueConstraint, Index
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

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    document = relationship(
        "RFPDocument",
        back_populates="versions",
        foreign_keys=[rfp_document_id]
    )

    __table_args__ = (
        UniqueConstraint("rfp_document_id", "version_number", name="uq_doc_version_number"),
    )
