"""add_phase_10_proposal_generation_models

Revision ID: e100f100a100
Revises: d788b82de69a
Create Date: 2026-09-16 21:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e100f100a100'
down_revision: Union[str, Sequence[str], None] = 'd788b82de69a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Safely add new values to proposalstatusenum in PostgreSQL
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'GENERATING';")
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'GENERATED';")
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'IN_REVIEW';")
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'FINALIZED';")

    # 2. Enums
    generationstatusenum = postgresql.ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', name='generationstatusenum', create_type=False)
    generationstatusenum.create(op.get_bind(), checkfirst=True)

    sectionreviewstatusenum = postgresql.ENUM('PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_REVISION', name='sectionreviewstatusenum', create_type=False)
    sectionreviewstatusenum.create(op.get_bind(), checkfirst=True)

    # Tables
    op.create_table(
        'proposal',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('rfp_project_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', postgresql.ENUM('DRAFT', 'GENERATING', 'GENERATED', 'IN_REVIEW', 'FINALIZED', name='proposalstatusenum', create_type=False), nullable=False),
        sa.Column('current_version_id', sa.UUID(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ),
        sa.ForeignKeyConstraint(['rfp_project_id'], ['rfp_project.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_proposal_organization_id'), 'proposal', ['organization_id'], unique=False)
    op.create_index(op.f('ix_proposal_rfp_project_id'), 'proposal', ['rfp_project_id'], unique=False)
    op.create_index(op.f('ix_proposal_status'), 'proposal', ['status'], unique=False)

    op.create_table(
        'proposal_version',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('proposal_id', sa.UUID(), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('status', postgresql.ENUM('DRAFT', 'GENERATING', 'GENERATED', 'IN_REVIEW', 'FINALIZED', name='proposalstatusenum', create_type=False), nullable=False),
        sa.Column('generation_status', postgresql.ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', name='generationstatusenum', create_type=False), nullable=False),
        sa.Column('generation_started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('generation_completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('generation_error', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ),
        sa.ForeignKeyConstraint(['proposal_id'], ['proposal.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('proposal_id', 'version_number', name='uq_proposal_version_number')
    )
    op.create_index(op.f('ix_proposal_version_generation_status'), 'proposal_version', ['generation_status'], unique=False)
    op.create_index(op.f('ix_proposal_version_organization_id'), 'proposal_version', ['organization_id'], unique=False)
    op.create_index(op.f('ix_proposal_version_proposal_id'), 'proposal_version', ['proposal_id'], unique=False)
    op.create_index(op.f('ix_proposal_version_status'), 'proposal_version', ['status'], unique=False)

    # Add foreign key for proposal.current_version_id
    op.create_foreign_key('fk_proposal_current_version_id', 'proposal', 'proposal_version', ['current_version_id'], ['id'], use_alter=True)

    op.create_table(
        'proposal_section',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('proposal_id', sa.UUID(), nullable=False),
        sa.Column('proposal_version_id', sa.UUID(), nullable=False),
        sa.Column('section_key', sa.String(), nullable=False),
        sa.Column('section_title', sa.String(), nullable=False),
        sa.Column('section_order', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('ai_generated_content', sa.Text(), nullable=True),
        sa.Column('status', postgresql.ENUM('DRAFT', 'GENERATING', 'GENERATED', 'IN_REVIEW', 'FINALIZED', name='proposalstatusenum', create_type=False), nullable=False),
        sa.Column('generation_status', postgresql.ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', name='generationstatusenum', create_type=False), nullable=False),
        sa.Column('review_status', postgresql.ENUM('PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_REVISION', name='sectionreviewstatusenum', create_type=False), nullable=False),
        sa.Column('confidence_score', sa.Float(), nullable=False),
        sa.Column('review_required', sa.Boolean(), nullable=False),
        sa.Column('reviewer_comments', sa.Text(), nullable=True),
        sa.Column('reviewed_by_id', sa.UUID(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ),
        sa.ForeignKeyConstraint(['proposal_id'], ['proposal.id'], ),
        sa.ForeignKeyConstraint(['proposal_version_id'], ['proposal_version.id'], ),
        sa.ForeignKeyConstraint(['reviewed_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_proposal_section_generation_status'), 'proposal_section', ['generation_status'], unique=False)
    op.create_index(op.f('ix_proposal_section_organization_id'), 'proposal_section', ['organization_id'], unique=False)
    op.create_index(op.f('ix_proposal_section_proposal_id'), 'proposal_section', ['proposal_id'], unique=False)
    op.create_index(op.f('ix_proposal_section_proposal_version_id'), 'proposal_section', ['proposal_version_id'], unique=False)
    op.create_index(op.f('ix_proposal_section_review_required'), 'proposal_section', ['review_required'], unique=False)
    op.create_index(op.f('ix_proposal_section_review_status'), 'proposal_section', ['review_status'], unique=False)
    op.create_index(op.f('ix_proposal_section_section_key'), 'proposal_section', ['section_key'], unique=False)
    op.create_index(op.f('ix_proposal_section_status'), 'proposal_section', ['status'], unique=False)

    op.create_table(
        'proposal_section_requirement',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('proposal_section_id', sa.UUID(), nullable=False),
        sa.Column('requirement_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ),
        sa.ForeignKeyConstraint(['proposal_section_id'], ['proposal_section.id'], ),
        sa.ForeignKeyConstraint(['requirement_id'], ['requirement.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_proposal_section_requirement_organization_id'), 'proposal_section_requirement', ['organization_id'], unique=False)
    op.create_index(op.f('ix_proposal_section_requirement_proposal_section_id'), 'proposal_section_requirement', ['proposal_section_id'], unique=False)
    op.create_index(op.f('ix_proposal_section_requirement_requirement_id'), 'proposal_section_requirement', ['requirement_id'], unique=False)

    op.create_table(
        'generated_content_evidence',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('proposal_section_id', sa.UUID(), nullable=False),
        sa.Column('source_type', sa.String(), nullable=False),
        sa.Column('source_id', sa.UUID(), nullable=True),
        sa.Column('source_title', sa.String(), nullable=False),
        sa.Column('citation_reference', sa.String(), nullable=False),
        sa.Column('evidence_text', sa.Text(), nullable=False),
        sa.Column('relevance_score', sa.Float(), nullable=False),
        sa.Column('authority_level', sa.String(), nullable=False),
        sa.Column('is_conflicting', sa.Boolean(), nullable=False),
        sa.Column('conflict_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ),
        sa.ForeignKeyConstraint(['proposal_section_id'], ['proposal_section.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_generated_content_evidence_organization_id'), 'generated_content_evidence', ['organization_id'], unique=False)
    op.create_index(op.f('ix_generated_content_evidence_proposal_section_id'), 'generated_content_evidence', ['proposal_section_id'], unique=False)

    op.create_table(
        'unsupported_claim',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('proposal_section_id', sa.UUID(), nullable=False),
        sa.Column('claim', sa.Text(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('severity', sa.String(), nullable=False),
        sa.Column('review_required', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ),
        sa.ForeignKeyConstraint(['proposal_section_id'], ['proposal_section.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_unsupported_claim_organization_id'), 'unsupported_claim', ['organization_id'], unique=False)
    op.create_index(op.f('ix_unsupported_claim_proposal_section_id'), 'unsupported_claim', ['proposal_section_id'], unique=False)

def downgrade() -> None:
    op.drop_table('unsupported_claim')
    op.drop_table('generated_content_evidence')
    op.drop_table('proposal_section_requirement')
    op.drop_table('proposal_section')
    op.drop_constraint('fk_proposal_current_version_id', 'proposal', type_='foreignkey')
    op.drop_table('proposal_version')
    op.drop_table('proposal')
    
    op.execute("DROP TYPE IF EXISTS sectionreviewstatusenum")
    op.execute("DROP TYPE IF EXISTS generationstatusenum")
    op.execute("DROP TYPE IF EXISTS proposalstatusenum")
