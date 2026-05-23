"""Pydantic request and response models for the ML chess analysis API."""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel


class AnalysisLimits(BaseModel):
    """Optional bounds that cap an analysis run; all fields default to None (unbounded)."""

    max_depth: int | None = None
    max_positions: int | None = None
    max_time_ms: int | None = None
    min_confidence: float | None = None


class ChessMoveOut(BaseModel):
    """Board coordinates for a single chess move in the API's row/col convention."""

    from_row: int
    from_col: int
    to_row: int
    to_col: int
    promotion_piece: str | None = None


class MoveExpansion(BaseModel):
    """One legal move together with the resulting board state and evaluation."""

    move: ChessMoveOut
    notation: str | None = None
    state: dict[str, Any]
    is_terminal: bool
    terminal_outcome: str | None = None
    eval_score: float | None = None


class PositionExpandRequest(BaseModel):
    """Request body for the position-expand endpoint."""

    state: dict[str, Any]


class PositionExpandResponse(BaseModel):
    """All legal moves from the given position, each with the resulting state."""

    moves: list[MoveExpansion]
    count: int


class AnalysisMeta(BaseModel):
    """Metadata describing how far and how long an analysis run searched."""

    depth_reached: int
    positions_analyzed: int
    time_elapsed_ms: int
    cutoff_reason: str | None


class ChessAnalysisRequest(BaseModel):
    """Request body for the position-analyze endpoint."""

    state: dict[str, Any]
    limits: AnalysisLimits = AnalysisLimits()


class ChessAnalysisResponse(BaseModel):
    """Best move found by the analysis run, along with search metadata."""

    best_move: ChessMoveOut | None
    best_move_notation: str | None
    confidence: float | None
    analysis: AnalysisMeta
