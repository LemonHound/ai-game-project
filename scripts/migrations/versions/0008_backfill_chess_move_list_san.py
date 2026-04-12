"""Backfill chess_games.move_list with SAN from move_list_algebraic

move_list previously stored UCI notation (e.g. "e2e4"). move_list_algebraic
stored SAN (e.g. "e4"). Going forward, move_list stores SAN directly and
move_list_algebraic is retained for backward compatibility only.

This migration copies move_list_algebraic -> move_list for existing rows where
both arrays have the same length and move_list_algebraic is non-empty.

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-12
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE chess_games
        SET move_list = move_list_algebraic
        WHERE cardinality(move_list_algebraic) > 0
          AND cardinality(move_list_algebraic) = cardinality(move_list)
        """
    )


def downgrade() -> None:
    pass
