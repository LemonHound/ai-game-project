import asyncio
import logging
import os
import time
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from opentelemetry import metrics, trace
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import persistence_service
from auth_service import AuthService
from db import db_dependency, get_session
from db_models import GAME_ID_TO_TYPE
from game_engine.base import MoveProcessor, StatusBroadcaster, StatusEvent
from game_engine.ttt_engine import TicTacToeAIStrategy, TicTacToeEngine
from game_logic.checkers import checkers_game
from game_logic.chess import chess_game
from game_logic.connect4 import connect4_game
from game_logic.dots_and_boxes import dots_and_boxes_game
from game_logic.tic_tac_toe import tic_tac_toe_game
from models import MoveRequest, StartGameRequest, TttMoveRequest, TttNewGameRequest

logger = logging.getLogger(__name__)
router = APIRouter()
_auth_service = AuthService()
tracer = trace.get_tracer(__name__)
meter = metrics.get_meter(__name__)
_ai_duration = meter.create_histogram("game.ai.compute_duration", unit="ms", description="AI move computation time")

_ttt_engine = TicTacToeEngine()
_ttt_strategy = TicTacToeAIStrategy()
_ttt_processor = MoveProcessor()

# Per-session asyncio queues: SSE handler waits here; POST /move puts moves here.
_ttt_move_queues: dict[UUID, asyncio.Queue] = {}

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
    span = trace.get_current_span()
    span.set_attribute("game.id", "tic-tac-toe")

    session = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "tic_tac_toe"
    )
    if not session:
        return {"session_id": None, "state": None}

    span.set_attribute("game.session_id", str(session.id))
    state = await persistence_service.get_latest_board_state(db, session.id, "tic_tac_toe")
    return {"session_id": str(session.id), "state": state}


@router.post("/game/tic-tac-toe/newgame")
async def ttt_newgame(
    request: TttNewGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "tic-tac-toe")

    existing = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "tic_tac_toe"
    )
    if existing:
        q = _ttt_move_queues.pop(existing.id, None)
        if q:
            q.put_nowait({"__close__": True})
        await persistence_service.close_session(db, existing.id)

    session = await persistence_service.create_game_session(db, user["id"], "tic_tac_toe")
    span.set_attribute("game.session_id", str(session.id))

    state = _ttt_engine.initial_state(request.player_starts)

    if not request.player_starts:
        ai_state, engine_eval = _ttt_processor.process_ai_turn(
            _ttt_engine, _ttt_strategy, state
        )
        await persistence_service.record_move(
            db, session.id, "tic_tac_toe", "ai", None, ai_state, engine_eval
        )
        state = ai_state
    else:
        await persistence_service.record_move(
            db, session.id, "tic_tac_toe", "setup", None, state
        )

    return {"session_id": str(session.id), "state": state}


@router.post("/game/tic-tac-toe/move")
async def ttt_move(
    request: TttMoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "tic-tac-toe")

    session = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "tic_tac_toe"
    )
    if not session:
        raise HTTPException(status_code=409, detail="No active session")

    span.set_attribute("game.session_id", str(session.id))

    state = await persistence_service.get_latest_board_state(db, session.id, "tic_tac_toe")
    if not state:
        raise HTTPException(status_code=409, detail="No board state found")

    if not _ttt_engine.validate_move(state, request.position):
        raise HTTPException(status_code=422, detail="Invalid move")

    q = _ttt_move_queues.get(session.id)
    if q:
        await q.put({"position": request.position})

    return JSONResponse(status_code=202, content=None)


