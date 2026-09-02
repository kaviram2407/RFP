"""Add Phase 7 Company Knowledge models

Revision ID: 69971ea8c1ee
Revises: b85e7e7c95d4
Create Date: 2026-09-02 21:47:00.000000

"""
from typing import Sequence, Union
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '69971ea8c1ee'
down_revision: Union[str, Sequence[str], None] = 'b85e7e7c95d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema using safe idempotent SQL statements."""
    # Ensure vector extension is enabled
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # 1. Create Enums safely
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'knowledgetypeenum') THEN CREATE TYPE knowledgetypeenum AS ENUM ('COMPANY_PROFILE', 'PRODUCT', 'SERVICE', 'TECHNICAL_CAPABILITY', 'SECURITY', 'COMPLIANCE', 'CERTIFICATION', 'IMPLEMENTATION', 'SUPPORT', 'CASE_STUDY', 'POLICY', 'STANDARD', 'OTHER'); END IF; END $$;")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'knowledgestatusenum') THEN CREATE TYPE knowledgestatusenum AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED'); END IF; END $$;")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'authoritylevelenum') THEN CREATE TYPE authoritylevelenum AS ENUM ('AUTHORITATIVE', 'APPROVED', 'INTERNAL', 'REFERENCE'); END IF; END $$;")

    # 2. Create company_knowledge_document table
    op.execute("""
    CREATE TABLE IF NOT EXISTS company_knowledge_document (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organization(id),
        created_by_id UUID NOT NULL REFERENCES "user"(id),
        title VARCHAR NOT NULL,
        description TEXT,
        knowledge_type knowledgetypeenum NOT NULL,
        source_name VARCHAR,
        source_reference VARCHAR,
        status knowledgestatusenum NOT NULL DEFAULT 'DRAFT',
        authority_level authoritylevelenum NOT NULL DEFAULT 'APPROVED',
        effective_from TIMESTAMP WITH TIME ZONE,
        effective_until TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
        archived_at TIMESTAMP WITH TIME ZONE
    );
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_company_knowledge_document_authority_level ON company_knowledge_document (authority_level);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_company_knowledge_document_created_by_id ON company_knowledge_document (created_by_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_company_knowledge_document_knowledge_type ON company_knowledge_document (knowledge_type);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_company_knowledge_document_organization_id ON company_knowledge_document (organization_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_company_knowledge_document_status ON company_knowledge_document (status);")

    # 3. Create knowledge_document_version table
    op.execute("""
    CREATE TABLE IF NOT EXISTS knowledge_document_version (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organization(id),
        knowledge_document_id UUID NOT NULL REFERENCES company_knowledge_document(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        original_filename VARCHAR,
        content_type VARCHAR,
        storage_key VARCHAR,
        checksum_sha256 VARCHAR,
        raw_content TEXT,
        processing_status processingstatusenum NOT NULL DEFAULT 'PENDING',
        processing_started_at TIMESTAMP WITH TIME ZONE,
        processing_completed_at TIMESTAMP WITH TIME ZONE,
        processing_error TEXT,
        effective_from TIMESTAMP WITH TIME ZONE,
        effective_until TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT uq_knowledge_doc_version UNIQUE (knowledge_document_id, version_number)
    );
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_document_version_knowledge_document_id ON knowledge_document_version (knowledge_document_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_document_version_organization_id ON knowledge_document_version (organization_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_document_version_processing_status ON knowledge_document_version (processing_status);")

    # 4. Create knowledge_chunk table with vector(2048) and tsvector
    op.execute("""
    CREATE TABLE IF NOT EXISTS knowledge_chunk (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organization(id),
        knowledge_document_id UUID NOT NULL REFERENCES company_knowledge_document(id) ON DELETE CASCADE,
        knowledge_version_id UUID NOT NULL REFERENCES knowledge_document_version(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        character_count INTEGER NOT NULL,
        source_metadata JSONB,
        content_hash VARCHAR NOT NULL,
        embedding vector(2048),
        embedding_model VARCHAR NOT NULL DEFAULT 'nvidia/nemotron-3-embed-1b',
        embedding_dimensions INTEGER NOT NULL DEFAULT 2048,
        search_vector TSVECTOR,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL
    );
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_chunk_content_hash ON knowledge_chunk (content_hash);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_chunk_knowledge_document_id ON knowledge_chunk (knowledge_document_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_chunk_knowledge_version_id ON knowledge_chunk (knowledge_version_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_chunk_organization_id ON knowledge_chunk (organization_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_chunk_search_vector ON knowledge_chunk USING GIN (search_vector);")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP TABLE IF EXISTS knowledge_chunk;")
    op.execute("DROP TABLE IF EXISTS knowledge_document_version;")
    op.execute("DROP TABLE IF EXISTS company_knowledge_document;")
    op.execute("DROP TYPE IF EXISTS authoritylevelenum;")
    op.execute("DROP TYPE IF EXISTS knowledgestatusenum;")
    op.execute("DROP TYPE IF EXISTS knowledgetypeenum;")
