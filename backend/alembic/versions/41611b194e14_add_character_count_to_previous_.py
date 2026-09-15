"""add_character_count_to_previous_proposal_section

Revision ID: 41611b194e14
Revises: 9bb752191f4c
Create Date: 2026-09-15 23:17:28.853839

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '41611b194e14'
down_revision: Union[str, Sequence[str], None] = '9bb752191f4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add character_count column to previous_proposal_section table safely."""
    op.execute("ALTER TABLE previous_proposal_section ADD COLUMN IF NOT EXISTS character_count INTEGER;")


def downgrade() -> None:
    """Drop character_count column from previous_proposal_section table."""
    op.execute("ALTER TABLE previous_proposal_section DROP COLUMN IF EXISTS character_count;")
