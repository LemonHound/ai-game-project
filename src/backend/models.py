"""Pydantic response and request models shared across the backend."""
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime

class GameInfo(BaseModel):
    """Metadata descriptor for a game shown on the games listing page."""

    id: str
    name: str
    description: str
    icon: str
    difficulty: str
    players: int
    status: str
    category: str
    tags: List[str]
    game_shell_ready: bool
    ai_model_integrated: bool

class MoveRequest(BaseModel):
    """Generic request body for the game end/forfeit endpoint."""

    gameSessionId: str
    move: Any
    userId: Optional[int] = None

class TttNewGameRequest(BaseModel):
    """Request body for starting a new Tic-Tac-Toe game."""

    player_starts: bool = True

class TttMoveRequest(BaseModel):
    """Request body for a Tic-Tac-Toe player move."""

    position: int

class C4NewGameRequest(BaseModel):
    """Request body for starting a new Connect 4 game."""

    player_starts: bool = True


class C4MoveRequest(BaseModel):
    """Request body for a Connect 4 player move."""

    col: int


class CheckersNewGameRequest(BaseModel):
    """Request body for starting a new Checkers game."""

    player_starts: bool = True


class CheckersMoveRequest(BaseModel):
    """Request body for a Checkers player move."""

    from_pos: int
    to_pos: int


class DaBNewGameRequest(BaseModel):
    """Request body for starting a new Dots and Boxes game."""

    player_starts: bool = True


class DaBMoveRequest(BaseModel):
    """Request body for a Dots and Boxes player move."""

    type: str
    row: int
    col: int


class ChessNewGameRequest(BaseModel):
    """Request body for starting a new Chess game."""

    player_starts: bool = True


class ChessMoveRequest(BaseModel):
    """Request body for a Chess player move, identified by source and destination squares."""

    fromRow: int
    fromCol: int
    toRow: int
    toCol: int
    promotionPiece: Optional[str] = None
