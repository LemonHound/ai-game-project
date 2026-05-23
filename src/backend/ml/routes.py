from __future__ import annotations
import asyncio

from fastapi import APIRouter, Depends

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

router = APIRouter(prefix="/ml/chess", tags=["ML"])


@router.post("/expand", response_model=PositionExpandResponse)
async def expand_chess_position(
    request: PositionExpandRequest,
    _user: dict = Depends(require_user),
) -> PositionExpandResponse:
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
    result = await asyncio.to_thread(analyze_position, request.state, request.limits)
    return ChessAnalysisResponse(
        best_move=ChessMoveOut(**result["best_move"]) if result["best_move"] else None,
        best_move_notation=result["best_move_notation"],
        confidence=result["confidence"],
        analysis=AnalysisMeta(**result["analysis"]),
    )
