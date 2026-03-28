import asyncio
import copy
import logging
import time
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from opentelemetry import trace

import persistence_service
from auth_service import AuthService
from db import db_dependency
from game_engine.base import MoveProcessor, StatusBroadcaster, StatusEvent
from game_engine.chess_engine import ChessAIStrategy, ChessEngine
from models import ChessMoveRequest, ChessNewGameRequest
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter()
_auth_service = AuthService()
tracer = trace.get_tracer(__name__)

_chess_engine = ChessEngine()
_chess_strategy = ChessAIStrategy()
_chess_processor = MoveProcessor()
_chess_move_queues: dict[UUID, asyncio.Queue] = {}


async def _require_user(sessionId: Optional[str] = Cookie(None)) -> dict:
    if not sessionId:
        raise HTTPException(status_code=401, detail="Authentication required")
    user = await _auth_service.get_user_by_session(sessionId)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


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
    span = trace.get_current_span()
    span.set_attribute("game.id", "chess")

    session = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "chess"
    )
    if not session:
        return {"session_id": None, "state": None}

    span.set_attribute("game.session_id", str(session.id))
    state = await persistence_service.get_latest_board_state(db, session.id, "chess")
    return {"session_id": str(session.id), "state": state}


@router.post("/game/chess/newgame")
async def chess_newgame(
    request: ChessNewGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "chess")

    existing = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "chess"
    )
    if existing:
        q = _chess_move_queues.pop(existing.id, None)
        if q:
            q.put_nowait({"__close__": True})
        await persistence_service.close_session(db, existing.id)

    session = await persistence_service.create_game_session(db, user["id"], "chess")
    span.set_attribute("game.session_id", str(session.id))

    state = _chess_engine.initial_state(request.player_starts)

    if not request.player_starts:
        ai_state, engine_eval = _chess_processor.process_ai_turn(
            _chess_engine, _chess_strategy, state
        )
        await persistence_service.record_move(
            db, session.id, "chess", "ai", None, ai_state, engine_eval
        )
        state = ai_state
    else:
        await persistence_service.record_move(
            db, session.id, "chess", "setup", None, state
        )

    return {"session_id": str(session.id), "state": state}


@router.post("/game/chess/move")
async def chess_move(
    request: ChessMoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "chess")

    session = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "chess"
    )
    if not session:
        raise HTTPException(status_code=409, detail="No active session")

    span.set_attribute("game.session_id", str(session.id))

    state = await persistence_service.get_latest_board_state(db, session.id, "chess")
    if not state:
        raise HTTPException(status_code=409, detail="No board state found")

    move_dict = {
        "fromRow": request.fromRow,
        "fromCol": request.fromCol,
        "toRow": request.toRow,
        "toCol": request.toCol,
        "promotionPiece": request.promotionPiece,
    }

    if not _chess_engine.validate_move(state, move_dict):
        logger.warning("chess_invalid_move", extra={"session_id": str(session.id), "move": move_dict})
        raise HTTPException(status_code=422, detail="Invalid move")

    q = _chess_move_queues.get(session.id)
    if q:
        await q.put(move_dict)

    return JSONResponse(status_code=202, content=None)


@router.get("/game/chess/events/{session_id}")
async def chess_events(
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
    span.set_attribute("game.id", "chess")
    span.set_attribute("game.session_id", session_id)

    q: asyncio.Queue = asyncio.Queue()
    _chess_move_queues[sid] = q

    broadcaster = StatusBroadcaster()

    async def process_moves():
        try:
            state = await persistence_service.get_latest_board_state(db, sid, "chess")
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
                await persistence_service.record_move(
                    db, sid, "chess", "human", msg, player_state
                )

                is_terminal, outcome = _chess_engine.is_terminal(player_state)
                if is_terminal:
                    await persistence_service.end_game_session(
                        db, sid, outcome or "draw", "chess"
                    )
                    broadcaster.emit(StatusEvent("move", payload=_chess_state_payload(player_state, "player")))
                    broadcaster.close()
                    return

                broadcaster.emit(StatusEvent("status", message="Thinking..."))

                with tracer.start_as_current_span("game.ai.move") as ai_span:
                    ai_span.set_attribute("game.id", "chess")
                    ai_span.set_attribute("game.session_id", session_id)
                    t0 = time.monotonic()
                    ai_state, engine_eval = _chess_processor.process_ai_turn(
                        _chess_engine, _chess_strategy, player_state
                    )
                    compute_ms = (time.monotonic() - t0) * 1000
                    ai_span.set_attribute("compute_duration_ms", compute_ms)

                await persistence_service.record_move(
                    db, sid, "chess", "ai", ai_state.get("last_move"), ai_state, engine_eval
                )

                is_terminal, outcome = _chess_engine.is_terminal(ai_state)
                if is_terminal:
                    await persistence_service.end_game_session(
                        db, sid, outcome or "draw", "chess"
                    )

                broadcaster.emit(StatusEvent("move", payload=_chess_state_payload(ai_state, "ai")))
                state = ai_state

                if is_terminal:
                    broadcaster.close()
                    return

        except Exception as exc:
            logger.exception("chess_sse_error", extra={"session_id": session_id})
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR)
            broadcaster.emit(StatusEvent("error", code="internal_error", message="An error occurred"))
            broadcaster.close()
        finally:
            _chess_move_queues.pop(sid, None)
            logger.info("chess_sse_closed", extra={"session_id": session_id})

    asyncio.create_task(process_moves())

    return StreamingResponse(
        broadcaster.stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/game/chess/legal-moves")
async def chess_legal_moves(
    from_row: int = Query(...),
    from_col: int = Query(...),
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "chess")

    session = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "chess"
    )
    if not session:
        raise HTTPException(status_code=409, detail="No active session")

    state = await persistence_service.get_latest_board_state(db, session.id, "chess")
    if not state:
        raise HTTPException(status_code=409, detail="No board state found")

    moves = _chess_engine.get_legal_moves_for_square(state, from_row, from_col)
    return {"moves": moves}
