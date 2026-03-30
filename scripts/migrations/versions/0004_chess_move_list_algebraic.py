"""Add move_list_algebraic column to chess_games

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chess_games",
        sa.Column(
            "move_list_algebraic",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("chess_games", "move_list_algebraic")
