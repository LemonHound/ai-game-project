"""Add game_shell_ready and ai_model_integrated to games

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "games",
        sa.Column(
            "game_shell_ready",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "games",
        sa.Column(
            "ai_model_integrated",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.execute("""
        UPDATE games SET
            game_shell_ready = CASE id
                WHEN 'pong' THEN false
                ELSE true
            END,
            ai_model_integrated = CASE id
                WHEN 'tic-tac-toe' THEN true
                ELSE false
            END
    """)
    op.execute("""
        UPDATE games SET tags = CASE id
            WHEN 'tic-tac-toe' THEN ARRAY['Strategy', 'Quick Play']::text[]
            WHEN 'connect4' THEN ARRAY['Strategy']::text[]
            WHEN 'dots-and-boxes' THEN ARRAY['Strategy', 'Territory']::text[]
            WHEN 'chess' THEN ARRAY['Strategy']::text[]
            WHEN 'checkers' THEN ARRAY['Strategy', 'Classic']::text[]
            WHEN 'pong' THEN ARRAY['Arcade', 'Classic']::text[]
            ELSE tags
        END
    """)
    op.alter_column("games", "game_shell_ready", server_default=None)
    op.alter_column("games", "ai_model_integrated", server_default=None)


def downgrade() -> None:
    op.drop_column("games", "ai_model_integrated")
    op.drop_column("games", "game_shell_ready")
