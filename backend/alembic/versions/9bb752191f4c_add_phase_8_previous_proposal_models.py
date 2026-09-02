"""Add Phase 8 Previous Proposal models

Revision ID: 9bb752191f4c
Revises: 69971ea8c1ee
Create Date: 2026-09-02 21:56:30.000000

"""
from typing import Sequence, Union
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9bb752191f4c'
down_revision: Union[str, Sequence[str], None] = '69971ea8c1ee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema using safe idempotent SQL statements."""
    # 1. Create Enums safely
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposaloutcomeenum') THEN CREATE TYPE proposaloutcomeenum AS ENUM ('WON', 'LOST', 'NO_DECISION', 'UNKNOWN'); END IF; END $$;")
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposalstatusenum') THEN CREATE TYPE proposalstatusenum AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED'); END IF; END $$;")

    # 2. Create previous_proposal table
    op.execute("""
    CREATE TABLE IF NOT EXISTS previous_proposal (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organization(id),
        created_by_id UUID NOT NULL REFERENCES "user"(id),
        title VARCHAR NOT NULL,
        proposal_reference VARCHAR NOT NULL,
        customer_name VARCHAR,
        description TEXT,
        proposal_date TIMESTAMP WITH TIME ZONE,
        submission_date TIMESTAMP WITH TIME ZONE,
        outcome proposaloutcomeenum NOT NULL DEFAULT 'UNKNOWN',
        status proposalstatusenum NOT NULL DEFAULT 'DRAFT',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
        archived_at TIMESTAMP WITH TIME ZONE
    );
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_created_by_id ON previous_proposal (created_by_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_organization_id ON previous_proposal (organization_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_outcome ON previous_proposal (outcome);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_proposal_reference ON previous_proposal (proposal_reference);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_status ON previous_proposal (status);")

    # 3. Create previous_proposal_version table
    op.execute("""
    CREATE TABLE IF NOT EXISTS previous_proposal_version (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organization(id),
        previous_proposal_id UUID NOT NULL REFERENCES previous_proposal(id) ON DELETE CASCADE,
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
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT uq_previous_proposal_version UNIQUE (previous_proposal_id, version_number)
    );
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_version_organization_id ON previous_proposal_version (organization_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_version_previous_proposal_id ON previous_proposal_version (previous_proposal_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_version_processing_status ON previous_proposal_version (processing_status);")

    # 4. Create previous_proposal_section table
    op.execute("""
    CREATE TABLE IF NOT EXISTS previous_proposal_section (
        id UUID PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organization(id),
        proposal_id UUID NOT NULL REFERENCES previous_proposal(id) ON DELETE CASCADE,
        proposal_version_id UUID NOT NULL REFERENCES previous_proposal_version(id) ON DELETE CASCADE,
        section_index INTEGER NOT NULL,
        section_title VARCHAR,
        content TEXT NOT NULL,
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

    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_section_content_hash ON previous_proposal_section (content_hash);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_section_organization_id ON previous_proposal_section (organization_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_section_proposal_id ON previous_proposal_section (proposal_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_section_proposal_version_id ON previous_proposal_section (proposal_version_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_previous_proposal_section_search_vector ON previous_proposal_section USING GIN (search_vector);")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP TABLE IF EXISTS previous_proposal_section;")
    op.execute("DROP TABLE IF EXISTS previous_proposal_version;")
    op.execute("DROP TABLE IF EXISTS previous_proposal;")
    op.execute("DROP TYPE IF EXISTS proposalstatusenum;")
    op.execute("DROP TYPE IF EXISTS proposaloutcomeenum;")
