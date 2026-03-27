"""Initial persistence schema

Revision ID: 0001
Revises:
Create Date: 2026-03-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ai_training_data CASCADE")
    op.execute("DROP TABLE IF EXISTS tic_tac_toe_games CASCADE")
    op.execute("DROP TABLE IF EXISTS tic_tac_toe_states CASCADE")
    op.execute("DROP TABLE IF EXISTS checkers_games CASCADE")
    op.execute("DROP TABLE IF EXISTS checkers_states CASCADE")
    op.execute("DROP TABLE IF EXISTS game_states CASCADE")

    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255),
            display_name VARCHAR(100),
            google_id VARCHAR(100) UNIQUE,
            profile_picture VARCHAR(500),
            is_active BOOLEAN DEFAULT true,
            email_verified BOOLEAN DEFAULT false,
            last_login TIMESTAMP,
            auth_provider VARCHAR(20) DEFAULT 'local',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            id SERIAL PRIMARY KEY,
            session_id VARCHAR(255) UNIQUE NOT NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)"
    )

    op.execute("""
        CREATE TABLE IF NOT EXISTS games (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            icon VARCHAR(10),
            difficulty VARCHAR(20),
            players INTEGER DEFAULT 1,
            status VARCHAR(20) DEFAULT 'active',
            category VARCHAR(50),
            tags TEXT[],
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute("""
        INSERT INTO games (id, name, description, icon, difficulty, players, status, category, tags)
        VALUES
            ('tic-tac-toe', 'Tic Tac Toe',
             'Classic 3x3 grid game with adaptive AI opponent that learns your strategies',
             '⭕', 'Easy', 1, 'active', 'strategy',
             ARRAY['Strategy', '1 Player', 'Quick Play']),
            ('dots-and-boxes', 'Dots and Boxes',
             'Connect dots to complete boxes and claim territory in this strategic paper game',
             '⬜', 'Medium', 1, 'active', 'strategy',
             ARRAY['Strategy', '1 Player', 'Territory']),
            ('connect4', 'Connect 4',
             'Drop pieces to connect four in a row - vertically, horizontally, or diagonally',
             '🔴', 'Medium', 1, 'active', 'strategy',
             ARRAY['Strategy', '1 Player', 'Classic']),
            ('chess', 'Chess',
             'Chess with AI that learns your playing style and adapts its strategy',
             '♟️', 'Expert', 1, 'active', 'strategy',
             ARRAY['Strategy', '1 Player', 'Coming Soon']),
            ('checkers', 'Checkers',
             'Classic checkers with an AI that adapts to your tactical preferences',
             '⚫', 'Hard', 1, 'active', 'strategy',
             ARRAY['Strategy', '1 Player', 'Classic']),
            ('pong', 'Pong', 'Classic pong game, popularized by Atari',
             '🕹️', 'Easy', 1, 'active', 'arcade',
             ARRAY['arcade', '1 Player', 'Classic'])
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            icon = EXCLUDED.icon,
            difficulty = EXCLUDED.difficulty,
            status = EXCLUDED.status,
            category = EXCLUDED.category,
            tags = EXCLUDED.tags,
            updated_at = CURRENT_TIMESTAMP
    """)

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
    op.execute("""
        CREATE UNIQUE INDEX uq_active_session_per_user_game
        ON game_sessions(user_id, game_type) WHERE NOT game_ended
    """)
    op.create_index("idx_game_sessions_user_id", "game_sessions", ["user_id"])

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

    for game_type in [
        "tic_tac_toe",
        "chess",
        "checkers",
        "connect4",
        "dots_and_boxes",
    ]:
        table_name = f"{game_type}_moves"
        op.create_table(table_name, *_move_table_columns)
        op.create_index(
            f"idx_{table_name}_session_id", table_name, ["session_id"]
        )


def downgrade() -> None:
    for game_type in [
        "dots_and_boxes",
        "connect4",
        "checkers",
        "chess",
        "tic_tac_toe",
    ]:
        op.drop_table(f"{game_type}_moves")
    op.drop_table("game_sessions")
