from __future__ import annotations
from typing import Any
from pydantic import BaseModel


class AnalysisLimits(BaseModel):
    max_depth: int | None = None
    max_positions: int | None = None
    max_time_ms: int | None = None
    min_confidence: float | None = None


class ChessMoveOut(BaseModel):
    from_row: int
    from_col: int
    to_row: int
    to_col: int
    promotion_piece: str | None = None


class MoveExpansion(BaseModel):
    move: ChessMoveOut
    notation: str | None = None
    state: dict[str, Any]
    is_terminal: bool
    terminal_outcome: str | None = None
    eval_score: float | None = None


class PositionExpandRequest(BaseModel):
    state: dict[str, Any]


class PositionExpandResponse(BaseModel):
    moves: list[MoveExpansion]
    count: int


class AnalysisMeta(BaseModel):
    depth_reached: int
    positions_analyzed: int
    time_elapsed_ms: int
    cutoff_reason: str | None


class ChessAnalysisRequest(BaseModel):
    state: dict[str, Any]
    limits: AnalysisLimits = AnalysisLimits()


class ChessAnalysisResponse(BaseModel):
    best_move: ChessMoveOut | None
    best_move_notation: str | None
    confidence: float | None
    analysis: AnalysisMeta
