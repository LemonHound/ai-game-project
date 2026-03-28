"""Add session_timeout_hours to games table

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "games",
        sa.Column(
            "session_timeout_hours",
            sa.Integer,
            nullable=False,
            server_default="24",
        ),
    )
    op.execute("""
        UPDATE games SET session_timeout_hours = CASE id
            WHEN 'tic-tac-toe'    THEN 24
            WHEN 'dots-and-boxes' THEN 24
            WHEN 'connect4'       THEN 24
            WHEN 'checkers'       THEN 48
            WHEN 'chess'          THEN 72
            WHEN 'pong'           THEN 1
            ELSE 24
        END
    """)
    op.alter_column("games", "session_timeout_hours", server_default=None)


def downgrade() -> None:
    op.drop_column("games", "session_timeout_hours")
