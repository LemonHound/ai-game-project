"""FastAPI router for ML chess position expansion and analysis endpoints."""
from __future__ import annotations
import asyncio

from fastapi import APIRouter, Depends, HTTPException

from auth_deps import require_user
from ml.chess_analysis import analyze_position, expand_position
from ml.models import (
    AnalysisMeta,
    ChessAnalysisRequest,
    ChessAnalysisResponse,
    ChessMoveOut,
    MoveExpansion,
    PositionExpandRequest,
    PositionExpandResponse,
)

_REQUIRED_STATE_KEYS = {"board", "current_player"}


def _check_state(state: dict) -> None:
    missing = _REQUIRED_STATE_KEYS - set(state.keys())
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing state fields: {sorted(missing)}")


router = APIRouter(prefix="/ml/chess", tags=["ML"])


@router.post("/expand", response_model=PositionExpandResponse)
async def expand_chess_position(
    request: PositionExpandRequest,
    _user: dict = Depends(require_user),
) -> PositionExpandResponse:
    """Enumerate all legal moves from the given board state with resulting child states.

    Args:
        request: Body containing the current board state.
        _user: Injected authenticated user (unused beyond auth enforcement).

    Returns:
        All legal moves and their resulting states with evaluation scores.
    """
    _check_state(request.state)
    moves_raw = await asyncio.to_thread(expand_position, request.state)
    moves = [
        MoveExpansion(**{**m, "move": ChessMoveOut(**m["move"])})
        for m in moves_raw
    ]
    return PositionExpandResponse(moves=moves, count=len(moves))


@router.post("/analyze", response_model=ChessAnalysisResponse)
async def analyze_chess_position(
    request: ChessAnalysisRequest,
    _user: dict = Depends(require_user),
) -> ChessAnalysisResponse:
    """Run a bounded tree search from the given position and return the best move found.

    Args:
        request: Body containing the board state and optional analysis limits.
        _user: Injected authenticated user (unused beyond auth enforcement).

    Returns:
        Best move, confidence score, and search metadata.
    """
    _check_state(request.state)
    result = await asyncio.to_thread(analyze_position, request.state, request.limits)
    return ChessAnalysisResponse(
        best_move=ChessMoveOut(**result["best_move"]) if result["best_move"] else None,
        best_move_notation=result["best_move_notation"],
        confidence=result["confidence"],
        analysis=AnalysisMeta(**result["analysis"]),
    )
