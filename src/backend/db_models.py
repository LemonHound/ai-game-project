from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Column, Index, String, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class GameRecord(SQLModel):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: int
    created_at: datetime = Field(default_factory=_utcnow)
    last_move_at: datetime = Field(default_factory=_utcnow)
    board_state: Any = Field(sa_column=Column(JSONB, nullable=False))
    move_list: list[str] = Field(
        sa_column=Column(ARRAY(String), nullable=False, server_default="{}")
    )
    game_ended: bool = Field(default=False)
    game_abandoned: bool = Field(default=False)
    is_draw: bool = Field(default=False)
    player_won: bool = Field(default=False)
    ai_won: bool = Field(default=False)


class TicTacToeGame(GameRecord, table=True):
    __tablename__ = "tic_tac_toe_games"
    __table_args__ = (
        CheckConstraint(
            "(is_draw::int + player_won::int + ai_won::int) <= 1",
            name="tic_tac_toe_games_outcome_check",
        ),
        Index(
            "uq_active_ttt_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("NOT game_ended"),
        ),
    )


class ChessGame(GameRecord, table=True):
    __tablename__ = "chess_games"
    __table_args__ = (
        CheckConstraint(
            "(is_draw::int + player_won::int + ai_won::int) <= 1",
            name="chess_games_outcome_check",
        ),
        Index(
            "uq_active_chess_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("NOT game_ended"),
        ),
    )


class CheckersGame(GameRecord, table=True):
    __tablename__ = "checkers_games"
    __table_args__ = (
        CheckConstraint(
            "(is_draw::int + player_won::int + ai_won::int) <= 1",
            name="checkers_games_outcome_check",
        ),
        Index(
            "uq_active_checkers_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("NOT game_ended"),
        ),
    )


class Connect4Game(GameRecord, table=True):
    __tablename__ = "connect4_games"
    __table_args__ = (
        CheckConstraint(
            "(is_draw::int + player_won::int + ai_won::int) <= 1",
            name="connect4_games_outcome_check",
        ),
        Index(
            "uq_active_connect4_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("NOT game_ended"),
        ),
    )


class DotsAndBoxesGame(GameRecord, table=True):
    __tablename__ = "dots_and_boxes_games"
    __table_args__ = (
        CheckConstraint(
            "(is_draw::int + player_won::int + ai_won::int) <= 1",
            name="dots_and_boxes_games_outcome_check",
        ),
        Index(
            "uq_active_dab_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("NOT game_ended"),
        ),
    )


GAME_TYPE_TO_MODEL: dict[str, type[GameRecord]] = {
    "tic_tac_toe": TicTacToeGame,
    "chess": ChessGame,
    "checkers": CheckersGame,
    "connect4": Connect4Game,
    "dots_and_boxes": DotsAndBoxesGame,
}

GAME_ID_TO_TYPE: dict[str, str] = {
    "tic-tac-toe": "tic_tac_toe",
    "chess": "chess",
    "checkers": "checkers",
    "connect4": "connect4",
    "dots-and-boxes": "dots_and_boxes",
}
