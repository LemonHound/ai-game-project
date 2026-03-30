"""Consolidated game records — one table per game, one row per session

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_GAME_TYPES = [
    "tic_tac_toe",
    "chess",
    "checkers",
    "connect4",
    "dots_and_boxes",
]


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tic_tac_toe_moves CASCADE")
    op.execute("DROP TABLE IF EXISTS chess_moves CASCADE")
    op.execute("DROP TABLE IF EXISTS checkers_moves CASCADE")
    op.execute("DROP TABLE IF EXISTS connect4_moves CASCADE")
    op.execute("DROP TABLE IF EXISTS dots_and_boxes_moves CASCADE")
    op.execute("DROP TABLE IF EXISTS game_sessions CASCADE")

    for game_type in _GAME_TYPES:
        table_name = f"{game_type}_games"
        op.create_table(
            table_name,
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer,
                sa.ForeignKey("users.id"),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.TIMESTAMP(timezone=False),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.Column(
                "last_move_at",
                sa.TIMESTAMP(timezone=False),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.Column("board_state", postgresql.JSONB, nullable=False),
            sa.Column(
                "move_list",
                postgresql.ARRAY(sa.Text),
                nullable=False,
                server_default="{}",
            ),
            sa.Column(
                "game_ended",
                sa.Boolean,
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "game_abandoned",
                sa.Boolean,
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "is_draw",
                sa.Boolean,
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "player_won",
                sa.Boolean,
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "ai_won",
                sa.Boolean,
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.CheckConstraint(
                "(is_draw::int + player_won::int + ai_won::int) <= 1",
                name=f"{table_name}_outcome_check",
            ),
        )
        op.execute(
            f"CREATE UNIQUE INDEX uq_active_{game_type}_per_user"
            f" ON {table_name}(user_id) WHERE NOT game_ended"
        )
        op.create_index(f"idx_{table_name}_user_id", table_name, ["user_id"])


def downgrade() -> None:
    for game_type in reversed(_GAME_TYPES):
        op.drop_table(f"{game_type}_games")

    op.create_table(
        "game_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column("game_type", sa.String(50), nullable=False),
        sa.Column(
            "difficulty", sa.String(20), nullable=False, server_default="medium"
        ),
        sa.Column(
            "game_ended", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "game_abandoned",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_draw", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "player_won", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "ai_won", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "started_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "last_move_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "(is_draw::int + player_won::int + ai_won::int) <= 1",
            name="game_sessions_outcome_check",
        ),
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_active_session_per_user_game"
        " ON game_sessions(user_id, game_type) WHERE NOT game_ended"
    )

    _move_table_columns = [
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("game_sessions.id"),
            nullable=False,
        ),
        sa.Column("move_number", sa.Integer, nullable=False),
        sa.Column("player", sa.String(10), nullable=False),
        sa.Column("move", postgresql.JSONB, nullable=False),
        sa.Column("board_state_after", postgresql.JSONB, nullable=False),
        sa.Column("engine_eval", sa.Float, nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    ]

    for game_type in _GAME_TYPES:
        table_name = f"{game_type}_moves"
        op.create_table(table_name, *_move_table_columns)
        op.create_index(
            f"idx_{table_name}_session_id", table_name, ["session_id"]
        )