@router.get("/game/tic-tac-toe/events/{session_id}")
async def ttt_events(
    session_id: str,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    try:
        sid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    game_session = await persistence_service.get_game_session_state(db, sid)
    if not game_session:
        raise HTTPException(status_code=404, detail="Session not found")
    if game_session.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")
    if game_session.game_ended:
        raise HTTPException(status_code=410, detail="Session already closed")

    span = trace.get_current_span()
    span.set_attribute("game.id", "tic-tac-toe")
    span.set_attribute("game.session_id", session_id)

    q: asyncio.Queue = asyncio.Queue()
    _ttt_move_queues[sid] = q

    broadcaster = StatusBroadcaster()

    async def process_moves():
        try:
            state = await persistence_service.get_latest_board_state(db, sid, "tic_tac_toe")
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
                    db, sid, "tic_tac_toe", "human", position, player_state
                )

                is_terminal, outcome = _ttt_engine.is_terminal(player_state)
                if is_terminal:
                    persistence_outcome = _ttt_engine.outcome_to_persistence(player_state)
                    await persistence_service.end_game_session(
                        db, sid, persistence_outcome or "draw", "tic_tac_toe"
                    )
                    broadcaster.emit(StatusEvent("move", payload=_ttt_state_payload(player_state, position)))
                    broadcaster.close()
                    return

                broadcaster.emit(StatusEvent("status", message="Thinking..."))

                with tracer.start_as_current_span("game.ai.move") as ai_span:
                    ai_span.set_attribute("game.id", "tic-tac-toe")
                    ai_span.set_attribute("game.session_id", session_id)
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
                    db, sid, "tic_tac_toe", "ai", ai_position, ai_state, engine_eval
                )

                is_terminal, outcome = _ttt_engine.is_terminal(ai_state)
                if is_terminal:
                    persistence_outcome = _ttt_engine.outcome_to_persistence(ai_state)
                    await persistence_service.end_game_session(
                        db, sid, persistence_outcome or "draw", "tic_tac_toe"
                    )

                broadcaster.emit(StatusEvent("move", payload=_ttt_state_payload(ai_state, ai_position)))
                state = ai_state

                if is_terminal:
                    broadcaster.close()
                    return

        except Exception as exc:
            logger.exception("ttt_sse_error", extra={"session_id": session_id})
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR)
            broadcaster.emit(StatusEvent("error", code="internal_error", message="An error occurred"))
            broadcaster.close()
        finally:
            _ttt_move_queues.pop(sid, None)
            logger.info("ttt_sse_closed", extra={"session_id": session_id})

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
# INTERNAL ENDPOINTS
# ============================================


@router.post("/internal/cleanup-sessions")
async def cleanup_sessions(
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
    db: AsyncSession = Depends(db_dependency),
):
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
        count = await persistence_service.cleanup_stale_sessions(db, game_type, timeout_hours)
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


