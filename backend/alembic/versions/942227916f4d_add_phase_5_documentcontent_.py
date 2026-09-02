"""Add Phase 5 DocumentContent, DocumentContentBlock models and processing status fields

Revision ID: 942227916f4d
Revises: 604df9fc7238
Create Date: 2026-09-02 21:29:25.539984

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM


# revision identifiers, used by Alembic.
revision: str = '942227916f4d'
down_revision: Union[str, Sequence[str], None] = '604df9fc7238'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create Enum types safely using PostgreSQL DO block
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processingstatusenum') THEN CREATE TYPE processingstatusenum AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'); END IF; END $$;")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sourcetypeenum') THEN CREATE TYPE sourcetypeenum AS ENUM ('PAGE', 'PARAGRAPH', 'SHEET', 'SLIDE'); END IF; END $$;")

    op.execute("CREATE TABLE IF NOT EXISTS document_content ("
               "id UUID PRIMARY KEY, "
               "organization_id UUID NOT NULL REFERENCES organization(id), "
               "document_version_id UUID NOT NULL UNIQUE REFERENCES document_version(id), "
               "full_text TEXT NOT NULL, "
               "character_count INTEGER NOT NULL, "
               "source_unit_count INTEGER NOT NULL, "
               "created_at TIMESTAMP WITH TIME ZONE NOT NULL, "
               "updated_at TIMESTAMP WITH TIME ZONE NOT NULL);")

    op.execute("CREATE INDEX IF NOT EXISTS ix_document_content_document_version_id ON document_content (document_version_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_content_organization_id ON document_content (organization_id);")

    op.execute("CREATE TABLE IF NOT EXISTS document_content_block ("
               "id UUID PRIMARY KEY, "
               "organization_id UUID NOT NULL REFERENCES organization(id), "
               "document_content_id UUID NOT NULL REFERENCES document_content(id), "
               "document_version_id UUID NOT NULL REFERENCES document_version(id), "
               "sequence_number INTEGER NOT NULL, "
               "source_type sourcetypeenum NOT NULL, "
               "source_index INTEGER NOT NULL, "
               "text TEXT NOT NULL, "
               "metadata_json JSON, "
               "created_at TIMESTAMP WITH TIME ZONE NOT NULL);")

    op.execute("CREATE INDEX IF NOT EXISTS ix_document_content_block_document_content_id ON document_content_block (document_content_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_content_block_document_version_id ON document_content_block (document_version_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_content_block_organization_id ON document_content_block (organization_id);")

    op.execute("ALTER TABLE document_version ADD COLUMN IF NOT EXISTS processing_status processingstatusenum NOT NULL DEFAULT 'PENDING';")
    op.execute("ALTER TABLE document_version ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE;")
    op.execute("ALTER TABLE document_version ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMP WITH TIME ZONE;")
    op.execute("ALTER TABLE document_version ADD COLUMN IF NOT EXISTS processing_error TEXT;")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TABLE document_version DROP COLUMN IF EXISTS processing_error;")
    op.execute("ALTER TABLE document_version DROP COLUMN IF EXISTS processing_completed_at;")
    op.execute("ALTER TABLE document_version DROP COLUMN IF EXISTS processing_started_at;")
    op.execute("ALTER TABLE document_version DROP COLUMN IF EXISTS processing_status;")
    op.execute("DROP TABLE IF EXISTS document_content_block;")
    op.execute("DROP TABLE IF EXISTS document_content;")
    op.execute("DROP TYPE IF EXISTS sourcetypeenum;")
    op.execute("DROP TYPE IF EXISTS processingstatusenum;")
