from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid
import enum

from app.db.base_class import Base

class ProjectStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    SUBMITTED = "SUBMITTED"
    AWARDED = "AWARDED"
    LOST = "LOST"
    ARCHIVED = "ARCHIVED"

class RFPProject(Base):
    __tablename__ = "rfp_project"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organization.id"), nullable=False, index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False, index=True)

    name = Column(String, nullable=False)
    reference_number = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    customer_name = Column(String, nullable=True)
    customer_contact = Column(String, nullable=True)

    status = Column(Enum(ProjectStatusEnum), nullable=False, default=ProjectStatusEnum.DRAFT)

    submission_deadline = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    archived_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("organization_id", "reference_number", name="uq_org_ref_number"),
        Index("ix_rfp_project_org_status", "organization_id", "status"),
        Index("ix_rfp_project_org_created", "organization_id", "created_at"),
    )
