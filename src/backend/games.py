import asyncio
import copy
import json
import logging
import os
import time
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from opentelemetry import metrics, trace
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import persistence_service
from auth_service import AuthService
from db import db_dependency, get_session
from db_models import GAME_ID_TO_TYPE
from game_engine.base import MoveProcessor, StatusBroadcaster, StatusEvent
from game_engine.checkers_engine import CheckersAIStrategy, CheckersEngine
from game_engine.chess_engine import ChessAIStrategy, ChessEngine
from game_engine.connect4_engine import Connect4AIStrategy, Connect4Engine
from game_engine.dab_engine import DaBEngine, DaBStrategy
from game_engine.ttt_engine import TicTacToeAIStrategy, TicTacToeEngine
from game_logic.checkers import checkers_game
from game_logic.chess import chess_game
from game_logic.connect4 import connect4_game
from game_logic.dots_and_boxes import dots_and_boxes_game
from game_logic.tic_tac_toe import tic_tac_toe_game
from models import (
    C4MoveRequest,
    C4NewGameRequest,
    CheckersMoveRequest,
    CheckersNewGameRequest,
    ChessMoveRequest,
    ChessNewGameRequest,
    DaBMoveRequest,
    DaBNewGameRequest,
    MoveRequest,
    StartGameRequest,
    TttMoveRequest,
    TttNewGameRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()
_auth_service = AuthService()
tracer = trace.get_tracer(__name__)
meter = metrics.get_meter(__name__)
_ai_duration = meter.create_histogram("game.ai.compute_duration", unit="ms", description="AI move computation time")

_ttt_engine = TicTacToeEngine()
_ttt_strategy = TicTacToeAIStrategy()
_ttt_processor = MoveProcessor()
_ttt_move_queues: dict[UUID, asyncio.Queue] = {}

_c4_engine = Connect4Engine()
_c4_strategy = Connect4AIStrategy()
_c4_processor = MoveProcessor()
_c4_move_queues: dict[UUID, asyncio.Queue] = {}

_checkers_engine = CheckersEngine()
_checkers_strategy = CheckersAIStrategy()
_checkers_move_queues: dict[UUID, asyncio.Queue] = {}

_dab_engine = DaBEngine()
_dab_strategy = DaBStrategy()
_dab_move_queues: dict[UUID, asyncio.Queue] = {}

_chess_engine = ChessEngine()
_chess_strategy = ChessAIStrategy()
_chess_processor = MoveProcessor()
_chess_move_queues: dict[UUID, asyncio.Queue] = {}

_GAME_ENGINES = {
    "tic-tac-toe": tic_tac_toe_game,
    "chess": chess_game,
    "checkers": checkers_game,
    "connect4": connect4_game,
    "dots-and-boxes": dots_and_boxes_game,
}


async def _require_user(sessionId: Optional[str] = Cookie(None)) -> dict:
    if not sessionId:
        raise HTTPException(status_code=401, detail="Authentication required")
    user = await _auth_service.get_user_by_session(sessionId)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def _winner_to_outcome(winner: str, game_state: dict) -> str:
    if winner in ("tie", "draw"):
        return "draw"
    player_symbol = game_state.get("player_symbol") or game_state.get("player_color")
    if winner == player_symbol or winner == "player":
        return "player_won"
    return "ai_won"



# ============================================
# TIC-TAC-TOE (SSE ARCHITECTURE)
# ============================================


def _ttt_state_payload(state: dict, position: Optional[int] = None) -> dict:
    return {
        "position": position,
        "player_starts": state.get("player_starts", True),
        "board": state["board"],
        "current_turn": state.get("current_turn"),
        "status": state.get("status", "in_progress"),
        "winner": state.get("winner"),
        "winning_positions": state.get("winning_positions"),
    }


@router.get("/game/tic-tac-toe/resume")
async def ttt_resume(
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Returns the active TTT session for the current user, or {id: null, state: null}.

    Auth: required. Response: {id: UUID | null, state: TttGameState | null}.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "tic-tac-toe")

    game = await persistence_service.get_active_game(db, user["id"], "tic_tac_toe")
    if not game:
        return {"id": None, "state": None}

    span.set_attribute("game.id", str(game.id))
    return {"id": str(game.id), "state": game.board_state}


@router.post("/game/tic-tac-toe/newgame")
async def ttt_newgame(
    request: TttNewGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Starts a new TTT session, closing any existing active session first.

    Auth: required. Body: {player_starts: bool}.
    Response: {id: UUID, state: TttGameState}. If player_starts=false, the AI moves first
    and state reflects the board after the AI's first move.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "tic-tac-toe")

    existing = await persistence_service.get_active_game(db, user["id"], "tic_tac_toe")
    if existing:
        q = _ttt_move_queues.pop(existing.id, None)
        if q:
            q.put_nowait({"__close__": True})
        await persistence_service.close_game(db, existing.id, "tic_tac_toe")

    state = _ttt_engine.initial_state(request.player_starts)
    game = await persistence_service.create_game(db, user["id"], "tic_tac_toe", state)
    span.set_attribute("game.id", str(game.id))

    if not request.player_starts:
        ai_state, engine_eval = _ttt_processor.process_ai_turn(
            _ttt_engine, _ttt_strategy, state
        )
        ai_position = next(
            (i for i in range(9) if ai_state["board"][i] != state["board"][i]), None
        )
        await persistence_service.record_move(
            db, game.id, "tic_tac_toe", str(ai_position) if ai_position is not None else "", ai_state
        )
        state = ai_state

    return {"id": str(game.id), "state": state}


@router.post("/game/tic-tac-toe/move")
async def ttt_move(
    request: TttMoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Enqueues a player move for the active TTT session.

    Auth: required. Body: {position: int (0–8)}. Response: 202 Accepted (no body).
    State updates are delivered over the SSE stream. Returns 409 if no active session,
    422 if the move is invalid.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "tic-tac-toe")

    game = await persistence_service.get_active_game(db, user["id"], "tic_tac_toe")
    if not game:
        raise HTTPException(status_code=409, detail="No active session")

    span.set_attribute("game.id", str(game.id))

    if not _ttt_engine.validate_move(game.board_state, request.position):
        raise HTTPException(status_code=422, detail="Invalid move")

    q = _ttt_move_queues.get(game.id)
    if q:
        await q.put({"position": request.position})

    return JSONResponse(status_code=202, content=None)


@router.get("/game/tic-tac-toe/events/{session_id}")
async def ttt_events(
    session_id: str,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """SSE stream for a TTT session. Delivers status, move, error, and heartbeat events.

    Auth: required. Path param: session_id (UUID returned by /resume or /newgame).
    The client must subscribe immediately after receiving id from /newgame.
    """
    try:
        sid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    game_record = await persistence_service.get_game(db, sid, "tic_tac_toe")
    if not game_record:
        raise HTTPException(status_code=404, detail="Session not found")
    if game_record.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")
    if game_record.game_ended:
        raise HTTPException(status_code=410, detail="Session already closed")

    span = trace.get_current_span()
    span.set_attribute("game.id", session_id)

    q: asyncio.Queue = asyncio.Queue()
    _ttt_move_queues[sid] = q

    broadcaster = StatusBroadcaster()

    async def process_moves():
        try:
            state = game_record.board_state
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=StatusBroadcaster.HEARTBEAT_INTERVAL + 1)
                except asyncio.TimeoutError:
                    broadcaster.emit(StatusEvent("heartbeat"))
                    continue

                if msg.get("__close__"):
                    broadcaster.close()
                    return

                position = msg["position"]
                player_state = _ttt_engine.apply_move(state, position)
                await persistence_service.record_move(
                    db, sid, "tic_tac_toe", str(position), player_state
                )

                is_terminal, outcome = _ttt_engine.is_terminal(player_state)
                if is_terminal:
                    persistence_outcome = _ttt_engine.outcome_to_persistence(player_state)
                    await persistence_service.end_game(
                        db, sid, "tic_tac_toe", persistence_outcome or "draw"
                    )
                    broadcaster.emit(StatusEvent("move", payload=_ttt_state_payload(player_state, position)))
                    broadcaster.close()
                    return

                broadcaster.emit(StatusEvent("status", message="Thinking..."))

                with tracer.start_as_current_span("game.ai.move") as ai_span:
                    ai_span.set_attribute("game.id", session_id)
                    t0 = time.monotonic()
                    ai_state, engine_eval = _ttt_processor.process_ai_turn(
                        _ttt_engine, _ttt_strategy, player_state
                    )
                    compute_ms = (time.monotonic() - t0) * 1000
                    ai_span.set_attribute("compute_duration_ms", compute_ms)
                    _ai_duration.record(compute_ms, {"game.id": "tic-tac-toe"})

                ai_position = next(
                    (i for i in range(9) if ai_state["board"][i] != player_state["board"][i]),
                    None,
                )
                await persistence_service.record_move(
                    db, sid, "tic_tac_toe", str(ai_position) if ai_position is not None else "", ai_state
                )

                is_terminal, outcome = _ttt_engine.is_terminal(ai_state)
                if is_terminal:
                    persistence_outcome = _ttt_engine.outcome_to_persistence(ai_state)
                    await persistence_service.end_game(
                        db, sid, "tic_tac_toe", persistence_outcome or "draw"
                    )

                broadcaster.emit(StatusEvent("move", payload=_ttt_state_payload(ai_state, ai_position)))
                state = ai_state

                if is_terminal:
                    broadcaster.close()
                    return

        except Exception as exc:
            logger.exception("ttt_sse_error", extra={"game_id": session_id})
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR)
            broadcaster.emit(StatusEvent("error", code="internal_error", message="An error occurred"))
            broadcaster.close()
        finally:
            _ttt_move_queues.pop(sid, None)
            logger.info("ttt_sse_closed", extra={"game_id": session_id})

    asyncio.create_task(process_moves())

    return StreamingResponse(
        broadcaster.stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================
# CONNECT 4 (SSE ARCHITECTURE)
# ============================================


def _c4_winner(state: dict) -> Optional[str]:
    if state.get("game_active", True):
        return None
    _, outcome = _c4_engine.is_terminal(state)
    if outcome == "player_won":
        return "player"
    if outcome == "ai_won":
        return "ai"
    return "draw"


def _c4_state_payload(
    state: dict,
    col: Optional[int] = None,
    row: Optional[int] = None,
    player: Optional[str] = None,
) -> dict:
    game_over = not state.get("game_active", True)
    return {
        "col": col,
        "row": row,
        "player": player,
        "board": state["board"],
        "player_starts": state.get("player_starts", True),
        "current_turn": state.get("current_turn"),
        "status": "complete" if game_over else "in_progress",
        "winner": _c4_winner(state),
        "winning_cells": _c4_engine.get_winning_cells(state) if game_over else None,
    }


@router.get("/game/connect4/resume")
async def c4_resume(
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Returns the active Connect4 session for the current user, or {id: null, state: null}.

    Auth: required. Response: {id: UUID | null, state: C4GameState | null}.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "connect4")

    game = await persistence_service.get_active_game(db, user["id"], "connect4")
    if not game:
        return {"id": None, "state": None}

    span.set_attribute("game.id", str(game.id))
    return {"id": str(game.id), "state": game.board_state}


@router.post("/game/connect4/newgame")
async def c4_newgame(
    request: C4NewGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Starts a new Connect4 session, closing any existing active session first.

    Auth: required. Body: {player_starts: bool}.
    Response: {id: UUID, state: C4GameState}.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "connect4")

    existing = await persistence_service.get_active_game(db, user["id"], "connect4")
    if existing:
        q = _c4_move_queues.pop(existing.id, None)
        if q:
            q.put_nowait({"__close__": True})
        await persistence_service.close_game(db, existing.id, "connect4")

    state = _c4_engine.initial_state(request.player_starts)
    game = await persistence_service.create_game(db, user["id"], "connect4", state)
    span.set_attribute("game.id", str(game.id))

    if not request.player_starts:
        ai_state, engine_eval = _c4_processor.process_ai_turn(
            _c4_engine, _c4_strategy, state
        )
        is_terminal, outcome = _c4_engine.is_terminal(ai_state)
        ai_state = {**ai_state, "game_active": not is_terminal}
        ai_last = ai_state.get("last_move") or {}
        ai_col = ai_last.get("col", "")
        await persistence_service.record_move(
            db, game.id, "connect4", str(ai_col), ai_state
        )
        state = ai_state

    return {"id": str(game.id), "state": state}


@router.post("/game/connect4/move")
async def c4_move(
    request: C4MoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Enqueues a player move for the active Connect4 session.

    Auth: required. Body: {col: int (0–6)}. Response: 202 Accepted (no body).
    Returns 409 if no active session, 422 if the column is full or out of range.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "connect4")

    game = await persistence_service.get_active_game(db, user["id"], "connect4")
    if not game:
        raise HTTPException(status_code=409, detail="No active session")

    span.set_attribute("game.id", str(game.id))

    move = {"col": request.col}
    if not _c4_engine.validate_move(game.board_state, move):
        logger.warning("c4_invalid_move", extra={"game_id": str(game.id), "move": move})
        raise HTTPException(status_code=422, detail="Invalid move")

    q = _c4_move_queues.get(game.id)
    if q:
        await q.put({"col": request.col})

    return JSONResponse(status_code=202, content=None)


@router.get("/game/connect4/events/{session_id}")
async def c4_events(
    session_id: str,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """SSE stream for a Connect4 session. Delivers status, move, error, and heartbeat events.

    Auth: required. Path param: session_id (UUID returned by /resume or /newgame).
    """
    try:
        sid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    game_record = await persistence_service.get_game(db, sid, "connect4")
    if not game_record:
        raise HTTPException(status_code=404, detail="Session not found")
    if game_record.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")
    if game_record.game_ended:
        raise HTTPException(status_code=410, detail="Session already closed")

    span = trace.get_current_span()
    span.set_attribute("game.id", session_id)

    q: asyncio.Queue = asyncio.Queue()
    _c4_move_queues[sid] = q

    broadcaster = StatusBroadcaster()

    async def process_moves():
        try:
            state = game_record.board_state
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=StatusBroadcaster.HEARTBEAT_INTERVAL + 1)
                except asyncio.TimeoutError:
                    broadcaster.emit(StatusEvent("heartbeat"))
                    continue

                if msg.get("__close__"):
                    broadcaster.close()
                    return

                col = msg["col"]
                player_state = _c4_engine.apply_move(state, {"col": col})
                player_last = player_state.get("last_move", {})
                player_row = player_last.get("row") if player_last else None

                is_terminal, outcome = _c4_engine.is_terminal(player_state)
                player_state = {**player_state, "game_active": not is_terminal}

                await persistence_service.record_move(
                    db, sid, "connect4", str(col), player_state
                )

                if is_terminal:
                    await persistence_service.end_game(db, sid, "connect4", outcome or "draw")
                    broadcaster.emit(
                        StatusEvent(
                            "move",
                            payload=_c4_state_payload(player_state, col=col, row=player_row, player="player"),
                        )
                    )
                    broadcaster.close()
                    return

                broadcaster.emit(StatusEvent("status", message="Thinking..."))

                with tracer.start_as_current_span("game.ai.move") as ai_span:
                    ai_span.set_attribute("game.id", session_id)
                    t0 = time.monotonic()
                    ai_state, engine_eval = _c4_processor.process_ai_turn(
                        _c4_engine, _c4_strategy, player_state
                    )
                    compute_ms = (time.monotonic() - t0) * 1000
                    ai_span.set_attribute("compute_duration_ms", compute_ms)
                    _ai_duration.record(compute_ms, {"game.id": "connect4"})

                ai_last = ai_state.get("last_move", {})
                ai_col = ai_last.get("col") if ai_last else None
                ai_row = ai_last.get("row") if ai_last else None

                is_terminal, outcome = _c4_engine.is_terminal(ai_state)
                ai_state = {**ai_state, "game_active": not is_terminal}

                await persistence_service.record_move(
                    db, sid, "connect4", str(ai_col) if ai_col is not None else "", ai_state
                )

                if is_terminal:
                    await persistence_service.end_game(db, sid, "connect4", outcome or "draw")

                broadcaster.emit(
                    StatusEvent(
                        "move",
                        payload=_c4_state_payload(ai_state, col=ai_col, row=ai_row, player="ai"),
                    )
                )
                state = ai_state

                if is_terminal:
                    broadcaster.close()
                    return

        except Exception as exc:
            logger.exception("c4_sse_error", extra={"game_id": session_id})
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR)
            broadcaster.emit(StatusEvent("error", code="internal_error", message="An error occurred"))
            broadcaster.close()
        finally:
            _c4_move_queues.pop(sid, None)
            logger.info("c4_sse_closed", extra={"game_id": session_id})

    asyncio.create_task(process_moves())

    return StreamingResponse(
        broadcaster.stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================
# CHECKERS (SSE ARCHITECTURE)
# ============================================


def _checkers_state_payload(state: dict, move: Optional[dict] = None, player: Optional[str] = None) -> dict:
    terminal, outcome = _checkers_engine.is_terminal(state)
    winner = None
    if terminal:
        if outcome == "player_won":
            winner = "player"
        elif outcome == "ai_won":
            winner = "ai"
    return {
        "from": move["from"] if move else None,
        "to": move["to"] if move else None,
        "captured": move.get("captured", []) if move else [],
        "player": player,
        "is_king_promotion": move.get("is_king_promotion", False) if move else False,
        "board": state["board"],
        "player_starts": state["player_starts"],
        "current_turn": state.get("current_turn") if not terminal else None,
        "must_capture": state.get("must_capture"),
        "legal_pieces": state.get("legal_pieces", []),
        "status": "complete" if terminal else "in_progress",
        "winner": winner,
    }


@router.get("/game/checkers/resume")
async def checkers_resume(
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Returns the active Checkers session for the current user, or {id: null, state: null}.

    Auth: required. Response: {id: UUID | null, state: CheckersGameState | null}.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "checkers")

    game = await persistence_service.get_active_game(db, user["id"], "checkers")
    if not game:
        return {"id": None, "state": None}

    span.set_attribute("game.id", str(game.id))
    return {"id": str(game.id), "state": game.board_state}


@router.post("/game/checkers/newgame")
async def checkers_newgame(
    request: CheckersNewGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Starts a new Checkers session, closing any existing active session first.

    Auth: required. Body: {player_starts: bool}.
    Response: {id: UUID, state: CheckersGameState}.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "checkers")

    existing = await persistence_service.get_active_game(db, user["id"], "checkers")
    if existing:
        q = _checkers_move_queues.pop(existing.id, None)
        if q:
            q.put_nowait({"__close__": True})
        await persistence_service.close_game(db, existing.id, "checkers")

    state = _checkers_engine.initial_state(request.player_starts)
    game = await persistence_service.create_game(db, user["id"], "checkers", state)
    span.set_attribute("game.id", str(game.id))

    return {"id": str(game.id), "state": state}


@router.post("/game/checkers/move")
async def checkers_move(
    request: CheckersMoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Enqueues a player move for the active Checkers session.

    Auth: required. Body: {from_row, from_col, to_row, to_col: int}.
    Response: 202 Accepted (no body). Returns 409 if no active session, 422 if invalid.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "checkers")

    game = await persistence_service.get_active_game(db, user["id"], "checkers")
    if not game:
        raise HTTPException(status_code=409, detail="No active session")

    span.set_attribute("game.id", str(game.id))

    move = {"from": request.from_pos, "to": request.to_pos}
    if not _checkers_engine.validate_move(game.board_state, move):
        raise HTTPException(status_code=422, detail="Invalid move")

    q = _checkers_move_queues.get(game.id)
    if q:
        await q.put(move)

    return JSONResponse(status_code=202, content=None)


@router.get("/game/checkers/events/{session_id}")
async def checkers_events(
    session_id: str,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """SSE stream for a Checkers session. Delivers status, move, error, and heartbeat events.

    Auth: required. Path param: session_id (UUID returned by /resume or /newgame).
    """
    try:
        sid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    game_record = await persistence_service.get_game(db, sid, "checkers")
    if not game_record:
        raise HTTPException(status_code=404, detail="Session not found")
    if game_record.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")
    if game_record.game_ended:
        raise HTTPException(status_code=410, detail="Session already closed")

    span = trace.get_current_span()
    span.set_attribute("game.id", session_id)

    output_q: asyncio.Queue[Optional[str]] = asyncio.Queue()
    move_q: asyncio.Queue = asyncio.Queue()
    _checkers_move_queues[sid] = move_q

    async def _checkers_run_ai_turn(state: dict) -> tuple[dict, bool]:
        """Process AI's turn with timing delay. Returns (new_state, terminal)."""
        output_q.put_nowait('data: {"type": "status", "message": "Thinking..."}\n\n')
        await asyncio.sleep(2.5)

        with tracer.start_as_current_span("game.ai.move") as ai_span:
            ai_span.set_attribute("game.id", session_id)
            t0 = time.monotonic()

            while state.get("current_turn") == "ai" and state.get("game_active", True):
                ai_move, _ = _checkers_strategy.generate_move(state)
                ai_state_tmp = {**state, "current_turn": "ai"}
                if not _checkers_engine.validate_move(ai_state_tmp, ai_move):
                    legal = _checkers_engine.get_legal_moves(ai_state_tmp)
                    if not legal:
                        break
                    ai_move = legal[0]

                state = _checkers_engine.apply_move(ai_state_tmp, ai_move)
                lm = state.get("last_move") or {}
                notation = f"{lm.get('from', '')}-{lm.get('to', '')}"
                await persistence_service.record_move(db, sid, "checkers", notation, state)

                is_terminal, outcome = _checkers_engine.is_terminal(state)
                output_q.put_nowait(
                    f'data: {json.dumps({"type": "move", "data": _checkers_state_payload(state, state.get("last_move"), "ai")})}\n\n'
                )

                if is_terminal:
                    await persistence_service.end_game(db, sid, "checkers", outcome or "draw")
                    output_q.put_nowait(None)
                    return state, True

                if state.get("must_capture") is None:
                    break

                await asyncio.sleep(0.5)

            compute_ms = (time.monotonic() - t0) * 1000
            ai_span.set_attribute("compute_duration_ms", compute_ms)
            _ai_duration.record(compute_ms, {"game.id": "checkers"})

        return state, False

    async def process_moves():
        try:
            state = game_record.board_state

            # Handle case where AI goes first (player chose to go second)
            if state.get("current_turn") == "ai" and state.get("game_active", True):
                state, done = await _checkers_run_ai_turn(state)
                if done:
                    return

            while True:
                try:
                    msg = await asyncio.wait_for(move_q.get(), timeout=31)
                except asyncio.TimeoutError:
                    output_q.put_nowait('data: {"type": "heartbeat"}\n\n')
                    continue

                if msg.get("__close__"):
                    output_q.put_nowait(None)
                    return

                player_move = {"from": msg["from"], "to": msg["to"]}
                state = _checkers_engine.apply_move(state, player_move)
                lm = state.get("last_move") or {}
                notation = f"{lm.get('from', '')}-{lm.get('to', '')}"
                await persistence_service.record_move(db, sid, "checkers", notation, state)

                is_terminal, outcome = _checkers_engine.is_terminal(state)
                output_q.put_nowait(
                    f'data: {json.dumps({"type": "move", "data": _checkers_state_payload(state, state.get("last_move"), "player")})}\n\n'
                )

                if is_terminal:
                    await persistence_service.end_game(db, sid, "checkers", outcome or "draw")
                    output_q.put_nowait(None)
                    return

                if state.get("must_capture") is not None:
                    continue

                state, done = await _checkers_run_ai_turn(state)
                if done:
                    return

        except Exception as exc:
            logger.exception("checkers_sse_error", extra={"game_id": session_id})
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR)
            output_q.put_nowait('data: {"type": "error", "code": "internal_error", "message": "An error occurred"}\n\n')
            output_q.put_nowait(None)
        finally:
            _checkers_move_queues.pop(sid, None)
            logger.info("checkers_sse_closed", extra={"game_id": session_id})

    asyncio.create_task(process_moves())

    async def event_generator():
        while True:
            item = await output_q.get()
            if item is None:
                return
            yield item

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ============================================
# DOTS AND BOXES (SSE ARCHITECTURE)
# ============================================


def _dab_state_payload(state: dict, move: Optional[dict], player: str) -> dict:
    terminal, outcome = _dab_engine.is_terminal(state)
    winner = None
    if terminal:
        w = _dab_engine.get_winner(state)
        winner = "player" if w == "player" else ("ai" if w == "ai" else "draw")
    return {
        "line_type": move.get("type") if move else None,
        "row": move.get("row") if move else None,
        "col": move.get("col") if move else None,
        "player": player,
        "boxes_completed": state["last_move"]["boxes_completed"] if state.get("last_move") else 0,
        "newly_claimed_boxes": state["last_move"]["newly_claimed_boxes"] if state.get("last_move") else [],
        "horizontal_lines": state["horizontal_lines"],
        "vertical_lines": state["vertical_lines"],
        "boxes": state["boxes"],
        "player_starts": state["player_starts"],
        "current_turn": state.get("current_turn") if not terminal else None,
        "player_score": state["player_score"],
        "ai_score": state["ai_score"],
        "status": "complete" if terminal else "in_progress",
        "winner": winner,
    }


@router.get("/game/dots-and-boxes/resume")
async def dab_resume(
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Returns the active Dots and Boxes session for the current user, or {id: null, state: null}.

    Auth: required. Response: {id: UUID | null, state: DaBGameState | null}.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "dots-and-boxes")

    game = await persistence_service.get_active_game(db, user["id"], "dots_and_boxes")
    if not game:
        return {"id": None, "state": None}

    span.set_attribute("game.id", str(game.id))
    return {"id": str(game.id), "state": game.board_state}


@router.post("/game/dots-and-boxes/newgame")
async def dab_newgame(
    request: DaBNewGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Starts a new Dots and Boxes session, closing any existing active session first.

    Auth: required. Body: {player_starts: bool, grid_size: int}.
    Response: {id: UUID, state: DaBGameState}.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "dots-and-boxes")

    existing = await persistence_service.get_active_game(db, user["id"], "dots_and_boxes")
    if existing:
        q = _dab_move_queues.pop(existing.id, None)
        if q:
            q.put_nowait({"__close__": True})
        await persistence_service.close_game(db, existing.id, "dots_and_boxes")

    state = _dab_engine.initial_state(request.player_starts)
    game = await persistence_service.create_game(db, user["id"], "dots_and_boxes", state)
    span.set_attribute("game.id", str(game.id))

    if not request.player_starts:
        ai_move, _ = _dab_strategy.generate_move(state)
        state = _dab_engine.apply_move(state, ai_move)
        notation = f"{str(ai_move.get('type', ''))[:1]}:{ai_move.get('row', '')},{ai_move.get('col', '')}"
        await persistence_service.record_move(db, game.id, "dots_and_boxes", notation, state)

    return {"id": str(game.id), "state": state}


@router.post("/game/dots-and-boxes/move")
async def dab_move(
    request: DaBMoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Enqueues a player edge claim for the active Dots and Boxes session.

    Auth: required. Body: {orientation: "h"|"v", row: int, col: int}.
    Response: 202 Accepted (no body). Returns 409 if no active session, 422 if invalid.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "dots-and-boxes")

    game = await persistence_service.get_active_game(db, user["id"], "dots_and_boxes")
    if not game:
        raise HTTPException(status_code=409, detail="No active session")

    span.set_attribute("game.id", str(game.id))

    move = {"type": request.type, "row": request.row, "col": request.col}
    if not _dab_engine.validate_move(game.board_state, move):
        raise HTTPException(status_code=422, detail="Invalid move")

    q = _dab_move_queues.get(game.id)
    if q:
        await q.put(move)

    return JSONResponse(status_code=202, content=None)


@router.get("/game/dots-and-boxes/events/{session_id}")
async def dab_events(
    session_id: str,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """SSE stream for a Dots and Boxes session. Delivers status, move, error, and heartbeat events.

    Auth: required. Path param: session_id (UUID returned by /resume or /newgame).
    """
    try:
        sid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    game_record = await persistence_service.get_game(db, sid, "dots_and_boxes")
    if not game_record:
        raise HTTPException(status_code=404, detail="Session not found")
    if game_record.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")
    if game_record.game_ended:
        raise HTTPException(status_code=410, detail="Session already closed")

    span = trace.get_current_span()
    span.set_attribute("game.id", session_id)

    output_q: asyncio.Queue[Optional[str]] = asyncio.Queue()
    move_q: asyncio.Queue = asyncio.Queue()
    _dab_move_queues[sid] = move_q

    async def process_moves():
        try:
            state = game_record.board_state
            while True:
                try:
                    msg = await asyncio.wait_for(move_q.get(), timeout=31)
                except asyncio.TimeoutError:
                    output_q.put_nowait('data: {"type": "heartbeat"}\n\n')
                    continue

                if msg.get("__close__"):
                    output_q.put_nowait(None)
                    return

                move = {"type": msg["type"], "row": msg["row"], "col": msg["col"]}
                player_state = _dab_engine.apply_move(state, move)
                notation = f"{str(move.get('type', ''))[:1]}:{move.get('row', '')},{move.get('col', '')}"
                await persistence_service.record_move(db, sid, "dots_and_boxes", notation, player_state)

                terminal, outcome = _dab_engine.is_terminal(player_state)
                output_q.put_nowait(
                    f'data: {json.dumps({"type": "move", "data": _dab_state_payload(player_state, move, "player")})}\n\n'
                )

                if terminal:
                    await persistence_service.end_game(db, sid, "dots_and_boxes", outcome or "draw")
                    output_q.put_nowait(None)
                    return

                state = player_state

                if state["current_turn"] == "player":
                    continue

                output_q.put_nowait('data: {"type": "status", "message": "Thinking..."}\n\n')
                await asyncio.sleep(0.5)

                with tracer.start_as_current_span("game.ai.move") as ai_span:
                    ai_span.set_attribute("game.id", session_id)
                    t0 = time.monotonic()

                    while state.get("current_turn") == "ai" and state.get("game_active", True):
                        ai_move, _ = _dab_strategy.generate_move(state)
                        ai_state = _dab_engine.apply_move(state, ai_move)
                        ai_notation = f"{str(ai_move.get('type', ''))[:1]}:{ai_move.get('row', '')},{ai_move.get('col', '')}"
                        await persistence_service.record_move(db, sid, "dots_and_boxes", ai_notation, ai_state)

                        terminal, outcome = _dab_engine.is_terminal(ai_state)
                        output_q.put_nowait(
                            f'data: {json.dumps({"type": "move", "data": _dab_state_payload(ai_state, ai_move, "ai")})}\n\n'
                        )

                        if terminal:
                            await persistence_service.end_game(db, sid, "dots_and_boxes", outcome or "draw")
                            output_q.put_nowait(None)
                            return

                        state = ai_state

                        if state["current_turn"] == "ai":
                            await asyncio.sleep(0.5)

                    compute_ms = (time.monotonic() - t0) * 1000
                    ai_span.set_attribute("compute_duration_ms", compute_ms)
                    _ai_duration.record(compute_ms, {"game.id": "dots-and-boxes"})

        except Exception as exc:
            logger.exception("dab_sse_error", extra={"game_id": session_id})
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR)
            output_q.put_nowait('data: {"type": "error", "code": "internal_error", "message": "An error occurred"}\n\n')
            output_q.put_nowait(None)
        finally:
            _dab_move_queues.pop(sid, None)
            logger.info("dab_sse_closed", extra={"game_id": session_id})

    asyncio.create_task(process_moves())

    async def event_generator():
        while True:
            item = await output_q.get()
            if item is None:
                return
            yield item

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ============================================
# CHESS (SSE ARCHITECTURE)
# ============================================


_CHESS_FILES = "abcdefgh"


def _chess_uci(last_move: dict) -> str:
    fr = last_move.get("fromRow")
    fc = last_move.get("fromCol")
    tr = last_move.get("toRow")
    tc = last_move.get("toCol")
    if any(v is None for v in (fr, fc, tr, tc)):
        return ""
    uci = f"{_CHESS_FILES[fc]}{8 - fr}{_CHESS_FILES[tc]}{8 - tr}"
    promo = last_move.get("promotion")
    if promo:
        uci += promo[-1].lower()
    return uci


def _chess_state_payload(state: dict, player: Optional[str] = None) -> dict:
    terminal, outcome = _chess_engine.is_terminal(copy.deepcopy(state))
    winner = None
    if terminal:
        if outcome == "player_won":
            winner = "player"
        elif outcome == "ai_won":
            winner = "ai"
        else:
            winner = "draw"
    lm = state.get("last_move") or {}
    return {
        "fromRow": lm.get("fromRow"),
        "fromCol": lm.get("fromCol"),
        "toRow": lm.get("toRow"),
        "toCol": lm.get("toCol"),
        "piece": lm.get("piece"),
        "captured": lm.get("captured"),
        "is_castling": lm.get("is_castling", False),
        "is_en_passant": lm.get("is_en_passant", False),
        "promotion": lm.get("promotion"),
        "notation": lm.get("notation"),
        "player": player,
        "board": state["board"],
        "player_color": state["player_color"],
        "current_player": state.get("current_player"),
        "in_check": state.get("in_check", False),
        "captured_pieces": state.get("captured_pieces", {"player": [], "ai": []}),
        "en_passant_target": state.get("en_passant_target"),
        "castling_rights": state.get("castling_rights"),
        "status": "complete" if terminal else "in_progress",
        "winner": winner,
    }


@router.get("/game/chess/resume")
async def chess_resume(
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Returns the active Chess session for the current user, or {id: null, state: null}.

    Auth: required. Response: {id: UUID | null, state: ChessGameState | null}.
    board_state contains the full chess game state including board, castling rights,
    en passant target, captured pieces, and last move — sufficient to reconstruct the UI.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "chess")

    game = await persistence_service.get_active_game(db, user["id"], "chess")
    if not game:
        return {"id": None, "state": None}

    span.set_attribute("game.id", str(game.id))
    return {"id": str(game.id), "state": game.board_state}


@router.post("/game/chess/newgame")
async def chess_newgame(
    request: ChessNewGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Starts a new Chess session, closing any existing active session first.

    Auth: required. Body: {player_starts: bool}.
    Response: {id: UUID, state: ChessGameState}. If player_starts=false, the AI (white)
    makes the first move and state reflects the board after that move.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "chess")

    existing = await persistence_service.get_active_game(db, user["id"], "chess")
    if existing:
        q = _chess_move_queues.pop(existing.id, None)
        if q:
            q.put_nowait({"__close__": True})
        await persistence_service.close_game(db, existing.id, "chess")

    state = _chess_engine.initial_state(request.player_starts)
    game = await persistence_service.create_game(db, user["id"], "chess", state)
    span.set_attribute("game.id", str(game.id))

    if not request.player_starts:
        ai_state, engine_eval = _chess_processor.process_ai_turn(_chess_engine, _chess_strategy, state)
        lm = ai_state.get("last_move") or {}
        await persistence_service.record_move(
            db, game.id, "chess", _chess_uci(lm), ai_state, lm.get("notation", "")
        )
        state = ai_state

    return {"id": str(game.id), "state": state}


@router.post("/game/chess/move")
async def chess_move(
    request: ChessMoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Enqueues a player chess move for the active Chess session.

    Auth: required. Body: {fromRow, fromCol, toRow, toCol: int, promotionPiece: str | null}.
    Response: 202 Accepted (no body). State updates (player move + AI response) arrive over SSE.
    Returns 409 if no active session, 422 if the move is illegal.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "chess")

    game = await persistence_service.get_active_game(db, user["id"], "chess")
    if not game:
        raise HTTPException(status_code=409, detail="No active session")

    span.set_attribute("game.id", str(game.id))

    move_dict = {
        "fromRow": request.fromRow,
        "fromCol": request.fromCol,
        "toRow": request.toRow,
        "toCol": request.toCol,
        "promotionPiece": request.promotionPiece,
    }

    if not _chess_engine.validate_move(game.board_state, move_dict):
        logger.warning("chess_invalid_move", extra={"game_id": str(game.id), "move": move_dict})
        raise HTTPException(status_code=422, detail="Invalid move")

    q = _chess_move_queues.get(game.id)
    if q:
        await q.put(move_dict)

    return JSONResponse(status_code=202, content=None)


@router.get("/game/chess/events/{session_id}")
async def chess_events(
    session_id: str,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """SSE stream for a Chess session. Delivers status, move, error, and heartbeat events.

    Auth: required. Path param: session_id (UUID returned by /resume or /newgame).
    Move events include full board state, last_move details (UCI + algebraic notation),
    captured pieces, in_check flag, and terminal status/winner.
    """
    try:
        sid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    game_record = await persistence_service.get_game(db, sid, "chess")
    if not game_record:
        raise HTTPException(status_code=404, detail="Session not found")
    if game_record.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")
    if game_record.game_ended:
        raise HTTPException(status_code=410, detail="Session already closed")

    span = trace.get_current_span()
    span.set_attribute("game.id", session_id)

    q: asyncio.Queue = asyncio.Queue()
    _chess_move_queues[sid] = q

    broadcaster = StatusBroadcaster()

    async def process_moves():
        try:
            state = game_record.board_state
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=StatusBroadcaster.HEARTBEAT_INTERVAL + 1)
                except asyncio.TimeoutError:
                    broadcaster.emit(StatusEvent("heartbeat"))
                    continue

                if msg.get("__close__"):
                    broadcaster.close()
                    return

                player_state = _chess_engine.apply_move(state, msg)
                player_lm = player_state.get("last_move") or {}
                await persistence_service.record_move(
                    db, sid, "chess", _chess_uci(player_lm), player_state, player_lm.get("notation", "")
                )

                is_terminal, outcome = _chess_engine.is_terminal(player_state)
                if is_terminal:
                    await persistence_service.end_game(db, sid, "chess", outcome or "draw")
                    broadcaster.emit(StatusEvent("move", payload=_chess_state_payload(player_state, "player")))
                    broadcaster.close()
                    return

                broadcaster.emit(StatusEvent("player_move", payload=_chess_state_payload(player_state, "player")))
                broadcaster.emit(StatusEvent("status", message="Thinking..."))

                with tracer.start_as_current_span("game.ai.move") as ai_span:
                    ai_span.set_attribute("game.id", session_id)
                    t0 = time.monotonic()
                    ai_state, engine_eval = _chess_processor.process_ai_turn(_chess_engine, _chess_strategy, player_state)
                    compute_ms = (time.monotonic() - t0) * 1000
                    ai_span.set_attribute("compute_duration_ms", compute_ms)
                    _ai_duration.record(compute_ms, {"game.id": "chess"})

                ai_lm = ai_state.get("last_move") or {}
                await persistence_service.record_move(
                    db, sid, "chess", _chess_uci(ai_lm), ai_state, ai_lm.get("notation", "")
                )

                is_terminal, outcome = _chess_engine.is_terminal(ai_state)
                if is_terminal:
                    await persistence_service.end_game(db, sid, "chess", outcome or "draw")

                broadcaster.emit(StatusEvent("move", payload=_chess_state_payload(ai_state, "ai")))
                state = ai_state

                if is_terminal:
                    broadcaster.close()
                    return

        except Exception as exc:
            logger.exception("chess_sse_error", extra={"game_id": session_id})
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR)
            broadcaster.emit(StatusEvent("error", code="internal_error", message="An error occurred"))
            broadcaster.close()
        finally:
            _chess_move_queues.pop(sid, None)
            logger.info("chess_sse_closed", extra={"game_id": session_id})

    asyncio.create_task(process_moves())

    return StreamingResponse(
        broadcaster.stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/game/chess/legal-moves")
async def chess_legal_moves(
    from_row: int = Query(...),
    from_col: int = Query(...),
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Returns the legal destination squares for a piece in the active Chess session.

    Auth: required. Query params: from_row, from_col (int). Used by the frontend to
    highlight valid drop targets on piece selection.
    Response: {moves: [{toRow: int, toCol: int}]}.
    """
    span = trace.get_current_span()
    span.set_attribute("game.id", "chess")

    game = await persistence_service.get_active_game(db, user["id"], "chess")
    if not game:
        raise HTTPException(status_code=409, detail="No active session")

    moves = _chess_engine.get_legal_moves_for_square(game.board_state, from_row, from_col)
    return {"moves": moves}


# ============================================
# INTERNAL ENDPOINTS
# ============================================


@router.post("/internal/cleanup-sessions")
async def cleanup_sessions(
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
    db: AsyncSession = Depends(db_dependency),
):
    """Bulk-abandons stale sessions for all game types. Called by Cloud Scheduler.

    Auth: X-Internal-Key header matching INTERNAL_API_KEY env var (returns 403 otherwise).
    Response: {results: {game_type: count_abandoned}}.
    """
    expected = os.getenv("INTERNAL_API_KEY")
    if not expected or x_internal_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden")

    async with get_session() as s:
        result = await s.execute(
            text(
                "SELECT id, session_timeout_hours FROM games WHERE status = 'active'"
            )
        )
        rows = result.fetchall()

    total = 0
    for row in rows:
        game_id, timeout_hours = row[0], row[1]
        game_type = GAME_ID_TO_TYPE.get(game_id)
        if not game_type:
            continue
        count = await persistence_service.cleanup_stale_games(db, game_type, timeout_hours)
        total += count

    return {"cleaned": total}


# ============================================
# GAME METADATA ENDPOINTS
# ============================================


@router.get("/games_list")
async def get_games(category: Optional[str] = None, status: Optional[str] = None):
    async with get_session() as session:
        query = (
            "SELECT id, name, description, icon, difficulty, players, status, category, tags"
            " FROM games WHERE 1=1"
        )
        params: dict = {}
        if category:
            query += " AND category = :category"
            params["category"] = category
        if status:
            query += " AND status = :status"
            params["status"] = status
        result = await session.execute(text(query), params)
        rows = result.fetchall()

    games = [
        {
            "id": r[0],
            "name": r[1],
            "description": r[2],
            "icon": r[3],
            "difficulty": r[4],
            "players": r[5],
            "status": r[6],
            "category": r[7],
            "tags": r[8],
        }
        for r in rows
    ]
    return {"games": games}


@router.get("/game/{game_id}/info")
async def get_game_info(game_id: str):
    async with get_session() as session:
        result = await session.execute(
            text(
                "SELECT id, name, description, icon, difficulty, players, status, category, tags"
                " FROM games WHERE id = :id"
            ),
            {"id": game_id},
        )
        row = result.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Game '{game_id}' not found")

    return {
        "game": {
            "id": row[0],
            "name": row[1],
            "description": row[2],
            "icon": row[3],
            "difficulty": row[4],
            "players": row[5],
            "status": row[6],
            "category": row[7],
            "tags": row[8],
        }
    }


@router.get("/game/{game_id}/stats")
async def get_game_stats(game_id: str):
    return {"gamesPlayed": 0, "winRate": 0.0, "bestStreak": 0, "aiLevel": 3}


# ============================================
# GAMEPLAY ENDPOINTS
# ============================================


_SSE_MIGRATED_GAMES = {"connect4", "checkers", "dots-and-boxes", "chess", "tic-tac-toe"}


@router.post("/game/{game_id}/start")
async def start_game(
    game_id: str,
    request: StartGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    if game_id in _SSE_MIGRATED_GAMES:
        raise HTTPException(status_code=501, detail=f"Game '{game_id}' uses SSE endpoints")
    if game_id not in GAME_ID_TO_TYPE:
        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented")

    raise HTTPException(status_code=501, detail=f"Game '{game_id}' uses SSE endpoints")


@router.post("/game/{game_id}/move")
async def make_move(
    game_id: str,
    request: MoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    if game_id in _SSE_MIGRATED_GAMES:
        raise HTTPException(status_code=501, detail=f"Game '{game_id}' uses SSE endpoints")
    if game_id not in GAME_ID_TO_TYPE:
        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented")

    raise HTTPException(status_code=501, detail=f"Game '{game_id}' uses SSE endpoints")


@router.post("/game/{game_id}/ai-first")
async def ai_first_move(
    game_id: str,
    request: StartGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    raise HTTPException(status_code=501, detail="AI first move uses SSE newgame endpoint")


@router.post("/game/{game_id}/end")
async def end_game(
    game_id: str,
    request: MoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    if game_id not in GAME_ID_TO_TYPE:
        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented")

    game_type = GAME_ID_TO_TYPE[game_id]

    try:
        game_id_uuid = UUID(request.gameSessionId)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")

    trace.get_current_span().set_attribute("game.id", str(game_id_uuid))

    game = await persistence_service.get_game(db, game_id_uuid, game_type)
    if not game:
        raise HTTPException(status_code=404, detail="Game session not found")
    if game.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")
    if not game.game_ended:
        await persistence_service.end_game(db, game_id_uuid, game_type, "abandoned")

    return {"success": True}


@router.get("/game/{game_id}/session/{session_id}")
async def get_game_session(
    game_id: str,
    session_id: str,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Returns the board_state for a specific game session by id.

    Auth: required. Path params: game_id (e.g. "chess"), session_id (UUID).
    Used for client-side state recovery (React error boundary) and normal game resume.
    Returns 403 if the session belongs to a different user, 404 if not found.
    Response: {board_state: GameState dict}.
    """
    if game_id not in GAME_ID_TO_TYPE:
        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented")

    game_type = GAME_ID_TO_TYPE[game_id]

    try:
        sid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")

    game = await persistence_service.get_game(db, sid, game_type)
    if not game:
        raise HTTPException(status_code=404, detail="Session not found")
    if game.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")

    return {"board_state": game.board_state}


@router.get("/games/sessions/active")
async def get_active_sessions(
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    """Returns all active game sessions for the current user across all game types.

    Auth: required. Used to build the cross-game resume prompt.
    Response: {sessions: [{game_type, id, last_move_at, board_state}]}.
    """
    active = await persistence_service.get_all_active_games(db, user["id"])
    return {
        "sessions": [
            {
                "id": str(record.id),
                "game_type": game_type,
                "created_at": record.created_at,
                "last_move_at": record.last_move_at,
            }
            for game_type, record in active
        ]
    }
