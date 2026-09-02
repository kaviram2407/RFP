"""Add Requirement and RequirementEvidence models

Revision ID: b85e7e7c95d4
Revises: 942227916f4d
Create Date: 2026-09-02 21:39:06.608460

"""
from typing import Sequence, Union
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b85e7e7c95d4'
down_revision: Union[str, Sequence[str], None] = '942227916f4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema using safe idempotent SQL statements."""
    # 1. Create Enums safely
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirementcategoryenum') THEN CREATE TYPE requirementcategoryenum AS ENUM ('FUNCTIONAL', 'TECHNICAL', 'SECURITY', 'COMPLIANCE', 'LEGAL', 'COMMERCIAL', 'FINANCIAL', 'OPERATIONAL', 'SUPPORT', 'IMPLEMENTATION', 'GENERAL'); END IF; END $$;")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirementtypeenum') THEN CREATE TYPE requirementtypeenum AS ENUM ('MANDATORY', 'OPTIONAL', 'INFORMATIONAL'); END IF; END $$;")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirementpriorityenum') THEN CREATE TYPE requirementpriorityenum AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'); END IF; END $$;")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirementstatusenum') THEN CREATE TYPE requirementstatusenum AS ENUM ('EXTRACTED', 'REVIEW_REQUIRED', 'ACCEPTED', 'REJECTED'); END IF; END $$;")

    # 2. Create requirement table
    op.execute("""
    CREATE TABLE IF NOT EXISTS requirement (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organization(id),
        rfp_project_id UUID NOT NULL REFERENCES rfp_project(id),
        document_version_id UUID NOT NULL REFERENCES document_version(id),
        requirement_code VARCHAR NOT NULL,
        title VARCHAR NOT NULL,
        description TEXT NOT NULL,
        category requirementcategoryenum NOT NULL,
        requirement_type requirementtypeenum NOT NULL,
        priority requirementpriorityenum NOT NULL,
        mandatory BOOLEAN NOT NULL DEFAULT TRUE,
        confidence_score DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        status requirementstatusenum NOT NULL DEFAULT 'EXTRACTED',
        review_required BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL
    );
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_category ON requirement (category);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_document_version_id ON requirement (document_version_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_organization_id ON requirement (organization_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_priority ON requirement (priority);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_requirement_type ON requirement (requirement_type);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_review_required ON requirement (review_required);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_rfp_project_id ON requirement (rfp_project_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_status ON requirement (status);")

    # 3. Create requirement_evidence table
    op.execute("""
    CREATE TABLE IF NOT EXISTS requirement_evidence (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organization(id),
        requirement_id UUID NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
        document_version_id UUID NOT NULL REFERENCES document_version(id),
        content_block_id UUID NOT NULL REFERENCES document_content_block(id),
        evidence_text TEXT NOT NULL,
        source_type VARCHAR NOT NULL DEFAULT 'CURRENT_RFP',
        source_reference VARCHAR NOT NULL,
        relevance_score DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL
    );
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_evidence_content_block_id ON requirement_evidence (content_block_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_evidence_document_version_id ON requirement_evidence (document_version_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_evidence_organization_id ON requirement_evidence (organization_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_requirement_evidence_requirement_id ON requirement_evidence (requirement_id);")

    # 4. Add extraction lifecycle columns to document_version
    op.execute("ALTER TABLE document_version ADD COLUMN IF NOT EXISTS extraction_status VARCHAR NOT NULL DEFAULT 'PENDING';")
    op.execute("ALTER TABLE document_version ADD COLUMN IF NOT EXISTS extraction_started_at TIMESTAMP WITH TIME ZONE;")
    op.execute("ALTER TABLE document_version ADD COLUMN IF NOT EXISTS extraction_completed_at TIMESTAMP WITH TIME ZONE;")
    op.execute("ALTER TABLE document_version ADD COLUMN IF NOT EXISTS extraction_error TEXT;")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TABLE document_version DROP COLUMN IF EXISTS extraction_error;")
    op.execute("ALTER TABLE document_version DROP COLUMN IF EXISTS extraction_completed_at;")
    op.execute("ALTER TABLE document_version DROP COLUMN IF EXISTS extraction_started_at;")
    op.execute("ALTER TABLE document_version DROP COLUMN IF EXISTS extraction_status;")
    op.execute("DROP TABLE IF EXISTS requirement_evidence;")
    op.execute("DROP TABLE IF EXISTS requirement;")
    op.execute("DROP TYPE IF EXISTS requirementstatusenum;")
    op.execute("DROP TYPE IF EXISTS requirementpriorityenum;")
    op.execute("DROP TYPE IF EXISTS requirementtypeenum;")
    op.execute("DROP TYPE IF EXISTS requirementcategoryenum;")