@router.post("/game/{game_id}/start")
async def start_game(
    game_id: str,
    request: StartGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    if game_id not in GAME_ID_TO_TYPE:
        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented")

    game_type = GAME_ID_TO_TYPE[game_id]
    engine = _GAME_ENGINES[game_id]

    game_session = await persistence_service.get_or_create_game_session(
        db, user["id"], game_type, request.difficulty
    )

    span = trace.get_current_span()
    span.set_attribute("game.id", game_id)
    span.set_attribute("game.session_id", str(game_session.id))

    latest = await persistence_service.get_latest_board_state(db, game_session.id, game_type)
    if latest:
        return {"session_id": str(game_session.id), "game_state": latest, "is_resumed": True}

    game_state = engine.get_initial_state(
        difficulty=request.difficulty, player_starts=request.playerStarts
    )
    await persistence_service.record_move(
        db, game_session.id, game_type, "setup", {}, game_state
    )

    return {"session_id": str(game_session.id), "game_state": game_state, "is_resumed": False}


@router.post("/game/{game_id}/move")
async def make_move(
    game_id: str,
    request: MoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    if game_id not in GAME_ID_TO_TYPE:
        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented")

    game_type = GAME_ID_TO_TYPE[game_id]
    engine = _GAME_ENGINES[game_id]

    try:
        session_id = UUID(request.gameSessionId)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")

    game_session = await persistence_service.get_game_session_state(db, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")
    if game_session.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")
    if game_session.game_ended:
        raise HTTPException(status_code=400, detail="Game session has already ended")

    span = trace.get_current_span()
    span.set_attribute("game.id", game_id)
    span.set_attribute("game.session_id", str(session_id))

    game_state = await persistence_service.get_latest_board_state(db, session_id, game_type)
    if not game_state:
        raise HTTPException(status_code=404, detail="No board state found for session")

    try:
        with tracer.start_as_current_span("game.ai.move") as ai_span:
            ai_span.set_attribute("game.id", game_id)
            t0 = time.monotonic()
            result = engine.apply_move(game_state, request.move)
            compute_ms = (time.monotonic() - t0) * 1000
            ai_span.set_attribute("compute_duration_ms", compute_ms)
            _ai_duration.record(compute_ms, {"game.id": game_id})
    except ValueError as exc:
        span.set_attribute("error.type", type(exc).__name__)
        span.set_attribute("error.message", str(exc))
        return JSONResponse(
            status_code=400,
            content={"detail": str(exc), "board_state": game_state},
        )

    await persistence_service.record_move(
        db,
        session_id,
        game_type,
        "human",
        result["player_move"],
        result["board_after_player"],
    )

    if not result["game_over_after_player"] and result["board_after_ai"] is not None:
        ai_move_data = result.get("ai_move") or result.get("ai_moves")
        await persistence_service.record_move(
            db,
            session_id,
            game_type,
            "ai",
            ai_move_data,
            result["board_after_ai"],
        )

    if result["game_over"] and result["winner"]:
        final_state = result["board_after_ai"] or result["board_after_player"]
        outcome = _winner_to_outcome(result["winner"], final_state)
        await persistence_service.end_game_session(db, session_id, outcome, game_type)
    elif result["game_over"]:
        await persistence_service.end_game_session(db, session_id, "draw", game_type)

    return {"session_id": str(session_id), **result}


@router.post("/game/{game_id}/ai-first")
async def ai_first_move(
    game_id: str,
    request: StartGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    if game_id != "connect4":
        raise HTTPException(
            status_code=501, detail=f"AI first move not supported for '{game_id}'"
        )

    game_type = GAME_ID_TO_TYPE[game_id]

    game_session = await persistence_service.get_or_create_game_session(
        db, user["id"], game_type, request.difficulty
    )

    span = trace.get_current_span()
    span.set_attribute("game.id", game_id)
    span.set_attribute("game.session_id", str(game_session.id))

    latest = await persistence_service.get_latest_board_state(db, game_session.id, game_type)
    if latest:
        game_state = latest
    else:
        game_state = connect4_game.get_initial_state(
            difficulty=request.difficulty, player_starts=False
        )

    with tracer.start_as_current_span("game.ai.move") as ai_span:
        ai_span.set_attribute("game.id", game_id)
        t0 = time.monotonic()
        result = connect4_game.apply_ai_first_move(game_state)
        compute_ms = (time.monotonic() - t0) * 1000
        ai_span.set_attribute("compute_duration_ms", compute_ms)
        _ai_duration.record(compute_ms, {"game.id": game_id})

    await persistence_service.record_move(
        db,
        game_session.id,
        game_type,
        "ai",
        result["ai_move"],
        result["board_after_ai"],
    )

    return {"session_id": str(game_session.id), **result}


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
        session_id = UUID(request.gameSessionId)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")

    trace.get_current_span().set_attribute("game.id", game_id)

    game_session = await persistence_service.get_game_session_state(db, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")
    if game_session.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")
    if not game_session.game_ended:
        await persistence_service.end_game_session(db, session_id, "abandoned", game_type)

    return {"success": True}


@router.get("/game/{game_id}/session/{session_id}")
async def get_game_session(
    game_id: str,
    session_id: str,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    if game_id not in GAME_ID_TO_TYPE:
        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented")

    game_type = GAME_ID_TO_TYPE[game_id]

    try:
        sid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")

    game_session = await persistence_service.get_game_session_state(db, sid)
    if not game_session:
        raise HTTPException(status_code=404, detail="Session not found")
    if game_session.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")

    board_state = await persistence_service.get_latest_board_state(db, sid, game_type)
    if not board_state:
        raise HTTPException(status_code=404, detail="No board state found for session")

    return {"session_id": session_id, "game_type": game_type, "board_state": board_state}


@router.get("/games/sessions/active")
async def get_active_sessions(
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    sessions = await persistence_service.get_active_game_sessions(db, user["id"])
    return {
        "sessions": [
            {
                "session_id": str(s.id),
                "game_type": s.game_type,
                "difficulty": s.difficulty,
                "started_at": s.started_at,
                "last_move_at": s.last_move_at,
            }
            for s in sessions
        ]
    }
