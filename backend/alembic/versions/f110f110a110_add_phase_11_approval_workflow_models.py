"""add_phase_11_approval_workflow_models

Revision ID: f110f110a110
Revises: e100f100a100
Create Date: 2026-09-18 21:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f110f110a110'
down_revision: Union[str, Sequence[str], None] = 'e100f100a100'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Safely add new values to proposalstatusenum in PostgreSQL
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'SUBMITTED';")
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'VP_REVIEW';")
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'CTO_REVIEW';")
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'CEO_REVIEW';")
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';")
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'REJECTED';")
    op.execute("ALTER TYPE proposalstatusenum ADD VALUE IF NOT EXISTS 'APPROVED';")

    # 2. Add Phase 11 workflow columns to proposal_version
    op.add_column('proposal_version', sa.Column('current_stage', sa.String(), nullable=True))
    op.add_column('proposal_version', sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('proposal_version', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('proposal_version', sa.Column('is_immutable', sa.Boolean(), server_default='false', nullable=False))

    # 3. Create proposal_approval table
    op.create_table(
        'proposal_approval',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('proposal_id', sa.UUID(), nullable=False),
        sa.Column('proposal_version_id', sa.UUID(), nullable=False),
        sa.Column('reviewer_id', sa.UUID(), nullable=False),
        sa.Column('reviewer_role', sa.String(), nullable=False),
        sa.Column('stage', sa.String(), nullable=False),
        sa.Column('decision', sa.String(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ),
        sa.ForeignKeyConstraint(['proposal_id'], ['proposal.id'], ),
        sa.ForeignKeyConstraint(['proposal_version_id'], ['proposal_version.id'], ),
        sa.ForeignKeyConstraint(['reviewer_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_proposal_approval_organization_id', 'proposal_approval', ['organization_id'], unique=False)
    op.create_index('ix_proposal_approval_proposal_id', 'proposal_approval', ['proposal_id'], unique=False)
    op.create_index('ix_proposal_approval_proposal_version_id', 'proposal_approval', ['proposal_version_id'], unique=False)
    op.create_index('ix_proposal_approval_reviewer_id', 'proposal_approval', ['reviewer_id'], unique=False)

    # 4. Create audit_log table
    op.create_table(
        'audit_log',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('actor_id', sa.UUID(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('entity_type', sa.String(), nullable=False),
        sa.Column('entity_id', sa.UUID(), nullable=False),
        sa.Column('metadata_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organization.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_log_organization_id', 'audit_log', ['organization_id'], unique=False)
    op.create_index('ix_audit_log_actor_id', 'audit_log', ['actor_id'], unique=False)
    op.create_index('ix_audit_log_action', 'audit_log', ['action'], unique=False)
    op.create_index('ix_audit_log_entity_type', 'audit_log', ['entity_type'], unique=False)
    op.create_index('ix_audit_log_entity_id', 'audit_log', ['entity_id'], unique=False)

def downgrade() -> None:
    op.drop_index('ix_audit_log_entity_id', table_name='audit_log')
    op.drop_index('ix_audit_log_entity_type', table_name='audit_log')
    op.drop_index('ix_audit_log_action', table_name='audit_log')
    op.drop_index('ix_audit_log_actor_id', table_name='audit_log')
    op.drop_index('ix_audit_log_organization_id', table_name='audit_log')
    op.drop_table('audit_log')

    op.drop_index('ix_proposal_approval_reviewer_id', table_name='proposal_approval')
    op.drop_index('ix_proposal_approval_proposal_version_id', table_name='proposal_approval')
    op.drop_index('ix_proposal_approval_proposal_id', table_name='proposal_approval')
    op.drop_index('ix_proposal_approval_organization_id', table_name='proposal_approval')
    op.drop_table('proposal_approval')

    op.drop_column('proposal_version', 'is_immutable')
    op.drop_column('proposal_version', 'completed_at')
    op.drop_column('proposal_version', 'submitted_at')
    op.drop_column('proposal_version', 'current_stage')
