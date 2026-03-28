# This file is a template for integration into games.py.
# It is never imported directly by the app.
#
# === Add to imports in games.py ===
# from game_engine.connect4_engine import Connect4Engine, Connect4AIStrategy
#
# === Add to models.py ===
# class C4NewGameRequest(BaseModel):
#     player_starts: bool = True
#
# class C4MoveRequest(BaseModel):
#     col: int
#
# === Add to imports from models in games.py ===
# C4MoveRequest, C4NewGameRequest

import asyncio
import time
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from opentelemetry import trace
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

import persistence_service
from db import db_dependency
from game_engine.base import MoveProcessor, StatusBroadcaster, StatusEvent
from game_engine.connect4_engine import Connect4AIStrategy, Connect4Engine

router = APIRouter()

_c4_engine = Connect4Engine()
_c4_strategy = Connect4AIStrategy()
_c4_processor = MoveProcessor()
_c4_move_queues: dict[UUID, asyncio.Queue] = {}

tracer = trace.get_tracer(__name__)


class C4NewGameRequest(BaseModel):
    player_starts: bool = True


class C4MoveRequest(BaseModel):
    col: int


def _c4_winner(state: dict) -> Optional[str]:
    if state.get("game_active", True):
        return None
    last_move = state.get("last_move")
    if not last_move:
        return "draw"
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
    span = trace.get_current_span()
    span.set_attribute("game.id", "connect4")

    session = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "connect4"
    )
    if not session:
        return {"session_id": None, "state": None}

    span.set_attribute("game.session_id", str(session.id))
    state = await persistence_service.get_latest_board_state(db, session.id, "connect4")
    return {"session_id": str(session.id), "state": state}


@router.post("/game/connect4/newgame")
async def c4_newgame(
    request: C4NewGameRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "connect4")

    existing = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "connect4"
    )
    if existing:
        q = _c4_move_queues.pop(existing.id, None)
        if q:
            q.put_nowait({"__close__": True})
        await persistence_service.close_session(db, existing.id)

    session = await persistence_service.create_game_session(db, user["id"], "connect4")
    span.set_attribute("game.session_id", str(session.id))

    state = _c4_engine.initial_state(request.player_starts)

    if not request.player_starts:
        ai_state, engine_eval = _c4_processor.process_ai_turn(
            _c4_engine, _c4_strategy, state
        )
        is_terminal, outcome = _c4_engine.is_terminal(ai_state)
        ai_state = {**ai_state, "game_active": not is_terminal}
        await persistence_service.record_move(
            db, session.id, "connect4", "ai", ai_state.get("last_move"), ai_state, engine_eval
        )
        state = ai_state
    else:
        await persistence_service.record_move(
            db, session.id, "connect4", "setup", None, state
        )

    return {"session_id": str(session.id), "state": state}


@router.post("/game/connect4/move")
async def c4_move(
    request: C4MoveRequest,
    user: dict = Depends(_require_user),
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "connect4")

    if not isinstance(request.col, int) or not (0 <= request.col <= 6):
        raise HTTPException(status_code=422, detail="Invalid column")

    session = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "connect4"
    )
    if not session:
        raise HTTPException(status_code=409, detail="No active session")

    span.set_attribute("game.session_id", str(session.id))

    state = await persistence_service.get_latest_board_state(db, session.id, "connect4")
    if not state:
        raise HTTPException(status_code=409, detail="No board state found")

    move = {"col": request.col}
    if not _c4_engine.validate_move(state, move):
        logger.warning("c4_invalid_move", extra={"session_id": str(session.id), "move": move})
        raise HTTPException(status_code=422, detail="Invalid move")

    q = _c4_move_queues.get(session.id)
    if q:
        await q.put({"col": request.col})

    return JSONResponse(status_code=202, content=None)


@router.get("/game/connect4/events/{session_id}")
async def c4_events(
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
    span.set_attribute("game.id", "connect4")
    span.set_attribute("game.session_id", session_id)

    q: asyncio.Queue = asyncio.Queue()
    _c4_move_queues[sid] = q

    broadcaster = StatusBroadcaster()

    async def process_moves():
        try:
            state = await persistence_service.get_latest_board_state(db, sid, "connect4")
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
                    db, sid, "connect4", "human", player_last, player_state
                )

                if is_terminal:
                    persistence_outcome = _c4_engine.outcome_to_persistence(player_state) or "draw"
                    await persistence_service.end_game_session(
                        db, sid, persistence_outcome, "connect4"
                    )
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
                    ai_span.set_attribute("game.id", "connect4")
                    ai_span.set_attribute("game.session_id", session_id)
                    t0 = time.monotonic()
                    ai_state, engine_eval = _c4_processor.process_ai_turn(
                        _c4_engine, _c4_strategy, player_state
                    )
                    compute_ms = (time.monotonic() - t0) * 1000
                    ai_span.set_attribute("compute_duration_ms", compute_ms)

                ai_last = ai_state.get("last_move", {})
                ai_col = ai_last.get("col") if ai_last else None
                ai_row = ai_last.get("row") if ai_last else None

                is_terminal, outcome = _c4_engine.is_terminal(ai_state)
                ai_state = {**ai_state, "game_active": not is_terminal}

                await persistence_service.record_move(
                    db, sid, "connect4", "ai", ai_last, ai_state, engine_eval
                )

                if is_terminal:
                    persistence_outcome = _c4_engine.outcome_to_persistence(ai_state) or "draw"
                    await persistence_service.end_game_session(
                        db, sid, persistence_outcome, "connect4"
                    )

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
            logger.exception("c4_sse_error", extra={"session_id": session_id})
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR)
            broadcaster.emit(StatusEvent("error", code="internal_error", message="An error occurred"))
            broadcaster.close()
        finally:
            _c4_move_queues.pop(sid, None)
            logger.info("c4_sse_closed", extra={"session_id": session_id})

    asyncio.create_task(process_moves())

    return StreamingResponse(
        broadcaster.stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
