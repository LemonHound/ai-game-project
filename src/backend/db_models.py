from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Column, Index, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class GameSession(SQLModel, table=True):
    __tablename__ = "game_sessions"
    __table_args__ = (
        CheckConstraint(
            "(is_draw::int + player_won::int + ai_won::int) <= 1",
            name="game_sessions_outcome_check",
        ),
        Index(
            "uq_active_session_per_user_game",
            "user_id",
            "game_type",
            unique=True,
            postgresql_where=text("NOT game_ended"),
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: int
    game_type: str = Field(max_length=50)
    difficulty: str = Field(max_length=20, default="medium")
    game_ended: bool = Field(default=False)
    game_abandoned: bool = Field(default=False)
    is_draw: bool = Field(default=False)
    player_won: bool = Field(default=False)
    ai_won: bool = Field(default=False)
    started_at: datetime = Field(default_factory=_utcnow)
    last_move_at: datetime = Field(default_factory=_utcnow)


class TicTacToeMove(SQLModel, table=True):
    __tablename__ = "tic_tac_toe_moves"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="game_sessions.id", nullable=False)
    move_number: int
    player: str = Field(max_length=10)
    move: Any = Field(sa_column=Column(JSONB, nullable=False))
    board_state_after: Any = Field(sa_column=Column(JSONB, nullable=False))
    engine_eval: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)


class ChessMove(SQLModel, table=True):
    __tablename__ = "chess_moves"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="game_sessions.id", nullable=False)
    move_number: int
    player: str = Field(max_length=10)
    move: Any = Field(sa_column=Column(JSONB, nullable=False))
    board_state_after: Any = Field(sa_column=Column(JSONB, nullable=False))
    engine_eval: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)


class CheckersMove(SQLModel, table=True):
    __tablename__ = "checkers_moves"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="game_sessions.id", nullable=False)
    move_number: int
    player: str = Field(max_length=10)
    move: Any = Field(sa_column=Column(JSONB, nullable=False))
    board_state_after: Any = Field(sa_column=Column(JSONB, nullable=False))
    engine_eval: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)


class Connect4Move(SQLModel, table=True):
    __tablename__ = "connect4_moves"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="game_sessions.id", nullable=False)
    move_number: int
    player: str = Field(max_length=10)
    move: Any = Field(sa_column=Column(JSONB, nullable=False))
    board_state_after: Any = Field(sa_column=Column(JSONB, nullable=False))
    engine_eval: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)


class DotsAndBoxesMove(SQLModel, table=True):
    __tablename__ = "dots_and_boxes_moves"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="game_sessions.id", nullable=False)
    move_number: int
    player: str = Field(max_length=10)
    move: Any = Field(sa_column=Column(JSONB, nullable=False))
    board_state_after: Any = Field(sa_column=Column(JSONB, nullable=False))
    engine_eval: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)


GAME_TYPE_TO_MOVE_MODEL: dict[str, type[SQLModel]] = {
    "tic_tac_toe": TicTacToeMove,
    "chess": ChessMove,
    "checkers": CheckersMove,
    "connect4": Connect4Move,
    "dots_and_boxes": DotsAndBoxesMove,
}

GAME_ID_TO_TYPE: dict[str, str] = {
    "tic-tac-toe": "tic_tac_toe",
    "chess": "chess",
    "checkers": "checkers",
    "connect4": "connect4",
    "dots-and-boxes": "dots_and_boxes",
}
